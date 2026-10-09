import { pool } from '../../db';
import { qualifyReferralForRecharge } from './referral-qualification.service';

/**
 * Reprocessa a qualificação de uma recarga já confirmada.
 * Não realiza crédito financeiro nem transferência Pix.
 */
export async function recoverReferralQualification(
  rechargeId: string
): Promise<boolean> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const qualified = await qualifyReferralForRecharge(client, rechargeId);

    await client.query('COMMIT');
    return qualified;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Recupera indicações a partir de recargas SumUp confirmadas.
 * Operação idempotente: indicações já qualificadas não são alteradas.
 */
export async function recoverDriverReferralQualifications(
  driverId: string
): Promise<number> {
  const recharges = await pool.query(
    `SELECT id
     FROM wallet_recharges
     WHERE driver_id = $1
       AND payment_provider = 'sumup'
       AND status = 'confirmed'
       AND amount_cents >= 2000
     ORDER BY confirmed_at ASC, id ASC`,
    [driverId]
  );

  let qualified = 0;

  for (const recharge of recharges.rows) {
    if (await recoverReferralQualification(recharge.id)) {
      qualified++;
      break;
    }
  }

  return qualified;
}
