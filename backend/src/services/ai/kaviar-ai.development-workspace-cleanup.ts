import { spawn } from 'node:child_process';

const MAX_OUTPUT_BYTES = 8 * 1024;

export interface CleanupDevelopmentWorkspaceOptions {
  jobId: string;
  jobsRoot: string;
  scriptPath: string;
  pythonExecutable?: string;
  signal?: AbortSignal;
}

function minimalEnvironment(): NodeJS.ProcessEnv {
  return {
    PATH:
      process.env.PATH ??
      '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    PYTHONUNBUFFERED: '1',
    HOME: '/nonexistent',
  };
}

export function cleanupDevelopmentWorkspace(
  options: CleanupDevelopmentWorkspaceOptions,
): Promise<void> {
  const jobId = options.jobId.trim();
  const jobsRoot = options.jobsRoot.trim();
  const scriptPath = options.scriptPath.trim();

  if (!jobId || !jobsRoot || !scriptPath) {
    return Promise.reject(
      new Error(
        'DEVELOPMENT_WORKSPACE_CLEANUP_CONFIG_REQUIRED',
      ),
    );
  }

  const pythonExecutable =
    options.pythonExecutable?.trim() || 'python3';

  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      pythonExecutable,
      [
        scriptPath,
        '--job-id',
        jobId,
        '--jobs-root',
        jobsRoot,
      ],
      {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: minimalEnvironment(),
        signal: options.signal,
      },
    );

    let stdout = '';
    let stderr = '';
    let outputTooLarge = false;
    let settled = false;

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    const collect = (
      current: string,
      chunk: Buffer,
    ): string => {
      const next =
        current + chunk.toString('utf8');

      if (
        Buffer.byteLength(next, 'utf8') >
        MAX_OUTPUT_BYTES
      ) {
        outputTooLarge = true;
        child.kill('SIGKILL');
      }

      return next;
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdout = collect(stdout, chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr = collect(stderr, chunk);
    });

    child.once('error', (error) => {
      rejectOnce(error);
    });

    child.once('close', (code, signal) => {
      if (settled) return;

      if (outputTooLarge) {
        rejectOnce(
          new Error(
            'DEVELOPMENT_WORKSPACE_CLEANUP_OUTPUT_TOO_LARGE',
          ),
        );
        return;
      }

      if (code !== 0) {
        rejectOnce(
          new Error(
            `DEVELOPMENT_WORKSPACE_CLEANUP_FAILED` +
              ` code=${String(code)}` +
              ` signal=${String(signal)}`,
          ),
        );
        return;
      }

      if (stdout.trim() !== 'WORKSPACE_CLEANED') {
        rejectOnce(
          new Error(
            'DEVELOPMENT_WORKSPACE_CLEANUP_INVALID_OUTPUT',
          ),
        );
        return;
      }

      settled = true;
      resolvePromise();
    });
  });
}
