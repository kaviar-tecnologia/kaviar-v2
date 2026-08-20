import type {
  ClaimedDevelopmentJob,
  DevelopmentWorkerDeps,
  DevelopmentJobFinalStatus,
  DevelopmentJobFinalizationResult,
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
  ) => Promise<DevelopmentJobFinalizationResult | void>;

  runWithHeartbeat?: typeof executeDevelopmentJobWithHeartbeat;
  finalize?: typeof finalizeDevelopmentJob;
}

async function finalizeOwnedJob(
  job: ClaimedDevelopmentJob,
  deps: DevelopmentLifecycleDeps,
  status: DevelopmentJobFinalStatus,
  finalization: DevelopmentJobFinalizationResult = {},
): Promise<boolean> {
  const finalize =
    deps.finalize ?? finalizeDevelopmentJob;

  return finalize(
    deps.worker,
    job.id,
    status,
    finalization,
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
      execution.finalization ?? {},
    );

    if (!finalized) {
      return { status: 'OWNERSHIP_LOST' };
    }

    return { status: 'SUCCEEDED' };
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error);

    const finalized = await finalizeOwnedJob(
      job,
      deps,
      'FAILED',
      {
        errorMessage,
      },
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
