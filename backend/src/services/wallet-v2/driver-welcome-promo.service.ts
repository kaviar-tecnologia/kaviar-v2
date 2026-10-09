import { Pool } from 'pg';

export const PERMANENT_WELCOME_BONUS_CENTS = 2000n;

export interface WelcomePromoResult {
  granted: boolean;
  balanceCents: bigint;
}

export class DriverWelcomePromoService {
  constructor(private readonly pool: Pool) {}

  async grantOnce(driverId: string): Promise<WelcomePromoResult> {
    // Proteção técnica de lançamento; não é uma campanha temporária.
    if (process.env.DRIVER_PERMANENT_WELCOME_ENABLED !== 'true') {
      return { granted: false, balanceCents: 0n };
    }

    // Marco técnico de implantação; o benefício não possui vencimento.
    const eligibleFromRaw =
      process.env.DRIVER_PERMANENT_WELCOME_ELIGIBLE_FROM;

    if (
      !eligibleFromRaw ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
        eligibleFromRaw
      )
    ) {
      return { granted: false, balanceCents: 0n };
    }

    const eligibleFrom = new Date(eligibleFromRaw);

    if (
      !Number.isFinite(eligibleFrom.getTime()) ||
      eligibleFrom.toISOString() !== eligibleFromRaw ||
      eligibleFrom.getTime() > Date.now()
    ) {
      return { granted: false, balanceCents: 0n };
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Serializa solicitações simultâneas para o mesmo motorista.
      const driverResult = await client.query(
        `SELECT id, status, created_at, approved_at
         FROM drivers
         WHERE id = $1
         FOR UPDATE`,
        [driverId]
      );

      const driver = driverResult.rows[0];

      if (
        !driver ||
        !['approved', 'active'].includes(driver.status) ||
        !driver.created_at ||
        !driver.approved_at ||
        new Date(driver.created_at) < eligibleFrom ||
        new Date(driver.approved_at) < eligibleFrom
      ) {
        await client.query('ROLLBACK');
        return { granted: false, balanceCents: 0n };
      }

      await client.query(
        `INSERT INTO driver_promo_wallets
           (driver_id, balance_cents, reserved_cents, updated_at)
         VALUES ($1, 0, 0, NOW())
         ON CONFLICT (driver_id) DO NOTHING`,
        [driverId]
      );

      const existing = await client.query(
        `SELECT id
         FROM driver_promo_ledger
         WHERE idempotency_key = $1`,
        [`welcome_permanent:${driverId}`]
      );

      if (existing.rows.length > 0) {
        const wallet = await client.query(
          `SELECT balance_cents
           FROM driver_promo_wallets
           WHERE driver_id = $1`,
          [driverId]
        );

        await client.query('COMMIT');

        return {
          granted: false,
          balanceCents: BigInt(wallet.rows[0].balance_cents),
        };
      }

      const updated = await client.query(
        `UPDATE driver_promo_wallets
         SET balance_cents = balance_cents + $2,
             updated_at = NOW()
         WHERE driver_id = $1
         RETURNING balance_cents`,
        [driverId, PERMANENT_WELCOME_BONUS_CENTS.toString()]
      );

      const balanceCents = BigInt(updated.rows[0].balance_cents);

      await client.query(
        `INSERT INTO driver_promo_ledger
          (driver_id, entry_type, amount_cents,
           balance_after_cents, reserved_delta_cents,
           reserved_after_cents, reference_type, reference_id,
           idempotency_key, metadata)
         VALUES ($1, 'welcome_grant', $2, $3, 0, 0,
                 'driver', $1, $4, $5::jsonb)`,
        [
          driverId,
          PERMANENT_WELCOME_BONUS_CENTS.toString(),
          balanceCents.toString(),
          `welcome_permanent:${driverId}`,
          JSON.stringify({
            benefit: 'permanent_driver_welcome',
            withdrawable: false,
            currency: 'BRL',
          }),
        ]
      );

      await client.query('COMMIT');

      return { granted: true, balanceCents };
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserva o erro original.
      }

      throw error;
    } finally {
      client.release();
    }
  }
}
