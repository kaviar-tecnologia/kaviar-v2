import type {
  ClaimedDevelopmentJob,
  DevelopmentWorkerDeps,
  DevelopmentJobFinalStatus,
} from './kaviar-ai.development-worker';
import {
  finalizeDevelopmentJob,
} from './kaviar-ai.development-worker';
import {
  executeDevelopmentJobWithHeartbeat,
} from './kaviar-ai.development-execution';

export type DevelopmentLifecycleResult =
  | { status: 'SUCCEEDED' }
  | { status: 'FAILED'; error: unknown }
  | { status: 'OWNERSHIP_LOST' };

export interface DevelopmentLifecycleDeps {
  worker: DevelopmentWorkerDeps;

  execute: (
    job: ClaimedDevelopmentJob,
    signal: AbortSignal,
  ) => Promise<void>;

  runWithHeartbeat?: typeof executeDevelopmentJobWithHeartbeat;
  finalize?: typeof finalizeDevelopmentJob;
}

async function finalizeOwnedJob(
  job: ClaimedDevelopmentJob,
  deps: DevelopmentLifecycleDeps,
  status: DevelopmentJobFinalStatus,
): Promise<boolean> {
  const finalize =
    deps.finalize ?? finalizeDevelopmentJob;

  return finalize(
    deps.worker,
    job.id,
    status,
  );
}

export async function runDevelopmentJobLifecycle(
  job: ClaimedDevelopmentJob,
  deps: DevelopmentLifecycleDeps,
): Promise<DevelopmentLifecycleResult> {
  const runWithHeartbeat =
    deps.runWithHeartbeat ??
    executeDevelopmentJobWithHeartbeat;

  try {
    const execution = await runWithHeartbeat(
      job,
      {
        worker: deps.worker,
        execute: deps.execute,
      },
    );

    if (execution.status === 'OWNERSHIP_LOST') {
      return { status: 'OWNERSHIP_LOST' };
    }

    const finalized = await finalizeOwnedJob(
      job,
      deps,
      'SUCCEEDED',
    );

    if (!finalized) {
      return { status: 'OWNERSHIP_LOST' };
    }

    return { status: 'SUCCEEDED' };
  } catch (error) {
    const finalized = await finalizeOwnedJob(
      job,
      deps,
      'FAILED',
    );

    if (!finalized) {
      return { status: 'OWNERSHIP_LOST' };
    }

    return {
      status: 'FAILED',
      error,
    };
  }
}
