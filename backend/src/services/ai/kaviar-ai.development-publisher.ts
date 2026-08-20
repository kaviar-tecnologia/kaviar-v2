import { spawn } from 'node:child_process';

const FORBIDDEN_PATH_PREFIXES = [
  '.github/workflows/',
];

export interface DevelopmentPublishInput {
  jobId: string;
  workspace: string;
  branch: string;
  commitSha: string;
  changedPaths: string[];
}

export interface DevelopmentPublishResult {
  jobId: string;
  branch: string;
  commitSha: string;
  remoteSha: string;
  status: 'PUBLISHED';
}

export interface DevelopmentPublisherDeps {
  repositoryUrl: string;
  installationToken: string;
}

function validatePublishInput(
  input: DevelopmentPublishInput,
): void {
  if (
    !input.jobId.trim() ||
    !input.workspace.trim() ||
    !input.branch.trim() ||
    !/^[0-9a-f]{40}$/i.test(input.commitSha) ||
    !input.changedPaths.length
  ) {
    throw new Error(
      'DEVELOPMENT_PUBLISH_INVALID_INPUT',
    );
  }

  if (
    !input.branch.startsWith('agent/job-')
  ) {
    throw new Error(
      'DEVELOPMENT_PUBLISH_BRANCH_FORBIDDEN',
    );
  }

  for (const path of input.changedPaths) {
    const normalized = path
      .replace(/\\/g, '/')
      .replace(/^\.\/+/, '');

    if (
      FORBIDDEN_PATH_PREFIXES.some(
        (prefix) =>
          normalized.startsWith(prefix),
      )
    ) {
      throw new Error(
        'DEVELOPMENT_PUBLISH_PATH_FORBIDDEN',
      );
    }
  }
}

function runGit(
  args: string[],
  options: {
    cwd: string;
    env?: NodeJS.ProcessEnv;
  },
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'git',
      args,
      {
        cwd: options.cwd,
        env: options.env ?? process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.once('error', reject);

    child.once('close', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `DEVELOPMENT_PUBLISH_GIT_FAILED: ${
              stderr.trim() || `exit ${code}`
            }`,
          ),
        );
        return;
      }

      resolve(stdout.trim());
    });
  });
}

export async function publishDevelopmentCommit(
  input: DevelopmentPublishInput,
  deps: DevelopmentPublisherDeps,
): Promise<DevelopmentPublishResult> {
  validatePublishInput(input);

  const repositoryUrl =
    deps.repositoryUrl.trim();

  const installationToken =
    deps.installationToken.trim();

  if (
    !repositoryUrl ||
    !installationToken
  ) {
    throw new Error(
      'DEVELOPMENT_PUBLISH_CONFIG_REQUIRED',
    );
  }

  const authenticatedUrl =
    repositoryUrl.replace(
      /^https:\/\//,
      `https://x-access-token:${encodeURIComponent(
        installationToken,
      )}@`,
    );

  const commitPathsOutput = await runGit(
    [
      'diff-tree',
      '--no-commit-id',
      '--name-only',
      '-r',
      input.commitSha,
    ],
    {
      cwd: input.workspace,
    },
  );

  const commitPaths = commitPathsOutput
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean)
    .sort();

  const declaredPaths = input.changedPaths
    .map((path) =>
      path
        .replace(/\\/g, '/')
        .replace(/^\.\/+/, ''),
    )
    .sort();

  if (
    commitPaths.length !== declaredPaths.length ||
    commitPaths.some(
      (path, index) =>
        path !== declaredPaths[index],
    )
  ) {
    throw new Error(
      'DEVELOPMENT_PUBLISH_COMMIT_PATH_MISMATCH',
    );
  }

  for (const path of commitPaths) {
    if (
      FORBIDDEN_PATH_PREFIXES.some(
        (prefix) =>
          path.startsWith(prefix),
      )
    ) {
      throw new Error(
        'DEVELOPMENT_PUBLISH_PATH_FORBIDDEN',
      );
    }
  }

  const ref =
    `refs/heads/${input.branch}`;

  await runGit(
    [
      'push',
      authenticatedUrl,
      `${input.commitSha}:${ref}`,
    ],
    {
      cwd: input.workspace,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
      },
    },
  );

  const remoteOutput = await runGit(
    [
      'ls-remote',
      authenticatedUrl,
      ref,
    ],
    {
      cwd: input.workspace,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
      },
    },
  );

  const remoteSha =
    remoteOutput.split(/\s+/)[0] ?? '';

  if (
    remoteSha.toLowerCase() !==
    input.commitSha.toLowerCase()
  ) {
    throw new Error(
      'DEVELOPMENT_PUBLISH_REMOTE_SHA_MISMATCH',
    );
  }

  return {
    jobId: input.jobId,
    branch: input.branch,
    commitSha: input.commitSha,
    remoteSha,
    status: 'PUBLISHED',
  };
}
