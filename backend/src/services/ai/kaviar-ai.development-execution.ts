import type {
  ClaimedDevelopmentJob,
  DevelopmentWorkerDeps,
} from './kaviar-ai.development-worker';
import {
  heartbeatDevelopmentJob,
} from './kaviar-ai.development-worker';

const DEFAULT_HEARTBEAT_INTERVAL_MS = 60_000;

export type DevelopmentExecutionResult =
  | { status: 'COMPLETED' }
  | { status: 'OWNERSHIP_LOST' };

export interface DevelopmentExecutionDeps {
  worker: DevelopmentWorkerDeps;

  execute: (
    job: ClaimedDevelopmentJob,
    signal: AbortSignal,
  ) => Promise<void>;

  heartbeat?: typeof heartbeatDevelopmentJob;
  heartbeatIntervalMs?: number;
}

export async function executeDevelopmentJobWithHeartbeat(
  job: ClaimedDevelopmentJob,
  deps: DevelopmentExecutionDeps,
): Promise<DevelopmentExecutionResult> {
  const heartbeat =
    deps.heartbeat ?? heartbeatDevelopmentJob;

  const intervalMs =
    deps.heartbeatIntervalMs ??
    DEFAULT_HEARTBEAT_INTERVAL_MS;

  if (
    !Number.isFinite(intervalMs) ||
    intervalMs <= 0
  ) {
    throw new Error(
      'DEVELOPMENT_HEARTBEAT_INTERVAL_INVALID',
    );
  }

  // Confirma ownership antes de iniciar qualquer execução externa.
  const initiallyOwned = await heartbeat(
    deps.worker,
    job.id,
  );

  if (!initiallyOwned) {
    return { status: 'OWNERSHIP_LOST' };
  }

  const abortController = new AbortController();

  let stopped = false;
  let ownershipLost = false;
  let heartbeatError: unknown;
  let executionError: unknown;

  let timer:
    | ReturnType<typeof setTimeout>
    | null = null;

  let heartbeatInFlight:
    | Promise<void>
    | null = null;

  const scheduleHeartbeat = () => {
    if (stopped || ownershipLost || heartbeatError) {
      return;
    }

    timer = setTimeout(() => {
      heartbeatInFlight = (async () => {
        try {
          const stillOwned = await heartbeat(
            deps.worker,
            job.id,
          );

          if (!stillOwned) {
            ownershipLost = true;

            abortController.abort(
              new Error(
                'DEVELOPMENT_JOB_OWNERSHIP_LOST',
              ),
            );

            return;
          }

          scheduleHeartbeat();
        } catch (error) {
          heartbeatError = error;

          abortController.abort(
            error instanceof Error
              ? error
              : new Error(
                  'DEVELOPMENT_JOB_HEARTBEAT_FAILED',
                ),
          );
        }
      })().finally(() => {
        heartbeatInFlight = null;
      });
    }, intervalMs);
  };

  scheduleHeartbeat();

  try {
    await deps.execute(
      job,
      abortController.signal,
    );
  } catch (error) {
    executionError = error;
  } finally {
    stopped = true;

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    if (heartbeatInFlight) {
      try {
        await heartbeatInFlight;
      } catch {
        // O erro é tratado abaixo.
      }
    }
  }

  if (heartbeatError) {
    throw heartbeatError;
  }

  if (ownershipLost) {
    return { status: 'OWNERSHIP_LOST' };
  }

  if (executionError) {
    throw executionError;
  }

  // Última verificação antes de permitir finalização do job.
  const finallyOwned = await heartbeat(
    deps.worker,
    job.id,
  );

  if (!finallyOwned) {
    return { status: 'OWNERSHIP_LOST' };
  }

  return { status: 'COMPLETED' };
}
