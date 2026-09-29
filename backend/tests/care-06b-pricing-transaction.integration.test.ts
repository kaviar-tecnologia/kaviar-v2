import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withCarePricingTransaction } from '../src/services/care/care-pricing-transaction';

// Explicitly limited to the isolated CI PostgreSQL instance. This test NEVER
// creates an object in production or in an arbitrary developer database.
const disposable = (() => {
  try {
    if (process.env.CARE_PRICING_ATOMIC_INTEGRATION !== '1' ||
        process.env.GITHUB_ACTIONS !== 'true') return false;
    const uri = new URL(process.env.DATABASE_URL || '');
    return ['postgres:', 'postgresql:'].includes(uri.protocol) &&
      ['127.0.0.1', 'localhost'].includes(uri.hostname) &&
      uri.port === '5432' && uri.username === 'ci' &&
      uri.pathname === '/care06b_disposable';
  } catch {
    return false;
  }
})();

describe.skipIf(!disposable)('CARE-06B — real single-client PostgreSQL transactions', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    const identity = await pool.query(
      'SELECT current_database() AS db, current_user AS role',
    );
    expect(identity.rows[0]).toMatchObject({ db: 'care06b_disposable', role: 'ci' });
    await pool.query(`
      CREATE TABLE care06b_tx_probe (
        id TEXT PRIMARY KEY,
        first_value INT NOT NULL DEFAULT 0,
        second_value INT NOT NULL DEFAULT 0
      )`);
  });

  afterAll(async () => {
    if (!pool) return;
    // The entire database is ephemeral; do not leave the synthetic test table.
    await pool.query('DROP TABLE IF EXISTS care06b_tx_probe');
    await pool.end();
  });

  const newProbe = async () => {
    const id = randomUUID();
    await pool.query('INSERT INTO care06b_tx_probe (id) VALUES ($1)', [id]);
    return id;
  };

  it('keeps BEGIN, both writes and COMMIT on the same PostgreSQL backend', async () => {
    const id = await newProbe();
    const result = await withCarePricingTransaction(pool, async (tx) => {
      const before = await tx.query<{ pid: number }>('SELECT pg_backend_pid()::int AS pid');
      await tx.query('UPDATE care06b_tx_probe SET first_value = 1 WHERE id = $1', [id]);
      await tx.query('UPDATE care06b_tx_probe SET second_value = 2 WHERE id = $1', [id]);
      const after = await tx.query<{ pid: number }>('SELECT pg_backend_pid()::int AS pid');
      return { before: before.rows[0].pid, after: after.rows[0].pid };
    });
    expect(result.before).toBe(result.after);
    const rows = await pool.query('SELECT * FROM care06b_tx_probe WHERE id = $1', [id]);
    expect(rows.rows[0]).toMatchObject({ first_value: 1, second_value: 2 });
  });

  it('rolls back the first economic-style write when a second statement fails', async () => {
    const id = await newProbe();
    await expect(withCarePricingTransaction(pool, async (tx) => {
      await tx.query('UPDATE care06b_tx_probe SET first_value = 5 WHERE id = $1', [id]);
      await tx.query('UPDATE care06b_tx_probe SET second_value = 7 WHERE id = $1', [id]);
      await tx.query('INSERT INTO care06b_tx_probe (id) VALUES ($1)', [id]); // PK conflict
    })).rejects.toMatchObject({ code: '23505' });
    const rows = await pool.query('SELECT * FROM care06b_tx_probe WHERE id = $1', [id]);
    expect(rows.rows[0]).toMatchObject({ first_value: 0, second_value: 0 });
  });

  it('detects an acknowledged-commit loss even when PostgreSQL has already committed', async () => {
    const id = await newProbe();
    let releaseBroken = false;
    // Simulate the wire failure AFTER PostgreSQL has committed, not a failure
    // before execution. A blind retry would apply the economic write twice.
    const ackLostSource = {
      connect: async () => {
        const real = await pool.connect();
        const query = real.query.bind(real);
        return {
          query: async (sql: string, values?: unknown[]) => {
            const result = values
              ? await query(sql, values as any[])
              : await query(sql);
            if (sql === 'COMMIT') throw new Error('synthetic ACK_LOST_AFTER_COMMIT');
            return result;
          },
          release: (broken?: boolean) => {
            releaseBroken = broken === true;
            real.release(broken);
          },
        } as unknown as pg.PoolClient;
      },
    };

    await expect(withCarePricingTransaction(ackLostSource as never, async (tx) => {
      await tx.query(
        'UPDATE care06b_tx_probe SET first_value = first_value + 1 WHERE id = $1',
        [id],
      );
    })).rejects.toMatchObject({ code: 'CARE_PRICING_COMMIT_OUTCOME_UNKNOWN' });
    expect(releaseBroken).toBe(true);
    // The proper response is a separate read/reconciliation, not a second write.
    const recorded = await pool.query(
      'SELECT first_value FROM care06b_tx_probe WHERE id = $1', [id],
    );
    expect(recorded.rows[0].first_value).toBe(1);
  });

  it('prevents a competing write from crossing a FOR UPDATE lock', async () => {
    const id = await newProbe();
    let releaseFirst!: () => void;
    let firstLocked!: () => void;
    const holdFirst = new Promise<void>(resolve => { releaseFirst = resolve; });
    const acquired = new Promise<void>(resolve => { firstLocked = resolve; });

    const first = withCarePricingTransaction(pool, async (tx) => {
      await tx.query('SELECT id FROM care06b_tx_probe WHERE id = $1 FOR UPDATE', [id]);
      firstLocked();
      await holdFirst;
      await tx.query('UPDATE care06b_tx_probe SET first_value = 1 WHERE id = $1', [id]);
    });

    await acquired;
    try {
      await expect(withCarePricingTransaction(pool, async (tx) => {
        await tx.query("SET LOCAL lock_timeout = '250ms'");
        await tx.query('SELECT id FROM care06b_tx_probe WHERE id = $1 FOR UPDATE', [id]);
        await tx.query('UPDATE care06b_tx_probe SET second_value = 2 WHERE id = $1', [id]);
      })).rejects.toMatchObject({ code: '55P03' });
    } finally {
      releaseFirst();
      await first;
    }

    const rows = await pool.query('SELECT * FROM care06b_tx_probe WHERE id = $1', [id]);
    expect(rows.rows[0]).toMatchObject({ first_value: 1, second_value: 0 });
  });
});
