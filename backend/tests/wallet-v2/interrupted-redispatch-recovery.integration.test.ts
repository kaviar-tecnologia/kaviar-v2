import { afterEach, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { resumeInterruptedRedispatches } from
  '../../src/services/wallet-v2/interrupted-redispatch-recovery.service';

const originalFlag =
  process.env.DRIVER_INTERRUPTED_REDISPATCH_RECOVERY_ENABLED;

afterEach(() => {
  if (originalFlag === undefined) {
    delete process.env.DRIVER_INTERRUPTED_REDISPATCH_RECOVERY_ENABLED;
  } else {
    process.env.DRIVER_INTERRUPTED_REDISPATCH_RECOVERY_ENABLED =
      originalFlag;
  }
});

describe('Recuperação da redistribuição interrompida', () => {
  it('permanece desligada por padrão', async () => {
    delete process.env.DRIVER_INTERRUPTED_REDISPATCH_RECOVERY_ENABLED;

    const pool = {
      query: () => {
        throw new Error('DATABASE_QUERY_NOT_ALLOWED');
      },
    } as unknown as Pool;

    const result = await resumeInterruptedRedispatches(
      pool,
      async () => {
        throw new Error('DISPATCH_NOT_ALLOWED');
      }
    );

    expect(result.disabled).toBe(true);
    expect(result.attempted).toBe(0);
  });

  it('recupera após falha sem redistribuir reservas bloqueadas', async () => {
    assertSafeFinanceDatabase();

    const url = new URL(process.env.DATABASE_URL ?? '');

    if (
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/kaviar_incentivos_test' ||
      (url.port && url.port !== '5432')
    ) {
      throw new Error('TEST_DATABASE_NOT_ALLOWED');
    }

    process.env.DRIVER_INTERRUPTED_REDISPATCH_RECOVERY_ENABLED = 'true';

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 3,
    });

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(`
        CREATE TEMP TABLE rides_v2 (
          id text PRIMARY KEY,
          status text,
          driver_id text,
          trip_details jsonb
        ) ON COMMIT DROP
      `);

      await client.query(`
        CREATE TEMP TABLE ride_offers (
          id text PRIMARY KEY,
          ride_id text,
          status text
        ) ON COMMIT DROP
      `);

      await client.query(`
        CREATE TEMP TABLE driver_promo_ledger (
          idempotency_key text,
          driver_id text,
          reference_id text,
          reference_type text,
          entry_type text
        ) ON COMMIT DROP
      `);

      await client.query(`
        CREATE TEMP TABLE wallet_ledger (
          idempotency_key text,
          driver_id text,
          reference_id text,
          reference_type text,
          entry_type text
        ) ON COMMIT DROP
      `);

      await client.query(`
        INSERT INTO rides_v2 VALUES
        ('READY', 'requested', NULL, '{"_redispatch_count":1}'),
        ('PROMO', 'requested', NULL, '{"_redispatch_count":1}'),
        ('CASH', 'requested', NULL, '{"_redispatch_count":1}'),
        ('ACTIVE', 'accepted', 'B', '{"_redispatch_count":1}'),
        ('PENDING', 'requested', NULL, '{"_redispatch_count":1}'),
        ('ZERO', 'requested', NULL, '{"_redispatch_count":0}')
      `);

      await client.query(`
        INSERT INTO ride_offers VALUES
        ('OR', 'READY', 'canceled'),
        ('OP', 'PROMO', 'canceled'),
        ('OC', 'CASH', 'canceled'),
        ('OA', 'ACTIVE', 'canceled'),
        ('ON1', 'PENDING', 'canceled'),
        ('ON2', 'PENDING', 'pending'),
        ('OZ', 'ZERO', 'canceled')
      `);

      await client.query(`
        INSERT INTO driver_promo_ledger VALUES
        ('promo_reserve:OP', 'A', 'PROMO', 'ride', 'reserve')
      `);

      await client.query(`
        INSERT INTO wallet_ledger VALUES
        ('reserve:ride:OR', 'A', 'READY', 'ride', 'reserve'),
        ('cancel_release:ride:OR', 'A', 'READY', 'ride', 'cancel_release'),
        ('reserve:ride:OC', 'A', 'CASH', 'ride', 'reserve')
      `);

      const testPool = client as unknown as Pool;
      const dispatched: string[] = [];

      // Primeira tentativa: simular erro no dispatcher.
      const first = await resumeInterruptedRedispatches(
        testPool,
        async rideId => {
          dispatched.push(rideId);
          throw new Error('SIMULATED_DISPATCH_FAILURE');
        }
      );

      expect(first.scanned).toBe(1);
      expect(first.errors).toBe(1);
      expect(first.attempted).toBe(0);
      expect(dispatched).toEqual(['READY']);

      // Segunda tentativa: simular despacho bem-sucedido.
      const second = await resumeInterruptedRedispatches(
        testPool,
        async rideId => {
          dispatched.push(rideId);

          await client.query(
            `UPDATE rides_v2
             SET status = 'offered'
             WHERE id = $1 AND status = 'requested'`,
            [rideId]
          );
        }
      );

      expect(second.errors).toBe(0);
      expect(second.attempted).toBe(1);
      expect(dispatched).toEqual(['READY', 'READY']);

      // Terceira tentativa: não repetir despacho.
      const third = await resumeInterruptedRedispatches(
        testPool,
        async rideId => {
          dispatched.push(rideId);
        }
      );

      expect(third.scanned).toBe(0);
      expect(third.attempted).toBe(0);
      expect(dispatched).toHaveLength(2);

      console.log(
        '[REDISPATCH_RECOVERY] ' +
        'falha, retomada e não duplicação verificadas'
      );
    } finally {
      try {
        await client.query('ROLLBACK');
      } finally {
        client.release();
        await pool.end();
      }
    }
  });
});
