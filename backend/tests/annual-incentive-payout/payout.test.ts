/**
 * Annual Incentive Payout Tests (Marco 3).
 *
 * Tests cover:
 * - Balance projection and FIFO allocation
 * - Request window validation
 * - Destination management and encryption
 * - Request creation with atomic reservation
 * - Idempotency and concurrency
 * - Worker and provider interactions
 * - Webhook processing and PAYMENT creation
 * - Reconciliation
 * - Security guards
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { AnnualIncentiveLedgerService } from '../../src/services/finance/annual-incentive-ledger.service';
import { projectBalance, allocateFifo } from '../../src/services/finance/annual-incentive-payout/balance-projection';
import { isWithinRequestWindow, getWindowInfo } from '../../src/services/finance/annual-incentive-payout/request-window';
import {
  encryptPayoutSecret,
  decryptPayoutSecret,
  hmacPayoutValue,
  maskCpf,
  normalizeCpf,
  isValidCpf,
} from '../../src/services/finance/annual-incentive-payout/crypto';
import {
  FakeAnnualIncentivePayoutProvider,
  UnavailableAnnualIncentivePayoutProvider,
  createPayoutProvider,
} from '../../src/services/finance/annual-incentive-payout/providers';
import {
  createRequest,
  getRequestById,
  getOpenRequest,
  getRequestAllocations,
  transitionRequest,
} from '../../src/services/finance/annual-incentive-payout/request.service';
import {
  setDestination,
  getActiveDestination,
} from '../../src/services/finance/annual-incentive-payout/destination.service';
import { checkEligibility } from '../../src/services/finance/annual-incentive-payout/eligibility.service';
import { processOutboxBatch, WorkerDeps } from '../../src/services/finance/annual-incentive-payout/worker.service';
import { processWebhookEvent } from '../../src/services/finance/annual-incentive-payout/webhook.service';
import { runReconciliation } from '../../src/services/finance/annual-incentive-payout/reconciliation.service';
import { PAYOUT_ERRORS, VALID_TRANSITIONS } from '../../src/services/finance/annual-incentive-payout/types';

const TEST_DRIVER_ID = 'test-payout-driver-001';
const TEST_DRIVER_CPF = '52998224725'; // valid CPF

let pool: pg.Pool;
let ledgerService: AnnualIncentiveLedgerService;

beforeAll(async () => {
  assertSafeFinanceDatabase();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  ledgerService = new AnnualIncentiveLedgerService(pool);

  // Set up test encryption key
  process.env.ANNUAL_INCENTIVE_PAYOUT_ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.ANNUAL_INCENTIVE_PAYOUT_HASH_KEY = 'f'.repeat(64);
  process.env.ANNUAL_INCENTIVE_PAYOUT_KEY_VERSION = '1';

  // Create test driver
  await pool.query(`
    INSERT INTO drivers (id, name, email, phone, document_cpf, status, vehicle_type, created_at, updated_at)
    VALUES ($1, 'Test Payout Driver', 'test-payout-1@test.local', '21999990001', $2, 'active', 'car', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET document_cpf = $2
  `, [TEST_DRIVER_ID, TEST_DRIVER_CPF]);
});

afterAll(async () => {
  // Cleanup in reverse dependency order
  await pool.query('DELETE FROM annual_incentive_webhook_events');
  await pool.query('DELETE FROM annual_incentive_payout_attempts');
  await pool.query('DELETE FROM annual_incentive_payout_outbox WHERE driver_id = $1', [TEST_DRIVER_ID]);
  await pool.query('DELETE FROM annual_incentive_payouts WHERE driver_id = $1', [TEST_DRIVER_ID]);
  await pool.query('DELETE FROM annual_incentive_request_allocations WHERE request_id IN (SELECT id FROM annual_incentive_requests WHERE driver_id = $1)', [TEST_DRIVER_ID]);
  await pool.query('DELETE FROM annual_incentive_requests WHERE driver_id = $1', [TEST_DRIVER_ID]);
  await pool.query('DELETE FROM driver_payout_destinations WHERE driver_id = $1', [TEST_DRIVER_ID]);

  // Clean ledger (requires disabling trigger)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE annual_incentive_ledger IN ACCESS EXCLUSIVE MODE');
    await client.query('ALTER TABLE annual_incentive_ledger DISABLE TRIGGER annual_incentive_ledger_immutable_trg');
    await client.query('DELETE FROM annual_incentive_ledger WHERE driver_id = $1', [TEST_DRIVER_ID]);
    await client.query('ALTER TABLE annual_incentive_ledger ENABLE TRIGGER annual_incentive_ledger_immutable_trg');
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }

  await pool.query('DELETE FROM drivers WHERE id = $1', [TEST_DRIVER_ID]);
  await pool.end();
});

beforeEach(async () => {
  process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
  process.env.ANNUAL_INCENTIVE_PAYOUT_ENABLED = 'true';
  process.env.ANNUAL_INCENTIVE_PAYOUT_PROVIDER = 'fake';
  process.env.ANNUAL_INCENTIVE_PAYOUT_ENGINE = 'legacy';
  process.env.NODE_ENV = 'test';

  // Clean state for each test
  await pool.query('DELETE FROM annual_incentive_webhook_events');
  await pool.query('DELETE FROM annual_incentive_payout_attempts');
  await pool.query('DELETE FROM annual_incentive_payout_outbox WHERE driver_id = $1', [TEST_DRIVER_ID]);
  await pool.query('DELETE FROM annual_incentive_payouts WHERE driver_id = $1', [TEST_DRIVER_ID]);
  await pool.query('DELETE FROM annual_incentive_request_allocations WHERE request_id IN (SELECT id FROM annual_incentive_requests WHERE driver_id = $1)', [TEST_DRIVER_ID]);
  await pool.query('DELETE FROM annual_incentive_requests WHERE driver_id = $1', [TEST_DRIVER_ID]);
  await pool.query('DELETE FROM driver_payout_destinations WHERE driver_id = $1', [TEST_DRIVER_ID]);

  // Clean ledger
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE annual_incentive_ledger IN ACCESS EXCLUSIVE MODE');
    await client.query('ALTER TABLE annual_incentive_ledger DISABLE TRIGGER annual_incentive_ledger_immutable_trg');
    await client.query('DELETE FROM annual_incentive_ledger WHERE driver_id = $1', [TEST_DRIVER_ID]);
    await client.query('ALTER TABLE annual_incentive_ledger ENABLE TRIGGER annual_incentive_ledger_immutable_trg');
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
});

// ═══════════════════════════════════════════════════════════════════
// Helper to seed accruals
// ═══════════════════════════════════════════════════════════════════

async function seedAccrual(programYear: number, amountCents: bigint, suffix = '0') {
  await ledgerService.appendEvent({
    driverId: TEST_DRIVER_ID,
    programYear,
    eventType: 'ACCRUAL',
    amountCents,
    baseAmountCents: amountCents * 10n,
    rateBasisPoints: 1000,
    policyVersion: 'test_v1',
    sourceType: 'FEE_DEBIT',
    sourceId: `test-ride-${programYear}-${suffix}`,
    sourceEventId: `test-event-${programYear}-${suffix}-${Date.now()}`,
    requestId: null,
    correlationId: null,
    reversalOfId: null,
    idempotencyKey: `test-accrual-${programYear}-${suffix}-${Date.now()}-${Math.random()}`,
    metadata: {},
    occurredAt: new Date(),
  });
}

// Helper to create a date in October (within window)
function octoberDate(year = 2026): Date {
  return new Date(`${year}-10-15T12:00:00-03:00`);
}

// ═══════════════════════════════════════════════════════════════════
// 1. BALANCE AND FIFO TESTS
// ═══════════════════════════════════════════════════════════════════

describe('Balance Projection', () => {
  it('returns zero for empty balance', async () => {
    const balance = await projectBalance(pool, TEST_DRIVER_ID);
    expect(balance.totalAvailableCents).toBe(0n);
    expect(balance.totalAccruedCents).toBe(0n);
    expect(balance.byYear).toHaveLength(0);
  });

  it('projects balance for one year', async () => {
    await seedAccrual(2026, 3000n, 'a');
    await seedAccrual(2026, 2000n, 'b');
    const balance = await projectBalance(pool, TEST_DRIVER_ID);
    expect(balance.totalAccruedCents).toBe(5000n);
    expect(balance.totalAvailableCents).toBe(5000n);
    expect(balance.byYear).toHaveLength(1);
    expect(balance.byYear[0].programYear).toBe(2026);
  });

  it('projects balance for multiple years', async () => {
    await seedAccrual(2026, 3000n, 'a');
    await seedAccrual(2027, 5000n, 'b');
    const balance = await projectBalance(pool, TEST_DRIVER_ID);
    expect(balance.totalAccruedCents).toBe(8000n);
    expect(balance.byYear).toHaveLength(2);
    expect(balance.byYear[0].programYear).toBe(2026);
    expect(balance.byYear[1].programYear).toBe(2027);
  });

  it('reduces available by payment', async () => {
    await seedAccrual(2026, 5000n, 'a');
    // Simulate a payment event
    await ledgerService.appendEvent({
      driverId: TEST_DRIVER_ID,
      programYear: 2026,
      eventType: 'PAYMENT',
      amountCents: 2000n,
      baseAmountCents: null,
      rateBasisPoints: null,
      policyVersion: 'test_v1',
      sourceType: 'PAYMENT',
      sourceId: 'test-payout-1',
      sourceEventId: `test-payment-event-${Date.now()}`,
      requestId: null,
      correlationId: null,
      reversalOfId: null,
      idempotencyKey: `test-payment-${Date.now()}-${Math.random()}`,
      metadata: {},
      occurredAt: new Date(),
    });
    const balance = await projectBalance(pool, TEST_DRIVER_ID);
    expect(balance.totalPaidCents).toBe(2000n);
    expect(balance.totalAvailableCents).toBe(3000n);
  });

  it('reduces available by reservation', async () => {
    await seedAccrual(2026, 5000n, 'a');
    await ledgerService.appendEvent({
      driverId: TEST_DRIVER_ID,
      programYear: 2026,
      eventType: 'REQUEST_RESERVATION',
      amountCents: 3000n,
      baseAmountCents: null,
      rateBasisPoints: null,
      policyVersion: 'test_v1',
      sourceType: 'REQUEST',
      sourceId: 'test-req-1',
      sourceEventId: `test-reservation-${Date.now()}`,
      requestId: 'test-req-1',
      correlationId: null,
      reversalOfId: null,
      idempotencyKey: `test-reservation-${Date.now()}-${Math.random()}`,
      metadata: {},
      occurredAt: new Date(),
    });
    const balance = await projectBalance(pool, TEST_DRIVER_ID);
    expect(balance.totalOpenReservedCents).toBe(3000n);
    expect(balance.totalAvailableCents).toBe(2000n);
  });

  it('release restores available', async () => {
    await seedAccrual(2026, 5000n, 'a');
    await ledgerService.appendEvent({
      driverId: TEST_DRIVER_ID,
      programYear: 2026,
      eventType: 'REQUEST_RESERVATION',
      amountCents: 3000n,
      baseAmountCents: null,
      rateBasisPoints: null,
      policyVersion: 'test_v1',
      sourceType: 'REQUEST',
      sourceId: 'test-req-2',
      sourceEventId: `test-res-release-${Date.now()}`,
      requestId: 'test-req-2',
      correlationId: null,
      reversalOfId: null,
      idempotencyKey: `test-res-release-${Date.now()}-${Math.random()}`,
      metadata: {},
      occurredAt: new Date(),
    });
    await ledgerService.appendEvent({
      driverId: TEST_DRIVER_ID,
      programYear: 2026,
      eventType: 'RELEASE',
      amountCents: 3000n,
      baseAmountCents: null,
      rateBasisPoints: null,
      policyVersion: 'test_v1',
      sourceType: 'REQUEST',
      sourceId: 'test-req-2',
      sourceEventId: `test-release-${Date.now()}`,
      requestId: 'test-req-2',
      correlationId: null,
      reversalOfId: null,
      idempotencyKey: `test-release-${Date.now()}-${Math.random()}`,
      metadata: {},
      occurredAt: new Date(),
    });
    const balance = await projectBalance(pool, TEST_DRIVER_ID);
    expect(balance.totalOpenReservedCents).toBe(0n);
    expect(balance.totalAvailableCents).toBe(5000n);
  });

  it('preserves right for inactive driver', async () => {
    await seedAccrual(2026, 5000n, 'inactive');
    await pool.query("UPDATE drivers SET status = 'inactive' WHERE id = $1", [TEST_DRIVER_ID]);
    const balance = await projectBalance(pool, TEST_DRIVER_ID);
    expect(balance.totalAvailableCents).toBe(5000n);
    await pool.query("UPDATE drivers SET status = 'active' WHERE id = $1", [TEST_DRIVER_ID]);
  });
});

describe('FIFO Allocation', () => {
  it('allocates from oldest year first', () => {
    const byYear = [
      { programYear: 2026, accruedCents: 3000n, reversedCents: 0n, paidCents: 0n, openReservedCents: 0n, availableCents: 3000n },
      { programYear: 2027, accruedCents: 5000n, reversedCents: 0n, paidCents: 0n, openReservedCents: 0n, availableCents: 5000n },
    ];
    const allocs = allocateFifo(byYear, 6000n);
    expect(allocs).toHaveLength(2);
    expect(allocs[0]).toEqual({ programYear: 2026, amountCents: 3000n });
    expect(allocs[1]).toEqual({ programYear: 2027, amountCents: 3000n });
  });

  it('throws on insufficient balance', () => {
    const byYear = [
      { programYear: 2026, accruedCents: 3000n, reversedCents: 0n, paidCents: 0n, openReservedCents: 0n, availableCents: 3000n },
    ];
    expect(() => allocateFifo(byYear, 5000n)).toThrow();
  });

  it('throws on zero amount', () => {
    const byYear = [
      { programYear: 2026, accruedCents: 3000n, reversedCents: 0n, paidCents: 0n, openReservedCents: 0n, availableCents: 3000n },
    ];
    expect(() => allocateFifo(byYear, 0n)).toThrow();
  });

  it('throws on negative amount', () => {
    const byYear = [
      { programYear: 2026, accruedCents: 3000n, reversedCents: 0n, paidCents: 0n, openReservedCents: 0n, availableCents: 3000n },
    ];
    expect(() => allocateFifo(byYear, -100n)).toThrow();
  });

  it('skips years with zero available', () => {
    const byYear = [
      { programYear: 2026, accruedCents: 3000n, reversedCents: 3000n, paidCents: 0n, openReservedCents: 0n, availableCents: 0n },
      { programYear: 2027, accruedCents: 5000n, reversedCents: 0n, paidCents: 0n, openReservedCents: 0n, availableCents: 5000n },
    ];
    const allocs = allocateFifo(byYear, 4000n);
    expect(allocs).toHaveLength(1);
    expect(allocs[0]).toEqual({ programYear: 2027, amountCents: 4000n });
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. WINDOW TESTS
// ═══════════════════════════════════════════════════════════════════

describe('Request Window', () => {
  it('blocks September 30', () => {
    delete process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN;
    expect(isWithinRequestWindow(new Date('2026-09-30T23:59:00-03:00'))).toBe(false);
  });

  it('allows October 1', () => {
    delete process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN;
    expect(isWithinRequestWindow(new Date('2026-10-01T00:01:00-03:00'))).toBe(true);
  });

  it('allows December 31', () => {
    delete process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN;
    expect(isWithinRequestWindow(new Date('2026-12-31T23:59:00-03:00'))).toBe(true);
  });

  it('blocks January 1', () => {
    delete process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN;
    expect(isWithinRequestWindow(new Date('2027-01-01T00:01:00-03:00'))).toBe(false);
  });

  it('respects São Paulo timezone', () => {
    delete process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN;
    // 2026-10-01 00:30 BRT = 2026-09-30 in UTC+0 still
    expect(isWithinRequestWindow(new Date('2026-10-01T03:30:00Z'))).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// 3. DESTINATION TESTS
// ═══════════════════════════════════════════════════════════════════

describe('Payout Destination', () => {
  it('allows matching CPF', async () => {
    const dest = await setDestination(pool, {
      driverId: TEST_DRIVER_ID,
      pixKeyType: 'CPF',
      pixKeyCpf: TEST_DRIVER_CPF,
    });
    expect(dest.status).toBe('active');
    expect(dest.pixKeyMasked).not.toContain(TEST_DRIVER_CPF);
    expect(dest.pixKeyEncrypted).not.toBe(TEST_DRIVER_CPF);
  });

  it('blocks non-matching CPF', async () => {
    await expect(setDestination(pool, {
      driverId: TEST_DRIVER_ID,
      pixKeyType: 'CPF',
      pixKeyCpf: '11144477735', // different valid CPF
    })).rejects.toMatchObject({ code: PAYOUT_ERRORS.CPF_MISMATCH });
  });

  it('never stores unencrypted key', async () => {
    const dest = await setDestination(pool, {
      driverId: TEST_DRIVER_ID,
      pixKeyType: 'CPF',
      pixKeyCpf: TEST_DRIVER_CPF,
    });
    // Check raw DB value
    const { rows } = await pool.query(
      'SELECT pix_key_encrypted FROM driver_payout_destinations WHERE id = $1',
      [dest.id]
    );
    expect(rows[0].pix_key_encrypted).not.toBe(TEST_DRIVER_CPF);
    expect(rows[0].pix_key_encrypted).not.toContain(TEST_DRIVER_CPF);
  });

  it('returns masked value in API', async () => {
    const dest = await setDestination(pool, {
      driverId: TEST_DRIVER_ID,
      pixKeyType: 'CPF',
      pixKeyCpf: TEST_DRIVER_CPF,
    });
    expect(dest.pixKeyMasked).toContain('***');
    expect(dest.pixKeyMasked.replace(/[*.\-]/g, '').length).toBeLessThan(11);
  });

  it('supersedes previous destination on change', async () => {
    await setDestination(pool, { driverId: TEST_DRIVER_ID, pixKeyType: 'CPF', pixKeyCpf: TEST_DRIVER_CPF });
    await setDestination(pool, { driverId: TEST_DRIVER_ID, pixKeyType: 'CPF', pixKeyCpf: TEST_DRIVER_CPF });
    const { rows } = await pool.query(
      "SELECT * FROM driver_payout_destinations WHERE driver_id = $1 AND status = 'active'",
      [TEST_DRIVER_ID]
    );
    expect(rows).toHaveLength(1);
  });
});

describe('Crypto utilities', () => {
  it('encrypts and decrypts correctly', () => {
    const plaintext = '52998224725';
    const encrypted = encryptPayoutSecret(plaintext);
    expect(encrypted).not.toBe(plaintext);
    expect(decryptPayoutSecret(encrypted)).toBe(plaintext);
  });

  it('produces deterministic hash', () => {
    const h1 = hmacPayoutValue('52998224725');
    const h2 = hmacPayoutValue('52998224725');
    expect(h1).toBe(h2);
  });

  it('masks CPF properly', () => {
    const masked = maskCpf('52998224725');
    expect(masked).not.toContain('529');
    expect(masked).toContain('***');
  });

  it('validates CPF', () => {
    expect(isValidCpf('52998224725')).toBe(true);
    expect(isValidCpf('11111111111')).toBe(false);
    expect(isValidCpf('123')).toBe(false);
  });

  it('normalizes CPF', () => {
    expect(normalizeCpf('529.982.247-25')).toBe('52998224725');
  });
});
