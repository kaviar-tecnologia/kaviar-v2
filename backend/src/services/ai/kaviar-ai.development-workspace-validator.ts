import { spawn } from 'node:child_process';
import {
  lstat,
  symlink,
  unlink,
} from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

export interface ValidateDevelopmentWorkspaceOptions {
  workspace: string;
  baseBackend: string;
  changedPaths: string[];
  signal?: AbortSignal;
}

function assertInsideWorkspace(
  workspace: string,
  candidate: string,
): void {
  const root = resolve(workspace);
  const target = resolve(candidate);

  if (
    target !== root &&
    !target.startsWith(root + sep)
  ) {
    throw new Error(
      'DEVELOPMENT_WORKSPACE_VALIDATION_PATH_ESCAPE',
    );
  }
}

function runCommand(
  executable: string,
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'test',
        DATABASE_URL:
          process.env.DEVELOPMENT_AGENT_TEST_DATABASE_URL?.trim() ||
          'postgresql://kaviar_test:kaviar_test@127.0.0.1:5432/kaviar_test',
      },
      signal,
    });

    let stderr = '';
    let settled = false;

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (
        stderr + chunk.toString('utf8')
      ).slice(-16_384);
    });

    child.once('error', (error) => {
      rejectOnce(error);
    });

    child.once('close', (code, signalName) => {
      if (settled) return;

      if (code !== 0) {
        rejectOnce(
          new Error(
            `DEVELOPMENT_WORKSPACE_VALIDATION_FAILED` +
              ` code=${String(code)}` +
              ` signal=${String(signalName)}` +
              (stderr.trim()
                ? ` stderr_tail=${stderr
                    .trim()
                    .replace(/\s+/g, ' ')
                    .slice(-2000)}`
                : ''),
          ),
        );
        return;
      }

      settled = true;
      resolvePromise();
    });
  });
}

export async function validateDevelopmentWorkspace(
  options: ValidateDevelopmentWorkspaceOptions,
): Promise<void> {
  const workspace = resolve(options.workspace);
  const baseBackend = resolve(options.baseBackend);

  if (!options.changedPaths.length) {
    throw new Error(
      'DEVELOPMENT_WORKSPACE_VALIDATION_NO_CHANGES',
    );
  }

  const testFiles = options.changedPaths.filter(
    (path) =>
      path.startsWith('backend/tests/') &&
      path.endsWith('.test.ts'),
  );

  if (testFiles.length !== options.changedPaths.length) {
    throw new Error(
      'DEVELOPMENT_WORKSPACE_VALIDATION_UNSUPPORTED_PATH',
    );
  }

  const workspaceBackend = join(
    workspace,
    'backend',
  );

  for (const path of testFiles) {
    assertInsideWorkspace(
      workspace,
      join(workspace, path),
    );
  }

  const baseNodeModules = join(
    baseBackend,
    'node_modules',
  );

  const workspaceNodeModules = join(
    workspaceBackend,
    'node_modules',
  );

  let temporaryNodeModulesLink = false;

  try {
    try {
      await lstat(workspaceNodeModules);

      throw new Error(
        'DEVELOPMENT_WORKSPACE_VALIDATION_NODE_MODULES_ALREADY_EXISTS',
      );
    } catch (error) {
      const code =
        error &&
        typeof error === 'object' &&
        'code' in error
          ? String(error.code)
          : '';

      if (
        error instanceof Error &&
        error.message ===
          'DEVELOPMENT_WORKSPACE_VALIDATION_NODE_MODULES_ALREADY_EXISTS'
      ) {
        throw error;
      }

      if (code !== 'ENOENT') {
        throw error;
      }
    }

    await symlink(
      baseNodeModules,
      workspaceNodeModules,
      'dir',
    );

    temporaryNodeModulesLink = true;

    const vitest = join(
      workspaceNodeModules,
      '.bin',
      'vitest',
    );

    await runCommand(
      vitest,
      [
        'run',
        ...testFiles.map((path) =>
          path.replace(/^backend\//, ''),
        ),
      ],
      workspaceBackend,
      options.signal,
    );
  } finally {
    if (temporaryNodeModulesLink) {
      await unlink(workspaceNodeModules);
    }
  }
}
