import { pool } from '../db';

/**
 * Transactional, idempotent credit delta.
 * Extracted from admin-driver-credits route for reuse by system consumers
 * (ride completion, dispatch gate, etc).
 */
export async function applyCreditDelta(
  driverId: string,
  delta: number,
  reason: string,
  actorId: string,
  idempotencyKey?: string
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (idempotencyKey) {
      const existing = await client.query(
        'SELECT id, balance_after FROM driver_credit_ledger WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (existing.rows.length > 0) {
        await client.query('COMMIT');
        return { alreadyProcessed: true, balance: existing.rows[0].balance_after };
      }
    }

    // Ensure credit_balance row exists
    await client.query(
      `INSERT INTO credit_balance (driver_id, balance, updated_at)
       VALUES ($1, 0, CURRENT_TIMESTAMP)
       ON CONFLICT (driver_id) DO NOTHING`,
      [driverId]
    );

    // Apply delta atomically (prevent negative balance on deductions)
    const balanceResult = await client.query(
      `UPDATE credit_balance
       SET balance = CASE WHEN balance + $2 < 0 THEN 0 ELSE balance + $2 END, updated_at = CURRENT_TIMESTAMP
       WHERE driver_id = $1
       RETURNING balance`,
      [driverId, delta]
    );

    const newBalance = parseFloat(balanceResult.rows[0].balance);

    await client.query(
      `INSERT INTO driver_credit_ledger (driver_id, delta, balance_after, reason, admin_user_id, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [driverId, delta, newBalance, reason, actorId, idempotencyKey]
    );

    await client.query('COMMIT');

    return { alreadyProcessed: false, balance: newBalance };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get current credit balance for a driver. Returns 0 if no record.
 */
export async function getCreditBalance(driverId: string): Promise<number> {
  const result = await pool.query(
    'SELECT balance FROM credit_balance WHERE driver_id = $1',
    [driverId]
  );
  return result.rows.length > 0 ? parseFloat(result.rows[0].balance) : 0;
}
