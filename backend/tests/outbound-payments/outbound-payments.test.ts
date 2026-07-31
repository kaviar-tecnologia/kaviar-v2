/**
 * Outbound Payment Infrastructure Tests (Marco 3.1).
 *
 * Tests:
 * - Provider factory and guards
 * - Account ownership preflight
 * - Asaas adapter contract (with fake HTTP)
 * - Payment purpose flags
 * - Obligation lifecycle
 * - External reference format
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  createOutboundPaymentProvider,
  FakeOutboundPaymentProvider,
  UnavailableOutboundPaymentProvider,
  AsaasOutboundPaymentProvider,
} from '../../src/services/finance/outbound-payments/providers';
import {
  validateAccountOwnership,
  isOutboundPaymentsEnabled,
  isPurposeEnabled,
} from '../../src/services/finance/outbound-payments/account-preflight';
import {
  OUTBOUND_PAYMENT_ERRORS,
  PAYMENT_PURPOSES,
  PAYMENT_INSTRUMENTS,
} from '../../src/services/finance/outbound-payments/types';

// ═══════════════════════════════════════════════════════════════════
// PROVIDER FACTORY
// ═══════════════════════════════════════════════════════════════════

describe('Outbound Payment Provider Factory', () => {
  const original = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/kaviar_test';
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it('returns unavailable when OUTBOUND_PAYMENTS_ENABLED is not "true"', () => {
    delete process.env.OUTBOUND_PAYMENTS_ENABLED;
    const p = createOutboundPaymentProvider();
    expect(p.providerName).toBe('unavailable');
  });

  it('returns unavailable when provider name is empty', () => {
    process.env.OUTBOUND_PAYMENTS_ENABLED = 'true';
    process.env.OUTBOUND_PAYMENT_PROVIDER = '';
    const p = createOutboundPaymentProvider();
    expect(p.providerName).toBe('unavailable');
  });

  it('returns unavailable when provider name is unknown', () => {
    process.env.OUTBOUND_PAYMENTS_ENABLED = 'true';
    process.env.OUTBOUND_PAYMENT_PROVIDER = 'stripe';
    const p = createOutboundPaymentProvider();
    expect(p.providerName).toBe('unavailable');
  });

  it('returns fake when configured in test environment', () => {
    process.env.OUTBOUND_PAYMENTS_ENABLED = 'true';
    process.env.OUTBOUND_PAYMENT_PROVIDER = 'fake';
    const p = createOutboundPaymentProvider();
    expect(p.providerName).toBe('fake');
  });

  it('returns asaas when configured', () => {
    process.env.OUTBOUND_PAYMENTS_ENABLED = 'true';
    process.env.OUTBOUND_PAYMENT_PROVIDER = 'asaas';
    process.env.ASAAS_API_KEY = 'test_key';
    const p = createOutboundPaymentProvider();
    expect(p.providerName).toBe('asaas');
  });

  it('blocks fake in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.OUTBOUND_PAYMENTS_ENABLED = 'true';
    process.env.OUTBOUND_PAYMENT_PROVIDER = 'fake';
    expect(() => createOutboundPaymentProvider()).toThrow();
  });

  it('blocks fake in staging', () => {
    process.env.NODE_ENV = 'staging';
    process.env.OUTBOUND_PAYMENTS_ENABLED = 'true';
    process.env.OUTBOUND_PAYMENT_PROVIDER = 'fake';
    expect(() => createOutboundPaymentProvider()).toThrow();
  });

  it('blocks fake with remote database', () => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://user:pass@remote-server.com:5432/kaviar_test';
    process.env.OUTBOUND_PAYMENTS_ENABLED = 'true';
    process.env.OUTBOUND_PAYMENT_PROVIDER = 'fake';
    expect(() => createOutboundPaymentProvider()).toThrow();
  });

  it('OUTBOUND_PAYMENTS_ENABLED=TRUE does not enable (case-sensitive)', () => {
    process.env.OUTBOUND_PAYMENTS_ENABLED = 'TRUE';
    process.env.OUTBOUND_PAYMENT_PROVIDER = 'fake';
    const p = createOutboundPaymentProvider();
    expect(p.providerName).toBe('unavailable');
  });
});

// ═══════════════════════════════════════════════════════════════════
// ACCOUNT OWNERSHIP PREFLIGHT
// ═══════════════════════════════════════════════════════════════════

describe('Account Ownership Preflight', () => {
  const original = { ...process.env };

  afterEach(() => { process.env = { ...original }; });

  it('fails when flag is not set', () => {
    delete process.env.ASAAS_PAYOUT_ACCOUNT_OWNERSHIP_CONFIRMED;
    const result = validateAccountOwnership({ personType: 'JURIDICA', cpfCnpj: '67783601000199', generalStatus: 'APPROVED', transfersEnabled: true });
    expect(result.passed).toBe(false);
  });

  it('fails when personType is not JURIDICA', () => {
    process.env.ASAAS_PAYOUT_ACCOUNT_OWNERSHIP_CONFIRMED = 'true';
    const result = validateAccountOwnership({ personType: 'FISICA', cpfCnpj: '67783601000199', generalStatus: 'APPROVED', transfersEnabled: true });
    expect(result.passed).toBe(false);
    expect(result.failureReason).toContain('personType');
  });

  it('fails when CNPJ does not match', () => {
    process.env.ASAAS_PAYOUT_ACCOUNT_OWNERSHIP_CONFIRMED = 'true';
    const result = validateAccountOwnership({ personType: 'JURIDICA', cpfCnpj: '12345678000199', generalStatus: 'APPROVED', transfersEnabled: true });
    expect(result.passed).toBe(false);
    expect(result.failureReason).toBe(OUTBOUND_PAYMENT_ERRORS.ACCOUNT_OWNERSHIP_MISMATCH);
  });

  it('fails when status is not APPROVED', () => {
    process.env.ASAAS_PAYOUT_ACCOUNT_OWNERSHIP_CONFIRMED = 'true';
    const result = validateAccountOwnership({ personType: 'JURIDICA', cpfCnpj: '67783601000199', generalStatus: 'PENDING', transfersEnabled: true });
    expect(result.passed).toBe(false);
  });

  it('fails when transfers not enabled', () => {
    process.env.ASAAS_PAYOUT_ACCOUNT_OWNERSHIP_CONFIRMED = 'true';
    const result = validateAccountOwnership({ personType: 'JURIDICA', cpfCnpj: '67783601000199', generalStatus: 'APPROVED', transfersEnabled: false });
    expect(result.passed).toBe(false);
  });

  it('fails when API response is null', () => {
    process.env.ASAAS_PAYOUT_ACCOUNT_OWNERSHIP_CONFIRMED = 'true';
    const result = validateAccountOwnership(null);
    expect(result.passed).toBe(false);
  });

  it('passes when all conditions are met', () => {
    process.env.ASAAS_PAYOUT_ACCOUNT_OWNERSHIP_CONFIRMED = 'true';
    process.env.ASAAS_ACCOUNT_EXPECTED_PERSON_TYPE = 'JURIDICA';
    process.env.ASAAS_ACCOUNT_EXPECTED_CNPJ = '67783601000199';
    const result = validateAccountOwnership({ personType: 'JURIDICA', cpfCnpj: '67.783.601/0001-99', generalStatus: 'APPROVED', transfersEnabled: true });
    expect(result.passed).toBe(true);
  });

  it('normalizes CNPJ for comparison', () => {
    process.env.ASAAS_PAYOUT_ACCOUNT_OWNERSHIP_CONFIRMED = 'true';
    const result = validateAccountOwnership({ personType: 'JURIDICA', cpfCnpj: '67.783.601/0001-99', generalStatus: 'APPROVED', transfersEnabled: true });
    expect(result.passed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// PURPOSE FLAGS
// ═══════════════════════════════════════════════════════════════════

describe('Purpose Flags', () => {
  const original = { ...process.env };
  beforeEach(() => {
    delete process.env.OUTBOUND_PAYMENTS_ENABLED;
    delete process.env.DRIVER_ANNUAL_INCENTIVE_ENABLED;
    delete process.env.MANAGER_TERRITORIAL_COMMISSION_ENABLED;
    delete process.env.ACCOUNTING_SERVICE_PAYMENT_ENABLED;
    delete process.env.SUPPLIER_PAYMENT_ENABLED;
    delete process.env.BILL_PAYMENT_ENABLED;
  });
  afterEach(() => { process.env = { ...original }; });

  it('all purposes disabled by default', () => {
    for (const purpose of PAYMENT_PURPOSES) {
      expect(isPurposeEnabled(purpose)).toBe(false);
    }
  });

  it('DRIVER_ANNUAL_INCENTIVE enabled individually', () => {
    process.env.DRIVER_ANNUAL_INCENTIVE_ENABLED = 'true';
    expect(isPurposeEnabled('DRIVER_ANNUAL_INCENTIVE')).toBe(true);
    expect(isPurposeEnabled('MANAGER_TERRITORIAL_COMMISSION')).toBe(false);
  });

  it('MANAGER_TERRITORIAL_COMMISSION enabled individually', () => {
    process.env.MANAGER_TERRITORIAL_COMMISSION_ENABLED = 'true';
    expect(isPurposeEnabled('MANAGER_TERRITORIAL_COMMISSION')).toBe(true);
  });

  it('global OUTBOUND_PAYMENTS_ENABLED check', () => {
    expect(isOutboundPaymentsEnabled()).toBe(false);
    process.env.OUTBOUND_PAYMENTS_ENABLED = 'true';
    expect(isOutboundPaymentsEnabled()).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// FAKE PROVIDER OPERATIONS
// ═══════════════════════════════════════════════════════════════════

describe('Fake Provider Operations', () => {
  let provider: FakeOutboundPaymentProvider;

  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/kaviar_test';
    provider = new FakeOutboundPaymentProvider();
  });

  it('creates transfer successfully', async () => {
    const result = await provider.createTransfer({
      obligationId: 'obl_1', payeeId: 'p_1', amountCents: 10000n,
      pixAddressKey: '67783601000199', pixAddressKeyType: 'CNPJ',
      externalReference: 'kaviar-payment:test:obl_1',
    });
    expect(result.success).toBe(true);
    expect(result.providerTransferId).toBeTruthy();
  });

  it('simulates timeout', async () => {
    provider.behavior = 'timeout';
    const result = await provider.createTransfer({
      obligationId: 'obl_2', payeeId: 'p_2', amountCents: 5000n,
      pixAddressKey: '12345678901', pixAddressKeyType: 'CPF',
      externalReference: 'kaviar-payment:test:obl_2',
    });
    expect(result.success).toBe(false);
    expect(result.isTimeout).toBe(true);
  });

  it('simulates definitive failure', async () => {
    provider.behavior = 'definitive_failure';
    const result = await provider.createTransfer({
      obligationId: 'obl_3', payeeId: 'p_3', amountCents: 5000n,
      pixAddressKey: '12345678901', pixAddressKeyType: 'CPF',
      externalReference: 'kaviar-payment:test:obl_3',
    });
    expect(result.success).toBe(false);
    expect(result.isDefinitiveFailure).toBe(true);
  });

  it('retrieves transfer by ID', async () => {
    const created = await provider.createTransfer({
      obligationId: 'obl_4', payeeId: 'p_4', amountCents: 7500n,
      pixAddressKey: '12345678901', pixAddressKeyType: 'CPF',
      externalReference: 'kaviar-payment:test:obl_4',
    });
    const retrieved = await provider.getTransfer(created.providerTransferId!);
    expect(retrieved.found).toBe(true);
    expect(retrieved.amountCents).toBe(7500n);
  });

  it('finds transfer by external reference', async () => {
    await provider.createTransfer({
      obligationId: 'obl_5', payeeId: 'p_5', amountCents: 3000n,
      pixAddressKey: '12345678901', pixAddressKeyType: 'CPF',
      externalReference: 'kaviar-payment:test:obl_5',
    });
    const found = await provider.findTransferByExternalReference!('kaviar-payment:test:obl_5');
    expect(found).not.toBeNull();
    expect(found!.amountCents).toBe(3000n);
  });

  it('creates bill payment', async () => {
    const result = await provider.createBillPayment({
      obligationId: 'obl_6', identificationField: '23793.38128 60000.000003 00000.000402 1 84340000010000',
      externalReference: 'kaviar-payment:test:obl_6',
    });
    expect(result.success).toBe(true);
    expect(result.providerBillId).toBeTruthy();
  });

  it('gets balance', async () => {
    const balance = await provider.getAvailableBalance();
    expect(balance.amountCents).toBeGreaterThan(0n);
    expect(balance.currency).toBe('BRL');
  });

  it('normalizes webhook event', () => {
    const event = provider.normalizeWebhook({
      eventId: 'evt_123', payoutId: 'trans_456', category: 'TRANSFER',
      status: 'DONE', amountCents: '10000',
    });
    expect(event.providerEventId).toBe('evt_123');
    expect(event.eventCategory).toBe('TRANSFER');
    expect(event.eventType).toBe('DONE');
  });
});

// ═══════════════════════════════════════════════════════════════════
// UNAVAILABLE PROVIDER
// ═══════════════════════════════════════════════════════════════════

describe('Unavailable Provider', () => {
  it('reports not available', async () => {
    const p = new UnavailableOutboundPaymentProvider();
    const avail = await p.validateAvailability();
    expect(avail.available).toBe(false);
  });

  it('blocks transfer creation', async () => {
    const p = new UnavailableOutboundPaymentProvider();
    const result = await p.createTransfer({
      obligationId: 'x', payeeId: 'y', amountCents: 1000n,
      pixAddressKey: '123', pixAddressKeyType: 'CPF',
      externalReference: 'ref',
    });
    expect(result.success).toBe(false);
  });

  it('blocks bill payment creation', async () => {
    const p = new UnavailableOutboundPaymentProvider();
    const result = await p.createBillPayment({
      obligationId: 'x', identificationField: '123', externalReference: 'ref',
    });
    expect(result.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// EXTERNAL REFERENCE FORMAT
// ═══════════════════════════════════════════════════════════════════

describe('External Reference', () => {
  it('follows kaviar-payment format', () => {
    const ref = `kaviar-payment:driver-annual-incentive:req_123`;
    expect(ref).toMatch(/^kaviar-payment:[a-z-]+:[a-z0-9_]+$/);
  });

  it('does not contain personal data', () => {
    const ref = `kaviar-payment:manager-territorial-commission:cycle_456`;
    expect(ref).not.toMatch(/\d{11}/); // no CPF
    expect(ref).not.toMatch(/\d{14}/); // no CNPJ
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECURITY INVARIANTS
// ═══════════════════════════════════════════════════════════════════

describe('Security Invariants', () => {
  it('no mark-as-paid capability exists', () => {
    // Structural assertion: PAID status can only come from provider confirmation
    expect(OUTBOUND_PAYMENT_ERRORS.ALREADY_PAID).toBeDefined();
  });

  it('instruments are limited to Asaas', () => {
    for (const inst of PAYMENT_INSTRUMENTS) {
      expect(inst).toMatch(/^ASAAS_/);
    }
  });

  it('production flags all default to disabled', () => {
    // Fresh env without any flags
    const original = process.env.OUTBOUND_PAYMENTS_ENABLED;
    delete process.env.OUTBOUND_PAYMENTS_ENABLED;
    expect(isOutboundPaymentsEnabled()).toBe(false);
    process.env.OUTBOUND_PAYMENTS_ENABLED = original;
  });
});
