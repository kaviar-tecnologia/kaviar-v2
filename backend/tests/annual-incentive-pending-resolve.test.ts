/**
 * Annual Incentive — pending_resolve accumulated calculation tests
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { assertSafeFinanceDatabase } from '../src/lib/assert-safe-finance-db';
import { WalletService } from '../src/services/wallet-v2/wallet.service';
import { PendingDebitService } from '../src/services/wallet-v2/pending-debit.service';
import { AnnualIncentiveLedgerService } from '../src/services/finance/annual-incentive-ledger.service';
import { AnnualIncentiveShadowService, DirectPendingDebitExecutor } from '../src/services/finance/annual-incentive-shadow.service';
import { cleanupTestFixtures, assertTriggerEnabled } from './helpers/cleanup-incentive-fixtures';

assertSafeFinanceDatabase();
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TEST_DRIVER = `test-pend-resolve-${Date.now()}`;
let counter = 0;
function nextRideId(): string { return `pr-ride-${Date.now()}-${++counter}`; }

let walletSvc: WalletService;
let pendingSvc: PendingDebitService;
let ledgerSvc: AnnualIncentiveLedgerService;
let shadowSvc: AnnualIncentiveShadowService;
let directExec: DirectPendingDebitExecutor;
const noopFeeSplit = { markCollected: () => {} };
const noopTerritory = { recordFeeShare: () => {} };

describe('pending_resolve accumulated incentive', () => {
  beforeAll(async () => {
    walletSvc = new WalletService(pool);
    pendingSvc = new PendingDebitService(pool);
    ledgerSvc = new AnnualIncentiveLedgerService(pool);
    shadowSvc = new AnnualIncentiveShadowService(pool, walletSvc, ledgerSvc);
    directExec = new DirectPendingDebitExecutor(walletSvc);

    await pool.query(`INSERT INTO drivers (id, name, email, status, updated_at) VALUES ($1, $2, $3, 'approved', NOW()) ON CONFLICT (id) DO NOTHING`, [TEST_DRIVER, `PR Test`, `pr-${Date.now()}@test`]);
    await pool.query(`INSERT INTO driver_wallets (driver_id, balance_cents, reserved_cents, updated_at) VALUES ($1, 100000, 0, NOW()) ON CONFLICT (driver_id) DO UPDATE SET balance_cents = 100000, reserved_cents = 0`, [TEST_DRIVER]);
  });

  afterAll(async () => {
    await cleanupTestFixtures(pool, TEST_DRIVER);
    await assertTriggerEnabled(pool);
    await pool.end();
  });

  beforeEach(() => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
  });

  async function resetBalance(b = 100000) {
    await pool.query('UPDATE driver_wallets SET balance_cents = $2, reserved_cents = 0 WHERE driver_id = $1', [TEST_DRIVER, b]);
  }

  async function setupPartialRide(rideId: string, feeDebitAmount: bigint, totalFee: bigint) {
    await shadowSvc.debitFee(TEST_DRIVER, feeDebitAmount, feeDebitAmount, rideId);
    await pendingSvc.create({ rideId, driverId: TEST_DRIVER, finalPriceCents: BigInt(10000), feeAmountCents: totalFee, reservedCents: feeDebitAmount, feeCollectedCents: feeDebitAmount });
  }

  // ═══ ACCUMULATED CALCULATION ═══

  it('1. 500 + 1300 → total incentive 180', async () => {
    await resetBalance();
    const rideId = nextRideId();
    await setupPartialRide(rideId, BigInt(500), BigInt(1800));
    await pendingSvc.resolveOnRecharge(TEST_DRIVER, shadowSvc, noopFeeSplit, noopTerritory);
    const r = await pool.query("SELECT SUM(amount_cents)::bigint AS total FROM annual_incentive_ledger WHERE source_id = $1 AND event_type = 'ACCRUAL'", [rideId]);
    expect(BigInt(r.rows[0].total)).toBe(180n);
  });

  it('2. first accrual 50 + second 130 = 180', async () => {
    await resetBalance();
    const rideId = nextRideId();
    await setupPartialRide(rideId, BigInt(500), BigInt(1800));
    const first = await pool.query("SELECT amount_cents FROM annual_incentive_ledger WHERE source_id = $1 AND source_type = 'FEE_DEBIT'", [rideId]);
    expect(BigInt(first.rows[0].amount_cents)).toBe(50n);
    await pendingSvc.resolveOnRecharge(TEST_DRIVER, shadowSvc, noopFeeSplit, noopTerritory);
    const second = await pool.query("SELECT amount_cents FROM annual_incentive_ledger WHERE source_id = $1 AND source_type = 'PENDING_RESOLVE'", [rideId]);
    expect(BigInt(second.rows[0].amount_cents)).toBe(130n);
  });

  it('3. 6 + 12 → total incentive 1', async () => {
    await resetBalance();
    const rideId = nextRideId();
    await setupPartialRide(rideId, BigInt(6), BigInt(18));
    await pendingSvc.resolveOnRecharge(TEST_DRIVER, shadowSvc, noopFeeSplit, noopTerritory);
    const r = await pool.query("SELECT SUM(amount_cents)::bigint AS total FROM annual_incentive_ledger WHERE source_id = $1 AND event_type = 'ACCRUAL'", [rideId]);
    expect(BigInt(r.rows[0].total)).toBe(1n);
  });

  it('4. 1 + 9 → total incentive 1', async () => {
    await resetBalance();
    const rideId = nextRideId();
    await setupPartialRide(rideId, BigInt(1), BigInt(10));
    await pendingSvc.resolveOnRecharge(TEST_DRIVER, shadowSvc, noopFeeSplit, noopTerritory);
    const r = await pool.query("SELECT SUM(amount_cents)::bigint AS total FROM annual_incentive_ledger WHERE source_id = $1 AND event_type = 'ACCRUAL'", [rideId]);
    expect(BigInt(r.rows[0].total)).toBe(1n);
  });

  it('5. 0 + full pending 18 → incentive 1', async () => {
    await resetBalance();
    const rideId = nextRideId();
    await pendingSvc.create({ rideId, driverId: TEST_DRIVER, finalPriceCents: BigInt(100), feeAmountCents: BigInt(18), reservedCents: BigInt(0), feeCollectedCents: BigInt(0) });
    await pendingSvc.resolveOnRecharge(TEST_DRIVER, shadowSvc, noopFeeSplit, noopTerritory);
    const r = await pool.query("SELECT SUM(amount_cents)::bigint AS total FROM annual_incentive_ledger WHERE source_id = $1 AND event_type = 'ACCRUAL'", [rideId]);
    expect(BigInt(r.rows[0].total)).toBe(1n);
  });

  it('6. 1800 + 0 → no posterior accrual', async () => {
    await resetBalance();
    const rideId = nextRideId();
    await shadowSvc.debitFee(TEST_DRIVER, BigInt(1800), BigInt(1800), rideId);
    const r = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE source_id = $1 AND source_type = 'PENDING_RESOLVE'", [rideId]);
    expect(r.rows[0].cnt).toBe(0);
  });

  // ═══ FLAGS ═══

  it('7. flags absent: resolves without accrual', async () => {
    delete process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED;
    delete process.env.ANNUAL_INCENTIVE_WRITE_ENABLED;
    await resetBalance();
    const rideId = nextRideId();
    await pendingSvc.create({ rideId, driverId: TEST_DRIVER, finalPriceCents: BigInt(10000), feeAmountCents: BigInt(1800), reservedCents: BigInt(0), feeCollectedCents: BigInt(0) });
    await pendingSvc.resolveOnRecharge(TEST_DRIVER, shadowSvc, noopFeeSplit, noopTerritory);
    const ail = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(ail.rows[0].cnt).toBe(0);
    const pd = await pool.query("SELECT status FROM pending_debits WHERE ride_id = $1", [rideId]);
    expect(pd.rows[0].status).toBe('resolved');
  });

  it('8. SHADOW=false WRITE=true: no accrual', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'false';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance();
    const rideId = nextRideId();
    await pendingSvc.create({ rideId, driverId: TEST_DRIVER, finalPriceCents: BigInt(10000), feeAmountCents: BigInt(1800), reservedCents: BigInt(0), feeCollectedCents: BigInt(0) });
    await pendingSvc.resolveOnRecharge(TEST_DRIVER, shadowSvc, noopFeeSplit, noopTerritory);
    const ail = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(ail.rows[0].cnt).toBe(0);
  });

  it('9. SHADOW=true WRITE=false: fails, no pending_resolve', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'false';
    await resetBalance();
    const rideId = nextRideId();
    await pendingSvc.create({ rideId, driverId: TEST_DRIVER, finalPriceCents: BigInt(10000), feeAmountCents: BigInt(1800), reservedCents: BigInt(0), feeCollectedCents: BigInt(0) });
    await expect(pendingSvc.resolveOnRecharge(TEST_DRIVER, shadowSvc, noopFeeSplit, noopTerritory))
      .rejects.toThrow('SHADOW_CONFIGURATION_INVALID');
    const pd = await pool.query("SELECT status FROM pending_debits WHERE ride_id = $1", [rideId]);
    expect(pd.rows[0].status).toBe('pending');
  });

  it('10. both true: creates resolve and incremental accrual', async () => {
    await resetBalance();
    const rideId = nextRideId();
    await setupPartialRide(rideId, BigInt(500), BigInt(1800));
    await pendingSvc.resolveOnRecharge(TEST_DRIVER, shadowSvc, noopFeeSplit, noopTerritory);
    const pd = await pool.query("SELECT status FROM pending_debits WHERE ride_id = $1", [rideId]);
    expect(pd.rows[0].status).toBe('resolved');
    const ail = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE source_id = $1 AND source_type = 'PENDING_RESOLVE'", [rideId]);
    expect(ail.rows[0].cnt).toBe(1);
  });

  // ═══ IDEMPOTENCY ═══

  it('13. reprocessing does not duplicate', async () => {
    await resetBalance();
    const rideId = nextRideId();
    await setupPartialRide(rideId, BigInt(500), BigInt(1800));
    await pendingSvc.resolveOnRecharge(TEST_DRIVER, shadowSvc, noopFeeSplit, noopTerritory);
    await pendingSvc.resolveOnRecharge(TEST_DRIVER, shadowSvc, noopFeeSplit, noopTerritory);
    const ail = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE source_id = $1 AND source_type = 'PENDING_RESOLVE'", [rideId]);
    expect(ail.rows[0].cnt).toBe(1);
  });

  // ═══ ROLLBACK ═══

  it('18. insufficient balance: no accrual, pending stays pending', async () => {
    await resetBalance(1);
    const rideId = nextRideId();
    await pendingSvc.create({ rideId, driverId: TEST_DRIVER, finalPriceCents: BigInt(10000), feeAmountCents: BigInt(1800), reservedCents: BigInt(0), feeCollectedCents: BigInt(0) });
    await pendingSvc.resolveOnRecharge(TEST_DRIVER, shadowSvc, noopFeeSplit, noopTerritory);
    const pd = await pool.query("SELECT status FROM pending_debits WHERE ride_id = $1", [rideId]);
    expect(pd.rows[0].status).toBe('pending');
    const ail = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(ail.rows[0].cnt).toBe(0);
  });

  // ═══ CONCURRENCY ═══

  it('20. concurrent resolutions produce one entry', async () => {
    await resetBalance();
    const rideId = nextRideId();
    await pendingSvc.create({ rideId, driverId: TEST_DRIVER, finalPriceCents: BigInt(10000), feeAmountCents: BigInt(1800), reservedCents: BigInt(0), feeCollectedCents: BigInt(0) });
    await Promise.allSettled([
      pendingSvc.resolveOnRecharge(TEST_DRIVER, shadowSvc, noopFeeSplit, noopTerritory),
      pendingSvc.resolveOnRecharge(TEST_DRIVER, shadowSvc, noopFeeSplit, noopTerritory),
    ]);
    const ail = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(ail.rows[0].cnt).toBeLessThanOrEqual(1);
  });

  // ═══ MULTI-RIDE ═══

  it('21. one recharge resolves two rides separately', async () => {
    await resetBalance();
    const rideA = nextRideId();
    const rideB = nextRideId();
    await pendingSvc.create({ rideId: rideA, driverId: TEST_DRIVER, finalPriceCents: BigInt(10000), feeAmountCents: BigInt(1800), reservedCents: BigInt(0), feeCollectedCents: BigInt(0) });
    await pendingSvc.create({ rideId: rideB, driverId: TEST_DRIVER, finalPriceCents: BigInt(5000), feeAmountCents: BigInt(900), reservedCents: BigInt(0), feeCollectedCents: BigInt(0) });
    await pendingSvc.resolveOnRecharge(TEST_DRIVER, shadowSvc, noopFeeSplit, noopTerritory);
    const ailA = await pool.query("SELECT amount_cents FROM annual_incentive_ledger WHERE source_id = $1", [rideA]);
    const ailB = await pool.query("SELECT amount_cents FROM annual_incentive_ledger WHERE source_id = $1", [rideB]);
    expect(BigInt(ailA.rows[0].amount_cents)).toBe(180n);
    expect(BigInt(ailB.rows[0].amount_cents)).toBe(90n);
  });

  it('22. failure on second does not undo first', async () => {
    await resetBalance(2000);
    const rideA = nextRideId();
    const rideB = nextRideId();
    await pendingSvc.create({ rideId: rideA, driverId: TEST_DRIVER, finalPriceCents: BigInt(10000), feeAmountCents: BigInt(1800), reservedCents: BigInt(0), feeCollectedCents: BigInt(0) });
    await pendingSvc.create({ rideId: rideB, driverId: TEST_DRIVER, finalPriceCents: BigInt(100000), feeAmountCents: BigInt(18000), reservedCents: BigInt(0), feeCollectedCents: BigInt(0) });
    await pendingSvc.resolveOnRecharge(TEST_DRIVER, shadowSvc, noopFeeSplit, noopTerritory);
    const pdA = await pool.query("SELECT status FROM pending_debits WHERE ride_id = $1", [rideA]);
    const pdB = await pool.query("SELECT status FROM pending_debits WHERE ride_id = $1", [rideB]);
    expect(pdA.rows[0].status).toBe('resolved');
    expect(pdB.rows[0].status).toBe('pending');
  });

  // ═══ ISOLATION & CLEANUP ═══

  it('28. legacy unaltered', async () => {
    const r = await pool.query("SELECT COUNT(*)::int AS cnt FROM family_return_accruals WHERE driver_id = $1", [TEST_DRIVER]);
    expect(r.rows[0].cnt).toBe(0);
  });

  it('cleanup: trigger remains enabled after all tests', async () => {
    await assertTriggerEnabled(pool);
  });
});
