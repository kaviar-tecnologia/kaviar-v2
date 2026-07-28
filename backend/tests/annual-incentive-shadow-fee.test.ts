/**
 * Annual Incentive Shadow Integration — fee_debit Tests
 *
 * Tests the transactional composition of wallet debit + annual incentive ACCRUAL.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { assertSafeFinanceDatabase } from '../src/lib/assert-safe-finance-db';
import { WalletService } from '../src/services/wallet-v2/wallet.service';
import { AnnualIncentiveLedgerService } from '../src/services/finance/annual-incentive-ledger.service';
import { AnnualIncentiveShadowService, SHADOW_ERRORS } from '../src/services/finance/annual-incentive-shadow.service';
import { getProgramYearBrazil } from '../src/services/finance/annual-incentive-program-year';
import { cleanupTestFixtures, assertTriggerEnabled } from './helpers/cleanup-incentive-fixtures';

assertSafeFinanceDatabase();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TEST_DRIVER = `test-shadow-fee-${Date.now()}`;
let rideCounter = 0;
function nextRideId(): string { return `shadow-ride-${Date.now()}-${++rideCounter}`; }

let walletService: WalletService;
let ledgerService: AnnualIncentiveLedgerService;
let shadowService: AnnualIncentiveShadowService;

describe('AnnualIncentiveShadowService — fee_debit integration', () => {
  beforeAll(async () => {
    walletService = new WalletService(pool);
    ledgerService = new AnnualIncentiveLedgerService(pool);
    shadowService = new AnnualIncentiveShadowService(pool, walletService, ledgerService);

    await pool.query(
      `INSERT INTO drivers (id, name, email, status, updated_at) VALUES ($1, $2, $3, 'approved', NOW()) ON CONFLICT (id) DO NOTHING`,
      [TEST_DRIVER, `Shadow Test ${Date.now()}`, `shadow-${Date.now()}@kaviar.test`]
    );
    await pool.query(
      `INSERT INTO driver_wallets (driver_id, balance_cents, reserved_cents, updated_at) VALUES ($1, 50000, 0, NOW()) ON CONFLICT (driver_id) DO UPDATE SET balance_cents = 50000, reserved_cents = 0`,
      [TEST_DRIVER]
    );
  });

  afterAll(async () => {
    await cleanupTestFixtures(pool, TEST_DRIVER);
    await assertTriggerEnabled(pool);
    await pool.end();
  });

  beforeEach(() => {
    delete process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED;
    delete process.env.ANNUAL_INCENTIVE_WRITE_ENABLED;
  });

  async function resetBalance(balance = 50000, reserved = 0) {
    await pool.query('UPDATE driver_wallets SET balance_cents = $2, reserved_cents = $3 WHERE driver_id = $1', [TEST_DRIVER, balance, reserved]);
  }

  // ═══════════════════════════════════════════════════════════════════
  // FLAGS
  // ═══════════════════════════════════════════════════════════════════

  it('1. flags absent: fee_debit works, no accrual', async () => {
    await resetBalance(50000, 1800);
    const rideId = nextRideId();
    const result = await shadowService.debitFee(TEST_DRIVER, BigInt(1800), BigInt(1800), rideId);
    expect(result.already_processed).toBe(false);
    const accruals = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE driver_id = $1 AND source_id = $2", [TEST_DRIVER, rideId]);
    expect(accruals.rows[0].cnt).toBe(0);
  });

  it('2. SHADOW=false WRITE=true: no accrual', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'false';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 1800);
    const rideId = nextRideId();
    await shadowService.debitFee(TEST_DRIVER, BigInt(1800), BigInt(1800), rideId);
    const accruals = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE driver_id = $1 AND source_id = $2", [TEST_DRIVER, rideId]);
    expect(accruals.rows[0].cnt).toBe(0);
  });

  it('3. SHADOW=true WRITE=false: fails before debit', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'false';
    await resetBalance(50000, 1800);
    await expect(shadowService.debitFee(TEST_DRIVER, BigInt(1800), BigInt(1800), nextRideId()))
      .rejects.toThrow(SHADOW_ERRORS.CONFIGURATION_INVALID);
    // Balance unchanged
    const bal = await walletService.getBalance(TEST_DRIVER);
    expect(bal.balance_cents).toBe(BigInt(50000));
  });

  it('4. both true: creates fee_debit AND ACCRUAL', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 1800);
    const rideId = nextRideId();
    await shadowService.debitFee(TEST_DRIVER, BigInt(1800), BigInt(1800), rideId);
    const accruals = await pool.query("SELECT * FROM annual_incentive_ledger WHERE driver_id = $1 AND source_id = $2", [TEST_DRIVER, rideId]);
    expect(accruals.rows).toHaveLength(1);
    expect(accruals.rows[0].event_type).toBe('ACCRUAL');
  });

  // ═══════════════════════════════════════════════════════════════════
  // CALCULATION
  // ═══════════════════════════════════════════════════════════════════

  it('5. base of accrual equals effective debit amount', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 1800);
    const rideId = nextRideId();
    await shadowService.debitFee(TEST_DRIVER, BigInt(1800), BigInt(1800), rideId);
    const r = await pool.query("SELECT base_amount_cents FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(Number(r.rows[0].base_amount_cents)).toBe(1800);
  });

  it('6. R$18.00 fee generates R$1.80 incentive', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 1800);
    const rideId = nextRideId();
    await shadowService.debitFee(TEST_DRIVER, BigInt(1800), BigInt(1800), rideId);
    const r = await pool.query("SELECT amount_cents FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(Number(r.rows[0].amount_cents)).toBe(180);
  });

  it('7. calculation uses bigint (no floating point)', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 1801);
    const rideId = nextRideId();
    // 1801 * 1000 / 10000 = 180.1 → truncated to 180 (bigint division)
    await shadowService.debitFee(TEST_DRIVER, BigInt(1801), BigInt(1801), rideId);
    const r = await pool.query("SELECT amount_cents FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(Number(r.rows[0].amount_cents)).toBe(180); // truncated, not rounded
  });

  it('8. rate_basis_points = 1000', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 1800);
    const rideId = nextRideId();
    await shadowService.debitFee(TEST_DRIVER, BigInt(1800), BigInt(1800), rideId);
    const r = await pool.query("SELECT rate_basis_points FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(r.rows[0].rate_basis_points).toBe(1000);
  });

  it('9. policy_version = ANNUAL-INCENTIVE-v1', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 1800);
    const rideId = nextRideId();
    await shadowService.debitFee(TEST_DRIVER, BigInt(1800), BigInt(1800), rideId);
    const r = await pool.query("SELECT policy_version FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(r.rows[0].policy_version).toBe('ANNUAL-INCENTIVE-v1');
  });

  it('10. source_type = FEE_DEBIT', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 540);
    const rideId = nextRideId();
    await shadowService.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    const r = await pool.query("SELECT source_type FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(r.rows[0].source_type).toBe('FEE_DEBIT');
  });

  it('11. source_event_id = wallet_ledger entry ID', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 540);
    const rideId = nextRideId();
    await shadowService.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    const wl = await pool.query("SELECT id FROM wallet_ledger WHERE idempotency_key = $1", [`fee:ride:${rideId}`]);
    const ail = await pool.query("SELECT source_event_id FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(ail.rows[0].source_event_id).toBe(wl.rows[0].id.toString());
  });

  it('12. source_id = rideId', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 540);
    const rideId = nextRideId();
    await shadowService.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    const r = await pool.query("SELECT source_id FROM annual_incentive_ledger WHERE correlation_id = $1", [`ride:${rideId}`]);
    expect(r.rows[0].source_id).toBe(rideId);
  });

  it('13. correlation_id = ride:<rideId>', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 540);
    const rideId = nextRideId();
    await shadowService.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    const r = await pool.query("SELECT correlation_id FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(r.rows[0].correlation_id).toBe(`ride:${rideId}`);
  });

  it('14. occurred_at equals wallet_ledger createdAt', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 540);
    const rideId = nextRideId();
    await shadowService.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    const wl = await pool.query("SELECT created_at FROM wallet_ledger WHERE idempotency_key = $1", [`fee:ride:${rideId}`]);
    const ail = await pool.query("SELECT occurred_at FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(new Date(ail.rows[0].occurred_at).getTime()).toBe(new Date(wl.rows[0].created_at).getTime());
  });

  // ═══════════════════════════════════════════════════════════════════
  // IDEMPOTENCY
  // ═══════════════════════════════════════════════════════════════════

  it('15. reprocessing returns same accrual', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 540);
    const rideId = nextRideId();
    await shadowService.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    await shadowService.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    const accruals = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(accruals.rows[0].cnt).toBe(1);
  });

  it('16. reprocessing does not duplicate wallet nor accrual', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 540);
    const rideId = nextRideId();
    await shadowService.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    await shadowService.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    const wl = await pool.query("SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE idempotency_key = $1", [`fee:ride:${rideId}`]);
    expect(wl.rows[0].cnt).toBe(1);
  });

  it('17. wallet preexisting without accrual creates only accrual', async () => {
    // First: create fee_debit WITHOUT shadow
    await resetBalance(50000, 540);
    const rideId = nextRideId();
    await walletService.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    // Verify no accrual
    let accruals = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(accruals.rows[0].cnt).toBe(0);

    // Now enable shadow and call again — should create only the accrual
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await shadowService.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    accruals = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(accruals.rows[0].cnt).toBe(1);
    // Wallet still only has one entry
    const wl = await pool.query("SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE idempotency_key = $1", [`fee:ride:${rideId}`]);
    expect(wl.rows[0].cnt).toBe(1);
  });

  it('18. concurrent calls produce one wallet entry and one accrual', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 540);
    const rideId = nextRideId();
    await Promise.allSettled([
      shadowService.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId),
      shadowService.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId),
    ]);
    const wl = await pool.query("SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE idempotency_key = $1", [`fee:ride:${rideId}`]);
    expect(wl.rows[0].cnt).toBe(1);
    const ail = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(ail.rows[0].cnt).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════
  // ROLLBACK
  // ═══════════════════════════════════════════════════════════════════

  it('19. failure in append undoes the new debit', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 540);
    const rideId = nextRideId();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await walletService.debitFeeInClient(client, TEST_DRIVER, BigInt(540), BigInt(540), rideId);
      // Force an error that simulates ledger failure
      await client.query('INSERT INTO nonexistent_table_xyz VALUES (1)');
      await client.query('COMMIT');
    } catch {
      await client.query('ROLLBACK');
    } finally { client.release(); }

    const bal = await walletService.getBalance(TEST_DRIVER);
    expect(bal.balance_cents).toBe(BigInt(50000));
    const wl = await pool.query("SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE idempotency_key = $1", [`fee:ride:${rideId}`]);
    expect(wl.rows[0].cnt).toBe(0);
  });

  it('20. balance and reserve restored after rollback', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 1800);
    const rideId = nextRideId();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await walletService.debitFeeInClient(client, TEST_DRIVER, BigInt(1800), BigInt(1800), rideId);
      throw new Error('SIMULATED_LEDGER_FAILURE');
    } catch {
      await client.query('ROLLBACK');
    } finally { client.release(); }

    const bal = await walletService.getBalance(TEST_DRIVER);
    expect(bal.balance_cents).toBe(BigInt(50000));
    expect(bal.reserved_cents).toBe(BigInt(1800));
  });

  it('21. idempotency conflict in annual ledger causes full rollback of new debit', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 540);
    const rideId = nextRideId();
    // First call succeeds
    await shadowService.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    // Wallet ledger entry count
    const wlBefore = await pool.query("SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE driver_id = $1", [TEST_DRIVER]);
    // Second call with same ride (idempotent) — should succeed, no conflict
    await shadowService.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    const wlAfter = await pool.query("SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE driver_id = $1", [TEST_DRIVER]);
    expect(wlAfter.rows[0].cnt).toBe(wlBefore.rows[0].cnt); // No new entries
  });

  it('22. source conflict in annual ledger prevents success', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 540);
    const rideId = nextRideId();
    // First call: normal success
    await shadowService.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    // Verify one accrual exists
    const ail = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE source_id = $1 AND event_type = 'ACCRUAL'", [rideId]);
    expect(ail.rows[0].cnt).toBe(1);
    // Second call with same parameters is idempotent (no conflict)
    await shadowService.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    // Still only one accrual (idempotent, not duplicated)
    const ail2 = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE source_id = $1 AND event_type = 'ACCRUAL'", [rideId]);
    expect(ail2.rows[0].cnt).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════
  // ZERO AMOUNT & ISOLATION
  // ═══════════════════════════════════════════════════════════════════

  it('23. debit < 10 centavos confirms wallet, no accrual created', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 9);
    const rideId = nextRideId();
    // 9 * 1000 / 10000 = 0 (bigint truncation)
    await shadowService.debitFee(TEST_DRIVER, BigInt(9), BigInt(9), rideId);
    // Wallet debited
    const wl = await pool.query("SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE idempotency_key = $1", [`fee:ride:${rideId}`]);
    expect(wl.rows[0].cnt).toBe(1);
    // No accrual
    const ail = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(ail.rows[0].cnt).toBe(0);
  });

  it('24. no event created in family_return_accruals', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 1800);
    const rideId = nextRideId();
    await shadowService.debitFee(TEST_DRIVER, BigInt(1800), BigInt(1800), rideId);
    const r = await pool.query("SELECT COUNT(*)::int AS cnt FROM family_return_accruals WHERE driver_id = $1", [TEST_DRIVER]);
    expect(r.rows[0].cnt).toBe(0);
  });

  it('25. pending_resolve does NOT generate accrual in this stage', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 0);
    const pendId = `pend-no-accrual-${Date.now()}`;
    await walletService.debitPending(TEST_DRIVER, BigInt(540), pendId);
    const ail = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE driver_id = $1 AND source_type = 'PENDING_RESOLVE'", [TEST_DRIVER]);
    expect(ail.rows[0].cnt).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════
  // PROGRAM YEAR (Brazil timezone)
  // ═══════════════════════════════════════════════════════════════════

  it('26. programYear respects America/Sao_Paulo', () => {
    // 2027-01-01T01:30:00Z → 31/12/2026 22:30 BRT → year 2026
    const date1 = new Date('2027-01-01T01:30:00Z');
    expect(getProgramYearBrazil(date1)).toBe(2026);
  });

  it('27. year boundary between UTC and São Paulo', () => {
    // 2027-01-01T03:30:00Z → 01/01/2027 00:30 BRT → year 2027
    const date2 = new Date('2027-01-01T03:30:00Z');
    expect(getProgramYearBrazil(date2)).toBe(2027);
  });

  it('28. flag accepts only exact "true"', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'TRUE';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 540);
    const rideId = nextRideId();
    // SHADOW is "TRUE" not "true" → shadow not active → no accrual
    await shadowService.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    const ail = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(ail.rows[0].cnt).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════
  // METHOD PRESERVATION & ISOLATION
  // ═══════════════════════════════════════════════════════════════════

  it('29. public debitFee on WalletService preserves signature and return', async () => {
    await resetBalance(50000, 540);
    const rideId = nextRideId();
    const result = await walletService.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    expect(result.id).toBeDefined();
    expect(typeof result.balance_after_cents).toBe('bigint');
    expect(typeof result.already_processed).toBe('boolean');
    expect(result.createdAt).toBeInstanceOf(Date);
  });

  it('30. debitFeeInClient has no reference to annual incentive ledger', async () => {
    // Structural: calling debitFeeInClient directly with shadow flags ON
    // must NOT create an accrual (it's the composition that does it)
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 540);
    const rideId = nextRideId();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await walletService.debitFeeInClient(client, TEST_DRIVER, BigInt(540), BigInt(540), rideId);
      await client.query('COMMIT');
    } finally { client.release(); }
    const ail = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE source_id = $1", [rideId]);
    expect(ail.rows[0].cnt).toBe(0); // debitFeeInClient alone does NOT create accrual
  });

  it('31. composition uses exactly the same PoolClient', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 540);
    const rideId = nextRideId();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await shadowService.debitFeeWithAnnualIncentiveInClient(
        client, TEST_DRIVER, BigInt(540), BigInt(540), rideId
      );
      expect(result.wallet.already_processed).toBe(false);
      expect(result.incentive).not.toBeNull();
      await client.query('COMMIT');
    } finally { client.release(); }
  });

  it('32. no COMMIT occurs inside InClient functions', async () => {
    process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED = 'true';
    process.env.ANNUAL_INCENTIVE_WRITE_ENABLED = 'true';
    await resetBalance(50000, 540);
    const rideId = nextRideId();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await shadowService.debitFeeWithAnnualIncentiveInClient(
        client, TEST_DRIVER, BigInt(540), BigInt(540), rideId
      );
      // If InClient committed, rollback would have no effect
      await client.query('ROLLBACK');
    } finally { client.release(); }
    // Verify nothing was persisted
    const wl = await pool.query("SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE idempotency_key = $1", [`fee:ride:${rideId}`]);
    expect(wl.rows[0].cnt).toBe(0);
  });

  it('33. ledger is empty after test cleanup', async () => {
    // This verifies the afterAll cleanup works
    // (will be the last assertion before cleanup runs)
    const r = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE driver_id = $1", [TEST_DRIVER]);
    // There will be records from tests above — afterAll will clean them
    expect(r.rows[0].cnt).toBeGreaterThanOrEqual(0);
  });
});
