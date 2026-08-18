import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type {
  ClaimedDevelopmentJob,
} from '../src/services/ai/kaviar-ai.development-worker';

import {
  runDevelopmentJobLifecycle,
} from '../src/services/ai/kaviar-ai.development-lifecycle';

function makeJob(): ClaimedDevelopmentJob {
  return {
    id: 'job-lifecycle',
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

describe('KAVIAR AI — Development job lifecycle', () => {
  it('finalizes SUCCEEDED after a completed owned execution', async () => {
    const runWithHeartbeat = vi.fn(async () => ({
      status: 'COMPLETED' as const,
    }));

    const finalize = vi.fn(async () => true);
    const execute = vi.fn(async () => {});

    const result = await runDevelopmentJobLifecycle(
      makeJob(),
      {
        worker,
        execute,
        runWithHeartbeat,
        finalize,
      },
    );

    expect(result).toEqual({
      status: 'SUCCEEDED',
    });

    expect(finalize).toHaveBeenCalledOnce();
    expect(finalize).toHaveBeenCalledWith(
      worker,
      'job-lifecycle',
      'SUCCEEDED',
    );
  });

  it('finalizes FAILED when execution throws while ownership remains valid', async () => {
    const failure = new Error('agent failed');

    const runWithHeartbeat = vi.fn(async () => {
      throw failure;
    });

    const finalize = vi.fn(async () => true);
    const execute = vi.fn(async () => {});

    const result = await runDevelopmentJobLifecycle(
      makeJob(),
      {
        worker,
        execute,
        runWithHeartbeat,
        finalize,
      },
    );

    expect(result).toEqual({
      status: 'FAILED',
      error: failure,
    });

    expect(finalize).toHaveBeenCalledOnce();
    expect(finalize).toHaveBeenCalledWith(
      worker,
      'job-lifecycle',
      'FAILED',
    );
  });

  it('does not finalize when ownership was lost during execution', async () => {
    const runWithHeartbeat = vi.fn(async () => ({
      status: 'OWNERSHIP_LOST' as const,
    }));

    const finalize = vi.fn(async () => true);
    const execute = vi.fn(async () => {});

    const result = await runDevelopmentJobLifecycle(
      makeJob(),
      {
        worker,
        execute,
        runWithHeartbeat,
        finalize,
      },
    );

    expect(result).toEqual({
      status: 'OWNERSHIP_LOST',
    });

    expect(finalize).not.toHaveBeenCalled();
  });

  it('returns OWNERSHIP_LOST when final CAS no longer belongs to this worker', async () => {
    const runWithHeartbeat = vi.fn(async () => ({
      status: 'COMPLETED' as const,
    }));

    const finalize = vi.fn(async () => false);
    const execute = vi.fn(async () => {});

    const result = await runDevelopmentJobLifecycle(
      makeJob(),
      {
        worker,
        execute,
        runWithHeartbeat,
        finalize,
      },
    );

    expect(result).toEqual({
      status: 'OWNERSHIP_LOST',
    });

    expect(finalize).toHaveBeenCalledWith(
      worker,
      'job-lifecycle',
      'SUCCEEDED',
    );
  });
});
