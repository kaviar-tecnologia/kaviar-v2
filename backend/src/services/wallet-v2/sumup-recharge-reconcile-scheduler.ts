import { pool } from '../../db';
import { reconcilePendingSumUpRecharges } from './sumup-recharge.service';
import { recoverPendingReferrals } from './referral-batch-recovery.service';
import { recoverPendingWelcomeGrants } from './welcome-grant-recovery.service';
import { recoverCanceledReservations } from './canceled-reservation-recovery.service';
import { dispatcherService } from '../dispatcher.service';
import { resumeInterruptedRedispatches } from './interrupted-redispatch-recovery.service';

const DEFAULT_INTERVAL_MS = 300000; // 5 min
const DEFAULT_BATCH_LIMIT = 20;
const SCHEDULER_LOCK_KEY = 'kaviar:sumup_recharge_reconcile_scheduler';

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

export function startSumUpRechargeReconcileScheduler(): void {
  const intervalMs = Math.max(30000, parsePositiveInt(process.env.SUMUP_RECONCILE_INTERVAL_MS, DEFAULT_INTERVAL_MS));
  const batchLimit = Math.min(200, Math.max(1, parsePositiveInt(process.env.SUMUP_RECONCILE_BATCH_LIMIT, DEFAULT_BATCH_LIMIT)));
  const minAgeMinutes = 1;

  let running = false;

  const runCycle = async () => {
    if (running) {
      console.warn('[SUMUP_RECONCILE_SCHEDULER] Previous cycle still running; skipping this tick.');
      return;
    }

    running = true;
    const startedAt = Date.now();
    let lockClient: any = null;
    let lockAcquired = false;

    try {
      lockClient = await pool.connect();

      const lockResult = await lockClient.query(
        "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
        [SCHEDULER_LOCK_KEY]
      );

      lockAcquired = lockResult.rows[0]?.locked === true;
      if (!lockAcquired) {
        console.log('[SUMUP_RECONCILE_SCHEDULER] Another scheduler instance is running; skipping this tick.');
        return;
      }

      // A falha na reconciliação financeira não impede a recuperação.
      let result = {
        scanned: 0,
        confirmed: 0,
        expired: 0,
        pending: 0,
        errors: 0,
      };

      try {
        result = await reconcilePendingSumUpRecharges(
          batchLimit,
          minAgeMinutes
        );
      } catch (sumupError) {
        console.error('[SUMUP_RECONCILE_CYCLE_ERROR]', sumupError);
      }

      // Recuperação de indicações independente da reconciliação financeira.
      // Não concede créditos nem executa pagamentos Pix.
      if (process.env.DRIVER_REFERRAL_INCENTIVE_ENABLED === 'true') {
        try {
          const referralResult = await recoverPendingReferrals(batchLimit);

          console.log(
            `[REFERRAL_RECOVERY] scanned=${referralResult.scanned} ` +
            `qualified=${referralResult.qualified} errors=${referralResult.errors}`
          );
        } catch (referralError) {
          console.error('[REFERRAL_RECOVERY_SCHEDULER_ERROR]', referralError);
        }
      }

      // Recuperar concessões de boas-vindas que falharam após aprovação.
      // Não realiza Pix, saque ou pagamento externo.
      if (process.env.DRIVER_PERMANENT_WELCOME_ENABLED === 'true') {
        try {
          const welcome = await recoverPendingWelcomeGrants(batchLimit);

          console.log(
            `[WELCOME_RECOVERY] scanned=${welcome.scanned} ` +
            `granted=${welcome.granted} errors=${welcome.errors}`
          );
        } catch (error) {
          console.error(
            '[WELCOME_RECOVERY_ERROR]',
            error instanceof Error ? error.message : 'UNKNOWN_ERROR'
          );
        }
      }


      // Recuperação de reservas após cancelamentos.
      // Desligada por padrão; não depende das flags promocionais.
      if (process.env.DRIVER_CANCEL_RESERVATION_RECOVERY_ENABLED === 'true') {
        try {
          const recovery = await recoverCanceledReservations(
            pool,
            batchLimit
          );

          console.log(
            `[CANCELED_RESERVATION_RECOVERY] ` +
            `scanned=${recovery.scanned} ` +
            `released=${recovery.released} ` +
            `already_finalized=${recovery.already_finalized} ` +
            `skipped=${recovery.skipped} ` +
            `errors=${recovery.errors}`
          );
        } catch (error) {
          console.error(
            '[CANCELED_RESERVATION_RECOVERY_ERROR]',
            error instanceof Error ? error.message : 'UNKNOWN_ERROR'
          );
        }
      }


      // Retomar redistribuição interrompida após falha ou reinício.
      // Desligado por padrão e independente da flag promocional.
      if (
        process.env.DRIVER_INTERRUPTED_REDISPATCH_RECOVERY_ENABLED === 'true'
      ) {
        try {
          const redispatch = await resumeInterruptedRedispatches(
            pool,
            rideId => dispatcherService.dispatchRide(rideId),
            batchLimit
          );

          console.log(
            `[INTERRUPTED_REDISPATCH_RECOVERY] ` +
            `scanned=${redispatch.scanned} ` +
            `attempted=${redispatch.attempted} ` +
            `skipped=${redispatch.skipped} ` +
            `errors=${redispatch.errors}`
          );
        } catch (error) {
          console.error(
            '[INTERRUPTED_REDISPATCH_RECOVERY_CYCLE_ERROR]',
            error instanceof Error ? error.message : 'UNKNOWN_ERROR'
          );
        }
      }

      const tookMs = Date.now() - startedAt;
      console.log(
        `[SUMUP_RECONCILE_SCHEDULER] scanned=${result.scanned} confirmed=${result.confirmed} expired=${result.expired} pending=${result.pending} errors=${result.errors} took_ms=${tookMs}`
      );
    } catch (error: any) {
      // Keep scheduler resilient; log only non-sensitive information.
      const message = error?.message || 'unknown_error';
      console.error(`[SUMUP_RECONCILE_SCHEDULER_ERROR] ${message}`);
    } finally {
      if (lockClient) {
        if (lockAcquired) {
          try {
            await lockClient.query(
              "SELECT pg_advisory_unlock(hashtext($1))",
              [SCHEDULER_LOCK_KEY]
            );
          } catch (unlockError: any) {
            const message = unlockError?.message || 'unlock_failed';
            console.error(`[SUMUP_RECONCILE_SCHEDULER_UNLOCK_ERROR] ${message}`);
          }
        }

        lockClient.release();
      }

      running = false;
    }
  };

  setInterval(() => {
    runCycle().catch((err) => {
      const message = (err as any)?.message || 'unknown_error';
      console.error(`[SUMUP_RECONCILE_SCHEDULER_UNHANDLED] ${message}`);
    });
  }, intervalMs);

  console.log(
    `[SUMUP_RECONCILE_SCHEDULER] Started (interval_ms=${intervalMs}, batch_limit=${batchLimit}, min_age_minutes=${minAgeMinutes})`
  );
}
