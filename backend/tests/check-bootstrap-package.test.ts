import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

function makeFixture(migrations: string[], cutoff: string[]) {
  const root = mkdtempSync(join(tmpdir(), 'kaviar-bootstrap-check-'));
  const bootstrapDir = join(root, 'bootstrap', '20260910_current');
  const migrationsDir = join(root, 'migrations');

  mkdirSync(bootstrapDir, { recursive: true });
  mkdirSync(migrationsDir, { recursive: true });

  writeFileSync(join(bootstrapDir, 'baseline.sql'), '-- baseline\n');
  writeFileSync(join(bootstrapDir, 'migration-cutoff.txt'), `${cutoff.join('\n')}\n`);

  for (const migrationName of migrations) {
    const migrationPath = join(migrationsDir, migrationName);
    mkdirSync(migrationPath, { recursive: true });
    writeFileSync(join(migrationPath, 'migration.sql'), '-- migration\n');
  }

  return { root, bootstrapDir, migrationsDir };
}

function runChecker(bootstrapDir: string, migrationsDir: string) {
  const scriptPath = resolve(process.cwd(), 'scripts', 'check-bootstrap-package.sh');
  return spawnSync(scriptPath, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      BOOTSTRAP_DIR: bootstrapDir,
      MIGRATIONS_DIR: migrationsDir,
    },
    encoding: 'utf8',
  });
}

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length > 0) {
    const dir = tmpDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe('check-bootstrap-package cutoff semantics', () => {
  it('A) aceita cutoff igual ao prefixo atual', () => {
    const fixture = makeFixture(
      ['20260901_alpha', '20260902_beta', '20260903_gamma'],
      ['20260901_alpha', '20260902_beta'],
    );
    tmpDirs.push(fixture.root);

    const result = runChecker(fixture.bootstrapDir, fixture.migrationsDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('validate-bootstrap-package: PASS');
  });

  it('B) aceita migration timestampada posterior ao cutoff e reporta como post-cutoff', () => {
    const fixture = makeFixture(
      ['20260901_alpha', '20260902_beta', '20260903_gamma'],
      ['20260901_alpha', '20260902_beta'],
    );
    tmpDirs.push(fixture.root);

    const result = runChecker(fixture.bootstrapDir, fixture.migrationsDir);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('post_cutoff_timestamped_migration_count=1');
    expect(result.stdout).toContain('post_cutoff_timestamped_migrations=20260903_gamma');
  });

  it('C) falha quando cutoff omite migration intermediária (não é prefixo contínuo)', () => {
    const fixture = makeFixture(
      ['20260901_alpha', '20260902_beta', '20260903_gamma'],
      ['20260901_alpha', '20260903_gamma'],
    );
    tmpDirs.push(fixture.root);

    const result = runChecker(fixture.bootstrapDir, fixture.migrationsDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('cutoff is not a continuous prefix');
  });

  it('D) falha quando cutoff referencia migration inexistente', () => {
    const fixture = makeFixture(
      ['20260901_alpha', '20260902_beta', '20260903_gamma'],
      ['20260901_alpha', '20260902_beta', '20260999_missing'],
    );
    tmpDirs.push(fixture.root);

    const result = runChecker(fixture.bootstrapDir, fixture.migrationsDir);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('cutoff contains unknown migration');
  });
});
