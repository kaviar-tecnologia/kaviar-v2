import {
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import {
  publishDevelopmentJobResult,
} from '../src/services/ai/kaviar-ai.development-publish-orchestrator';

const candidate = {
  jobId:
    '58c23364-361f-45a8-8e7e-f98e07f58be3',
  workspace:
    '/home/ubuntu/kaviar-agent-runtime/jobs/58c23364/workspace',
  resultBranch:
    'agent/job-58c23364361f',
  resultCommitSha:
    'afc5b93315d729e112f39403244e6f775d243e30',
  changedPaths: [
    'backend/tests/example.test.ts',
  ],
};

describe(
  'development publish orchestrator',
  () => {
    it(
      'rejects incomplete job result before credentials',
      async () => {
        const getConfig = vi.fn();

        await expect(
          publishDevelopmentJobResult(
            {
              ...candidate,
              resultCommitSha: undefined,
            },
            {
              getConfig: getConfig as any,
            },
          ),
        ).rejects.toThrow(
          'DEVELOPMENT_PUBLISH_RESULT_INCOMPLETE',
        );

        expect(
          getConfig,
        ).not.toHaveBeenCalled();
      },
    );

    it(
      'gets temporary credentials and publishes exact result',
      async () => {
        const config = {
          appId: '123',
          installationId: '456',
          privateKeyPath:
            '/tmp/private-key.pem',
          repository:
            'usbtecnok/kaviar-v2',
        };

        const getConfig =
          vi.fn(() => config);

        const getCredentials =
          vi.fn(async () => ({
            repositoryUrl:
              'https://github.com/usbtecnok/kaviar-v2.git',
            installationToken:
              'temporary-token',
          }));

        const publish =
          vi.fn(async () => ({
            jobId: candidate.jobId,
            branch:
              candidate.resultBranch,
            commitSha:
              candidate.resultCommitSha,
            remoteSha:
              candidate.resultCommitSha,
            status:
              'PUBLISHED' as const,
          }));

        const result =
          await publishDevelopmentJobResult(
            candidate,
            {
              getConfig:
                getConfig as any,
              getCredentials:
                getCredentials as any,
              publish:
                publish as any,
            },
          );

        expect(
          getCredentials,
        ).toHaveBeenCalledWith(config);

        expect(
          publish,
        ).toHaveBeenCalledWith(
          {
            jobId: candidate.jobId,
            workspace:
              candidate.workspace,
            branch:
              candidate.resultBranch,
            commitSha:
              candidate.resultCommitSha,
            changedPaths:
              candidate.changedPaths,
          },
          {
            repositoryUrl:
              'https://github.com/usbtecnok/kaviar-v2.git',
            installationToken:
              'temporary-token',
          },
        );

        expect(result.status).toBe(
          'PUBLISHED',
        );
      },
    );

    it(
      'propagates publisher failure',
      async () => {
        const publish =
          vi.fn(async () => {
            throw new Error(
              'DEVELOPMENT_PUBLISH_GIT_FAILED',
            );
          });

        await expect(
          publishDevelopmentJobResult(
            candidate,
            {
              getConfig:
                (() => ({
                  appId: '123',
                  installationId: '456',
                  privateKeyPath:
                    '/tmp/key.pem',
                  repository:
                    'usbtecnok/kaviar-v2',
                })) as any,

              getCredentials:
                (async () => ({
                  repositoryUrl:
                    'https://github.com/usbtecnok/kaviar-v2.git',
                  installationToken:
                    'temporary-token',
                })) as any,

              publish:
                publish as any,
            },
          ),
        ).rejects.toThrow(
          'DEVELOPMENT_PUBLISH_GIT_FAILED',
        );
      },
    );
  },
);
