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
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { PrismaClient } = require('@prisma/client');

const MIGRATION = '20261028203000_manager_neighborhood_scope_versions';
const CONFIRMATION = 'RECOVER_MANAGER_SCOPE_P3018_20261028';
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
    return await task({
      query: async (sql, params = []) => {
        stage = `read_query_${++queryNumber}`;
        return { rows: await prisma.$queryRawUnsafe(sql, ...params) };
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function preflight(client) {
  const { rows: migrations } = await client.query(
    `SELECT finished_at, rolled_back_at, logs
     FROM public._prisma_migrations WHERE migration_name = $1`,
    [MIGRATION],
  );
  assert(migrations.length === 1, 'UNEXPECTED_MIGRATION_HISTORY');
  assert(migrations[0].finished_at === null && migrations[0].rolled_back_at === null,
    'MIGRATION_NOT_IN_FAILED_STATE');
  assert(/42P07|P3018|already exists/.test(migrations[0].logs || ''),
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

  const { rows: tables } = await client.query(
    `SELECT to_regclass('public.territory_manager_neighborhood_scope_versions')::text AS name`,
  );
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
  assert(process.env.MIGRATION_RECOVERY_CONFIRMATION === CONFIRMATION,
    'EXPLICIT_CONFIRMATION_REQUIRED');
  assert(process.env.DATABASE_URL?.startsWith('postgresql://'), 'DATABASE_URL_MISSING');

  await withDatabase(preflight);

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
