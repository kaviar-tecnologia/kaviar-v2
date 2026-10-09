import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { TerritoryLedgerService } from '../../src/services/wallet-v2/territory-ledger.service';

describe('Comissão territorial sobre arrecadação subsidiada', () => {
  it('reconhece R$ 2,40 sobre R$ 6, sem comissão sobre bônus', async () => {
    assertSafeFinanceDatabase();

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();

    const suffix = randomUUID();
    const territoryId = `promo-ter-${suffix}`;
    const managerId = `promo-mgr-${suffix}`;
    const profileId = `promo-op-${suffix}`;
    const rideId = `promo-ride-${suffix}`;

    try {
      await client.query('BEGIN');

      // Todos os cadastros e lançamentos são revertidos ao final.
      await client.query(
        `INSERT INTO operational_territories
         (id, name, level, status, regulatory_status, created_at, updated_at)
         VALUES ($1, 'Território teste', 'neighborhood', 'active',
                 'not_applicable', NOW(), NOW())`,
        [territoryId]
      );

      await client.query(
        `INSERT INTO admins
         (id, name, email, phone, password, role, is_active,
          created_at, updated_at)
         VALUES ($1, 'Gestor teste', $2, '11', 'test',
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
          confidentiality_terms_accepted_at, created_at, updated_at)
         VALUES
         ($1, $2, $3, true, 'individual', 'Gestor teste',
          'territorial_manager', 'verified', 'signed', 'v1.2',
          'contract-submissions/test.pdf', '11999999999', 'phone',
          NOW(), NOW(), NOW(), NOW())`,
        [profileId, managerId, territoryId]
      );

      const assignment = await client.query(
        `INSERT INTO territory_manager_assignments
         (territory_id, admin_id, operator_profile_id, status,
          started_at, created_by, updated_at)
         VALUES ($1, $2, $3, 'active',
                 NOW() - INTERVAL '30 days', $2, NOW())
         RETURNING id`,
        [territoryId, managerId, profileId]
      );

      const assignmentId = assignment.rows[0].id;
      const ledger = new TerritoryLedgerService(pool);

      // Arrecadação inicial: R$ 4,00, comissão: R$ 1,60.
      await ledger.recordCollectedFeeInClient(
        client,
        territoryId,
        managerId,
        assignmentId,
        400n,
        160n,
        rideId,
        '2026-10'
      );

      // Recuperação: R$ 2,00, comissão adicional: R$ 0,80.
      await ledger.recordCollectedFeeInClient(
        client,
        territoryId,
        managerId,
        assignmentId,
        200n,
        80n,
        rideId,
        '2026-10',
        'resolve:promo-test'
      );

      // Repetição não pode gerar lançamentos adicionais.
      await ledger.recordCollectedFeeInClient(
        client,
        territoryId,
        managerId,
        assignmentId,
        200n,
        80n,
        rideId,
        '2026-10',
        'resolve:promo-test'
      );

      const { rows } = await client.query(
        `SELECT entry_type,
                COUNT(*)::int AS entries,
                SUM(amount_cents) AS total
         FROM territory_ledger
         WHERE reference_id = $1
         GROUP BY entry_type`,
        [rideId]
      );

      const platform = rows.find(r => r.entry_type === 'platform_fee');
      const manager = rows.find(r => r.entry_type === 'fee_share');

      expect(BigInt(platform.total)).toBe(600n);
      expect(BigInt(manager.total)).toBe(240n);
      expect(platform.entries).toBe(2);
      expect(manager.entries).toBe(2);

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
