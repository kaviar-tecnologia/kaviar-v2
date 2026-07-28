/**
 * Outbound Payment Worker Scheduler.
 *
 * Controls:
 *   OUTBOUND_PAYMENT_WORKER_ENABLED=true
 *   OUTBOUND_PAYMENT_WORKER_INTERVAL_MS (default: 30000)
 *   OUTBOUND_PAYMENTS_ENABLED=true
 *
 * Safety:
 *   - Never starts in NODE_ENV=test
 *   - Advisory lock prevents duplicate execution
 *   - Graceful shutdown awaits current run
 */

import { withSchedulerLock } from '../../../lib/scheduler-lock';
import { pool } from '../../../db';
import { processOutboundBatch } from './worker';
import { createOutboundPaymentProvider } from './providers';

const LOCK_NAME = 'kaviar:outbound_payment_worker';
const DEFAULT_INTERVAL_MS = 30_000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let stopping = false;
let currentRunPromise: Promise<void> | null = null;

export function startOutboundPaymentWorkerScheduler(): boolean {
  if (process.env.NODE_ENV === 'test') return false;
  if (process.env.OUTBOUND_PAYMENT_WORKER_ENABLED !== 'true') return false;
  if (process.env.OUTBOUND_PAYMENTS_ENABLED !== 'true') return false;
  if (intervalHandle !== null) return false;

  const intervalMs = parseInt(process.env.OUTBOUND_PAYMENT_WORKER_INTERVAL_MS ?? '') || DEFAULT_INTERVAL_MS;
  stopping = false;

  console.log(`[OUTBOUND_WORKER] Starting scheduler (interval=${intervalMs}ms, lock=${LOCK_NAME})`);

  intervalHandle = setInterval(async () => {
    if (stopping) return;

    const runFn = async () => {
      try {
        await withSchedulerLock(LOCK_NAME, async () => {
          if (stopping) return;
          const provider = createOutboundPaymentProvider();
          const processed = await processOutboundBatch({ pool, provider });
          if (processed > 0) console.log(`[OUTBOUND_WORKER] Processed ${processed} items`);
        });
      } catch (err: any) {
        console.error(`[OUTBOUND_WORKER_ERROR] ${err.message}`);
      }
    };

    currentRunPromise = runFn();
    await currentRunPromise;
    currentRunPromise = null;
  }, intervalMs);

  return true;
}

export async function stopOutboundPaymentWorkerScheduler(): Promise<void> {
  if (stopping && intervalHandle === null) return;
  stopping = true;
  if (intervalHandle) { clearInterval(intervalHandle); intervalHandle = null; }
  if (currentRunPromise) { try { await currentRunPromise; } catch {} currentRunPromise = null; }
  console.log('[OUTBOUND_WORKER] Scheduler stopped gracefully');
}

export function isOutboundWorkerStopping(): boolean { return stopping; }
