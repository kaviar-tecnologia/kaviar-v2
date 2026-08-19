import { resolve } from 'node:path';

import { runDevelopmentAgentRunner } from '../../src/services/ai/kaviar-ai.development-agent-runner';
import { prepareDevelopmentWorkspace } from '../../src/services/ai/kaviar-ai.development-workspace';
import { cleanupDevelopmentWorkspace } from '../../src/services/ai/kaviar-ai.development-workspace-cleanup';
import { planDevelopmentScope } from '../../src/services/ai/kaviar-ai.development-scope-planner';
import { executeDevelopmentTask } from '../../src/services/ai/kaviar-ai.development-task-executor';
import { validateDevelopmentWorkspace } from '../../src/services/ai/kaviar-ai.development-workspace-validator';

const BASE_REPO =
  process.env.DEVELOPMENT_AGENT_BASE_REPO?.trim() ||
  '/home/ubuntu/kaviar-workspaces/kaviar-v2';

const SCOPE_JOBS_ROOT =
  process.env.DEVELOPMENT_AGENT_SCOPE_JOBS_ROOT?.trim() ||
  '/home/ubuntu/kaviar-agent-scope-jobs';

const EXECUTION_JOBS_ROOT =
  process.env.DEVELOPMENT_AGENT_JOBS_ROOT?.trim() ||
  '/home/ubuntu/kaviar-agent-jobs';

const PYTHON_EXECUTABLE =
  process.env.DEVELOPMENT_AGENT_PYTHON?.trim() ||
  '/home/ubuntu/kaviar-agent-runtime/.venv/bin/python';

const SOURCE_BRANCH =
  process.env.DEVELOPMENT_AGENT_SOURCE_BRANCH?.trim() ||
  'agent/dev-agent-phase4-openhands-execution';

const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY?.trim() || '';

const PREPARE_SCRIPT = resolve(
  BASE_REPO,
  'backend/scripts/development-agent/prepare_workspace.py',
);

const CLEANUP_SCRIPT = resolve(
  BASE_REPO,
  'backend/scripts/development-agent/cleanup_workspace.py',
);

const PLAN_SCRIPT = resolve(
  BASE_REPO,
  'backend/scripts/development-agent/plan_scope.py',
);

const EXECUTE_SCRIPT = resolve(
  BASE_REPO,
  'backend/scripts/development-agent/execute_task.py',
);

async function main(): Promise<void> {
  if (!GEMINI_API_KEY) {
    throw new Error(
      'DEVELOPMENT_AGENT_GEMINI_KEY_REQUIRED',
    );
  }

  await runDevelopmentAgentRunner({
    planScope: async (job, signal) => {
      const prepared =
        await prepareDevelopmentWorkspace({
          jobId: job.id,
          scriptPath: PREPARE_SCRIPT,
          baseRepo: BASE_REPO,
          jobsRoot: SCOPE_JOBS_ROOT,
          sourceBranch: SOURCE_BRANCH,
          pythonExecutable: PYTHON_EXECUTABLE,
          signal,
        });

      try {
        return await planDevelopmentScope({
          task: job.summary,
          workspace: prepared.workspace,
          scriptPath: PLAN_SCRIPT,
          geminiApiKey: GEMINI_API_KEY,
          pythonExecutable: PYTHON_EXECUTABLE,
          signal,
        });
      } finally {
        try {
          await cleanupDevelopmentWorkspace({
            jobId: job.id,
            jobsRoot: SCOPE_JOBS_ROOT,
            scriptPath: CLEANUP_SCRIPT,
            pythonExecutable: PYTHON_EXECUTABLE,
          });
        } catch (error) {
          console.error(
            '[DEVELOPMENT_AGENT_SCOPE_CLEANUP_ERROR]',
            error,
          );
        }
      }
    },

    execute: async (job, signal) => {
      // Remove apenas um workspace residual do mesmo job.
      // O cleanup é idempotente e validado pelo jobsRoot.
      await cleanupDevelopmentWorkspace({
        jobId: job.id,
        jobsRoot: EXECUTION_JOBS_ROOT,
        scriptPath: CLEANUP_SCRIPT,
        pythonExecutable: PYTHON_EXECUTABLE,
      });

      try {
        await prepareDevelopmentWorkspace({
          jobId: job.id,
          scriptPath: PREPARE_SCRIPT,
          baseRepo: BASE_REPO,
          jobsRoot: EXECUTION_JOBS_ROOT,
          sourceBranch: SOURCE_BRANCH,
          pythonExecutable: PYTHON_EXECUTABLE,
          signal,
        });

        const executionResult =
          await executeDevelopmentTask({
            job,
            scriptPath: EXECUTE_SCRIPT,
            jobsRoot: EXECUTION_JOBS_ROOT,
            geminiApiKey: GEMINI_API_KEY,
            pythonExecutable: PYTHON_EXECUTABLE,
            signal,
          });

        await validateDevelopmentWorkspace({
          workspace: executionResult.workspace,
          baseBackend: resolve(
            BASE_REPO,
            'backend',
          ),
          changedPaths:
            executionResult.changedPaths,
          signal,
        });
      } finally {
        try {
          await cleanupDevelopmentWorkspace({
            jobId: job.id,
            jobsRoot: EXECUTION_JOBS_ROOT,
            scriptPath: CLEANUP_SCRIPT,
            pythonExecutable: PYTHON_EXECUTABLE,
          });
        } catch (error) {
          console.error(
            '[DEVELOPMENT_AGENT_EXECUTION_CLEANUP_ERROR]',
            error,
          );
        }
      }
    },
  });
}

main().catch((error) => {
  console.error(
    '[DEVELOPMENT_AGENT_FATAL]',
    error instanceof Error
      ? error.message
      : error,
  );

  process.exitCode = 1;
});
