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
  let inTransaction = false;
  let releaseAsBroken = false;

  try {
    await client.query('BEGIN');
    inTransaction = true;
    const result = await work(client);
    await client.query('COMMIT');
    inTransaction = false;
    return result;
  } catch (cause) {
    if (!inTransaction) {
      // A failed BEGIN can mean a broken connection. Do not recycle it.
      releaseAsBroken = true;
    }
    if (inTransaction) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        // Never put a client of unknown transaction state back in the pool.
        releaseAsBroken = true;
        throw Object.assign(
          new Error('CARE_PRICING_TRANSACTION_ROLLBACK_FAILED'),
          { originalError: cause, rollbackError },
        );
      }
    }
    throw cause;
  } finally {
    client.release(releaseAsBroken);
  }
}
