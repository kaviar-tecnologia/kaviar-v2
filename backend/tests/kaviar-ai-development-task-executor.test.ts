import {
  afterEach,
  describe,
  expect,
  it,
} from 'vitest';
import {
  chmod,
  mkdtemp,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { executeDevelopmentTask } from '../src/services/ai/kaviar-ai.development-task-executor';

const tempDirs: string[] = [];

const job = {
  id: 'executor-test-job',
  category: 'TEST',
  summary: 'Adicionar teste',
  allowedPaths: [
    'backend/tests/pricing-engine.test.ts',
  ],
  status: 'RUNNING',
  attempts: 1,
  lockedBy: 'test-worker',
  startedAt: new Date(),
  lockedAt: new Date(),
} as any;

async function makeScript(body: string) {
  const dir = await mkdtemp(
    join(tmpdir(), 'kaviar-executor-test-'),
  );

  tempDirs.push(dir);

  const script = join(dir, 'execute.py');

  await writeFile(
    script,
    `#!/usr/bin/env python3
import json
import os
import sys
${body}
`,
    'utf8',
  );

  await chmod(script, 0o755);

  return script;
}

afterEach(async () => {
  await Promise.all(
    tempDirs.splice(0).map((dir) =>
      rm(dir, { recursive: true, force: true }),
    ),
  );
});

function run(scriptPath: string) {
  return executeDevelopmentTask({
    job,
    scriptPath,
    jobsRoot: '/tmp/kaviar-jobs-test',
    geminiApiKey: 'test-key',
    pythonExecutable: 'python3',
  });
}

describe('executeDevelopmentTask', () => {
  it('aceita stdout verboso maior que 64KB com JSON final valido', async () => {
    const script = await makeScript(`
sys.stdin.read()
print("X" * (80 * 1024))
print(json.dumps({
  "job_id": "executor-test-job",
  "workspace": "/tmp/job",
  "branch": "agent/job-test",
  "execution_status": "done",
  "changed_paths": ["backend/tests/pricing-engine.test.ts"],
  "status": "COMPLETED"
}))
`);

    const result = await run(script);

    expect(result.changedPaths).toEqual([
      'backend/tests/pricing-engine.test.ts',
    ]);
    expect(result.status).toBe('COMPLETED');
  });

  it('aceita stderr verboso sem matar o executor', async () => {
    const script = await makeScript(`
sys.stdin.read()
sys.stderr.write("E" * (80 * 1024))
print(json.dumps({
  "job_id": "executor-test-job",
  "workspace": "/tmp/job",
  "branch": "agent/job-test",
  "execution_status": "done",
  "changed_paths": ["backend/tests/pricing-engine.test.ts"],
  "status": "COMPLETED"
}))
`);

    await expect(run(script)).resolves.toMatchObject({
      status: 'COMPLETED',
    });
  });

  it('continua fail-closed para JSON invalido', async () => {
    const script = await makeScript(`
sys.stdin.read()
print("log sem json")
`);

    await expect(run(script)).rejects.toThrow(
      'DEVELOPMENT_TASK_EXECUTOR_INVALID_JSON',
    );
  });

  it('bloqueia caminho fora do scope aprovado', async () => {
    const script = await makeScript(`
sys.stdin.read()
print(json.dumps({
  "job_id": "executor-test-job",
  "workspace": "/tmp/job",
  "branch": "agent/job-test",
  "execution_status": "done",
  "changed_paths": ["backend/src/server.ts"],
  "status": "COMPLETED"
}))
`);

    await expect(run(script)).rejects.toThrow(
      'DEVELOPMENT_TASK_EXECUTOR_UNAUTHORIZED_PATH',
    );
  });

  it('passa HOME dedicado ao subprocesso', async () => {
    const previous =
      process.env.DEVELOPMENT_AGENT_HOME;

    process.env.DEVELOPMENT_AGENT_HOME =
      '/tmp/kaviar-agent-home-executor-test';

    const script = await makeScript(`
sys.stdin.read()
print(json.dumps({
  "job_id": "executor-test-job",
  "workspace": "/tmp/job",
  "branch": "agent/job-test",
  "execution_status": os.environ.get("HOME", ""),
  "changed_paths": ["backend/tests/pricing-engine.test.ts"],
  "status": "COMPLETED"
}))
`);

    try {
      const result = await run(script);

      expect(result.executionStatus).toBe(
        '/tmp/kaviar-agent-home-executor-test',
      );
    } finally {
      if (previous === undefined) {
        delete process.env.DEVELOPMENT_AGENT_HOME;
      } else {
        process.env.DEVELOPMENT_AGENT_HOME =
          previous;
      }
    }
  });

  it('preserva o final do stderr quando o Python falha', async () => {
    const script = await makeScript(`
sys.stdin.read()
sys.stderr.write("EXECUTOR_DIAGNOSTIC_TEST")
sys.exit(7)
`);

    await expect(run(script)).rejects.toThrow(
      /code=7.*EXECUTOR_DIAGNOSTIC_TEST/,
    );
  });
});
