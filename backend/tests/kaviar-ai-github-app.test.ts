import {
  describe,
  expect,
  it,
} from 'vitest';

import {
  getDevelopmentGitHubAppConfig,
} from '../src/services/ai/kaviar-ai.github-app';

describe(
  'development github app',
  () => {
    it(
      'loads required configuration',
      () => {
        const config =
          getDevelopmentGitHubAppConfig({
            GITHUB_APP_ID: '123',
            GITHUB_APP_INSTALLATION_ID:
              '456',
            GITHUB_APP_PRIVATE_KEY_PATH:
              '/tmp/private-key.pem',
            GITHUB_REPOSITORY:
              'usbtecnok/kaviar-v2',
          });

        expect(config).toEqual({
          appId: '123',
          installationId: '456',
          privateKeyPath:
            '/tmp/private-key.pem',
          repository:
            'usbtecnok/kaviar-v2',
        });
      },
    );

    it(
      'fails closed when configuration is missing',
      () => {
        expect(() =>
          getDevelopmentGitHubAppConfig(
            {},
          ),
        ).toThrow(
          'DEVELOPMENT_GITHUB_APP_CONFIG_REQUIRED',
        );
      },
    );

    it(
      'rejects invalid repository names',
      () => {
        expect(() =>
          getDevelopmentGitHubAppConfig({
            GITHUB_APP_ID: '123',
            GITHUB_APP_INSTALLATION_ID:
              '456',
            GITHUB_APP_PRIVATE_KEY_PATH:
              '/tmp/private-key.pem',
            GITHUB_REPOSITORY:
              'invalid',
          }),
        ).toThrow(
          'DEVELOPMENT_GITHUB_REPOSITORY_INVALID',
        );
      },
    );
  },
);
