/**
 * Engine selection and Annual Incentive ↔ Financial Obligation integration tests.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { AnnualIncentiveLedgerService } from '../../src/services/finance/annual-incentive-ledger.service';
import { createRequest } from '../../src/services/finance/annual-incentive-payout/request.service';
import { setDestination } from '../../src/services/finance/annual-incentive-payout/destination.service';
import {
  getAnnualIncentivePayoutEngine,
  shouldStartLegacyWorker,
  shouldUseOutboundEngine,
  isAnnualIncentivePayoutDisabled,
} from '../../src/services/finance/annual-incentive-payout/engine-selection';

const TEST_DRIVER_ID = 'test-engine-driver-001';
const TEST_DRIVER_CPF = '52998224725';

let pool: pg.Pool;
let ledgerService: AnnualIncentiveLedgerService;

beforeAll(async () => {
  assertSafeFinanceDatabase();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  ledgerService = new AnnualIncentiveLedgerService(pool);
  process.env.ANNUAL_INCENTIVE_PAYOUT_ENCRYPTION_KEY = 'a'.repeat(64);
  process.env.ANNUAL_INCENTIVE_PAYOUT_HASH_KEY = 'f'.repeat(64);
  process.env.ANNUAL_INCENTIVE_PAYOUT_KEY_VERSION = '1';

  await pool.query(`
    INSERT INTO drivers (id, name, email, phone, document_cpf, status, vehicle_type, created_at, updated_at)
    VALUES ($1, 'Engine Test Driver', 'engine-test@test.local', '21999990099', $2, 'active', 'car', NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET document_cpf = $2
  `, [TEST_DRIVER_ID, TEST_DRIVER_CPF]);
});

afterAll(async () => {
  await cleanup();
  await pool.query('DELETE FROM drivers WHERE id = $1', [TEST_DRIVER_ID]);
  await pool.end();
});

async function cleanup() {
  await pool.query('DELETE FROM financial_payout_outbox WHERE payee_id IN (SELECT id FROM financial_payees WHERE reference_id = $1)', [TEST_DRIVER_ID]);
  await pool.query('DELETE FROM financial_obligations WHERE payee_id IN (SELECT id FROM financial_payees WHERE reference_id = $1)', [TEST_DRIVER_ID]);
  await pool.query('DELETE FROM financial_payee_destinations WHERE payee_id IN (SELECT id FROM financial_payees WHERE reference_id = $1)', [TEST_DRIVER_ID]);
  await pool.query('DELETE FROM financial_payees WHERE reference_id = $1', [TEST_DRIVER_ID]);
  await pool.query('DELETE FROM annual_incentive_payout_outbox WHERE driver_id = $1', [TEST_DRIVER_ID]);
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
  process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN = 'true';
  process.env.NODE_ENV = 'test';
  await cleanup();
});

async function seedAccrual(cents: bigint) {
  await ledgerService.appendEvent({
    driverId: TEST_DRIVER_ID, programYear: 2026, eventType: 'ACCRUAL',
    amountCents: cents, baseAmountCents: cents * 10n, rateBasisPoints: 1000,
    policyVersion: 'test_v1', sourceType: 'FEE_DEBIT',
    sourceId: `ride-${Date.now()}`, sourceEventId: `ev-${Date.now()}-${Math.random()}`,
    requestId: null, correlationId: null, reversalOfId: null,
    idempotencyKey: `accrual-engine-${Date.now()}-${Math.random()}`,
    metadata: {}, occurredAt: new Date(),
  });
}

// ═══════════════════════════════════════════════════════════════════
// ENGINE SELECTION
// ═══════════════════════════════════════════════════════════════════

describe('Engine Selection', () => {
  it('defaults to disabled when env absent', () => {
    delete process.env.ANNUAL_INCENTIVE_PAYOUT_ENGINE;
    expect(getAnnualIncentivePayoutEngine()).toBe('disabled');
    expect(isAnnualIncentivePayoutDisabled()).toBe(true);
  });

  it('returns legacy when set to legacy', () => {
    process.env.ANNUAL_INCENTIVE_PAYOUT_ENGINE = 'legacy';
    expect(getAnnualIncentivePayoutEngine()).toBe('legacy');
    expect(shouldStartLegacyWorker()).toBe(true);
    expect(shouldUseOutboundEngine()).toBe(false);
  });

  it('returns outbound when set to outbound', () => {
    process.env.ANNUAL_INCENTIVE_PAYOUT_ENGINE = 'outbound';
    expect(getAnnualIncentivePayoutEngine()).toBe('outbound');
    expect(shouldStartLegacyWorker()).toBe(false);
    expect(shouldUseOutboundEngine()).toBe(true);
  });

  it('returns disabled for invalid value', () => {
    process.env.ANNUAL_INCENTIVE_PAYOUT_ENGINE = 'LEGACY';
    expect(getAnnualIncentivePayoutEngine()).toBe('disabled');
  });

  it('returns disabled for unknown value', () => {
    process.env.ANNUAL_INCENTIVE_PAYOUT_ENGINE = 'both';
    expect(getAnnualIncentivePayoutEngine()).toBe('disabled');
  });
});

// ═══════════════════════════════════════════════════════════════════
// OUTBOUND ENGINE: request creates obligation
// ═══════════════════════════════════════════════════════════════════

describe('Outbound Engine Integration', () => {
  beforeEach(() => {
    process.env.ANNUAL_INCENTIVE_PAYOUT_ENGINE = 'outbound';
  });

  it('creates financial_obligation atomically with request', async () => {
    await seedAccrual(5000n);
    await setDestination(pool, { driverId: TEST_DRIVER_ID, pixKeyType: 'CPF', pixKeyCpf: TEST_DRIVER_CPF });

    const result = await createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 3000n,
      idempotencyKey: `engine-outbound-${Date.now()}`,
      now: new Date('2026-10-15T12:00:00-03:00'),
    });

    // Verify obligation created
    const { rows: obls } = await pool.query(
      `SELECT * FROM financial_obligations WHERE source_type = 'ANNUAL_INCENTIVE_REQUEST' AND source_id = $1`,
      [result.request.id]
    );
    expect(obls).toHaveLength(1);
    expect(obls[0].purpose).toBe('DRIVER_ANNUAL_INCENTIVE');
    expect(BigInt(obls[0].net_amount_cents)).toBe(3000n);
    expect(obls[0].status).toBe('QUEUED');

    // Verify outbox created
    const { rows: outbox } = await pool.query(
      `SELECT * FROM financial_payout_outbox WHERE obligation_id = $1`, [obls[0].id]
    );
    expect(outbox).toHaveLength(1);

    // Verify legacy outbox NOT created
    const { rows: legacyOutbox } = await pool.query(
      `SELECT * FROM annual_incentive_payout_outbox WHERE request_id = $1`, [result.request.id]
    );
    expect(legacyOutbox).toHaveLength(0);
  });

  it('creates payee for driver if not exists', async () => {
    await seedAccrual(5000n);
    await setDestination(pool, { driverId: TEST_DRIVER_ID, pixKeyType: 'CPF', pixKeyCpf: TEST_DRIVER_CPF });

    await createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 2000n,
      idempotencyKey: `engine-payee-${Date.now()}`,
      now: new Date('2026-10-15T12:00:00-03:00'),
    });

    const { rows: payees } = await pool.query(
      `SELECT * FROM financial_payees WHERE reference_id = $1 AND payee_type = 'DRIVER'`, [TEST_DRIVER_ID]
    );
    expect(payees).toHaveLength(1);
  });

  it('prevents duplicate obligations for same request (unique constraint)', async () => {
    await seedAccrual(5000n);
    await setDestination(pool, { driverId: TEST_DRIVER_ID, pixKeyType: 'CPF', pixKeyCpf: TEST_DRIVER_CPF });

    const key = `engine-dup-${Date.now()}`;
    const r1 = await createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 2000n,
      idempotencyKey: key, now: new Date('2026-10-15T12:00:00-03:00'),
    });
    // Idempotent replay
    const r2 = await createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 2000n,
      idempotencyKey: key, now: new Date('2026-10-15T12:00:00-03:00'),
    });
    expect(r1.request.id).toBe(r2.request.id);

    // Still only one obligation
    const { rows } = await pool.query(
      `SELECT * FROM financial_obligations WHERE source_type = 'ANNUAL_INCENTIVE_REQUEST' AND source_id = $1`,
      [r1.request.id]
    );
    expect(rows).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// LEGACY ENGINE: does NOT create obligation
// ═══════════════════════════════════════════════════════════════════

describe('Legacy Engine', () => {
  beforeEach(() => {
    process.env.ANNUAL_INCENTIVE_PAYOUT_ENGINE = 'legacy';
  });

  it('creates legacy outbox, not financial_obligation', async () => {
    await seedAccrual(5000n);
    await setDestination(pool, { driverId: TEST_DRIVER_ID, pixKeyType: 'CPF', pixKeyCpf: TEST_DRIVER_CPF });

    const result = await createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 2000n,
      idempotencyKey: `engine-legacy-${Date.now()}`,
      now: new Date('2026-10-15T12:00:00-03:00'),
    });

    // Legacy outbox created
    const { rows: legacyOutbox } = await pool.query(
      `SELECT * FROM annual_incentive_payout_outbox WHERE request_id = $1`, [result.request.id]
    );
    expect(legacyOutbox).toHaveLength(1);

    // Generic obligation NOT created
    const { rows: obls } = await pool.query(
      `SELECT * FROM financial_obligations WHERE source_type = 'ANNUAL_INCENTIVE_REQUEST' AND source_id = $1`,
      [result.request.id]
    );
    expect(obls).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// DISABLED ENGINE: no outbox
// ═══════════════════════════════════════════════════════════════════

describe('Disabled Engine', () => {
  beforeEach(() => {
    process.env.ANNUAL_INCENTIVE_PAYOUT_ENGINE = 'disabled';
  });

  it('creates request and reservation but no outbox', async () => {
    await seedAccrual(5000n);
    await setDestination(pool, { driverId: TEST_DRIVER_ID, pixKeyType: 'CPF', pixKeyCpf: TEST_DRIVER_CPF });

    const result = await createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 2000n,
      idempotencyKey: `engine-disabled-${Date.now()}`,
      now: new Date('2026-10-15T12:00:00-03:00'),
    });

    expect(result.request.status).toBe('RESERVED');

    // No outbox anywhere
    const { rows: legacy } = await pool.query(
      `SELECT * FROM annual_incentive_payout_outbox WHERE request_id = $1`, [result.request.id]
    );
    const { rows: generic } = await pool.query(
      `SELECT * FROM financial_obligations WHERE source_type = 'ANNUAL_INCENTIVE_REQUEST' AND source_id = $1`,
      [result.request.id]
    );
    expect(legacy).toHaveLength(0);
    expect(generic).toHaveLength(0);
  });
});
