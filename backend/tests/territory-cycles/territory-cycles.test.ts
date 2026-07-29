/**
 * Territory Payout Cycles Tests (Marco 3.2A - Commit 6)
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { previewCycle, confirmRegularCycle, confirmSupplementalCycle, submitForReview, approveCycle, cancelCycle } from '../../src/services/finance/territory/cycle.service';
import { isValidReferenceMonth, isMonthOutbound, isMonthLegacy, isLegacyPayAllowed } from '../../src/services/finance/territory/engine-selection';
import { applyBasisPoints, MANAGER_COMMISSION_RATE_BPS, PLATFORM_FEE_RATE_BPS } from '../../src/services/finance/territory/monetary';
import { WalletService } from '../../src/services/wallet-v2/wallet.service';
import { WalletSettlementService } from '../../src/services/wallet-v2/wallet-settlement.service';
import { FeeSplitService } from '../../src/services/wallet-v2/fee-split.service';
import { TerritoryLedgerService } from '../../src/services/wallet-v2/territory-ledger.service';
import { PendingDebitService } from '../../src/services/wallet-v2/pending-debit.service';

import { referenceMonthFromDate } from '../../src/services/wallet-v2/fee-split.service';

const RUN = randomUUID().slice(0, 8);
const CURRENT_MONTH = referenceMonthFromDate(new Date());
let pool: pg.Pool;

beforeAll(async () => { assertSafeFinanceDatabase(); pool = new pg.Pool({ connectionString: process.env.DATABASE_URL }); });
afterAll(async () => { await pool.end(); });
beforeEach(() => { process.env.MANAGER_PAYOUT_ENGINE = 'outbound'; process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-01'; });
afterEach(() => { delete process.env.MANAGER_PAYOUT_ENGINE; delete process.env.MANAGER_PAYOUT_CUTOVER_MONTH; });

async function setupDriverAndTerritory(balance = 10000n) {
  const did = `drv-cy-${RUN}-${randomUUID().slice(0, 4)}`;
  const tid = `ter-cy-${RUN}-${randomUUID().slice(0, 4)}`;
  const mid = `mgr-cy-${RUN}-${randomUUID().slice(0, 4)}`;
  await pool.query(`INSERT INTO drivers (id,name,email,phone,document_cpf,status,created_at,updated_at) VALUES ($1,'T',$2,'1','0','active',NOW(),NOW()) ON CONFLICT DO NOTHING`, [did, `${did}@t`]);
  await pool.query(`INSERT INTO driver_wallets (driver_id,balance_cents,reserved_cents,updated_at) VALUES ($1,$2,0,NOW()) ON CONFLICT (driver_id) DO UPDATE SET balance_cents=$2,reserved_cents=0`, [did, balance.toString()]);
  await pool.query(`INSERT INTO operational_territories (id,name,level,status,regulatory_status,created_at,updated_at) VALUES ($1,'T','neighborhood','active','not_applicable',NOW(),NOW()) ON CONFLICT DO NOTHING`, [tid]);
  await pool.query(`INSERT INTO admins (id,name,email,phone,password,role,created_at,updated_at) VALUES ($1,'M',$2,'1','h','regional_manager',NOW(),NOW()) ON CONFLICT DO NOTHING`, [mid, `${mid}@t`]);
  await pool.query(`INSERT INTO territory_manager_assignments (territory_id,admin_id,status,started_at,created_by,updated_at) VALUES ($1,$2,'active',NOW()-INTERVAL '30 days',$2,NOW())`, [tid, mid]);
  return { driverId: did, territoryId: tid, managerId: mid };
}

async function settleRide(driverId: string, territoryId: string, rideId: string, price = 10000n) {
  const w = new WalletService(pool); const f = new FeeSplitService(pool); const l = new TerritoryLedgerService(pool); const p = new PendingDebitService(pool);
  const svc = new WalletSettlementService(pool, w, f, l, p, w);
  await svc.handleReserve(rideId, driverId, applyBasisPoints(price, PLATFORM_FEE_RATE_BPS));
  return svc.settleRide({ rideId, driverId, finalPriceCents: price, reservedCents: applyBasisPoints(price, PLATFORM_FEE_RATE_BPS), territoryId });
}

describe('Engine Selection', () => {
  it('invalid months fail closed', () => {
    expect(isValidReferenceMonth('2026-13')).toBe(false);
    expect(isValidReferenceMonth('2026-00')).toBe(false);
    expect(isMonthOutbound('2026-13')).toBe(false);
    expect(isMonthLegacy('2026-13')).toBe(false);
    expect(isLegacyPayAllowed('2026-13')).toBe(false);
  });
  it('outbound without cutover fails closed', () => {
    delete process.env.MANAGER_PAYOUT_CUTOVER_MONTH;
    expect(isMonthOutbound(CURRENT_MONTH)).toBe(false);
    expect(isMonthLegacy(CURRENT_MONTH)).toBe(false);
  });
  it('disabled blocks everything', () => {
    process.env.MANAGER_PAYOUT_ENGINE = 'disabled';
    expect(isMonthOutbound(CURRENT_MONTH)).toBe(false);
    expect(isLegacyPayAllowed(CURRENT_MONTH)).toBe(false);
  });
  it('legacy allowed before cutover', () => {
    process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-08';
    expect(isMonthLegacy('2026-06')).toBe(true);
    expect(isLegacyPayAllowed('2026-06')).toBe(true);
  });
  it('legacy blocked after cutover', () => {
    process.env.MANAGER_PAYOUT_CUTOVER_MONTH = '2026-01';
    expect(isMonthLegacy(CURRENT_MONTH)).toBe(false);
    expect(isLegacyPayAllowed(CURRENT_MONTH)).toBe(false);
  });
});

describe('Preview Cycle', () => {
  it('does not persist cycle or allocations', async () => {
    const { driverId, territoryId, managerId } = await setupDriverAndTerritory();
    const rideId = `ride-prev-${RUN}-${randomUUID().slice(0, 4)}`;
    await settleRide(driverId, territoryId, rideId);
    const preview = await previewCycle(pool, territoryId, CURRENT_MONTH, managerId);
    expect(preview.grossPlatformFeeCents).toBeGreaterThan(0n);
    // No cycle persisted
    const { rows } = await pool.query("SELECT COUNT(*) FROM territory_payout_cycles WHERE territory_id=$1 AND reference_month=$2", [territoryId, CURRENT_MONTH]);
    expect(rows[0].count).toBe('0');
    // No allocations
    const { rows: allocs } = await pool.query("SELECT COUNT(*) FROM territory_cycle_allocations WHERE cycle_id IN (SELECT id FROM territory_payout_cycles WHERE territory_id=$1)", [territoryId]);
    expect(allocs[0].count).toBe('0');
  });
});

describe('Confirm Regular Cycle', () => {
  it('creates CALCULATED with allocations', async () => {
    const { driverId, territoryId, managerId } = await setupDriverAndTerritory();
    await settleRide(driverId, territoryId, `ride-reg-${RUN}-1`);
    await settleRide(driverId, territoryId, `ride-reg-${RUN}-2`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    expect(cycle.status).toBe('CALCULATED');
    expect(cycle.cycleType).toBe('REGULAR');
    expect(cycle.grossManagerCommissionCents).toBeGreaterThan(0n);
    // Allocations created
    const { rows } = await pool.query('SELECT COUNT(*) FROM territory_cycle_allocations WHERE cycle_id=$1', [cycle.id]);
    expect(Number(rows[0].count)).toBeGreaterThanOrEqual(4); // 2 rides × 2 entries each
  });

  it('is idempotent', async () => {
    const { driverId, territoryId, managerId } = await setupDriverAndTerritory();
    await settleRide(driverId, territoryId, `ride-idem-${RUN}`);
    const c1 = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    const c2 = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    expect(c1.id).toBe(c2.id);
  });

  it('two concurrent confirms produce one cycle', async () => {
    const { driverId, territoryId, managerId } = await setupDriverAndTerritory();
    await settleRide(driverId, territoryId, `ride-conc-cy-${RUN}`);
    const [r1, r2] = await Promise.all([
      confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId),
      confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId),
    ]);
    expect(r1.id).toBe(r2.id);
    const { rows } = await pool.query("SELECT COUNT(*) FROM territory_payout_cycles WHERE territory_id=$1 AND reference_month=$2 AND status<>'CANCELLED'", [territoryId, CURRENT_MONTH]);
    expect(rows[0].count).toBe('1');
  });

  it('CALCULATED cannot be cancelled', async () => {
    const { driverId, territoryId, managerId } = await setupDriverAndTerritory();
    await settleRide(driverId, territoryId, `ride-nocancel-${RUN}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    await expect(cancelCycle(pool, cycle.id, 'admin', 'test')).rejects.toMatchObject({ code: 'TERRITORY_CYCLE_INVALID_TRANSITION' });
  });

  it('BLOCKED without manager has no allocations', async () => {
    const tid = `ter-nomanager-cy-${RUN}`;
    const did = `drv-nomanager-cy-${RUN}`;
    await pool.query(`INSERT INTO operational_territories (id,name,level,status,regulatory_status,created_at,updated_at) VALUES ($1,'NM','neighborhood','active','not_applicable',NOW(),NOW()) ON CONFLICT DO NOTHING`, [tid]);
    await pool.query(`INSERT INTO drivers (id,name,email,phone,document_cpf,status,created_at,updated_at) VALUES ($1,'T',$2,'1','0','active',NOW(),NOW()) ON CONFLICT DO NOTHING`, [did, `${did}@t`]);
    await pool.query(`INSERT INTO driver_wallets (driver_id,balance_cents,reserved_cents,updated_at) VALUES ($1,10000,0,NOW()) ON CONFLICT (driver_id) DO UPDATE SET balance_cents=10000,reserved_cents=0`, [did]);
    await settleRide(did, tid, `ride-blocked-${RUN}`);
    const cycle = await confirmRegularCycle(pool, tid, CURRENT_MONTH, null);
    expect(cycle.status).toBe('BLOCKED');
    const { rows } = await pool.query('SELECT COUNT(*) FROM territory_cycle_allocations WHERE cycle_id=$1', [cycle.id]);
    expect(rows[0].count).toBe('0');
  });

  it('BLOCKED can be cancelled', async () => {
    const tid = `ter-blkcancel-${RUN}`;
    const did = `drv-blkcancel-${RUN}`;
    await pool.query(`INSERT INTO operational_territories (id,name,level,status,regulatory_status,created_at,updated_at) VALUES ($1,'BC','neighborhood','active','not_applicable',NOW(),NOW()) ON CONFLICT DO NOTHING`, [tid]);
    await pool.query(`INSERT INTO drivers (id,name,email,phone,document_cpf,status,created_at,updated_at) VALUES ($1,'T',$2,'1','0','active',NOW(),NOW()) ON CONFLICT DO NOTHING`, [did, `${did}@t`]);
    await pool.query(`INSERT INTO driver_wallets (driver_id,balance_cents,reserved_cents,updated_at) VALUES ($1,10000,0,NOW()) ON CONFLICT (driver_id) DO UPDATE SET balance_cents=10000,reserved_cents=0`, [did]);
    await settleRide(did, tid, `ride-blkcancel-${RUN}`);
    const cycle = await confirmRegularCycle(pool, tid, CURRENT_MONTH, null);
    const cancelled = await cancelCycle(pool, cycle.id, 'admin', 'test');
    expect(cancelled.status).toBe('CANCELLED');
  });
});

describe('State Transitions', () => {
  it('CALCULATED → UNDER_REVIEW → APPROVED', async () => {
    const { driverId, territoryId, managerId } = await setupDriverAndTerritory();
    await settleRide(driverId, territoryId, `ride-trans-${RUN}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    const reviewed = await submitForReview(pool, cycle.id);
    expect(reviewed.status).toBe('UNDER_REVIEW');
    const approved = await approveCycle(pool, cycle.id, 'admin-1');
    expect(approved.status).toBe('APPROVED');
  });
  it('cannot approve without review', async () => {
    const { driverId, territoryId, managerId } = await setupDriverAndTerritory();
    await settleRide(driverId, territoryId, `ride-noappr-${RUN}`);
    const cycle = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    await expect(approveCycle(pool, cycle.id, 'admin')).rejects.toMatchObject({ code: 'TERRITORY_CYCLE_INVALID_TRANSITION' });
  });
});

describe('Supplemental Cycle', () => {
  it('captures only new unallocated entries', async () => {
    const { driverId, territoryId, managerId } = await setupDriverAndTerritory(50000n);
    await settleRide(driverId, territoryId, `ride-supp1-${RUN}`);
    const regular = await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    // Settle another ride
    await settleRide(driverId, territoryId, `ride-supp2-${RUN}`);
    const supp = await confirmSupplementalCycle(pool, territoryId, CURRENT_MONTH, managerId);
    expect(supp).not.toBeNull();
    expect(supp!.cycleType).toBe('SUPPLEMENTAL');
    expect(supp!.parentCycleId).toBe(regular.id);
    expect(supp!.sequenceNumber).toBe(2);
    expect(supp!.grossManagerCommissionCents).toBeGreaterThan(0n);
  });

  it('returns null when no new entries', async () => {
    const { driverId, territoryId, managerId } = await setupDriverAndTerritory();
    await settleRide(driverId, territoryId, `ride-suppnone-${RUN}`);
    await confirmRegularCycle(pool, territoryId, CURRENT_MONTH, managerId);
    const supp = await confirmSupplementalCycle(pool, territoryId, CURRENT_MONTH, managerId);
    expect(supp).toBeNull();
  });

  it('requires existing REGULAR', async () => {
    const { territoryId, managerId } = await setupDriverAndTerritory();
    await expect(confirmSupplementalCycle(pool, territoryId, CURRENT_MONTH, managerId))
      .rejects.toMatchObject({ code: 'TERRITORY_CYCLE_NO_REGULAR_PARENT' });
  });

  it('managerId null returns null', async () => {
    const result = await confirmSupplementalCycle(pool, 'any', CURRENT_MONTH, null);
    expect(result).toBeNull();
  });
});
