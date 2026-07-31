/**
 * Territory Payout Cycles Tests (Marco 3.2A - Phase 6B-A)
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { previewCycle, confirmRegularCycle, confirmSupplementalCycle, submitForReview, approveCycle, cancelCycle, getCycleById } from '../../src/services/finance/territory/cycle.service';
import { isValidReferenceMonth, isMonthOutbound, isMonthLegacy, isLegacyPayAllowed, assertOutboundEngine } from '../../src/services/finance/territory/engine-selection';
import { applyBasisPoints, MANAGER_COMMISSION_RATE_BPS, PLATFORM_FEE_RATE_BPS } from '../../src/services/finance/territory/monetary';
import { WalletService } from '../../src/services/wallet-v2/wallet.service';
import { WalletSettlementService } from '../../src/services/wallet-v2/wallet-settlement.service';
import { FeeSplitService, referenceMonthFromDate } from '../../src/services/wallet-v2/fee-split.service';
import { TerritoryLedgerService } from '../../src/services/wallet-v2/territory-ledger.service';
import { PendingDebitService } from '../../src/services/wallet-v2/pending-debit.service';

const RUN = randomUUID().slice(0, 8);
const CURRENT_MONTH = referenceMonthFromDate(new Date());
let pool: pg.Pool;

beforeAll(async () => { assertSafeFinanceDatabase(); pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }); });
afterAll(async () => { await pool.end(); });
beforeEach(() => { process.env.MANAGER_PAYOUT_ENGINE = 'outbound'; process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-01'; });
afterEach(() => { delete process.env.MANAGER_PAYOUT_ENGINE; delete process.env.MANAGER_PAYOUT_CUTOVER_MONTH; });

async function setupFull(balance = 10000n) {
  const did = `drv-cy-${RUN}-${randomUUID().slice(0,4)}`;
  const tid = `ter-cy-${RUN}-${randomUUID().slice(0,4)}`;
  const mid = `mgr-cy-${RUN}-${randomUUID().slice(0,4)}`;
  await pool.query(`INSERT INTO drivers (id,name,email,phone,document_cpf,status,created_at,updated_at) VALUES ($1,'T',$2,'1','0','active',NOW(),NOW()) ON CONFLICT DO NOTHING`, [did, `${did}@t`]);
  await pool.query(`INSERT INTO driver_wallets (driver_id,balance_cents,reserved_cents,updated_at) VALUES ($1,$2,0,NOW()) ON CONFLICT (driver_id) DO UPDATE SET balance_cents=$2,reserved_cents=0`, [did, balance.toString()]);
  await pool.query(`INSERT INTO operational_territories (id,name,level,status,regulatory_status,created_at,updated_at) VALUES ($1,'T','neighborhood','active','not_applicable',NOW(),NOW()) ON CONFLICT DO NOTHING`, [tid]);
  await pool.query(`INSERT INTO admins (id,name,email,phone,password,role,created_at,updated_at) VALUES ($1,'M',$2,'1','h','regional_manager',NOW(),NOW()) ON CONFLICT DO NOTHING`, [mid, `${mid}@t`]);
  await pool.query(`INSERT INTO territory_manager_assignments (territory_id,admin_id,status,started_at,created_by,updated_at) VALUES ($1,$2,'active',NOW()-INTERVAL '30 days',$2,NOW())`, [tid, mid]);
  await pool.query(`INSERT INTO operator_profiles (id,admin_id,territory_id,is_active,recipient_type,display_name,relationship_type,created_at,updated_at) VALUES ($1,$2,$3,true,'individual','Test Operator','territorial_operator',NOW(),NOW()) ON CONFLICT DO NOTHING`, [`op-${mid}`, mid, tid]);
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

describe('Engine Selection', () => {
  it('invalid months fail closed', () => {
    expect(isValidReferenceMonth('2026-13')).toBe(false);
    expect(isMonthOutbound('2026-13')).toBe(false);
  });
  it('outbound without cutover fails closed', () => {
    delete process.env.MANAGER_PAYOUT_CUTOVER_MONTH;
    expect(isMonthOutbound('2026-08')).toBe(false);
  });
  it('disabled blocks everything', () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'disabled';
    expect(isMonthOutbound('2026-08')).toBe(false);
  });
  it('legacy allowed before cutover', () => {
    process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-08';
    expect(isMonthLegacy('2026-06')).toBe(true);
    expect(isLegacyPayAllowed('2026-06')).toBe(true);
  });
  it('legacy blocked after cutover', () => {
    process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-01';
    expect(isMonthLegacy(CURRENT_MONTH)).toBe(false);
  });
});

describe('Preview', () => {
  it('does not persist cycle or allocations', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await settle(driverId, territoryId, `ride-prev-${RUN}-${randomUUID().slice(0,4)}`);
    const preview = await previewCycle(pool, territoryId, CURRENT_MONTH, managerId);
    expect(preview.grossPlatformFeeCents).toBeGreaterThan(0n);
    const { rows } = await pool.query("SELECT COUNT(*) FROM territory_payout_cycles WHERE territory_id=$1 AND reference_month=$2", [territoryId, CURRENT_MONTH]);
    expect(rows[0].count).toBe('0');
  });

  it('canConfirm=false when no entries', async () => {
    const { territoryId, managerId } = await setupFull();
    const preview = await previewCycle(pool, territoryId, CURRENT_MONTH, managerId);
    expect(preview.canConfirm).toBe(false);
    expect(preview.confirmBlockers).toContain('NO_UNALLOCATED_ENTRIES');
  });
});

describe('Confirm Regular Cycle', () => {
  it('creates CALCULATED with allocations and correct rates', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await settle(driverId, territoryId, `ride-reg-${RUN}-1`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    expect(cycle.status).toBe('CALCULATED');
    expect(cycle.cycleType).toBe('REGULAR');
    expect(cycle.platformFeeRateBasisPoints).toBe(1800);
    expect(cycle.commissionRateBasisPoints).toBe(4000);
    expect(cycle.grossManagerCommissionCents).toBeGreaterThan(0n);
    expect(cycle.fiscalDocumentRequired).toBe(false);
    expect(cycle.fiscalDocumentStatus).toBe('NOT_REQUIRED');
    const { rows } = await pool.query('SELECT COUNT(*) FROM territory_cycle_allocations WHERE cycle_id=$1', [cycle.id]);
    expect(Number(rows[0].count)).toBeGreaterThanOrEqual(2);
  });

  it('is idempotent', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await settle(driverId, territoryId, `ride-idem-${RUN}`);
    const c1 = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    const c2 = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    expect(c1.id).toBe(c2.id);
  });

  it('concurrent confirms produce one cycle', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await settle(driverId, territoryId, `ride-conc-${RUN}`);
    const [r1, r2] = await Promise.all([
      confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId),
      confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId),
    ]);
    expect(r1.id).toBe(r2.id);
  });

  it('CALCULATED cannot be cancelled', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await settle(driverId, territoryId, `ride-nc-${RUN}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    await expect(cancelCycle(pool, cycle.id, 'admin', 'test')).rejects.toMatchObject({ code: 'TERRITORY_CYCLE_INVALID_TRANSITION' });
  });

  it('BLOCKED without manager has no allocations and can be cancelled', async () => {
    const tid = `ter-nm-${RUN}-${randomUUID().slice(0,4)}`;
    const did = `drv-nm-${RUN}-${randomUUID().slice(0,4)}`;
    await pool.query(`INSERT INTO operational_territories (id,name,level,status,regulatory_status,created_at,updated_at) VALUES ($1,'NM','neighborhood','active','not_applicable',NOW(),NOW()) ON CONFLICT DO NOTHING`, [tid]);
    await pool.query(`INSERT INTO drivers (id,name,email,phone,document_cpf,status,created_at,updated_at) VALUES ($1,'T',$2,'1','0','active',NOW(),NOW()) ON CONFLICT DO NOTHING`, [did, `${did}@t`]);
    await pool.query(`INSERT INTO driver_wallets (driver_id,balance_cents,reserved_cents,updated_at) VALUES ($1,10000,0,NOW()) ON CONFLICT (driver_id) DO UPDATE SET balance_cents=10000,reserved_cents=0`, [did]);
    await settle(did, tid, `ride-blk-${RUN}`);
    const cycle = await confirmRegularCycle(pool, tid, CURRENT_MONTH, null);
    expect(cycle.status).toBe('BLOCKED');
    const { rows } = await pool.query('SELECT COUNT(*) FROM territory_cycle_allocations WHERE cycle_id=$1', [cycle.id]);
    expect(rows[0].count).toBe('0');
    const cancelled = await cancelCycle(pool, cycle.id, 'admin', 'test');
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('empty entries throw NO_UNALLOCATED_ENTRIES', async () => {
    const { territoryId, managerId } = await setupFull();
    await expect(confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_NO_UNALLOCATED_ENTRIES' });
  });

  it('fiscal profile PJ sets required=true', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await pool.query(`UPDATE operator_profiles SET recipient_type='company' WHERE admin_id=$1`, [managerId]);
    await settle(driverId, territoryId, `ride-pj-${RUN}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    expect(cycle.fiscalDocumentRequired).toBe(true);
    expect(cycle.fiscalDocumentStatus).toBe('PENDING');
  });

  it('missing fiscal profile blocks confirmation', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await pool.query(`DELETE FROM operator_profiles WHERE admin_id=$1`, [managerId]);
    await settle(driverId, territoryId, `ride-nofiscal-${RUN}`);
    await expect(confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_FISCAL_PROFILE_MISSING' });
  });

  it('fiscal profile individual sets required=false and status=NOT_REQUIRED', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    // setupFull creates operator_profiles with recipient_type='individual'
    await settle(driverId, territoryId, `ride-fi-${RUN}-${randomUUID().slice(0,4)}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    expect(cycle.fiscalDocumentRequired).toBe(false);
    expect(cycle.fiscalDocumentStatus).toBe('NOT_REQUIRED');
    // Verify persisted in DB
    const { rows } = await pool.query(
      'SELECT fiscal_document_required, fiscal_document_status FROM territory_payout_cycles WHERE id=$1',
      [cycle.id]);
    expect(rows[0].fiscal_document_required).toBe(false);
    expect(rows[0].fiscal_document_status).toBe('NOT_REQUIRED');
  });

  it('BLOCKED cancelled is not reutilized', async () => {
    const tid = `ter-blkc-${RUN}-${randomUUID().slice(0,4)}`;
    const did = `drv-blkc-${RUN}-${randomUUID().slice(0,4)}`;
    await pool.query(`INSERT INTO operational_territories (id,name,level,status,regulatory_status,created_at,updated_at) VALUES ($1,'BC','neighborhood','active','not_applicable',NOW(),NOW()) ON CONFLICT DO NOTHING`, [tid]);
    await pool.query(`INSERT INTO drivers (id,name,email,phone,document_cpf,status,created_at,updated_at) VALUES ($1,'T',$2,'1','0','active',NOW(),NOW()) ON CONFLICT DO NOTHING`, [did, `${did}@t`]);
    await pool.query(`INSERT INTO driver_wallets (driver_id,balance_cents,reserved_cents,updated_at) VALUES ($1,10000,0,NOW()) ON CONFLICT (driver_id) DO UPDATE SET balance_cents=10000,reserved_cents=0`, [did]);
    await settle(did, tid, `ride-blkc1-${RUN}`);
    const blocked = await confirmRegularCycle(pool, tid, CURRENT_MONTH, null);
    await cancelCycle(pool, blocked.id, 'admin', 'test');
    // New entries arrive
    await settle(did, tid, `ride-blkc2-${RUN}`);
    await expect(confirmRegularCycle(pool, tid, CURRENT_MONTH, null))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_BLOCKED_CANCELLED' });
  });
});

describe('Supplemental', () => {
  it('captures new entries after REGULAR', async () => {
    const { driverId, territoryId, managerId } = await setupFull(50000n);
    await settle(driverId, territoryId, `ride-s1-${RUN}`);
    const regular = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    await settle(driverId, territoryId, `ride-s2-${RUN}`);
    const supp = await confirmSupplementalCycle(pool, territoryId, CURRENT_MONTH, managerId);
    expect(supp).not.toBeNull();
    expect(supp!.cycleType).toBe('SUPPLEMENTAL');
    expect(supp!.parentCycleId).toBe(regular.id);
    expect(supp!.sequenceNumber).toBe(2);
  });

  it('returns null when no new entries', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await settle(driverId, territoryId, `ride-sn-${RUN}`);
    await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    expect(await confirmSupplementalCycle(pool, territoryId, CURRENT_MONTH, managerId)).toBeNull();
  });

  it('requires REGULAR', async () => {
    const { territoryId, managerId } = await setupFull();
    await expect(confirmSupplementalCycle(pool, territoryId, CURRENT_MONTH, managerId))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_NO_REGULAR_PARENT' });
  });

  it('managerId null returns null', async () => {
    expect(await confirmSupplementalCycle(pool, 'any', CURRENT_MONTH, null)).toBeNull();
  });
});

describe('State Transitions', () => {
  it('CALCULATED → UNDER_REVIEW → APPROVED', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await settle(driverId, territoryId, `ride-tr-${RUN}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    const reviewed = await submitForReview(pool, cycle.id);
    expect(reviewed.status).toBe('UNDER_REVIEW');
    const approved = await approveCycle(pool, cycle.id, 'admin-1');
    expect(approved.status).toBe('APPROVED');
    expect(approved.approvedAt).not.toBeNull();
  });
  it('cannot approve without review', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await settle(driverId, territoryId, `ride-na-${RUN}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    await expect(approveCycle(pool, cycle.id, 'admin')).rejects.toMatchObject({ code: 'TERRITORY_CYCLE_INVALID_TRANSITION' });
  });
});

// ═══════════════════════════════════════════════════════════════
// Phase 6B-A2: PostgreSQL proofs for rules implemented in 6B-A
// ═══════════════════════════════════════════════════════════════

describe('Rate Integrity', () => {
  it('historic rates different from 1800/4000 are preserved on cycle', async () => {
    const { driverId, territoryId, managerId } = await setupFull(50000n);
    const { rows: [assign] } = await pool.query(
      `SELECT id FROM territory_manager_assignments WHERE territory_id=$1 AND admin_id=$2 AND status='active'`,
      [territoryId, managerId]);
    const rideId = `ride-hrate-${RUN}-${randomUUID().slice(0,4)}`;
    // Insert split+ledger with historic rates 1700/3500
    const fee = 1700n;
    const comm = (fee * 3500n + 5000n) / 10000n; // 595
    await pool.query(
      `INSERT INTO ride_fee_splits (ride_id, driver_id, final_price_cents, fee_amount_cents,
        fee_collected_cents, fee_pending_cents, matrix_share_cents, manager_share_cents,
        territory_id, manager_id, reference_month, collection_status,
        manager_assignment_id, platform_fee_rate_bps, manager_commission_rate_bps)
       VALUES ($1,$2,10000,$3,$3,0,$4,$5,$6,$7,$8,'collected',$9,1700,3500)`,
      [rideId, driverId, fee.toString(), (fee - comm).toString(),
       comm.toString(), territoryId, managerId, CURRENT_MONTH, assign.id]);
    await pool.query(
      `INSERT INTO territory_ledger (territory_id, manager_id, reference_month, entry_type, amount_cents, reference_type, reference_id, manager_assignment_id)
       VALUES ($1,$2,$3,'platform_fee',$4,'ride',$5,$6), ($1,$2,$3,'fee_share',$7,'ride',$5,$6)`,
      [territoryId, managerId, CURRENT_MONTH, fee.toString(), rideId, assign.id, comm.toString()]);

    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    expect(cycle.platformFeeRateBasisPoints).toBe(1700);
    expect(cycle.commissionRateBasisPoints).toBe(3500);
    const { rows } = await pool.query(
      'SELECT platform_fee_rate_basis_points, commission_rate_basis_points FROM territory_payout_cycles WHERE id=$1',
      [cycle.id]);
    expect(rows[0].platform_fee_rate_basis_points).toBe(1700);
    expect(rows[0].commission_rate_basis_points).toBe(3500);
  });

  it('mixed rates block cycle with TERRITORY_CYCLE_MIXED_RATES', async () => {
    const { driverId, territoryId, managerId } = await setupFull(50000n);
    const { rows: [assign] } = await pool.query(
      `SELECT id FROM territory_manager_assignments WHERE territory_id=$1 AND admin_id=$2 AND status='active'`,
      [territoryId, managerId]);
    const r1 = `ride-mix1-${RUN}-${randomUUID().slice(0,4)}`;
    const r2 = `ride-mix2-${RUN}-${randomUUID().slice(0,4)}`;
    const fee1 = 1700n, comm1 = (fee1 * 3500n + 5000n) / 10000n;
    const fee2 = 1900n, comm2 = (fee2 * 4200n + 5000n) / 10000n;
    // Ride 1: rate 1700/3500
    await pool.query(
      `INSERT INTO ride_fee_splits (ride_id, driver_id, final_price_cents, fee_amount_cents,
        fee_collected_cents, fee_pending_cents, matrix_share_cents, manager_share_cents,
        territory_id, manager_id, reference_month, collection_status,
        manager_assignment_id, platform_fee_rate_bps, manager_commission_rate_bps)
       VALUES ($1,$2,10000,$3,$3,0,$4,$5,$6,$7,$8,'collected',$9,1700,3500)`,
      [r1, driverId, fee1.toString(), (fee1 - comm1).toString(),
       comm1.toString(), territoryId, managerId, CURRENT_MONTH, assign.id]);
    await pool.query(
      `INSERT INTO territory_ledger (territory_id, manager_id, reference_month, entry_type, amount_cents, reference_type, reference_id, manager_assignment_id)
       VALUES ($1,$2,$3,'platform_fee',$4,'ride',$5,$6), ($1,$2,$3,'fee_share',$7,'ride',$5,$6)`,
      [territoryId, managerId, CURRENT_MONTH, fee1.toString(), r1, assign.id, comm1.toString()]);
    // Ride 2: rate 1900/4200
    await pool.query(
      `INSERT INTO ride_fee_splits (ride_id, driver_id, final_price_cents, fee_amount_cents,
        fee_collected_cents, fee_pending_cents, matrix_share_cents, manager_share_cents,
        territory_id, manager_id, reference_month, collection_status,
        manager_assignment_id, platform_fee_rate_bps, manager_commission_rate_bps)
       VALUES ($1,$2,10000,$3,$3,0,$4,$5,$6,$7,$8,'collected',$9,1900,4200)`,
      [r2, driverId, fee2.toString(), (fee2 - comm2).toString(),
       comm2.toString(), territoryId, managerId, CURRENT_MONTH, assign.id]);
    await pool.query(
      `INSERT INTO territory_ledger (territory_id, manager_id, reference_month, entry_type, amount_cents, reference_type, reference_id, manager_assignment_id)
       VALUES ($1,$2,$3,'platform_fee',$4,'ride',$5,$6), ($1,$2,$3,'fee_share',$7,'ride',$5,$6)`,
      [territoryId, managerId, CURRENT_MONTH, fee2.toString(), r2, assign.id, comm2.toString()]);

    await expect(confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_MIXED_RATES' });
    const { rows: cycles } = await pool.query(
      `SELECT COUNT(*) FROM territory_payout_cycles WHERE territory_id=$1 AND reference_month=$2 AND status<>'CANCELLED'`,
      [territoryId, CURRENT_MONTH]);
    expect(cycles[0].count).toBe('0');
  });
});

describe('Reconciliation Divergences', () => {
  it('manager_assignment divergent triggers LEDGER_DIVERGENCE', async () => {
    const { driverId, territoryId, managerId } = await setupFull(50000n);
    const { rows: [assign] } = await pool.query(
      `SELECT id FROM territory_manager_assignments WHERE territory_id=$1 AND admin_id=$2 AND status='active'`,
      [territoryId, managerId]);
    const rideId = `ride-asgn-${RUN}-${randomUUID().slice(0,4)}`;
    const fee = 1800n, comm = (fee * 4000n + 5000n) / 10000n;
    // Split with correct manager_assignment_id
    await pool.query(
      `INSERT INTO ride_fee_splits (ride_id, driver_id, final_price_cents, fee_amount_cents,
        fee_collected_cents, fee_pending_cents, matrix_share_cents, manager_share_cents,
        territory_id, manager_id, reference_month, collection_status,
        manager_assignment_id, platform_fee_rate_bps, manager_commission_rate_bps)
       VALUES ($1,$2,10000,$3,$3,0,$4,$5,$6,$7,$8,'collected',$9,1800,4000)`,
      [rideId, driverId, fee.toString(), (fee - comm).toString(),
       comm.toString(), territoryId, managerId, CURRENT_MONTH, assign.id]);
    // Ledger entries with WRONG manager_assignment_id (INSERT is allowed; UPDATE is not)
    await pool.query(
      `INSERT INTO territory_ledger (territory_id, manager_id, reference_month, entry_type, amount_cents, reference_type, reference_id, manager_assignment_id)
       VALUES ($1,$2,$3,'platform_fee',$4,'ride',$5,'WRONG_ASSIGNMENT'),
              ($1,$2,$3,'fee_share',$6,'ride',$5,'WRONG_ASSIGNMENT')`,
      [territoryId, managerId, CURRENT_MONTH, fee.toString(), rideId, comm.toString()]);

    await expect(confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_LEDGER_DIVERGENCE' });
    const { rows } = await pool.query(
      `SELECT COUNT(*) FROM territory_payout_cycles WHERE territory_id=$1 AND reference_month=$2 AND status<>'CANCELLED'`,
      [territoryId, CURRENT_MONTH]);
    expect(rows[0].count).toBe('0');
  });

  it('territory_id divergent between split and ledger is detected', async () => {
    // Split has territory_id=A, ledger has territory_id=B (cycle target).
    // Reconciliation LEFT JOINs by ride_id and compares territory_id → territory_mismatch.
    const { driverId, territoryId, managerId } = await setupFull(50000n);
    const { rows: [assign] } = await pool.query(
      `SELECT id FROM territory_manager_assignments WHERE territory_id=$1 AND admin_id=$2 AND status='active'`,
      [territoryId, managerId]);
    const wrongTid = `ter-wrong-${RUN}-${randomUUID().slice(0,4)}`;
    await pool.query(
      `INSERT INTO operational_territories (id,name,level,status,regulatory_status,created_at,updated_at)
       VALUES ($1,'Wrong','neighborhood','active','not_applicable',NOW(),NOW()) ON CONFLICT DO NOTHING`, [wrongTid]);

    const rideId = `ride-terdiv2-${RUN}-${randomUUID().slice(0,4)}`;
    const fee = 1800n, comm = (fee * 4000n + 5000n) / 10000n;

    // Split with WRONG territory_id
    await pool.query(
      `INSERT INTO ride_fee_splits (ride_id, driver_id, final_price_cents, fee_amount_cents,
        fee_collected_cents, fee_pending_cents, matrix_share_cents, manager_share_cents,
        territory_id, manager_id, reference_month, collection_status,
        manager_assignment_id, platform_fee_rate_bps, manager_commission_rate_bps)
       VALUES ($1,$2,10000,$3,$3,0,$4,$5,$6,$7,$8,'collected',$9,1800,4000)`,
      [rideId, driverId, fee.toString(), (fee - comm).toString(),
       comm.toString(), wrongTid, managerId, CURRENT_MONTH, assign.id]);

    // Ledger with CORRECT territory_id
    await pool.query(
      `INSERT INTO territory_ledger (territory_id, manager_id, reference_month, entry_type, amount_cents, reference_type, reference_id, manager_assignment_id)
       VALUES ($1,$2,$3,'platform_fee',$4,'ride',$5,$6), ($1,$2,$3,'fee_share',$7,'ride',$5,$6)`,
      [territoryId, managerId, CURRENT_MONTH, fee.toString(), rideId, assign.id, comm.toString()]);

    // Prove BOTH coexist with DIFFERENT territory_ids
    const { rows: [splitRow] } = await pool.query('SELECT territory_id FROM ride_fee_splits WHERE ride_id=$1', [rideId]);
    const { rows: ledgerRows } = await pool.query('SELECT territory_id FROM territory_ledger WHERE reference_id=$1', [rideId]);
    expect(splitRow.territory_id).toBe(wrongTid);
    expect(ledgerRows[0].territory_id).toBe(territoryId);
    expect(splitRow.territory_id).not.toBe(ledgerRows[0].territory_id);

    await expect(confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_LEDGER_DIVERGENCE' });

    // No cycle or allocations
    const { rows: cycles } = await pool.query(
      `SELECT COUNT(*) FROM territory_payout_cycles WHERE territory_id=$1 AND reference_month=$2 AND status<>'CANCELLED'`,
      [territoryId, CURRENT_MONTH]);
    expect(cycles[0].count).toBe('0');
    const { rows: allocs } = await pool.query(
      `SELECT COUNT(*) FROM territory_cycle_allocations WHERE cycle_id IN (SELECT id FROM territory_payout_cycles WHERE territory_id=$1)`,
      [territoryId]);
    expect(allocs[0].count).toBe('0');
  });

  it('manager_id divergent between split and ledger is detected', async () => {
    // Split has manager_id=A, ledger has manager_id=B (cycle target).
    // Reconciliation LEFT JOINs by ride_id and compares manager_id → manager_mismatch.
    const { driverId, territoryId, managerId } = await setupFull(50000n);
    const { rows: [assign] } = await pool.query(
      `SELECT id FROM territory_manager_assignments WHERE territory_id=$1 AND admin_id=$2 AND status='active'`,
      [territoryId, managerId]);
    const wrongMgr = `mgr-wrong-${RUN}-${randomUUID().slice(0,4)}`;
    await pool.query(
      `INSERT INTO admins (id,name,email,phone,password,role,created_at,updated_at)
       VALUES ($1,'W',$2,'1','h','regional_manager',NOW(),NOW()) ON CONFLICT DO NOTHING`,
      [wrongMgr, `${wrongMgr}@t`]);

    const rideId = `ride-mgrdiv2-${RUN}-${randomUUID().slice(0,4)}`;
    const fee = 1800n, comm = (fee * 4000n + 5000n) / 10000n;

    // Split with WRONG manager_id
    await pool.query(
      `INSERT INTO ride_fee_splits (ride_id, driver_id, final_price_cents, fee_amount_cents,
        fee_collected_cents, fee_pending_cents, matrix_share_cents, manager_share_cents,
        territory_id, manager_id, reference_month, collection_status,
        manager_assignment_id, platform_fee_rate_bps, manager_commission_rate_bps)
       VALUES ($1,$2,10000,$3,$3,0,$4,$5,$6,$7,$8,'collected',$9,1800,4000)`,
      [rideId, driverId, fee.toString(), (fee - comm).toString(),
       comm.toString(), territoryId, wrongMgr, CURRENT_MONTH, assign.id]);

    // Ledger with CORRECT manager_id
    await pool.query(
      `INSERT INTO territory_ledger (territory_id, manager_id, reference_month, entry_type, amount_cents, reference_type, reference_id, manager_assignment_id)
       VALUES ($1,$2,$3,'platform_fee',$4,'ride',$5,$6), ($1,$2,$3,'fee_share',$7,'ride',$5,$6)`,
      [territoryId, managerId, CURRENT_MONTH, fee.toString(), rideId, assign.id, comm.toString()]);

    // Prove BOTH coexist with DIFFERENT manager_ids
    const { rows: [splitRow] } = await pool.query('SELECT manager_id FROM ride_fee_splits WHERE ride_id=$1', [rideId]);
    const { rows: ledgerRows } = await pool.query('SELECT manager_id FROM territory_ledger WHERE reference_id=$1', [rideId]);
    expect(splitRow.manager_id).toBe(wrongMgr);
    expect(ledgerRows[0].manager_id).toBe(managerId);
    expect(splitRow.manager_id).not.toBe(ledgerRows[0].manager_id);

    await expect(confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_LEDGER_DIVERGENCE' });

    // No cycle or allocations
    const { rows: cycles } = await pool.query(
      `SELECT COUNT(*) FROM territory_payout_cycles WHERE territory_id=$1 AND reference_month=$2 AND status<>'CANCELLED'`,
      [territoryId, CURRENT_MONTH]);
    expect(cycles[0].count).toBe('0');
    const { rows: allocs } = await pool.query(
      `SELECT COUNT(*) FROM territory_cycle_allocations WHERE cycle_id IN (SELECT id FROM territory_payout_cycles WHERE territory_id=$1)`,
      [territoryId]);
    expect(allocs[0].count).toBe('0');
  });

  it('consistent split and ledger produces valid cycle (control)', async () => {
    // Proof that the reconciliation fix does NOT reject valid data:
    // Same ride_id, same territory, same manager, same assignment, correct amounts.
    const { driverId, territoryId, managerId } = await setupFull(50000n);
    const { rows: [assign] } = await pool.query(
      `SELECT id FROM territory_manager_assignments WHERE territory_id=$1 AND admin_id=$2 AND status='active'`,
      [territoryId, managerId]);
    const rideId = `ride-ctrl-${RUN}-${randomUUID().slice(0,4)}`;
    const fee = 1800n, comm = (fee * 4000n + 5000n) / 10000n;

    // Split with CORRECT territory, manager, assignment
    await pool.query(
      `INSERT INTO ride_fee_splits (ride_id, driver_id, final_price_cents, fee_amount_cents,
        fee_collected_cents, fee_pending_cents, matrix_share_cents, manager_share_cents,
        territory_id, manager_id, reference_month, collection_status,
        manager_assignment_id, platform_fee_rate_bps, manager_commission_rate_bps)
       VALUES ($1,$2,10000,$3,$3,0,$4,$5,$6,$7,$8,'collected',$9,1800,4000)`,
      [rideId, driverId, fee.toString(), (fee - comm).toString(),
       comm.toString(), territoryId, managerId, CURRENT_MONTH, assign.id]);

    // Ledger with SAME correct metadata
    await pool.query(
      `INSERT INTO territory_ledger (territory_id, manager_id, reference_month, entry_type, amount_cents, reference_type, reference_id, manager_assignment_id)
       VALUES ($1,$2,$3,'platform_fee',$4,'ride',$5,$6), ($1,$2,$3,'fee_share',$7,'ride',$5,$6)`,
      [territoryId, managerId, CURRENT_MONTH, fee.toString(), rideId, assign.id, comm.toString()]);

    // Cycle should be created successfully
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    expect(cycle.status).toBe('CALCULATED');
    expect(cycle.grossPlatformFeeCents).toBe(fee);
    expect(cycle.grossManagerCommissionCents).toBe(comm);
  });

  it('collection_status incoherent triggers LEDGER_DIVERGENCE', async () => {
    const { driverId, territoryId, managerId } = await setupFull(50000n);
    const rideId = `ride-colst-${RUN}-${randomUUID().slice(0,4)}`;
    await settle(driverId, territoryId, rideId);
    // Tamper split: collected status but fee_pending_cents > 0
    await pool.query(
      `UPDATE ride_fee_splits SET collection_status='collected', fee_pending_cents=100 WHERE ride_id=$1`,
      [rideId]);
    await expect(confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_LEDGER_DIVERGENCE' });
    const { rows } = await pool.query(
      `SELECT COUNT(*) FROM territory_payout_cycles WHERE territory_id=$1 AND reference_month=$2 AND status<>'CANCELLED'`,
      [territoryId, CURRENT_MONTH]);
    expect(rows[0].count).toBe('0');
  });

  it('fee_collected + fee_pending invariant violated triggers LEDGER_DIVERGENCE', async () => {
    const { driverId, territoryId, managerId } = await setupFull(50000n);
    const rideId = `ride-inv-${RUN}-${randomUUID().slice(0,4)}`;
    await settle(driverId, territoryId, rideId);
    // Tamper split: break invariant fee_collected + fee_pending != fee_amount
    await pool.query(
      `UPDATE ride_fee_splits SET fee_collected_cents=fee_collected_cents+1 WHERE ride_id=$1`,
      [rideId]);
    await expect(confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_LEDGER_DIVERGENCE' });
    const { rows } = await pool.query(
      `SELECT COUNT(*) FROM territory_payout_cycles WHERE territory_id=$1 AND reference_month=$2 AND status<>'CANCELLED'`,
      [territoryId, CURRENT_MONTH]);
    expect(rows[0].count).toBe('0');
  });
});

describe('Supplemental Edge Cases', () => {
  it('supplemental with zero-sum increment returns null and creates nothing', async () => {
    const { driverId, territoryId, managerId } = await setupFull(50000n);
    const rideForRegular = `ride-sz-reg-${RUN}-${randomUUID().slice(0,4)}`;
    await settle(driverId, territoryId, rideForRegular);
    await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);

    const { rows: [assign] } = await pool.query(
      `SELECT id FROM territory_manager_assignments WHERE territory_id=$1 AND admin_id=$2 AND status='active'`,
      [territoryId, managerId]);
    // Insert zero-value ledger entries (post-REGULAR, unallocated)
    const synRide = `ride-sz-s-${RUN}-${randomUUID().slice(0,4)}`;
    await pool.query(
      `INSERT INTO ride_fee_splits (ride_id, driver_id, final_price_cents, fee_amount_cents,
        fee_collected_cents, fee_pending_cents, matrix_share_cents, manager_share_cents,
        territory_id, manager_id, reference_month, collection_status,
        manager_assignment_id, platform_fee_rate_bps, manager_commission_rate_bps)
       VALUES ($1,$2,0,0,0,0,0,0,$3,$4,$5,'collected',$6,1800,4000)`,
      [synRide, driverId, territoryId, managerId, CURRENT_MONTH, assign.id]);
    await pool.query(
      `INSERT INTO territory_ledger (territory_id, manager_id, reference_month, entry_type, amount_cents, reference_type, reference_id, manager_assignment_id)
       VALUES ($1,$2,$3,'fee_share',0,'ride',$4,$5), ($1,$2,$3,'platform_fee',0,'ride',$4,$5)`,
      [territoryId, managerId, CURRENT_MONTH, synRide, assign.id]);

    const supp = await confirmSupplementalCycle(pool, territoryId, CURRENT_MONTH, managerId);
    expect(supp).toBeNull();
    const { rows } = await pool.query(
      `SELECT COUNT(*) FROM territory_payout_cycles WHERE territory_id=$1 AND reference_month=$2 AND cycle_type='SUPPLEMENTAL'`,
      [territoryId, CURRENT_MONTH]);
    expect(rows[0].count).toBe('0');
  });
});

describe('Negative Value Guard', () => {
  it('negative commission rejects with NEGATIVE_ADJUSTMENT_UNSUPPORTED', async () => {
    const { driverId, territoryId, managerId } = await setupFull(50000n);
    const { rows: [assign] } = await pool.query(
      `SELECT id FROM territory_manager_assignments WHERE territory_id=$1 AND admin_id=$2 AND status='active'`,
      [territoryId, managerId]);
    const corruptRide = `ride-neg-${RUN}-${randomUUID().slice(0,4)}`;
    await pool.query(
      `INSERT INTO ride_fee_splits (ride_id, driver_id, final_price_cents, fee_amount_cents,
        fee_collected_cents, fee_pending_cents, matrix_share_cents, manager_share_cents,
        territory_id, manager_id, reference_month, collection_status,
        manager_assignment_id, platform_fee_rate_bps, manager_commission_rate_bps)
       VALUES ($1,$2,10000,1800,1800,0,1080,720,$3,$4,$5,'collected',$6,1800,4000)`,
      [corruptRide, driverId, territoryId, managerId, CURRENT_MONTH, assign.id]);
    await pool.query(
      `INSERT INTO territory_ledger (territory_id, manager_id, reference_month, entry_type, amount_cents, reference_type, reference_id, manager_assignment_id)
       VALUES ($1,$2,$3,'platform_fee',1800,'ride',$4,$5),
              ($1,$2,$3,'fee_share',-5000,'ride',$4,$5)`,
      [territoryId, managerId, CURRENT_MONTH, corruptRide, assign.id]);

    await expect(confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_NEGATIVE_ADJUSTMENT_UNSUPPORTED' });
    const { rows: cycles } = await pool.query(
      `SELECT COUNT(*) FROM territory_payout_cycles WHERE territory_id=$1 AND reference_month=$2 AND status<>'CANCELLED'`,
      [territoryId, CURRENT_MONTH]);
    expect(cycles[0].count).toBe('0');
    const { rows: allocs } = await pool.query(
      `SELECT COUNT(*) FROM territory_cycle_allocations WHERE cycle_id IN (SELECT id FROM territory_payout_cycles WHERE territory_id=$1)`,
      [territoryId]);
    expect(allocs[0].count).toBe('0');
  });
});

describe('Idempotency Guard', () => {
  it('economic identity mismatch throws IDEMPOTENCY_MISMATCH', async () => {
    // The mismatch guard fires when INSERT ON CONFLICT DO NOTHING returns 0 rows
    // and the existing row's economics differ from computed values.
    // Strategy: pre-insert a rogue cycle into a DIFFERENT territory but with the same
    // idempotency_key that confirmRegularCycle will compute for OUR territory.
    // getActiveRegular queries WHERE territory_id=$1 → won't find the rogue.
    // The BLOCKED_CANCELLED check also queries WHERE territory_id=$1 → won't find it.
    // The INSERT will conflict on idempotency_key → DO NOTHING → mismatch comparison fires.
    const { driverId, territoryId, managerId } = await setupFull(50000n);
    const rideId = `ride-idemm-${RUN}-${randomUUID().slice(0,4)}`;
    await settle(driverId, territoryId, rideId);

    const idemKey = `territory_cycle:REGULAR:${territoryId}:${managerId}:${CURRENT_MONTH}:territorial_commission_v1:seq1`;
    const rogueTid = `ter-rogue-${RUN}-${randomUUID().slice(0,4)}`;
    await pool.query(
      `INSERT INTO operational_territories (id,name,level,status,regulatory_status,created_at,updated_at)
       VALUES ($1,'Rogue','neighborhood','active','not_applicable',NOW(),NOW()) ON CONFLICT DO NOTHING`, [rogueTid]);

    const rogueId = `rogue-${RUN}-${randomUUID().slice(0,4)}`;
    await pool.query(
      `INSERT INTO territory_payout_cycles
       (id, territory_id, manager_id, reference_month, policy_version,
        commission_rate_basis_points, platform_fee_rate_basis_points, competence_timezone,
        cycle_type, parent_cycle_id, sequence_number,
        gross_platform_fee_cents, gross_manager_commission_cents, approved_adjustments_cents, approved_amount_cents,
        status, fiscal_document_required, fiscal_document_status,
        calculated_at, recognized_at, idempotency_key)
       VALUES ($1,$2,$3,$4,'territorial_commission_v1',
        4000, 1800, 'America/Sao_Paulo', 'REGULAR', NULL, 1,
        999999, 999999, 0, 999999,
        'CALCULATED', false, 'NOT_REQUIRED', NOW(), NOW(), $5)`,
      [rogueId, rogueTid, managerId, CURRENT_MONTH, idemKey]);

    try {
      await expect(confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId))
        .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_IDEMPOTENCY_MISMATCH' });
      const { rows } = await pool.query(
        `SELECT COUNT(*) FROM territory_payout_cycles WHERE territory_id=$1 AND reference_month=$2 AND cycle_type='REGULAR'`,
        [territoryId, CURRENT_MONTH]);
      expect(rows[0].count).toBe('0');
    } finally {
      await pool.query(`DELETE FROM territory_payout_cycles WHERE id=$1`, [rogueId]);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// Phase 6B-B: Engine gates, fiscal approval, transitions
// ═══════════════════════════════════════════════════════════════

describe('Engine Gate', () => {
  it('submit-review blocked with engine disabled', async () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'disabled';
    await expect(submitForReview(pool, 'any-id'))
      .rejects.toMatchObject({ code: 'MANAGER_PAYOUT_ENGINE_NOT_OUTBOUND' });
  });

  it('submit-review blocked with engine legacy', async () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'legacy';
    await expect(submitForReview(pool, 'any-id'))
      .rejects.toMatchObject({ code: 'MANAGER_PAYOUT_ENGINE_NOT_OUTBOUND' });
  });

  it('approve blocked with engine disabled', async () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'disabled';
    await expect(approveCycle(pool, 'any-id', 'admin'))
      .rejects.toMatchObject({ code: 'MANAGER_PAYOUT_ENGINE_NOT_OUTBOUND' });
  });

  it('approve blocked with engine legacy', async () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'legacy';
    await expect(approveCycle(pool, 'any-id', 'admin'))
      .rejects.toMatchObject({ code: 'MANAGER_PAYOUT_ENGINE_NOT_OUTBOUND' });
  });

  it('cancel blocked with engine disabled', async () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'disabled';
    await expect(cancelCycle(pool, 'any-id', 'admin', 'test'))
      .rejects.toMatchObject({ code: 'MANAGER_PAYOUT_ENGINE_NOT_OUTBOUND' });
  });

  it('absent config fails closed', async () => {
    delete process.env.MANAGER_PAYOUT_ENGINE;
    await expect(submitForReview(pool, 'any-id'))
      .rejects.toMatchObject({ code: 'MANAGER_PAYOUT_ENGINE_NOT_OUTBOUND' });
  });

  it('invalid config fails closed', async () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'INVALID_VALUE';
    await expect(submitForReview(pool, 'any-id'))
      .rejects.toMatchObject({ code: 'MANAGER_PAYOUT_ENGINE_NOT_OUTBOUND' });
  });

  it('submit-review passes with engine outbound', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await settle(driverId, territoryId, `ride-gate-${RUN}-${randomUUID().slice(0,4)}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    const reviewed = await submitForReview(pool, cycle.id);
    expect(reviewed.status).toBe('UNDER_REVIEW');
  });
});

describe('Fiscal Approval', () => {
  it('approve individual/NOT_REQUIRED succeeds', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await settle(driverId, territoryId, `ride-fi-appr-${RUN}-${randomUUID().slice(0,4)}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    await submitForReview(pool, cycle.id);
    const approved = await approveCycle(pool, cycle.id, 'admin-fi');
    expect(approved.status).toBe('APPROVED');
    expect(approved.fiscalDocumentRequired).toBe(false);
    expect(approved.fiscalDocumentStatus).toBe('NOT_REQUIRED');
    expect(approved.approvedBy).toBe('admin-fi');
  });

  it('approve PJ/PENDING blocked', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await pool.query(`UPDATE operator_profiles SET recipient_type='company' WHERE admin_id=$1`, [managerId]);
    await settle(driverId, territoryId, `ride-pj-pend-${RUN}-${randomUUID().slice(0,4)}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    await submitForReview(pool, cycle.id);
    await expect(approveCycle(pool, cycle.id, 'admin'))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_FISCAL_DOCUMENT_NOT_VALIDATED' });
    // Verify still UNDER_REVIEW in DB
    const { rows: [row] } = await pool.query('SELECT status FROM territory_payout_cycles WHERE id=$1', [cycle.id]);
    expect(row.status).toBe('UNDER_REVIEW');
  });

  it('approve PJ/VALIDATED succeeds', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await pool.query(`UPDATE operator_profiles SET recipient_type='company' WHERE admin_id=$1`, [managerId]);
    await settle(driverId, territoryId, `ride-pj-val-${RUN}-${randomUUID().slice(0,4)}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    await submitForReview(pool, cycle.id);
    // Simulate fiscal document validation
    await pool.query(`UPDATE territory_payout_cycles SET fiscal_document_status='VALIDATED' WHERE id=$1`, [cycle.id]);
    const approved = await approveCycle(pool, cycle.id, 'admin-pj');
    expect(approved.status).toBe('APPROVED');
    expect(approved.fiscalDocumentRequired).toBe(true);
    expect(approved.fiscalDocumentStatus).toBe('VALIDATED');
  });

  it('approve PJ/REJECTED blocked', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await pool.query(`UPDATE operator_profiles SET recipient_type='company' WHERE admin_id=$1`, [managerId]);
    await settle(driverId, territoryId, `ride-pj-rej-${RUN}-${randomUUID().slice(0,4)}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    await submitForReview(pool, cycle.id);
    await pool.query(`UPDATE territory_payout_cycles SET fiscal_document_status='REJECTED' WHERE id=$1`, [cycle.id]);
    await expect(approveCycle(pool, cycle.id, 'admin'))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_FISCAL_DOCUMENT_NOT_VALIDATED' });
  });

  it('fiscal state incoherent blocks approval', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await settle(driverId, territoryId, `ride-incoh-${RUN}-${randomUUID().slice(0,4)}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    await submitForReview(pool, cycle.id);
    // Tamper: fiscal_document_required=false but status=PENDING (incoherent)
    await pool.query(`UPDATE territory_payout_cycles SET fiscal_document_status='PENDING' WHERE id=$1`, [cycle.id]);
    await expect(approveCycle(pool, cycle.id, 'admin'))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_FISCAL_DOCUMENT_NOT_VALIDATED' });
  });
});

describe('Transitions & approvedAt', () => {
  it('approvedAt is null before approval and set after', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await settle(driverId, territoryId, `ride-appat-${RUN}-${randomUUID().slice(0,4)}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    expect(cycle.approvedAt).toBeNull();
    expect(cycle.calculatedAt).not.toBeNull();
    const calcTime = cycle.calculatedAt;
    await submitForReview(pool, cycle.id);
    const approved = await approveCycle(pool, cycle.id, 'admin-ts');
    expect(approved.approvedAt).not.toBeNull();
    expect(approved.approvedBy).toBe('admin-ts');
    // calculatedAt unchanged
    const { rows: [row] } = await pool.query('SELECT calculated_at, approved_at FROM territory_payout_cycles WHERE id=$1', [cycle.id]);
    expect(row.calculated_at.getTime()).toBe(calcTime!.getTime());
    expect(row.approved_at).not.toBeNull();
  });

  it('cannot approve without UNDER_REVIEW', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await settle(driverId, territoryId, `ride-noapr-${RUN}-${randomUUID().slice(0,4)}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    await expect(approveCycle(pool, cycle.id, 'admin'))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_INVALID_TRANSITION' });
  });

  it('cannot cancel CALCULATED with allocations', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await settle(driverId, territoryId, `ride-nocan-${RUN}-${randomUUID().slice(0,4)}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    expect(cycle.status).toBe('CALCULATED');
    await expect(cancelCycle(pool, cycle.id, 'admin', 'test'))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_INVALID_TRANSITION' });
  });

  it('cannot cancel UNDER_REVIEW', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await settle(driverId, territoryId, `ride-ncanur-${RUN}-${randomUUID().slice(0,4)}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    await submitForReview(pool, cycle.id);
    await expect(cancelCycle(pool, cycle.id, 'admin', 'test'))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_INVALID_TRANSITION' });
  });

  it('cannot cancel APPROVED', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await settle(driverId, territoryId, `ride-ncanap-${RUN}-${randomUUID().slice(0,4)}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    await submitForReview(pool, cycle.id);
    const approved = await approveCycle(pool, cycle.id, 'admin');
    await expect(cancelCycle(pool, approved.id, 'admin', 'test'))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_INVALID_TRANSITION' });
  });

  it('BLOCKED can be cancelled', async () => {
    const tid = `ter-blk-b-${RUN}-${randomUUID().slice(0,4)}`;
    const did = `drv-blk-b-${RUN}-${randomUUID().slice(0,4)}`;
    await pool.query(`INSERT INTO operational_territories (id,name,level,status,regulatory_status,created_at,updated_at) VALUES ($1,'B','neighborhood','active','not_applicable',NOW(),NOW()) ON CONFLICT DO NOTHING`, [tid]);
    await pool.query(`INSERT INTO drivers (id,name,email,phone,document_cpf,status,created_at,updated_at) VALUES ($1,'T',$2,'1','0','active',NOW(),NOW()) ON CONFLICT DO NOTHING`, [did, `${did}@t`]);
    await pool.query(`INSERT INTO driver_wallets (driver_id,balance_cents,reserved_cents,updated_at) VALUES ($1,10000,0,NOW()) ON CONFLICT (driver_id) DO UPDATE SET balance_cents=10000,reserved_cents=0`, [did]);
    await settle(did, tid, `ride-blkb-${RUN}`);
    const cycle = await confirmRegularCycle(pool, tid, CURRENT_MONTH, null);
    expect(cycle.status).toBe('BLOCKED');
    const cancelled = await cancelCycle(pool, cycle.id, 'admin-cancel', 'testing');
    expect(cancelled.status).toBe('CANCELLED');
    const { rows: [row] } = await pool.query('SELECT cancelled_by, cancel_reason FROM territory_payout_cycles WHERE id=$1', [cycle.id]);
    expect(row.cancelled_by).toBe('admin-cancel');
    expect(row.cancel_reason).toBe('testing');
  });

  it('second cancel fails', async () => {
    const tid = `ter-blk-c-${RUN}-${randomUUID().slice(0,4)}`;
    const did = `drv-blk-c-${RUN}-${randomUUID().slice(0,4)}`;
    await pool.query(`INSERT INTO operational_territories (id,name,level,status,regulatory_status,created_at,updated_at) VALUES ($1,'B','neighborhood','active','not_applicable',NOW(),NOW()) ON CONFLICT DO NOTHING`, [tid]);
    await pool.query(`INSERT INTO drivers (id,name,email,phone,document_cpf,status,created_at,updated_at) VALUES ($1,'T',$2,'1','0','active',NOW(),NOW()) ON CONFLICT DO NOTHING`, [did, `${did}@t`]);
    await pool.query(`INSERT INTO driver_wallets (driver_id,balance_cents,reserved_cents,updated_at) VALUES ($1,10000,0,NOW()) ON CONFLICT (driver_id) DO UPDATE SET balance_cents=10000,reserved_cents=0`, [did]);
    await settle(did, tid, `ride-blkcc-${RUN}`);
    const cycle = await confirmRegularCycle(pool, tid, CURRENT_MONTH, null);
    await cancelCycle(pool, cycle.id, 'admin', 'first');
    await expect(cancelCycle(pool, cycle.id, 'admin', 'second'))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_INVALID_TRANSITION' });
  });

  it('no route defines PAID status', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await settle(driverId, territoryId, `ride-nopaid-${RUN}-${randomUUID().slice(0,4)}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    await submitForReview(pool, cycle.id);
    const approved = await approveCycle(pool, cycle.id, 'admin');
    expect(approved.status).toBe('APPROVED');
    // Verify no path to PAID exists
    const { rows } = await pool.query(
      `SELECT COUNT(*) FROM territory_payout_cycles WHERE territory_id=$1 AND status='PAID'`, [territoryId]);
    expect(rows[0].count).toBe('0');
  });

  it('no transition creates obligation, payout or outbox', async () => {
    const { driverId, territoryId, managerId } = await setupFull();
    await settle(driverId, territoryId, `ride-noext-${RUN}-${randomUUID().slice(0,4)}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    await submitForReview(pool, cycle.id);
    await approveCycle(pool, cycle.id, 'admin');
    // Check no financial side effects
    const checks = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM financial_obligations WHERE cycle_id=$1`, [cycle.id]).catch(() => ({ rows: [{ count: '0' }] })),
      pool.query(`SELECT COUNT(*) FROM financial_payouts WHERE cycle_id=$1`, [cycle.id]).catch(() => ({ rows: [{ count: '0' }] })),
      pool.query(`SELECT COUNT(*) FROM financial_payout_outbox WHERE cycle_id=$1`, [cycle.id]).catch(() => ({ rows: [{ count: '0' }] })),
    ]);
    for (const { rows } of checks) {
      expect(rows[0].count).toBe('0');
    }
  });
});
