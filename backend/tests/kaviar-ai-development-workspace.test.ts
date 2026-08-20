import { EventEmitter } from 'node:events';

import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const { spawnMock } = vi.hoisted(() => ({
  spawnMock: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

import {
  prepareDevelopmentWorkspace,
} from '../src/services/ai/kaviar-ai.development-workspace';

const JOB_ID =
  '49a0caa0-97ad-442c-aa5f-5228ea28b83c';

const OTHER_JOB_ID =
  'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

function makeChild() {
  const child = new EventEmitter() as any;

  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = vi.fn();

  return child;
}

function baseOptions() {
  return {
    jobId: JOB_ID,
    scriptPath:
      '/opt/kaviar/prepare_workspace.py',
    baseRepo:
      '/home/ubuntu/kaviar-workspaces/kaviar-v2',
    jobsRoot:
      '/home/ubuntu/kaviar-agent-jobs',
    sourceBranch:
      'agent/dev-agent-phase4-openhands-execution',
  };
}

function emitSuccess(
  child: any,
  overrides: Record<string, unknown> = {},
) {
  const output = {
    job_id: JOB_ID,
    workspace:
      `/home/ubuntu/kaviar-agent-jobs/${JOB_ID}`,
    branch: 'agent/job-49a0caa097ad',
    head:
      'f91f291012345678901234567890123456789012',
    shallow: 'true',
    ...overrides,
  };

  child.stdout.emit(
    'data',
    Buffer.from(JSON.stringify(output)),
  );

  child.emit('close', 0, null);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('KAVIAR AI — Development workspace bridge', () => {
  it('spawns Python without shell and with a minimal credential-free environment', async () => {
    const child = makeChild();

    spawnMock.mockReturnValue(child);

    process.env.DATABASE_URL =
      'postgresql://secret-production';
    process.env.GEMINI_API_KEY = 'secret-gemini';
    process.env.AWS_SECRET_ACCESS_KEY = 'secret-aws';
    process.env.GITHUB_TOKEN = 'secret-github';

    const promise =
      prepareDevelopmentWorkspace(
        baseOptions(),
      );

    expect(spawnMock).toHaveBeenCalledOnce();

    const [
      executable,
      args,
      spawnOptions,
    ] = spawnMock.mock.calls[0];

    expect(executable).toBe('python3');

    expect(args).toEqual([
      '/opt/kaviar/prepare_workspace.py',
      '--job-id',
      JOB_ID,
      '--base-repo',
      '/home/ubuntu/kaviar-workspaces/kaviar-v2',
      '--jobs-root',
      '/home/ubuntu/kaviar-agent-jobs',
      '--source-branch',
      'agent/dev-agent-phase4-openhands-execution',
    ]);

    expect(spawnOptions.shell).toBe(false);

    expect(
      spawnOptions.env.DATABASE_URL,
    ).toBeUndefined();

    expect(
      spawnOptions.env.GEMINI_API_KEY,
    ).toBeUndefined();

    expect(
      spawnOptions.env.AWS_SECRET_ACCESS_KEY,
    ).toBeUndefined();

    expect(
      spawnOptions.env.GITHUB_TOKEN,
    ).toBeUndefined();

    expect(
      spawnOptions.env.GIT_CONFIG_GLOBAL,
    ).toBe('/dev/null');

    emitSuccess(child);

    await expect(promise).resolves.toEqual({
      jobId: JOB_ID,
      workspace:
        `/home/ubuntu/kaviar-agent-jobs/${JOB_ID}`,
      branch: 'agent/job-49a0caa097ad',
      head:
        'f91f291012345678901234567890123456789012',
      shallow: true,
    });
  });

  it('rejects invalid JSON from the preparer', async () => {
    const child = makeChild();

    spawnMock.mockReturnValue(child);

    const promise =
      prepareDevelopmentWorkspace(
        baseOptions(),
      );

    child.stdout.emit(
      'data',
      Buffer.from('not-json'),
    );

    child.emit('close', 0, null);

    await expect(promise).rejects.toThrow(
      'DEVELOPMENT_WORKSPACE_INVALID_JSON',
    );
  });

  it('rejects a different job id returned by the preparer', async () => {
    const child = makeChild();

    spawnMock.mockReturnValue(child);

    const promise =
      prepareDevelopmentWorkspace(
        baseOptions(),
      );

    emitSuccess(child, {
      job_id: OTHER_JOB_ID,
      workspace:
        `/home/ubuntu/kaviar-agent-jobs/${OTHER_JOB_ID}`,
    });

    await expect(promise).rejects.toThrow(
      'DEVELOPMENT_WORKSPACE_JOB_ID_MISMATCH',
    );
  });

  it('rejects a workspace path outside the expected job directory', async () => {
    const child = makeChild();

    spawnMock.mockReturnValue(child);

    const promise =
      prepareDevelopmentWorkspace(
        baseOptions(),
      );

    emitSuccess(child, {
      workspace:
        '/home/ubuntu/kaviar-agent-jobs/other',
    });

    await expect(promise).rejects.toThrow(
      'DEVELOPMENT_WORKSPACE_PATH_MISMATCH',
    );
  });

  it('rejects an invalid agent branch', async () => {
    const child = makeChild();

    spawnMock.mockReturnValue(child);

    const promise =
      prepareDevelopmentWorkspace(
        baseOptions(),
      );

    emitSuccess(child, {
      branch: 'main',
    });

    await expect(promise).rejects.toThrow(
      'DEVELOPMENT_WORKSPACE_BRANCH_INVALID',
    );
  });
});
