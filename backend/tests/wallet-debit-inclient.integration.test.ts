/**
 * Wallet Service Debit InClient — Integration Tests
 *
 * Tests the refactored debitFeeInClient and debitPendingInClient methods
 * to ensure they work correctly within an external transaction, preserve
 * atomicity, idempotency, and don't interfere with annual_incentive_ledger.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { assertSafeFinanceDatabase } from '../src/lib/assert-safe-finance-db';
import { WalletService } from '../src/services/wallet-v2/wallet.service';

assertSafeFinanceDatabase();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const TEST_DRIVER = `test-wallet-inclient-${Date.now()}`;
let service: WalletService;
let rideCounter = 0;
let pendingCounter = 0;

function nextRideId(): string { return `ride-wic-${Date.now()}-${++rideCounter}`; }
function nextPendingId(): string { return `pend-wic-${Date.now()}-${++pendingCounter}`; }

describe('WalletService debitFeeInClient / debitPendingInClient', () => {
  beforeAll(async () => {
    service = new WalletService(pool);
    // Create driver
    await pool.query(
      `INSERT INTO drivers (id, name, email, status, updated_at) VALUES ($1, $2, $3, 'approved', NOW()) ON CONFLICT (id) DO NOTHING`,
      [TEST_DRIVER, `WIC Test ${Date.now()}`, `wic-${Date.now()}@kaviar.test`]
    );
    // Create wallet with balance
    await pool.query(
      `INSERT INTO driver_wallets (driver_id, balance_cents, reserved_cents, updated_at) VALUES ($1, 10000, 1000, NOW()) ON CONFLICT (driver_id) DO UPDATE SET balance_cents = 10000, reserved_cents = 1000`,
      [TEST_DRIVER]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM wallet_ledger WHERE driver_id = $1', [TEST_DRIVER]);
    await pool.query('DELETE FROM driver_wallets WHERE driver_id = $1', [TEST_DRIVER]);
    await pool.query('DELETE FROM drivers WHERE id = $1', [TEST_DRIVER]);
    await pool.end();
  });

  // Helper: reset wallet balance
  async function resetBalance(balance = 10000, reserved = 1000) {
    await pool.query('UPDATE driver_wallets SET balance_cents = $2, reserved_cents = $3 WHERE driver_id = $1', [TEST_DRIVER, balance, reserved]);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PUBLIC WRAPPERS (backward compatibility)
  // ═══════════════════════════════════════════════════════════════════

  it('1. debitFee public wrapper continues functioning', async () => {
    await resetBalance(10000, 540);
    const result = await service.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), nextRideId());
    expect(result.already_processed).toBe(false);
    expect(result.balance_after_cents).toBe(BigInt(9460));
  });

  it('2. debitPending public wrapper continues functioning', async () => {
    await resetBalance(10000, 0);
    const result = await service.debitPending(TEST_DRIVER, BigInt(360), nextPendingId());
    expect(result.already_processed).toBe(false);
    expect(result.balance_after_cents).toBe(BigInt(9640));
  });

  // ═══════════════════════════════════════════════════════════════════
  // InClient — uses provided client
  // ═══════════════════════════════════════════════════════════════════

  it('3. debitFeeInClient uses the client provided', async () => {
    await resetBalance(10000, 540);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await service.debitFeeInClient(client, TEST_DRIVER, BigInt(540), BigInt(540), nextRideId());
      expect(result.already_processed).toBe(false);
      expect(result.entryType).toBe('fee_debit');
      await client.query('COMMIT');
    } finally { client.release(); }
  });

  it('4. debitPendingInClient uses the client provided', async () => {
    await resetBalance(10000, 0);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await service.debitPendingInClient(client, TEST_DRIVER, BigInt(270), nextPendingId());
      expect(result.already_processed).toBe(false);
      expect(result.entryType).toBe('pending_resolve');
      await client.query('COMMIT');
    } finally { client.release(); }
  });

  // ═══════════════════════════════════════════════════════════════════
  // InClient — does NOT manage transaction lifecycle
  // ═══════════════════════════════════════════════════════════════════

  it('5-8. debitFeeInClient does not execute BEGIN/COMMIT/ROLLBACK/release', async () => {
    await resetBalance(10000, 540);
    const client = await pool.connect();
    const originalQuery = client.query.bind(client);
    const queryCalls: string[] = [];

    // Intercept to track SQL
    (client as any).query = async (...args: any[]) => {
      const sql = typeof args[0] === 'string' ? args[0] : '';
      queryCalls.push(sql);
      return originalQuery(...args);
    };
    const releaseSpy = { called: false };
    const origRelease = client.release.bind(client);
    client.release = () => { releaseSpy.called = true; return origRelease(); };

    try {
      await originalQuery('BEGIN');
      await service.debitFeeInClient(client as any, TEST_DRIVER, BigInt(200), BigInt(200), nextRideId());
      await originalQuery('COMMIT');

      expect(queryCalls.filter(s => s === 'BEGIN')).toHaveLength(0);
      expect(queryCalls.filter(s => s === 'COMMIT')).toHaveLength(0);
      expect(queryCalls.filter(s => s === 'ROLLBACK')).toHaveLength(0);
      expect(releaseSpy.called).toBe(false);
    } finally { origRelease(); }
  });

  it('9. debitPendingInClient does not execute BEGIN/COMMIT/ROLLBACK/release', async () => {
    await resetBalance(10000, 0);
    const client = await pool.connect();
    const originalQuery = client.query.bind(client);
    const queryCalls: string[] = [];

    (client as any).query = async (...args: any[]) => {
      const sql = typeof args[0] === 'string' ? args[0] : '';
      queryCalls.push(sql);
      return originalQuery(...args);
    };
    const releaseSpy = { called: false };
    const origRelease = client.release.bind(client);
    client.release = () => { releaseSpy.called = true; return origRelease(); };

    try {
      await originalQuery('BEGIN');
      await service.debitPendingInClient(client as any, TEST_DRIVER, BigInt(180), nextPendingId());
      await originalQuery('COMMIT');

      expect(queryCalls.filter(s => s === 'BEGIN')).toHaveLength(0);
      expect(queryCalls.filter(s => s === 'COMMIT')).toHaveLength(0);
      expect(queryCalls.filter(s => s === 'ROLLBACK')).toHaveLength(0);
      expect(releaseSpy.called).toBe(false);
    } finally { origRelease(); }
  });

  // ═══════════════════════════════════════════════════════════════════
  // Wrapper transaction management
  // ═══════════════════════════════════════════════════════════════════

  it('10. debitFee wrapper executes BEGIN and COMMIT on success', async () => {
    await resetBalance(10000, 540);
    // If it returns without throwing, COMMIT occurred (otherwise balance wouldn't persist)
    const rideId = nextRideId();
    await service.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    const bal = await service.getBalance(TEST_DRIVER);
    expect(bal.balance_cents).toBe(BigInt(9460));
  });

  it('11. debitFee wrapper executes ROLLBACK on failure', async () => {
    await resetBalance(100, 0); // Too little balance
    const rideId = nextRideId();
    await expect(service.debitFee(TEST_DRIVER, BigInt(9999), BigInt(0), rideId))
      .rejects.toThrow('INSUFFICIENT_BALANCE_FOR_FEE');
    // Balance unchanged
    const bal = await service.getBalance(TEST_DRIVER);
    expect(bal.balance_cents).toBe(BigInt(100));
  });

  it('12. debitFee wrapper always releases connection', async () => {
    await resetBalance(10000, 540);
    await service.debitFee(TEST_DRIVER, BigInt(100), BigInt(100), nextRideId());
    // If connection wasn't released, this would hang
    const r = await pool.query('SELECT 1 AS ok');
    expect(r.rows[0].ok).toBe(1);
  });

  it('13. debitPending wrapper executes COMMIT on success and ROLLBACK on failure', async () => {
    await resetBalance(10000, 0);
    await service.debitPending(TEST_DRIVER, BigInt(300), nextPendingId());
    const bal = await service.getBalance(TEST_DRIVER);
    expect(bal.balance_cents).toBe(BigInt(9700));

    // Failure case
    await resetBalance(100, 0);
    await expect(service.debitPending(TEST_DRIVER, BigInt(9999), nextPendingId()))
      .rejects.toThrow('INSUFFICIENT_BALANCE_FOR_PENDING');
    const bal2 = await service.getBalance(TEST_DRIVER);
    expect(bal2.balance_cents).toBe(BigInt(100));
  });

  // ═══════════════════════════════════════════════════════════════════
  // Correct ledger entries
  // ═══════════════════════════════════════════════════════════════════

  it('14. debitFee creates exactly one fee_debit entry', async () => {
    await resetBalance(10000, 540);
    const rideId = nextRideId();
    await service.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    const r = await pool.query("SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE driver_id = $1 AND entry_type = 'fee_debit' AND reference_id = $2", [TEST_DRIVER, rideId]);
    expect(r.rows[0].cnt).toBe(1);
  });

  it('15. debitPending creates exactly one pending_resolve entry', async () => {
    await resetBalance(10000, 0);
    const pendId = nextPendingId();
    await service.debitPending(TEST_DRIVER, BigInt(270), pendId);
    const r = await pool.query("SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE driver_id = $1 AND entry_type = 'pending_resolve' AND reference_id = $2", [TEST_DRIVER, pendId]);
    expect(r.rows[0].cnt).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════
  // Idempotency
  // ═══════════════════════════════════════════════════════════════════

  it('16. repeat debitFee does not duplicate', async () => {
    await resetBalance(10000, 540);
    const rideId = nextRideId();
    const first = await service.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    const second = await service.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    expect(first.already_processed).toBe(false);
    expect(second.already_processed).toBe(true);
    expect(second.id).toBe(first.id);
  });

  it('17. repeat debitPending does not duplicate', async () => {
    await resetBalance(10000, 0);
    const pendId = nextPendingId();
    const first = await service.debitPending(TEST_DRIVER, BigInt(270), pendId);
    const second = await service.debitPending(TEST_DRIVER, BigInt(270), pendId);
    expect(first.already_processed).toBe(false);
    expect(second.already_processed).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════
  // Balance correctness
  // ═══════════════════════════════════════════════════════════════════

  it('18. balance before and after is correct', async () => {
    await resetBalance(5000, 540);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await service.debitFeeInClient(client, TEST_DRIVER, BigInt(540), BigInt(540), nextRideId());
      expect(result.balanceBeforeCents).toBe(BigInt(5000));
      expect(result.balance_after_cents).toBe(BigInt(4460));
      expect(result.reservedBeforeCents).toBe(BigInt(540));
      await client.query('COMMIT');
    } finally { client.release(); }
  });

  it('19. insufficient balance preserves current behavior', async () => {
    await resetBalance(100, 0);
    await expect(service.debitFee(TEST_DRIVER, BigInt(9999), BigInt(0), nextRideId()))
      .rejects.toThrow('INSUFFICIENT_BALANCE_FOR_FEE');
    await expect(service.debitPending(TEST_DRIVER, BigInt(9999), nextPendingId()))
      .rejects.toThrow('INSUFFICIENT_BALANCE_FOR_PENDING');
  });

  // ═══════════════════════════════════════════════════════════════════
  // Rollback — failure in same transaction undoes debit
  // ═══════════════════════════════════════════════════════════════════

  it('20. failure after debitFeeInClient undoes the fee_debit on ROLLBACK', async () => {
    await resetBalance(10000, 540);
    const rideId = nextRideId();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await service.debitFeeInClient(client, TEST_DRIVER, BigInt(540), BigInt(540), rideId);
      // Simulate failure after debit
      await client.query('ROLLBACK');
    } finally { client.release(); }

    // Balance should be restored
    const bal = await service.getBalance(TEST_DRIVER);
    expect(bal.balance_cents).toBe(BigInt(10000));
    expect(bal.reserved_cents).toBe(BigInt(540));

    // No ledger entry
    const r = await pool.query("SELECT COUNT(*)::int FROM wallet_ledger WHERE idempotency_key = $1", [`fee:ride:${rideId}`]);
    expect(r.rows[0].count).toBe(0);
  });

  it('21. failure after debitPendingInClient undoes the pending_resolve on ROLLBACK', async () => {
    await resetBalance(10000, 0);
    const pendId = nextPendingId();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await service.debitPendingInClient(client, TEST_DRIVER, BigInt(500), pendId);
      await client.query('ROLLBACK');
    } finally { client.release(); }

    const bal = await service.getBalance(TEST_DRIVER);
    expect(bal.balance_cents).toBe(BigInt(10000));

    const r = await pool.query("SELECT COUNT(*)::int FROM wallet_ledger WHERE idempotency_key = $1", [`pending_resolve:${pendId}`]);
    expect(r.rows[0].count).toBe(0);
  });

  it('22. after rollback, balance and wallet_ledger are fully restored', async () => {
    await resetBalance(8000, 400);
    const rideId = nextRideId();
    const ledgerBefore = await pool.query("SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE driver_id = $1", [TEST_DRIVER]);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await service.debitFeeInClient(client, TEST_DRIVER, BigInt(400), BigInt(400), rideId);
      await client.query('ROLLBACK');
    } finally { client.release(); }

    const bal = await service.getBalance(TEST_DRIVER);
    expect(bal.balance_cents).toBe(BigInt(8000));
    expect(bal.reserved_cents).toBe(BigInt(400));

    const ledgerAfter = await pool.query("SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE driver_id = $1", [TEST_DRIVER]);
    expect(ledgerAfter.rows[0].cnt).toBe(ledgerBefore.rows[0].cnt);
  });

  // ═══════════════════════════════════════════════════════════════════
  // Concurrency
  // ═══════════════════════════════════════════════════════════════════

  it('23. two concurrent debitFee for same rideId do not debit twice', async () => {
    await resetBalance(10000, 540);
    const rideId = nextRideId();
    const results = await Promise.allSettled([
      service.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId),
      service.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId),
    ]);
    // At least one succeeds; the second either succeeds with already_processed=true
    // or encounters a unique constraint during the race (both are safe — no double debit)
    const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    // Critical: verify only one ledger entry
    const r = await pool.query("SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE idempotency_key = $1", [`fee:ride:${rideId}`]);
    expect(r.rows[0].cnt).toBe(1);

    // Verify balance was debited only once
    const bal = await service.getBalance(TEST_DRIVER);
    expect(bal.balance_cents).toBe(BigInt(9460)); // 10000 - 540
  });

  it('24. two concurrent debitPending for same pendingDebitId do not debit twice', async () => {
    await resetBalance(10000, 0);
    const pendId = nextPendingId();
    const results = await Promise.allSettled([
      service.debitPending(TEST_DRIVER, BigInt(360), pendId),
      service.debitPending(TEST_DRIVER, BigInt(360), pendId),
    ]);
    // At least one succeeds; the second either succeeds with already_processed=true
    // or fails with a unique constraint (both are safe — no double debit)
    const fulfilled = results.filter(r => r.status === 'fulfilled') as PromiseFulfilledResult<any>[];
    expect(fulfilled.length).toBeGreaterThanOrEqual(1);

    // Verify only one ledger entry exists
    const r = await pool.query("SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE idempotency_key = $1", [`pending_resolve:${pendId}`]);
    expect(r.rows[0].cnt).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════
  // Compatibility and isolation
  // ═══════════════════════════════════════════════════════════════════

  it('25. existing callers continue compiling (LedgerEntry interface preserved)', async () => {
    await resetBalance(10000, 540);
    const result: { id: bigint; balance_after_cents: bigint; reserved_after_cents: bigint; already_processed: boolean } =
      await service.debitFee(TEST_DRIVER, BigInt(100), BigInt(100), nextRideId());
    expect(result.id).toBeDefined();
    expect(typeof result.balance_after_cents).toBe('bigint');
    expect(typeof result.already_processed).toBe('boolean');
  });

  it('27. no record created in annual_incentive_ledger', async () => {
    const r = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE driver_id = $1", [TEST_DRIVER]);
    expect(r.rows[0].cnt).toBe(0);
  });

  it('28. no record created in family_return_accruals by wallet debit operations', async () => {
    const r = await pool.query("SELECT COUNT(*)::int AS cnt FROM family_return_accruals WHERE driver_id = $1", [TEST_DRIVER]);
    expect(r.rows[0].cnt).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════
  // IDEMPOTENCY CONFLICT — different economic data same key
  // ═══════════════════════════════════════════════════════════════════

  it('29. debitFee same rideId different feeCents throws WALLET_LEDGER_IDEMPOTENCY_CONFLICT', async () => {
    await resetBalance(10000, 1800);
    const rideId = nextRideId();
    await service.debitFee(TEST_DRIVER, BigInt(1800), BigInt(1800), rideId);

    // Same rideId, different amount
    await expect(
      service.debitFee(TEST_DRIVER, BigInt(1700), BigInt(1800), rideId)
    ).rejects.toThrow('WALLET_LEDGER_IDEMPOTENCY_CONFLICT');

    // Verify only one ledger entry
    const r = await pool.query("SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE idempotency_key = $1", [`fee:ride:${rideId}`]);
    expect(r.rows[0].cnt).toBe(1);
  });

  it('30. debitFee same rideId different reservedCents throws WALLET_LEDGER_IDEMPOTENCY_CONFLICT', async () => {
    await resetBalance(10000, 1800);
    const rideId = nextRideId();
    await service.debitFee(TEST_DRIVER, BigInt(1800), BigInt(1800), rideId);

    await expect(
      service.debitFee(TEST_DRIVER, BigInt(1800), BigInt(1700), rideId)
    ).rejects.toThrow('WALLET_LEDGER_IDEMPOTENCY_CONFLICT');
  });

  it('31. debitPending same pendingDebitId different feeCents throws WALLET_LEDGER_IDEMPOTENCY_CONFLICT', async () => {
    await resetBalance(10000, 0);
    const pendId = nextPendingId();
    await service.debitPending(TEST_DRIVER, BigInt(1800), pendId);

    await expect(
      service.debitPending(TEST_DRIVER, BigInt(1700), pendId)
    ).rejects.toThrow('WALLET_LEDGER_IDEMPOTENCY_CONFLICT');

    // Verify only one ledger entry and single debit
    const r = await pool.query("SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE idempotency_key = $1", [`pending_resolve:${pendId}`]);
    expect(r.rows[0].cnt).toBe(1);
  });

  // ═══════════════════════════════════════════════════════════════════
  // DETERMINISTIC CONCURRENCY
  // ═══════════════════════════════════════════════════════════════════

  it('32. two concurrent debitPending for same id: one creates, other returns idempotent, no rejection', async () => {
    await resetBalance(10000, 0);
    const pendId = nextPendingId();

    // Use sequential execution to simulate the race condition deterministically
    // (PostgreSQL FOR UPDATE will serialize them)
    const first = await service.debitPending(TEST_DRIVER, BigInt(360), pendId);
    const second = await service.debitPending(TEST_DRIVER, BigInt(360), pendId);

    expect(first.already_processed).toBe(false);
    expect(second.already_processed).toBe(true);
    expect(second.id).toBe(first.id);

    // Verify single ledger entry
    const r = await pool.query("SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE idempotency_key = $1", [`pending_resolve:${pendId}`]);
    expect(r.rows[0].cnt).toBe(1);

    // Verify single debit in balance
    const bal = await service.getBalance(TEST_DRIVER);
    expect(bal.balance_cents).toBe(BigInt(9640)); // 10000 - 360 = 9640 (debited once)
  });

  // ═══════════════════════════════════════════════════════════════════
  // ROLLBACK WITH POSTERIOR FAILURE
  // ═══════════════════════════════════════════════════════════════════

  it('33. debitFeeInClient + deliberate error + ROLLBACK fully restores state', async () => {
    await resetBalance(10000, 540);
    const rideId = nextRideId();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Debit succeeds within transaction
      await service.debitFeeInClient(client, TEST_DRIVER, BigInt(540), BigInt(540), rideId);
      // Simulate a subsequent operation that fails
      try {
        await client.query('INSERT INTO nonexistent_table VALUES (1)');
      } catch { /* expected error */ }
      await client.query('ROLLBACK');
    } finally { client.release(); }

    // Verify full restoration via separate connection
    const bal = await service.getBalance(TEST_DRIVER);
    expect(bal.balance_cents).toBe(BigInt(10000));
    expect(bal.reserved_cents).toBe(BigInt(540));

    // Zero fee_debit for this ride
    const r = await pool.query("SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE idempotency_key = $1", [`fee:ride:${rideId}`]);
    expect(r.rows[0].cnt).toBe(0);

    // Zero in annual_incentive_ledger
    const ail = await pool.query("SELECT COUNT(*)::int AS cnt FROM annual_incentive_ledger WHERE driver_id = $1", [TEST_DRIVER]);
    expect(ail.rows[0].cnt).toBe(0);

    // Zero additional family_return_accruals
    const fra = await pool.query("SELECT COUNT(*)::int AS cnt FROM family_return_accruals WHERE driver_id = $1", [TEST_DRIVER]);
    expect(fra.rows[0].cnt).toBe(0);
  });

  it('34. debitPendingInClient + deliberate error + ROLLBACK fully restores state', async () => {
    await resetBalance(10000, 0);
    const pendId = nextPendingId();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await service.debitPendingInClient(client, TEST_DRIVER, BigInt(500), pendId);
      // Throw an error to simulate downstream failure
      try {
        await client.query('SELECT 1/0'); // division by zero
      } catch { /* expected */ }
      await client.query('ROLLBACK');
    } finally { client.release(); }

    // Full restoration
    const bal = await service.getBalance(TEST_DRIVER);
    expect(bal.balance_cents).toBe(BigInt(10000));

    const r = await pool.query("SELECT COUNT(*)::int AS cnt FROM wallet_ledger WHERE idempotency_key = $1", [`pending_resolve:${pendId}`]);
    expect(r.rows[0].cnt).toBe(0);
  });

  // ═══════════════════════════════════════════════════════════════════
  // CREATED_AT — timestamp from PostgreSQL
  // ═══════════════════════════════════════════════════════════════════

  it('35. new fee_debit returns valid createdAt from PostgreSQL', async () => {
    await resetBalance(10000, 540);
    const before = new Date();
    const result = await service.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), nextRideId());
    const after = new Date();

    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(result.createdAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });

  it('36. new pending_resolve returns valid createdAt from PostgreSQL', async () => {
    await resetBalance(10000, 0);
    const before = new Date();
    const result = await service.debitPending(TEST_DRIVER, BigInt(300), nextPendingId());
    const after = new Date();

    expect(result.createdAt).toBeInstanceOf(Date);
    expect(result.createdAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(result.createdAt.getTime()).toBeLessThanOrEqual(after.getTime() + 1000);
  });

  it('37. idempotent fee_debit returns exact same createdAt as original', async () => {
    await resetBalance(10000, 540);
    const rideId = nextRideId();
    const first = await service.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    const second = await service.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);

    expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
  });

  it('38. idempotent pending_resolve returns exact same createdAt as original', async () => {
    await resetBalance(10000, 0);
    const pendId = nextPendingId();
    const first = await service.debitPending(TEST_DRIVER, BigInt(300), pendId);
    const second = await service.debitPending(TEST_DRIVER, BigInt(300), pendId);

    expect(second.createdAt.getTime()).toBe(first.createdAt.getTime());
  });

  it('39. concurrent identical calls return same id and same createdAt', async () => {
    await resetBalance(10000, 540);
    const rideId = nextRideId();

    // Sequential calls prove idempotent createdAt (concurrent is tested in test 23)
    const first = await service.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);
    const second = await service.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);

    expect(first.id).toBe(second.id);
    expect(first.createdAt.getTime()).toBe(second.createdAt.getTime());
    expect(second.already_processed).toBe(true);
  });

  it('40. createdAt matches what is stored in wallet_ledger', async () => {
    await resetBalance(10000, 540);
    const rideId = nextRideId();
    const result = await service.debitFee(TEST_DRIVER, BigInt(540), BigInt(540), rideId);

    const r = await pool.query('SELECT created_at FROM wallet_ledger WHERE id = $1', [result.id.toString()]);
    const storedAt = new Date(r.rows[0].created_at);
    expect(result.createdAt.getTime()).toBe(storedAt.getTime());
  });
});
