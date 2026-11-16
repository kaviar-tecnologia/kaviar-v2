/*
 * One-time production repair for failed migration
 * 20261028203000_manager_neighborhood_scope_versions (Deploy Backend #801).
 * Invoked ONLY by the guarded backend-orchestrated migration workflow after
 * its mandatory private RDS snapshot has been verified.
 *
 * Read-only preflight before any writes; never drops tables or data.
 */
'use strict';

const { spawnSync } = require('node:child_process');
const { readdirSync, readFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { join } = require('node:path');
const { PrismaClient } = require('@prisma/client');

const MIGRATION = '20261028203000_manager_neighborhood_scope_versions';
const CONFIRMATION = 'RECOVER_MANAGER_SCOPE_P3018_20261028';
const EMPTY_CONFIRMATION = 'RECOVER_MANAGER_SCOPE_EMPTY_20261028';
const FAILED_CHECKSUM = 'bef0f3b23cf61ea503a79888660a96180e1636ded16bd6f471cca0af3c27cc85';
const CORRECTED_CHECKSUM = '607ac2f7b56b2b8f1a33acec4d7ce72ba7dd835c2a93c7e81cfa30109455987b';
const TABLE = 'territory_manager_neighborhood_scope_versions';
const UNIQUE_INDEX = `${TABLE}_assignment_id_effective_from_key`.slice(0, 63);
const EXPECTED_COLUMNS = [
  'id', 'assignment_id', 'neighborhood_ids', 'effective_from',
  'agreement_reference', 'change_reason', 'created_by', 'created_at',
  'canceled_at', 'canceled_by', 'cancel_reason',
];
let stage = 'startup';

function assert(condition, code) {
  if (!condition) throw new Error(`RECOVERY_ABORT_${code}`);
}

async function withDatabase(task) {
  // Use the same Prisma engine/connection settings that migrate deploy uses.
  // A standalone node-postgres client can negotiate TLS differently on RDS.
  const prisma = new PrismaClient();
  stage = 'connect';
  try {
    await prisma.$connect();
    let queryNumber = 0;
    return await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
      return task({
        query: async (sql, params = []) => {
          stage = `read_query_${++queryNumber}`;
          return { rows: await tx.$queryRawUnsafe(sql, ...params) };
        },
      });
    }, { isolationLevel: 'RepeatableRead', timeout: 30000 });
  } finally {
    await prisma.$disconnect();
  }
}

async function preflight(client, confirmation = CONFIRMATION) {
  assert([CONFIRMATION, EMPTY_CONFIRMATION].includes(confirmation), 'EXPLICIT_CONFIRMATION_REQUIRED');
  const migrationFile = readFileSync(join(__dirname, '../prisma/migrations', MIGRATION, 'migration.sql'));
  assert(createHash('sha256').update(migrationFile).digest('hex') === CORRECTED_CHECKSUM,
    'CORRECTED_MIGRATION_CHECKSUM_MISMATCH');
  const { rows: migrations } = await client.query(
    `SELECT finished_at, rolled_back_at, logs, checksum, applied_steps_count
     FROM public._prisma_migrations WHERE migration_name = $1`,
    [MIGRATION],
  );
  assert(migrations.length === 1, 'UNEXPECTED_MIGRATION_HISTORY');
  assert(migrations[0].finished_at === null && migrations[0].rolled_back_at === null,
    'MIGRATION_NOT_IN_FAILED_STATE');
  assert(migrations[0].checksum === FAILED_CHECKSUM && migrations[0].applied_steps_count === 0,
    'FAILED_MIGRATION_MISMATCH');
  assert(/42P07/.test(migrations[0].logs || '') &&
    /territory_manager_neighborhood_scope_versions_assignment_id_eff/.test(migrations[0].logs || ''),
    'FAILURE_CAUSE_DOES_NOT_MATCH');

  const { rows: appliedMigrations } = await client.query(
    `SELECT migration_name FROM public._prisma_migrations
     WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
  );
  const appliedNames = new Set(appliedMigrations.map(({ migration_name }) => migration_name));
  const diskMigrations = readdirSync(join(__dirname, '../prisma/migrations'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  assert(diskMigrations.filter((name) => name !== MIGRATION && !appliedNames.has(name)).length === 0,
    'OTHER_UNAPPLIED_MIGRATIONS');
  const { rows: failedOthers } = await client.query(
    `SELECT migration_name FROM public._prisma_migrations
     WHERE finished_at IS NULL AND rolled_back_at IS NULL AND migration_name <> $1`,
    [MIGRATION],
  );
  assert(failedOthers.length === 0, 'OTHER_FAILED_MIGRATIONS');

  const { rows: tables } = await client.query(
    `SELECT to_regclass('public.territory_manager_neighborhood_scope_versions')::text AS name`,
  );
  if (confirmation === EMPTY_CONFIRMATION) {
    assert(tables.length === 1 && tables[0].name === null, 'EXPECTED_EMPTY_TABLE_MISSING');
    const { rows: objects } = await client.query(
      `SELECT c.relname::text AS name FROM pg_class c
       JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname LIKE 'territory_manager_neighborhood_scope_versions%'
       UNION ALL
       SELECT t.typname::text AS name FROM pg_type t
       JOIN pg_namespace n ON n.oid = t.typnamespace
       WHERE n.nspname = 'public' AND t.typname LIKE 'territory_manager_neighborhood_scope_versions%'`,
    );
    assert(objects.length === 0, 'UNEXPECTED_SCOPE_OBJECTS');
    process.stdout.write('RECOVERY_PREFLIGHT_VALIDATED: failed checksum, absent scope objects, no other pending migrations\n');
    return;
  }
  assert(tables[0]?.name !== null, 'PARTIAL_TABLE_MISSING');

  const { rows: columns } = await client.query(
    `SELECT column_name::text AS column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1`,
    [TABLE],
  );
  const names = columns.map(({ column_name }) => column_name).sort();
  assert(JSON.stringify(names) === JSON.stringify([...EXPECTED_COLUMNS].sort()),
    'PARTIAL_TABLE_COLUMNS_MISMATCH');

  const { rows: counts } = await client.query(
    `SELECT COUNT(*)::integer AS total FROM public.territory_manager_neighborhood_scope_versions`,
  );
  assert(counts[0]?.total === 0, 'UNEXPECTED_SCOPE_ROWS');

  const { rows: indexes } = await client.query(
    `SELECT idx.relname::text AS name, i.indisunique AS is_unique, i.indisprimary AS is_primary,
            pg_get_indexdef(i.indexrelid) AS definition
     FROM pg_index i
     JOIN pg_class idx ON idx.oid = i.indexrelid
     WHERE i.indrelid = 'public.territory_manager_neighborhood_scope_versions'::regclass`,
  );
  assert(indexes.length === 2, 'UNEXPECTED_PARTIAL_INDEX_COUNT');
  assert(indexes.some((index) => index.is_primary && index.is_unique),
    'PRIMARY_KEY_INDEX_MISSING');
  assert(indexes.some((index) => index.name === UNIQUE_INDEX && index.is_unique &&
    !index.is_primary && /\(assignment_id, effective_from\)/.test(index.definition)),
  'EXPECTED_UNIQUE_INDEX_MISSING');

  const { rows: constraints } = await client.query(
    `SELECT conname::text AS conname, contype::text AS contype FROM pg_constraint
     WHERE conrelid = 'public.territory_manager_neighborhood_scope_versions'::regclass`,
  );
  assert(constraints.length === 4 && !constraints.some((c) => c.contype === 'f'),
    'UNEXPECTED_PARTIAL_CONSTRAINTS');
  for (const expected of [
    'territory_manager_neighborhood_scope_versions_pkey',
    'manager_scope_nonempty_reason',
    'manager_scope_nonempty_agreement',
    'manager_scope_no_null_neighborhoods',
  ]) {
    assert(constraints.some((c) => c.conname === expected),
      'EXPECTED_CONSTRAINT_MISSING');
  }
  process.stdout.write('RECOVERY_PREFLIGHT_VALIDATED: partial table, index, constraints, zero rows, failed history\n');
}

async function verifyResolution(client) {
  const { rows } = await client.query(
    `SELECT finished_at, rolled_back_at FROM public._prisma_migrations
     WHERE migration_name = $1 ORDER BY started_at DESC`, [MIGRATION],
  );
  assert(rows.length === 1 && rows[0].rolled_back_at !== null && rows[0].finished_at === null,
    'RESOLVE_NOT_RECORDED');
  process.stdout.write('RECOVERY_RESOLVE_VERIFIED: original failed record marked rolled back\n');
}

async function main() {
  assert([CONFIRMATION, EMPTY_CONFIRMATION].includes(process.env.MIGRATION_RECOVERY_CONFIRMATION),
    'EXPLICIT_CONFIRMATION_REQUIRED');
  assert(process.env.DATABASE_URL?.startsWith('postgresql://'), 'DATABASE_URL_MISSING');

  await withDatabase(client => preflight(client, process.env.MIGRATION_RECOVERY_CONFIRMATION));

  // Only Prisma's migration-history operation writes here; table and rows stay intact.
  stage = 'resolve';
  const result = spawnSync('npx', ['prisma', 'migrate', 'resolve', '--rolled-back', MIGRATION], {
    stdio: 'inherit',
    env: process.env,
    timeout: 120000,
  });
  assert(result.status === 0, 'PRISMA_RESOLVE_FAILED');
  await withDatabase(verifyResolution);
}

module.exports = { preflight, verifyResolution };

if (require.main === module) {
  main().catch((error) => {
    // Never print the connection URL or process.env in CI/ECS logs.
    const code = String(error.code || error.meta?.code || 'UNKNOWN');
    const safeCode = /^[a-zA-Z0-9_]{2,24}$/.test(code) ? code : 'UNKNOWN';
    const detail = error.message?.startsWith('RECOVERY_ABORT_')
      ? error.message
      : `RECOVERY_ABORT_${stage.toUpperCase()}_ERROR code=${safeCode}`;
    process.stderr.write(`${detail}\n`);
    process.exitCode = 1;
  });
}
