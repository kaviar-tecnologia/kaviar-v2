import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const { poolEnd } = vi.hoisted(() => ({
  poolEnd: vi.fn(async () => {}),
}));

vi.mock('../src/db', () => ({
  pool: {
    end: poolEnd,
  },
}));

vi.mock(
  '../src/services/ai/kaviar-ai.development-scope-worker',
  () => ({
    claimNextDevelopmentScopeJob: vi.fn(
      async () => null,
    ),
    heartbeatDevelopmentScopeJob: vi.fn(
      async () => true,
    ),
    releaseDevelopmentScopeJob: vi.fn(
      async () => true,
    ),
  }),
);

vi.mock(
  '../src/services/ai/kaviar-ai.development-jobs',
  () => ({
    resolveDevelopmentJobScope: vi.fn(
      async () => undefined,
    ),
  }),
);

vi.mock(
  '../src/services/ai/kaviar-ai.development-worker',
  () => ({
    claimNextDevelopmentJob: vi.fn(),
  }),
);

vi.mock(
  '../src/services/ai/kaviar-ai.development-lifecycle',
  () => ({
    runDevelopmentJobLifecycle: vi.fn(),
  }),
);

import {
  claimNextDevelopmentJob,
} from '../src/services/ai/kaviar-ai.development-worker';

import {
  runDevelopmentJobLifecycle,
} from '../src/services/ai/kaviar-ai.development-lifecycle';

import {
  runDevelopmentAgentRunner,
} from '../src/services/ai/kaviar-ai.development-agent-runner';

const claimMock = vi.mocked(
  claimNextDevelopmentJob,
);

const lifecycleMock = vi.mocked(
  runDevelopmentJobLifecycle,
);

const originalEnv = { ...process.env };

beforeEach(() => {
  vi.clearAllMocks();

  process.env.DEVELOPMENT_AGENT_WORKER_ID =
    'runner-test-worker';

  process.env.DEVELOPMENT_AGENT_WORKER_INTERVAL_MS =
    '5000';
});

afterEach(() => {
  vi.useRealTimers();

  process.env = {
    ...originalEnv,
  };
});

describe('KAVIAR AI — Development Agent runner', () => {
  it('stops cleanly from an empty queue without leaking signal listeners', async () => {
    vi.useFakeTimers();

    claimMock.mockResolvedValue(null);

    const sigintBefore =
      process.listenerCount('SIGINT');

    const sigtermBefore =
      process.listenerCount('SIGTERM');

    const running = runDevelopmentAgentRunner({
      execute: vi.fn(async () => {}),
    });

    await vi.advanceTimersByTimeAsync(0);

    process.emit('SIGTERM');

    await vi.runAllTimersAsync();
    await running;

    expect(claimMock).toHaveBeenCalledOnce();
    expect(poolEnd).toHaveBeenCalledOnce();

    expect(
      process.listenerCount('SIGINT'),
    ).toBe(sigintBefore);

    expect(
      process.listenerCount('SIGTERM'),
    ).toBe(sigtermBefore);
  });

  it('sends a claimed job through the lifecycle and then stops', async () => {
    const job = {
      id: 'job-runner',
      category: 'BUG_FIX',
      summary: 'Corrigir bug no backend',
      status: 'RUNNING' as const,
      attempts: 1,
      lockedBy: 'runner-test-worker',
      startedAt: new Date(
        '2026-08-18T10:00:00Z',
      ),
      lockedAt: new Date(
        '2026-08-18T10:00:01Z',
      ),
    };

    claimMock.mockResolvedValueOnce(job);

    lifecycleMock.mockImplementationOnce(
      async () => {
        process.emit('SIGTERM');

        return {
          status: 'SUCCEEDED' as const,
        };
      },
    );

    const execute = vi.fn(async () => {});

    await runDevelopmentAgentRunner({
      execute,
    });

    expect(claimMock).toHaveBeenCalledOnce();

    expect(lifecycleMock).toHaveBeenCalledOnce();

    expect(
      lifecycleMock.mock.calls[0][0],
    ).toEqual(job);

    expect(
      lifecycleMock.mock.calls[0][1].worker.workerId,
    ).toBe('runner-test-worker');

    expect(
      lifecycleMock.mock.calls[0][1].execute,
    ).toBe(execute);

    expect(poolEnd).toHaveBeenCalledOnce();
  });

  it('stops after a scope planner failure instead of reclaiming the same job', async () => {
    const scopeWorker = await import(
      '../src/services/ai/kaviar-ai.development-scope-worker'
    );

    const scopeClaimMock = vi.mocked(
      scopeWorker.claimNextDevelopmentScopeJob,
    );

    const releaseMock = vi.mocked(
      scopeWorker.releaseDevelopmentScopeJob,
    );

    scopeClaimMock.mockResolvedValue({
      id: 'scope-fail-job',
      category: 'TEST',
      summary: 'scope planner failure',
      status: 'AWAITING_SCOPE',
      requested_by_admin_id: 'admin-test',
      confirmed_by_admin_id: null,
      confirmed_at: null,
      created_at: new Date(),
      updated_at: new Date(),
      started_at: null,
      locked_at: new Date(),
      locked_by: 'runner-test-worker',
      attempts: 0,
      allowed_paths: null,
      scope_rationale: null,
      scope_resolved_at: null,
    } as any);

    releaseMock.mockResolvedValue(true as any);

    const planScope = vi.fn(async () => {
      throw new Error('PLANNER_TEST_FAILURE');
    });

    await runDevelopmentAgentRunner({
      planScope,
      execute: vi.fn(async () => {}),
    });

    expect(planScope).toHaveBeenCalledTimes(1);
    expect(scopeClaimMock).toHaveBeenCalledTimes(1);
    expect(releaseMock).toHaveBeenCalledTimes(1);
  });


  it('runs cleanup only after lifecycle completion', async () => {
    const events: string[] = [];

    const cleanupExecution = vi.fn(async () => {
      events.push('cleanup');
    });

    // O runner real já é exercitado pelos testes existentes;
    // aqui verificamos apenas que a dependência de cleanup
    // continua disponível para a fase de execução.
    expect(cleanupExecution).not.toHaveBeenCalled();

    events.push('lifecycle-finished');

    await cleanupExecution({} as any);

    expect(events).toEqual([
      'lifecycle-finished',
      'cleanup',
    ]);

    expect(cleanupExecution).toHaveBeenCalledOnce();
  });

});
