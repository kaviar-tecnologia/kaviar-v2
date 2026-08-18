import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import type {
  ClaimedDevelopmentJob,
} from '../src/services/ai/kaviar-ai.development-worker';
import {
  executeDevelopmentJobWithHeartbeat,
} from '../src/services/ai/kaviar-ai.development-execution';

function makeJob(): ClaimedDevelopmentJob {
  return {
    id: 'job-1',
    category: 'BUG_FIX',
    summary: 'Corrigir bug no backend',
    status: 'RUNNING',
    attempts: 1,
    lockedBy: 'worker-a',
    startedAt: new Date('2026-08-18T10:00:00Z'),
    lockedAt: new Date('2026-08-18T10:00:01Z'),
  };
}

const worker = {
  pool: {} as any,
  workerId: 'worker-a',
};

afterEach(() => {
  vi.useRealTimers();
});

describe('KAVIAR AI — Development execution heartbeat', () => {
  it('does not execute when ownership is already lost', async () => {
    const heartbeat = vi.fn(async () => false);
    const execute = vi.fn(async () => {});

    const result = await executeDevelopmentJobWithHeartbeat(
      makeJob(),
      {
        worker,
        heartbeat,
        execute,
        heartbeatIntervalMs: 100,
      },
    );

    expect(result).toEqual({
      status: 'OWNERSHIP_LOST',
    });
    expect(execute).not.toHaveBeenCalled();
    expect(heartbeat).toHaveBeenCalledOnce();
  });

  it('completes only after final ownership verification', async () => {
    const heartbeat = vi.fn(async () => true);
    const execute = vi.fn(async () => {});

    const result = await executeDevelopmentJobWithHeartbeat(
      makeJob(),
      {
        worker,
        heartbeat,
        execute,
        heartbeatIntervalMs: 60_000,
      },
    );

    expect(result).toEqual({
      status: 'COMPLETED',
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(heartbeat).toHaveBeenCalledTimes(2);
  });

  it('aborts execution when ownership is lost during heartbeat', async () => {
    vi.useFakeTimers();

    const heartbeat = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const execute = vi.fn(
      async (
        _job: ClaimedDevelopmentJob,
        signal: AbortSignal,
      ) => {
        await new Promise<void>((resolve) => {
          signal.addEventListener(
            'abort',
            () => resolve(),
            { once: true },
          );
        });

        expect(signal.aborted).toBe(true);
      },
    );

    const running =
      executeDevelopmentJobWithHeartbeat(
        makeJob(),
        {
          worker,
          heartbeat,
          execute,
          heartbeatIntervalMs: 100,
        },
      );

    await vi.advanceTimersByTimeAsync(100);

    const result = await running;

    expect(result).toEqual({
      status: 'OWNERSHIP_LOST',
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(heartbeat).toHaveBeenCalledTimes(2);
  });

  it('rejects an invalid heartbeat interval before execution', async () => {
    const heartbeat = vi.fn(async () => true);
    const execute = vi.fn(async () => {});

    await expect(
      executeDevelopmentJobWithHeartbeat(
        makeJob(),
        {
          worker,
          heartbeat,
          execute,
          heartbeatIntervalMs: 0,
        },
      ),
    ).rejects.toThrow(
      'DEVELOPMENT_HEARTBEAT_INTERVAL_INVALID',
    );

    expect(heartbeat).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });
});
