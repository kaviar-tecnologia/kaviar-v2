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
 *
 * Graceful shutdown:
 *   - stopPayoutWorkerScheduler() clears interval and awaits current run
 *   - No new ticks after stop is called
 *   - Already-started HTTP calls complete normally
 *   - Idempotent: multiple stop calls are safe
 */

import { withSchedulerLock } from '../../../lib/scheduler-lock';
import { pool } from '../../../db';
import { AnnualIncentiveLedgerService } from '../annual-incentive-ledger.service';
import { processOutboxBatch } from './worker.service';
import { createPayoutProvider } from './providers';

const LOCK_NAME = 'kaviar:annual_incentive_payout_worker';
const DEFAULT_INTERVAL_MS = 30_000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let stopping = false;
let currentRunPromise: Promise<void> | null = null;

/**
 * Starts the payout worker scheduler.
 * Returns false if the worker should not be started (guards prevent it).
 * Returns false if already started (prevents duplicate intervals).
 */
export function startPayoutWorkerScheduler(): boolean {
  // Guard: never start in test
  if (process.env.NODE_ENV === 'test') return false;

  // Guard: worker not enabled
  if (process.env.ANNUAL_INCENTIVE_PAYOUT_WORKER_ENABLED !== 'true') return false;

  // Guard: payout not enabled
  if (process.env.ANNUAL_INCENTIVE_PAYOUT_ENABLED !== 'true') return false;

  // Guard: already running (prevent duplicate intervals)
  if (intervalHandle !== null) return false;

  const intervalMs = parseInt(process.env.ANNUAL_INCENTIVE_PAYOUT_WORKER_INTERVAL_MS ?? '') || DEFAULT_INTERVAL_MS;

  const ledgerService = new AnnualIncentiveLedgerService(pool);
  stopping = false;

  console.log(`[PAYOUT_WORKER] Starting scheduler (interval=${intervalMs}ms, lock=${LOCK_NAME})`);

  intervalHandle = setInterval(async () => {
    // Do not start new tick if stopping
    if (stopping) return;

    const runFn = async () => {
      try {
        await withSchedulerLock(LOCK_NAME, async () => {
          // Double-check stopping inside lock (in case stop was called between interval fire and lock acquisition)
          if (stopping) return;

          const provider = createPayoutProvider();

          // Don't process if provider is unavailable
          const avail = await provider.validateAvailability();
          if (!avail.available) return;

          const processed = await processOutboxBatch({ pool, ledgerService, provider });
          if (processed > 0) {
            console.log(`[PAYOUT_WORKER] Processed ${processed} items`);
          }
        });
      } catch (err: any) {
        console.error(`[PAYOUT_WORKER_SCHEDULER_ERROR] ${err.message}`);
      }
    };

    currentRunPromise = runFn();
    await currentRunPromise;
    currentRunPromise = null;
  }, intervalMs);

  return true;
}

/**
 * Stops the payout worker scheduler gracefully.
 *
 * - Clears the interval (no new ticks)
 * - Awaits any currently executing tick to complete
 * - Idempotent: safe to call multiple times
 */
export async function stopPayoutWorkerScheduler(): Promise<void> {
  if (stopping && intervalHandle === null) return; // already stopped

  stopping = true;

  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  // Await the current in-flight run if any
  if (currentRunPromise) {
    try {
      await currentRunPromise;
    } catch {
      // Swallow — the tick handles its own errors
    }
    currentRunPromise = null;
  }

  console.log('[PAYOUT_WORKER] Scheduler stopped gracefully');
}

/**
 * Returns whether the scheduler is currently stopping (for test inspection).
 */
export function isPayoutWorkerStopping(): boolean {
  return stopping;
}

/**
 * Returns whether a tick is currently in progress (for test inspection).
 */
export function isPayoutWorkerRunning(): boolean {
  return currentRunPromise !== null;
}
