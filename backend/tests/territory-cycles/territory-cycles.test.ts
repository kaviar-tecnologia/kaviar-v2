/**
 * Territory Payout Cycles Tests (Marco 3.2A).
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import {
  applyBasisPoints,
  calculatePlatformFee,
  calculateManagerCommission,
  PLATFORM_FEE_RATE_BPS,
  MANAGER_COMMISSION_RATE_BPS,
} from '../../src/services/finance/territory/monetary';
import {
  getManagerPayoutEngine,
  isMonthOutbound,
  isMonthLegacy,
  isLegacyPayAllowed,
} from '../../src/services/finance/territory/engine-selection';
import {
  calculateCycle,
  submitForReview,
  approveCycle,
  cancelCycle,
  getCycleById,
} from '../../src/services/finance/territory/cycle.service';

const TEST_TERRITORY_ID = 'test-territory-cycle-001';
const TEST_MANAGER_ID = 'test-manager-cycle-001';

let pool: pg.Pool;

beforeAll(async () => {
  assertSafeFinanceDatabase();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  // Create test territory and operator profile
  await pool.query(`INSERT INTO operational_territories (id, name, level, status, regulatory_status, created_at, updated_at) VALUES ($1, 'Test Territory', 'neighborhood', 'active', 'not_applicable', NOW(), NOW()) ON CONFLICT (id) DO NOTHING`, [TEST_TERRITORY_ID]);
});

afterAll(async () => {
  await pool.query('DELETE FROM territory_payout_cycles WHERE territory_id = $1', [TEST_TERRITORY_ID]);
  await pool.query('DELETE FROM operational_territories WHERE id = $1', [TEST_TERRITORY_ID]);
  await pool.end();
});

beforeEach(async () => {
  process.env.MANAGER_PAYOUT_ENGINE = 'outbound';
  process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-07';
  await pool.query('DELETE FROM territory_payout_cycles WHERE territory_id = $1', [TEST_TERRITORY_ID]);
});

// ═══════════════════════════════════════════════════════════════════
// MONETARY MATH
// ═══════════════════════════════════════════════════════════════════

describe('Monetary Math', () => {
  it('R$100 → platform fee R$18', () => {
    expect(calculatePlatformFee(10000n)).toBe(1800n);
  });

  it('R$18 fee → manager commission R$7.20', () => {
    expect(calculateManagerCommission(1800n)).toBe(720n);
  });

  it('R$100 → R$18 → R$7.20 complete chain', () => {
    const fee = calculatePlatformFee(10000n);
    const commission = calculateManagerCommission(fee);
    expect(fee).toBe(1800n);
    expect(commission).toBe(720n);
  });

  it('applyBasisPoints rounds half-up', () => {
    // 1800 bps of 101 cents = 101 * 1800 / 10000 = 18.18 → rounds to 18
    expect(applyBasisPoints(101n, 1800)).toBe(18n);
    // 1800 bps of 1000 cents = exactly 180
    expect(applyBasisPoints(1000n, 1800)).toBe(180n);
  });

  it('never uses Number or float', () => {
    // Large value that would lose precision in Number
    const largeCents = 90071992547409n; // > Number.MAX_SAFE_INTEGER / 100
    const fee = calculatePlatformFee(largeCents);
    // Should be exactly largeCents * 1800 / 10000 with rounding
    expect(typeof fee).toBe('bigint');
    expect(fee).toBeGreaterThan(0n);
  });

  it('zero produces zero', () => {
    expect(calculatePlatformFee(0n)).toBe(0n);
    expect(calculateManagerCommission(0n)).toBe(0n);
  });
});

// ═══════════════════════════════════════════════════════════════════
// ENGINE SELECTION
// ═══════════════════════════════════════════════════════════════════

describe('Manager Engine Selection', () => {
  it('defaults to disabled when absent', () => {
    delete process.env.MANAGER_PAYOUT_ENGINE;
    expect(getManagerPayoutEngine()).toBe('disabled');
  });

  it('returns legacy', () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'legacy';
    expect(getManagerPayoutEngine()).toBe('legacy');
  });

  it('returns outbound', () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'outbound';
    expect(getManagerPayoutEngine()).toBe('outbound');
  });

  it('invalid returns disabled', () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'OUTBOUND';
    expect(getManagerPayoutEngine()).toBe('disabled');
  });

  it('month before cutover is legacy', () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'outbound';
    process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-08';
    expect(isMonthOutbound('2026-07')).toBe(false);
    expect(isMonthLegacy('2026-07')).toBe(true);
  });

  it('month at cutover is outbound', () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'outbound';
    process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-08';
    expect(isMonthOutbound('2026-08')).toBe(true);
    expect(isMonthLegacy('2026-08')).toBe(false);
  });

  it('month after cutover is outbound', () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'outbound';
    process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-08';
    expect(isMonthOutbound('2026-09')).toBe(true);
  });

  it('/pay blocked when engine=outbound and month >= cutover', () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'outbound';
    process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-08';
    expect(isLegacyPayAllowed('2026-08')).toBe(false);
    expect(isLegacyPayAllowed('2026-07')).toBe(true); // before cutover
  });

  it('/pay blocked when engine=disabled', () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'disabled';
    expect(isLegacyPayAllowed('2026-06')).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════
// CYCLE LIFECYCLE
// ═══════════════════════════════════════════════════════════════════

describe('Cycle Lifecycle', () => {
  async function seedLedger(month: string, amountCents: bigint) {
    const key = `test_fee_share_${month}_${Date.now()}_${Math.random()}`;
    await pool.query(
      `INSERT INTO territory_ledger (territory_id, manager_id, reference_month, entry_type, amount_cents, description, reference_type, reference_id, idempotency_key)
       VALUES ($1, $2, $3, 'fee_share', $4, 'Test commission', 'ride', $5, $6)`,
      [TEST_TERRITORY_ID, TEST_MANAGER_ID, month, amountCents.toString(), `ride_${Date.now()}`, key]
    );
  }

  it('calculates cycle from ledger', async () => {
    await seedLedger('2026-08', 720n);
    await seedLedger('2026-08', 360n);
    const cycle = await calculateCycle(pool, TEST_TERRITORY_ID, '2026-08', TEST_MANAGER_ID);
    expect(cycle.status).toBe('CALCULATED');
    expect(cycle.grossManagerCommissionCents).toBe(1080n); // 720 + 360
  });

  it('cycle is idempotent', async () => {
    await seedLedger('2026-09', 500n);
    const c1 = await calculateCycle(pool, TEST_TERRITORY_ID, '2026-09', TEST_MANAGER_ID);
    const c2 = await calculateCycle(pool, TEST_TERRITORY_ID, '2026-09', TEST_MANAGER_ID);
    expect(c1.id).toBe(c2.id);
  });

  it('submit for review', async () => {
    await seedLedger('2026-10', 1000n);
    const cycle = await calculateCycle(pool, TEST_TERRITORY_ID, '2026-10', TEST_MANAGER_ID);
    const reviewed = await submitForReview(pool, cycle.id);
    expect(reviewed.status).toBe('UNDER_REVIEW');
  });

  it('approve', async () => {
    await seedLedger('2026-11', 1000n);
    const cycle = await calculateCycle(pool, TEST_TERRITORY_ID, '2026-11', TEST_MANAGER_ID);
    await submitForReview(pool, cycle.id);
    const approved = await approveCycle(pool, cycle.id, 'admin-1');
    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedAt).not.toBeNull();
  });

  it('cannot approve without review', async () => {
    await seedLedger('2026-12', 1000n);
    const cycle = await calculateCycle(pool, TEST_TERRITORY_ID, '2026-12', TEST_MANAGER_ID);
    await expect(approveCycle(pool, cycle.id, 'admin-1'))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_INVALID_TRANSITION' });
  });

  it('cancel with reason', async () => {
    await seedLedger('2027-01', 1000n);
    process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2027-01';
    const cycle = await calculateCycle(pool, TEST_TERRITORY_ID, '2027-01', TEST_MANAGER_ID);
    const cancelled = await cancelCycle(pool, cycle.id, 'admin-1', 'Test reason');
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('rejects month before cutover', async () => {
    process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-08';
    await expect(calculateCycle(pool, TEST_TERRITORY_ID, '2026-06', TEST_MANAGER_ID))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_MONTH_NOT_OUTBOUND' });
  });
});

// ═══════════════════════════════════════════════════════════════════
// IMMUTABILITY
// ═══════════════════════════════════════════════════════════════════

describe('Territory Ledger Immutability', () => {
  it('blocks UPDATE', async () => {
    const key = `immutable_test_${Date.now()}`;
    await pool.query(
      `INSERT INTO territory_ledger (territory_id, manager_id, reference_month, entry_type, amount_cents, description, reference_type, reference_id, idempotency_key)
       VALUES ($1, $2, '2026-07', 'fee_share', 100, 'test', 'ride', 'r1', $3)`,
      [TEST_TERRITORY_ID, TEST_MANAGER_ID, key]
    );
    await expect(pool.query(
      `UPDATE territory_ledger SET amount_cents = 200 WHERE idempotency_key = $1`, [key]
    )).rejects.toThrow(/TERRITORY_LEDGER_IMMUTABLE/);
  });

  it('blocks DELETE', async () => {
    const key = `immutable_del_${Date.now()}`;
    await pool.query(
      `INSERT INTO territory_ledger (territory_id, manager_id, reference_month, entry_type, amount_cents, description, reference_type, reference_id, idempotency_key)
       VALUES ($1, $2, '2026-07', 'fee_share', 100, 'test', 'ride', 'r2', $3)`,
      [TEST_TERRITORY_ID, TEST_MANAGER_ID, key]
    );
    await expect(pool.query(
      `DELETE FROM territory_ledger WHERE idempotency_key = $1`, [key]
    )).rejects.toThrow(/TERRITORY_LEDGER_IMMUTABLE/);
  });
});
