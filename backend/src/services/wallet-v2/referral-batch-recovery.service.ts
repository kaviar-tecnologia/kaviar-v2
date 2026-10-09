import { pool } from '../../db';
import { recoverReferralQualification } from './referral-recovery.service';

export interface ReferralBatchRecoveryResult {
  scanned: number;
  qualified: number;
  errors: number;
}

export async function recoverPendingReferrals(
  limit = 20
): Promise<ReferralBatchRecoveryResult> {
  if (process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED !== 'true') {
    return { scanned: 0, qualified: 0, errors: 0 };
  }

  const startAtRaw = process.env.DRIVER_REFERRAL_CAMPAIGN_START_AT;
  const startAt = startAtRaw ? new Date(startAtRaw) : null;

  if (
    !startAtRaw ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(startAtRaw) ||
    !startAt ||
    !Number.isFinite(startAt.getTime()) ||
    startAt.toISOString() !== startAtRaw ||
    startAt.getTime() > Date.now()
  ) {
    return { scanned: 0, qualified: 0, errors: 0 };
  }

  const cappedLimit = Math.max(1, Math.min(Math.trunc(limit) || 20, 100));

  const result = await pool.query(
    `SELECT DISTINCT ON (r.id)
            wr.id AS recharge_id
     FROM referrals r
     JOIN drivers d
       ON d.id = r.driver_id
     JOIN referral_agents a
       ON a.id = r.agent_id
     JOIN wallet_recharges wr
       ON wr.driver_id = d.id
     WHERE r.status = 'pending'
       AND r.payment_status = 'pending_pix'
       AND r.created_at >= $1
       AND d.created_at >= $1
       AND d.status IN ('approved', 'active')
       AND d.suspended_at IS NULL
       AND d.banned_at IS NULL
       AND d.deleted_at IS NULL
       AND a.is_active = TRUE
       AND wr.payment_provider = 'sumup'
       AND wr.status = 'confirmed'
       AND wr.amount_cents >= 2000
       AND wr.created_at >= $1
       AND wr.confirmed_at >= $1
     ORDER BY r.id, wr.confirmed_at ASC, wr.id ASC
     LIMIT $2`,
    [startAt, cappedLimit]
  );

  let qualified = 0;
  let errors = 0;

  for (const row of result.rows) {
    try {
      if (await recoverReferralQualification(row.recharge_id)) {
        qualified++;
      }
    } catch (error) {
      errors++;
      console.error('[REFERRAL_BATCH_RECOVERY_ERROR]', error);
    }
  }

  return {
    scanned: result.rows.length,
    qualified,
    errors,
  };
}
