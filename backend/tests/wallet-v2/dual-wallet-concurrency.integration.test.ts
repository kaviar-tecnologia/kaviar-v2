import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { WalletService } from '../../src/services/wallet-v2/wallet.service';
import { PromoWalletService } from '../../src/services/wallet-v2/promo-wallet.service';
import { DualWalletReservationService } from '../../src/services/wallet-v2/dual-wallet-reservation.service';

describe('Carteira dupla — concorrencia PostgreSQL', () => {
  it('impede uso duplo do saldo e preserva idempotencia', async () => {
    const url = process.env.DATABASE_URL;

    if (!url) throw new Error('DATABASE_URL_AUSENTE');

    const db = new URL(url);

    if (
      db.hostname !== '127.0.0.1' ||
      db.pathname !== '/kaviar_incentivos_test' ||
      (db.port && db.port !== '5432')
    ) {
      throw new Error('BANCO_LOCAL_NAO_AUTORIZADO');
    }

    assertSafeFinanceDatabase();

    if (process.env.DRIVER_PERMANENT_WELCOME_ENABLED !== 'true') {
      throw new Error('PROMO_TEST_FLAG_REQUIRED');
    }

    const pool = new Pool({
      connectionString: url,
      max: 4,
      connectionTimeoutMillis: 5000
    });

    const driverId = `concurrent-${randomUUID()}`;
    const rideIds = [
      `ride-a-${randomUUID()}`,
      `ride-b-${randomUUID()}`
    ];

    let created = false;

    try {
      const identity = await pool.query(`
        SELECT current_database() AS banco,
               inet_server_addr()::text AS servidor,
               inet_server_port() AS porta
      `);

      const actual = identity.rows[0];

      if (
        actual.banco !== 'kaviar_incentivos_test' ||
        !actual.servidor?.startsWith('127.0.0.1') ||
        actual.porta !== 5432
      ) {
        throw new Error('IDENTIDADE_DO_BANCO_INVALIDA');
      }

      const setup = await pool.connect();

      try {
        await setup.query('BEGIN');

        await setup.query(
          `INSERT INTO drivers
           (id,name,email,phone,document_cpf,status,created_at,updated_at)
           VALUES ($1,'Teste Concorrencia',$2,'119999','000',
                   'active',NOW(),NOW())`,
          [driverId, `${driverId}@test.local`]
        );

        await setup.query(
          `INSERT INTO driver_wallets
           (driver_id,balance_cents,reserved_cents,updated_at)
           VALUES ($1,200,0,NOW())`,
          [driverId]
        );

        await setup.query(
          `INSERT INTO driver_promo_wallets
           (driver_id,balance_cents,reserved_cents,updated_at)
           VALUES ($1,300,0,NOW())`,
          [driverId]
        );

        await setup.query('COMMIT');
        created = true;
      } catch (error) {
        await setup.query('ROLLBACK');
        throw error;
      } finally {
        setup.release();
      }

      const service = new DualWalletReservationService(
        pool,
        new WalletService(pool),
        new PromoWalletService(pool)
      );

      // Duas corridas disputam simultaneamente R$ 5.
      const results = await Promise.allSettled(
        rideIds.map(rideId =>
          service.reserve(driverId, rideId, 500n)
        )
      );

      const successIndexes = results
        .map((result, index) =>
          result.status === 'fulfilled' ? index : -1
        )
        .filter(index => index >= 0);

      const failures = results.filter(
        result => result.status === 'rejected'
      );

      expect(successIndexes).toHaveLength(1);
      expect(failures).toHaveLength(1);

      const failed = failures[0];

      if (failed.status !== 'rejected') {
        throw new Error('FALHA_ESPERADA_NAO_ENCONTRADA');
      }

      expect(failed.reason.message).toContain(
        'INSUFFICIENT_BALANCE'
      );

      const winningRide = rideIds[successIndexes[0]];
      const winner = results[successIndexes[0]];

      if (winner.status !== 'fulfilled') {
        throw new Error('RESERVA_VENCEDORA_AUSENTE');
      }

      expect(winner.value).toEqual({
        promoReservedCents: 300n,
        cashReservedCents: 200n
      });

      // Duas repeticoes simultaneas da corrida vencedora.
      const retries = await Promise.all([
        service.reserve(driverId, winningRide, 500n),
        service.reserve(driverId, winningRide, 500n)
      ]);

      for (const result of retries) {
        expect(result).toEqual({
          promoReservedCents: 300n,
          cashReservedCents: 200n
        });
      }

      const wallets = await pool.query(
        `SELECT
           p.balance_cents AS promo_balance,
           p.reserved_cents AS promo_reserved,
           w.balance_cents AS cash_balance,
           w.reserved_cents AS cash_reserved
         FROM driver_promo_wallets p
         JOIN driver_wallets w
           ON w.driver_id = p.driver_id
         WHERE p.driver_id = $1`,
        [driverId]
      );

      expect(wallets.rows).toHaveLength(1);

      const balance = wallets.rows[0];

      expect(BigInt(balance.promo_balance)).toBe(300n);
      expect(BigInt(balance.promo_reserved)).toBe(300n);
      expect(BigInt(balance.cash_balance)).toBe(200n);
      expect(BigInt(balance.cash_reserved)).toBe(200n);

      const promoLedger = await pool.query(
        `SELECT idempotency_key
         FROM driver_promo_ledger
         WHERE driver_id = $1`,
        [driverId]
      );

      const cashLedger = await pool.query(
        `SELECT idempotency_key
         FROM wallet_ledger
         WHERE driver_id = $1`,
        [driverId]
      );

      expect(promoLedger.rows).toHaveLength(1);
      expect(cashLedger.rows).toHaveLength(1);

      expect(promoLedger.rows[0].idempotency_key).toBe(
        `promo_reserve:${winningRide}`
      );

      expect(cashLedger.rows[0].idempotency_key).toBe(
        `reserve:ride:${winningRide}`
      );

    } finally {
      try {
        if (created) {
          const cleanup = await pool.connect();

          try {
            await cleanup.query('BEGIN');

            await cleanup.query(
              'DELETE FROM driver_promo_ledger WHERE driver_id=$1',
              [driverId]
            );

            await cleanup.query(
              'DELETE FROM wallet_ledger WHERE driver_id=$1',
              [driverId]
            );

            await cleanup.query(
              'DELETE FROM driver_promo_wallets WHERE driver_id=$1',
              [driverId]
            );

            await cleanup.query(
              'DELETE FROM driver_wallets WHERE driver_id=$1',
              [driverId]
            );

            await cleanup.query(
              'DELETE FROM drivers WHERE id=$1',
              [driverId]
            );

            await cleanup.query('COMMIT');
          } catch (error) {
            await cleanup.query('ROLLBACK');
            throw error;
          } finally {
            cleanup.release();
          }
        }
      } finally {
        await pool.end();
      }
    }
  }, 15000);
});
