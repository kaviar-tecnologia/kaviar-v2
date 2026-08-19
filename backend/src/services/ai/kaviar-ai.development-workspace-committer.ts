import { spawn } from 'node:child_process';

export interface DevelopmentWorkspaceCommitResult {
  jobId: string;
  workspace: string;
  branch: string;
  commitSha: string;
  changedPaths: string[];
  status: 'COMMITTED';
}

export interface CommitDevelopmentWorkspaceOptions {
  jobId: string;
  jobsRoot: string;
  scriptPath: string;
  allowedPaths: string[];
  pythonExecutable?: string;
  signal?: AbortSignal;
}

interface RawCommitOutput {
  job_id?: unknown;
  workspace?: unknown;
  branch?: unknown;
  commit_sha?: unknown;
  changed_paths?: unknown;
  status?: unknown;
}

const MAX_STDOUT_BYTES = 64 * 1024;
const MAX_STDERR_TAIL_CHARS = 16_384;

function parseCommitOutput(
  raw: string,
  jobId: string,
): DevelopmentWorkspaceCommitResult {
  const candidate = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .reverse()
    .find(
      (line) =>
        line.startsWith('{') &&
        line.endsWith('}'),
    );

  if (!candidate) {
    throw new Error(
      'DEVELOPMENT_COMMIT_INVALID_JSON',
    );
  }

  let parsed: RawCommitOutput;

  try {
    parsed = JSON.parse(candidate) as RawCommitOutput;
  } catch {
    throw new Error(
      'DEVELOPMENT_COMMIT_INVALID_JSON',
    );
  }

  if (
    parsed.job_id !== jobId ||
    typeof parsed.workspace !== 'string' ||
    typeof parsed.branch !== 'string' ||
    typeof parsed.commit_sha !== 'string' ||
    !/^[0-9a-f]{40}$/i.test(parsed.commit_sha) ||
    !Array.isArray(parsed.changed_paths) ||
    !parsed.changed_paths.length ||
    !parsed.changed_paths.every(
      (item) =>
        typeof item === 'string' &&
        item.trim().length > 0,
    ) ||
    parsed.status !== 'COMMITTED'
  ) {
    throw new Error(
      'DEVELOPMENT_COMMIT_INVALID_OUTPUT',
    );
  }

  return {
    jobId,
    workspace: parsed.workspace,
    branch: parsed.branch,
    commitSha: parsed.commit_sha,
    changedPaths: parsed.changed_paths as string[],
    status: 'COMMITTED',
  };
}

export function commitDevelopmentWorkspace(
  options: CommitDevelopmentWorkspaceOptions,
): Promise<DevelopmentWorkspaceCommitResult> {
  const jobId = options.jobId.trim();
  const jobsRoot = options.jobsRoot.trim();
  const scriptPath = options.scriptPath.trim();

  if (
    !jobId ||
    !jobsRoot ||
    !scriptPath ||
    !options.allowedPaths.length
  ) {
    return Promise.reject(
      new Error(
        'DEVELOPMENT_COMMIT_CONFIG_REQUIRED',
      ),
    );
  }

  const pythonExecutable =
    options.pythonExecutable?.trim() ||
    'python3';

  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      pythonExecutable,
      [
        scriptPath,
        '--job-id',
        jobId,
        '--jobs-root',
        jobsRoot,
        ...options.allowedPaths.flatMap(
          (path) => [
            '--allowed-path',
            path,
          ],
        ),
      ],
      {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          PATH:
            process.env.PATH ??
            '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
          LANG: 'C.UTF-8',
          LC_ALL: 'C.UTF-8',
          HOME:
            process.env.DEVELOPMENT_AGENT_HOME?.trim() ||
            '/tmp',
          GIT_CONFIG_NOSYSTEM: '1',
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_TERMINAL_PROMPT: '0',
        },
        signal: options.signal,
      },
    );

    let stdout = '';
    let stderr = '';
    let settled = false;

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    child.stdout.on('data', (chunk: Buffer) => {
      stdout = (
        stdout + chunk.toString('utf8')
      ).slice(-MAX_STDOUT_BYTES);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (
        stderr + chunk.toString('utf8')
      ).slice(-MAX_STDERR_TAIL_CHARS);
    });

    child.once('error', (error) => {
      rejectOnce(error);
    });

    child.once('close', (code, signalName) => {
      if (settled) return;

      if (code !== 0) {
        rejectOnce(
          new Error(
            `DEVELOPMENT_COMMIT_FAILED` +
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

      try {
        const result = parseCommitOutput(
          stdout,
          jobId,
        );

        settled = true;
        resolvePromise(result);
      } catch (error) {
        rejectOnce(
          error instanceof Error
            ? error
            : new Error(
                'DEVELOPMENT_COMMIT_INVALID_OUTPUT',
              ),
        );
      }
    });
  });
}
