import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { preflight, verifyResolution } = require('../scripts/repair-manager-scope-p3018.js');
const target = '20261028203000_manager_neighborhood_scope_versions';
const table = 'territory_manager_neighborhood_scope_versions';
const uniqueIndex = `${table}_assignment_id_effective_from_key`.slice(0, 63);

const applied = readdirSync(join(__dirname, '../prisma/migrations'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && entry.name !== target)
  .map((entry) => ({ migration_name: entry.name }));

function fixture(options: { scopeRows?: number; badIndex?: boolean; resolved?: boolean } = {}) {
  const query = async (sql: string) => {
    if (sql.includes('SELECT finished_at, rolled_back_at, logs')) {
      return { rows: [{ finished_at: null, rolled_back_at: null, logs: 'P3018 42P07 relation already exists' }] };
    }
    if (sql.includes('SELECT migration_name FROM public._prisma_migrations')) {
      return { rows: applied };
    }
    if (sql.includes('to_regclass')) {
      return { rows: [{ name: table }] };
    }
    if (sql.includes('information_schema.columns')) {
      return { rows: [
        'id', 'assignment_id', 'neighborhood_ids', 'effective_from', 'agreement_reference',
        'change_reason', 'created_by', 'created_at', 'canceled_at', 'canceled_by', 'cancel_reason',
      ].map((column_name) => ({ column_name })) };
    }
    if (sql.includes('COUNT(*)::integer')) {
      return { rows: [{ total: options.scopeRows ?? 0 }] };
    }
    if (sql.includes('FROM pg_index')) {
      return { rows: [
        { name: `${table}_pkey`, is_primary: true, is_unique: true, definition: 'PRIMARY KEY' },
        {
          name: options.badIndex ? 'unexpected_index' : uniqueIndex,
          is_primary: false, is_unique: true,
          definition: `CREATE UNIQUE INDEX ON public.${table} USING btree (assignment_id, effective_from)`,
        },
      ] };
    }
    if (sql.includes('FROM pg_constraint')) {
      return { rows: [
        `${table}_pkey`, 'manager_scope_nonempty_reason',
        'manager_scope_nonempty_agreement', 'manager_scope_no_null_neighborhoods',
      ].map((conname) => ({ conname, contype: conname.endsWith('_pkey') ? 'p' : 'c' })) };
    }
    if (sql.includes('ORDER BY started_at DESC')) {
      return { rows: [{ finished_at: null, rolled_back_at: options.resolved ? new Date() : null }] };
    }
    throw new Error('Unexpected SQL in synthetic preflight');
  };
  return { query };
}

describe('P3018 recovery read-only preflight', () => {
  it('accepts only the observed partial table state and requires a resolution record afterward', async () => {
    await expect(preflight(fixture())).resolves.toBeUndefined();
    await expect(verifyResolution(fixture({ resolved: true }))).resolves.toBeUndefined();
  });

  it('rejects unexpected data rather than performing migration-history writes', async () => {
    await expect(preflight(fixture({ scopeRows: 1 }))).rejects.toThrow('RECOVERY_ABORT_UNEXPECTED_SCOPE_ROWS');
  });

  it('rejects unexpected index layouts even when the migration is marked failed', async () => {
    await expect(preflight(fixture({ badIndex: true }))).rejects.toThrow('RECOVERY_ABORT_EXPECTED_UNIQUE_INDEX_MISSING');
  });
});
