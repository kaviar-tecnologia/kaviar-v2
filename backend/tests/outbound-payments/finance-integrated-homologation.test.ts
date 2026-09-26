/**
 * Integrated finance safety contract, no external calls and no payment POSTs.
 * SumUp wallet money and Asaas provider cash are different financial objects.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import type { OutboundPaymentProvider } from '../../src/services/finance/outbound-payments/types';
import { calculateTreasuryHealth } from '../../src/services/finance/outbound-payments/treasury';
import { processOutboundBatch } from '../../src/services/finance/outbound-payments/worker';

const originalEnv = { ...process.env };
const expectedCnpj = '67783601000199';

function fixture() {
  // A confirmed SumUp recharge and wallet liability can be present without
  // any money available to the separate Asaas account.
  const sumupConfirmedRechargeCents = 500_000n;
  const driverWalletLiabilityCents = 490_000n;
  const queries: string[] = [];
  const statusBatches: string[][] = [];
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      queries.push(sql);
      if (sql.includes('SUM(net_amount_cents)') && sql.includes('ANY($1)')) {
        const statuses = params[0] as string[];
        statusBatches.push(statuses);
        if (statuses.includes('APPROVED')) return { rows: [{ total: '1000' }] };
        if (statuses.includes('RESERVED')) return { rows: [{ total: '2000' }] };
        if (statuses.includes('SUBMITTING')) return { rows: [{ total: '3000' }] };
        if (statuses.includes('BLOCKED')) return { rows: [{ total: '4000' }] };
      }
      if (sql.includes('due_date')) return { rows: [{ total: '6000' }] };
      throw new Error('Unexpected treasury database query');
    }),
    connect: vi.fn(() => { throw new Error('Outbound worker must not run'); }),
  } as unknown as Pool;
  const getAvailableBalance = vi.fn(async () => ({ amountCents: 0n, currency: 'BRL' as const }));
  const validateAvailability = vi.fn(async () => ({ available: true }));
  const getAccountStatus = vi.fn(async () => ({
    personType: 'JURIDICA', cpfCnpj: expectedCnpj,
    generalStatus: 'APPROVED', transfersEnabled: true,
  }));
  const createTransfer = vi.fn(() => { throw new Error('No payment POST allowed'); });
  const createBillPayment = vi.fn(() => { throw new Error('No bill POST allowed'); });
  const provider = {
    providerName: 'asaas', getAvailableBalance, validateAvailability,
    getAccountStatus, createTransfer, createBillPayment,
  } as unknown as OutboundPaymentProvider;
  return { db, provider, queries, statusBatches, getAvailableBalance, validateAvailability,
    getAccountStatus, createTransfer, createBillPayment,
    sumupConfirmedRechargeCents, driverWalletLiabilityCents };
}

describe('Integrated SumUp / KAVIAR / Asaas homologation safety', () => {
  beforeEach(() => {
    delete process.env.OUTBOUND_PAYMENTS_ENABLED;
    delete process.env.ASAAS_PAYOUT_ACCOUNT_OWNERSHIP_CONFIRMED;
    delete process.env.ASAAS_ACCOUNT_EXPECTED_CNPJ;
    delete process.env.ASAAS_PAYOUT_TRANSFER_CAPABILITY_CONFIRMED;
  });
  afterEach(() => { process.env = { ...originalEnv }; });

  it('does not count a confirmed SumUp recharge or wallet liability as Asaas cash', async () => {
    const f = fixture();
    expect(f.sumupConfirmedRechargeCents).toBeGreaterThan(0n);
    expect(f.driverWalletLiabilityCents).toBeGreaterThan(0n);
    const h = await calculateTreasuryHealth(f.db, f.provider);
    expect(h.providerBalanceCents).toBe(0n); // authentic zero, not a fallback
    expect(h.approvedObligationsCents).toBe(1000n);
    expect(h.reservedObligationsCents).toBe(2000n);
    expect(h.inTransitCents).toBe(3000n);
    expect(h.blockedObligationsCents).toBe(4000n);
    expect(f.statusBatches).toContainEqual(['SUBMITTING', 'SUBMITTED', 'PROCESSING']);
    expect(f.statusBatches).toContainEqual(['BLOCKED', 'BLOCKED_POLICY_REVIEW']);
    expect(f.statusBatches).toContainEqual(['RESERVED', 'QUEUED', 'RETRYABLE_FAILURE']);
    expect(h.deficitCents).toBe(10000n);
    expect(h.bufferCents).toBe(0n);
    expect(f.queries.every(q => !/wallet_recharges|driver_wallets|wallet_ledger/i.test(q))).toBe(true);
    expect(f.createTransfer).not.toHaveBeenCalled();
  });

  it('does not represent a failed Asaas balance query as R$ 0,00 or a calculable deficit', async () => {
    const f = fixture();
    f.getAvailableBalance.mockRejectedValueOnce(new Error('unreachable'));
    const h = await calculateTreasuryHealth(f.db, f.provider);
    expect(h.providerBalanceCents).toBeNull();
    expect(h.bufferCents).toBeNull();
    expect(h.deficitCents).toBeNull();
    expect(h.providerAvailable).toBe(false);
    expect(h.approvedObligationsCents).toBe(1000n);
  });

  it('does not show a stale balance when provider health check fails', async () => {
    const f = fixture();
    f.validateAvailability.mockResolvedValueOnce({ available: false });
    const h = await calculateTreasuryHealth(f.db, f.provider);
    expect(h.providerBalanceCents).toBeNull();
    expect(h.providerAvailable).toBe(false);
  });

  it('manual ownership flag alone does not approve the account', async () => {
    const f = fixture();
    process.env.ASAAS_PAYOUT_ACCOUNT_OWNERSHIP_CONFIRMED = 'true';
    process.env.ASAAS_ACCOUNT_EXPECTED_CNPJ = expectedCnpj;
    f.getAccountStatus.mockResolvedValueOnce({
      personType: 'JURIDICA', cpfCnpj: '00000000000000',
      generalStatus: 'APPROVED', transfersEnabled: true,
    });
    const h = await calculateTreasuryHealth(f.db, f.provider);
    expect(h.accountOwnershipConfirmed).toBe(false);
  });

  it('requires manual signoff plus matching authenticated account status', async () => {
    const f = fixture();
    process.env.ASAAS_PAYOUT_ACCOUNT_OWNERSHIP_CONFIRMED = 'true';
    process.env.ASAAS_ACCOUNT_EXPECTED_CNPJ = expectedCnpj;
    const h = await calculateTreasuryHealth(f.db, f.provider);
    expect(h.accountOwnershipConfirmed).toBe(true);
    expect(f.getAccountStatus).toHaveBeenCalledOnce();
  });

  it('does not start outgoing transfers with all outbound flags disabled', async () => {
    const f = fixture();
    const processed = await processOutboundBatch({ pool: f.db, provider: f.provider });
    expect(processed).toBe(0);
    expect(f.db.connect).not.toHaveBeenCalled();
    expect(f.createTransfer).not.toHaveBeenCalled();
    expect(f.createBillPayment).not.toHaveBeenCalled();
  });
});
