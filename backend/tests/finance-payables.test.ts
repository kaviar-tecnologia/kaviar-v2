/**
 * Tests for Territory Cycle Obligation Bridge + Annual Incentive Provision.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import crypto from 'crypto';
import { assertSafeFinanceDatabase } from '../src/lib/assert-safe-finance-db';
import { projectFromAggregateRows } from '../src/services/finance/annual-incentive-payout/balance-projection';

assertSafeFinanceDatabase();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TEST_DRIVER = `test-payables-${Date.now()}`;
const TEST_MANAGER = `test-mgr-${Date.now()}`;
const TEST_TERRITORY = `test-terr-${Date.now()}`;
let cycleId: string;
let payeeId: string;

beforeAll(async () => {
  await pool.query(
    `INSERT INTO drivers (id, name, email, status, updated_at) VALUES ($1, $2, $3, 'approved', NOW()) ON CONFLICT (id) DO NOTHING`,
    [TEST_DRIVER, `Payables Test`, `payables-${Date.now()}@kaviar.test`]
  );
  await pool.query(
    `INSERT INTO driver_wallets (driver_id, balance_cents, reserved_cents, updated_at) VALUES ($1, 50000, 0, NOW()) ON CONFLICT (driver_id) DO NOTHING`,
    [TEST_DRIVER]
  );

  payeeId = `payee-${Date.now()}`;
  await pool.query(
    `INSERT INTO financial_payees (id, payee_type, reference_id, legal_name_encrypted, cpf_cnpj_encrypted, cpf_cnpj_hmac, cpf_cnpj_masked, document_type, status, created_at, updated_at)
     VALUES ($1, 'MANAGER', $2, 'enc', 'enc', 'hmac', '***.***.***-**', 'CPF', 'ACTIVE', NOW(), NOW())`,
    [payeeId, TEST_MANAGER]
  );

  cycleId = crypto.randomUUID();
  await pool.query(
    `INSERT INTO territory_payout_cycles (id, territory_id, manager_id, reference_month, policy_version, commission_rate_basis_points, platform_fee_rate_basis_points, cycle_type, sequence_number, gross_platform_fee_cents, gross_manager_commission_cents, approved_adjustments_cents, approved_amount_cents, status, fiscal_document_required, fiscal_document_status, approved_at, approved_by, idempotency_key, created_at, updated_at)
     VALUES ($1, $2, $3, '2026-07', 'territorial_commission_v1', 4000, 1800, 'REGULAR', 1, 10000, 4000, 0, 4000, 'APPROVED', false, 'NOT_REQUIRED', NOW(), 'admin', $4, NOW(), NOW())`,
    [cycleId, TEST_TERRITORY, TEST_MANAGER, `test-cycle-${cycleId}`]
  );

  // Ledger events for provision test: ACCRUAL 10000, REQUEST_RESERVATION 10000, PAYMENT 10000
  const k1 = `prov-${Date.now()}-accrual`;
  const k2 = `prov-${Date.now()}-reservation`;
  const k3 = `prov-${Date.now()}-payment`;
  await pool.query(
    `INSERT INTO annual_incentive_ledger (driver_id, program_year, event_type, amount_cents, base_amount_cents, rate_basis_points, policy_version, source_type, source_id, idempotency_key, metadata, occurred_at)
     VALUES ($1, 2026, 'ACCRUAL', 10000, 100000, 1000, 'v1.3', 'FEE_DEBIT', $2, $2, '{}', NOW())`,
    [TEST_DRIVER, k1]
  );
  await pool.query(
    `INSERT INTO annual_incentive_ledger (driver_id, program_year, event_type, amount_cents, base_amount_cents, rate_basis_points, policy_version, source_type, source_id, request_id, idempotency_key, metadata, occurred_at)
     VALUES ($1, 2026, 'REQUEST_RESERVATION', 10000, NULL, NULL, 'v1.3', 'REQUEST', $2, $2, $2, '{}', NOW())`,
    [TEST_DRIVER, k2]
  );
  await pool.query(
    `INSERT INTO annual_incentive_ledger (driver_id, program_year, event_type, amount_cents, base_amount_cents, rate_basis_points, policy_version, source_type, source_id, request_id, idempotency_key, metadata, occurred_at)
     VALUES ($1, 2026, 'PAYMENT', 10000, NULL, NULL, 'v1.3', 'REQUEST', $2, $2, $2, '{}', NOW())`,
    [TEST_DRIVER, k3]
  );
});

afterAll(async () => {
  await pool.query('DELETE FROM financial_payout_outbox WHERE obligation_id IN (SELECT id FROM financial_obligations WHERE source_id = $1)', [cycleId]);
  await pool.query('DELETE FROM financial_obligations WHERE source_id = $1', [cycleId]);
  await pool.query('DELETE FROM financial_payees WHERE id = $1', [payeeId]);
  await pool.end();
});

// ═══════════════════════════════════════════════════════════════════════════
// PROVISION TESTS
// ═══════════════════════════════════════════════════════════════════════════
describe('Provision — canonical projection', () => {
  it('1. ACCRUAL 10000 + RESERVATION 10000 + PAYMENT 10000 → reserved=0, available=0, paid=10000', () => {
    // Use the SAME canonical function the endpoint uses
    const rows = [
      { program_year: 2026, event_type: 'ACCRUAL', total_cents: '10000' },
      { program_year: 2026, event_type: 'REQUEST_RESERVATION', total_cents: '10000' },
      { program_year: 2026, event_type: 'PAYMENT', total_cents: '10000' },
    ];
    const projection = projectFromAggregateRows(TEST_DRIVER, rows);

    // openReserved = reserved - released - paid = 10000 - 0 - 10000 = 0
    expect(projection.totalOpenReservedCents).toBe(0n);
    // available = accrued - reversed - paid - openReserved = 10000 - 0 - 10000 - 0 = 0
    expect(projection.totalAvailableCents).toBe(0n);
    // paid = 10000
    expect(projection.totalPaidCents).toBe(10000n);
  });

  it('2. ACCRUAL only → full amount available, zero reserved', () => {
    const rows = [{ program_year: 2026, event_type: 'ACCRUAL', total_cents: '5000' }];
    const projection = projectFromAggregateRows('driver-x', rows);
    expect(projection.totalAvailableCents).toBe(5000n);
    expect(projection.totalOpenReservedCents).toBe(0n);
    expect(projection.totalPaidCents).toBe(0n);
  });

  it('3. RESERVATION without PAYMENT → reserved > 0, available reduced', () => {
    const rows = [
      { program_year: 2026, event_type: 'ACCRUAL', total_cents: '8000' },
      { program_year: 2026, event_type: 'REQUEST_RESERVATION', total_cents: '3000' },
    ];
    const projection = projectFromAggregateRows('driver-y', rows);
    expect(projection.totalOpenReservedCents).toBe(3000n);
    expect(projection.totalAvailableCents).toBe(5000n);
  });

  it('4. values are BigInt (string-safe), not Number', () => {
    const rows = [{ program_year: 2026, event_type: 'ACCRUAL', total_cents: '99999999999' }];
    const projection = projectFromAggregateRows('driver-z', rows);
    expect(typeof projection.totalAvailableCents).toBe('bigint');
    expect(projection.totalAvailableCents.toString()).toBe('99999999999');
  });

  it('5. endpoint data matches canonical projection (integration)', async () => {
    // Fetch what the endpoint would fetch
    const { rows } = await pool.query<{ driver_id: string; program_year: number; event_type: string; total_cents: string }>(
      `SELECT driver_id, program_year, event_type, SUM(ABS(amount_cents))::text AS total_cents
       FROM annual_incentive_ledger WHERE driver_id = $1
       GROUP BY driver_id, program_year, event_type`,
      [TEST_DRIVER]
    );
    const driverRows = rows.map(r => ({ program_year: r.program_year, event_type: r.event_type, total_cents: r.total_cents }));
    const projection = projectFromAggregateRows(TEST_DRIVER, driverRows);

    // After ACCRUAL 10000 + RESERVATION 10000 + PAYMENT 10000:
    expect(projection.totalOpenReservedCents).toBe(0n); // reservation consumed by payment
    expect(projection.totalAvailableCents).toBe(0n);
    expect(projection.totalPaidCents).toBe(10000n);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// OBLIGATION BRIDGE TESTS
// ═══════════════════════════════════════════════════════════════════════════
describe('Obligation Bridge', () => {
  it('6. engine not outbound: fails closed', async () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'disabled';
    process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-01';
    const { createObligationFromCycle } = await import('../src/services/finance/territory/obligation-bridge.service');
    await expect(createObligationFromCycle(pool, cycleId, 'admin-test')).rejects.toThrow(/engine/i);
  });

  it('7. APPROVED creates obligation + outbox (1:1)', async () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'outbound';
    process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-01';
    const { createObligationFromCycle } = await import('../src/services/finance/territory/obligation-bridge.service');
    const result = await createObligationFromCycle(pool, cycleId, 'admin-test');

    expect(result.alreadyExists).toBe(false);
    expect(result.obligationId).toBeTruthy();

    // Verify obligation
    const { rows: [obl] } = await pool.query(
      'SELECT purpose, gross_amount_cents::text as amt, source_type FROM financial_obligations WHERE id = $1',
      [result.obligationId]
    );
    expect(obl.purpose).toBe('MANAGER_TERRITORIAL_COMMISSION');
    expect(obl.amt).toBe('4000');
    expect(obl.source_type).toBe('territory_payout_cycle');

    // Verify outbox
    const { rows: [outbox] } = await pool.query(
      'SELECT obligation_id, purpose, status FROM financial_payout_outbox WHERE obligation_id = $1',
      [result.obligationId]
    );
    expect(outbox).toBeDefined();
    expect(outbox.purpose).toBe('MANAGER_TERRITORIAL_COMMISSION');
    expect(outbox.status).toBe('PENDING');
  });

  it('8. cycle status = OBLIGATION_CREATED', async () => {
    const { rows: [cycle] } = await pool.query('SELECT status FROM territory_payout_cycles WHERE id = $1', [cycleId]);
    expect(cycle.status).toBe('OBLIGATION_CREATED');
  });

  it('9. retry does NOT duplicate obligation or outbox', async () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'outbound';
    process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-01';
    const { createObligationFromCycle } = await import('../src/services/finance/territory/obligation-bridge.service');
    const result = await createObligationFromCycle(pool, cycleId, 'admin-test');
    expect(result.alreadyExists).toBe(true);
    expect(result.obligationId).toBeTruthy();

    const { rows: [{ obl_cnt }] } = await pool.query(
      'SELECT COUNT(*)::int as obl_cnt FROM financial_obligations WHERE source_id = $1', [cycleId]
    );
    expect(obl_cnt).toBe(1);

    const { rows: [{ out_cnt }] } = await pool.query(
      `SELECT COUNT(*)::int as out_cnt FROM financial_payout_outbox WHERE obligation_id IN (SELECT id FROM financial_obligations WHERE source_id = $1)`, [cycleId]
    );
    expect(out_cnt).toBe(1);
  });

  it('10. non-APPROVED cycle rejects', async () => {
    const badId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO territory_payout_cycles (id, territory_id, manager_id, reference_month, policy_version, commission_rate_basis_points, platform_fee_rate_basis_points, cycle_type, sequence_number, gross_platform_fee_cents, gross_manager_commission_cents, approved_adjustments_cents, approved_amount_cents, status, fiscal_document_required, fiscal_document_status, idempotency_key, created_at, updated_at)
       VALUES ($1, $2, $3, '2026-08', 'territorial_commission_v1', 4000, 1800, 'REGULAR', 1, 5000, 2000, 0, 2000, 'CALCULATED', false, 'NOT_REQUIRED', $4, NOW(), NOW())`,
      [badId, TEST_TERRITORY, TEST_MANAGER, `bad-${badId}`]
    );
    process.env.MANAGER_PAYOUT_ENGINE = 'outbound';
    process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-01';
    const { createObligationFromCycle } = await import('../src/services/finance/territory/obligation-bridge.service');
    await expect(createObligationFromCycle(pool, badId, 'admin-test')).rejects.toThrow(/expected APPROVED/);
  });
});
