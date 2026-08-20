import { afterEach, describe, expect, it } from 'vitest';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { planDevelopmentScope } from '../src/services/ai/kaviar-ai.development-scope-planner';

const tempDirs: string[] = [];

async function makePlannerScript(
  body: string,
): Promise<string> {
  const dir = await mkdtemp(
    join(tmpdir(), 'kaviar-scope-planner-test-'),
  );

  tempDirs.push(dir);

  const script = join(dir, 'planner.py');

  await writeFile(
    script,
    `#!/usr/bin/env python3
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

describe('planDevelopmentScope', () => {
  it('aceita stdout verboso maior que 64KB quando o JSON valido esta no final', async () => {
    const scriptPath = await makePlannerScript(`
sys.stdin.read()
print("X" * (80 * 1024))
print('{"allowed_paths":["backend/src/services/pricing-engine.ts"],"rationale":"escopo valido"}')
`);

    const result = await planDevelopmentScope({
      task: 'validar pricing',
      workspace: '/tmp/workspace',
      scriptPath,
      geminiApiKey: 'test-key',
      pythonExecutable: 'python3',
    });

    expect(result).toEqual({
      allowedPaths: [
        'backend/src/services/pricing-engine.ts',
      ],
      rationale: 'escopo valido',
    });
  });

  it('aceita stderr verboso sem derrubar o planner', async () => {
    const scriptPath = await makePlannerScript(`
sys.stdin.read()
sys.stderr.write("E" * (80 * 1024))
print('{"allowed_paths":["backend/tests/pricing-vehicle-category.test.ts"],"rationale":"stderr ignorado"}')
`);

    const result = await planDevelopmentScope({
      task: 'validar pricing',
      workspace: '/tmp/workspace',
      scriptPath,
      geminiApiKey: 'test-key',
      pythonExecutable: 'python3',
    });

    expect(result).toEqual({
      allowedPaths: [
        'backend/tests/pricing-vehicle-category.test.ts',
      ],
      rationale: 'stderr ignorado',
    });
  });

  it('continua fail-closed quando nao existe JSON valido', async () => {
    const scriptPath = await makePlannerScript(`
sys.stdin.read()
print("log sem json")
`);

    await expect(
      planDevelopmentScope({
        task: 'validar pricing',
        workspace: '/tmp/workspace',
        scriptPath,
        geminiApiKey: 'test-key',
        pythonExecutable: 'python3',
      }),
    ).rejects.toThrow(
      'DEVELOPMENT_SCOPE_PLANNER_INVALID_JSON',
    );
  });

  it('passa HOME dedicado e suprime banner do OpenHands', async () => {
    const scriptPath = await makePlannerScript(`
import json
import os
sys.stdin.read()
print(json.dumps({
  "allowed_paths": ["backend/src/routes/rides-v2.ts"],
  "rationale": os.environ.get("HOME", "") + "|" + os.environ.get("OPENHANDS_SUPPRESS_BANNER", "")
}))
`);

    const previousHome =
      process.env.DEVELOPMENT_AGENT_HOME;

    process.env.DEVELOPMENT_AGENT_HOME =
      '/tmp/kaviar-agent-home-test';

    try {
      const result = await planDevelopmentScope({
        task: 'validar ambiente',
        workspace: '/tmp/workspace',
        scriptPath,
        geminiApiKey: 'test-key',
        pythonExecutable: 'python3',
      });

      expect(result.rationale).toBe(
        '/tmp/kaviar-agent-home-test|1',
      );
    } finally {
      if (previousHome === undefined) {
        delete process.env.DEVELOPMENT_AGENT_HOME;
      } else {
        process.env.DEVELOPMENT_AGENT_HOME =
          previousHome;
      }
    }
  });
});
