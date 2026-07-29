/**
 * Wallet Settlement Service Tests (Marco 3.2A - Commit 5)
 * Tests atomic settlement: single transaction, advisory lock, snapshot, proportional.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { WalletService } from '../../src/services/wallet-v2/wallet.service';
import { FeeSplitService, referenceMonthFromDate } from '../../src/services/wallet-v2/fee-split.service';
import { TerritoryLedgerService } from '../../src/services/wallet-v2/territory-ledger.service';
import { PendingDebitService } from '../../src/services/wallet-v2/pending-debit.service';
import { WalletSettlementService } from '../../src/services/wallet-v2/wallet-settlement.service';

const RUN = randomUUID().slice(0, 8);
let pool: pg.Pool;

beforeAll(async () => {
  assertSafeFinanceDatabase();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
});

afterAll(async () => { await pool.end(); });

// Helper to create a driver with wallet
async function setupDriver(balance: bigint = 10000n): Promise<string> {
  const id = `driver-settle-${RUN}-${randomUUID().slice(0, 6)}`;
  await pool.query(`INSERT INTO drivers (id, name, email, phone, document_cpf, status, created_at, updated_at) VALUES ($1, 'Test', $2, '119999', '000', 'active', NOW(), NOW()) ON CONFLICT DO NOTHING`, [id, `${id}@test.local`]);
  await pool.query(`INSERT INTO driver_wallets (driver_id, balance_cents, reserved_cents, updated_at) VALUES ($1, $2, 0, NOW()) ON CONFLICT (driver_id) DO UPDATE SET balance_cents = $2, reserved_cents = 0`, [id, balance.toString()]);
  return id;
}

// Helper to create territory with active assignment
async function setupTerritory(): Promise<{ territoryId: string; managerId: string; assignmentId: string }> {
  const territoryId = `territory-${RUN}-${randomUUID().slice(0, 6)}`;
  const managerId = `manager-${RUN}-${randomUUID().slice(0, 6)}`;
  await pool.query(`INSERT INTO operational_territories (id, name, level, status, regulatory_status, created_at, updated_at) VALUES ($1, 'Test', 'neighborhood', 'active', 'not_applicable', NOW(), NOW()) ON CONFLICT DO NOTHING`, [territoryId]);
  await pool.query(`INSERT INTO admins (id, name, email, phone, password, role, created_at, updated_at) VALUES ($1, 'Manager', $2, '11888', 'hash', 'regional_manager', NOW(), NOW()) ON CONFLICT DO NOTHING`, [managerId, `${managerId}@test.local`]);
  const { rows: [{ id: assignmentId }] } = await pool.query(
    `INSERT INTO territory_manager_assignments (territory_id, admin_id, status, started_at, created_by, updated_at)
     VALUES ($1, $2, 'active', NOW() - INTERVAL '30 days', $2, NOW())
     RETURNING id::text`, [territoryId, managerId]);
  return { territoryId, managerId, assignmentId };
}

function createSettlement(driverId: string, territoryId?: string) {
  const walletSvc = new WalletService(pool);
  const feeSplitSvc = new FeeSplitService(pool);
  const ledgerSvc = new TerritoryLedgerService(pool);
  const pendingSvc = new PendingDebitService(pool);
  return new WalletSettlementService(pool, walletSvc, feeSplitSvc, ledgerSvc, pendingSvc, walletSvc);
}

describe('Atomic Settlement', () => {
  it('full collection: debit + split + ledger in one tx', async () => {
    const driverId = await setupDriver(10000n);
    const { territoryId } = await setupTerritory();
    const svc = createSettlement(driverId);
    const rideId = `ride-full-${RUN}`;

    // Reserve first
    await svc.handleReserve(rideId, driverId, 1800n);

    const result = await svc.settleRide({
      rideId, driverId, finalPriceCents: 10000n, reservedCents: 1800n, territoryId,
    });

    expect(result.collected).toBe(true);

    // Verify split
    const { rows: [split] } = await pool.query('SELECT * FROM ride_fee_splits WHERE ride_id = $1', [rideId]);
    expect(split.fee_amount_cents).toBe('1800');
    expect(split.collection_status).toBe('collected');
    expect(split.recognized_at_source).toBe('DB_SETTLEMENT_CLOCK');
    expect(split.manager_assignment_id).not.toBeNull();

    // Verify territory ledger
    const { rows: ledger } = await pool.query('SELECT * FROM territory_ledger WHERE reference_id = $1 ORDER BY entry_type', [rideId]);
    expect(ledger.length).toBe(2);
    const pf = ledger.find((r: any) => r.entry_type === 'platform_fee');
    const fs = ledger.find((r: any) => r.entry_type === 'fee_share');
    expect(pf.amount_cents).toBe('1800');
    expect(fs.amount_cents).toBe('720'); // 40% of 1800
  });

  it('idempotent: second call returns same snapshot', async () => {
    const driverId = await setupDriver(10000n);
    const { territoryId } = await setupTerritory();
    const svc = createSettlement(driverId);
    const rideId = `ride-idemp-${RUN}`;

    await svc.handleReserve(rideId, driverId, 1800n);
    const r1 = await svc.settleRide({ rideId, driverId, finalPriceCents: 10000n, reservedCents: 1800n, territoryId });
    const r2 = await svc.settleRide({ rideId, driverId, finalPriceCents: 10000n, reservedCents: 1800n, territoryId });

    expect(r1.collected).toBe(r2.collected);
    // Only one split exists
    const { rows } = await pool.query('SELECT COUNT(*) FROM ride_fee_splits WHERE ride_id = $1', [rideId]);
    expect(rows[0].count).toBe('1');
  });

  it('two concurrent settlements produce one split', async () => {
    const driverId = await setupDriver(10000n);
    const { territoryId } = await setupTerritory();
    const rideId = `ride-conc-${RUN}`;

    const walletSvc = new WalletService(pool);
    await walletSvc.ensureWallet(driverId);
    await walletSvc.reserve(driverId, 1800n, rideId);

    const svc1 = new WalletSettlementService(pool, walletSvc, new FeeSplitService(pool), new TerritoryLedgerService(pool), new PendingDebitService(pool), walletSvc);
    const svc2 = new WalletSettlementService(pool, walletSvc, new FeeSplitService(pool), new TerritoryLedgerService(pool), new PendingDebitService(pool), walletSvc);

    const [r1, r2] = await Promise.all([
      svc1.settleRide({ rideId, driverId, finalPriceCents: 10000n, reservedCents: 1800n, territoryId }),
      svc2.settleRide({ rideId, driverId, finalPriceCents: 10000n, reservedCents: 1800n, territoryId }),
    ]);

    // Both succeed (idempotency)
    expect(r1.collected).toBe(true);
    expect(r2.collected).toBe(true);

    // Only one split
    const { rows: splits } = await pool.query('SELECT COUNT(*) FROM ride_fee_splits WHERE ride_id = $1', [rideId]);
    expect(splits[0].count).toBe('1');

    // Only one pair of ledger entries
    const { rows: ledger } = await pool.query('SELECT COUNT(*) FROM territory_ledger WHERE reference_id = $1', [rideId]);
    expect(Number(ledger[0].count)).toBeLessThanOrEqual(2);

    // No spurious pending debit
    const { rows: pendings } = await pool.query('SELECT COUNT(*) FROM pending_debits WHERE ride_id = $1', [rideId]);
    expect(pendings[0].count).toBe('0');
  });

  it('partial collection records proportional territorial recognition', async () => {
    const driverId = await setupDriver(500n); // Only 500 available
    const { territoryId } = await setupTerritory();
    const svc = createSettlement(driverId);
    const rideId = `ride-partial-${RUN}`;

    await svc.handleReserve(rideId, driverId, 500n);
    const result = await svc.settleRide({ rideId, driverId, finalPriceCents: 10000n, reservedCents: 500n, territoryId });

    expect(result.collected).toBe(false);

    const { rows: [split] } = await pool.query('SELECT * FROM ride_fee_splits WHERE ride_id = $1', [rideId]);
    expect(split.collection_status).toBe('partial');
    expect(split.fee_collected_cents).toBe('500');
    expect(split.fee_pending_cents).toBe('1300'); // 1800 - 500

    // Proportional territorial recognition
    const { rows: ledger } = await pool.query('SELECT * FROM territory_ledger WHERE reference_id = $1 ORDER BY entry_type', [rideId]);
    expect(ledger.length).toBe(2);
    expect(ledger.find((r: any) => r.entry_type === 'platform_fee').amount_cents).toBe('500');
    // Manager share of 500 = applyBasisPoints(500, 4000) = 200
    expect(ledger.find((r: any) => r.entry_type === 'fee_share').amount_cents).toBe('200');
  });

  it('region without manager records "Parcela territorial reservada"', async () => {
    // Create territory WITHOUT assignment
    const territoryId = `territory-nomanager-${RUN}`;
    await pool.query(`INSERT INTO operational_territories (id, name, level, status, regulatory_status, created_at, updated_at) VALUES ($1, 'No Manager', 'neighborhood', 'active', 'not_applicable', NOW(), NOW()) ON CONFLICT DO NOTHING`, [territoryId]);

    const driverId = await setupDriver(10000n);
    const svc = createSettlement(driverId);
    const rideId = `ride-nomanager-${RUN}`;

    await svc.handleReserve(rideId, driverId, 1800n);
    await svc.settleRide({ rideId, driverId, finalPriceCents: 10000n, reservedCents: 1800n, territoryId });

    const { rows: [split] } = await pool.query('SELECT manager_id, manager_assignment_id FROM ride_fee_splits WHERE ride_id = $1', [rideId]);
    expect(split.manager_id).toBeNull();
    expect(split.manager_assignment_id).toBeNull();

    const { rows: ledger } = await pool.query("SELECT description FROM territory_ledger WHERE reference_id = $1 AND entry_type = 'fee_share'", [rideId]);
    expect(ledger[0].description).toBe('Parcela territorial reservada');
  });

  it('competence boundary: 23:59 BRT stays in correct month', () => {
    // January 31 at 23:59 BRT = February 1 at 02:59 UTC
    // referenceMonthFromDate should return 2026-01, not 2026-02
    const date = new Date('2026-02-01T02:59:00.000Z'); // This is Jan 31 23:59 BRT
    const month = referenceMonthFromDate(date, 'America/Sao_Paulo');
    expect(month).toBe('2026-01');
  });

  it('SETTLEMENT_PAUSED blocks settleRide', async () => {
    process.env.SETTLEMENT_PAUSED = 'true';
    const svc = createSettlement('any');
    await expect(svc.settleRide({
      rideId: 'x', driverId: 'x', finalPriceCents: 100n, reservedCents: 0n,
    })).rejects.toMatchObject({ code: 'SETTLEMENT_PAUSED' });
    delete process.env.SETTLEMENT_PAUSED;
  });
});
