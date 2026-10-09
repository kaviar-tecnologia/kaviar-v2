import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { PendingDebitService } from '../../src/services/wallet-v2/pending-debit.service';

describe('Pendência financeira com subsídio promocional', () => {
  it('cria dívida de R$ 2 sem cobrar os R$ 12 subsidiados', async () => {
    assertSafeFinanceDatabase();

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      const rideId = `promo-pending-${randomUUID()}`;
      const driverId = `promo-driver-${randomUUID()}`;

      // Motorista fictício criado somente dentro da transação.
      // O ROLLBACK final remove este registro e a pendência.
      await client.query(
        `INSERT INTO drivers
          (id, name, email, phone, document_cpf, status, created_at, updated_at)
         VALUES
          ($1, 'Promo Test', $2, '119999', '000', 'active', NOW(), NOW())`,
        [driverId, `${driverId}@test.local`]
      );

      const service = new PendingDebitService(pool);

      await service.createInClient(client, {
        rideId,
        driverId,
        finalPriceCents: 10000n,
        feeAmountCents: 1800n,
        feeCollectedCents: 400n,
        feeSubsidizedCents: 1200n,
        reservedCents: 400n,
      });

      const { rows } = await client.query(
        `SELECT fee_amount_cents, fee_collected_cents,
                fee_pending_cents
         FROM pending_debits
         WHERE ride_id = $1`,
        [rideId]
      );

      expect(rows).toHaveLength(1);
      expect(BigInt(rows[0].fee_amount_cents)).toBe(600n);
      expect(BigInt(rows[0].fee_collected_cents)).toBe(400n);
      expect(BigInt(rows[0].fee_pending_cents)).toBe(200n);
    } finally {
      await client.query('ROLLBACK');
      client.release();
      await pool.end();
    }
  });
});
