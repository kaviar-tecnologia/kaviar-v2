import type { Pool, PoolClient } from 'pg';

/**
 * CARE-06B — a single checked-out PostgreSQL client for an eventual official
 * pricing write. This is a transaction primitive, NOT a CARE release gate,
 * pricing implementation or a second economic writer.
 *
 * Unlike separate pool.query('BEGIN') / pool.query('COMMIT') calls, every query
 * performed by `work` uses the exact same client. The caller still has to
 * lock and revalidate the ride, matching CAR_NORMAL quote/lock and evidence at
 * the decisive write boundary. Do not call this on public CARE paths while
 * CARE-04A remains blocked.
 */
export async function withCarePricingTransaction<T>(
  source: Pick<Pool, 'connect'>,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await source.connect();
  let phase: 'begin' | 'work' | 'commit' | 'done' = 'begin';
  let releaseAsBroken = false;

  try {
    await client.query('BEGIN');
    phase = 'work';
    const result = await work(client);
    phase = 'commit';
    await client.query('COMMIT');
    phase = 'done';
    return result;
  } catch (cause) {
    if (phase === 'commit') {
      // The server may have committed before its acknowledgement was lost.
      // A subsequent ROLLBACK cannot undo that committed transaction.
      // Never retry the economic operation automatically; reconcile by the
      // unique persisted ride ID on a new connection before any next action.
      releaseAsBroken = true;
      throw Object.assign(
        new Error('CARE_PRICING_COMMIT_OUTCOME_UNKNOWN'),
        { code: 'CARE_PRICING_COMMIT_OUTCOME_UNKNOWN', originalError: cause },
      );
    }

    if (phase === 'begin') {
      // BEGIN failed, so the connection state cannot be trusted.
      releaseAsBroken = true;
      throw cause;
    }

    if (phase === 'work') {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        releaseAsBroken = true;
        throw Object.assign(
          new Error('CARE_PRICING_TRANSACTION_ROLLBACK_FAILED'),
          { code: 'CARE_PRICING_TRANSACTION_ROLLBACK_FAILED', originalError: cause, rollbackError },
        );
      }
    }
    throw cause;
  } finally {
    client.release(releaseAsBroken);
  }
}
