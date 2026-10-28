import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(__dirname, '../prisma/migrations/20261028203000_manager_neighborhood_scope_versions/migration.sql'),
  'utf8',
);
const prismaSchema = readFileSync(join(__dirname, '../prisma/schema.prisma'), 'utf8');
const recoveryScript = readFileSync(join(__dirname, '../scripts/repair-manager-scope-p3018.js'), 'utf8');
const backendWorkflow = readFileSync(join(__dirname, '../../.github/workflows/deploy-backend.yml'), 'utf8');
const migrationWorkflow = readFileSync(join(__dirname, '../../.github/workflows/deploy-prisma-migrations.yml'), 'utf8');

describe('manager neighborhood scope migration safety', () => {
  it('does not create distinct indexes that PostgreSQL truncates to the same 63-byte name', () => {
    const names = [...migration.matchAll(/CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/gi)]
      .map((match) => match[1]);
    const postgresIdentifiers = names.map((name) => Buffer.from(name, 'utf8').subarray(0, 63).toString());

    expect(new Set(postgresIdentifiers).size).toBe(postgresIdentifiers.length);
    expect(names).toHaveLength(1);
    expect(prismaSchema).not.toContain('@@index([assignment_id, effective_from(sort: Desc)])');
  });

  it('can replay after a failed first attempt without duplicating the table, index or FK', () => {
    expect(migration).toMatch(/\bBEGIN\s*;/);
    expect(migration).toMatch(/\bCOMMIT\s*;/);
    expect(migration).toMatch(/CREATE TABLE IF NOT EXISTS/);
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS/);
    expect(migration).toMatch(/pg_constraint/);
  });

  it('requires explicit backend workflow confirmation and strict read-only checks before Prisma repair', () => {
    const marker = 'RECOVER_MANAGER_SCOPE_P3018_20261028';
    expect(backendWorkflow).toContain('migration_recovery_confirmation:');
    expect(backendWorkflow).toContain(marker);
    expect(migrationWorkflow).toContain('orchestrated_by_backend');
    expect(migrationWorkflow).toContain('node scripts/repair-manager-scope-p3018.js');
    expect(migrationWorkflow).toContain(marker);
    expect(recoveryScript).toContain(marker);
    expect(recoveryScript).toContain("'UNEXPECTED_SCOPE_ROWS'");
    expect(recoveryScript.indexOf('await withDatabase(preflight)'))
      .toBeLessThan(recoveryScript.indexOf("spawnSync('npx'"));
  });
});
