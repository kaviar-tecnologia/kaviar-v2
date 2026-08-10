/**
 * Integration test: align_finance_category_catalog migration
 * Runs against a real PostgreSQL database (kaviar_migration_test).
 *
 * Proves:
 * 1. First execution creates 12 + activates 3 categories
 * 2. Second execution is idempotent (no duplicates, same result)
 * 3. Structural conflict on code with wrong ID → RAISE EXCEPTION
 * 4. Structural conflict on ID with wrong code → RAISE EXCEPTION
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execSync } from 'child_process';
import { resolve } from 'path';
import pg from 'pg';

const DB_NAME = 'kaviar_migration_test';
const DB_URL = `postgresql://postgres:postgres@127.0.0.1:5432/${DB_NAME}`;
const MIGRATION_PATH = resolve(__dirname, '../prisma/migrations/20260809210000_align_finance_category_catalog/migration.sql');

function psqlExec(sql: string): { success: boolean; output: string } {
  try {
    const output = execSync(`PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d ${DB_NAME} -v ON_ERROR_STOP=1`, {
      input: sql,
      encoding: 'utf-8',
      timeout: 10000,
    });
    return { success: true, output };
  } catch (err: any) {
    return { success: false, output: err.stderr || err.stdout || err.message };
  }
}

function psqlFile(path: string): { success: boolean; output: string } {
  try {
    const output = execSync(
      `PGPASSWORD=postgres psql -h 127.0.0.1 -U postgres -d ${DB_NAME} -v ON_ERROR_STOP=1 -f "${path}"`,
      { encoding: 'utf-8', timeout: 10000 }
    );
    return { success: true, output };
  } catch (err: any) {
    return { success: false, output: err.stderr || err.stdout || err.message };
  }
}

const BASELINE_SQL = `
DROP TABLE IF EXISTS financial_categories CASCADE;
DROP TYPE IF EXISTS financial_category_kind CASCADE;
DROP TYPE IF EXISTS financial_direction CASCADE;

CREATE TYPE financial_category_kind AS ENUM ('REVENUE','EXPENSE','CONTRIBUTION','WITHDRAWAL','TRANSFER','LIABILITY','CLEARING','ADJUSTMENT');
CREATE TYPE financial_direction AS ENUM ('IN','OUT');

CREATE TABLE financial_categories (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  kind financial_category_kind NOT NULL,
  parent_id TEXT REFERENCES financial_categories(id) ON DELETE SET NULL,
  default_direction financial_direction,
  requires_document BOOLEAN NOT NULL DEFAULT false,
  is_system BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_postable BOOLEAN NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by_admin_id TEXT,
  updated_by_admin_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO financial_categories (id, code, name, kind, parent_id, default_direction, is_system, is_active, is_postable, sort_order) VALUES
  ('fcat_8809bbe62cb78a37d898848ab12fe6a5', 'TECNOLOGIA_E_PRODUTO', 'Tecnologia e produto', 'EXPENSE', NULL, 'OUT', true, true, false, 5000),
  ('fcat_95cbbd9bad2fbecfce1f9c76829bd191', 'OPERACOES_E_SUPORTE', 'Operações e suporte', 'EXPENSE', NULL, 'OUT', true, true, false, 4000),
  ('fcat_bafd5ddb91d03c60a27748d76e09d09c', 'DESPESAS_ADMINISTRATIVAS', 'Despesas administrativas', 'EXPENSE', NULL, 'OUT', true, true, false, 7000),
  ('fcat_a760da5ca4c4655821994de82acb0fb8', 'MARKETING_E_VENDAS', 'Marketing e vendas', 'EXPENSE', NULL, 'OUT', true, true, false, 6000),
  ('fcat_3e1e8b4ab1a2c12d07c4db49b4c1ef92', 'AWS', 'AWS', 'EXPENSE', 'fcat_8809bbe62cb78a37d898848ab12fe6a5', 'OUT', true, true, true, 5010),
  ('fcat_6be87ef879a1a77ba11e2c1b7c1808cb', 'EXPO', 'Expo', 'EXPENSE', 'fcat_8809bbe62cb78a37d898848ab12fe6a5', 'OUT', true, true, true, 5040),
  ('fcat_e11c24a9128072b5c8d72a1160f120cb', 'CONTABILIDADE', 'Contabilidade', 'EXPENSE', 'fcat_bafd5ddb91d03c60a27748d76e09d09c', 'OUT', true, false, false, 7010),
  ('fcat_26dc69afcd59ee348780a6616ad410ff', 'PRO_LABORE', 'Pró-labore', 'EXPENSE', 'fcat_bafd5ddb91d03c60a27748d76e09d09c', 'OUT', true, false, false, 7020),
  ('fcat_986dd29e49fd4a974f30244fff3be359', 'OUTRAS_DESPESAS', 'Outras despesas', 'EXPENSE', 'fcat_bafd5ddb91d03c60a27748d76e09d09c', 'OUT', true, false, false, 7030);
`;

let pool: pg.Pool;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DB_URL });
});

afterAll(async () => {
  await pool.end();
});

function resetBaseline() {
  const result = psqlExec(BASELINE_SQL);
  if (!result.success) throw new Error(`Baseline setup failed: ${result.output}`);
}

function runMigration() {
  return psqlFile(MIGRATION_PATH);
}

async function getCategoryByCode(code: string) {
  const { rows } = await pool.query('SELECT * FROM financial_categories WHERE code = $1', [code]);
  return rows[0] || null;
}

async function countCategories(): Promise<number> {
  const { rows } = await pool.query('SELECT COUNT(*)::int as count FROM financial_categories');
  return rows[0].count;
}

async function getAllCategoriesSnapshot() {
  const { rows } = await pool.query(
    'SELECT id, code, is_active, is_postable, parent_id, kind, sort_order, requires_document FROM financial_categories ORDER BY code'
  );
  return rows;
}

describe('Migration: align_finance_category_catalog — PostgreSQL integration', () => {

  describe('First execution on baseline', () => {
    beforeAll(() => {
      resetBaseline();
      const result = runMigration();
      if (!result.success) throw new Error(`Migration failed: ${result.output}`);
    });

    it('creates IMPOSTOS_E_TAXAS with correct ID and properties', async () => {
      const cat = await getCategoryByCode('IMPOSTOS_E_TAXAS');
      expect(cat).not.toBeNull();
      expect(cat.id).toBe('fcat_9cb6d78d7a883ba1c3e30f0973dbe341');
      expect(cat.kind).toBe('EXPENSE');
      expect(cat.is_active).toBe(true);
      expect(cat.is_postable).toBe(false);
      expect(cat.parent_id).toBeNull();
      expect(cat.sort_order).toBe(2000);
    });

    it('creates all 6 IMPOSTOS children with correct parent FK', async () => {
      const codes = ['IRPJ', 'CSLL', 'ISS', 'PIS_COFINS', 'SIMPLES_NACIONAL', 'OUTROS_IMPOSTOS'];
      for (const code of codes) {
        const cat = await getCategoryByCode(code);
        expect(cat, `${code} should exist`).not.toBeNull();
        expect(cat.parent_id).toBe('fcat_9cb6d78d7a883ba1c3e30f0973dbe341');
        expect(cat.is_active).toBe(true);
        expect(cat.is_postable).toBe(true);
        expect(cat.kind).toBe('EXPENSE');
      }
    });

    it('creates GITHUB with correct ID and parent', async () => {
      const cat = await getCategoryByCode('GITHUB');
      expect(cat).not.toBeNull();
      expect(cat.id).toBe('fcat_da6b3ede41336c2473cd22bbc1affc51');
      expect(cat.parent_id).toBe('fcat_8809bbe62cb78a37d898848ab12fe6a5');
      expect(cat.is_active).toBe(true);
      expect(cat.is_postable).toBe(true);
      expect(cat.sort_order).toBe(5015);
    });

    it('creates GESTORES_TERRITORIAIS and LICENCAS_MUNICIPAIS', async () => {
      const gt = await getCategoryByCode('GESTORES_TERRITORIAIS');
      expect(gt.id).toBe('fcat_df1314d767be46d6f0d7c34cf7ea5afa');
      expect(gt.parent_id).toBe('fcat_95cbbd9bad2fbecfce1f9c76829bd191');
      expect(gt.requires_document).toBe(false);

      const lm = await getCategoryByCode('LICENCAS_MUNICIPAIS');
      expect(lm.id).toBe('fcat_ed994bd0ce7c65ba47a03c8724be9f36');
      expect(lm.parent_id).toBe('fcat_95cbbd9bad2fbecfce1f9c76829bd191');
      expect(lm.requires_document).toBe(true);
    });

    it('creates SERVICOS_JURIDICOS under DESPESAS_ADMINISTRATIVAS', async () => {
      const cat = await getCategoryByCode('SERVICOS_JURIDICOS');
      expect(cat.id).toBe('fcat_ec867fa7664d6e952cbed1b850eb2e66');
      expect(cat.parent_id).toBe('fcat_bafd5ddb91d03c60a27748d76e09d09c');
    });

    it('creates DIVULGACAO_MARKETING under MARKETING_E_VENDAS', async () => {
      const cat = await getCategoryByCode('DIVULGACAO_MARKETING');
      expect(cat.id).toBe('fcat_da2a5828541b6e0e1b2c3bc7e87d1254');
      expect(cat.parent_id).toBe('fcat_a760da5ca4c4655821994de82acb0fb8');
    });

    it('activates CONTABILIDADE', async () => {
      const cat = await getCategoryByCode('CONTABILIDADE');
      expect(cat.id).toBe('fcat_e11c24a9128072b5c8d72a1160f120cb');
      expect(cat.is_active).toBe(true);
      expect(cat.is_postable).toBe(true);
    });

    it('activates PRO_LABORE', async () => {
      const cat = await getCategoryByCode('PRO_LABORE');
      expect(cat.is_active).toBe(true);
      expect(cat.is_postable).toBe(true);
    });

    it('activates OUTRAS_DESPESAS', async () => {
      const cat = await getCategoryByCode('OUTRAS_DESPESAS');
      expect(cat.is_active).toBe(true);
      expect(cat.is_postable).toBe(true);
    });

    it('does not alter pre-existing EXPO', async () => {
      const cat = await getCategoryByCode('EXPO');
      expect(cat.id).toBe('fcat_6be87ef879a1a77ba11e2c1b7c1808cb');
      expect(cat.is_active).toBe(true);
      expect(cat.is_postable).toBe(true);
    });

    it('total count is baseline(9) + new(12) = 21', async () => {
      const count = await countCategories();
      expect(count).toBe(21);
    });
  });

  describe('Second execution (idempotency)', () => {
    let snapshotAfterFirst: any[];

    beforeAll(async () => {
      snapshotAfterFirst = await getAllCategoriesSnapshot();
      const result = runMigration();
      if (!result.success) throw new Error(`Second migration run failed: ${result.output}`);
    });

    it('does not duplicate any category', async () => {
      const count = await countCategories();
      expect(count).toBe(21);
    });

    it('produces identical state to first execution', async () => {
      const snapshotAfterSecond = await getAllCategoriesSnapshot();
      expect(snapshotAfterSecond.length).toBe(snapshotAfterFirst.length);
      for (let i = 0; i < snapshotAfterFirst.length; i++) {
        expect(snapshotAfterSecond[i].id).toBe(snapshotAfterFirst[i].id);
        expect(snapshotAfterSecond[i].code).toBe(snapshotAfterFirst[i].code);
        expect(snapshotAfterSecond[i].is_active).toBe(snapshotAfterFirst[i].is_active);
        expect(snapshotAfterSecond[i].is_postable).toBe(snapshotAfterFirst[i].is_postable);
        expect(snapshotAfterSecond[i].parent_id).toBe(snapshotAfterFirst[i].parent_id);
        expect(snapshotAfterSecond[i].kind).toBe(snapshotAfterFirst[i].kind);
        expect(snapshotAfterSecond[i].sort_order).toBe(snapshotAfterFirst[i].sort_order);
      }
    });
  });

  describe('Negative: code exists with wrong ID → RAISE EXCEPTION', () => {
    it('fails when GITHUB code has non-canonical ID', () => {
      resetBaseline();
      // Insert GITHUB with wrong ID
      psqlExec(`
        INSERT INTO financial_categories (id, code, name, kind, parent_id, default_direction, is_system, is_active, is_postable, sort_order)
        VALUES ('wrong_id_for_github', 'GITHUB', 'GitHub', 'EXPENSE', 'fcat_8809bbe62cb78a37d898848ab12fe6a5', 'OUT', true, true, true, 5015)
      `);

      const result = runMigration();
      expect(result.success).toBe(false);
      expect(result.output).toContain('STRUCTURAL CONFLICT');
      expect(result.output).toContain('code=GITHUB');
      expect(result.output).toContain('wrong_id_for_github');
    });
  });

  describe('Negative: ID exists with wrong code → RAISE EXCEPTION', () => {
    it('fails when canonical GITHUB ID has different code', () => {
      resetBaseline();
      // Insert something using GITHUB's canonical ID but different code
      psqlExec(`
        INSERT INTO financial_categories (id, code, name, kind, parent_id, default_direction, is_system, is_active, is_postable, sort_order)
        VALUES ('fcat_da6b3ede41336c2473cd22bbc1affc51', 'SOMETHING_ELSE', 'Wrong', 'EXPENSE', 'fcat_8809bbe62cb78a37d898848ab12fe6a5', 'OUT', true, true, true, 5015)
      `);

      const result = runMigration();
      expect(result.success).toBe(false);
      expect(result.output).toContain('STRUCTURAL CONFLICT');
      expect(result.output).toContain('fcat_da6b3ede41336c2473cd22bbc1affc51');
      expect(result.output).toContain('SOMETHING_ELSE');
    });
  });
});
