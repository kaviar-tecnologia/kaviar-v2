import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  commitDevelopmentWorkspace,
} from '../src/services/ai/kaviar-ai.development-workspace-committer';

describe('commitDevelopmentWorkspace', () => {
  it('rejeita configuração incompleta', async () => {
    await expect(
      commitDevelopmentWorkspace({
        jobId: '',
        jobsRoot: '/tmp/jobs',
        scriptPath: '/tmp/commit.py',
        allowedPaths: [
          'backend/tests/example.test.ts',
        ],
      }),
    ).rejects.toThrow(
      'DEVELOPMENT_COMMIT_CONFIG_REQUIRED',
    );
  });

  it('rejeita lista vazia de allowed paths', async () => {
    await expect(
      commitDevelopmentWorkspace({
        jobId:
          '49a0caa0-97ad-442c-aa5f-5228ea28b83c',
        jobsRoot: '/tmp/jobs',
        scriptPath: '/tmp/commit.py',
        allowedPaths: [],
      }),
    ).rejects.toThrow(
      'DEVELOPMENT_COMMIT_CONFIG_REQUIRED',
    );
  });
});
