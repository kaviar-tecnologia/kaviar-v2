import { readFile } from 'node:fs/promises';
import { createSign } from 'node:crypto';

export interface DevelopmentGitHubAppConfig {
  appId: string;
  installationId: string;
  privateKeyPath: string;
  repository: string;
}

export interface DevelopmentGitHubCredentials {
  repositoryUrl: string;
  installationToken: string;
}

interface GitHubTokenResponse {
  token?: unknown;
}

function encodeBase64Url(
  value: string,
): string {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createGitHubAppJwt(
  appId: string,
  privateKey: string,
): string {
  const now =
    Math.floor(Date.now() / 1000);

  const header = encodeBase64Url(
    JSON.stringify({
      alg: 'RS256',
      typ: 'JWT',
    }),
  );

  const payload = encodeBase64Url(
    JSON.stringify({
      iat: now - 60,
      exp: now + 540,
      iss: appId,
    }),
  );

  const unsigned =
    `${header}.${payload}`;

  const signer =
    createSign('RSA-SHA256');

  signer.update(unsigned);
  signer.end();

  const signature =
    signer
      .sign(privateKey)
      .toString('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

  return `${unsigned}.${signature}`;
}

export function getDevelopmentGitHubAppConfig(
  env: NodeJS.ProcessEnv = process.env,
): DevelopmentGitHubAppConfig {
  const appId =
    env.GITHUB_APP_ID?.trim() ?? '';

  const installationId =
    env.GITHUB_APP_INSTALLATION_ID?.trim() ??
    '';

  const privateKeyPath =
    env.GITHUB_APP_PRIVATE_KEY_PATH?.trim() ??
    '';

  const repository =
    env.GITHUB_REPOSITORY?.trim() ?? '';

  if (
    !appId ||
    !installationId ||
    !privateKeyPath ||
    !repository
  ) {
    throw new Error(
      'DEVELOPMENT_GITHUB_APP_CONFIG_REQUIRED',
    );
  }

  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(
      repository,
    )
  ) {
    throw new Error(
      'DEVELOPMENT_GITHUB_REPOSITORY_INVALID',
    );
  }

  return {
    appId,
    installationId,
    privateKeyPath,
    repository,
  };
}

export async function getDevelopmentGitHubCredentials(
  config: DevelopmentGitHubAppConfig,
): Promise<DevelopmentGitHubCredentials> {
  const privateKey =
    await readFile(
      config.privateKeyPath,
      'utf8',
    );

  const jwt =
    createGitHubAppJwt(
      config.appId,
      privateKey,
    );

  const response = await fetch(
    `https://api.github.com/app/installations/` +
      `${encodeURIComponent(
        config.installationId,
      )}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept:
          'application/vnd.github+json',
        'X-GitHub-Api-Version':
          '2022-11-28',
        'User-Agent':
          'KAVIAR-Development-Agent',
      },
    },
  );

  if (!response.ok) {
    throw new Error(
      `DEVELOPMENT_GITHUB_TOKEN_FAILED:${response.status}`,
    );
  }

  const body =
    (await response.json()) as GitHubTokenResponse;

  if (
    typeof body.token !== 'string' ||
    !body.token.trim()
  ) {
    throw new Error(
      'DEVELOPMENT_GITHUB_TOKEN_INVALID',
    );
  }

  return {
    repositoryUrl:
      `https://github.com/${config.repository}.git`,
    installationToken:
      body.token.trim(),
  };
}
