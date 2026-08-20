import { spawn } from 'node:child_process';

import type {
  ClaimedDevelopmentJob,
} from './kaviar-ai.development-worker';

const MAX_STDOUT_BYTES = 64 * 1024;
const MAX_STDERR_TAIL_CHARS = 16_384;

export interface DevelopmentTaskExecutionResult {
  jobId: string;
  workspace: string;
  branch: string;
  executionStatus: string;
  changedPaths: string[];
  status: 'COMPLETED';
}

export interface ExecuteDevelopmentTaskOptions {
  job: ClaimedDevelopmentJob;
  scriptPath: string;
  jobsRoot: string;
  geminiApiKey: string;
  pythonExecutable?: string;
  signal?: AbortSignal;
}

interface RawExecutionOutput {
  job_id?: unknown;
  workspace?: unknown;
  branch?: unknown;
  execution_status?: unknown;
  changed_paths?: unknown;
  status?: unknown;
}

function minimalExecutorEnvironment(
  geminiApiKey: string,
): NodeJS.ProcessEnv {
  return {
    PATH:
      process.env.PATH ??
      '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    PYTHONUNBUFFERED: '1',
    HOME: process.env.DEVELOPMENT_AGENT_HOME?.trim() || '/tmp',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
    GEMINI_API_KEY: geminiApiKey,
    OPENHANDS_SUPPRESS_BANNER: '1',
  };
}

function parseExecutionOutput(
  raw: string,
  job: ClaimedDevelopmentJob,
): DevelopmentTaskExecutionResult {
  let parsed: RawExecutionOutput;

  try {
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
        'DEVELOPMENT_TASK_EXECUTOR_INVALID_JSON',
      );
    }

    parsed = JSON.parse(candidate) as RawExecutionOutput;
  } catch {
    throw new Error(
      'DEVELOPMENT_TASK_EXECUTOR_INVALID_JSON',
    );
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    parsed.job_id !== job.id ||
    typeof parsed.workspace !== 'string' ||
    typeof parsed.branch !== 'string' ||
    typeof parsed.execution_status !== 'string' ||
    !Array.isArray(parsed.changed_paths) ||
    parsed.status !== 'COMPLETED'
  ) {
    throw new Error(
      'DEVELOPMENT_TASK_EXECUTOR_INVALID_OUTPUT',
    );
  }

  const changedPaths = parsed.changed_paths;

  if (
    !changedPaths.length ||
    !changedPaths.every(
      (item) =>
        typeof item === 'string' &&
        item.trim().length > 0,
    )
  ) {
    throw new Error(
      'DEVELOPMENT_TASK_EXECUTOR_INVALID_CHANGED_PATHS',
    );
  }

  const allowed = new Set(job.allowedPaths);

  for (const path of changedPaths) {
    if (!allowed.has(path)) {
      throw new Error(
        'DEVELOPMENT_TASK_EXECUTOR_UNAUTHORIZED_PATH',
      );
    }
  }

  return {
    jobId: parsed.job_id as string,
    workspace: parsed.workspace,
    branch: parsed.branch,
    executionStatus: parsed.execution_status,
    changedPaths: changedPaths as string[],
    status: 'COMPLETED',
  };
}

export function executeDevelopmentTask(
  options: ExecuteDevelopmentTaskOptions,
): Promise<DevelopmentTaskExecutionResult> {
  const scriptPath = options.scriptPath.trim();
  const jobsRoot = options.jobsRoot.trim();
  const geminiApiKey =
    options.geminiApiKey.trim();

  if (!scriptPath || !jobsRoot) {
    return Promise.reject(
      new Error(
        'DEVELOPMENT_TASK_EXECUTOR_CONFIG_REQUIRED',
      ),
    );
  }

  if (!geminiApiKey) {
    return Promise.reject(
      new Error(
        'DEVELOPMENT_TASK_GEMINI_KEY_REQUIRED',
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
        options.job.id,
        '--jobs-root',
        jobsRoot,
      ],
      {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: minimalExecutorEnvironment(
          geminiApiKey,
        ),
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
      stdout = (stdout + chunk.toString('utf8')).slice(
        -MAX_STDOUT_BYTES,
      );
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString('utf8')).slice(
        -MAX_STDERR_TAIL_CHARS,
      );
    });

    child.once('error', (error) => {
      rejectOnce(error);
    });

    child.once('close', (code, signal) => {
      if (settled) return;

      if (code !== 0) {
        rejectOnce(
          new Error(
            `DEVELOPMENT_TASK_EXECUTOR_FAILED` +
              ` code=${String(code)}` +
              ` signal=${String(signal)}` +
              (stderr.trim()
                ? ` stderr_tail=${stderr
                    .trim()
                    .replace(/\\s+/g, ' ')
                    .slice(-2000)}`
                : ''),
          ),
        );
        return;
      }

      try {
        const result = parseExecutionOutput(
          stdout.trim(),
          options.job,
        );

        settled = true;
        resolvePromise(result);
      } catch (error) {
        rejectOnce(
          error instanceof Error
            ? error
            : new Error(
                'DEVELOPMENT_TASK_EXECUTOR_UNKNOWN_ERROR',
              ),
        );
      }
    });

    child.stdin.once('error', (error) => {
      rejectOnce(error);
    });

    child.stdin.end(
      JSON.stringify({
        task: options.job.summary,
        allowed_paths: options.job.allowedPaths,
      }),
    );
  });
}
