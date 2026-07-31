/**
 * Protected test fixture cleanup for annual_incentive_ledger.
 *
 * Safely removes test data while:
 * - Asserting the database is local/test before ANY destructive operation
 * - Disabling/re-enabling the immutability trigger within a single transaction
 * - Verifying the trigger is re-enabled after cleanup
 *
 * NEVER call this in production. The assertSafeFinanceDatabase guard prevents it.
 */
import pg from 'pg';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';

/**
 * Cleans up test fixtures for a specific driver_id within a protected transaction.
 * The trigger is disabled and re-enabled within the SAME transaction.
 */
export async function cleanupTestFixtures(pool: pg.Pool, driverId: string): Promise<void> {
  // Guard: MUST be local/test database
  assertSafeFinanceDatabase();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE annual_incentive_ledger IN ACCESS EXCLUSIVE MODE');
    await client.query('ALTER TABLE annual_incentive_ledger DISABLE TRIGGER annual_incentive_ledger_immutable_trg');
    await client.query('DELETE FROM annual_incentive_ledger WHERE driver_id = $1', [driverId]);
    await client.query('ALTER TABLE annual_incentive_ledger ENABLE TRIGGER annual_incentive_ledger_immutable_trg');
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Clean other test tables (no trigger protection needed)
  await pool.query('DELETE FROM pending_debits WHERE driver_id = $1', [driverId]);
  await pool.query('DELETE FROM wallet_ledger WHERE driver_id = $1', [driverId]);
  await pool.query('DELETE FROM driver_wallets WHERE driver_id = $1', [driverId]);
  await pool.query('DELETE FROM drivers WHERE id = $1', [driverId]);
}

/**
 * Verifies the immutability trigger is enabled after cleanup.
 * Returns true if trigger is in 'O' (origin/enabled) state.
 */
export async function assertTriggerEnabled(pool: pg.Pool): Promise<void> {
  const r = await pool.query(
    "SELECT tgenabled FROM pg_trigger WHERE tgname = 'annual_incentive_ledger_immutable_trg'"
  );
  if (!r.rows[0] || r.rows[0].tgenabled !== 'O') {
    throw new Error('TRIGGER_NOT_ENABLED: annual_incentive_ledger_immutable_trg is not in enabled state');
  }
}
