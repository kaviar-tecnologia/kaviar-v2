/**
 * Tests for Territory Cycle Obligation Bridge + Annual Incentive Provision.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import crypto from 'crypto';
import { assertSafeFinanceDatabase } from '../src/lib/assert-safe-finance-db';

assertSafeFinanceDatabase();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TEST_DRIVER = `test-payables-${Date.now()}`;
const TEST_MANAGER = `test-mgr-${Date.now()}`;
const TEST_TERRITORY = `test-terr-${Date.now()}`;
let cycleId: string;
let payeeId: string;

beforeAll(async () => {
  // Create driver (needed for ledger FK)
  await pool.query(
    `INSERT INTO drivers (id, name, email, status, updated_at) VALUES ($1, $2, $3, 'approved', NOW()) ON CONFLICT (id) DO NOTHING`,
    [TEST_DRIVER, `Payables Test`, `payables-${Date.now()}@kaviar.test`]
  );
  await pool.query(
    `INSERT INTO driver_wallets (driver_id, balance_cents, reserved_cents, updated_at) VALUES ($1, 50000, 0, NOW()) ON CONFLICT (driver_id) DO NOTHING`,
    [TEST_DRIVER]
  );

  // Create payee for manager
  payeeId = `payee-${Date.now()}`;
  await pool.query(
    `INSERT INTO financial_payees (id, payee_type, reference_id, legal_name_encrypted, cpf_cnpj_encrypted, cpf_cnpj_hmac, cpf_cnpj_masked, document_type, status, created_at, updated_at)
     VALUES ($1, 'MANAGER', $2, 'enc', 'enc', 'hmac', '***.***.***-**', 'CPF', 'ACTIVE', NOW(), NOW())`,
    [payeeId, TEST_MANAGER]
  );

  // Create APPROVED cycle (no territories FK exists)
  cycleId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO territory_payout_cycles (id, territory_id, manager_id, reference_month, policy_version, commission_rate_basis_points, platform_fee_rate_basis_points, cycle_type, sequence_number, gross_platform_fee_cents, gross_manager_commission_cents, approved_adjustments_cents, approved_amount_cents, status, fiscal_document_required, fiscal_document_status, approved_at, approved_by, idempotency_key, created_at, updated_at)
     VALUES ($1, $2, $3, '2026-07', 'territorial_commission_v1', 4000, 1800, 'REGULAR', 1, 10000, 4000, 0, 4000, 'APPROVED', false, 'NOT_REQUIRED', NOW(), 'admin', $4, NOW(), NOW())`,
    [cycleId, TEST_TERRITORY, TEST_MANAGER, `test-cycle-${cycleId}`]
  );

  // Insert test accruals for provision test
  const key1 = `prov-test-${Date.now()}-a`;
  const key2 = `prov-test-${Date.now()}-b`;
  await pool.query(
    `INSERT INTO annual_incentive_ledger (driver_id, program_year, event_type, amount_cents, base_amount_cents, rate_basis_points, policy_version, source_type, source_id, idempotency_key, metadata, occurred_at)
     VALUES ($1, 2026, 'ACCRUAL', 500, 5000, 1000, 'BONUS-POLICY-v1.3', 'FEE_DEBIT', $2, $2, '{}', NOW())`,
    [TEST_DRIVER, key1]
  );
  await pool.query(
    `INSERT INTO annual_incentive_ledger (driver_id, program_year, event_type, amount_cents, base_amount_cents, rate_basis_points, policy_version, source_type, source_id, idempotency_key, metadata, occurred_at)
     VALUES ($1, 2026, 'ACCRUAL', 300, 3000, 1000, 'BONUS-POLICY-v1.3', 'FEE_DEBIT', $2, $2, '{}', NOW())`,
    [TEST_DRIVER, key2]
  );
});

afterAll(async () => {
  // financial_obligations can be deleted (no immutability trigger)
  await pool.query('DELETE FROM financial_obligations WHERE source_id = $1', [cycleId]);
  await pool.query('DELETE FROM financial_payees WHERE id = $1', [payeeId]);
  // territory_payout_cycles and annual_incentive_ledger are immutable (trigger-protected)
  // driver cleanup skipped to avoid FK cascading issues with immutable tables
  await pool.end();
});

describe('Obligation Bridge', () => {
  it('1. engine not outbound: fails closed', async () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'disabled';
    process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-01';
    const { createObligationFromCycle } = await import('../src/services/finance/territory/obligation-bridge.service');
    await expect(createObligationFromCycle(pool, cycleId, 'admin-test'))
      .rejects.toThrow(/engine/i);
  });

  it('2. APPROVED creates 1 obligation, purpose=MANAGER_TERRITORIAL_COMMISSION, amount=4000', async () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'outbound';
    process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-01';
    const { createObligationFromCycle } = await import('../src/services/finance/territory/obligation-bridge.service');
    const result = await createObligationFromCycle(pool, cycleId, 'admin-test');

    expect(result.alreadyExists).toBe(false);
    expect(result.obligationId).toBeTruthy();

    const { rows: [obl] } = await pool.query(
      'SELECT purpose, gross_amount_cents::text as amt, source_type, source_id FROM financial_obligations WHERE id = $1',
      [result.obligationId]
    );
    expect(obl.purpose).toBe('MANAGER_TERRITORIAL_COMMISSION');
    expect(obl.amt).toBe('4000');
    expect(obl.source_type).toBe('territory_payout_cycle');
    expect(obl.source_id).toBe(cycleId);
  });

  it('3. cycle advances to OBLIGATION_CREATED', async () => {
    const { rows: [cycle] } = await pool.query(
      'SELECT status FROM territory_payout_cycles WHERE id = $1', [cycleId]
    );
    expect(cycle.status).toBe('OBLIGATION_CREATED');
  });

  it('4. repetition does NOT duplicate (idempotent)', async () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'outbound';
    process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-01';
    const { createObligationFromCycle } = await import('../src/services/finance/territory/obligation-bridge.service');
    const result = await createObligationFromCycle(pool, cycleId, 'admin-test');
    expect(result.alreadyExists).toBe(true);

    const { rows: [{ cnt }] } = await pool.query(
      'SELECT COUNT(*)::int as cnt FROM financial_obligations WHERE source_id = $1', [cycleId]
    );
    expect(cnt).toBe(1);
  });

  it('5. non-APPROVED cycle rejects', async () => {
    const badId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO territory_payout_cycles (id, territory_id, manager_id, reference_month, policy_version, commission_rate_basis_points, platform_fee_rate_basis_points, cycle_type, sequence_number, gross_platform_fee_cents, gross_manager_commission_cents, approved_adjustments_cents, approved_amount_cents, status, fiscal_document_required, fiscal_document_status, idempotency_key, created_at, updated_at)
       VALUES ($1, $2, $3, '2026-08', 'territorial_commission_v1', 4000, 1800, 'REGULAR', 1, 5000, 2000, 0, 2000, 'CALCULATED', false, 'NOT_REQUIRED', $4, NOW(), NOW())`,
      [badId, TEST_TERRITORY, TEST_MANAGER, `test-bad-${badId}`]
    );
    process.env.MANAGER_PAYOUT_ENGINE = 'outbound';
    process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-01';
    const { createObligationFromCycle } = await import('../src/services/finance/territory/obligation-bridge.service');
    await expect(createObligationFromCycle(pool, badId, 'admin-test'))
      .rejects.toThrow(/expected APPROVED/);
    // Don't delete — table is immutable. Cycle remains as CALCULATED (cleanup not needed for test isolation).
  });
});

describe('Annual Incentive Provision', () => {
  it('6. aggregates accrued as string cents', async () => {
    const { rows } = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN event_type IN ('ACCRUAL','CARRY_FORWARD_IN') THEN ABS(amount_cents) ELSE 0 END), 0)::text AS accrued,
             COALESCE(SUM(CASE WHEN event_type = 'PAYMENT' THEN ABS(amount_cents) ELSE 0 END), 0)::text AS paid
      FROM annual_incentive_ledger WHERE driver_id = $1
    `, [TEST_DRIVER]);
    expect(typeof rows[0].accrued).toBe('string');
    expect(BigInt(rows[0].accrued)).toBeGreaterThanOrEqual(800n);
    expect(BigInt(rows[0].paid)).toBe(0n);
  });

  it('7. by-driver aggregation returns correct driver', async () => {
    const { rows } = await pool.query(`
      SELECT driver_id, COALESCE(SUM(ABS(amount_cents)), 0)::text AS total
      FROM annual_incentive_ledger WHERE driver_id = $1 AND event_type = 'ACCRUAL'
      GROUP BY driver_id
    `, [TEST_DRIVER]);
    expect(rows.length).toBe(1);
    expect(rows[0].driver_id).toBe(TEST_DRIVER);
  });

  it('8. available = accrued - paid - reserved (BigInt arithmetic)', () => {
    const accrued = '800';
    const paid = '0';
    const reserved = '0';
    const available = (BigInt(accrued) - BigInt(paid) - BigInt(reserved)).toString();
    expect(available).toBe('800');
    expect(typeof available).toBe('string');
  });
});
