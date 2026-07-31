/**
 * Structural Tests: annual_incentive_ledger
 *
 * Tests the database-level constraints, triggers, and behavior of the
 * annual incentive ledger table. Requires a running local PostgreSQL
 * database with the migration applied.
 *
 * These tests use raw SQL via pg Pool to verify PostgreSQL-level behavior
 * that Prisma ORM cannot express (CHECK constraints, triggers, partial indexes).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { assertSafeFinanceDatabase } from '../src/lib/assert-safe-finance-db';
import { cleanupTestFixtures, assertTriggerEnabled } from './helpers/cleanup-incentive-fixtures';

// Safety check before any DB connection
assertSafeFinanceDatabase();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Test driver ID — will be created in beforeAll and cleaned up in afterAll
const TEST_DRIVER_ID = `test-driver-ail-${Date.now()}`;
let insertCounter = 0;

function nextKey(): string {
  return `test-idem-key-${Date.now()}-${++insertCounter}`;
}

function validInsert(overrides: Record<string, any> = {}): { sql: string; params: any[] } {
  const fields = {
    id: overrides.id ?? `test-ail-${Date.now()}-${++insertCounter}`,
    driver_id: overrides.driver_id ?? TEST_DRIVER_ID,
    program_year: overrides.program_year ?? 2026,
    event_type: overrides.event_type ?? 'ACCRUAL',
    amount_cents: overrides.amount_cents ?? 100,
    base_amount_cents: overrides.base_amount_cents ?? 540,
    rate_basis_points: overrides.rate_basis_points ?? 1000,
    policy_version: overrides.policy_version ?? 'ANNUAL-INCENTIVE-v1',
    source_type: overrides.source_type ?? 'FEE_DEBIT',
    source_id: overrides.source_id ?? 'ride-123',
    source_event_id: overrides.source_event_id ?? `event-${Date.now()}-${insertCounter}`,
    request_id: overrides.request_id ?? null,
    correlation_id: overrides.correlation_id ?? null,
    reversal_of_id: overrides.reversal_of_id ?? null,
    idempotency_key: overrides.idempotency_key ?? nextKey(),
    metadata: overrides.metadata ?? '{}',
    occurred_at: overrides.occurred_at ?? new Date().toISOString(),
  };

  const keys = Object.keys(fields);
  const placeholders = keys.map((_, i) => `$${i + 1}`);
  const values = keys.map((k) => (fields as any)[k]);

  return {
    sql: `INSERT INTO annual_incentive_ledger (${keys.map((k) => `"${k}"`).join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING id`,
    params: values,
  };
}

describe('annual_incentive_ledger structural tests', () => {
  beforeAll(async () => {
    // Create a test driver
    await pool.query(
      `INSERT INTO drivers (id, name, email, status, updated_at) VALUES ($1, $2, $3, 'approved', NOW())
       ON CONFLICT (id) DO NOTHING`,
      [TEST_DRIVER_ID, `Test AIL Driver ${Date.now()}`, `test-ail-${Date.now()}@kaviar.test`]
    );
  });

  afterAll(async () => {
    await cleanupTestFixtures(pool, TEST_DRIVER_ID);
    await assertTriggerEnabled(pool);
    await pool.end();
  });

  // ── Test 1: Table exists ──────────────────────────────────────────
  it('1. migration creates the table', async () => {
    const result = await pool.query(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = 'annual_incentive_ledger'"
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].tablename).toBe('annual_incentive_ledger');
  });

  // ── Test 2: Valid ACCRUAL insert ──────────────────────────────────
  it('2. a valid ACCRUAL event can be inserted', async () => {
    const { sql, params } = validInsert();
    const result = await pool.query(sql, params);
    expect(result.rows[0].id).toBeDefined();
  });

  // ── Test 3: amount_cents = 0 rejected ─────────────────────────────
  it('3. amount_cents = 0 is rejected', async () => {
    const { sql, params } = validInsert({ amount_cents: 0 });
    await expect(pool.query(sql, params)).rejects.toThrow(/amount_cents_nonzero/);
  });

  // ── Test 4: base_amount_cents negative rejected ───────────────────
  it('4. base_amount_cents negative is rejected', async () => {
    const { sql, params } = validInsert({ base_amount_cents: -1 });
    await expect(pool.query(sql, params)).rejects.toThrow(/base_amount_cents_nonneg/);
  });

  // ── Test 5: rate_basis_points negative rejected ───────────────────
  it('5. rate_basis_points negative is rejected', async () => {
    const { sql, params } = validInsert({ rate_basis_points: -1 });
    await expect(pool.query(sql, params)).rejects.toThrow(/rate_basis_points_nonneg/);
  });

  // ── Test 6: Invalid year rejected ─────────────────────────────────
  it('6. program_year outside valid range is rejected', async () => {
    const { sql: sql1, params: params1 } = validInsert({ program_year: 2025 });
    await expect(pool.query(sql1, params1)).rejects.toThrow(/program_year_range/);

    const { sql: sql2, params: params2 } = validInsert({ program_year: 2201 });
    await expect(pool.query(sql2, params2)).rejects.toThrow(/program_year_range/);
  });

  // ── Test 7: Duplicate idempotency_key rejected ────────────────────
  it('7. duplicate idempotency_key is rejected', async () => {
    const key = `dup-idem-${Date.now()}`;
    const { sql: sql1, params: params1 } = validInsert({ idempotency_key: key, source_event_id: `ev-a-${Date.now()}` });
    await pool.query(sql1, params1);

    const { sql: sql2, params: params2 } = validInsert({ idempotency_key: key, source_event_id: `ev-b-${Date.now()}` });
    await expect(pool.query(sql2, params2)).rejects.toThrow(/idempotency_key/);
  });

  // ── Test 8: Duplicate source_type + source_event_id + event_type ──
  it('8. same source_type + source_event_id + event_type is rejected', async () => {
    const eventId = `source-dup-${Date.now()}`;
    const { sql: sql1, params: params1 } = validInsert({ source_event_id: eventId, source_type: 'FEE_DEBIT', event_type: 'ACCRUAL' });
    await pool.query(sql1, params1);

    const { sql: sql2, params: params2 } = validInsert({ source_event_id: eventId, source_type: 'FEE_DEBIT', event_type: 'ACCRUAL' });
    await expect(pool.query(sql2, params2)).rejects.toThrow(/source_event_unique/);
  });

  // ── Test 9: Same source_event_id with ACCRUAL + REVERSAL allowed ──
  it('9. same source_event_id can have both ACCRUAL and REVERSAL', async () => {
    const eventId = `source-both-${Date.now()}`;
    const { sql: sql1, params: params1 } = validInsert({
      source_event_id: eventId,
      source_type: 'FEE_DEBIT',
      event_type: 'ACCRUAL',
      id: `accrual-${Date.now()}`,
    });
    const accrualResult = await pool.query(sql1, params1);
    const accrualId = accrualResult.rows[0].id;

    const { sql: sql2, params: params2 } = validInsert({
      source_event_id: eventId,
      source_type: 'FEE_DEBIT',
      event_type: 'REVERSAL',
      reversal_of_id: accrualId,
      amount_cents: -100,
    });
    const reversalResult = await pool.query(sql2, params2);
    expect(reversalResult.rows[0].id).toBeDefined();
  });

  // ── Test 10: REVERSAL without reversal_of_id rejected ─────────────
  it('10. REVERSAL without reversal_of_id is rejected', async () => {
    const { sql, params } = validInsert({ event_type: 'REVERSAL', reversal_of_id: null });
    await expect(pool.query(sql, params)).rejects.toThrow(/reversal_requires_ref/);
  });

  // ── Test 11: ACCRUAL with reversal_of_id rejected ─────────────────
  it('11. ACCRUAL with reversal_of_id is rejected', async () => {
    const { sql: sqlSetup, params: paramsSetup } = validInsert({ id: `setup-rev-${Date.now()}` });
    const setup = await pool.query(sqlSetup, paramsSetup);

    const { sql, params } = validInsert({ event_type: 'ACCRUAL', reversal_of_id: setup.rows[0].id });
    await expect(pool.query(sql, params)).rejects.toThrow(/reversal_requires_ref/);
  });

  // ── Test 12: UPDATE is blocked ────────────────────────────────────
  it('12. UPDATE is blocked by immutability trigger', async () => {
    const { sql, params } = validInsert();
    const inserted = await pool.query(sql, params);
    const id = inserted.rows[0].id;

    await expect(
      pool.query('UPDATE annual_incentive_ledger SET amount_cents = 999 WHERE id = $1', [id])
    ).rejects.toThrow(/ANNUAL_INCENTIVE_LEDGER_IMMUTABLE/);
  });

  // ── Test 13: DELETE is blocked ────────────────────────────────────
  it('13. DELETE is blocked by immutability trigger', async () => {
    const { sql, params } = validInsert();
    const inserted = await pool.query(sql, params);
    const id = inserted.rows[0].id;

    await expect(
      pool.query('DELETE FROM annual_incentive_ledger WHERE id = $1', [id])
    ).rejects.toThrow(/ANNUAL_INCENTIVE_LEDGER_IMMUTABLE/);
  });

  // ── Test 14: Original record intact after failed UPDATE ───────────
  it('14. original record remains intact after attempted UPDATE', async () => {
    const { sql, params } = validInsert({ amount_cents: 250 });
    const inserted = await pool.query(sql, params);
    const id = inserted.rows[0].id;

    try {
      await pool.query('UPDATE annual_incentive_ledger SET amount_cents = 999 WHERE id = $1', [id]);
    } catch { /* expected */ }

    const row = await pool.query('SELECT amount_cents FROM annual_incentive_ledger WHERE id = $1', [id]);
    expect(Number(row.rows[0].amount_cents)).toBe(250);
  });

  // ── Test 15: driver must exist ────────────────────────────────────
  it('15. driver_id must reference an existing driver', async () => {
    const { sql, params } = validInsert({ driver_id: 'nonexistent-driver-xyz' });
    await expect(pool.query(sql, params)).rejects.toThrow(/driver_id_fkey/);
  });

  // ── Test 16: Deleting driver with history is blocked ──────────────
  it('16. deleting a driver with ledger entries is blocked (RESTRICT)', async () => {
    // Insert a ledger entry for the test driver
    const { sql, params } = validInsert();
    await pool.query(sql, params);

    // Attempt to delete the driver
    await expect(
      pool.query('DELETE FROM drivers WHERE id = $1', [TEST_DRIVER_ID])
    ).rejects.toThrow(/driver_id_fkey|violates foreign key/);
  });

  // ── Test 17: 10% stored as 1000 basis points ──────────────────────
  it('17. 10% can be stored as 1000 basis points', async () => {
    const { sql, params } = validInsert({ rate_basis_points: 1000 });
    const inserted = await pool.query(sql, params);
    const id = inserted.rows[0].id;

    const row = await pool.query('SELECT rate_basis_points FROM annual_incentive_ledger WHERE id = $1', [id]);
    expect(row.rows[0].rate_basis_points).toBe(1000);
  });

  // ── Test 18: Different percentages can be stored (versioning) ─────
  it('18. different percentages can be stored (15% = 1500 bp, 5% = 500 bp)', async () => {
    const { sql: sql1, params: params1 } = validInsert({ rate_basis_points: 1500, policy_version: 'ANNUAL-INCENTIVE-v2' });
    const r1 = await pool.query(sql1, params1);

    const { sql: sql2, params: params2 } = validInsert({ rate_basis_points: 500, policy_version: 'ANNUAL-INCENTIVE-v3' });
    const r2 = await pool.query(sql2, params2);

    const row1 = await pool.query('SELECT rate_basis_points, policy_version FROM annual_incentive_ledger WHERE id = $1', [r1.rows[0].id]);
    const row2 = await pool.query('SELECT rate_basis_points, policy_version FROM annual_incentive_ledger WHERE id = $1', [r2.rows[0].id]);

    expect(row1.rows[0].rate_basis_points).toBe(1500);
    expect(row1.rows[0].policy_version).toBe('ANNUAL-INCENTIVE-v2');
    expect(row2.rows[0].rate_basis_points).toBe(500);
    expect(row2.rows[0].policy_version).toBe('ANNUAL-INCENTIVE-v3');
  });

  // ── Test 19: Empty metadata works ─────────────────────────────────
  it('19. empty metadata ({}) is stored correctly', async () => {
    const { sql, params } = validInsert({ metadata: '{}' });
    const inserted = await pool.query(sql, params);
    const id = inserted.rows[0].id;

    const row = await pool.query('SELECT metadata FROM annual_incentive_ledger WHERE id = $1', [id]);
    expect(row.rows[0].metadata).toEqual({});
  });

  // ── Test 20: Timestamps are filled correctly ──────────────────────
  it('20. timestamps are filled correctly', async () => {
    const occurredAt = '2026-06-15T10:30:00.000Z';
    const { sql, params } = validInsert({ occurred_at: occurredAt });
    const inserted = await pool.query(sql, params);
    const id = inserted.rows[0].id;

    const row = await pool.query('SELECT occurred_at, created_at FROM annual_incentive_ledger WHERE id = $1', [id]);
    expect(new Date(row.rows[0].occurred_at).toISOString()).toBe(occurredAt);
    expect(row.rows[0].created_at).toBeDefined();
    // created_at should be recent (within last 10 seconds)
    const createdAt = new Date(row.rows[0].created_at);
    expect(Date.now() - createdAt.getTime()).toBeLessThan(10000);
  });

  // ── Test 21: idempotency_key with only spaces is rejected ─────────
  it('21. idempotency_key with only spaces is rejected', async () => {
    const { sql, params } = validInsert({ idempotency_key: '   ' });
    await expect(pool.query(sql, params)).rejects.toThrow(/idempotency_key_notempty/);
  });

  // ── Test 22: policy_version with only spaces is rejected ──────────
  it('22. policy_version with only spaces is rejected', async () => {
    const { sql, params } = validInsert({ policy_version: '  \t  ' });
    await expect(pool.query(sql, params)).rejects.toThrow(/policy_version_notempty/);
  });

  // ── Test 23: source_type with only spaces is rejected ─────────────
  it('23. source_type with only spaces is rejected', async () => {
    const { sql, params } = validInsert({ source_type: '    ' });
    await expect(pool.query(sql, params)).rejects.toThrow(/source_type_notempty/);
  });

  // ── Test 24: metadata as JSON object is accepted ──────────────────
  it('24. metadata as JSON object is accepted', async () => {
    const { sql, params } = validInsert({ metadata: JSON.stringify({ note: 'test', amount: 123 }) });
    const result = await pool.query(sql, params);
    expect(result.rows[0].id).toBeDefined();
  });

  // ── Test 25: metadata as empty object is accepted ─────────────────
  it('25. metadata as empty object ({}) is accepted', async () => {
    const { sql, params } = validInsert({ metadata: '{}' });
    const result = await pool.query(sql, params);
    expect(result.rows[0].id).toBeDefined();
  });

  // ── Test 26: metadata as JSON array is rejected ───────────────────
  it('26. metadata as JSON array is rejected', async () => {
    const { sql, params } = validInsert({ metadata: '[1, 2, 3]' });
    await expect(pool.query(sql, params)).rejects.toThrow(/metadata_is_object/);
  });

  // ── Test 27: metadata as JSON string is rejected ──────────────────
  it('27. metadata as JSON string is rejected', async () => {
    const { sql, params } = validInsert({ metadata: '"hello"' });
    await expect(pool.query(sql, params)).rejects.toThrow(/metadata_is_object/);
  });

  // ── Test 28: invalid event_type is rejected ───────────────────────
  it('28. invalid event_type is rejected', async () => {
    const { sql, params } = validInsert({ event_type: 'INVALID_EVENT' });
    await expect(pool.query(sql, params)).rejects.toThrow(/event_type_enum/);
  });
});
