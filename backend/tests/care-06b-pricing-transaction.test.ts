import { describe, expect, it, vi } from 'vitest';
import { withCarePricingTransaction } from '../src/services/care/care-pricing-transaction';

const fakePool = (failOn: string[] = []) => {
  const queries: string[] = [];
  const client = {
    query: vi.fn(async (sql: string) => {
      queries.push(sql);
      if (failOn.includes(sql)) throw new Error('synthetic ' + sql);
      return { rows: [] };
    }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn(async () => client) };
  return { pool, client, queries };
};

describe('CARE-06B single-client pricing transaction primitive', () => {
  it('uses one checked-out client for BEGIN, all work, and COMMIT', async () => {
    const { pool, client, queries } = fakePool();
    const result = await withCarePricingTransaction(pool as never, async (tx) => {
      await tx.query('SELECT one');
      await tx.query('SELECT two');
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(queries).toEqual(['BEGIN', 'SELECT one', 'SELECT two', 'COMMIT']);
    expect(pool.connect).toHaveBeenCalledTimes(1);
    expect(client.release).toHaveBeenCalledOnce();
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it('rolls back a failed second write and returns the original failure', async () => {
    const { pool, client, queries } = fakePool(['SECOND WRITE']);
    await expect(withCarePricingTransaction(pool as never, async (tx) => {
      await tx.query('FIRST WRITE');
      await tx.query('SECOND WRITE');
    })).rejects.toThrow('synthetic SECOND WRITE');
    expect(queries).toEqual(['BEGIN', 'FIRST WRITE', 'SECOND WRITE', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it('rolls back when COMMIT fails rather than returning success', async () => {
    const { pool, client, queries } = fakePool(['COMMIT']);
    await expect(withCarePricingTransaction(pool as never, async (tx) => {
      await tx.query('FIRST WRITE');
    })).rejects.toThrow('synthetic COMMIT');
    expect(queries).toEqual(['BEGIN', 'FIRST WRITE', 'COMMIT', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledWith(false);
  });

  it('destroys the client when rollback itself fails', async () => {
    const { pool, client, queries } = fakePool(['FIRST WRITE', 'ROLLBACK']);
    const failure = withCarePricingTransaction(pool as never, async (tx) => {
      await tx.query('FIRST WRITE');
    });
    await expect(failure).rejects.toMatchObject({
      message: 'CARE_PRICING_TRANSACTION_ROLLBACK_FAILED',
      errors: [expect.any(Error), expect.any(Error)],
    });
    expect(queries).toEqual(['BEGIN', 'FIRST WRITE', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledWith(true);
  });

  it('releases the client if BEGIN fails without attempting a false ROLLBACK', async () => {
    const { pool, client, queries } = fakePool(['BEGIN']);
    await expect(withCarePricingTransaction(pool as never, async () => 'never'))
      .rejects.toThrow('synthetic BEGIN');
    expect(queries).toEqual(['BEGIN']);
    expect(client.release).toHaveBeenCalledWith(true);
  });

  it('never executes the callback when the connection cannot be acquired', async () => {
    const pool = { connect: vi.fn().mockRejectedValueOnce(new Error('pool unavailable')) };
    const work = vi.fn();
    await expect(withCarePricingTransaction(pool as never, work))
      .rejects.toThrow('pool unavailable');
    expect(work).not.toHaveBeenCalled();
  });
});
