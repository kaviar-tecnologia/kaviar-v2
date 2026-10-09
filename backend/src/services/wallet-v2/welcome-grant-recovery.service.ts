import { pool } from '../../db';
import { DriverWelcomePromoService } from './driver-welcome-promo.service';

export interface WelcomeRecoveryResult {
  scanned: number;
  granted: number;
  errors: number;
}

export async function recoverPendingWelcomeGrants(
  batchLimit: number
): Promise<WelcomeRecoveryResult> {
  const result = { scanned: 0, granted: 0, errors: 0 };

  if (process.env.DRIVER_PERMANENT_WELCOME_ENABLED !== 'true') {
    return result;
  }

  const eligibleFrom =
    process.env.DRIVER_PERMANENT_WELCOME_ELIGIBLE_FROM;

  if (
    !eligibleFrom ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(
      eligibleFrom
    ) ||
    !Number.isFinite(new Date(eligibleFrom).getTime()) ||
    new Date(eligibleFrom).toISOString() !== eligibleFrom ||
    new Date(eligibleFrom).getTime() > Date.now()
  ) {
    return result;
  }

  const limit = Number.isSafeInteger(batchLimit)
    ? Math.min(200, Math.max(1, batchLimit))
    : 20;

  // Somente motoristas com aprovação documental confirmada.
  // Nenhuma alteração de saldos acontece nesta consulta.
  const candidates = await pool.query<{ id: string }>(
    `SELECT d.id
     FROM drivers d
     JOIN driver_verifications v
       ON v.driver_id = d.id
     WHERE d.status IN ('approved', 'active')
       AND v.status = 'APPROVED'
       AND d.created_at >= $1::timestamptz
       AND d.approved_at >= $1::timestamptz
       AND v.approved_at >= $1::timestamptz
       AND NOT EXISTS (
         SELECT 1
         FROM driver_promo_ledger l
         WHERE l.idempotency_key = 'welcome_permanent:' || d.id
       )
     ORDER BY d.approved_at, d.id
     LIMIT $2`,
    [eligibleFrom, limit]
  );

  result.scanned = candidates.rows.length;

  const service = new DriverWelcomePromoService(pool);

  for (const candidate of candidates.rows) {
    try {
      // Reutiliza a concessão idempotente existente.
      const outcome = await service.grantOnce(candidate.id);

      if (outcome.granted) {
        result.granted++;
      }
    } catch (error) {
      result.errors++;

      console.error(
        '[WELCOME_RECOVERY_GRANT_ERROR]',
        candidate.id,
        error instanceof Error ? error.message : 'UNKNOWN_ERROR'
      );
    }
  }

  return result;
}
