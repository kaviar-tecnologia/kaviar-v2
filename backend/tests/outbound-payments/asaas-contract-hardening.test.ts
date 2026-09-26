import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AsaasOutboundPaymentProvider } from '../../src/services/finance/outbound-payments/providers';

describe('Asaas native transfer/bill webhook contract', () => {
  const provider = new AsaasOutboundPaymentProvider();

  it('normalizes TRANSFER_DONE and retains only allowlisted financial metadata', () => {
    const normalized = provider.normalizeWebhook({
      id: 'evt-transfer-1', event: 'TRANSFER_DONE',
      transfer: {
        id: 'tr-1', status: 'DONE', value: 45.67,
        externalReference: 'kaviar-payment:test:obl-1',
        bankAccount: { cpfCnpj: 'sensitive', pixAddressKey: 'sensitive' },
        pixAddressKey: 'sensitive',
      },
    });
    expect(normalized).toMatchObject({
      providerEventId: 'evt-transfer-1', providerPayoutId: 'tr-1',
      eventCategory: 'TRANSFER', eventType: 'DONE', amountCents: 4567n,
      externalReference: 'kaviar-payment:test:obl-1',
    });
    const saved = JSON.stringify(normalized.raw);
    expect(saved).not.toContain('sensitive');
    expect(saved).not.toContain('bankAccount');
  });

  it.each([
    ['TRANSFER_PENDING', 'TRANSFER', 'PENDING'],
    ['TRANSFER_IN_BANK_PROCESSING', 'TRANSFER', 'PROCESSING'],
    ['TRANSFER_FAILED', 'TRANSFER', 'FAILED'],
    ['TRANSFER_CANCELLED', 'TRANSFER', 'CANCELLED'],
    ['BILL_PAID', 'BILL_PAYMENT', 'DONE'],
    ['BILL_BANK_PROCESSING', 'BILL_PAYMENT', 'PROCESSING'],
    ['BILL_FAILED', 'BILL_PAYMENT', 'FAILED'],
    ['BILL_REFUNDED', 'BILL_PAYMENT', 'UNKNOWN'],
  ])('maps %s without relying on status alone', (event, category, type) => {
    const obj = category === 'TRANSFER'
      ? { transfer: { id: 'tr-1', status: 'PENDING', value: 10 } }
      : { bill: { id: 'bill-1', status: 'PENDING', value: 10 } };
    const result = provider.normalizeWebhook({ id: 'evt-2', event, ...obj });
    expect(result.eventCategory).toBe(category);
    expect(result.eventType).toBe(type);
  });

  it('rejects absent event id and missing payout', () => {
    expect(() => provider.normalizeWebhook({ event: 'TRANSFER_DONE', transfer: { id: 'tr-1' } })).toThrow();
    expect(() => provider.normalizeWebhook({ id: 'evt-1', event: 'TRANSFER_DONE', transfer: {} })).toThrow();
    expect(() => provider.normalizeWebhook({ id: 'evt-1', event: 'TRANSFER_DONE', transfer: { id: 'tr-1', value: 10.001 } })).toThrow();
  });
});

describe('Asaas authenticated lookups are fail-closed', () => {
  const originalEnv = { ...process.env };
  const fetchMock = vi.fn();

  beforeEach(() => {
    process.env.ASAAS_API_KEY = 'test-secret';
    process.env.ASAAS_BASE_URL = 'https://api-sandbox.asaas.com';
    delete process.env.ASAAS_PAYOUT_TRANSFER_CAPABILITY_CONFIRMED;
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.unstubAllGlobals();
  });

  const response = (data: unknown) => ({ ok: true, json: async () => data });

  it('requires explicit transfer capability even after both account GETs', async () => {
    fetchMock.mockResolvedValueOnce(response({ personType: 'JURIDICA', cpfCnpj: '67783601000199' }));
    fetchMock.mockResolvedValueOnce(response({ general: 'APPROVED' }));
    const provider = new AsaasOutboundPaymentProvider();
    expect(await provider.getAccountStatus()).toEqual({
      personType: 'JURIDICA', cpfCnpj: '67783601000199',
      generalStatus: 'APPROVED', transfersEnabled: false,
    });
    expect(fetchMock.mock.calls.map(c => c[0])).toEqual([
      'https://api-sandbox.asaas.com/v3/myAccount/commercialInfo',
      'https://api-sandbox.asaas.com/v3/myAccount/status',
    ]);
  });

  it('returns null when account status endpoint is unavailable', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network unavailable'));
    fetchMock.mockResolvedValueOnce(response({ general: 'APPROVED' }));
    expect(await new AsaasOutboundPaymentProvider().getAccountStatus()).toBeNull();
  });

  it('does not accept first transfer if externalReference does not match', async () => {
    fetchMock.mockResolvedValueOnce(response({
      data: [{ id: 'wrong-transfer', status: 'DONE', value: 10, externalReference: 'someone-else' }],
    }));
    expect(await new AsaasOutboundPaymentProvider().findTransferByExternalReference('ours')).toBeNull();
  });

  it('reports bill POST timeout as ambiguous submission', async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    const result = await new AsaasOutboundPaymentProvider().createBillPayment({
      obligationId: 'obl-1', identificationField: '01234567890123456789012345678901234567890123',
      externalReference: 'ref-1',
    });
    expect(result.isTimeout).toBe(true);
    expect(result.isDefinitiveFailure).toBeUndefined();
  });
  it('paginates documented date-filtered transfer listing and matches exact reference', async () => {
    fetchMock.mockResolvedValueOnce(response({
      data: [{ id: 'not-ours', status: 'DONE', value: 10, externalReference: 'someone-else' }],
      hasMore: true,
    }));
    fetchMock.mockResolvedValueOnce(response({
      data: [{ id: 'ours-1', status: 'PENDING', value: 20, externalReference: 'ours' }],
      hasMore: false,
    }));
    const result = await new AsaasOutboundPaymentProvider()
      .findTransferByExternalReference('ours', new Date('2026-09-25T12:00:00Z'));
    expect(result?.providerTransferId).toBe('ours-1');
    expect(result?.amountCents).toBe(2000n);
    const urls = fetchMock.mock.calls.map(c => new URL(c[0]));
    expect(urls).toHaveLength(2);
    expect(urls[0].pathname).toBe('/v3/transfers');
    expect(urls[0].searchParams.has('externalReference')).toBe(false);
    expect(urls[0].searchParams.get('dateCreated[ge]')).toBe('2026-09-24');
    expect(urls[0].searchParams.get('limit')).toBe('100');
    expect(urls[1].searchParams.get('offset')).toBe('100');
  });

  it('does not return a payout when two transfers have same reference', async () => {
    fetchMock.mockResolvedValueOnce(response({
      data: [
        { id: 'first', status: 'DONE', value: 20, externalReference: 'ours' },
        { id: 'second', status: 'DONE', value: 20, externalReference: 'ours' },
      ],
      hasMore: false,
    }));
    const result = await new AsaasOutboundPaymentProvider().findTransferByExternalReference('ours');
    expect(result).toBeNull();
  });

  it('fails closed if transfer search is incomplete', async () => {
    fetchMock.mockResolvedValue(response({
      data: [{ id: 'ours', status: 'DONE', value: 20, externalReference: 'ours' }],
      hasMore: true,
    }));
    const result = await new AsaasOutboundPaymentProvider().findTransferByExternalReference('ours');
    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('production requires explicitly configured Asaas API origin', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ASAAS_BASE_URL;
    const result = await new AsaasOutboundPaymentProvider().getAccountStatus();
    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

});
