import { describe, expect, it, vi } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { WalletService } from '../../src/services/wallet-v2/wallet.service';
import { PromoWalletService } from '../../src/services/wallet-v2/promo-wallet.service';
import { DualWalletReservationService } from '../../src/services/wallet-v2/dual-wallet-reservation.service';

describe('Carteira dupla — atomicidade PostgreSQL', () => {
  it('desfaz a reserva promocional quando a financeira falha', async () => {
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
      connectionTimeoutMillis: 5000,
      max: 4
    });

    const driverId = `atomic-${randomUUID()}`;
    const rideId = `ride-${randomUUID()}`;
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
           VALUES ($1,'Teste Atomicidade',$2,'119999','000','active',NOW(),NOW())`,
          [driverId, `${driverId}@test.local`]
        );

        await setup.query(
          `INSERT INTO driver_wallets
           (driver_id,balance_cents,reserved_cents,updated_at)
           VALUES ($1,100,0,NOW())`,
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

      const wallet = new WalletService(pool);
      const promo = new PromoWalletService(pool);

      const promoSpy = vi.spyOn(promo, 'reserveInClient');
      const walletSpy = vi.spyOn(wallet, 'reserveInClient');

      const service = new DualWalletReservationService(
        pool, wallet, promo
      );

      await expect(
        service.reserve(driverId, rideId, 500n)
      ).rejects.toThrow('INSUFFICIENT_BALANCE');

      expect(promoSpy).toHaveBeenCalledOnce();
      await expect(
        promoSpy.mock.results[0].value
      ).resolves.toBe(300n);

      expect(walletSpy).toHaveBeenCalledOnce();

      const balances = await pool.query(
        `SELECT
           p.balance_cents AS promo_balance,
           p.reserved_cents AS promo_reserved,
           w.balance_cents AS cash_balance,
           w.reserved_cents AS cash_reserved
         FROM driver_promo_wallets p
         JOIN driver_wallets w ON w.driver_id=p.driver_id
         WHERE p.driver_id=$1`,
        [driverId]
      );

      expect(balances.rows).toHaveLength(1);

      const b = balances.rows[0];

      expect(BigInt(b.promo_balance)).toBe(300n);
      expect(BigInt(b.promo_reserved)).toBe(0n);
      expect(BigInt(b.cash_balance)).toBe(100n);
      expect(BigInt(b.cash_reserved)).toBe(0n);

      const ledgers = await pool.query(
        `SELECT
          (SELECT COUNT(*)::int
           FROM driver_promo_ledger
           WHERE driver_id=$1) AS promo,
          (SELECT COUNT(*)::int
           FROM wallet_ledger
           WHERE driver_id=$1) AS cash`,
        [driverId]
      );

      expect(ledgers.rows[0].promo).toBe(0);
      expect(ledgers.rows[0].cash).toBe(0);

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
