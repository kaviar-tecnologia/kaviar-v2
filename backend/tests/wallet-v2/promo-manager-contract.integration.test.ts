import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { WalletService } from '../../src/services/wallet-v2/wallet.service';
import { FeeSplitService } from '../../src/services/wallet-v2/fee-split.service';
import { PendingDebitService } from '../../src/services/wallet-v2/pending-debit.service';
import { TerritoryLedgerService } from '../../src/services/wallet-v2/territory-ledger.service';
import { DirectPendingDebitExecutor } from '../../src/services/finance/annual-incentive-shadow.service';
import { calculatePromoManagerRecognition } from '../../src/services/wallet-v2/promo-manager-recognition';

describe('Bônus de boas-vindas — comissão contratual do gestor', () => {
  it('reconhece R$ 1,80 sem duplicar comissão nem arrecadação', async () => {
    assertSafeFinanceDatabase();

    const pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });

    const suffix = randomUUID();
    const driverId = `promo-driver-${suffix}`;
    const rideId = `promo-ride-${suffix}`;
    const territoryId = `promo-ter-${suffix}`;
    const managerId = `promo-mgr-${suffix}`;
    const profileId = `promo-op-${suffix}`;

    try {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');

        await client.query(
          `INSERT INTO operational_territories
           (id, name, level, status, regulatory_status,
            created_at, updated_at)
           VALUES
           ($1, 'Território teste', 'neighborhood',
            'active', 'not_applicable', NOW(), NOW())`,
          [territoryId]
        );

        await client.query(
          `INSERT INTO admins
           (id, name, email, phone, password, role,
            is_active, created_at, updated_at)
           VALUES
           ($1, 'Gestor teste', $2, '11', 'test',
            'TERRITORIAL_MANAGER', true, NOW(), NOW())`,
          [managerId, `${managerId}@test.local`]
        );

        await client.query(
          `INSERT INTO operator_profiles
           (id, admin_id, territory_id, is_active, recipient_type,
            display_name, relationship_type, document_status,
            contract_status, terms_version, contract_url,
            pix_key, pix_key_type,
            responsibility_terms_accepted_at,
            confidentiality_terms_accepted_at,
            created_at, updated_at)
           VALUES
           ($1, $2, $3, true, 'individual', 'Gestor teste',
            'territorial_manager', 'verified', 'signed', 'v1.2',
            'contract-submissions/test.pdf', '11999999999', 'phone',
            NOW(), NOW(), NOW(), NOW())`,
          [profileId, managerId, territoryId]
        );

        const assignment = await client.query(
          `INSERT INTO territory_manager_assignments
           (territory_id, admin_id, operator_profile_id,
            status, started_at, created_by, updated_at)
           VALUES
           ($1, $2, $3, 'active',
            NOW() - INTERVAL '30 days', $2, NOW())
           RETURNING id`,
          [territoryId, managerId, profileId]
        );

        const assignmentId = assignment.rows[0].id;

        await client.query(
          `INSERT INTO drivers
           (id, name, email, phone, document_cpf,
            status, created_at, updated_at)
           VALUES
           ($1, 'Motorista teste', $2, '119999',
            '000', 'active', NOW(), NOW())`,
          [driverId, `${driverId}@test.local`]
        );

        await client.query(
          `INSERT INTO driver_wallets
           (driver_id, balance_cents, reserved_cents, updated_at)
           VALUES ($1, 1000, 0, NOW())`,
          [driverId]
        );

        const wallet = new WalletService(pool);
        const split = new FeeSplitService(pool);
        const pending = new PendingDebitService(pool);
        const territory = new TerritoryLedgerService(pool);

        // Taxa R$ 4,50:
        // R$ 3,00 subsidiados;
        // R$ 0,50 recebidos;
        // R$ 1,00 pendente.
        const initial = calculatePromoManagerRecognition(
          450n, 50n, 300n, 100n, 4000
        );

        expect(initial.managerShareCents).toBe(180n);
        expect(initial.managerRecognizedCents).toBe(140n);
        expect(initial.managerPendingCents).toBe(40n);

        // Registra somente os R$ 0,50 de débito financeiro.
        await wallet.debitFeeInClient(
          client, driverId, 50n, 0n, rideId
        );

        await split.recordSplitInClient(client, {
          rideId,
          driverId,
          finalPriceCents: 2500n,
          territoryId,
          managerId,
          managerAssignmentId: assignmentId,
          recognizedAt: new Date(),
          referenceMonth: '2026-10',
          platformFeeRateBps: 1800,
          managerCommissionRateBps: 4000,
          feeCollectedCents: 50n,
          feePendingCents: 100n,
          feeSubsidizedCents: 300n,
          collectionStatus: 'partial',
        });

        await pending.createInClient(client, {
          rideId,
          driverId,
          finalPriceCents: 2500n,
          feeAmountCents: 450n,
          feeCollectedCents: 50n,
          feeSubsidizedCents: 300n,
          reservedCents: 0n,
        });

        // Os R$ 3 subsidiados NÃO entram como arrecadação.
        // A comissão inicial permanece R$ 1,40.
        await territory.recordCollectedFeeInClient(
          client,
          territoryId,
          managerId,
          assignmentId,
          50n,
          initial.managerRecognizedCents,
          rideId,
          '2026-10'
        );

        await client.query('COMMIT');

        // A recuperação abre sua própria transação.
        const executor = new DirectPendingDebitExecutor(wallet);

        expect(
          await pending.resolveOnRecharge(
            driverId, executor, split, territory
          )
        ).toBe(1);

        // Reprocessamento não deve gerar nova cobrança.
        expect(
          await pending.resolveOnRecharge(
            driverId, executor, split, territory
          )
        ).toBe(0);

        const { rows: [finance] } = await pool.query(
          `SELECT fee_amount_cents, fee_subsidized_cents,
                  fee_collected_cents, fee_pending_cents,
                  collection_status
           FROM ride_fee_splits
           WHERE ride_id = $1`,
          [rideId]
        );

        expect(BigInt(finance.fee_amount_cents)).toBe(450n);
        expect(BigInt(finance.fee_subsidized_cents)).toBe(300n);
        expect(BigInt(finance.fee_collected_cents)).toBe(150n);
        expect(BigInt(finance.fee_pending_cents)).toBe(0n);
        expect(finance.collection_status).toBe('collected');

        const { rows: entries } = await pool.query(
          `SELECT entry_type,
                  COUNT(*)::int AS entries,
                  SUM(amount_cents) AS total
           FROM territory_ledger
           WHERE reference_id = $1
           GROUP BY entry_type`,
          [rideId]
        );

        const platform = entries.find(
          row => row.entry_type === 'platform_fee'
        );
        const manager = entries.find(
          row => row.entry_type === 'fee_share'
        );

        // Arrecadação real: R$ 1,50.
        expect(BigInt(platform.total)).toBe(150n);

        // Comissão contratual: R$ 1,80.
        expect(BigInt(manager.total)).toBe(180n);

        // Um lançamento inicial e um complementar.
        expect(platform.entries).toBe(2);
        expect(manager.entries).toBe(2);

        const { rows: [balance] } = await pool.query(
          `SELECT balance_cents
           FROM driver_wallets
           WHERE driver_id = $1`,
          [driverId]
        );

        // Saldo inicial R$ 10,00, menos R$ 1,50.
        expect(BigInt(balance.balance_cents)).toBe(850n);

        const { rows: [debits] } = await pool.query(
          `SELECT COUNT(*)::int AS total
           FROM wallet_ledger
           WHERE driver_id = $1
             AND entry_type = 'pending_resolve'`,
          [driverId]
        );

        expect(debits.total).toBe(1);

      } finally {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Transação pode já ter sido concluída.
        }
        client.release();
      }

    } finally {
      // Limpeza limitada aos identificadores únicos do teste.
      const cleanup = await pool.connect();

      try {
        await cleanup.query('BEGIN');

        const deletions: Array<[string, string]> = [
          ['wallet_ledger', 'driver_id'],
          ['territory_ledger', 'reference_id'],
          ['pending_debits', 'driver_id'],
          ['ride_fee_splits', 'ride_id'],
          ['territory_manager_assignments', 'territory_id'],
          ['operator_profiles', 'id'],
          ['admins', 'id'],
          ['operational_territories', 'id'],
          ['driver_wallets', 'driver_id'],
          ['drivers', 'id'],
        ];

        for (const [table, column] of deletions) {
          const id =
            table === 'territory_ledger' ||
            table === 'ride_fee_splits'
              ? rideId
              : table === 'territory_manager_assignments' ||
                table === 'operational_territories'
              ? territoryId
              : table === 'operator_profiles'
              ? profileId
              : table === 'admins'
              ? managerId
              : driverId;

          await cleanup.query(
            `DELETE FROM ${table} WHERE ${column} = $1`,
            [id]
          );
        }

        await cleanup.query('COMMIT');

      } catch (error) {
        await cleanup.query('ROLLBACK');
        throw error;

      } finally {
        cleanup.release();
        await pool.end();
      }
    }
  });
});
