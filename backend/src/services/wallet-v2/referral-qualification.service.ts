import { PoolClient } from 'pg';
import {
  isEligibleReferralDriver,
  isQualifyingReferralRecharge,
} from './referral-eligibility';

export async function qualifyReferralForRecharge(
  client: PoolClient,
  rechargeId: string
): Promise<boolean> {
  // Segurança: campanha desligada por padrão.
  if (process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED !== 'true') {
    return false;
  }

  // Sem data inicial válida, nenhuma indicação pode ser qualificada.
  const startAtRaw = process.env.DRIVER_REFERRAL_CAMPAIGN_START_AT;
  const startAt = startAtRaw ? new Date(startAtRaw) : null;

  // Aceitar somente data UTC completa e não futura.
  const validUtcFormat = startAtRaw
    ? /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(startAtRaw)
    : false;

  if (!validUtcFormat || !startAt ||
      !Number.isFinite(startAt.getTime()) ||
      startAt.toISOString() !== startAtRaw ||
      startAt.getTime() > Date.now()) {
    return false;
  }

  // O chamador controla BEGIN/COMMIT/ROLLBACK.
  // O bloqueio da linha do motorista serializa qualificações concorrentes
  // quando todas utilizam este serviço dentro de uma transação.
  const rechargeResult = await client.query(
    `SELECT id, driver_id, amount_cents, status, payment_provider,
            confirmed_at, created_at
     FROM wallet_recharges
     WHERE id = $1`,
    [rechargeId]
  );

  const recharge = rechargeResult.rows[0];

  if (!recharge) return false;

  if (!isQualifyingReferralRecharge({
    payment_provider: recharge.payment_provider,
    status: recharge.status,
    amount_cents: BigInt(recharge.amount_cents),
  })) return false;

  // A compra deve ter ocorrido e sido confirmada após o início.
  if (!recharge.created_at || !recharge.confirmed_at ||
      new Date(recharge.created_at) < startAt ||
      new Date(recharge.confirmed_at) < startAt) {
    return false;
  }

  const driverResult = await client.query(
    `SELECT id, phone, status, suspended_at, banned_at, deleted_at,
            created_at
     FROM drivers
     WHERE id = $1
     FOR UPDATE`,
    [recharge.driver_id]
  );

  const driver = driverResult.rows[0];

  if (!driver?.phone || !isEligibleReferralDriver(driver) ||
      !driver.created_at || new Date(driver.created_at) < startAt) {
    return false;
  }

  const result = await client.query(
    `UPDATE referrals r
     SET status = 'qualified',
         qualified_at = NOW(),
         driver_id = $1,
         payment_status = CASE
           WHEN a.pix_key IS NOT NULL
             AND BTRIM(a.pix_key) <> ''
           THEN 'pending_approval'
           ELSE 'pending_pix'
         END,
         updated_at = NOW()
     FROM referral_agents a
     WHERE r.agent_id = a.id
       AND a.is_active = TRUE
       AND r.status = 'pending'
       AND r.payment_status = 'pending_pix'
       AND r.created_at >= $3
       AND (r.driver_id = $1 OR r.driver_phone = $2)
       AND NOT EXISTS (
         SELECT 1
         FROM referrals prior
         WHERE prior.driver_id = $1
           AND prior.id <> r.id
           AND (
             prior.status = 'qualified'
             OR prior.payment_status IN ('pending_approval', 'approved', 'paid')
           )
       )
     RETURNING r.id`,
    [driver.id, driver.phone, startAt]
  );

  return result.rows.length === 1;
}
