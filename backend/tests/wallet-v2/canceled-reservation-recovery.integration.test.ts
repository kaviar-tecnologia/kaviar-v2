import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { findCanceledReservations } from
  '../../src/services/wallet-v2/canceled-reservation-recovery.service';

describe('Recuperação de reservas canceladas', () => {
  it('executa a identificação no PostgreSQL local sem alterar dados', async () => {
    assertSafeFinanceDatabase();

    const url = new URL(process.env.DATABASE_URL ?? '');

    if (
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/kaviar_incentivos_test' ||
      (url.port && url.port !== '5432')
    ) {
      throw new Error('TEST_DATABASE_NOT_ALLOWED');
    }

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    try {
      const candidates = await findCanceledReservations(pool, 20);

      expect(Array.isArray(candidates)).toBe(true);
      expect(candidates.length).toBeLessThanOrEqual(20);

      for (const candidate of candidates) {
        expect(candidate.ride_id).toBeTruthy();
        expect(candidate.driver_id).toBeTruthy();
        expect(candidate.offer_id).toBeTruthy();
      }

      // Não exibir informações pessoais ou financeiras.
      console.log(
        '[RECOVERY_READ_ONLY] candidates=' + candidates.length
      );
    } finally {
      await pool.end();
    }
  });

  it('identifica cancelamentos reais sem confundir corridas ativas', async () => {
    assertSafeFinanceDatabase();

    const url = new URL(process.env.DATABASE_URL ?? '');

    if (
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/kaviar_incentivos_test' ||
      (url.port && url.port !== '5432')
    ) {
      throw new Error('TEST_DATABASE_NOT_ALLOWED');
    }

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      await client.query(`
        CREATE TEMP TABLE rides_v2 (
          id text PRIMARY KEY,
          driver_id text,
          status text
        ) ON COMMIT DROP
      `);

      await client.query(`
        CREATE TEMP TABLE ride_offers (
          id text PRIMARY KEY,
          ride_id text,
          driver_id text,
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

      // P: passageiro cancelou.
      // D: motorista cancelou e houve redistribuição.
      // A: corrida ainda ativa.
      // X: reserva já liberada.
      // B: outro motorista concluiu.
      // L: cancelamento com reserva tradicional.
      await client.query(`
        INSERT INTO rides_v2 VALUES
          ('P', 'A', 'canceled_by_passenger'),
          ('D', NULL, 'requested'),
          ('A', 'A', 'accepted'),
          ('X', NULL, 'requested'),
          ('B', 'B', 'completed'),
          ('L', 'A', 'canceled_by_driver')
      `);

      await client.query(`
        INSERT INTO ride_offers VALUES
          ('offer-P', 'P', 'A', 'accepted'),
          ('offer-D', 'D', 'A', 'canceled'),
          ('offer-A', 'A', 'A', 'accepted'),
          ('offer-X', 'X', 'A', 'canceled'),
          ('offer-B', 'B', 'A', 'canceled'),
          ('offer-B2', 'B', 'B', 'accepted'),
          ('offer-L', 'L', 'A', 'accepted')
      `);

      await client.query(`
        INSERT INTO driver_promo_ledger VALUES
          ('promo_reserve:offer-P', 'A', 'P', 'ride', 'reserve'),
          ('promo_reserve:offer-D', 'A', 'D', 'ride', 'reserve'),
          ('promo_reserve:offer-A', 'A', 'A', 'ride', 'reserve'),
          ('promo_reserve:offer-X', 'A', 'X', 'ride', 'reserve'),
          ('promo_release:offer-X', 'A', 'X', 'ride', 'release'),
          ('promo_reserve:offer-B', 'A', 'B', 'ride', 'reserve')
      `);

      await client.query(`
        INSERT INTO wallet_ledger VALUES
          ('reserve:ride:offer-P', 'A', 'P', 'ride', 'reserve'),
          ('reserve:ride:offer-B', 'A', 'B', 'ride', 'reserve'),
          ('fee:ride:B', 'B', 'B', 'ride', 'fee_debit'),
          ('reserve:ride:L', 'A', 'L', 'ride', 'reserve')
      `);

      const candidates = await findCanceledReservations(
        client as unknown as Pool,
        20
      );

      const found = candidates.map(
        c => c.ride_id + ':' + c.driver_id + ':' + c.offer_id
      );

      expect(found).toEqual([
        'B:A:offer-B',
        'D:A:offer-D',
        'L:A:offer-L',
        'P:A:offer-P',
      ]);

      // Corrida ativa e reserva já liberada não aparecem.
      expect(found.some(v => v.startsWith('A:'))).toBe(false);
      expect(found.some(v => v.startsWith('X:'))).toBe(false);

      // Respeitar o tamanho máximo do lote.
      const limited = await findCanceledReservations(
        client as unknown as Pool,
        2
      );

      expect(limited).toHaveLength(2);

      console.log(
        '[RECOVERY_SCENARIOS] 6 cenarios verificados'
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
