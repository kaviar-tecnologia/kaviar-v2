import { hostname } from 'node:os';
import { pool } from '../../db';
import { withSchedulerLock } from '../../lib/scheduler-lock';
import { claimNextDevelopmentJob } from './kaviar-ai.development-worker';

const LOCK_NAME = 'kaviar:development_agent_worker';
const DEFAULT_INTERVAL_MS = 30_000;
const MIN_INTERVAL_MS = 5_000;

let intervalHandle: ReturnType<typeof setInterval> | null = null;
let stopping = false;
let currentRunPromise: Promise<void> | null = null;

function getWorkerId(): string {
  const configured =
    process.env.DEVELOPMENT_AGENT_WORKER_ID?.trim();

  if (configured) return configured;

  return `development-agent:${hostname()}:${process.pid}`;
}

function getIntervalMs(): number {
  const parsed = Number.parseInt(
    process.env.DEVELOPMENT_AGENT_WORKER_INTERVAL_MS ?? '',
    10,
  );

  if (!Number.isFinite(parsed) || parsed < MIN_INTERVAL_MS) {
    return DEFAULT_INTERVAL_MS;
  }

  return parsed;
}

export function startDevelopmentAgentWorkerScheduler(): boolean {
  if (process.env.NODE_ENV === 'test') return false;

  if (
    process.env.DEVELOPMENT_AGENT_WORKER_ENABLED !== 'true'
  ) {
    return false;
  }

  if (intervalHandle !== null) return false;

  const intervalMs = getIntervalMs();
  stopping = false;

  console.log(
    `[DEVELOPMENT_AGENT_WORKER] Starting scheduler ` +
      `(interval=${intervalMs}ms, lock=${LOCK_NAME})`,
  );

  intervalHandle = setInterval(async () => {
    if (stopping || currentRunPromise !== null) return;

    const runFn = async () => {
      try {
        await withSchedulerLock(LOCK_NAME, async () => {
          if (stopping) return;

          const job = await claimNextDevelopmentJob({
            pool,
            workerId: getWorkerId(),
          });

          if (job) {
            console.log(
              `[DEVELOPMENT_AGENT_WORKER] ` +
                `Claimed job=${job.id} ` +
                `category=${job.category} ` +
                `attempt=${job.attempts}`,
            );
          }
        });
      } catch (error: any) {
        console.error(
          `[DEVELOPMENT_AGENT_WORKER_ERROR] ` +
            `${error?.message ?? 'unknown error'}`,
        );
      }
    };

    currentRunPromise = runFn();

    await currentRunPromise;

    currentRunPromise = null;
  }, intervalMs);

  return true;
}

export async function stopDevelopmentAgentWorkerScheduler():
Promise<void> {
  if (stopping && intervalHandle === null) return;

  stopping = true;

  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  if (currentRunPromise) {
    try {
      await currentRunPromise;
    } catch {
      // O erro já foi tratado pelo scheduler.
    }

    currentRunPromise = null;
  }

  console.log(
    '[DEVELOPMENT_AGENT_WORKER] Scheduler stopped gracefully',
  );
}
