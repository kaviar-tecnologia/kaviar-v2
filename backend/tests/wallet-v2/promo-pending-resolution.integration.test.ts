import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { WalletService } from '../../src/services/wallet-v2/wallet.service';
import { FeeSplitService } from '../../src/services/wallet-v2/fee-split.service';
import { PendingDebitService } from '../../src/services/wallet-v2/pending-debit.service';
import { TerritoryLedgerService } from '../../src/services/wallet-v2/territory-ledger.service';
import { DirectPendingDebitExecutor } from '../../src/services/finance/annual-incentive-shadow.service';

describe('Quitação de pendência com subsídio promocional', () => {
  it('quita apenas R$ 2 e preserva os R$ 12 subsidiados', async () => {
    assertSafeFinanceDatabase();

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();
    const driverId = `promo-driver-${randomUUID()}`;
    const rideId = `promo-ride-${randomUUID()}`;

    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO drivers
          (id, name, email, phone, document_cpf, status, created_at, updated_at)
         VALUES
          ($1, 'Promo Test', $2, '119999', '000', 'active', NOW(), NOW())`,
        [driverId, `${driverId}@test.local`]
      );

      await client.query(
        `INSERT INTO driver_wallets
          (driver_id, balance_cents, reserved_cents, updated_at)
         VALUES ($1, 1000, 0, NOW())`,
        [driverId]
      );

      const split = new FeeSplitService(pool);
      await split.recordSplitInClient(client, {
        rideId,
        driverId,
        finalPriceCents: 10000n,
        territoryId: null,
        managerId: null,
        managerAssignmentId: null,
        recognizedAt: new Date(),
        referenceMonth: '2026-10',
        platformFeeRateBps: 1800,
        managerCommissionRateBps: 0,
        feeCollectedCents: 400n,
        feePendingCents: 200n,
        feeSubsidizedCents: 1200n,
        collectionStatus: 'partial',
      });

      const pending = new PendingDebitService(pool);
      await pending.createInClient(client, {
        rideId,
        driverId,
        finalPriceCents: 10000n,
        feeAmountCents: 1800n,
        feeCollectedCents: 400n,
        feeSubsidizedCents: 1200n,
        reservedCents: 0n,
      });

      await client.query('COMMIT');

      const wallet = new WalletService(pool);
      const executor = new DirectPendingDebitExecutor(wallet);
      const territory = new TerritoryLedgerService(pool);

      const first = await pending.resolveOnRecharge(
        driverId, executor, split, territory
      );
      expect(first).toBe(1);

      const second = await pending.resolveOnRecharge(
        driverId, executor, split, territory
      );
      expect(second).toBe(0);

      const { rows: [result] } = await pool.query(
        `SELECT fee_amount_cents, fee_subsidized_cents,
                fee_collected_cents, fee_pending_cents,
                collection_status
         FROM ride_fee_splits WHERE ride_id = $1`,
        [rideId]
      );

      expect(BigInt(result.fee_amount_cents)).toBe(1800n);
      expect(BigInt(result.fee_subsidized_cents)).toBe(1200n);
      expect(BigInt(result.fee_collected_cents)).toBe(600n);
      expect(BigInt(result.fee_pending_cents)).toBe(0n);
      expect(result.collection_status).toBe('collected');

      const { rows: [balance] } = await pool.query(
        'SELECT balance_cents FROM driver_wallets WHERE driver_id = $1',
        [driverId]
      );
      expect(BigInt(balance.balance_cents)).toBe(800n);

      const { rows: [debits] } = await pool.query(
        `SELECT COUNT(*)::int AS total
         FROM wallet_ledger
         WHERE driver_id = $1 AND entry_type = 'pending_resolve'`,
        [driverId]
      );
      expect(debits.total).toBe(1);
    } finally {
      // Reverte uma transação ainda aberta em caso de erro.
      try { await client.query('ROLLBACK'); } catch {}
      client.release();

      // Os dados já confirmados por COMMIT precisam de limpeza explícita.
      // Cada DELETE é limitado aos identificadores únicos deste teste.
      try {
        const cleanup = await pool.connect();
        try {
          await cleanup.query('BEGIN');

          await cleanup.query(
            'DELETE FROM wallet_ledger WHERE driver_id = $1',
            [driverId]
          );
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
            'DELETE FROM driver_wallets WHERE driver_id = $1',
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
      }
    }
  });
});
