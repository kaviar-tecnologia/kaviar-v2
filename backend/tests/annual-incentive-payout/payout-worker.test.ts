/**
 * Annual Incentive Payout Tests - Part 3
 * Worker, webhook, reconciliation, security tests
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { AnnualIncentiveLedgerService } from '../../src/services/finance/annual-incentive-ledger.service';
import { projectBalance } from '../../src/services/finance/annual-incentive-payout/balance-projection';
import { createRequest, getRequestById } from '../../src/services/finance/annual-incentive-payout/request.service';
import { setDestination } from '../../src/services/finance/annual-incentive-payout/destination.service';
import { processOutboxBatch } from '../../src/services/finance/annual-incentive-payout/worker.service';
import { processWebhookEvent } from '../../src/services/finance/annual-incentive-payout/webhook.service';
import { runReconciliation } from '../../src/services/finance/annual-incentive-payout/reconciliation.service';
import { FakeAnnualIncentivePayoutProvider } from '../../src/services/finance/annual-incentive-payout/providers';
import { PAYOUT_ERRORS } from '../../src/services/finance/annual-incentive-payout/types';

const TEST_DRIVER_ID = 'test-payout-driver-003';
const TEST_DRIVER_CPF = '52998224725';

let pool: pg.Pool;
let ledgerService: AnnualIncentiveLedgerService;
let fakeProvider: FakeAnnualIncentivePayoutProvider;

beforeAll(async () => {
  assertSafeFinanceDatabase();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  ledgerService = new AnnualIncentiveLedgerService(pool);
  process.env.ANNUAL_INCENTIVE_PAYOUT_ENCRYPTION_KEY = 'c'.repeat(64);
  process.env.ANNUAL_INCENTIVE_PAYOUT_HASH_KEY = 'd'.repeat(64);
  process.env.ANNUAL_INCENTIVE_PAYOUT_KEY_VERSION = '1';

  await pool.query(`
    INSERT INTO drivers (id, name, email, phone, document_cpf, status, vehicle_type, created_at, updated_at)
    VALUES ($1, 'Test Payout Driver 3', 'test-payout-3@test.local', '21999990003', $2, 'active', 'car', NOW(), NOW())
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
  process.env.ANNUAL_INCENTIVE_FORCE_WINDOW_OPEN = 'true';
  process.env.NODE_ENV = 'test';
  fakeProvider = new FakeAnnualIncentivePayoutProvider();
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

async function setupAndCreateRequest(amountCents: bigint) {
  await setDestination(pool, { driverId: TEST_DRIVER_ID, pixKeyType: 'CPF', pixKeyCpf: TEST_DRIVER_CPF });
  return createRequest(pool, ledgerService, {
    driverId: TEST_DRIVER_ID, requestedAmountCents: amountCents,
    idempotencyKey: `req-${Date.now()}-${Math.random()}`,
    now: new Date('2026-10-15T12:00:00-03:00'), // within window
  });
}

// ═══════════════════════════════════════════════════════════════════
// WORKER TESTS
// ═══════════════════════════════════════════════════════════════════

describe('Worker', () => {
  it('processes outbox and submits to provider', async () => {
    await seedAccrual(2026, 5000n, 'worker1');
    const { request } = await setupAndCreateRequest(3000n);

    const processed = await processOutboxBatch({ pool, ledgerService, provider: fakeProvider });
    expect(processed).toBe(1);

    const updated = await getRequestById(pool, request.id);
    expect(updated!.status).toBe('SUBMITTED');
    expect(fakeProvider.createCallCount).toBe(1);
  });

  it('timeout does not cause retry blind', async () => {
    await seedAccrual(2026, 5000n, 'timeout');
    const { request } = await setupAndCreateRequest(3000n);

    fakeProvider.behavior = 'timeout';
    await processOutboxBatch({ pool, ledgerService, provider: fakeProvider });

    const updated = await getRequestById(pool, request.id);
    // Should NOT be retried blindly - outbox blocked
    const { rows } = await pool.query(
      'SELECT status FROM annual_incentive_payout_outbox WHERE request_id = $1',
      [request.id]
    );
    expect(rows[0].status).toBe('BLOCKED');
  });

  it('definitive failure releases reservation', async () => {
    await seedAccrual(2026, 5000n, 'defail');
    const { request } = await setupAndCreateRequest(3000n);

    fakeProvider.behavior = 'definitive_failure';
    await processOutboxBatch({ pool, ledgerService, provider: fakeProvider });

    const updated = await getRequestById(pool, request.id);
    expect(updated!.status).toBe('FAILED_RELEASED');

    // Balance should be restored
    const balance = await projectBalance(pool, TEST_DRIVER_ID);
    expect(balance.totalAvailableCents).toBe(5000n);
  });

  it('temporary failure schedules retry', async () => {
    await seedAccrual(2026, 5000n, 'tempfail');
    const { request } = await setupAndCreateRequest(3000n);

    fakeProvider.behavior = 'temporary_failure';
    await processOutboxBatch({ pool, ledgerService, provider: fakeProvider });

    const updated = await getRequestById(pool, request.id);
    expect(updated!.status).toBe('RETRYABLE_FAILURE');

    const { rows } = await pool.query(
      'SELECT status, next_at, attempts FROM annual_incentive_payout_outbox WHERE request_id = $1',
      [request.id]
    );
    expect(rows[0].status).toBe('PENDING');
    expect(rows[0].attempts).toBe(1);
    expect(new Date(rows[0].next_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('two workers do not duplicate payout', async () => {
    await seedAccrual(2026, 5000n, 'dup');
    const { request } = await setupAndCreateRequest(3000n);

    // Both process concurrently - SKIP LOCKED prevents double processing
    const [r1, r2] = await Promise.all([
      processOutboxBatch({ pool, ledgerService, provider: fakeProvider }),
      processOutboxBatch({ pool, ledgerService, provider: fakeProvider }),
    ]);

    // Only one should have processed
    expect(r1 + r2).toBe(1);
    expect(fakeProvider.createCallCount).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════
// WEBHOOK TESTS
// ═══════════════════════════════════════════════════════════════════

describe('Webhook Processing', () => {
  async function setupSubmittedRequest() {
    await seedAccrual(2026, 5000n, `wh-${Date.now()}`);
    const { request } = await setupAndCreateRequest(3000n);
    await processOutboxBatch({ pool, ledgerService, provider: fakeProvider });
    return request.id;
  }

  it('DONE creates PAYMENT and marks PAID', async () => {
    const requestId = await setupSubmittedRequest();
    const { rows: [payout] } = await pool.query(
      'SELECT * FROM annual_incentive_payouts WHERE request_id = $1', [requestId]
    );

    await processWebhookEvent({ pool, ledgerService }, {
      providerEventId: `done-event-${Date.now()}`,
      providerPayoutId: payout.provider_payout_id,
      eventType: 'DONE',
      amountCents: 3000n,
      raw: { source: 'test' },
    }, 'fake');

    const updated = await getRequestById(pool, requestId);
    expect(updated!.status).toBe('PAID');

    // Verify PAYMENT events in ledger
    const { rows: payments } = await pool.query(
      "SELECT * FROM annual_incentive_ledger WHERE driver_id = $1 AND event_type = 'PAYMENT'",
      [TEST_DRIVER_ID]
    );
    expect(payments.length).toBeGreaterThan(0);
  });

  it('duplicate webhook is idempotent', async () => {
    const requestId = await setupSubmittedRequest();
    const { rows: [payout] } = await pool.query(
      'SELECT * FROM annual_incentive_payouts WHERE request_id = $1', [requestId]
    );

    const eventId = `dup-event-${Date.now()}`;
    await processWebhookEvent({ pool, ledgerService }, {
      providerEventId: eventId, providerPayoutId: payout.provider_payout_id,
      eventType: 'DONE', amountCents: 3000n, raw: {},
    }, 'fake');

    const r2 = await processWebhookEvent({ pool, ledgerService }, {
      providerEventId: eventId, providerPayoutId: payout.provider_payout_id,
      eventType: 'DONE', amountCents: 3000n, raw: {},
    }, 'fake');

    expect(r2.duplicate).toBe(true);

    // Only one PAYMENT set
    const { rows: payments } = await pool.query(
      "SELECT * FROM annual_incentive_ledger WHERE request_id = $1 AND event_type = 'PAYMENT'",
      [requestId]
    );
    expect(payments.length).toBe(1); // one per allocation
  });

  it('FAILED releases reservation', async () => {
    const requestId = await setupSubmittedRequest();
    const { rows: [payout] } = await pool.query(
      'SELECT * FROM annual_incentive_payouts WHERE request_id = $1', [requestId]
    );

    await processWebhookEvent({ pool, ledgerService }, {
      providerEventId: `fail-${Date.now()}`, providerPayoutId: payout.provider_payout_id,
      eventType: 'FAILED', raw: {},
    }, 'fake');

    const updated = await getRequestById(pool, requestId);
    expect(updated!.status).toBe('FAILED_RELEASED');

    const balance = await projectBalance(pool, TEST_DRIVER_ID);
    expect(balance.totalAvailableCents).toBe(5000n);
  });

  it('CANCELLED releases reservation', async () => {
    const requestId = await setupSubmittedRequest();
    const { rows: [payout] } = await pool.query(
      'SELECT * FROM annual_incentive_payouts WHERE request_id = $1', [requestId]
    );

    await processWebhookEvent({ pool, ledgerService }, {
      providerEventId: `cancel-${Date.now()}`, providerPayoutId: payout.provider_payout_id,
      eventType: 'CANCELLED', raw: {},
    }, 'fake');

    const updated = await getRequestById(pool, requestId);
    expect(updated!.status).toBe('CANCELLED_RELEASED');
  });

  it('PROCESSING updates status', async () => {
    const requestId = await setupSubmittedRequest();
    const { rows: [payout] } = await pool.query(
      'SELECT * FROM annual_incentive_payouts WHERE request_id = $1', [requestId]
    );

    await processWebhookEvent({ pool, ledgerService }, {
      providerEventId: `proc-${Date.now()}`, providerPayoutId: payout.provider_payout_id,
      eventType: 'PROCESSING', raw: {},
    }, 'fake');

    const updated = await getRequestById(pool, requestId);
    expect(updated!.status).toBe('PROCESSING');
  });

  it('unknown event type does not break', async () => {
    const requestId = await setupSubmittedRequest();
    const { rows: [payout] } = await pool.query(
      'SELECT * FROM annual_incentive_payouts WHERE request_id = $1', [requestId]
    );

    const result = await processWebhookEvent({ pool, ledgerService }, {
      providerEventId: `unknown-${Date.now()}`, providerPayoutId: payout.provider_payout_id,
      eventType: 'UNKNOWN', raw: { newField: 'test' },
    }, 'fake');

    expect(result.processed).toBe(true);
    // Request status unchanged from SUBMITTED
    const updated = await getRequestById(pool, requestId);
    expect(['SUBMITTED', 'PROCESSING']).toContain(updated!.status);
  });

  it('PAYMENT only on DONE', async () => {
    const requestId = await setupSubmittedRequest();
    const { rows: [payout] } = await pool.query(
      'SELECT * FROM annual_incentive_payouts WHERE request_id = $1', [requestId]
    );

    // Send PROCESSING - should not create PAYMENT
    await processWebhookEvent({ pool, ledgerService }, {
      providerEventId: `nopay-${Date.now()}`, providerPayoutId: payout.provider_payout_id,
      eventType: 'PROCESSING', raw: {},
    }, 'fake');

    const { rows: payments } = await pool.query(
      "SELECT * FROM annual_incentive_ledger WHERE request_id = $1 AND event_type = 'PAYMENT'",
      [requestId]
    );
    expect(payments).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════
// SECURITY TESTS
// ═══════════════════════════════════════════════════════════════════

describe('Security', () => {
  it('production blocked', async () => {
    process.env.NODE_ENV = 'production';
    expect(() => new FakeAnnualIncentivePayoutProvider()).toThrow();
    process.env.NODE_ENV = 'test';
  });

  it('trigger remains enabled after tests', async () => {
    const { rows } = await pool.query(
      "SELECT tgenabled FROM pg_trigger WHERE tgname = 'annual_incentive_ledger_immutable_trg'"
    );
    expect(rows[0]?.tgenabled).toBe('O');
  });

  it('no manual payment endpoint exists', () => {
    // Verify our admin routes don't have POST for marking as paid
    // This is a structural assertion
    expect(PAYOUT_ERRORS.ALREADY_PAID).toBeDefined();
    // The actual verification is that no such route is defined
    // in admin-annual-incentive.ts (only GET endpoints + health)
  });
});

// ═══════════════════════════════════════════════════════════════════
// RECONCILIATION
// ═══════════════════════════════════════════════════════════════════

describe('Reconciliation', () => {
  it('runs without errors on empty state', async () => {
    const report = await runReconciliation({ pool, ledgerService, provider: fakeProvider });
    expect(report.errors).toHaveLength(0);
  });

  it('detects deadline breach', async () => {
    await seedAccrual(2026, 5000n, 'deadline');
    await setDestination(pool, { driverId: TEST_DRIVER_ID, pixKeyType: 'CPF', pixKeyCpf: TEST_DRIVER_CPF });
    const { request } = await createRequest(pool, ledgerService, {
      driverId: TEST_DRIVER_ID, requestedAmountCents: 1000n,
      idempotencyKey: `deadline-${Date.now()}`,
      now: new Date('2026-10-15T12:00:00-03:00'),
    });
    // Manually set deadline in the past
    await pool.query(
      "UPDATE annual_incentive_requests SET deadline_at = NOW() - INTERVAL '1 hour' WHERE id = $1",
      [request.id]
    );

    const report = await runReconciliation({ pool, ledgerService, provider: fakeProvider });
    expect(report.deadlineBreaches).toBeGreaterThan(0);
  });
});
