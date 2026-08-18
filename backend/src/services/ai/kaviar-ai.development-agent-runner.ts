import { hostname } from 'node:os';
import { pool } from '../../db';
import { claimNextDevelopmentJob } from './kaviar-ai.development-worker';
import type {
  ClaimedDevelopmentJob,
} from './kaviar-ai.development-worker';
import {
  runDevelopmentJobLifecycle,
} from './kaviar-ai.development-lifecycle';

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const MIN_POLL_INTERVAL_MS = 5_000;

export interface DevelopmentAgentRunnerDeps {
  execute: (
    job: ClaimedDevelopmentJob,
    signal: AbortSignal,
  ) => Promise<void>;
}

function getWorkerId(): string {
  const configured =
    process.env.DEVELOPMENT_AGENT_WORKER_ID?.trim();

  if (configured) return configured;

  return `development-agent:${hostname()}:${process.pid}`;
}

function getPollIntervalMs(): number {
  const parsed = Number.parseInt(
    process.env.DEVELOPMENT_AGENT_WORKER_INTERVAL_MS ?? '',
    10,
  );

  if (
    !Number.isFinite(parsed) ||
    parsed < MIN_POLL_INTERVAL_MS
  ) {
    return DEFAULT_POLL_INTERVAL_MS;
  }

  return parsed;
}

export async function runDevelopmentAgentRunner(
  deps: DevelopmentAgentRunnerDeps,
): Promise<void> {
  const workerId = getWorkerId();
  const pollIntervalMs = getPollIntervalMs();

  let stopping = false;

  const requestStop = () => {
    stopping = true;
  };

  process.once('SIGINT', requestStop);
  process.once('SIGTERM', requestStop);

  console.log(
    `[DEVELOPMENT_AGENT_RUNNER] Started ` +
      `worker=${workerId} ` +
      `interval=${pollIntervalMs}ms`,
  );

  try {
    while (!stopping) {
      const job = await claimNextDevelopmentJob({
        pool,
        workerId,
      });

      if (!job) {
        await new Promise<void>((resolve) => {
          let settled = false;

          const cleanup = () => {
            clearTimeout(timer);
            process.removeListener(
              'SIGINT',
              stopEarly,
            );
            process.removeListener(
              'SIGTERM',
              stopEarly,
            );
          };

          const finish = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve();
          };

          const stopEarly = () => {
            finish();
          };

          const timer = setTimeout(
            finish,
            pollIntervalMs,
          );

          process.once('SIGINT', stopEarly);
          process.once('SIGTERM', stopEarly);
        });

        continue;
      }

      console.log(
        `[DEVELOPMENT_AGENT_RUNNER] ` +
          `Claimed job=${job.id} ` +
          `category=${job.category} ` +
          `attempt=${job.attempts}`,
      );

      const result = await runDevelopmentJobLifecycle(
        job,
        {
          worker: {
            pool,
            workerId,
          },
          execute: deps.execute,
        },
      );

      console.log(
        `[DEVELOPMENT_AGENT_RUNNER] ` +
          `Finished job=${job.id} ` +
          `status=${result.status}`,
      );
    }
  } finally {
    process.removeListener('SIGINT', requestStop);
    process.removeListener('SIGTERM', requestStop);

    await pool.end();

    console.log(
      '[DEVELOPMENT_AGENT_RUNNER] Stopped gracefully',
    );
  }
}
