import { hostname } from 'node:os';
import { pool } from '../../db';
import { claimNextDevelopmentJob } from './kaviar-ai.development-worker';
import {
  claimNextDevelopmentScopeJob,
  heartbeatDevelopmentScopeJob,
  releaseDevelopmentScopeJob,
} from './kaviar-ai.development-scope-worker';
import {
  resolveDevelopmentJobScope,
} from './kaviar-ai.development-jobs';
import type {
  DevelopmentScopePlan,
} from './kaviar-ai.development-scope-planner';
import type {
  ClaimedDevelopmentJob,
  DevelopmentJobFinalizationResult,
} from './kaviar-ai.development-worker';
import {
  runDevelopmentJobLifecycle,
} from './kaviar-ai.development-lifecycle';

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const MIN_POLL_INTERVAL_MS = 5_000;

export interface DevelopmentAgentRunnerDeps {
  planScope: (
    job: {
      id: string;
      category: string;
      summary: string;
    },
    signal: AbortSignal,
  ) => Promise<DevelopmentScopePlan>;

  execute: (
    job: ClaimedDevelopmentJob,
    signal: AbortSignal,
  ) => Promise<DevelopmentJobFinalizationResult | void>;

  cleanupExecution?: (
    job: ClaimedDevelopmentJob,
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
      const scopeJob =
        await claimNextDevelopmentScopeJob({
          pool,
          workerId,
        });

      if (scopeJob) {
        console.log(
          `[DEVELOPMENT_AGENT_RUNNER] ` +
            `Claimed scope job=${scopeJob.id} ` +
            `category=${scopeJob.category}`,
        );

        const abortController =
          new AbortController();

        let heartbeatTimer:
          | ReturnType<typeof setInterval>
          | null = null;

        try {
          heartbeatTimer = setInterval(
            async () => {
              try {
                const owned =
                  await heartbeatDevelopmentScopeJob(
                    {
                      pool,
                      workerId,
                    },
                    scopeJob.id,
                  );

                if (!owned) {
                  abortController.abort(
                    new Error(
                      'DEVELOPMENT_SCOPE_OWNERSHIP_LOST',
                    ),
                  );
                }
              } catch (error) {
                abortController.abort(
                  error instanceof Error
                    ? error
                    : new Error(
                        'DEVELOPMENT_SCOPE_HEARTBEAT_FAILED',
                      ),
                );
              }
            },
            60_000,
          );

          const plan = await deps.planScope(
            scopeJob,
            abortController.signal,
          );

          if (abortController.signal.aborted) {
            throw (
              abortController.signal.reason ??
              new Error(
                'DEVELOPMENT_SCOPE_ABORTED',
              )
            );
          }

          await resolveDevelopmentJobScope(
            scopeJob.id,
            workerId,
            {
              allowedPaths: plan.allowedPaths,
              rationale: plan.rationale,
            },
          );

          console.log(
            `[DEVELOPMENT_AGENT_RUNNER] ` +
              `Scope resolved job=${scopeJob.id} ` +
              `paths=${plan.allowedPaths.length}`,
          );
        } catch (error) {
          await releaseDevelopmentScopeJob(
            {
              pool,
              workerId,
            },
            scopeJob.id,
          );

          console.error(
            `[DEVELOPMENT_AGENT_SCOPE_ERROR] ` +
              `job=${scopeJob.id} ` +
              `${
                error instanceof Error
                  ? error.message
                  : 'unknown error'
              }`,
          );

          stopping = true;
        } finally {
          if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
          }
        }

        continue;
      }

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

      let result;

      try {
        result = await runDevelopmentJobLifecycle(
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

        if (result.status === 'FAILED') {
          console.error(
            `[DEVELOPMENT_AGENT_EXECUTION_ERROR] ` +
              `job=${job.id} ` +
              `${
                result.error instanceof Error
                  ? result.error.message
                  : String(result.error)
              }`,
          );
        }
      } finally {
        if (deps.cleanupExecution) {
          try {
            await deps.cleanupExecution(job);
          } catch (error) {
            console.error(
              `[DEVELOPMENT_AGENT_EXECUTION_CLEANUP_ERROR] ` +
                `job=${job.id}`,
              error,
            );
          }
        }
      }
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
