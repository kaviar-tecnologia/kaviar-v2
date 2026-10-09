import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { WalletService } from '../../src/services/wallet-v2/wallet.service';
import { PromoWalletService } from '../../src/services/wallet-v2/promo-wallet.service';
import { DualWalletReservationService } from '../../src/services/wallet-v2/dual-wallet-reservation.service';

describe('KAVIAR Incentivos — ciclo real de redispatch', () => {
  it('reserva A, libera A e permite reservar B', async () => {
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

    const rideId = `ride-cycle-${randomUUID()}`;
    const driverA = `cycle-driver-a-${randomUUID()}`;
    const driverB = `cycle-driver-b-${randomUUID()}`;
    const offerA = `cycle-offer-a-${randomUUID()}`;
    const offerB = `cycle-offer-b-${randomUUID()}`;
    const drivers = [driverA, driverB];

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
        !['127.0.0.1', '127.0.0.1/32'].includes(actual.host) ||
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
               (id, name, email, phone, document_cpf,
                status, created_at, updated_at)
             VALUES
               ($1, 'Teste Incentivos', $2, '119999',
                '000', 'active', NOW(), NOW())`,
            [driverId, `${driverId}@test.local`]
          );

          await setup.query(
            `INSERT INTO driver_wallets
               (driver_id, balance_cents, reserved_cents, updated_at)
             VALUES ($1, 200, 0, NOW())`,
            [driverId]
          );

          await setup.query(
            `INSERT INTO driver_promo_wallets
               (driver_id, balance_cents, reserved_cents, updated_at)
             VALUES ($1, 300, 0, NOW())`,
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

      // Motorista A reserva a taxa da corrida.
      expect(
        await service.reserve(driverA, rideId, 500n, offerA)
      ).toEqual({
        promoReservedCents: 300n,
        cashReservedCents: 200n
      });

      // Motorista B não pode reservar enquanto A está ativo.
      await expect(
        service.reserve(driverB, rideId, 500n, offerB)
      ).rejects.toThrow('DUAL_WALLET_ACTIVE_OFFER_EXISTS');

      // Cancelamento: devolve ambas as reservas de A.
      expect(
        await service.release(driverA, rideId, offerA)
      ).toEqual({
        promoReservedCents: 300n,
        cashReservedCents: 200n
      });

      // Cancelamento repetido não devolve valores novamente.
      expect(
        await service.release(driverA, rideId, offerA)
      ).toEqual({
        promoReservedCents: 0n,
        cashReservedCents: 0n
      });

      // A reserva A encerrada não pode ser reutilizada.
      await expect(
        service.reserve(driverA, rideId, 500n, offerA)
      ).rejects.toThrow(
        'DUAL_WALLET_RESERVATION_ALREADY_FINALIZED'
      );

      // Agora o motorista B pode assumir a corrida.
      expect(
        await service.reserve(driverB, rideId, 500n, offerB)
      ).toEqual({
        promoReservedCents: 300n,
        cashReservedCents: 200n
      });

      const balances = await pool.query(
        `SELECT p.driver_id,
                p.reserved_cents AS promo_reserved,
                w.reserved_cents AS cash_reserved
         FROM driver_promo_wallets p
         JOIN driver_wallets w
           ON w.driver_id = p.driver_id
         WHERE p.driver_id = ANY($1::text[])`,
        [drivers]
      );

      expect(balances.rows).toHaveLength(2);

      for (const row of balances.rows) {
        const active = row.driver_id === driverB;

        expect(BigInt(row.promo_reserved)).toBe(
          active ? 300n : 0n
        );

        expect(BigInt(row.cash_reserved)).toBe(
          active ? 200n : 0n
        );
      }

      // Encerrar B para validar também sua liberação.
      expect(
        await service.release(driverB, rideId, offerB)
      ).toEqual({
        promoReservedCents: 300n,
        cashReservedCents: 200n
      });

      const final = await pool.query(
        `SELECT p.reserved_cents AS promo_reserved,
                w.reserved_cents AS cash_reserved
         FROM driver_promo_wallets p
         JOIN driver_wallets w
           ON w.driver_id = p.driver_id
         WHERE p.driver_id = ANY($1::text[])`,
        [drivers]
      );

      for (const row of final.rows) {
        expect(BigInt(row.promo_reserved)).toBe(0n);
        expect(BigInt(row.cash_reserved)).toBe(0n);
      }

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
              `DELETE FROM drivers
               WHERE id = ANY($1::text[])`,
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
