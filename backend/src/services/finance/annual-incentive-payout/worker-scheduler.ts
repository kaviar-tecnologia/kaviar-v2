/**
 * Annual Incentive Payout Worker Scheduler.
 *
 * Wiring: processes the payout outbox on a configurable interval.
 * Uses advisory lock to prevent multiple instances from running concurrently.
 *
 * Controlled by:
 *   ANNUAL_INCENTIVE_PAYOUT_WORKER_ENABLED=true — enables the scheduler
 *   ANNUAL_INCENTIVE_PAYOUT_WORKER_INTERVAL_MS — interval (default: 30000ms)
 *   ANNUAL_INCENTIVE_PAYOUT_ENABLED=true — required for actual payout execution
 *   ANNUAL_INCENTIVE_PAYOUT_PROVIDER=fake|unavailable — determines provider
 *
 * Safety:
 *   - Does NOT start in test env (NODE_ENV=test)
 *   - Does NOT start when worker is disabled
 *   - Does NOT start when payout is disabled
 *   - Advisory lock prevents duplicate execution across ECS instances
 *   - FOR UPDATE SKIP LOCKED in the worker prevents item duplication
 */

import { withSchedulerLock } from '../../../lib/scheduler-lock';
import { pool } from '../../../db';
import { AnnualIncentiveLedgerService } from '../annual-incentive-ledger.service';
import { processOutboxBatch } from './worker.service';
import { createPayoutProvider } from './providers';

const LOCK_NAME = 'kaviar:annual_incentive_payout_worker';
const DEFAULT_INTERVAL_MS = 30_000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the payout worker scheduler.
 * Returns false if the worker should not be started.
 */
export function startPayoutWorkerScheduler(): boolean {
  // Guard: never start in test
  if (process.env.NODE_ENV === 'test') return false;

  // Guard: worker not enabled
  if (process.env.ANNUAL_INCENTIVE_PAYOUT_WORKER_ENABLED !== 'true') return false;

  // Guard: payout not enabled
  if (process.env.ANNUAL_INCENTIVE_PAYOUT_ENABLED !== 'true') return false;

  const intervalMs = parseInt(process.env.ANNUAL_INCENTIVE_PAYOUT_WORKER_INTERVAL_MS ?? '') || DEFAULT_INTERVAL_MS;

  const ledgerService = new AnnualIncentiveLedgerService(pool);

  console.log(`[PAYOUT_WORKER] Starting scheduler (interval=${intervalMs}ms, lock=${LOCK_NAME})`);

  intervalHandle = setInterval(async () => {
    try {
      const acquired = await withSchedulerLock(LOCK_NAME, async () => {
        const provider = createPayoutProvider();

        // Don't process if provider is unavailable
        const avail = await provider.validateAvailability();
        if (!avail.available) return;

        const processed = await processOutboxBatch({ pool, ledgerService, provider });
        if (processed > 0) {
          console.log(`[PAYOUT_WORKER] Processed ${processed} items`);
        }
      });

      if (!acquired) {
        // Another instance holds the lock — normal in multi-instance ECS
      }
    } catch (err: any) {
      console.error(`[PAYOUT_WORKER_SCHEDULER_ERROR] ${err.message}`);
    }
  }, intervalMs);

  return true;
}

/**
 * Stops the payout worker scheduler.
 */
export function stopPayoutWorkerScheduler(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log('[PAYOUT_WORKER] Scheduler stopped');
  }
}
