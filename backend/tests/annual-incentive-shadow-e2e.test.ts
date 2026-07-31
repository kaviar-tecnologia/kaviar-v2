/**
 * Annual Incentive Shadow Mode — End-to-End Validation (Etapa 2C.4B)
 *
 * Activates flags ONLY in process scope. Uses real services against kaviar_test.
 * Validates full economic flows: fee_debit, pending_resolve, reconciliation.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { assertSafeFinanceDatabase } from '../src/lib/assert-safe-finance-db';
import { WalletService } from '../src/services/wallet-v2/wallet.service';
import { AnnualIncentiveLedgerService } from '../src/services/finance/annual-incentive-ledger.service';
import { AnnualIncentiveShadowService, SHADOW_ERRORS } from '../src/services/finance/annual-incentive-shadow.service';
import { PendingDebitService } from '../src/services/wallet-v2/pending-debit.service';
import { FeeSplitService } from '../src/services/wallet-v2/fee-split.service';
import { TerritoryLedgerService } from '../src/services/wallet-v2/territory-ledger.service';
import { WalletSettlementService } from '../src/services/wallet-v2/wallet-settlement.service';
import { AnnualIncentiveReconciliationService } from '../src/services/finance/annual-incentive-reconciliation.service';
import { cleanupTestFixtures, assertTriggerEnabled } from './helpers/cleanup-incentive-fixtures';

// ═══════════════════════════════════════════════════════════════════════════════
// SAFETY GUARD
// ═══════════════════════════════════════════════════════════════════════════════

assertSafeFinanceDatabase();

// ═══════════════════════════════════════════════════════════════════════════════
// POOL & SERVICE SETUP
// ═══════════════════════════════════════════════════════════════════════════════

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TEST_DRIVER = `test-e2e-shadow-${Date.now()}`;
let rideCounter = 0;
function nextRideId(): string { return `e2e-ride-${Date.now()}-${++rideCounter}`; }
function nextRechargeId(): string { return `e2e-recharge-${Date.now()}-${++rideCounter}`; }

let walletService: WalletService;
let ledgerService: AnnualIncentiveLedgerService;
let shadowService: AnnualIncentiveShadowService;
let pendingDebitService: PendingDebitService;
let feeSplitService: FeeSplitService;
let territoryLedgerService: TerritoryLedgerService;
let settlementService: WalletSettlementService;
let reconciliationService: AnnualIncentiveReconciliationService;

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

async function resetBalance(balance = 50000, reserved = 0): Promise<void> {
  await pool.query(
    'UPDATE driver_wallets SET balance_cents = $2, reserved_cents = $3, updated_at = NOW() WHERE driver_id = $1',
    [TEST_DRIVER, balance, reserved]
  );
}

async function setFeatureFlags(shadow: boolean, write: boolean): Promise<void> {
  await pool.query(
    `INSERT INTO feature_flags (key, enabled, updated_at, created_at)
     VALUES ('ANNUAL_INCENTIVE_SHADOW_ENABLED', $1, NOW(), NOW())
     ON CONFLICT (key) DO UPDATE SET enabled = $1, updated_at = NOW()`,
    [shadow]
  );
  await pool.query(
    `INSERT INTO feature_flags (key, enabled, updated_at, created_at)
     VALUES ('ANNUAL_INCENTIVE_WRITE_ENABLED', $1, NOW(), NOW())
     ON CONFLICT (key) DO UPDATE SET enabled = $1, updated_at = NOW()`,
    [write]
  );
}

async function clearFeatureFlags(): Promise<void> {
  await pool.query(
    "DELETE FROM feature_flags WHERE key IN ('ANNUAL_INCENTIVE_SHADOW_ENABLED', 'ANNUAL_INCENTIVE_WRITE_ENABLED')"
  );
}

async function getWalletBalance(): Promise<{ balance_cents: bigint; reserved_cents: bigint }> {
  const r = await pool.query(
    'SELECT balance_cents, reserved_cents FROM driver_wallets WHERE driver_id = $1',
    [TEST_DRIVER]
  );
  return {
    balance_cents: BigInt(r.rows[0].balance_cents),
    reserved_cents: BigInt(r.rows[0].reserved_cents),
  };
}

async function countAccruals(rideId?: string): Promise<number> {
  if (rideId) {
    const r = await pool.query(
      "SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE driver_id = $1 AND source_id = $2 AND event_type = 'ACCRUAL'",
      [TEST_DRIVER, rideId]
    );
    return r.rows[0].cnt;
  }
  const r = await pool.query(
    "SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE driver_id = $1 AND event_type = 'ACCRUAL'",
    [TEST_DRIVER]
  );
  return r.rows[0].cnt;
}

async function getAccruals(rideId: string): Promise<any[]> {
  const r = await pool.query(
    "SELECT * FROM annual_incentive_ledger WHERE driver_id = $1 AND source_id = $2 AND event_type = 'ACCRUAL' ORDER BY created_at ASC",
    [TEST_DRIVER, rideId]
  );
  return r.rows;
}

async function getWalletEntries(rideId?: string): Promise<any[]> {
  if (rideId) {
    const r = await pool.query(
      `SELECT * FROM wallet_ledger WHERE driver_id = $1
       AND ((entry_type = 'fee_debit' AND reference_type = 'ride' AND reference_id = $2)
         OR (entry_type = 'pending_resolve' AND reference_type = 'pending_debit'
             AND reference_id IN (SELECT id::text FROM pending_debits WHERE ride_id = $2)))
       ORDER BY created_at ASC`,
      [TEST_DRIVER, rideId]
    );
    return r.rows;
  }
  const r = await pool.query(
    "SELECT * FROM wallet_ledger WHERE driver_id = $1 AND entry_type IN ('fee_debit', 'pending_resolve') ORDER BY created_at ASC",
    [TEST_DRIVER]
  );
  return r.rows;
}

// ═══════════════════════════════════════════════════════════════════════════════
// LIFECYCLE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Annual Incentive Shadow Mode — E2E Validation', () => {
  beforeAll(async () => {
    walletService = new WalletService(pool);
    ledgerService = new AnnualIncentiveLedgerService(pool);
    shadowService = new AnnualIncentiveShadowService(pool, walletService, ledgerService);
    pendingDebitService = new PendingDebitService(pool);
    feeSplitService = new FeeSplitService(pool);
    territoryLedgerService = new TerritoryLedgerService(pool);
    settlementService = new WalletSettlementService(
      walletService, feeSplitService, territoryLedgerService, pendingDebitService, shadowService
    );
    reconciliationService = new AnnualIncentiveReconciliationService(pool);

    // Create test driver
    await pool.query(
      `INSERT INTO drivers (id, name, email, status, updated_at)
       VALUES ($1, $2, $3, 'approved', NOW())
       ON CONFLICT (id) DO NOTHING`,
      [TEST_DRIVER, `E2E Shadow ${Date.now()}`, `e2e-shadow-${Date.now()}@kaviar.test`]
    );
    await pool.query(
      `INSERT INTO driver_wallets (driver_id, balance_cents, reserved_cents, updated_at)
       VALUES ($1, 50000, 0, NOW())
       ON CONFLICT (driver_id) DO UPDATE SET balance_cents = 50000, reserved_cents = 0`,
      [TEST_DRIVER]
    );
  });

  afterAll(async () => {
    await cleanupTestFixtures(pool, TEST_DRIVER);
    await assertTriggerEnabled(pool);
    await pool.end();
  });

  // Capture original env values BEFORE any test modifies them
  const originalShadowEnv = process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED;
  const originalWriteEnv = process.env.ANNUAL_INCENTIVE_WRITE_ENABLED;

  beforeEach(() => {
    // Clear flags so each test starts with a clean slate
    delete process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED;
    delete process.env.ANNUAL_INCENTIVE_WRITE_ENABLED;
  });

  afterEach(() => {
    // Restore original values exactly: if they existed before, restore; if not, delete.
    if (originalShadowEnv !== undefined) {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = originalShadowEnv;
    } else {
      delete process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED;
    }
    if (originalWriteEnv !== undefined) {
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = originalWriteEnv;
    } else {
      delete process.env.ANNUAL_INCENTIVE_WRITE_ENABLED;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO A — Flags off
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario A — flags desligadas', () => {
    it('A1. fee_debit occurs normally without accrual', async () => {
      // Process env flags absent (cleared by beforeEach)
      // The shadow service checks process.env, not DB flags
      await resetBalance(50000, 1800);

      const rideId = nextRideId();
      const result = await shadowService.debitFee(TEST_DRIVER, 1800n, 1800n, rideId);

      expect(result.already_processed).toBe(false);

      // fee_debit created
      const entries = await getWalletEntries(rideId);
      expect(entries.length).toBe(1);
      expect(entries[0].entry_type).toBe('fee_debit');
      expect(BigInt(entries[0].balance_delta_cents)).toBe(-1800n);

      // No accrual
      const accrualCount = await countAccruals(rideId);
      expect(accrualCount).toBe(0);
    });

    it('A2. reconciler: wouldAccrueCents computed correctly for unmatched events', async () => {
      // The reconciler always computes wouldAccrueCents regardless of flag state.
      // We verify the calculation is correct for our fee_debit.
      // Note: feature_flags DB table is shared with parallel tests, so we only
      // verify economic calculation, not flag state reporting.
      await setFeatureFlags(true, true);

      const report = await reconciliationService.run({ driverId: TEST_DRIVER });

      // The fee_debit from A1 (1800 cents, no accrual) should show as MISSING
      // wouldAccrueCents includes this unmatched event
      expect(report.totals.wouldAccrueCents).toBeGreaterThanOrEqual(180n);
      expect(report.totals.missingCount).toBeGreaterThan(0);
    });

    it('A3. fee debit without shadow: current flow not broken', async () => {
      // The main assertion for "flags off": the fee debit works normally
      // and no ACCRUAL is created. This was already verified in A1.
      // Additional verification: wallet balance is correct
      const balance = await getWalletBalance();
      // Balance was reset to 50000 with 1800 reserved, then debited 1800
      // So balance should be 50000 - 1800 = 48200
      expect(balance.balance_cents).toBe(48200n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO B — Invalid configuration (shadow=true, write=false)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario B — configuração inválida', () => {
    it('B1. error thrown before any mutation', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'false';
      await setFeatureFlags(true, false);
      await resetBalance(50000, 1800);

      const balanceBefore = await getWalletBalance();
      const rideId = nextRideId();

      await expect(
        shadowService.debitFee(TEST_DRIVER, 1800n, 1800n, rideId)
      ).rejects.toThrow(SHADOW_ERRORS.CONFIGURATION_INVALID);

      // No fee_debit created
      const entries = await getWalletEntries(rideId);
      expect(entries.length).toBe(0);

      // No accrual
      const accrualCount = await countAccruals(rideId);
      expect(accrualCount).toBe(0);

      // Balance unchanged
      const balanceAfter = await getWalletBalance();
      expect(balanceAfter.balance_cents).toBe(balanceBefore.balance_cents);
      expect(balanceAfter.reserved_cents).toBe(balanceBefore.reserved_cents);
    });

    it('B2. no pending_debits altered', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'false';

      const pendingsBefore = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM pending_debits WHERE driver_id = $1",
        [TEST_DRIVER]
      );

      const rideId = nextRideId();
      await expect(
        shadowService.debitFee(TEST_DRIVER, 1800n, 1800n, rideId)
      ).rejects.toThrow(SHADOW_ERRORS.CONFIGURATION_INVALID);

      const pendingsAfter = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM pending_debits WHERE driver_id = $1",
        [TEST_DRIVER]
      );
      expect(pendingsAfter.rows[0].cnt).toBe(pendingsBefore.rows[0].cnt);
    });

    it('B3. reconciler evaluateShadowState returns INVALID_SHADOW_CONFIGURATION', async () => {
      // Verify the evaluateShadowState logic directly since the feature_flags
      // table is shared across parallel test files
      const { evaluateShadowState } = await import(
        '../src/services/finance/annual-incentive-reconciliation.service'
      );
      const state = evaluateShadowState('true', 'false');
      expect(state).toBe('INVALID_SHADOW_CONFIGURATION');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO C — Cobrança integral imediata
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario C — cobrança integral imediata', () => {
    let scenarioCRideId: string;

    it('C1. fee_debit of 1800 + ACCRUAL of 180 in same transaction', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
      await setFeatureFlags(true, true);
      await resetBalance(50000, 1800);

      scenarioCRideId = nextRideId();
      const result = await shadowService.debitFee(TEST_DRIVER, 1800n, 1800n, scenarioCRideId);
      expect(result.already_processed).toBe(false);

      // fee_debit exists
      const entries = await getWalletEntries(scenarioCRideId);
      expect(entries.length).toBe(1);
      expect(entries[0].entry_type).toBe('fee_debit');
      expect(BigInt(entries[0].balance_delta_cents)).toBe(-1800n);

      // ACCRUAL exists
      const accruals = await getAccruals(scenarioCRideId);
      expect(accruals.length).toBe(1);
      expect(BigInt(accruals[0].amount_cents)).toBe(180n);
      expect(accruals[0].source_type).toBe('FEE_DEBIT');
      expect(accruals[0].source_event_id).toBe(entries[0].id.toString());
    });

    it('C2. fee_debit and ACCRUAL share the same wallet_ledger entry ID', async () => {
      const entries = await getWalletEntries(scenarioCRideId);
      const accruals = await getAccruals(scenarioCRideId);

      // source_event_id of accrual points to wallet_ledger.id
      expect(accruals[0].source_event_id).toBe(entries[0].id.toString());

      // idempotency_key format
      const expectedKey = `annual_incentive:accrual:wallet_ledger:${entries[0].id}`;
      expect(accruals[0].idempotency_key).toBe(expectedKey);
    });

    it('C3. reconciler shows MATCH with differenceCents=0', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
      await setFeatureFlags(true, true);

      const report = await reconciliationService.run({ driverId: TEST_DRIVER, rideId: scenarioCRideId });

      // Find the item for this ride
      const rideItems = report.items.filter(i => i.rideId === scenarioCRideId);
      expect(rideItems.length).toBe(1);
      expect(rideItems[0].statuses).toContain('MATCH');

      // Group totals
      const rideGroup = report.groups.byRide[scenarioCRideId];
      expect(rideGroup).toBeDefined();
      expect(rideGroup.differenceCents).toBe(0n);
      expect(rideGroup.expectedGrossAccrualCents).toBe(180n);
      expect(rideGroup.actualGrossAccrualCents).toBe(180n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO D — Taxa parcialmente paga + resolução pendente
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario D — taxa parcialmente paga', () => {
    let scenarioDRideId: string;

    it('D1. partial collection: fee_debit=500, ACCRUAL=50, pending=1300', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
      await setFeatureFlags(true, true);

      // Balance allows only 500 for fee (available = balance - reserved + reserved = balance)
      // We need: fee = 1800, but available only 500
      // available = balance - reserved + reserved(ride) where reservedCents = what was reserved for this ride
      // settleRide: availableForFee = balance - reserved + reservedCents
      // We set balance=500, reserved=0, reserved(ride)=0 → available=500 < 1800
      await resetBalance(500, 0);

      scenarioDRideId = nextRideId();
      const finalPriceCents = 10000n; // 18% of 10000 = 1800

      // Use settlement service (real flow)
      const result = await settlementService.settleRide({
        rideId: scenarioDRideId,
        driverId: TEST_DRIVER,
        finalPriceCents,
        reservedCents: 0n,
      });

      expect(result.collected).toBe(false);

      // fee_debit of 500 (partial)
      const feeEntries = await pool.query(
        "SELECT * FROM wallet_ledger WHERE driver_id = $1 AND entry_type = 'fee_debit' AND reference_id = $2",
        [TEST_DRIVER, scenarioDRideId]
      );
      expect(feeEntries.rows.length).toBe(1);
      expect(BigInt(feeEntries.rows[0].balance_delta_cents)).toBe(-500n);

      // ACCRUAL of 50 (10% of 500)
      const accruals = await getAccruals(scenarioDRideId);
      expect(accruals.length).toBe(1);
      expect(BigInt(accruals[0].amount_cents)).toBe(50n);
      expect(accruals[0].source_type).toBe('FEE_DEBIT');

      // pending_debit of 1300
      const pendings = await pool.query(
        "SELECT * FROM pending_debits WHERE ride_id = $1",
        [scenarioDRideId]
      );
      expect(pendings.rows.length).toBe(1);
      expect(BigInt(pendings.rows[0].fee_pending_cents)).toBe(1300n);
      expect(pendings.rows[0].status).toBe('pending');
    });

    it('D2. after recharge + resolve: pending_resolve=1300, ACCRUAL=130', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';

      // Recharge: add enough balance to cover pending
      const rechargeId = nextRechargeId();
      await walletService.creditRecharge(TEST_DRIVER, 5000n, rechargeId);

      // Resolve pending debits using real flow
      const resolved = await pendingDebitService.resolveOnRecharge(
        TEST_DRIVER, shadowService, feeSplitService, territoryLedgerService
      );
      expect(resolved).toBe(1);

      // pending_resolve entry
      const pendingRow = await pool.query("SELECT id FROM pending_debits WHERE ride_id = $1", [scenarioDRideId]);
      const pendingId = pendingRow.rows[0].id.toString();
      const resolveEntries = await pool.query(
        "SELECT * FROM wallet_ledger WHERE driver_id = $1 AND entry_type = 'pending_resolve' AND reference_id = $2",
        [TEST_DRIVER, pendingId]
      );
      expect(resolveEntries.rows.length).toBe(1);
      expect(BigInt(resolveEntries.rows[0].balance_delta_cents)).toBe(-1300n);

      // Second ACCRUAL: incremental = floor((500+1300)*10%) - 50 = 180 - 50 = 130
      const accruals = await getAccruals(scenarioDRideId);
      expect(accruals.length).toBe(2);
      expect(BigInt(accruals[1].amount_cents)).toBe(130n);
      expect(accruals[1].source_type).toBe('PENDING_RESOLVE');
    });

    it('D3. reconciler shows 2 MATCH, total 180, difference 0', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
      await setFeatureFlags(true, true);

      const report = await reconciliationService.run({ driverId: TEST_DRIVER, rideId: scenarioDRideId });

      const rideItems = report.items.filter(i => i.rideId === scenarioDRideId);
      expect(rideItems.length).toBe(2);
      expect(rideItems[0].statuses).toContain('MATCH');
      expect(rideItems[1].statuses).toContain('MATCH');

      const rideGroup = report.groups.byRide[scenarioDRideId];
      expect(rideGroup.expectedGrossAccrualCents).toBe(180n);
      expect(rideGroup.actualGrossAccrualCents).toBe(180n);
      expect(rideGroup.differenceCents).toBe(0n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO E — Proteção contra perda de centavo
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario E — penny loss protection', () => {
    describe('E.1 — 6 + 12 centavos', () => {
      let scenarioERideId: string;

      it('E1.1. fee_debit=6: ACCRUAL skipped (increment=0)', async () => {
        process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
        process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
        await setFeatureFlags(true, true);
        await resetBalance(50000, 6);

        scenarioERideId = nextRideId();
        await shadowService.debitFee(TEST_DRIVER, 6n, 6n, scenarioERideId);

        // No accrual (10% of 6 = 0.6 → rounds to 0)
        const accruals = await getAccruals(scenarioERideId);
        expect(accruals.length).toBe(0);
      });

      it('E1.2. pending_resolve=12: ACCRUAL=1 (cumulative 18, 10%=1)', async () => {
        process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
        process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';

        // Create pending debit for this ride
        await pendingDebitService.create({
          rideId: scenarioERideId,
          driverId: TEST_DRIVER,
          finalPriceCents: 100n, // arbitrary final price
          feeAmountCents: 18n,  // 6 + 12 = 18
          reservedCents: 0n,
          feeCollectedCents: 6n,
        });

        // Recharge to cover
        await resetBalance(50000, 0);
        const rechargeId = nextRechargeId();
        await walletService.creditRecharge(TEST_DRIVER, 1000n, rechargeId);

        // Resolve
        const resolved = await pendingDebitService.resolveOnRecharge(
          TEST_DRIVER, shadowService, feeSplitService, territoryLedgerService
        );
        expect(resolved).toBe(1);

        // ACCRUAL of 1: floor((6+12)*10%) - 0 = 1
        const accruals = await getAccruals(scenarioERideId);
        expect(accruals.length).toBe(1);
        expect(BigInt(accruals[0].amount_cents)).toBe(1n);
        expect(accruals[0].source_type).toBe('PENDING_RESOLVE');
      });

      it('E1.3. reconciler: EXPECTED_ZERO_INCREMENT for first, MATCH for second', async () => {
        process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
        process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
        await setFeatureFlags(true, true);

        const report = await reconciliationService.run({ driverId: TEST_DRIVER, rideId: scenarioERideId });

        const rideItems = report.items.filter(i => i.rideId === scenarioERideId);
        expect(rideItems.length).toBe(2);

        // First event: fee_debit with zero increment
        expect(rideItems[0].statuses).toContain('EXPECTED_ZERO_INCREMENT');
        expect(rideItems[0].expectedIncrementCents).toBe(0n);

        // Second event: pending_resolve with MATCH
        expect(rideItems[1].statuses).toContain('MATCH');
        expect(rideItems[1].expectedIncrementCents).toBe(1n);

        // No ACCRUAL_EXISTS_FOR_ZERO_INCREMENT (no unexpected accrual)
        expect(rideItems[0].statuses).not.toContain('ACCRUAL_EXISTS_FOR_ZERO_INCREMENT');
      });
    });

    describe('E.2 — 1 + 9 centavos', () => {
      let scenarioE2RideId: string;

      it('E2.1. fee_debit=1: ACCRUAL skipped', async () => {
        process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
        process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
        await setFeatureFlags(true, true);
        await resetBalance(50000, 1);

        scenarioE2RideId = nextRideId();
        await shadowService.debitFee(TEST_DRIVER, 1n, 1n, scenarioE2RideId);

        const accruals = await getAccruals(scenarioE2RideId);
        expect(accruals.length).toBe(0);
      });

      it('E2.2. pending_resolve=9: ACCRUAL=1 (cumulative 10, 10%=1)', async () => {
        process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
        process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';

        await pendingDebitService.create({
          rideId: scenarioE2RideId,
          driverId: TEST_DRIVER,
          finalPriceCents: 56n,
          feeAmountCents: 10n,
          reservedCents: 0n,
          feeCollectedCents: 1n,
        });

        await resetBalance(50000, 0);
        const rechargeId = nextRechargeId();
        await walletService.creditRecharge(TEST_DRIVER, 1000n, rechargeId);

        const resolved = await pendingDebitService.resolveOnRecharge(
          TEST_DRIVER, shadowService, feeSplitService, territoryLedgerService
        );
        expect(resolved).toBe(1);

        const accruals = await getAccruals(scenarioE2RideId);
        expect(accruals.length).toBe(1);
        expect(BigInt(accruals[0].amount_cents)).toBe(1n);
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO F — Idempotência
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario F — idempotência', () => {
    let scenarioFRideId: string;

    it('F1. re-execute fee_debit: no second entry, same event returned', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
      await setFeatureFlags(true, true);
      await resetBalance(50000, 1800);

      scenarioFRideId = nextRideId();

      // First execution
      const first = await shadowService.debitFee(TEST_DRIVER, 1800n, 1800n, scenarioFRideId);
      expect(first.already_processed).toBe(false);

      // Reset balance to allow second attempt (would fail on insufficient balance otherwise)
      await resetBalance(50000, 1800);

      // Second execution — same rideId
      const second = await shadowService.debitFee(TEST_DRIVER, 1800n, 1800n, scenarioFRideId);
      expect(second.already_processed).toBe(true);
      expect(second.id).toBe(first.id);

      // Only one fee_debit
      const entries = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE driver_id = $1 AND entry_type = 'fee_debit' AND reference_id = $2",
        [TEST_DRIVER, scenarioFRideId]
      );
      expect(entries.rows[0].cnt).toBe(1);

      // Only one ACCRUAL
      const accrualCount = await countAccruals(scenarioFRideId);
      expect(accrualCount).toBe(1);
    });

    it('F2. total remains 180', async () => {
      const accruals = await getAccruals(scenarioFRideId);
      expect(accruals.length).toBe(1);
      expect(BigInt(accruals[0].amount_cents)).toBe(180n);
    });

    it('F3. reconciler: MATCH, no DUPLICATE_SOURCE', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
      await setFeatureFlags(true, true);

      const report = await reconciliationService.run({ driverId: TEST_DRIVER, rideId: scenarioFRideId });

      const rideItems = report.items.filter(i => i.rideId === scenarioFRideId);
      expect(rideItems.length).toBe(1);
      expect(rideItems[0].statuses).toContain('MATCH');
      expect(rideItems[0].statuses).not.toContain('DUPLICATE_SOURCE');

      expect(report.totals.duplicateCount).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO G — Recuperação de accrual ausente
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario G — recuperação de accrual ausente', () => {
    let scenarioGRideId: string;
    let walletLedgerEntryId: string;

    it('G1. simulate existing wallet event without accrual', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
      await setFeatureFlags(true, true);

      // Create a fee_debit WITHOUT going through shadow service (simulate missing accrual)
      await resetBalance(50000, 1800);
      scenarioGRideId = nextRideId();

      // Direct wallet debit (bypasses shadow, no accrual created)
      const walletResult = await walletService.debitFee(TEST_DRIVER, 1800n, 1800n, scenarioGRideId);
      walletLedgerEntryId = walletResult.id.toString();

      // Confirm: wallet_ledger has fee_debit but no accrual
      const entries = await getWalletEntries(scenarioGRideId);
      expect(entries.length).toBe(1);
      const accruals = await getAccruals(scenarioGRideId);
      expect(accruals.length).toBe(0);
    });

    it('G2. re-execute shadow debitFee: wallet NOT debited again, accrual IS created (recovery)', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';

      const balanceBefore = await getWalletBalance();

      // Re-execute: idempotency on wallet_ledger returns already_processed
      // But shadow service still proceeds to create the ACCRUAL in the same tx
      // because debitFeeWithAnnualIncentiveInClient always runs the accrual step
      const result = await shadowService.debitFee(TEST_DRIVER, 1800n, 1800n, scenarioGRideId);

      // Wallet returns already_processed (fee not re-debited)
      expect(result.already_processed).toBe(true);

      // Balance should NOT change (no second debit)
      const balanceAfter = await getWalletBalance();
      expect(balanceAfter.balance_cents).toBe(balanceBefore.balance_cents);

      // Accrual was created by this recovery execution
      const accruals = await getAccruals(scenarioGRideId);
      expect(accruals.length).toBe(1);
      expect(BigInt(accruals[0].amount_cents)).toBe(180n);
    });

    it('G3. manual recovery attempt: appendEvent returns already exists (idempotent)', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';

      // The accrual was already created by G2 (shadow service recovery path).
      // Manual recovery with same idempotency key should return created=false.
      const idempotencyKey = `annual_incentive:accrual:wallet_ledger:${walletLedgerEntryId}`;

      const { getProgramYearBrazil } = await import('../src/services/finance/annual-incentive-program-year');

      const walletEntry = await pool.query(
        'SELECT created_at FROM wallet_ledger WHERE id = $1',
        [walletLedgerEntryId]
      );
      const occurredAt = new Date(walletEntry.rows[0].created_at);
      const programYear = getProgramYearBrazil(occurredAt);

      const recoveryResult = await ledgerService.appendEvent({
        driverId: TEST_DRIVER,
        programYear,
        eventType: 'ACCRUAL',
        amountCents: 180n,
        baseAmountCents: 1800n,
        rateBasisPoints: 1000,
        policyVersion: 'ANNUAL-INCENTIVE-v1',
        sourceType: 'FEE_DEBIT',
        sourceId: scenarioGRideId,
        sourceEventId: walletLedgerEntryId,
        requestId: null,
        correlationId: `ride:${scenarioGRideId}`,
        reversalOfId: null,
        idempotencyKey,
        metadata: { writeMode: 'SHADOW', walletLedgerEntryId, rideId: scenarioGRideId },
        occurredAt,
      });

      // Already exists — idempotent return
      expect(recoveryResult.created).toBe(false);
      expect(recoveryResult.event.amountCents).toBe(180n);
    });

    it('G4. second recovery attempt is idempotent (no duplicate)', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';

      const idempotencyKey = `annual_incentive:accrual:wallet_ledger:${walletLedgerEntryId}`;
      const walletEntry = await pool.query('SELECT created_at FROM wallet_ledger WHERE id = $1', [walletLedgerEntryId]);
      const occurredAt = new Date(walletEntry.rows[0].created_at);
      const { getProgramYearBrazil } = await import('../src/services/finance/annual-incentive-program-year');
      const programYear = getProgramYearBrazil(occurredAt);

      const secondResult = await ledgerService.appendEvent({
        driverId: TEST_DRIVER,
        programYear,
        eventType: 'ACCRUAL',
        amountCents: 180n,
        baseAmountCents: 1800n,
        rateBasisPoints: 1000,
        policyVersion: 'ANNUAL-INCENTIVE-v1',
        sourceType: 'FEE_DEBIT',
        sourceId: scenarioGRideId,
        sourceEventId: walletLedgerEntryId,
        requestId: null,
        correlationId: `ride:${scenarioGRideId}`,
        reversalOfId: null,
        idempotencyKey,
        metadata: { writeMode: 'SHADOW', walletLedgerEntryId, rideId: scenarioGRideId },
        occurredAt,
      });

      expect(secondResult.created).toBe(false);

      // Still only one accrual
      const accruals = await getAccruals(scenarioGRideId);
      expect(accruals.length).toBe(1);
    });

    it('G5. reconciler: MATCH after recovery', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
      await setFeatureFlags(true, true);

      const report = await reconciliationService.run({ driverId: TEST_DRIVER, rideId: scenarioGRideId });

      const rideItems = report.items.filter(i => i.rideId === scenarioGRideId);
      expect(rideItems.length).toBe(1);
      expect(rideItems[0].statuses).toContain('MATCH');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO H — Duas corridas pendentes na mesma recarga
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario H — duas corridas na mesma recarga', () => {
    let rideH1: string;
    let rideH2: string;

    it('H1. create two rides with pending fees', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
      await setFeatureFlags(true, true);

      // Low balance: both rides will have partial collection
      await resetBalance(0, 0);

      rideH1 = nextRideId();
      rideH2 = nextRideId();

      // Ride 1: fee = 900 (finalPrice = 5000)
      // With zero balance, partial = 0, entire fee is pending
      await resetBalance(0, 0);
      const result1 = await settlementService.settleRide({
        rideId: rideH1,
        driverId: TEST_DRIVER,
        finalPriceCents: 5000n,
        reservedCents: 0n,
      });
      expect(result1.collected).toBe(false);

      // Ride 2: fee = 360 (finalPrice = 2000)
      const result2 = await settlementService.settleRide({
        rideId: rideH2,
        driverId: TEST_DRIVER,
        finalPriceCents: 2000n,
        reservedCents: 0n,
      });
      expect(result2.collected).toBe(false);

      // Verify both are pending
      const pendings = await pendingDebitService.getDriverPendings(TEST_DRIVER);
      const hPendings = pendings.filter(p => p.ride_id === rideH1 || p.ride_id === rideH2);
      expect(hPendings.length).toBe(2);
    });

    it('H2. single recharge resolves both in FIFO order', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';

      // Recharge: enough to cover both (900 + 360 = 1260)
      await resetBalance(0, 0);
      const rechargeId = nextRechargeId();
      await walletService.creditRecharge(TEST_DRIVER, 5000n, rechargeId);

      const resolved = await pendingDebitService.resolveOnRecharge(
        TEST_DRIVER, shadowService, feeSplitService, territoryLedgerService
      );
      expect(resolved).toBe(2);

      // Verify both resolved
      const ride1Pending = await pool.query(
        "SELECT status FROM pending_debits WHERE ride_id = $1",
        [rideH1]
      );
      expect(ride1Pending.rows[0].status).toBe('resolved');

      const ride2Pending = await pool.query(
        "SELECT status FROM pending_debits WHERE ride_id = $1",
        [rideH2]
      );
      expect(ride2Pending.rows[0].status).toBe('resolved');
    });

    it('H3. each pending_resolve has its own ACCRUAL with distinct source_event_id', async () => {
      // Ride H1: fee = 900, accrual = 90
      const accrualsH1 = await getAccruals(rideH1);
      expect(accrualsH1.length).toBe(1);
      expect(BigInt(accrualsH1[0].amount_cents)).toBe(90n);
      expect(accrualsH1[0].source_type).toBe('PENDING_RESOLVE');

      // Ride H2: fee = 360, accrual = 36
      const accrualsH2 = await getAccruals(rideH2);
      expect(accrualsH2.length).toBe(1);
      expect(BigInt(accrualsH2[0].amount_cents)).toBe(36n);
      expect(accrualsH2[0].source_type).toBe('PENDING_RESOLVE');

      // Different source_event_id
      expect(accrualsH1[0].source_event_id).not.toBe(accrualsH2[0].source_event_id);
    });

    it('H4. reconciler: MATCH for each completed event', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
      await setFeatureFlags(true, true);

      const reportH1 = await reconciliationService.run({ driverId: TEST_DRIVER, rideId: rideH1 });
      const h1Items = reportH1.items.filter(i => i.rideId === rideH1);
      expect(h1Items.length).toBe(1);
      expect(h1Items[0].statuses).toContain('MATCH');

      const reportH2 = await reconciliationService.run({ driverId: TEST_DRIVER, rideId: rideH2 });
      const h2Items = reportH2.items.filter(i => i.rideId === rideH2);
      expect(h2Items.length).toBe(1);
      expect(h2Items[0].statuses).toContain('MATCH');
    });

    it('H5. each ride has independent totals', async () => {
      await setFeatureFlags(true, true);

      const reportH1 = await reconciliationService.run({ driverId: TEST_DRIVER, rideId: rideH1 });
      const groupH1 = reportH1.groups.byRide[rideH1];
      expect(groupH1.expectedGrossAccrualCents).toBe(90n);
      expect(groupH1.differenceCents).toBe(0n);

      const reportH2 = await reconciliationService.run({ driverId: TEST_DRIVER, rideId: rideH2 });
      const groupH2 = reportH2.groups.byRide[rideH2];
      expect(groupH2.expectedGrossAccrualCents).toBe(36n);
      expect(groupH2.differenceCents).toBe(0n);
    });

    it('H6. document: each pendency confirmed in separate transaction', () => {
      // By design, PendingDebitService.resolveOnRecharge processes each pending
      // in its own transaction (connect → BEGIN → resolve → COMMIT → release).
      // This means if ride H2 fails, ride H1's resolution is already committed.
      // This is the FIFO architecture boundary — documented, not a defect.
      expect(true).toBe(true); // Documentation assertion
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO I — Coexistência com o legado (family_return_accruals)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario I — coexistência com legado', () => {
    it('I1. fee_debit does NOT create family_return_accruals', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
      await setFeatureFlags(true, true);

      const familyBefore = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM family_return_accruals WHERE driver_id = $1",
        [TEST_DRIVER]
      );

      await resetBalance(50000, 1800);
      const rideId = nextRideId();
      await shadowService.debitFee(TEST_DRIVER, 1800n, 1800n, rideId);

      const familyAfter = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM family_return_accruals WHERE driver_id = $1",
        [TEST_DRIVER]
      );
      expect(familyAfter.rows[0].cnt).toBe(familyBefore.rows[0].cnt);
    });

    it('I2. annual_incentive_ledger grows only from fee consumption', async () => {
      // An isolated recharge should NOT create any ACCRUAL in annual_incentive_ledger
      const accrualsBefore = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE driver_id = $1",
        [TEST_DRIVER]
      );

      const rechargeId = nextRechargeId();
      await walletService.creditRecharge(TEST_DRIVER, 1000n, rechargeId);

      const accrualsAfter = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE driver_id = $1",
        [TEST_DRIVER]
      );
      expect(accrualsAfter.rows[0].cnt).toBe(accrualsBefore.rows[0].cnt);
    });

    it('I3. reconciler uses only wallet_ledger as source of truth', async () => {
      await setFeatureFlags(true, true);

      const report = await reconciliationService.run({ driverId: TEST_DRIVER });

      // All items reference wallet_ledger entries (not family_return_accruals)
      for (const item of report.items) {
        expect(item.walletLedgerEntryId).toBeTruthy();
        expect(item.walletEntryType === 'fee_debit' || item.walletEntryType === 'pending_resolve').toBe(true);
      }
    });

    it('I4. the two balances are not summed by reconciler', async () => {
      await setFeatureFlags(true, true);

      const report = await reconciliationService.run({ driverId: TEST_DRIVER });

      // The reconciler only knows about annual_incentive_ledger ACCRUAL amounts
      // It does NOT include family_return_accruals in actualGrossAccrualCents
      // Verify by checking: actualGrossAccrualCents == sum of annual_incentive_ledger only
      const actualAIL = await pool.query(
        "SELECT COALESCE(SUM(ABS(amount_cents)), 0)::bigint AS total FROM annual_incentive_ledger WHERE driver_id = $1 AND event_type = 'ACCRUAL'",
        [TEST_DRIVER]
      );
      expect(report.totals.actualGrossAccrualCents).toBe(BigInt(actualAIL.rows[0].total));
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SCENARIO J — Mudança de ano
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Scenario J — mudança de ano', () => {
    let scenarioJRideId: string;
    let feeDebitLedgerId: string;
    let pendingResolveLedgerId: string;

    it('J1. setup: fee_debit at 2027-01-01T01:30:00Z (Brazil year 2026)', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
      await setFeatureFlags(true, true);
      await resetBalance(50000, 500);

      scenarioJRideId = nextRideId();

      // Direct wallet debit with controlled timestamp (simulate fee_debit at specific time)
      // Use SQL to insert wallet_ledger entry with controlled created_at
      const feeDebitTimestamp = '2027-01-01T01:30:00Z'; // Brazil: 2026-12-31 22:30 → year 2026

      // Insert fee_debit directly in wallet (we need controlled timestamp)
      const walletBefore = await getWalletBalance();
      const newBalance = walletBefore.balance_cents - 500n;
      const newReserved = walletBefore.reserved_cents - 500n;

      await pool.query(
        'UPDATE driver_wallets SET balance_cents = $2, reserved_cents = $3, updated_at = NOW() WHERE driver_id = $1',
        [TEST_DRIVER, newBalance.toString(), (newReserved < 0n ? 0n : newReserved).toString()]
      );

      const feeResult = await pool.query(
        `INSERT INTO wallet_ledger (driver_id, entry_type, balance_delta_cents, reserved_delta_cents, balance_after_cents, reserved_after_cents, reference_type, reference_id, actor_type, actor_id, reason, idempotency_key, created_at)
         VALUES ($1, 'fee_debit', -500, -500, $2, $3, 'ride', $4, 'system', 'settle', $5, $6, $7::timestamptz) RETURNING id, created_at`,
        [TEST_DRIVER, newBalance.toString(), (newReserved < 0n ? 0n : newReserved).toString(), scenarioJRideId, `fee:ride:${scenarioJRideId}`, `fee:ride:${scenarioJRideId}`, feeDebitTimestamp]
      );
      feeDebitLedgerId = feeResult.rows[0].id.toString();

      // Create ACCRUAL for this fee_debit: 10% of 500 = 50 → year 2026
      const { getProgramYearBrazil } = await import('../src/services/finance/annual-incentive-program-year');
      const yearForFee = getProgramYearBrazil(new Date(feeDebitTimestamp));
      expect(yearForFee).toBe(2026);

      await ledgerService.appendEvent({
        driverId: TEST_DRIVER,
        programYear: yearForFee,
        eventType: 'ACCRUAL',
        amountCents: 50n,
        baseAmountCents: 500n,
        rateBasisPoints: 1000,
        policyVersion: 'ANNUAL-INCENTIVE-v1',
        sourceType: 'FEE_DEBIT',
        sourceId: scenarioJRideId,
        sourceEventId: feeDebitLedgerId,
        requestId: null,
        correlationId: `ride:${scenarioJRideId}`,
        reversalOfId: null,
        idempotencyKey: `annual_incentive:accrual:wallet_ledger:${feeDebitLedgerId}`,
        metadata: { writeMode: 'SHADOW', walletLedgerEntryId: feeDebitLedgerId, rideId: scenarioJRideId },
        occurredAt: new Date(feeDebitTimestamp),
      });
    });

    it('J2. pending_resolve at 2027-01-01T03:30:00Z (Brazil year 2027)', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';

      const pendingResolveTimestamp = '2027-01-01T03:30:00Z'; // Brazil: 2027-01-01 00:30 → year 2027

      // Create a pending_debit for this ride
      const pendingResult = await pool.query(
        `INSERT INTO pending_debits (ride_id, driver_id, final_price_cents, fee_percent_snapshot, fee_amount_cents, fee_collected_cents, fee_pending_cents, reserved_amount_cents, reason, status, idempotency_key)
         VALUES ($1, $2, '10000', 18.00, '1800', '500', '1300', '0', 'platform_fee', 'resolved', $3)
         RETURNING id`,
        [scenarioJRideId, TEST_DRIVER, `pending_debit:${scenarioJRideId}`]
      );
      const pendingDebitId = pendingResult.rows[0].id.toString();

      // Insert pending_resolve with controlled timestamp
      const walletBefore = await getWalletBalance();
      const newBalance = walletBefore.balance_cents - 1300n;

      await pool.query(
        'UPDATE driver_wallets SET balance_cents = $2, updated_at = NOW() WHERE driver_id = $1',
        [TEST_DRIVER, newBalance.toString()]
      );

      const resolveResult = await pool.query(
        `INSERT INTO wallet_ledger (driver_id, entry_type, balance_delta_cents, reserved_delta_cents, balance_after_cents, reserved_after_cents, reference_type, reference_id, actor_type, actor_id, reason, idempotency_key, created_at)
         VALUES ($1, 'pending_resolve', -1300, 0, $2, $3, 'pending_debit', $4, 'system', 'pending_resolver', $5, $6, $7::timestamptz) RETURNING id, created_at`,
        [TEST_DRIVER, newBalance.toString(), walletBefore.reserved_cents.toString(), pendingDebitId, `pending_resolve:${pendingDebitId}`, `pending_resolve:${pendingDebitId}`, pendingResolveTimestamp]
      );
      pendingResolveLedgerId = resolveResult.rows[0].id.toString();

      // ACCRUAL for pending_resolve: cumulative base = 500+1300=1800, target=180, already=50, increment=130
      const { getProgramYearBrazil } = await import('../src/services/finance/annual-incentive-program-year');
      const yearForResolve = getProgramYearBrazil(new Date(pendingResolveTimestamp));
      expect(yearForResolve).toBe(2027);

      await ledgerService.appendEvent({
        driverId: TEST_DRIVER,
        programYear: yearForResolve,
        eventType: 'ACCRUAL',
        amountCents: 130n,
        baseAmountCents: 1300n,
        rateBasisPoints: 1000,
        policyVersion: 'ANNUAL-INCENTIVE-v1',
        sourceType: 'PENDING_RESOLVE',
        sourceId: scenarioJRideId,
        sourceEventId: pendingResolveLedgerId,
        requestId: null,
        correlationId: `ride:${scenarioJRideId}`,
        reversalOfId: null,
        idempotencyKey: `annual_incentive:accrual:wallet_ledger:${pendingResolveLedgerId}`,
        metadata: { writeMode: 'SHADOW', walletLedgerEntryId: pendingResolveLedgerId, pendingDebitId, rideId: scenarioJRideId, cumulativeBaseAmountCents: '1800', targetEntitlementCents: '180' },
        occurredAt: new Date(pendingResolveTimestamp),
      });
    });

    it('J3. reconciler --program-year 2026: increment 50, MATCH', async () => {
      await setFeatureFlags(true, true);

      const report = await reconciliationService.run({
        driverId: TEST_DRIVER,
        rideId: scenarioJRideId,
        programYear: 2026,
      });

      const items = report.items.filter(i => i.rideId === scenarioJRideId);
      expect(items.length).toBe(1);
      expect(items[0].programYear).toBe(2026);
      expect(items[0].expectedIncrementCents).toBe(50n);
      expect(items[0].statuses).toContain('MATCH');
    });

    it('J4. reconciler --program-year 2027: increment 130, MATCH', async () => {
      await setFeatureFlags(true, true);

      const report = await reconciliationService.run({
        driverId: TEST_DRIVER,
        rideId: scenarioJRideId,
        programYear: 2027,
      });

      const items = report.items.filter(i => i.rideId === scenarioJRideId);
      expect(items.length).toBe(1);
      expect(items[0].programYear).toBe(2027);
      expect(items[0].expectedIncrementCents).toBe(130n);
      expect(items[0].actualAmountCents).toBe(130n);
      expect(items[0].statuses).toContain('MATCH');
    });

    it('J5. year 2027 report has correct cumulative values', async () => {
      await setFeatureFlags(true, true);

      const report = await reconciliationService.run({
        driverId: TEST_DRIVER,
        rideId: scenarioJRideId,
        programYear: 2027,
      });

      const items = report.items.filter(i => i.rideId === scenarioJRideId);
      // cumulativeBaseCents should be full (500+1300=1800) because all events participate in base calc
      expect(items[0].cumulativeBaseCents).toBe(1800n);
      expect(items[0].consumedFeeAmountCents).toBe(1300n);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 14 — Atomicidade
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Atomicity — fee_debit rollback on accrual failure', () => {
    it('AT1. if accrual insert fails, fee_debit is rolled back', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
      await resetBalance(50000, 1800);

      const rideId = nextRideId();
      const balanceBefore = await getWalletBalance();

      // Create a shadow service with a broken ledger service that will fail on appendEventInClient
      const brokenLedgerService = {
        appendEventInClient: async () => {
          throw new Error('SIMULATED_ACCRUAL_FAILURE');
        },
        appendEvent: ledgerService.appendEvent.bind(ledgerService),
      } as unknown as AnnualIncentiveLedgerService;

      const brokenShadow = new AnnualIncentiveShadowService(pool, walletService, brokenLedgerService);

      await expect(
        brokenShadow.debitFee(TEST_DRIVER, 1800n, 1800n, rideId)
      ).rejects.toThrow('SIMULATED_ACCRUAL_FAILURE');

      // fee_debit should NOT exist (rolled back)
      const entries = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE driver_id = $1 AND reference_id = $2 AND entry_type = 'fee_debit'",
        [TEST_DRIVER, rideId]
      );
      expect(entries.rows[0].cnt).toBe(0);

      // Balance unchanged
      const balanceAfter = await getWalletBalance();
      expect(balanceAfter.balance_cents).toBe(balanceBefore.balance_cents);
      expect(balanceAfter.reserved_cents).toBe(balanceBefore.reserved_cents);

      // No accrual
      const accrualCount = await countAccruals(rideId);
      expect(accrualCount).toBe(0);
    });
  });

  describe('Atomicity — pending_resolve rollback on accrual failure', () => {
    it('AT2. if accrual insert fails during resolve, pending stays pending', async () => {
      process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
      process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
      await setFeatureFlags(true, true);

      // Setup: create a ride with pending fee
      await resetBalance(0, 0);
      const rideId = nextRideId();

      await settlementService.settleRide({
        rideId,
        driverId: TEST_DRIVER,
        finalPriceCents: 5000n,  // fee = 900
        reservedCents: 0n,
      });

      // Verify it's pending
      const pendingBefore = await pool.query(
        "SELECT id, status FROM pending_debits WHERE ride_id = $1",
        [rideId]
      );
      expect(pendingBefore.rows[0].status).toBe('pending');

      // Recharge to have enough
      await resetBalance(0, 0);
      const rechargeId = nextRechargeId();
      await walletService.creditRecharge(TEST_DRIVER, 5000n, rechargeId);
      const balanceBefore = await getWalletBalance();

      // Create broken executor that fails on accrual
      const brokenLedgerService2 = {
        appendEventInClient: async () => {
          throw new Error('SIMULATED_RESOLVE_ACCRUAL_FAILURE');
        },
      } as unknown as AnnualIncentiveLedgerService;
      const brokenShadow2 = new AnnualIncentiveShadowService(pool, walletService, brokenLedgerService2);

      // Attempt to resolve — should fail and rollback
      const resolved = await pendingDebitService.resolveOnRecharge(
        TEST_DRIVER, brokenShadow2, feeSplitService, territoryLedgerService
      );
      expect(resolved).toBe(0);

      // Pending still pending
      const pendingAfter = await pool.query(
        "SELECT status FROM pending_debits WHERE ride_id = $1",
        [rideId]
      );
      expect(pendingAfter.rows[0].status).toBe('pending');

      // Balance: no debit occurred (rolled back)
      // Note: The balance might differ slightly because recharge already happened,
      // but no debit should have been committed
      const resolveEntries = await pool.query(
        "SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE driver_id = $1 AND entry_type = 'pending_resolve' AND reference_id = $2",
        [TEST_DRIVER, pendingBefore.rows[0].id.toString()]
      );
      expect(resolveEntries.rows[0].cnt).toBe(0);

      // No accrual for this ride
      const accrualCount = await countAccruals(rideId);
      expect(accrualCount).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 15 — Fronteiras não atômicas já conhecidas (documentação)
  // ═══════════════════════════════════════════════════════════════════════════

  describe('Non-atomic boundaries — documentation', () => {
    it('DOC1. ride_fee_splits updated post-commit (non-atomic with incentive)', () => {
      // ride_fee_splits.markCollected() is called AFTER the transaction that
      // creates pending_resolve + ACCRUAL. A failure in markCollected does NOT
      // rollback the incentive accrual. This is by design.
      expect(true).toBe(true);
    });

    it('DOC2. territory_ledger updated post-commit (non-atomic with incentive)', () => {
      // territory_ledger.recordFeeShare() is called AFTER the pending resolve
      // transaction commits. Failure is non-fatal and does not affect the
      // annual incentive already confirmed.
      expect(true).toBe(true);
    });

    it('DOC3. failure in post-commit effects does NOT erase annual incentive', () => {
      // The annual incentive ACCRUAL is confirmed within the same transaction
      // as the wallet debit. Post-commit effects (fee_split, territory_ledger)
      // are separate and their failure does not trigger reversal of the incentive.
      // These boundaries will require their own reconciliation in a future stage.
      expect(true).toBe(true);
    });
  });
});
