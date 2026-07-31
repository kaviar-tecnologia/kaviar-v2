/**
 * Territory Payout Cycles — Immutability Integration Tests (Commit 6C)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { confirmRegularCycle, confirmSupplementalCycle, submitForReview, approveCycle, cancelCycle } from '../../src/services/finance/territory/cycle.service';
import { referenceMonthFromDate } from '../../src/services/wallet-v2/fee-split.service';
import { WalletService } from '../../src/services/wallet-v2/wallet.service';
import { WalletSettlementService } from '../../src/services/wallet-v2/wallet-settlement.service';
import { FeeSplitService } from '../../src/services/wallet-v2/fee-split.service';
import { TerritoryLedgerService } from '../../src/services/wallet-v2/territory-ledger.service';
import { PendingDebitService } from '../../src/services/wallet-v2/pending-debit.service';
import { applyBasisPoints, PLATFORM_FEE_RATE_BPS } from '../../src/services/finance/territory/monetary';

const RUN = randomUUID().slice(0, 8);
const CURRENT_MONTH = referenceMonthFromDate(new Date());
let pool: pg.Pool;

beforeAll(async () => {
  assertSafeFinanceDatabase();
  process.env.MANAGER_PAYOUT_ENGINE = 'outbound';
  process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-01';
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
});
afterAll(async () => { await pool.end(); });

async function setupFull(balance = 50000n) {
  const did = `drv-imm-${RUN}-${randomUUID().slice(0,4)}`;
  const tid = `ter-imm-${RUN}-${randomUUID().slice(0,4)}`;
  const mid = `mgr-imm-${RUN}-${randomUUID().slice(0,4)}`;
  await pool.query(`INSERT INTO drivers (id,name,email,phone,document_cpf,status,created_at,updated_at) VALUES ($1,'T',$2,'1','0','active',NOW(),NOW()) ON CONFLICT DO NOTHING`, [did, `${did}@t`]);
  await pool.query(`INSERT INTO driver_wallets (driver_id,balance_cents,reserved_cents,updated_at) VALUES ($1,$2,0,NOW()) ON CONFLICT (driver_id) DO UPDATE SET balance_cents=$2,reserved_cents=0`, [did, balance.toString()]);
  await pool.query(`INSERT INTO operational_territories (id,name,level,status,regulatory_status,created_at,updated_at) VALUES ($1,'T','neighborhood','active','not_applicable',NOW(),NOW()) ON CONFLICT DO NOTHING`, [tid]);
  await pool.query(`INSERT INTO admins (id,name,email,phone,password,role,created_at,updated_at) VALUES ($1,'M',$2,'1','h','regional_manager',NOW(),NOW()) ON CONFLICT DO NOTHING`, [mid, `${mid}@t`]);
  await pool.query(`INSERT INTO territory_manager_assignments (territory_id,admin_id,status,started_at,created_by,updated_at) VALUES ($1,$2,'active',NOW()-INTERVAL '30 days',$2,NOW())`, [tid, mid]);
  await pool.query(`INSERT INTO operator_profiles (id,admin_id,territory_id,is_active,recipient_type,display_name,relationship_type,created_at,updated_at) VALUES ($1,$2,$3,true,'individual','Test','territorial_operator',NOW(),NOW()) ON CONFLICT DO NOTHING`, [`op-${mid}`, mid, tid]);
  return { driverId: did, territoryId: tid, managerId: mid };
}

async function settle(driverId: string, territoryId: string, rideId: string, price = 10000n) {
  const w = new WalletService(pool); const f = new FeeSplitService(pool);
  const l = new TerritoryLedgerService(pool); const p = new PendingDebitService(pool);
  const svc = new WalletSettlementService(pool, w, f, l, p, w);
  const fee = applyBasisPoints(price, PLATFORM_FEE_RATE_BPS);
  await svc.handleReserve(rideId, driverId, fee);
  return svc.settleRide({ rideId, driverId, finalPriceCents: price, reservedCents: fee, territoryId });
}

// Helper to create a cycle for testing
async function createTestCycle() {
  const { driverId, territoryId, managerId } = await setupFull();
  await settle(driverId, territoryId, `ride-imm-${RUN}-${randomUUID().slice(0,4)}`);
  const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
  return { cycle, driverId, territoryId, managerId };
}

describe('Trigger Presence', () => {
  it('UPDATE, DELETE, and TRUNCATE triggers exist and are enabled', async () => {
    const { rows } = await pool.query(
      `SELECT tgname, tgenabled FROM pg_trigger
       WHERE tgrelid = 'territory_payout_cycles'::regclass
       AND tgname LIKE 'territory_payout_cycles_%'
       ORDER BY tgname`);
    const names = rows.map((r: any) => r.tgname);
    expect(names).toContain('territory_payout_cycles_immutable_snapshot_trg');
    expect(names).toContain('territory_payout_cycles_delete_forbidden_trg');
    expect(names).toContain('territory_payout_cycles_truncate_forbidden_trg');
    for (const r of rows) {
      expect(r.tgenabled).toBe('O'); // Origin-enabled
    }
  });
});

describe('INSERT Allowed', () => {
  it('confirmRegularCycle still creates cycle normally', async () => {
    const { cycle } = await createTestCycle();
    expect(cycle.status).toBe('CALCULATED');
    expect(cycle.grossManagerCommissionCents).toBeGreaterThan(0n);
  });
});

describe('Immutable Fields', () => {
  const IMMUTABLE_FIELDS = [
    ['territory_id', "'TAMPERED'"],
    ['manager_id', "'TAMPERED'"],
    ['reference_month', "'2099-01'"],
    ['policy_version', "'tampered_v2'"],
    ['commission_rate_basis_points', '9999'],
    ['platform_fee_rate_basis_points', '9999'],
    ['competence_timezone', "'UTC'"],
    ['cycle_type', "'SUPPLEMENTAL'"],
    ['parent_cycle_id', "'fake-parent'"],
    ['sequence_number', '99'],
    ['gross_platform_fee_cents', '999999'],
    ['gross_manager_commission_cents', '999999'],
    ['approved_adjustments_cents', '999999'],
    ['approved_amount_cents', '999999'],
    ['fiscal_document_required', 'NOT fiscal_document_required'],
    ['calculated_at', 'NOW() + INTERVAL \'1 day\''],
    ['recognized_at', 'NOW() + INTERVAL \'1 day\''],
    ['created_at', 'NOW() + INTERVAL \'1 day\''],
    ['idempotency_key', "'tampered-key'"],
  ];

  let cycleId: string;

  beforeAll(async () => {
    const { cycle } = await createTestCycle();
    cycleId = cycle.id;
  });

  for (const [field, value] of IMMUTABLE_FIELDS) {
    it(`rejects modification of ${field}`, async () => {
      await expect(
        pool.query(`UPDATE territory_payout_cycles SET ${field}=${value} WHERE id=$1`, [cycleId])
      ).rejects.toMatchObject({ code: 'P0001' });
      // Verify message contains the expected identifier
      try {
        await pool.query(`UPDATE territory_payout_cycles SET ${field}=${value} WHERE id=$1`, [cycleId]);
      } catch (err: any) {
        expect(err.message).toContain('TERRITORY_PAYOUT_CYCLE_FINANCIAL_SNAPSHOT_IMMUTABLE');
      }
    });
  }

  it('mixed update with immutable + mutable is rejected atomically', async () => {
    const { rows: [before] } = await pool.query(
      'SELECT status, gross_manager_commission_cents, updated_at FROM territory_payout_cycles WHERE id=$1', [cycleId]);
    await expect(
      pool.query(`UPDATE territory_payout_cycles SET status='UNDER_REVIEW', gross_manager_commission_cents=999999 WHERE id=$1`, [cycleId])
    ).rejects.toMatchObject({ code: 'P0001' });
    const { rows: [after] } = await pool.query(
      'SELECT status, gross_manager_commission_cents, updated_at FROM territory_payout_cycles WHERE id=$1', [cycleId]);
    expect(after.status).toBe(before.status);
    expect(after.gross_manager_commission_cents).toBe(before.gross_manager_commission_cents);
    expect(after.updated_at.getTime()).toBe(before.updated_at.getTime());
  });
});

describe('Mutable Fields', () => {
  it('allows updating administrative and fiscal fields', async () => {
    const { cycle } = await createTestCycle();
    // Update all mutable fields
    await pool.query(
      `UPDATE territory_payout_cycles SET
        status='UNDER_REVIEW', fiscal_document_type='NFSe',
        fiscal_document_status='PENDING', fiscal_document_reference='REF-123',
        fiscal_document_url='https://example.com/nfse', submitted_for_review_at=NOW(),
        approved_at=NOW(), approved_by='test-admin',
        cancelled_at=NOW(), cancelled_by='test-admin', cancel_reason='testing mutable',
        updated_at=NOW()
       WHERE id=$1`, [cycle.id]);
    // Verify financial fields unchanged
    const { rows: [row] } = await pool.query(
      `SELECT gross_platform_fee_cents, gross_manager_commission_cents, approved_amount_cents,
              commission_rate_basis_points, platform_fee_rate_basis_points
       FROM territory_payout_cycles WHERE id=$1`, [cycle.id]);
    expect(BigInt(row.gross_platform_fee_cents)).toBe(cycle.grossPlatformFeeCents);
    expect(BigInt(row.gross_manager_commission_cents)).toBe(cycle.grossManagerCommissionCents);
    expect(BigInt(row.approved_amount_cents)).toBe(cycle.approvedAmountCents);
    expect(row.commission_rate_basis_points).toBe(cycle.commissionRateBasisPoints);
    expect(row.platform_fee_rate_basis_points).toBe(cycle.platformFeeRateBasisPoints);
  });
});

describe('DELETE Forbidden', () => {
  it('single row delete is blocked', async () => {
    const { cycle } = await createTestCycle();
    await expect(
      pool.query('DELETE FROM territory_payout_cycles WHERE id=$1', [cycle.id])
    ).rejects.toMatchObject({ code: 'P0001' });
    // Row still exists
    const { rows } = await pool.query('SELECT id FROM territory_payout_cycles WHERE id=$1', [cycle.id]);
    expect(rows.length).toBe(1);
  });

  it('multi-row delete is blocked entirely', async () => {
    const { cycle: c1 } = await createTestCycle();
    const { cycle: c2 } = await createTestCycle();
    await expect(
      pool.query('DELETE FROM territory_payout_cycles WHERE id IN ($1, $2)', [c1.id, c2.id])
    ).rejects.toMatchObject({ code: 'P0001' });
    const { rows } = await pool.query('SELECT COUNT(*) FROM territory_payout_cycles WHERE id IN ($1, $2)', [c1.id, c2.id]);
    expect(rows[0].count).toBe('2');
  });
});

describe('TRUNCATE Forbidden', () => {
  it('TRUNCATE is blocked (by FK or trigger)', async () => {
    // Plain TRUNCATE may be blocked by FK constraint before trigger fires
    await expect(
      pool.query('TRUNCATE TABLE territory_payout_cycles')
    ).rejects.toThrow();
    // Rows still exist
    const { rows } = await pool.query('SELECT COUNT(*) FROM territory_payout_cycles');
    expect(Number(rows[0].count)).toBeGreaterThan(0);
  });

  it('TRUNCATE CASCADE is blocked by trigger', async () => {
    await expect(
      pool.query('TRUNCATE TABLE territory_payout_cycles CASCADE')
    ).rejects.toMatchObject({ code: 'P0001' });
    // Rows still exist
    const { rows } = await pool.query('SELECT COUNT(*) FROM territory_payout_cycles');
    expect(Number(rows[0].count)).toBeGreaterThan(0);
  });
});

describe('Service Flows With Triggers Active', () => {
  it('full lifecycle: CALCULATED → UNDER_REVIEW → APPROVED with immutable snapshot', async () => {
    const { cycle, territoryId, managerId, driverId } = await createTestCycle();
    const calcTime = cycle.calculatedAt;
    const grossComm = cycle.grossManagerCommissionCents;

    const reviewed = await submitForReview(pool, cycle.id);
    expect(reviewed.status).toBe('UNDER_REVIEW');

    const approved = await approveCycle(pool, cycle.id, 'admin-imm');
    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedAt).not.toBeNull();
    expect(approved.approvedBy).toBe('admin-imm');
    // Financial snapshot unchanged
    expect(approved.grossManagerCommissionCents).toBe(grossComm);
    const { rows: [row] } = await pool.query('SELECT calculated_at FROM territory_payout_cycles WHERE id=$1', [cycle.id]);
    expect(row.calculated_at.getTime()).toBe(calcTime!.getTime());
  });

  it('cancelCycle works for BLOCKED', async () => {
    const tid = `ter-imm-blk-${RUN}-${randomUUID().slice(0,4)}`;
    const did = `drv-imm-blk-${RUN}-${randomUUID().slice(0,4)}`;
    await pool.query(`INSERT INTO operational_territories (id,name,level,status,regulatory_status,created_at,updated_at) VALUES ($1,'IB','neighborhood','active','not_applicable',NOW(),NOW()) ON CONFLICT DO NOTHING`, [tid]);
    await pool.query(`INSERT INTO drivers (id,name,email,phone,document_cpf,status,created_at,updated_at) VALUES ($1,'T',$2,'1','0','active',NOW(),NOW()) ON CONFLICT DO NOTHING`, [did, `${did}@t`]);
    await pool.query(`INSERT INTO driver_wallets (driver_id,balance_cents,reserved_cents,updated_at) VALUES ($1,50000,0,NOW()) ON CONFLICT (driver_id) DO UPDATE SET balance_cents=50000`, [did]);
    await settle(did, tid, `ride-imm-blk-${RUN}`);
    const cycle = await confirmRegularCycle(pool, tid, CURRENT_MONTH, null);
    expect(cycle.status).toBe('BLOCKED');
    const cancelled = await cancelCycle(pool, cycle.id, 'admin', 'immutability test');
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('confirmSupplementalCycle inserts new cycle normally', async () => {
    const { driverId, territoryId, managerId } = await setupFull(50000n);
    await settle(driverId, territoryId, `ride-imm-s1-${RUN}`);
    await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    await settle(driverId, territoryId, `ride-imm-s2-${RUN}`);
    const supp = await confirmSupplementalCycle(pool, territoryId, CURRENT_MONTH, managerId);
    expect(supp).not.toBeNull();
    expect(supp!.cycleType).toBe('SUPPLEMENTAL');
  });

  it('no financial side effects after full lifecycle', async () => {
    const { cycle } = await createTestCycle();
    await submitForReview(pool, cycle.id);
    await approveCycle(pool, cycle.id, 'admin');
    const { rows: [obl] } = await pool.query('SELECT COUNT(*) FROM financial_obligations WHERE source_id=$1', [cycle.id]);
    expect(obl.count).toBe('0');
    const { rows: [pay] } = await pool.query('SELECT COUNT(*) FROM financial_payouts fp JOIN financial_obligations fo ON fo.id=fp.obligation_id WHERE fo.source_id=$1', [cycle.id]);
    expect(pay.count).toBe('0');
    const { rows: [outbox] } = await pool.query('SELECT COUNT(*) FROM financial_payout_outbox fpo JOIN financial_obligations fo ON fo.id=fpo.obligation_id WHERE fo.source_id=$1', [cycle.id]);
    expect(outbox.count).toBe('0');
  });
});
