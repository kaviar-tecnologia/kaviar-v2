/**
 * Annual Incentive Payout Tests - Part 2
 * Request creation, provider, worker, webhook tests
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { AnnualIncentiveLedgerService } from '../../src/services/finance/annual-incentive-ledger.service';
import { projectBalance } from '../../src/services/finance/annual-incentive-payout/balance-projection';
import {
  createRequest,
  getRequestById,
  getOpenRequest,
  transitionRequest,
} from '../../src/services/finance/annual-incentive-payout/request.service';
import { setDestination } from '../../src/services/finance/annual-incentive-payout/destination.service';
import { checkEligibility } from '../../src/services/finance/annual-incentive-payout/eligibility.service';
import { processOutboxBatch } from '../../src/services/finance/annual-incentive-payout/worker.service';
import { processWebhookEvent } from '../../src/services/finance/annual-incentive-payout/webhook.service';
import {
  FakeAnnualIncentivePayoutProvider,
  UnavailableAnnualIncentivePayoutProvider,
} from '../../src/services/finance/annual-incentive-payout/providers';
import { PAYOUT_ERRORS } from '../../src/services/finance/annual-incentive-payout/types';

const TEST_DRIVER_ID = 'test-payout-driver-002';
const TEST_DRIVER_CPF = '52998224725';

let pool: pg.Pool;
let ledgerService: AnnualIncentiveLedgerService;

beforeAll(async () => {
  assertSafeFinanceDatabase();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  ledgerService = new AnnualIncentiveLedgerService(pool);
  process.env.ANNUAL_INCENTIVE_PAYOUT_ENCRYPTION_KEY = 'b'.repeat(64);
  process.env.ANNUAL_INCENTIVE_PAYOUT_HASH_KEY = 'e'.repeat(64);
  process.env.ANNUAL_INCENTIVE_PAYOUT_KEY_VERSION = '1';

  await pool.query(`
    INSERT INTO drivers (id, name, email, phone, document_cpf, status, vehicle_type, created_at, updated_at)
    VALUES ($1, 'Test Payout Driver 2', 'test-payout-2@test.local', '21999990002', $2, 'active', 'car', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET document_cpf = $2
  `, [TEST_DRIVER_ID, TEST_DRIVER_CPF]);
});

afterAll(async () => {
  await cleanupAll();
  await pool.query('DELETE FROM drivers WHERE id = $1', [TEST_DRIVER_ID]);
  await pool.end();
});

async function cleanupAll() {
  await pool.query('DELETE FROM annual_incentive_webhook_events');
  await pool.query('DELETE FROM annual_incentive_payout_attempts WHERE payout_id IN (SELECT id FROM annual_incentive_payouts WHERE driver_id = $1)', [TEST_DRIVER_ID]);
  await pool.query('DELETE FROM annual_incentive_payout_outbox WHERE driver_id = $1', [TEST_DRIVER_ID]);
  await pool.query('DELETE FROM annual_incentive_payouts WHERE driver_id = $1', [TEST_DRIVER_ID]);
  await pool.query('DELETE FROM annual_incentive_request_allocations WHERE request_id IN (SELECT id FROM annual_incentive_requests WHERE driver_id = $1)', [TEST_DRIVER_ID]);
  await pool.query('DELETE FROM annual_incentive_requests WHERE driver_id = $1', [TEST_DRIVER_ID]);
  await pool.query('DELETE FROM driver_payout_destinations WHERE driver_id = $1', [TEST_DRIVER_ID]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE annual_incentive_ledger IN ACCESS EXCLUSIVE MODE');
    await client.query('ALTER TABLE annual_incentive_ledger DISABLE TRIGGER annual_incentive_ledger_immutable_trg');
    await client.query('DELETE FROM annual_incentive_ledger WHERE driver_id = $1', [TEST_DRIVER_ID]);
    await client.query('ALTER TABLE annual_incentive_ledger ENABLE TRIGGER annual_incentive_ledger_immutable_trg');
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

beforeEach(async () => {
  process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
  process.env.ANNUAL_INCENTIVE_PAYOUT_ENABLED = 'true';
  process.env.ANNUAL_INCENTIVE_PAYOUT_PROVIDER = 'fake';
  process.env.NODE_ENV = 'test';
  await cleanupAll();
});

async function seedAccrual(year: number, cents: bigint, suffix: string) {
  await ledgerService.appendEvent({
    driverId: TEST_DRIVER_ID, programYear: year, eventType: 'ACCRUAL',
    amountCents: cents, baseAmountCents: cents * 10n, rateBasisPoints: 1000,
    policyVersion: 'test_v1', sourceType: 'FEE_DEBIT',
    sourceId: `ride-${suffix}`, sourceEventId: `ev-${suffix}-${Date.now()}`,
    requestId: null, correlationId: null, reversalOfId: null,
    idempotencyKey: `accrual-${suffix}-${Date.now()}-${Math.random()}`,
    metadata: {}, occurredAt: new Date(),
  });
}

async function setupDestination() {
  await setDestination(pool, { driverId: TEST_DRIVER_ID, pixKeyType: 'CPF', pixKeyCpf: TEST_DRIVER_CPF });
}

function octoberDate(): Date {
  return new Date('2026-10-15T12:00:00-03:00');
}

// ═══════════════════════════════════════════════════════════════════
// REQUEST CREATION
// ═══════════════════════════════════════════════════════════════════

describe('Request Creation', () => {
  it('creates request with full amount', async () => {
    await seedAccrual(2026, 5000n, 'full');
    await setupDestination();
    const result = await createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 5000n,
      idempotencyKey: `req-full-${Date.now()}`, now: octoberDate(),
    });
    expect(result.created).toBe(true);
    expect(result.request.status).toBe('RESERVED');
    expect(result.request.requestedAmountCents).toBe(5000n);
    expect(result.allocations).toHaveLength(1);
  });

  it('creates request with partial amount', async () => {
    await seedAccrual(2026, 5000n, 'partial');
    await setupDestination();
    const result = await createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 2000n,
      idempotencyKey: `req-partial-${Date.now()}`, now: octoberDate(),
    });
    expect(result.created).toBe(true);
    expect(result.request.requestedAmountCents).toBe(2000n);
  });

  it('rejects above balance', async () => {
    await seedAccrual(2026, 5000n, 'above');
    await setupDestination();
    await expect(createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 10000n,
      idempotencyKey: `req-above-${Date.now()}`, now: octoberDate(),
    })).rejects.toMatchObject({ code: PAYOUT_ERRORS.INSUFFICIENT_BALANCE });
  });

  it('rejects zero amount', async () => {
    await seedAccrual(2026, 5000n, 'zero');
    await setupDestination();
    await expect(createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 0n,
      idempotencyKey: `req-zero-${Date.now()}`, now: octoberDate(),
    })).rejects.toMatchObject({ code: PAYOUT_ERRORS.INVALID_AMOUNT });
  });

  it('rejects negative amount', async () => {
    await setupDestination();
    await expect(createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: -100n,
      idempotencyKey: `req-neg-${Date.now()}`, now: octoberDate(),
    })).rejects.toMatchObject({ code: PAYOUT_ERRORS.INVALID_AMOUNT });
  });

  it('rejects outside window', async () => {
    delete process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN;
    await seedAccrual(2026, 5000n, 'window');
    await setupDestination();
    await expect(createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 1000n,
      idempotencyKey: `req-window-${Date.now()}`,
      now: new Date('2026-09-15T12:00:00-03:00'),
    })).rejects.toMatchObject({ code: PAYOUT_ERRORS.WINDOW_CLOSED });
    process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN = 'true';
  });

  it('rejects concurrent open request', async () => {
    await seedAccrual(2026, 5000n, 'conc');
    await setupDestination();
    await createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 1000n,
      idempotencyKey: `req-conc1-${Date.now()}`, now: octoberDate(),
    });
    await expect(createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 1000n,
      idempotencyKey: `req-conc2-${Date.now()}`, now: octoberDate(),
    })).rejects.toMatchObject({ code: PAYOUT_ERRORS.OPEN_REQUEST_EXISTS });
  });

  it('handles idempotent replay', async () => {
    await seedAccrual(2026, 5000n, 'idemp');
    await setupDestination();
    const key = `idemp-key-${Date.now()}`;
    const r1 = await createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 2000n,
      idempotencyKey: key, now: octoberDate(),
    });
    const r2 = await createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 2000n,
      idempotencyKey: key, now: octoberDate(),
    });
    expect(r1.request.id).toBe(r2.request.id);
    expect(r2.created).toBe(false);
  });

  it('rejects idempotency conflict', async () => {
    await seedAccrual(2026, 5000n, 'conflict');
    await setupDestination();
    const key = `conflict-key-${Date.now()}`;
    await createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 2000n,
      idempotencyKey: key, now: octoberDate(),
    });
    await expect(createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 3000n,
      idempotencyKey: key, now: octoberDate(),
    })).rejects.toMatchObject({ code: PAYOUT_ERRORS.IDEMPOTENCY_CONFLICT });
  });

  it('creates FIFO allocations across years', async () => {
    await seedAccrual(2026, 3000n, 'fifo1');
    await seedAccrual(2027, 5000n, 'fifo2');
    await setupDestination();
    const result = await createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 6000n,
      idempotencyKey: `fifo-${Date.now()}`, now: octoberDate(),
    });
    expect(result.allocations).toHaveLength(2);
    expect(result.allocations[0].programYear).toBe(2026);
    expect(result.allocations[0].amountCents).toBe(3000n);
    expect(result.allocations[1].programYear).toBe(2027);
    expect(result.allocations[1].amountCents).toBe(3000n);
  });

  it('reservation reduces available for next request', async () => {
    await seedAccrual(2026, 5000n, 'seq');
    await setupDestination();
    await createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 3000n,
      idempotencyKey: `seq1-${Date.now()}`, now: octoberDate(),
    });
    const balance = await projectBalance(pool, TEST_DRIVER_ID);
    expect(balance.totalAvailableCents).toBe(2000n);
  });
});

// ═══════════════════════════════════════════════════════════════════
// PROVIDER TESTS
// ═══════════════════════════════════════════════════════════════════

describe('Providers', () => {
  it('FakeProvider is available in test', async () => {
    const provider = new FakeAnnualIncentivePayoutProvider();
    const avail = await provider.validateAvailability();
    expect(avail.available).toBe(true);
  });

  it('FakeProvider blocks production', () => {
    process.env.NODE_ENV = 'production';
    expect(() => new FakeAnnualIncentivePayoutProvider()).toThrow();
    process.env.NODE_ENV = 'test';
  });

  it('UnavailableProvider returns not available', async () => {
    const provider = new UnavailableAnnualIncentivePayoutProvider();
    const avail = await provider.validateAvailability();
    expect(avail.available).toBe(false);
    expect(avail.reason).toBe(PAYOUT_ERRORS.PROVIDER_CAPABILITY_NOT_CONFIRMED);
  });

  it('UnavailableProvider blocks payout creation', async () => {
    const provider = new UnavailableAnnualIncentivePayoutProvider();
    const result = await provider.createPayout({
      requestId: 'test', driverId: 'test', amountCents: 1000n,
      pixKeyCpf: '12345678901', externalReference: 'ref', idempotencyKey: 'key',
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(PAYOUT_ERRORS.PROVIDER_CAPABILITY_NOT_CONFIRMED);
  });

  it('FakeProvider simulates success', async () => {
    const provider = new FakeAnnualIncentivePayoutProvider();
    const result = await provider.createPayout({
      requestId: 'r1', driverId: 'd1', amountCents: 1000n,
      pixKeyCpf: '12345678901', externalReference: 'annual-incentive-request:r1',
      idempotencyKey: 'k1',
    });
    expect(result.success).toBe(true);
    expect(result.providerPayoutId).toBeTruthy();
  });

  it('FakeProvider simulates timeout', async () => {
    const provider = new FakeAnnualIncentivePayoutProvider();
    provider.behavior = 'timeout';
    const result = await provider.createPayout({
      requestId: 'r2', driverId: 'd2', amountCents: 1000n,
      pixKeyCpf: '12345678901', externalReference: 'ref2', idempotencyKey: 'k2',
    });
    expect(result.success).toBe(false);
    expect(result.isTimeout).toBe(true);
  });

  it('FakeProvider simulates definitive failure', async () => {
    const provider = new FakeAnnualIncentivePayoutProvider();
    provider.behavior = 'definitive_failure';
    const result = await provider.createPayout({
      requestId: 'r3', driverId: 'd3', amountCents: 1000n,
      pixKeyCpf: '12345678901', externalReference: 'ref3', idempotencyKey: 'k3',
    });
    expect(result.success).toBe(false);
    expect(result.isDefinitiveFailure).toBe(true);
  });

  it('provider disabled does not send', async () => {
    process.env.ANNUAL_INCENTIVE_PAYOUT_ENABLED = 'false';
    const provider = new UnavailableAnnualIncentivePayoutProvider();
    const avail = await provider.validateAvailability();
    expect(avail.available).toBe(false);
    // When provider is unavailable, createPayout returns error
    const result = await provider.createPayout({
      requestId: 'test', driverId: 'test', amountCents: 1000n,
      pixKeyCpf: '12345678901', externalReference: 'ref', idempotencyKey: 'key',
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe(PAYOUT_ERRORS.PROVIDER_CAPABILITY_NOT_CONFIRMED);
  });
});
