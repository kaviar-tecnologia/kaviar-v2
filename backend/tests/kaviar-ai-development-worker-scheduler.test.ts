import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock('../src/db', () => ({
  pool: {},
}));

vi.mock('../src/lib/scheduler-lock', () => ({
  withSchedulerLock: vi.fn(),
}));

vi.mock('../src/services/ai/kaviar-ai.development-worker', () => ({
  claimNextDevelopmentJob: vi.fn(),
}));

import {
  startDevelopmentAgentWorkerScheduler,
  stopDevelopmentAgentWorkerScheduler,
} from '../src/services/ai/kaviar-ai.development-worker-scheduler';

const originalEnv = { ...process.env };

beforeEach(async () => {
  await stopDevelopmentAgentWorkerScheduler();

  process.env.NODE_ENV = 'development';
  delete process.env.DEVELOPMENT_AGENT_WORKER_ENABLED;
  delete process.env.DEVELOPMENT_AGENT_WORKER_INTERVAL_MS;
  delete process.env.DEVELOPMENT_AGENT_WORKER_ID;
});

afterEach(async () => {
  await stopDevelopmentAgentWorkerScheduler();

  process.env = {
    ...originalEnv,
  };
});

describe('KAVIAR AI — Development Worker Scheduler Phase 3', () => {
  it('never starts in NODE_ENV=test even when explicitly enabled', () => {
    process.env.NODE_ENV = 'test';
    process.env.DEVELOPMENT_AGENT_WORKER_ENABLED = 'true';

    const started = startDevelopmentAgentWorkerScheduler();

    expect(started).toBe(false);
  });

  it('stays disabled when the explicit enable flag is absent', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.DEVELOPMENT_AGENT_WORKER_ENABLED;

    const started = startDevelopmentAgentWorkerScheduler();

    expect(started).toBe(false);
  });

  it('stays disabled for enable values other than exact true', () => {
    process.env.NODE_ENV = 'development';
    process.env.DEVELOPMENT_AGENT_WORKER_ENABLED = 'TRUE';

    expect(startDevelopmentAgentWorkerScheduler()).toBe(false);

    process.env.DEVELOPMENT_AGENT_WORKER_ENABLED = '1';

    expect(startDevelopmentAgentWorkerScheduler()).toBe(false);
  });

  it('starts only once when explicitly enabled', async () => {
    process.env.NODE_ENV = 'development';
    process.env.DEVELOPMENT_AGENT_WORKER_ENABLED = 'true';
    process.env.DEVELOPMENT_AGENT_WORKER_INTERVAL_MS = '5000';
    process.env.DEVELOPMENT_AGENT_WORKER_ID = 'scheduler-test-worker';

    const first = startDevelopmentAgentWorkerScheduler();
    const second = startDevelopmentAgentWorkerScheduler();

    expect(first).toBe(true);
    expect(second).toBe(false);

    await stopDevelopmentAgentWorkerScheduler();
  });
});
