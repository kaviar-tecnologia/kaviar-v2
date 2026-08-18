import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const MAX_PROCESS_OUTPUT_BYTES = 64 * 1024;

export interface PreparedDevelopmentWorkspace {
  jobId: string;
  workspace: string;
  branch: string;
  head: string;
  shallow: true;
}

export interface PrepareDevelopmentWorkspaceOptions {
  jobId: string;
  scriptPath: string;
  baseRepo: string;
  jobsRoot: string;
  sourceBranch: string;
  signal?: AbortSignal;
  pythonExecutable?: string;
}

interface PrepareWorkspaceOutput {
  job_id: string;
  workspace: string;
  branch: string;
  head: string;
  shallow: string;
}

function minimalChildEnvironment(): NodeJS.ProcessEnv {
  return {
    PATH:
      process.env.PATH ??
      '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    PYTHONUNBUFFERED: '1',
    HOME: '/nonexistent',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_GLOBAL: '/dev/null',
  };
}

function parseWorkspaceOutput(
  raw: string,
  options: PrepareDevelopmentWorkspaceOptions,
): PreparedDevelopmentWorkspace {
  let parsed: PrepareWorkspaceOutput;

  try {
    parsed = JSON.parse(raw) as PrepareWorkspaceOutput;
  } catch {
    throw new Error(
      'DEVELOPMENT_WORKSPACE_INVALID_JSON',
    );
  }

  if (
    !parsed ||
    typeof parsed.job_id !== 'string' ||
    typeof parsed.workspace !== 'string' ||
    typeof parsed.branch !== 'string' ||
    typeof parsed.head !== 'string' ||
    parsed.shallow !== 'true'
  ) {
    throw new Error(
      'DEVELOPMENT_WORKSPACE_INVALID_OUTPUT',
    );
  }

  const requestedJobId =
    options.jobId.trim().toLowerCase();

  if (
    parsed.job_id.toLowerCase() !== requestedJobId
  ) {
    throw new Error(
      'DEVELOPMENT_WORKSPACE_JOB_ID_MISMATCH',
    );
  }

  const expectedWorkspace = resolve(
    options.jobsRoot,
    parsed.job_id,
  );

  if (
    resolve(parsed.workspace) !== expectedWorkspace
  ) {
    throw new Error(
      'DEVELOPMENT_WORKSPACE_PATH_MISMATCH',
    );
  }

  if (!parsed.branch.startsWith('agent/job-')) {
    throw new Error(
      'DEVELOPMENT_WORKSPACE_BRANCH_INVALID',
    );
  }

  return {
    jobId: parsed.job_id,
    workspace: parsed.workspace,
    branch: parsed.branch,
    head: parsed.head,
    shallow: true,
  };
}

export function prepareDevelopmentWorkspace(
  options: PrepareDevelopmentWorkspaceOptions,
): Promise<PreparedDevelopmentWorkspace> {
  const scriptPath = options.scriptPath.trim();
  const baseRepo = options.baseRepo.trim();
  const jobsRoot = options.jobsRoot.trim();
  const sourceBranch = options.sourceBranch.trim();
  const jobId = options.jobId.trim();

  if (!jobId) {
    return Promise.reject(
      new Error('DEVELOPMENT_JOB_ID_REQUIRED'),
    );
  }

  if (
    !scriptPath ||
    !baseRepo ||
    !jobsRoot ||
    !sourceBranch
  ) {
    return Promise.reject(
      new Error(
        'DEVELOPMENT_WORKSPACE_CONFIG_REQUIRED',
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
        '--base-repo',
        baseRepo,
        '--jobs-root',
        jobsRoot,
        '--source-branch',
        sourceBranch,
      ],
      {
        shell: false,
        stdio: [
          'ignore',
          'pipe',
          'pipe',
        ],
        env: minimalChildEnvironment(),
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

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');

      if (
        Buffer.byteLength(stdout, 'utf8') >
        MAX_PROCESS_OUTPUT_BYTES
      ) {
        outputTooLarge = true;
        child.kill('SIGKILL');
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');

      if (
        Buffer.byteLength(stderr, 'utf8') >
        MAX_PROCESS_OUTPUT_BYTES
      ) {
        outputTooLarge = true;
        child.kill('SIGKILL');
      }
    });

    child.once('error', (error) => {
      rejectOnce(error);
    });

    child.once('close', (code, signal) => {
      if (settled) return;

      if (outputTooLarge) {
        rejectOnce(
          new Error(
            'DEVELOPMENT_WORKSPACE_OUTPUT_TOO_LARGE',
          ),
        );
        return;
      }

      if (code !== 0) {
        const detail = stderr.trim();

        rejectOnce(
          new Error(
            `DEVELOPMENT_WORKSPACE_PREPARE_FAILED` +
              ` code=${String(code)}` +
              ` signal=${String(signal)}` +
              (detail
                ? ` stderr=${detail}`
                : ''),
          ),
        );
        return;
      }

      try {
        const result = parseWorkspaceOutput(
          stdout.trim(),
          options,
        );

        settled = true;
        resolvePromise(result);
      } catch (error) {
        rejectOnce(
          error instanceof Error
            ? error
            : new Error(
                'DEVELOPMENT_WORKSPACE_UNKNOWN_ERROR',
              ),
        );
      }
    });
  });
}
