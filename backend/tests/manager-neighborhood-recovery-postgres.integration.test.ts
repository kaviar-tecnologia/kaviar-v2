import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from 'pg';
import { spawnSync } from 'node:child_process';
import { appendFileSync, copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const enabled = process.env.RUN_SCOPE_RECOVERY_PG_INTEGRATION === '1';
const target = '20261028203000_manager_neighborhood_scope_versions';
const databaseUrl = process.env.DATABASE_URL || '';
const backend = resolve(__dirname, '..');
const prismaCli = join(backend, 'node_modules/.bin/prisma');
const original = join(__dirname, 'fixtures/manager-scope-original-migration.sql');
const corrected = join(backend, 'prisma/migrations', target, 'migration.sql');

describe.skipIf(!enabled)('P3018 recovery on disposable PostgreSQL', () => {
  const client = new Client({ connectionString: databaseUrl });
  let project: string;
  const run = (binary: string, args: string[], extra: NodeJS.ProcessEnv = {}) => spawnSync(binary, args, {
    cwd: project,
    encoding: 'utf8',
    timeout: 90000,
    env: { ...process.env, ...extra, NODE_PATH: join(backend, 'node_modules'), PATH: `${join(backend, 'node_modules/.bin')}:${process.env.PATH}` },
  });

  beforeAll(async () => {
    const url = new URL(databaseUrl);
    if (url.hostname !== '127.0.0.1' || url.port !== '65433' || url.pathname !== '/scope_recovery_vitest') {
      throw new Error('Tests require the dedicated disposable recovery database.');
    }
    await client.connect();
    const location = await client.query("SELECT current_setting('data_directory') AS path");
    if (!location.rows[0].path.endsWith('/files/scope-recovery-pg')) throw new Error('Refusing non-disposable PostgreSQL.');
    const existing = await client.query("SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')");
    if (existing.rows[0].count !== 0) throw new Error('Disposable test database must be empty.');
    project = mkdtempSync('/tmp/kaviar-scope-recovery-');
    symlinkSync(join(backend, 'node_modules'), join(project, 'node_modules'), 'dir');
    mkdirSync(join(project, 'prisma/migrations/20261027000000_synthetic_baseline'), { recursive: true });
    mkdirSync(join(project, 'scripts'));
    writeFileSync(join(project, 'prisma/schema.prisma'), 'datasource db {\n provider = "postgresql"\n url = env("DATABASE_URL")\n}\n');
    writeFileSync(join(project, 'prisma/migrations/20261027000000_synthetic_baseline/migration.sql'), `
      CREATE TABLE territory_manager_assignments (id UUID PRIMARY KEY, label text NOT NULL);
      CREATE TABLE synthetic_finance_history (id integer PRIMARY KEY, amount integer NOT NULL);
      INSERT INTO territory_manager_assignments VALUES ('00000000-0000-0000-0000-000000000001', 'synthetic');
      INSERT INTO synthetic_finance_history VALUES (1, 12345);
    `);
    copyFileSync(join(backend, 'scripts/repair-manager-scope-p3018.js'), join(project, 'scripts/repair-manager-scope-p3018.js'));
  });

  afterAll(async () => {
    await client.end();
    if (project) rmSync(project, { recursive: true, force: true });
  });

  it('reproduces P3018, recovers the absent table and preserves history and data', async () => {
    const migrate = () => run(prismaCli, ['migrate', 'deploy', '--schema', 'prisma/schema.prisma']);
    expect(migrate().status).toBe(0);
    mkdirSync(join(project, 'prisma/migrations', target));
    copyFileSync(original, join(project, 'prisma/migrations', target, 'migration.sql'));
    const failure = migrate();
    expect(failure.status).not.toBe(0);
    expect(failure.stderr).toContain('P3018');
    expect(failure.stderr).toContain('42P07');
    const before = await client.query(`SELECT checksum, finished_at, rolled_back_at, applied_steps_count
      FROM _prisma_migrations WHERE migration_name=$1`, [target]);
    expect(before.rows).toEqual([expect.objectContaining({
      checksum: 'bef0f3b23cf61ea503a79888660a96180e1636ded16bd6f471cca0af3c27cc85',
      finished_at: null, rolled_back_at: null, applied_steps_count: 0,
    })]);
    expect((await client.query("SELECT to_regclass('public.territory_manager_neighborhood_scope_versions') AS name")).rows[0].name).toBeNull();
    copyFileSync(corrected, join(project, 'prisma/migrations', target, 'migration.sql'));
    const repair = (confirmation: string) => run('node', ['scripts/repair-manager-scope-p3018.js'], { MIGRATION_RECOVERY_CONFIRMATION: confirmation });
    expect(repair('NONE').stderr).toContain('RECOVERY_ABORT_EXPLICIT_CONFIRMATION_REQUIRED');
    expect(repair('RECOVER_MANAGER_SCOPE_P3018_20261028').stderr).toContain('RECOVERY_ABORT_PARTIAL_TABLE_MISSING');
    appendFileSync(join(project, 'prisma/migrations', target, 'migration.sql'), '\n-- tampered\n');
    expect(repair('RECOVER_MANAGER_SCOPE_EMPTY_20261028').stderr).toContain('RECOVERY_ABORT_CORRECTED_MIGRATION_CHECKSUM_MISMATCH');
    copyFileSync(corrected, join(project, 'prisma/migrations', target, 'migration.sql'));
    const result = repair('RECOVER_MANAGER_SCOPE_EMPTY_20261028');
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('RECOVERY_RESOLVE_VERIFIED');
    expect(migrate().status).toBe(0);
    const history = await client.query(`SELECT checksum, finished_at, rolled_back_at
      FROM _prisma_migrations WHERE migration_name=$1 ORDER BY started_at`, [target]);
    expect(history.rows).toHaveLength(2);
    expect(history.rows[0].rolled_back_at).toBeInstanceOf(Date);
    expect(history.rows[1]).toMatchObject({ checksum: '607ac2f7b56b2b8f1a33acec4d7ce72ba7dd835c2a93c7e81cfa30109455987b', rolled_back_at: null });
    expect(history.rows[1].finished_at).toBeInstanceOf(Date);
    const catalog = await client.query(`SELECT
      (SELECT count(*)::int FROM information_schema.columns WHERE table_schema='public' AND table_name=$1) AS columns,
      (SELECT count(*)::int FROM pg_constraint WHERE conrelid=to_regclass('public.' || $1)) AS constraints,
      (SELECT count(*)::int FROM pg_index WHERE indrelid=to_regclass('public.' || $1)) AS indexes`, ['territory_manager_neighborhood_scope_versions']);
    expect(catalog.rows[0]).toEqual({ columns: 11, constraints: 5, indexes: 2 });
    expect((await client.query('SELECT label FROM territory_manager_assignments')).rows).toEqual([{ label: 'synthetic' }]);
    expect((await client.query('SELECT amount FROM synthetic_finance_history')).rows).toEqual([{ amount: 12345 }]);
    expect((await client.query('SELECT count(*)::int AS count FROM territory_manager_neighborhood_scope_versions')).rows[0].count).toBe(0);
    expect(migrate().stdout).toContain('No pending migrations');
    expect(repair('RECOVER_MANAGER_SCOPE_EMPTY_20261028').stderr).toContain('RECOVERY_ABORT_UNEXPECTED_MIGRATION_HISTORY');
    expect((await client.query('SELECT count(*)::int AS count FROM _prisma_migrations WHERE migration_name=$1', [target])).rows[0].count).toBe(2);

    await client.query('BEGIN; CREATE SCHEMA rollback_probe; SET LOCAL search_path TO rollback_probe');
    await expect(client.query(readFileSync(corrected, 'utf8'))).rejects.toThrow();
    await client.query('ROLLBACK');
    expect((await client.query("SELECT to_regnamespace('rollback_probe') AS name")).rows[0].name).toBeNull();

    const insert = `INSERT INTO territory_manager_neighborhood_scope_versions
      (assignment_id, neighborhood_ids, effective_from, agreement_reference, change_reason, created_by)
      VALUES ($1, $2, '2026-01-01', $3, $4, 'test')`;
    const valid = ['00000000-0000-0000-0000-000000000001', ['x'], 'agreement', 'valid reason'];
    await client.query('BEGIN');
    await client.query(insert, valid);
    await client.query('SAVEPOINT before_invalid');
    await expect(client.query(insert, valid)).rejects.toMatchObject({ code: '23505' });
    await client.query('ROLLBACK TO SAVEPOINT before_invalid');
    await expect(client.query(insert, ['00000000-0000-0000-0000-000000000002', ['x'], 'agreement', 'valid reason'])).rejects.toMatchObject({ code: '23503' });
    await client.query('ROLLBACK TO SAVEPOINT before_invalid');
    await expect(client.query(insert, [valid[0], ['x'], 'short', 'valid reason'])).rejects.toMatchObject({ code: '23514' });
    await client.query('ROLLBACK TO SAVEPOINT before_invalid');
    await expect(client.query(insert, [valid[0], ['x', null], 'agreement', 'valid reason'])).rejects.toMatchObject({ code: '23514' });
    await client.query('ROLLBACK');
    expect((await client.query('SELECT count(*)::int AS count FROM territory_manager_neighborhood_scope_versions')).rows[0].count).toBe(0);
    expect((await client.query('SELECT amount FROM synthetic_finance_history')).rows).toEqual([{ amount: 12345 }]);
  }, 120000);
});
