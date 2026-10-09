import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { WalletService } from '../../src/services/wallet-v2/wallet.service';
import { PromoWalletService } from '../../src/services/wallet-v2/promo-wallet.service';
import { DualWalletReservationService } from '../../src/services/wallet-v2/dual-wallet-reservation.service';
import { WalletSettlementService } from '../../src/services/wallet-v2/wallet-settlement.service';
import { FeeSplitService } from '../../src/services/wallet-v2/fee-split.service';
import { TerritoryLedgerService } from '../../src/services/wallet-v2/territory-ledger.service';
import { PendingDebitService } from '../../src/services/wallet-v2/pending-debit.service';

describe('Liquidação real da carteira dupla no PostgreSQL local', () => {
  it.each([
    {
      name: 'taxa igual',
      price: 2500n, fee: 450n,
      promo: 300n, promoBalance: 0n,
      cash: 150n, cashBalance: 850n,
      debits: 1, releases: 0
    },
    {
      name: 'taxa menor',
      price: 1000n, fee: 180n,
      promo: 180n, promoBalance: 120n,
      cash: 0n, cashBalance: 1000n,
      debits: 0, releases: 1
    },
    {
      name: 'taxa maior',
      price: 3000n, fee: 540n,
      promo: 300n, promoBalance: 0n,
      cash: 240n, cashBalance: 760n,
      debits: 1, releases: 0
    }
  ])('$name', async (scenario) => {
    assertSafeFinanceDatabase();

    const url = new URL(process.env.DATABASE_URL ?? '');
    if (
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/kaviar_incentivos_test' ||
      (url.port && url.port !== '5432')
    ) {
      throw new Error('TEST_DATABASE_NOT_ALLOWED');
    }

    const previousFlag = process.env.DRIVER_PERMANENT_WELCOME_ENABLED;
    process.env.DRIVER_PERMANENT_WELCOME_ENABLED = 'true';

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    const suffix = randomUUID();
    const driverId = `promo-driver-${suffix}`;
    const rideId = `promo-ride-${suffix}`;
    const offerId = `promo-offer-${suffix}`;

    try {
      await pool.query(
        `INSERT INTO drivers
          (id, name, email, phone, document_cpf,
           status, created_at, updated_at)
         VALUES ($1, 'Teste carteira dupla', $2,
                 '119999', '000', 'active', NOW(), NOW())`,
        [driverId, `${driverId}@test.local`]
      );

      await pool.query(
        `INSERT INTO driver_wallets
          (driver_id, balance_cents, reserved_cents, updated_at)
         VALUES ($1, 1000, 0, NOW())`,
        [driverId]
      );

      // Saldo promocional de teste: R$ 3,00.
      // Não representa uma concessão oficial.
      await pool.query(
        `INSERT INTO driver_promo_wallets
          (driver_id, balance_cents, reserved_cents, updated_at)
         VALUES ($1, 300, 0, NOW())`,
        [driverId]
      );

      const wallet = new WalletService(pool);
      const promo = new PromoWalletService(pool);

      const dual = new DualWalletReservationService(
        pool, wallet, promo
      );

      const settlement = new WalletSettlementService(
        pool,
        wallet,
        new FeeSplitService(pool),
        new TerritoryLedgerService(pool),
        new PendingDebitService(pool),
        wallet,
        promo
      );

      // Taxa estimada da plataforma: R$ 4,50.
      const reservation = await dual.reserve(
        driverId, rideId, 450n, offerId
      );

      expect(reservation.promoReservedCents).toBe(300n);
      expect(reservation.cashReservedCents).toBe(150n);

      // Corrida de R$ 25,00: taxa de 18% = R$ 4,50.
      const result = await settlement.settleRide({
        rideId,
        driverId,
        finalPriceCents: scenario.price,
        feeBaseCents: scenario.price,
        reservedCents: 450n,
        promoOfferId: offerId,
      });

      expect(result.collected).toBe(true);

      // A mesma conclusão não pode descontar novamente.
      const repeated = await settlement.settleRide({
        rideId,
        driverId,
        finalPriceCents: scenario.price,
        feeBaseCents: scenario.price,
        reservedCents: 450n,
        promoOfferId: offerId,
      });

      expect(repeated.collected).toBe(true);

      const { rows: [promoBalance] } = await pool.query(
        `SELECT balance_cents, reserved_cents
         FROM driver_promo_wallets WHERE driver_id = $1`,
        [driverId]
      );

      expect(BigInt(promoBalance.balance_cents)).toBe(scenario.promoBalance);
      expect(BigInt(promoBalance.reserved_cents)).toBe(0n);

      const { rows: [cashBalance] } = await pool.query(
        `SELECT balance_cents, reserved_cents
         FROM driver_wallets WHERE driver_id = $1`,
        [driverId]
      );

      expect(BigInt(cashBalance.balance_cents)).toBe(scenario.cashBalance);
      expect(BigInt(cashBalance.reserved_cents)).toBe(0n);

      const { rows: [split] } = await pool.query(
        `SELECT fee_amount_cents, fee_subsidized_cents,
                fee_collected_cents, fee_pending_cents
         FROM ride_fee_splits WHERE ride_id = $1`,
        [rideId]
      );

      expect(BigInt(split.fee_amount_cents)).toBe(scenario.fee);
      expect(BigInt(split.fee_subsidized_cents)).toBe(scenario.promo);
      expect(BigInt(split.fee_collected_cents)).toBe(scenario.cash);
      expect(BigInt(split.fee_pending_cents)).toBe(0n);

      const { rows: [promoUsage] } = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM driver_promo_ledger
         WHERE idempotency_key = $1`,
        [`promo_consume:${offerId}`]
      );

      expect(promoUsage.total).toBe(1);

      const { rows: [cashDebit] } = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM wallet_ledger
         WHERE idempotency_key = $1`,
        [`fee:ride:${rideId}`]
      );

      expect(cashDebit.total).toBe(scenario.debits);

      const { rows: [cashRelease] } = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM wallet_ledger WHERE idempotency_key = $1`,
        [`cancel_release:ride:${offerId}`]
      );

      expect(cashRelease.total).toBe(scenario.releases);

    } finally {
      try {
        const cleanup = await pool.connect();

        try {
          await cleanup.query('BEGIN');

          await cleanup.query(
            'DELETE FROM territory_ledger WHERE reference_id = $1',
            [rideId]
          );
          await cleanup.query(
            'DELETE FROM pending_debits WHERE driver_id = $1',
            [driverId]
          );
          await cleanup.query(
            'DELETE FROM ride_fee_splits WHERE ride_id = $1',
            [rideId]
          );
          await cleanup.query(
            'DELETE FROM wallet_ledger WHERE driver_id = $1',
            [driverId]
          );
          await cleanup.query(
            'DELETE FROM driver_promo_ledger WHERE driver_id = $1',
            [driverId]
          );
          await cleanup.query(
            'DELETE FROM driver_wallets WHERE driver_id = $1',
            [driverId]
          );
          await cleanup.query(
            'DELETE FROM driver_promo_wallets WHERE driver_id = $1',
            [driverId]
          );
          await cleanup.query(
            'DELETE FROM drivers WHERE id = $1',
            [driverId]
          );

          await cleanup.query('COMMIT');
        } catch (error) {
          await cleanup.query('ROLLBACK');
          throw error;
        } finally {
          cleanup.release();
        }
      } finally {
        await pool.end();

        if (previousFlag === undefined) {
          delete process.env.DRIVER_PERMANENT_WELCOME_ENABLED;
        } else {
          process.env.DRIVER_PERMANENT_WELCOME_ENABLED = previousFlag;
        }
      }
    }
  });
});
