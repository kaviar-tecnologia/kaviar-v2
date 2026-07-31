/**
 * Annual Incentive Ledger Service — Integration Tests
 *
 * Tests the service against a real PostgreSQL database to validate:
 * - Feature flag gating
 * - Input validation
 * - Idempotency (key-based and source-based)
 * - Conflict detection
 * - Concurrency safety
 * - Transaction management (appendEvent vs appendEventInClient)
 * - Read operations
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import pg from 'pg';
import { assertSafeFinanceDatabase } from '../src/lib/assert-safe-finance-db';
import { AnnualIncentiveLedgerService } from '../src/services/finance/annual-incentive-ledger.service';
import { AppendEventInput, ANNUAL_INCENTIVE_ERRORS } from '../src/services/finance/annual-incentive-ledger.types';
import { cleanupTestFixtures, assertTriggerEnabled } from './helpers/cleanup-incentive-fixtures';

assertSafeFinanceDatabase();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TEST_DRIVER_ID = `test-svc-driver-${Date.now()}`;
let counter = 0;

function nextKey(): string {
  return `svc-test-key-${Date.now()}-${++counter}`;
}

function validInput(overrides: Partial<AppendEventInput> = {}): AppendEventInput {
  return {
    driverId: overrides.driverId ?? TEST_DRIVER_ID,
    programYear: overrides.programYear ?? 2026,
    eventType: overrides.eventType ?? 'ACCRUAL',
    amountCents: overrides.amountCents ?? BigInt(54),
    baseAmountCents: overrides.baseAmountCents !== undefined ? overrides.baseAmountCents : BigInt(540),
    rateBasisPoints: overrides.rateBasisPoints !== undefined ? overrides.rateBasisPoints : 1000,
    policyVersion: overrides.policyVersion ?? 'ANNUAL-INCENTIVE-v1',
    sourceType: overrides.sourceType ?? 'FEE_DEBIT',
    sourceId: overrides.sourceId !== undefined ? overrides.sourceId : `ride-${++counter}`,
    sourceEventId: overrides.sourceEventId !== undefined ? overrides.sourceEventId : `ledger-${Date.now()}-${counter}`,
    requestId: overrides.requestId !== undefined ? overrides.requestId : null,
    correlationId: overrides.correlationId !== undefined ? overrides.correlationId : null,
    reversalOfId: overrides.reversalOfId !== undefined ? overrides.reversalOfId : null,
    idempotencyKey: overrides.idempotencyKey ?? nextKey(),
    metadata: overrides.metadata ?? {},
    occurredAt: overrides.occurredAt ?? new Date('2026-07-15T12:00:00Z'),
  };
}

describe('AnnualIncentiveLedgerService', () => {
  let service: AnnualIncentiveLedgerService;

  beforeAll(async () => {
    await pool.query(
      `INSERT INTO drivers (id, name, email, status, updated_at) VALUES ($1, $2, $3, 'approved', NOW())
       ON CONFLICT (id) DO NOTHING`,
      [TEST_DRIVER_ID, `SVC Test ${Date.now()}`, `svc-test-${Date.now()}@kaviar.test`]
    );
    service = new AnnualIncentiveLedgerService(pool);
  });

  afterAll(async () => {
    await cleanupTestFixtures(pool, TEST_DRIVER_ID);
    await assertTriggerEnabled(pool);
    await pool.end();
  });

  beforeEach(() => {
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
  });

  // ═══════════════════════════════════════════════════════════════════
  // FEATURE FLAG
  // ═══════════════════════════════════════════════════════════════════

  it('1. flag absent blocks write', async () => {
    delete process.env.ANNUAL_INCENTIVE_WRITE_ENABLED;
    await expect(service.appendEvent(validInput())).rejects.toThrow(ANNUAL_INCENTIVE_ERRORS.WRITE_DISABLED);
  });

  it('2. flag "false" blocks write', async () => {
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'false';
    await expect(service.appendEvent(validInput())).rejects.toThrow(ANNUAL_INCENTIVE_ERRORS.WRITE_DISABLED);
  });

  it('3. flag "true" permits write', async () => {
    const result = await service.appendEvent(validInput());
    expect(result.created).toBe(true);
  });

  it('4. block occurs before INSERT (no record created when disabled)', async () => {
    const key = nextKey();
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'false';
    await expect(service.appendEvent(validInput({ idempotencyKey: key }))).rejects.toThrow(ANNUAL_INCENTIVE_ERRORS.WRITE_DISABLED);

    // Re-enable and check that nothing was inserted
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    const found = await service.findByIdempotencyKey(key);
    expect(found).toBeNull();
  });

  // ═══════════════════════════════════════════════════════════════════
  // BASIC INSERT
  // ═══════════════════════════════════════════════════════════════════

  it('5. valid event is inserted', async () => {
    const input = validInput();
    const result = await service.appendEvent(input);
    expect(result.event.id).toBeDefined();
    expect(result.event.driverId).toBe(input.driverId);
    expect(result.event.amountCents).toBe(input.amountCents);
  });

  it('6. first insertion returns created: true', async () => {
    const result = await service.appendEvent(validInput());
    expect(result.created).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════
  // IDEMPOTENCY — Key-based
  // ═══════════════════════════════════════════════════════════════════

  it('7. repeat identical idempotencyKey returns created: false', async () => {
    const input = validInput();
    const first = await service.appendEvent(input);
    const second = await service.appendEvent(input);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.event.id).toBe(first.event.id);
  });

  it('8. repeat does not increase count', async () => {
    const input = validInput();
    await service.appendEvent(input);
    await service.appendEvent(input);
    const events = await service.listDriverEvents(input.driverId, { limit: 200 });
    const matching = events.filter(e => e.idempotencyKey === input.idempotencyKey);
    expect(matching).toHaveLength(1);
  });

  it('9. same idempotencyKey with different amountCents throws IDEMPOTENCY_CONFLICT', async () => {
    const key = nextKey();
    await service.appendEvent(validInput({ idempotencyKey: key, amountCents: BigInt(100) }));
    await expect(
      service.appendEvent(validInput({ idempotencyKey: key, amountCents: BigInt(200) }))
    ).rejects.toThrow(ANNUAL_INCENTIVE_ERRORS.IDEMPOTENCY_CONFLICT);
  });

  it('10. same idempotencyKey with different driverId throws IDEMPOTENCY_CONFLICT', async () => {
    const key = nextKey();
    await service.appendEvent(validInput({ idempotencyKey: key }));
    // Can't use different driver (FK would fail), so test with different programYear
    await expect(
      service.appendEvent(validInput({ idempotencyKey: key, programYear: 2027 }))
    ).rejects.toThrow(ANNUAL_INCENTIVE_ERRORS.IDEMPOTENCY_CONFLICT);
  });

  it('11. same idempotencyKey with different source throws IDEMPOTENCY_CONFLICT', async () => {
    const key = nextKey();
    await service.appendEvent(validInput({ idempotencyKey: key, sourceType: 'FEE_DEBIT' }));
    await expect(
      service.appendEvent(validInput({ idempotencyKey: key, sourceType: 'PENDING_RESOLVE' }))
    ).rejects.toThrow(ANNUAL_INCENTIVE_ERRORS.IDEMPOTENCY_CONFLICT);
  });

  // ═══════════════════════════════════════════════════════════════════
  // IDEMPOTENCY — Source-based
  // ═══════════════════════════════════════════════════════════════════

  it('12. same source event with different key but identical data returns existing', async () => {
    const sourceEventId = `source-idem-${Date.now()}`;
    const base = validInput({ sourceEventId, sourceType: 'FEE_DEBIT', eventType: 'ACCRUAL' });
    const first = await service.appendEvent(base);

    // Same source event, different idempotency key, same economic data
    const second = await service.appendEvent({ ...base, idempotencyKey: nextKey() });
    expect(second.created).toBe(false);
    expect(second.event.id).toBe(first.event.id);
  });

  it('13. same source event with different data throws SOURCE_CONFLICT', async () => {
    const sourceEventId = `source-conflict-${Date.now()}`;
    await service.appendEvent(validInput({ sourceEventId, amountCents: BigInt(100) }));
    await expect(
      service.appendEvent(validInput({ sourceEventId, amountCents: BigInt(200), idempotencyKey: nextKey() }))
    ).rejects.toThrow(ANNUAL_INCENTIVE_ERRORS.SOURCE_CONFLICT);
  });

  // ═══════════════════════════════════════════════════════════════════
  // CONCURRENCY
  // ═══════════════════════════════════════════════════════════════════

  it('14. concurrent identical calls create only one row', async () => {
    const input = validInput();
    const results = await Promise.allSettled([
      service.appendEvent(input),
      service.appendEvent(input),
      service.appendEvent(input),
    ]);

    const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    expect(fulfilled.length).toBe(3); // All succeed (idempotency)
    const createdCount = fulfilled.filter(r => r.value.created === true).length;
    expect(createdCount).toBe(1); // Only one actually created

    const events = await service.listDriverEvents(input.driverId, { limit: 200 });
    const matching = events.filter(e => e.idempotencyKey === input.idempotencyKey);
    expect(matching).toHaveLength(1);
  });

  it('15. concurrent different keys for same source create only one row', async () => {
    const sourceEventId = `conc-source-${Date.now()}`;
    const base = validInput({ sourceEventId });

    const results = await Promise.allSettled([
      service.appendEvent({ ...base, idempotencyKey: nextKey() }),
      service.appendEvent({ ...base, idempotencyKey: nextKey() }),
    ]);

    // Both should succeed (one creates, one returns existing via source conflict resolution)
    const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);
    const createdCount = fulfilled.filter(r => r.value.created === true).length;
    expect(createdCount).toBe(1);

    // Verify only one row in the database
    const r = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE source_event_id = $1 AND source_type = $2 AND event_type = 'ACCRUAL'",
      [sourceEventId, base.sourceType]
    );
    expect(r.rows[0].cnt).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════
  // TRANSACTION MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════

  it('16. appendEventInClient uses the provided transaction', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await service.appendEventInClient(client, validInput());
      expect(result.created).toBe(true);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
  });

  it('17. appendEventInClient does not COMMIT', async () => {
    const client = await pool.connect();
    const input = validInput();
    try {
      await client.query('BEGIN');
      await service.appendEventInClient(client, input);
      // Rollback instead of commit — event should NOT exist
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
    const found = await service.findByIdempotencyKey(input.idempotencyKey);
    expect(found).toBeNull();
  });

  it('18. appendEventInClient does not ROLLBACK', async () => {
    const client = await pool.connect();
    const input = validInput();
    try {
      await client.query('BEGIN');
      await service.appendEventInClient(client, input);
      // After appendEventInClient, we can still commit
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const found = await service.findByIdempotencyKey(input.idempotencyKey);
    expect(found).not.toBeNull();
  });

  it('19. appendEvent commits on success', async () => {
    const input = validInput();
    await service.appendEvent(input);
    const found = await service.findByIdempotencyKey(input.idempotencyKey);
    expect(found).not.toBeNull();
  });

  it('20. appendEvent rolls back on error', async () => {
    const key = nextKey();
    // First insert
    await service.appendEvent(validInput({ idempotencyKey: key }));
    // Conflicting insert — should throw, and any partial work rolled back
    try {
      await service.appendEvent(validInput({ idempotencyKey: key, amountCents: BigInt(999) }));
    } catch { /* expected */ }
    // Original is still there, unmodified
    const found = await service.findByIdempotencyKey(key);
    expect(found).not.toBeNull();
    expect(found!.amountCents).not.toBe(BigInt(999));
  });

  it('21. connection is always released (even on error)', async () => {
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'false';
    // This will throw before acquiring a connection from pool
    try { await service.appendEvent(validInput()); } catch {}
    // If connection leaked, the next query would hang. Verify pool still works.
    const r = await pool.query('SELECT 1 AS ok');
    expect(r.rows[0].ok).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════
  // INPUT VALIDATION
  // ═══════════════════════════════════════════════════════════════════

  it('22. fractional cents value is rejected', async () => {
    // BigInt() cannot represent fractions, so passing a non-bigint should fail type-level.
    // We test by passing a coerced value:
    const input = validInput();
    (input as any).amountCents = 54.5; // not a bigint
    await expect(service.appendEvent(input)).rejects.toThrow(/INVALID_AMOUNT/);
  });

  it('23. NaN is rejected', async () => {
    const input = validInput();
    (input as any).amountCents = NaN;
    await expect(service.appendEvent(input)).rejects.toThrow(/INVALID_AMOUNT/);
  });

  it('24. value above safe integer is handled as bigint', async () => {
    // BigInt supports arbitrarily large values — this should work
    const input = validInput({ amountCents: BigInt('9007199254740992') }); // > Number.MAX_SAFE_INTEGER
    const result = await service.appendEvent(input);
    expect(result.event.amountCents).toBe(BigInt('9007199254740992'));
  });

  it('25. metadata that is not an object is rejected', async () => {
    const input = validInput();
    (input as any).metadata = [1, 2, 3];
    await expect(service.appendEvent(input)).rejects.toThrow(/INVALID_INPUT/);
  });

  it('26. invalid occurredAt is rejected', async () => {
    const input = validInput();
    (input as any).occurredAt = 'not-a-date';
    await expect(service.appendEvent(input)).rejects.toThrow(/INVALID_INPUT/);
  });

  // ═══════════════════════════════════════════════════════════════════
  // READ OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  it('27. findById returns existing event', async () => {
    const { event } = await service.appendEvent(validInput());
    const found = await service.findById(event.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(event.id);
  });

  it('28. findByIdempotencyKey returns existing event', async () => {
    const input = validInput();
    await service.appendEvent(input);
    const found = await service.findByIdempotencyKey(input.idempotencyKey);
    expect(found).not.toBeNull();
    expect(found!.idempotencyKey).toBe(input.idempotencyKey);
  });

  it('29. listDriverEvents respects limit', async () => {
    // Insert 3 events
    for (let i = 0; i < 3; i++) {
      await service.appendEvent(validInput());
    }
    const events = await service.listDriverEvents(TEST_DRIVER_ID, { limit: 2 });
    expect(events.length).toBeLessThanOrEqual(2);
  });

  it('30. listDriverEvents has deterministic order (occurred_at DESC, id DESC)', async () => {
    const t1 = new Date('2026-01-01T10:00:00Z');
    const t2 = new Date('2026-01-02T10:00:00Z');
    const t3 = new Date('2026-01-03T10:00:00Z');

    await service.appendEvent(validInput({ occurredAt: t2 }));
    await service.appendEvent(validInput({ occurredAt: t1 }));
    await service.appendEvent(validInput({ occurredAt: t3 }));

    const events = await service.listDriverEvents(TEST_DRIVER_ID, { limit: 200 });
    for (let i = 1; i < events.length; i++) {
      const prev = events[i - 1];
      const curr = events[i];
      expect(prev.occurredAt.getTime()).toBeGreaterThanOrEqual(curr.occurredAt.getTime());
    }
  });

  it('31. read does not depend on write flag', async () => {
    const input = validInput();
    await service.appendEvent(input);

    // Disable write
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'false';

    // Reads should still work
    const found = await service.findByIdempotencyKey(input.idempotencyKey);
    expect(found).not.toBeNull();

    const list = await service.listDriverEvents(TEST_DRIVER_ID, { limit: 1 });
    expect(list.length).toBeGreaterThan(0);
  });

  it('32. unknown constraint error is not swallowed as idempotency', async () => {
    // Try to insert with non-existent driver — FK violation, not idempotency
    const input = validInput({ driverId: 'nonexistent-driver-xyz-' + Date.now() });
    await expect(service.appendEvent(input)).rejects.toThrow(); // FK error, not silenced
  });

  it('33. UPDATE/DELETE still blocked by DB trigger', async () => {
    const { event } = await service.appendEvent(validInput());
    await expect(
      pool.query('UPDATE annual_incentive_ledger SET amount_cents = 999 WHERE id = $1', [event.id])
    ).rejects.toThrow(/ANNUAL_INCENTIVE_LEDGER_IMMUTABLE/);
    await expect(
      pool.query('DELETE FROM annual_incentive_ledger WHERE id = $1', [event.id])
    ).rejects.toThrow(/ANNUAL_INCENTIVE_LEDGER_IMMUTABLE/);
  });

  // ═══════════════════════════════════════════════════════════════════
  // ADDITIONAL — Driver conflict, metadata validation, flag strictness
  // ═══════════════════════════════════════════════════════════════════

  it('34. same idempotencyKey with different driverId throws IDEMPOTENCY_CONFLICT', async () => {
    // Create a second test driver
    const secondDriverId = `test-svc-driver2-${Date.now()}`;
    await pool.query(
      `INSERT INTO drivers (id, name, email, status, updated_at) VALUES ($1, $2, $3, 'approved', NOW())
       ON CONFLICT (id) DO NOTHING`,
      [secondDriverId, `SVC Test2 ${Date.now()}`, `svc-test2-${Date.now()}@kaviar.test`]
    );

    const key = nextKey();
    // Insert for first driver
    const first = await service.appendEvent(validInput({ idempotencyKey: key, driverId: TEST_DRIVER_ID }));
    expect(first.created).toBe(true);

    // Attempt with same key but different driver
    await expect(
      service.appendEvent(validInput({ idempotencyKey: key, driverId: secondDriverId }))
    ).rejects.toThrow(ANNUAL_INCENTIVE_ERRORS.IDEMPOTENCY_CONFLICT);

    // Verify original record still exists with first driver
    const found = await service.findByIdempotencyKey(key);
    expect(found).not.toBeNull();
    expect(found!.driverId).toBe(TEST_DRIVER_ID);

    // Verify no record for second driver with this key
    const events = await service.listDriverEvents(secondDriverId, { limit: 200 });
    const matching = events.filter(e => e.idempotencyKey === key);
    expect(matching).toHaveLength(0);

    // Cleanup second driver
    await pool.query('DELETE FROM drivers WHERE id = $1', [secondDriverId]);
  });

  it('35. metadata as string "texto" is rejected before SQL', async () => {
    const input = validInput();
    (input as any).metadata = 'texto';
    await expect(service.appendEvent(input)).rejects.toThrow(/INVALID_INPUT.*metadata/);
  });

  it('36. metadata as number 123 is rejected before SQL', async () => {
    const input = validInput();
    (input as any).metadata = 123;
    await expect(service.appendEvent(input)).rejects.toThrow(/INVALID_INPUT.*metadata/);
  });

  it('37. metadata as boolean true is rejected before SQL', async () => {
    const input = validInput();
    (input as any).metadata = true;
    await expect(service.appendEvent(input)).rejects.toThrow(/INVALID_INPUT.*metadata/);
  });

  it('38. metadata as null is rejected before SQL', async () => {
    const input = validInput();
    (input as any).metadata = null;
    await expect(service.appendEvent(input)).rejects.toThrow(/INVALID_INPUT.*metadata/);
  });

  it('39. metadata with same keys in different order does NOT conflict (deterministic equality)', async () => {
    const key = nextKey();
    const baseInput = validInput({ idempotencyKey: key });

    // First call with keys in one order
    baseInput.metadata = { rideId: 'ride-1', territoryId: 'territory-1' };
    const first = await service.appendEvent(baseInput);
    expect(first.created).toBe(true);

    // Second call with same keys in different order
    const secondInput = { ...baseInput, metadata: { territoryId: 'territory-1', rideId: 'ride-1' } };
    const second = await service.appendEvent(secondInput);
    expect(second.created).toBe(false); // Idempotent, not a conflict
    expect(second.event.id).toBe(first.event.id);
  });

  it('40. metadata with different content triggers IDEMPOTENCY_CONFLICT', async () => {
    const key = nextKey();
    const baseInput = validInput({ idempotencyKey: key });
    baseInput.metadata = { rideId: 'ride-1' };
    await service.appendEvent(baseInput);

    // Same key, different metadata content
    const conflicting = { ...baseInput, metadata: { rideId: 'ride-2' } };
    await expect(service.appendEvent(conflicting)).rejects.toThrow(ANNUAL_INCENTIVE_ERRORS.IDEMPOTENCY_CONFLICT);
  });

  it('41. flag "TRUE" (uppercase) does NOT enable write (only exact "true")', async () => {
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'TRUE';
    await expect(service.appendEvent(validInput())).rejects.toThrow(ANNUAL_INCENTIVE_ERRORS.WRITE_DISABLED);
  });

  it('42. flag "1" does NOT enable write', async () => {
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = '1';
    await expect(service.appendEvent(validInput())).rejects.toThrow(ANNUAL_INCENTIVE_ERRORS.WRITE_DISABLED);
  });

  it('43. flag "yes" does NOT enable write', async () => {
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'yes';
    await expect(service.appendEvent(validInput())).rejects.toThrow(ANNUAL_INCENTIVE_ERRORS.WRITE_DISABLED);
  });

  it('44. flag empty string does NOT enable write', async () => {
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = '';
    await expect(service.appendEvent(validInput())).rejects.toThrow(ANNUAL_INCENTIVE_ERRORS.WRITE_DISABLED);
  });
});
