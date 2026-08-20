import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'node:child_process';
import {
  publishDevelopmentCommit,
} from '../src/services/ai/kaviar-ai.development-publisher';

function fakeChild(
  code: number,
  stdout = '',
  stderr = '',
) {
  const handlers: Record<string, Function> = {};

  const stream = () => ({
    on: (
      event: string,
      cb: Function,
    ) => {
      if (event === 'data') {
        handlers[
          `data-${Math.random()}`
        ] = cb;
      }
    },
  });

  const child: any = {
    stdout: stream(),
    stderr: stream(),
    once: (
      event: string,
      cb: Function,
    ) => {
      if (event === 'close') {
        queueMicrotask(() => cb(code));
      }
    },
  };

  if (stdout) {
    child.stdout.on = (
      event: string,
      cb: Function,
    ) => {
      if (event === 'data') {
        queueMicrotask(() =>
          cb(Buffer.from(stdout)),
        );
      }
    };
  }

  if (stderr) {
    child.stderr.on = (
      event: string,
      cb: Function,
    ) => {
      if (event === 'data') {
        queueMicrotask(() =>
          cb(Buffer.from(stderr)),
        );
      }
    };
  }

  return child;
}

const baseInput = {
  jobId:
    '58c23364-361f-45a8-8e7e-f98e07f58be3',
  workspace: '/tmp/job',
  branch: 'agent/job-58c23364361f',
  commitSha:
    'afc5b93315d729e112f39403244e6f775d243e30',
  changedPaths: [
    'backend/tests/example.test.ts',
  ],
};

describe('development publisher', () => {
  it(
    'rejects workflow changes before git push',
    async () => {
      await expect(
        publishDevelopmentCommit(
          {
            ...baseInput,
            changedPaths: [
              '.github/workflows/deploy.yml',
            ],
          },
          {
            repositoryUrl:
              'https://github.com/usbtecnok/kaviar-v2.git',
            installationToken: 'token',
          },
        ),
      ).rejects.toThrow(
        'DEVELOPMENT_PUBLISH_PATH_FORBIDDEN',
      );

      expect(spawn).not.toHaveBeenCalled();
    },
  );

  it(
    'rejects non-agent branches',
    async () => {
      await expect(
        publishDevelopmentCommit(
          {
            ...baseInput,
            branch: 'main',
          },
          {
            repositoryUrl:
              'https://github.com/usbtecnok/kaviar-v2.git',
            installationToken: 'token',
          },
        ),
      ).rejects.toThrow(
        'DEVELOPMENT_PUBLISH_BRANCH_FORBIDDEN',
      );
    },
  );

  it(
    'rejects when real commit paths differ from declared paths',
    async () => {
      vi.mocked(spawn).mockReturnValueOnce(
        fakeChild(
          0,
          'backend/src/unexpected.ts\n',
        ) as any,
      );

      await expect(
        publishDevelopmentCommit(
          baseInput,
          {
            repositoryUrl:
              'https://github.com/usbtecnok/kaviar-v2.git',
            installationToken: 'token',
          },
        ),
      ).rejects.toThrow(
        'DEVELOPMENT_PUBLISH_COMMIT_PATH_MISMATCH',
      );

      expect(spawn).toHaveBeenCalledTimes(1);
    },
  );

  it(
    'fails closed when git push fails',
    async () => {
      vi.mocked(spawn)
        .mockReturnValueOnce(
          fakeChild(
            0,
            'backend/tests/example.test.ts\n',
          ) as any,
        )
        .mockReturnValueOnce(
          fakeChild(
            1,
            '',
            'remote rejected',
          ) as any,
        );

      await expect(
        publishDevelopmentCommit(
          baseInput,
          {
            repositoryUrl:
              'https://github.com/usbtecnok/kaviar-v2.git',
            installationToken: 'token',
          },
        ),
      ).rejects.toThrow(
        'DEVELOPMENT_PUBLISH_GIT_FAILED',
      );
    },
  );

  it(
    'validates remote sha after push',
    async () => {
      vi.mocked(spawn)
        .mockReturnValueOnce(
          fakeChild(
            0,
            'backend/tests/example.test.ts\n',
          ) as any,
        )
        .mockReturnValueOnce(
          fakeChild(0) as any,
        )
        .mockReturnValueOnce(
          fakeChild(
            0,
            `${baseInput.commitSha}\trefs/heads/${baseInput.branch}\n`,
          ) as any,
        );

      const result =
        await publishDevelopmentCommit(
          baseInput,
          {
            repositoryUrl:
              'https://github.com/usbtecnok/kaviar-v2.git',
            installationToken: 'token',
          },
        );

      expect(result.status).toBe(
        'PUBLISHED',
      );

      expect(result.remoteSha).toBe(
        baseInput.commitSha,
      );
    },
  );
});
