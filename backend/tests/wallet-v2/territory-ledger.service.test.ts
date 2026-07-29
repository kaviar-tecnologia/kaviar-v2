/**
 * TerritoryLedgerService Tests (Marco 3.2A - Commit 5)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { TerritoryLedgerService } from '../../src/services/wallet-v2/territory-ledger.service';

let pool: pg.Pool;
const RUN = randomUUID().slice(0, 8);

beforeAll(async () => {
  assertSafeFinanceDatabase();
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
});
afterAll(async () => { await pool.end(); });

describe('TerritoryLedgerService', () => {
  it('recordCollectedFeeInClient inserts platform_fee and fee_share', async () => {
    const svc = new TerritoryLedgerService(pool);
    const client = await pool.connect();
    const rideId = `ride-ledger-${RUN}`;
    const tid = `territory-${RUN}`;
    await pool.query(`INSERT INTO operational_territories (id, name, level, status, regulatory_status, created_at, updated_at) VALUES ($1, 'T', 'neighborhood', 'active', 'not_applicable', NOW(), NOW()) ON CONFLICT DO NOTHING`, [tid]);

    try {
      await client.query('BEGIN');
      const result = await svc.recordCollectedFeeInClient(client, tid, 'mgr1', 'asn1', 1800n, 720n, rideId, '2026-07');
      await client.query('COMMIT');

      expect(result.platformEntryId).toBeGreaterThan(0n);
      expect(result.shareEntryId).toBeGreaterThan(0n);

      const { rows } = await pool.query('SELECT entry_type, amount_cents, idempotency_key FROM territory_ledger WHERE reference_id = $1 ORDER BY entry_type', [rideId]);
      expect(rows.length).toBe(2);
      expect(rows[0].entry_type).toBe('fee_share');
      expect(rows[0].amount_cents).toBe('720');
      expect(rows[1].entry_type).toBe('platform_fee');
      expect(rows[1].amount_cents).toBe('1800');
    } finally { client.release(); }
  });

  it('recordCollectedFeeInClient is idempotent', async () => {
    const svc = new TerritoryLedgerService(pool);
    const client = await pool.connect();
    const rideId = `ride-idemp-ledger-${RUN}`;
    const tid = `territory-${RUN}`;

    try {
      await client.query('BEGIN');
      const r1 = await svc.recordCollectedFeeInClient(client, tid, 'mgr1', 'asn1', 540n, 216n, rideId, '2026-08');
      const r2 = await svc.recordCollectedFeeInClient(client, tid, 'mgr1', 'asn1', 540n, 216n, rideId, '2026-08');
      await client.query('COMMIT');

      expect(r1.platformEntryId).toBe(r2.platformEntryId);
      expect(r1.shareEntryId).toBe(r2.shareEntryId);
    } finally { client.release(); }
  });

  it('throws TERRITORY_LEDGER_IDEMPOTENCY_MISMATCH on divergent data', async () => {
    const svc = new TerritoryLedgerService(pool);
    const client = await pool.connect();
    const rideId = `ride-mismatch-${RUN}`;
    const tid = `territory-${RUN}`;

    try {
      await client.query('BEGIN');
      await svc.recordCollectedFeeInClient(client, tid, 'mgr1', 'asn1', 1800n, 720n, rideId, '2026-09');

      // Try with different amount
      await expect(
        svc.recordCollectedFeeInClient(client, tid, 'mgr1', 'asn1', 999n, 400n, rideId, '2026-09')
      ).rejects.toMatchObject({ code: 'TERRITORY_LEDGER_IDEMPOTENCY_MISMATCH' });

      await client.query('ROLLBACK');
    } finally { client.release(); }
  });

  it('uses "Parcela territorial reservada" when managerId is null', async () => {
    const svc = new TerritoryLedgerService(pool);
    const client = await pool.connect();
    const rideId = `ride-nomanager-ledger-${RUN}`;
    const tid = `territory-${RUN}`;

    try {
      await client.query('BEGIN');
      await svc.recordCollectedFeeInClient(client, tid, null, null, 1800n, 720n, rideId, '2026-07');
      await client.query('COMMIT');

      const { rows } = await pool.query("SELECT description FROM territory_ledger WHERE reference_id = $1 AND entry_type = 'fee_share'", [rideId]);
      expect(rows[0].description).toBe('Parcela territorial reservada');
    } finally { client.release(); }
  });
});
