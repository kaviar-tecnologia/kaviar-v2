/**
 * Provider Event Worker Scheduler.
 *
 * Processes financial_provider_events asynchronously (NOT in webhook request).
 * Uses advisory lock to prevent duplicate processing across ECS instances.
 */

import { withSchedulerLock } from '../../../lib/scheduler-lock';
import { pool } from '../../../db';
import { AnnualIncentiveLedgerService } from '../annual-incentive-ledger.service';
import { processEventBatch } from './event-worker';

const LOCK_NAME = 'kaviar:outbound_event_worker';
const DEFAULT_INTERVAL_MS = 5_000; // 5 seconds — events should be processed quickly

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let stopping = false;
let currentRunPromise: Promise<void> | null = null;

export function startEventWorkerScheduler(): boolean {
  if (process.env.NODE_ENV === 'test') return false;
  if (process.env.OUTBOUND_PROVIDER_EVENT_WORKER_ENABLED !== 'true') return false;
  if (process.env.OUTBOUND_PAYMENTS_ENABLED !== 'true') return false;
  if (intervalHandle !== null) return false;

  const intervalMs = parseInt(process.env.OUTBOUND_EVENT_WORKER_INTERVAL_MS ?? '') || DEFAULT_INTERVAL_MS;
  const ledgerService = new AnnualIncentiveLedgerService(pool);
  stopping = false;

  console.log(`[EVENT_WORKER] Starting scheduler (interval=${intervalMs}ms, lock=${LOCK_NAME})`);

  intervalHandle = setInterval(async () => {
    if (stopping) return;

    const runFn = async () => {
      try {
        await withSchedulerLock(LOCK_NAME, async () => {
          if (stopping) return;
          const processed = await processEventBatch({ pool, ledgerService });
          if (processed > 0) console.log(`[EVENT_WORKER] Processed ${processed} events`);
        });
      } catch (err: any) {
        console.error(`[EVENT_WORKER_ERROR] ${err.message}`);
      }
    };

    currentRunPromise = runFn();
    await currentRunPromise;
    currentRunPromise = null;
  }, intervalMs);

  return true;
}

export async function stopEventWorkerScheduler(): Promise<void> {
  if (stopping && intervalHandle === null) return;
  stopping = true;
  if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; }
  if (currentRunPromise) { try { await currentRunPromise; } catch {} currentRunPromise = null; }
  console.log('[EVENT_WORKER] Scheduler stopped gracefully');
}

export function isEventWorkerStopping(): boolean { return stopping; }
