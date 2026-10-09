import { describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { assertSafeFinanceDatabase } from '../../src/lib/assert-safe-finance-db';
import { WalletService } from '../../src/services/wallet-v2/wallet.service';

describe('Reserva financeira transacional', () => {
  it('reserva, preserva idempotência e reverte no rollback', async () => {
    assertSafeFinanceDatabase();

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const client = await pool.connect();

    const driverId = `reserve-test-${randomUUID()}`;
    const rideId = `reserve-ride-${randomUUID()}`;

    try {
      await client.query('BEGIN');

      await client.query(
        `INSERT INTO drivers
         (id,name,email,phone,document_cpf,status,created_at,updated_at)
         VALUES ($1,'Teste',$2,'119999','000','active',NOW(),NOW())`,
        [driverId, `${driverId}@test.local`]
      );

      await client.query(
        `INSERT INTO driver_wallets
         (driver_id,balance_cents,reserved_cents,updated_at)
         VALUES ($1,2000,0,NOW())`,
        [driverId]
      );

      const service = new WalletService(pool);

      await service.reserveInClient(client, driverId, 1200n, rideId);

      const repeated = await service.reserveInClient(
        client, driverId, 1200n, rideId
      );
      expect(repeated).toBeDefined();

      await expect(
        service.reserveInClient(client, driverId, 1300n, rideId)
      ).rejects.toThrow('WALLET_RESERVE_IDEMPOTENCY_MISMATCH');

      const { rows: [wallet] } = await client.query(
        `SELECT balance_cents,reserved_cents
         FROM driver_wallets WHERE driver_id=$1`,
        [driverId]
      );

      expect(BigInt(wallet.balance_cents)).toBe(2000n);
      expect(BigInt(wallet.reserved_cents)).toBe(1200n);

      const { rows: [ledger] } = await client.query(
        `SELECT COUNT(*)::int AS total
         FROM wallet_ledger
         WHERE idempotency_key=$1`,
        [`reserve:ride:${rideId}`]
      );

      expect(ledger.total).toBe(1);
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
