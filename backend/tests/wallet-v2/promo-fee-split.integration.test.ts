import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { FeeSplitService } from '../../src/services/wallet-v2/fee-split.service';

describe('Registro financeiro do subsídio — PostgreSQL', () => {
  it('registra R$ 12 subsidiados e R$ 6 arrecadados', async () => {
    assertSafeFinanceDatabase();

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const rideId = `promo-test-${randomUUID()}`;
      const driverId = `driver-promo-${randomUUID()}`;

      const service = new FeeSplitService(pool);

      const snapshot = await service.recordSplitInClient(client, {
        rideId,
        driverId,
        finalPriceCents: 10000n,
        feeBaseCents: 10000n,
        territoryId: null,
        managerId: null,
        managerAssignmentId: null,
        recognizedAt: new Date(),
        referenceMonth: '2026-10',
        platformFeeRateBps: 1800,
        managerCommissionRateBps: 0,
        feeCollectedCents: 600n,
        feePendingCents: 0n,
        feeSubsidizedCents: 1200n,
        collectionStatus: 'collected',
      });

      expect(snapshot.feeAmountCents).toBe(1800n);
      expect(snapshot.feeCollectedCents).toBe(600n);
      expect(snapshot.feeSubsidizedCents).toBe(1200n);
      expect(snapshot.feePendingCents).toBe(0n);
      expect(snapshot.managerShareCents).toBe(0n);

      const { rows } = await client.query(
        `SELECT fee_amount_cents, fee_collected_cents,
                fee_subsidized_cents, fee_pending_cents
         FROM ride_fee_splits WHERE ride_id = $1`,
        [rideId]
      );

      expect(BigInt(rows[0].fee_amount_cents)).toBe(1800n);
      expect(BigInt(rows[0].fee_collected_cents)).toBe(600n);
      expect(BigInt(rows[0].fee_subsidized_cents)).toBe(1200n);
      expect(BigInt(rows[0].fee_pending_cents)).toBe(0n);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  });
});
