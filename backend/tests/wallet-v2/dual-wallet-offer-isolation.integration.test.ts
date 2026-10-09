import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { WalletService } from '../../src/services/wallet-v2/wallet.service';
import { PromoWalletService } from '../../src/services/wallet-v2/promo-wallet.service';
import { DualWalletReservationService } from '../../src/services/wallet-v2/dual-wallet-reservation.service';

describe('Carteira dupla — isolamento entre ofertas PostgreSQL', () => {
  it('permite somente uma oferta ativa por corrida', async () => {
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
      max: 5,
      connectionTimeoutMillis: 5000
    });

    const rideId = `ride-isolation-${randomUUID()}`;

    const drivers = [
      `offer-driver-a-${randomUUID()}`,
      `offer-driver-b-${randomUUID()}`
    ];

    const offers = [
      `offer-a-${randomUUID()}`,
      `offer-b-${randomUUID()}`
    ];

    let created = false;

    try {
      const identity = await pool.query(`
        SELECT current_database() AS banco,
               inet_server_addr()::text AS host,
               inet_server_port() AS porta
      `);

      const actual = identity.rows[0];

      if (
        actual.banco !== 'kaviar_incentivos_test' ||
        !actual.host?.startsWith('127.0.0.1') ||
        actual.porta !== 5432
      ) {
        throw new Error('IDENTIDADE_BANCO_INVALIDA');
      }

      const setup = await pool.connect();

      try {
        await setup.query('BEGIN');

        for (const driverId of drivers) {
          await setup.query(
            `INSERT INTO drivers
             (id,name,email,phone,document_cpf,status,
              created_at,updated_at)
             VALUES ($1,'Teste Oferta',$2,'119999','000',
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
        }

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

      const results = await Promise.allSettled(
        drivers.map((driverId, index) =>
          service.reserve(driverId, rideId, 500n, offers[index])
        )
      );

      const winners = results
        .map((result, index) =>
          result.status === 'fulfilled' ? index : -1
        )
        .filter(index => index >= 0);

      expect(winners).toHaveLength(1);

      const winnerIndex = winners[0];
      const loserIndex = winnerIndex === 0 ? 1 : 0;

      expect(results[winnerIndex].status).toBe('fulfilled');
      expect(results[loserIndex].status).toBe('rejected');

      const loser = results[loserIndex];

      if (loser.status !== 'rejected') {
        throw new Error('BLOQUEIO_NAO_OCORREU');
      }

      expect(loser.reason.message).toBe(
        'DUAL_WALLET_ACTIVE_OFFER_EXISTS'
      );

      // Repetir a oferta vencedora nao pode duplicar reservas.
      const repeated = await service.reserve(
        drivers[winnerIndex],
        rideId,
        500n,
        offers[winnerIndex]
      );

      expect(repeated).toEqual({
        promoReservedCents: 300n,
        cashReservedCents: 200n
      });

      const balances = await pool.query(
        `SELECT p.driver_id,
                p.reserved_cents AS promo_reserved,
                w.reserved_cents AS cash_reserved
         FROM driver_promo_wallets p
         JOIN driver_wallets w ON w.driver_id=p.driver_id
         WHERE p.driver_id = ANY($1::text[])`,
        [drivers]
      );

      expect(balances.rows).toHaveLength(2);

      for (const row of balances.rows) {
        const isWinner = row.driver_id === drivers[winnerIndex];

        expect(BigInt(row.promo_reserved)).toBe(
          isWinner ? 300n : 0n
        );

        expect(BigInt(row.cash_reserved)).toBe(
          isWinner ? 200n : 0n
        );
      }

      const ledgers = await pool.query(
        `SELECT
          (SELECT COUNT(*)::int FROM driver_promo_ledger
           WHERE reference_id=$1) AS promo,
          (SELECT COUNT(*)::int FROM wallet_ledger
           WHERE reference_id=$1 AND entry_type='reserve') AS cash`,
        [rideId]
      );

      expect(ledgers.rows[0].promo).toBe(1);
      expect(ledgers.rows[0].cash).toBe(1);

    } finally {
      try {
        if (created) {
          const cleanup = await pool.connect();

          try {
            await cleanup.query('BEGIN');

            for (const table of [
              'driver_promo_ledger',
              'wallet_ledger',
              'driver_promo_wallets',
              'driver_wallets'
            ]) {
              await cleanup.query(
                `DELETE FROM ${table}
                 WHERE driver_id = ANY($1::text[])`,
                [drivers]
              );
            }

            await cleanup.query(
              'DELETE FROM drivers WHERE id = ANY($1::text[])',
              [drivers]
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
