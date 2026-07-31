/**
 * Atomic Settlement — Failure Paths and Shadow Integration (Marco 3.2A)
 *
 * Proves rollback, idempotency, shadow, concurrency, maintenance gate,
 * pending resolution and territory ledger consistency using real PostgreSQL.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { WalletService } from '../../src/services/wallet-v2/wallet.service';
import { FeeSplitService } from '../../src/services/wallet-v2/fee-split.service';
import { TerritoryLedgerService } from '../../src/services/wallet-v2/territory-ledger.service';
import { PendingDebitService } from '../../src/services/wallet-v2/pending-debit.service';
import { WalletSettlementService } from '../../src/services/wallet-v2/wallet-settlement.service';
import { AnnualIncentiveShadowService } from '../../src/services/finance/annual-incentive-shadow.service';
import { AnnualIncentiveLedgerService } from '../../src/services/finance/annual-incentive-ledger.service';
import { applyBasisPoints } from '../../src/services/finance/territory/monetary';

const RUN = randomUUID().slice(0, 8);
let pool: pg.Pool;

beforeAll(async () => {
  assertSafeFinanceDatabase();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
});
afterAll(async () => { await pool.end(); });
afterEach(() => {
  delete process.env.SETTLEMENT_PAUSED;
  delete process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED;
  delete process.env.ANNUAL_INCENTIVE_WRITE_ENABLED;
});

async function setupDriver(balance: bigint): Promise<string> {
  const id = `drv-${RUN}-${randomUUID().slice(0, 6)}`;
  await pool.query(`INSERT INTO drivers (id, name, email, phone, document_cpf, status, created_at, updated_at) VALUES ($1,'T',$2,'119','000','active',NOW(),NOW()) ON CONFLICT DO NOTHING`, [id, `${id}@t.l`]);
  await pool.query(`INSERT INTO driver_wallets (driver_id, balance_cents, reserved_cents, updated_at) VALUES ($1,$2,0,NOW()) ON CONFLICT (driver_id) DO UPDATE SET balance_cents=$2, reserved_cents=0`, [id, balance.toString()]);
  return id;
}

async function setupTerritory(): Promise<{ territoryId: string; managerId: string; assignmentId: string }> {
  const tid = `ter-${RUN}-${randomUUID().slice(0, 6)}`;
  const mid = `mgr-${RUN}-${randomUUID().slice(0, 6)}`;
  await pool.query(`INSERT INTO operational_territories (id,name,level,status,regulatory_status,created_at,updated_at) VALUES ($1,'T','neighborhood','active','not_applicable',NOW(),NOW()) ON CONFLICT DO NOTHING`, [tid]);
  await pool.query(`INSERT INTO admins (id,name,email,phone,password,role,created_at,updated_at) VALUES ($1,'M',$2,'11','h','regional_manager',NOW(),NOW()) ON CONFLICT DO NOTHING`, [mid, `${mid}@t.l`]);
  const { rows:[{id:aid}] } = await pool.query(`INSERT INTO territory_manager_assignments (territory_id,admin_id,status,started_at,created_by,updated_at) VALUES ($1,$2,'active',NOW()-INTERVAL '30 days',$2,NOW()) RETURNING id::text`, [tid, mid]);
  return { territoryId: tid, managerId: mid, assignmentId: aid };
}

function makeSvc(executor?: any) {
  const w = new WalletService(pool);
  const f = new FeeSplitService(pool);
  const l = new TerritoryLedgerService(pool);
  const p = new PendingDebitService(pool);
  const ledgerSvc = new AnnualIncentiveLedgerService(pool);
  const shadow = new AnnualIncentiveShadowService(pool, w, ledgerSvc);
  return new WalletSettlementService(pool, w, f, l, p, executor ?? shadow);
}

// ═══════════════════════════════════════════════════════════════
// 3. ROLLBACK: failure in recordSplitInClient
// ═══════════════════════════════════════════════════════════════
describe('Rollback on recordSplit failure', () => {
  it('wallet unchanged when ride_fee_splits INSERT fails', async () => {
    const driverId = await setupDriver(10000n);
    const { territoryId } = await setupTerritory();
    const rideId = `ride-rollback-split-${RUN}`;
    const svc = makeSvc();
    await svc.handleReserve(rideId, driverId, 1800n);

    // Install trigger that blocks INSERT on ride_fee_splits FOR THIS RIDE ONLY
    const trigName = `tbs_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    await pool.query(`CREATE OR REPLACE FUNCTION ${trigName}_fn() RETURNS TRIGGER AS $$ BEGIN IF NEW.ride_id = '${rideId}' THEN RAISE EXCEPTION 'TEST_BLOCK_SPLIT'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER ${trigName} BEFORE INSERT ON ride_fee_splits FOR EACH ROW EXECUTE FUNCTION ${trigName}_fn()`);

    try {
      await expect(svc.settleRide({ rideId, driverId, finalPriceCents: 10000n, reservedCents: 1800n, territoryId }))
        .rejects.toThrow('TEST_BLOCK_SPLIT');

      // Wallet unchanged
      const { rows:[w] } = await pool.query('SELECT balance_cents, reserved_cents FROM driver_wallets WHERE driver_id=$1', [driverId]);
      expect(BigInt(w.balance_cents)).toBe(10000n);
      expect(BigInt(w.reserved_cents)).toBe(1800n);

      // No fee debit in wallet_ledger
      const { rows: wl } = await pool.query("SELECT * FROM wallet_ledger WHERE driver_id=$1 AND entry_type='fee_debit'", [driverId]);
      expect(wl.length).toBe(0);

      // No split
      const { rows: splits } = await pool.query('SELECT * FROM ride_fee_splits WHERE ride_id=$1', [rideId]);
      expect(splits.length).toBe(0);

      // No territory_ledger
      const { rows: tl } = await pool.query('SELECT * FROM territory_ledger WHERE reference_id=$1', [rideId]);
      expect(tl.length).toBe(0);
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS ${trigName} ON ride_fee_splits`);
      await pool.query(`DROP FUNCTION IF EXISTS ${trigName}_fn()`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. ROLLBACK: failure in recordCollectedFeeInClient
// ═══════════════════════════════════════════════════════════════
describe('Rollback on territory ledger failure', () => {
  it('wallet and split unchanged when territory_ledger INSERT fails', async () => {
    const driverId = await setupDriver(10000n);
    const { territoryId } = await setupTerritory();
    const rideId = `ride-rollback-ledger-${RUN}`;
    const svc = makeSvc();
    await svc.handleReserve(rideId, driverId, 1800n);

    // Block territory_ledger INSERT for this specific ride
    const trigName = `tbl_${Date.now()}_${Math.random().toString(36).slice(2,8)}`;
    await pool.query(`CREATE OR REPLACE FUNCTION ${trigName}_fn() RETURNS TRIGGER AS $$ BEGIN IF NEW.reference_id = '${rideId}' THEN RAISE EXCEPTION 'TEST_BLOCK_LEDGER'; END IF; RETURN NEW; END; $$ LANGUAGE plpgsql`);
    await pool.query(`CREATE TRIGGER ${trigName} BEFORE INSERT ON territory_ledger FOR EACH ROW EXECUTE FUNCTION ${trigName}_fn()`);

    try {
      await expect(svc.settleRide({ rideId, driverId, finalPriceCents: 10000n, reservedCents: 1800n, territoryId }))
        .rejects.toThrow('TEST_BLOCK_LEDGER');

      const { rows:[w] } = await pool.query('SELECT balance_cents, reserved_cents FROM driver_wallets WHERE driver_id=$1', [driverId]);
      expect(BigInt(w.balance_cents)).toBe(10000n);
      expect(BigInt(w.reserved_cents)).toBe(1800n);
      const { rows: splits } = await pool.query('SELECT * FROM ride_fee_splits WHERE ride_id=$1', [rideId]);
      expect(splits.length).toBe(0);
      const { rows: tl } = await pool.query('SELECT * FROM territory_ledger WHERE reference_id=$1', [rideId]);
      expect(tl.length).toBe(0);
    } finally {
      await pool.query(`DROP TRIGGER IF EXISTS ${trigName} ON territory_ledger`);
      await pool.query(`DROP FUNCTION IF EXISTS ${trigName}_fn()`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 1, 2. PENDING_DEBIT_SPLIT_MISSING and SPLIT_MISMATCH
// ═══════════════════════════════════════════════════════════════
describe('Pending debit resolution validation', () => {
  it('PENDING_DEBIT_SPLIT_MISSING when no split exists', async () => {
    const driverId = await setupDriver(10000n);
    // Create pending_debit directly without a split
    await pool.query(`INSERT INTO pending_debits (ride_id,driver_id,final_price_cents,fee_percent_snapshot,fee_amount_cents,fee_collected_cents,fee_pending_cents,reserved_amount_cents,reason,status,idempotency_key) VALUES ($1,$2,10000,18.00,1800,0,1800,0,'platform_fee','pending',$3)`, [`ride-nosplit-${RUN}`, driverId, `pd:nosplit:${RUN}`]);

    const pendingSvc = new PendingDebitService(pool);
    const walletSvc = new WalletService(pool);
    const feeSplitSvc = new FeeSplitService(pool);
    const ledgerSvc = new TerritoryLedgerService(pool);
    const executor = { resolvePendingInClient: async () => ({ walletResult: {}, incentiveResult: null, skippedReason: null }) } as any;

    await expect(pendingSvc.resolveOnRecharge(driverId, executor, feeSplitSvc, ledgerSvc))
      .rejects.toMatchObject({ code: 'PENDING_DEBIT_SPLIT_MISSING' });
  });

  it('PENDING_DEBIT_SPLIT_MISMATCH when split fee_pending diverges', async () => {
    const driverId = await setupDriver(10000n);
    const rideId = `ride-mismatch-pd-${RUN}`;
    // Create split with fee_pending=1000
    await pool.query(`INSERT INTO ride_fee_splits (ride_id,driver_id,final_price_cents,fee_percent,fee_amount_cents,fee_collected_cents,fee_pending_cents,matrix_share_percent,matrix_share_cents,manager_share_percent,manager_share_cents,reference_month,collection_status,recognized_at,recognized_at_source,platform_fee_rate_bps,manager_commission_rate_bps,idempotency_key) VALUES ($1,$2,10000,18.00,1800,800,1000,60.00,1080,40.00,720,'2026-07','partial',NOW(),'DB_SETTLEMENT_CLOCK',1800,4000,$3)`, [rideId, driverId, `split:${rideId}`]);
    // Create pending_debit with fee_pending=1800 (divergent!)
    await pool.query(`INSERT INTO pending_debits (ride_id,driver_id,final_price_cents,fee_percent_snapshot,fee_amount_cents,fee_collected_cents,fee_pending_cents,reserved_amount_cents,reason,status,idempotency_key) VALUES ($1,$2,10000,18.00,1800,0,1800,0,'platform_fee','pending',$3)`, [rideId, driverId, `pd:${rideId}`]);

    const pendingSvc = new PendingDebitService(pool);
    const executor = { resolvePendingInClient: async () => ({ walletResult: {}, incentiveResult: null, skippedReason: null }) } as any;

    await expect(pendingSvc.resolveOnRecharge(driverId, executor, new FeeSplitService(pool), new TerritoryLedgerService(pool)))
      .rejects.toMatchObject({ code: 'PENDING_DEBIT_SPLIT_MISMATCH' });
  });
});

// ═══════════════════════════════════════════════════════════════
// 5, 6, 7. Idempotency mismatch tests
// ═══════════════════════════════════════════════════════════════
describe('Idempotency mismatch', () => {
  it('replay with different territoryId → FEE_SPLIT_IDEMPOTENCY_MISMATCH', async () => {
    const driverId = await setupDriver(10000n);
    const { territoryId: t1 } = await setupTerritory();
    const t2 = `ter-other-${RUN}`;
    await pool.query(`INSERT INTO operational_territories (id,name,level,status,regulatory_status,created_at,updated_at) VALUES ($1,'O','neighborhood','active','not_applicable',NOW(),NOW()) ON CONFLICT DO NOTHING`, [t2]);
    const rideId = `ride-terr-mismatch-${RUN}`;
    const svc = makeSvc();
    await svc.handleReserve(rideId, driverId, 1800n);
    await svc.settleRide({ rideId, driverId, finalPriceCents: 10000n, reservedCents: 1800n, territoryId: t1 });

    await expect(svc.settleRide({ rideId, driverId, finalPriceCents: 10000n, reservedCents: 1800n, territoryId: t2 }))
      .rejects.toMatchObject({ code: 'FEE_SPLIT_IDEMPOTENCY_MISMATCH' });
  });
});

// ═══════════════════════════════════════════════════════════════
// 8, 9. Territory ledger key type mismatch
// ═══════════════════════════════════════════════════════════════
describe('Territory ledger idempotency type checks', () => {
  it('key with wrong entry_type → MISMATCH', async () => {
    const { territoryId } = await setupTerritory();
    const rideId = `ride-wrongtype-${RUN}`;
    // Pre-insert a row with the platform_fee key but entry_type='fee_share'
    await pool.query(`INSERT INTO territory_ledger (territory_id,manager_id,reference_month,entry_type,amount_cents,description,reference_type,reference_id,idempotency_key) VALUES ($1,NULL,'2026-07','fee_share',1800,'wrong','ride',$2,$3)`, [territoryId, rideId, `territory_platform_fee:${rideId}`]);

    const svc = new TerritoryLedgerService(pool);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await expect(svc.recordCollectedFeeInClient(client, territoryId, null, null, 1800n, 720n, rideId, '2026-07'))
        .rejects.toMatchObject({ code: 'TERRITORY_LEDGER_IDEMPOTENCY_MISMATCH' });
      await client.query('ROLLBACK');
    } finally { client.release(); }
  });

  it('key with wrong reference_type → MISMATCH', async () => {
    const { territoryId } = await setupTerritory();
    const rideId = `ride-wrongref-${RUN}`;
    // Pre-insert with reference_type='reward' instead of 'ride'
    await pool.query(`INSERT INTO territory_ledger (territory_id,manager_id,reference_month,entry_type,amount_cents,description,reference_type,reference_id,idempotency_key) VALUES ($1,NULL,'2026-07','platform_fee',1800,'wrong','reward',$2,$3)`, [territoryId, rideId, `territory_platform_fee:${rideId}`]);

    const svc = new TerritoryLedgerService(pool);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await expect(svc.recordCollectedFeeInClient(client, territoryId, null, null, 1800n, 720n, rideId, '2026-07'))
        .rejects.toMatchObject({ code: 'TERRITORY_LEDGER_IDEMPOTENCY_MISMATCH' });
      await client.query('ROLLBACK');
    } finally { client.release(); }
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. Partial + resolve exact totals
// ═══════════════════════════════════════════════════════════════
describe('Partial collection + resolve = exact totals', () => {
  it('sum of platform_fee and fee_share entries equals full fee', async () => {
    const driverId = await setupDriver(500n);
    const { territoryId } = await setupTerritory();
    const rideId = `ride-partial-resolve-${RUN}`;
    const svc = makeSvc();
    await svc.handleReserve(rideId, driverId, 500n);

    // Partial settlement
    await svc.settleRide({ rideId, driverId, finalPriceCents: 10000n, reservedCents: 500n, territoryId });

    // Recharge wallet and resolve
    await pool.query('UPDATE driver_wallets SET balance_cents=10000 WHERE driver_id=$1', [driverId]);
    const pendingSvc = new PendingDebitService(pool);
    const walletSvc = new WalletService(pool);
    const ledgerSvc = new AnnualIncentiveLedgerService(pool);
    const shadow = new AnnualIncentiveShadowService(pool, walletSvc, ledgerSvc);
    await pendingSvc.resolveOnRecharge(driverId, shadow, new FeeSplitService(pool), new TerritoryLedgerService(pool));

    // Verify final state
    const { rows:[split] } = await pool.query('SELECT * FROM ride_fee_splits WHERE ride_id=$1', [rideId]);
    expect(split.collection_status).toBe('collected');
    expect(split.fee_pending_cents).toBe('0');
    expect(split.fee_collected_cents).toBe(split.fee_amount_cents);

    // Sum of territory_ledger entries
    const { rows: tl } = await pool.query('SELECT entry_type, SUM(amount_cents) as total FROM territory_ledger WHERE reference_id=$1 GROUP BY entry_type', [rideId]);
    const pfTotal = BigInt(tl.find((r:any) => r.entry_type === 'platform_fee').total);
    const fsTotal = BigInt(tl.find((r:any) => r.entry_type === 'fee_share').total);

    expect(pfTotal).toBe(BigInt(split.fee_amount_cents)); // 1800
    expect(fsTotal).toBe(applyBasisPoints(BigInt(split.fee_amount_cents), split.manager_commission_rate_bps));
  });
});

// ═══════════════════════════════════════════════════════════════
// 11, 12. Shadow active/inactive
// ═══════════════════════════════════════════════════════════════
describe('Shadow paths', () => {
  it('shadow active: exactly 1 fee_debit + 1 accrual', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    const driverId = await setupDriver(10000n);
    const { territoryId } = await setupTerritory();
    const rideId = `ride-shadow-on-${RUN}`;
    const svc = makeSvc();
    await svc.handleReserve(rideId, driverId, 1800n);
    await svc.settleRide({ rideId, driverId, finalPriceCents: 10000n, reservedCents: 1800n, territoryId });

    const { rows: debits } = await pool.query("SELECT * FROM wallet_ledger WHERE driver_id=$1 AND entry_type='fee_debit'", [driverId]);
    expect(debits.length).toBe(1);

    const { rows: accruals } = await pool.query("SELECT * FROM annual_incentive_ledger WHERE source_id=$1 AND event_type='ACCRUAL'", [rideId]);
    expect(accruals.length).toBe(1);
  });

  it('shadow inactive: 1 fee_debit + 0 accruals', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'false';
    const driverId = await setupDriver(10000n);
    const { territoryId } = await setupTerritory();
    const rideId = `ride-shadow-off-${RUN}`;
    const svc = makeSvc();
    await svc.handleReserve(rideId, driverId, 1800n);
    await svc.settleRide({ rideId, driverId, finalPriceCents: 10000n, reservedCents: 1800n, territoryId });

    const { rows: debits } = await pool.query("SELECT * FROM wallet_ledger WHERE driver_id=$1 AND entry_type='fee_debit'", [driverId]);
    expect(debits.length).toBe(1);

    const { rows: accruals } = await pool.query("SELECT * FROM annual_incentive_ledger WHERE source_id=$1 AND event_type='ACCRUAL'", [rideId]);
    expect(accruals.length).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 13. Concurrency with shadow active — exact counts
// ═══════════════════════════════════════════════════════════════
describe('Concurrent settlement with shadow', () => {
  it('two concurrent calls produce exactly 1 split, 2 ledger, 1 debit, 0 pending, 1 accrual', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    const driverId = await setupDriver(10000n);
    const { territoryId } = await setupTerritory();
    const rideId = `ride-conc-shadow-${RUN}`;
    const walletSvc = new WalletService(pool);
    await walletSvc.ensureWallet(driverId);
    await walletSvc.reserve(driverId, 1800n, rideId);

    const svc1 = makeSvc();
    const svc2 = makeSvc();

    await Promise.all([
      svc1.settleRide({ rideId, driverId, finalPriceCents: 10000n, reservedCents: 1800n, territoryId }),
      svc2.settleRide({ rideId, driverId, finalPriceCents: 10000n, reservedCents: 1800n, territoryId }),
    ]);

    const { rows:[{count:splitCount}] } = await pool.query('SELECT COUNT(*) FROM ride_fee_splits WHERE ride_id=$1', [rideId]);
    expect(Number(splitCount)).toBe(1);

    const { rows:[{count:ledgerCount}] } = await pool.query('SELECT COUNT(*) FROM territory_ledger WHERE reference_id=$1', [rideId]);
    expect(Number(ledgerCount)).toBe(2);

    const { rows:[{count:debitCount}] } = await pool.query("SELECT COUNT(*) FROM wallet_ledger WHERE driver_id=$1 AND entry_type='fee_debit'", [driverId]);
    expect(Number(debitCount)).toBe(1);

    const { rows:[{count:pendingCount}] } = await pool.query('SELECT COUNT(*) FROM pending_debits WHERE ride_id=$1', [rideId]);
    expect(Number(pendingCount)).toBe(0);

    const { rows:[{count:accrualCount}] } = await pool.query("SELECT COUNT(*) FROM annual_incentive_ledger WHERE source_id=$1 AND event_type='ACCRUAL'", [rideId]);
    expect(Number(accrualCount)).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════
// 14. SETTLEMENT_PAUSED blocks resolveOnRecharge (SumUp path)
// ═══════════════════════════════════════════════════════════════
describe('Maintenance gate on SumUp recharge path', () => {
  it('resolveOnRecharge blocked when SETTLEMENT_PAUSED', async () => {
    process.env.SETTLEMENT_PAUSED = 'true';
    const pendingSvc = new PendingDebitService(pool);
    await expect(pendingSvc.resolveOnRecharge('any', {} as any, {} as any, {} as any))
      .rejects.toMatchObject({ code: 'SETTLEMENT_PAUSED' });
  });
});

// ═══════════════════════════════════════════════════════════════
// 15. Missing first pending does not stop second
// ═══════════════════════════════════════════════════════════════
describe('Pending sequence resilience', () => {
  it('first pending gone at lock → second still resolves', async () => {
    const driverId = await setupDriver(0n); // zero balance forces full pending
    const { territoryId } = await setupTerritory();

    // Create two rides with proper splits and pending_debits (zero collection)
    for (const suffix of ['a', 'b']) {
      const rideId = `ride-seq-${suffix}-${RUN}`;
      // Give enough for reserve only, then zero out
      await pool.query('UPDATE driver_wallets SET balance_cents=1800, reserved_cents=0 WHERE driver_id=$1', [driverId]);
      const svc = makeSvc();
      await svc.handleReserve(rideId, driverId, 1800n);
      // Zero balance so settlement creates pending
      await pool.query('UPDATE driver_wallets SET balance_cents=0 WHERE driver_id=$1', [driverId]);
      await svc.settleRide({ rideId, driverId, finalPriceCents: 10000n, reservedCents: 1800n, territoryId });
    }

    // Verify 2 pending debits
    const { rows: pds } = await pool.query("SELECT id FROM pending_debits WHERE driver_id=$1 AND status='pending' ORDER BY created_at", [driverId]);
    expect(pds.length).toBe(2);

    // Resolve the first pending manually (simulate it being resolved by another process)
    await pool.query("UPDATE pending_debits SET status='resolved' WHERE id=$1", [pds[0].id]);

    // Recharge and resolve remaining
    await pool.query('UPDATE driver_wallets SET balance_cents=20000 WHERE driver_id=$1', [driverId]);
    const pendingSvc = new PendingDebitService(pool);
    const walletSvc = new WalletService(pool);
    const ledgerSvc = new AnnualIncentiveLedgerService(pool);
    const shadow = new AnnualIncentiveShadowService(pool, walletSvc, ledgerSvc);
    const resolved = await pendingSvc.resolveOnRecharge(driverId, shadow, new FeeSplitService(pool), new TerritoryLedgerService(pool));
    expect(resolved).toBe(1); // Only the second one resolved (first was already resolved)
  });
});
