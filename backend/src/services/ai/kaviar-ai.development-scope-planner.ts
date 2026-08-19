import { spawn } from 'node:child_process';

import {
  normalizeDevelopmentAllowedPaths,
} from './kaviar-ai.development-scope-contract';

const MAX_PROCESS_OUTPUT_BYTES = 64 * 1024;
const MAX_SCOPE_RATIONALE_LENGTH = 4000;

export interface DevelopmentScopePlan {
  allowedPaths: string[];
  rationale: string;
}

export interface PlanDevelopmentScopeOptions {
  task: string;
  workspace: string;
  scriptPath: string;
  geminiApiKey: string;
  pythonExecutable?: string;
  signal?: AbortSignal;
}

interface ScopePlannerOutput {
  allowed_paths?: unknown;
  rationale?: unknown;
}

function minimalPlannerEnvironment(
  geminiApiKey: string,
): NodeJS.ProcessEnv {
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
    GEMINI_API_KEY: geminiApiKey,
    OPENHANDS_SUPPRESS_BANNER: '1',
  };
}

function parsePlannerOutput(
  raw: string,
): DevelopmentScopePlan {
  let parsed: ScopePlannerOutput;

  try {
    parsed = JSON.parse(raw) as ScopePlannerOutput;
  } catch {
    throw new Error(
      'DEVELOPMENT_SCOPE_PLANNER_INVALID_JSON',
    );
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error(
      'DEVELOPMENT_SCOPE_PLANNER_INVALID_OUTPUT',
    );
  }

  const allowedPaths =
    normalizeDevelopmentAllowedPaths(
      parsed.allowed_paths,
    );

  if (typeof parsed.rationale !== 'string') {
    throw new Error(
      'DEVELOPMENT_SCOPE_PLANNER_INVALID_RATIONALE',
    );
  }

  const rationale = parsed.rationale.trim();

  if (
    rationale.length >
    MAX_SCOPE_RATIONALE_LENGTH
  ) {
    throw new Error(
      'DEVELOPMENT_SCOPE_PLANNER_RATIONALE_TOO_LONG',
    );
  }

  return {
    allowedPaths,
    rationale,
  };
}

export function planDevelopmentScope(
  options: PlanDevelopmentScopeOptions,
): Promise<DevelopmentScopePlan> {
  const task = options.task.trim();
  const workspace = options.workspace.trim();
  const scriptPath = options.scriptPath.trim();
  const geminiApiKey =
    options.geminiApiKey.trim();

  if (!task) {
    return Promise.reject(
      new Error('DEVELOPMENT_SCOPE_TASK_REQUIRED'),
    );
  }

  if (!workspace || !scriptPath) {
    return Promise.reject(
      new Error(
        'DEVELOPMENT_SCOPE_PLANNER_CONFIG_REQUIRED',
      ),
    );
  }

  if (!geminiApiKey) {
    return Promise.reject(
      new Error(
        'DEVELOPMENT_SCOPE_GEMINI_KEY_REQUIRED',
      ),
    );
  }

  const pythonExecutable =
    options.pythonExecutable?.trim() || 'python3';

  return new Promise((resolvePromise, reject) => {
    const child = spawn(
      pythonExecutable,
      [scriptPath],
      {
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: minimalPlannerEnvironment(
          geminiApiKey,
        ),
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
            'DEVELOPMENT_SCOPE_PLANNER_OUTPUT_TOO_LARGE',
          ),
        );
        return;
      }

      if (code !== 0) {
        rejectOnce(
          new Error(
            `DEVELOPMENT_SCOPE_PLANNER_FAILED` +
              ` code=${String(code)}` +
              ` signal=${String(signal)}`,
          ),
        );
        return;
      }

      try {
        const result = parsePlannerOutput(
          stdout.trim(),
        );

        settled = true;
        resolvePromise(result);
      } catch (error) {
        rejectOnce(
          error instanceof Error
            ? error
            : new Error(
                'DEVELOPMENT_SCOPE_PLANNER_UNKNOWN_ERROR',
              ),
        );
      }
    });

    child.stdin.once('error', (error) => {
      rejectOnce(error);
    });

    child.stdin.end(
      JSON.stringify({
        task,
        workspace,
      }),
    );
  });
}
