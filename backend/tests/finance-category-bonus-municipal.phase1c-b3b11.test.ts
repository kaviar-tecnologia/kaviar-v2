import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const seedModule = await import('../prisma/seed');
const seed = (seedModule as any).default ?? seedModule;
const categories = seed.FINANCE_CATEGORY_SEEDS as Array<{
  idSource: string;
  code: string;
  name: string;
  kind: string;
  parent_code?: string | null;
  default_direction?: string | null;
  requires_document?: boolean;
  is_active?: boolean;
  is_system?: boolean;
  is_postable: boolean;
  sort_order?: number;
}>;

const BONUS_CODE = 'BONUS_ANUAL_MOTORISTAS_A_PAGAR';
const MUNICIPAL_CODE = 'TAXAS_MUNICIPAIS_SOBRE_CORRIDAS';
const BONUS_ID = 'fcat_fb31c48ce603495524e0afcb71625353';
const MUNICIPAL_ID = 'fcat_cd17b84eaa92c309e549b872b98146ac';

function deterministicCategoryId(source: string) {
  return `fcat_${createHash('md5').update(source).digest('hex')}`;
}

function byCode(code: string) {
  return categories.find((category) => category.code === code);
}

describe('finance category catalog phase 1C-B 3B-1.1 (bonus + municipal fees)', () => {
  it('adds BONUS_ANUAL_MOTORISTAS_A_PAGAR as an active postable terminal LIABILITY under OBRIGACOES_OPERACIONAIS', () => {
    const bonus = byCode(BONUS_CODE);

    expect(bonus).toBeDefined();
    expect(bonus?.idSource).toBe('passivo.bonus_anual_motoristas');
    expect(deterministicCategoryId(bonus?.idSource ?? '')).toBe(BONUS_ID);
    expect(bonus?.kind).toBe('LIABILITY');
    expect(bonus?.default_direction).toBe('OUT');
    expect(bonus?.is_active).toBe(true);
    expect(bonus?.is_postable).toBe(true);
    expect(bonus?.is_system).toBe(true);
    expect(bonus?.parent_code).toBe('OBRIGACOES_OPERACIONAIS');
    expect(bonus?.parent_code).not.toBe(BONUS_CODE);
    expect(bonus?.sort_order).toBe(13070);

    const parent = byCode('OBRIGACOES_OPERACIONAIS');
    expect(parent).toBeDefined();
    expect(parent?.kind).toBe('LIABILITY');
    expect(parent?.is_active).toBe(true);
    expect(parent?.is_postable).toBe(false);
    expect(parent?.parent_code ?? null).toBeNull();

    expect(categories.filter((category) => category.parent_code === BONUS_CODE)).toHaveLength(0);
    expect(bonus?.name).not.toMatch(/%|\d/);
  });

  it('adds TAXAS_MUNICIPAIS_SOBRE_CORRIDAS as an active postable terminal EXPENSE under OPERACOES_E_SUPORTE', () => {
    const municipal = byCode(MUNICIPAL_CODE);

    expect(municipal).toBeDefined();
    expect(municipal?.idSource).toBe('despesa.taxas_municipais_corridas');
    expect(deterministicCategoryId(municipal?.idSource ?? '')).toBe(MUNICIPAL_ID);
    expect(municipal?.kind).toBe('EXPENSE');
    expect(municipal?.default_direction).toBe('OUT');
    expect(municipal?.is_active).toBe(true);
    expect(municipal?.is_postable).toBe(true);
    expect(municipal?.is_system).toBe(true);
    expect(municipal?.parent_code).toBe('OPERACOES_E_SUPORTE');
    expect(municipal?.parent_code).not.toBe(MUNICIPAL_CODE);
    expect(municipal?.sort_order).toBe(4040);

    const parent = byCode('OPERACOES_E_SUPORTE');
    expect(parent).toBeDefined();
    expect(parent?.kind).toBe('EXPENSE');
    expect(parent?.is_active).toBe(true);
    expect(parent?.is_postable).toBe(false);
    expect(parent?.parent_code ?? null).toBeNull();

    expect(categories.filter((category) => category.parent_code === MUNICIPAL_CODE)).toHaveLength(0);

    expect(municipal?.code).not.toMatch(/RIO|JANEIRO/i);
    expect(municipal?.name).not.toMatch(/rio de janeiro/i);
    expect(municipal?.name).not.toMatch(/%|\d/);
  });

  it('keeps ids and codes unique across the 65-category catalog', () => {
    expect(categories).toHaveLength(65);
    expect(new Set(categories.map((category) => category.code)).size).toBe(65);
    expect(new Set(categories.map((category) => deterministicCategoryId(category.idSource))).size).toBe(65);
  });

  it('does not modify any of the previous 51 categories (excluding activated and new operational)', () => {
    // Categories added in this frente (operational categories) and the bonus/municipal pair
    const EXCLUDED_CODES = new Set([
      BONUS_CODE, MUNICIPAL_CODE,
      // Frente 2/9 additions
      'IMPOSTOS_E_TAXAS', 'IRPJ', 'CSLL', 'ISS', 'PIS_COFINS', 'SIMPLES_NACIONAL', 'OUTROS_IMPOSTOS',
      'GITHUB', 'GESTORES_TERRITORIAIS', 'LICENCAS_MUNICIPAIS', 'DIVULGACAO_MARKETING', 'SERVICOS_JURIDICOS',
      // Activated in Frente 2/9 (is_active/is_postable changed)
      'CONTABILIDADE', 'PRO_LABORE', 'OUTRAS_DESPESAS',
    ]);

    const previous = categories.filter(
      (category) => !EXCLUDED_CODES.has(category.code),
    );
    expect(previous).toHaveLength(48);

    const snapshot = previous.map((category) => ({
      id: deterministicCategoryId(category.idSource),
      code: category.code,
      kind: category.kind,
      parent_code: category.parent_code ?? null,
      is_active: category.is_active !== false,
      is_postable: category.is_postable,
      sort_order: category.sort_order ?? 0,
    }));
    const hash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');

    // Frozen structural snapshot of the 48 unchanged categories (excluding bonus/municipal
    // and operational categories added/activated in Frente 2/9).
    expect(hash).toMatchInlineSnapshot(`"c8f8c3ff8b870540485dee620a15070c421fbedeb178a2be95b117af335f27ff"`);
  });

  it('contains the expected defensive markers in the 3B-1.1 migration and never creates accounts, transactions or allocations', () => {
    const migrationPath = resolve(
      process.cwd(),
      'prisma',
      'migrations',
      '20260720010000_add_financial_bonus_and_municipal_fee_categories',
      'migration.sql',
    );
    const migrationSql = readFileSync(migrationPath, 'utf8');

    const requiredFragments = [
      'Expected 51 finance categories before 3B-1.1 additions, found %',
      'Expected is_postable=true for 29 categories before 3B-1.1 additions, found %',
      'Expected 53 finance categories after 3B-1.1 additions, found %',
      'Expected 44 active finance categories after 3B-1.1 additions, found %',
      'Expected 53 unique finance category ids after 3B-1.1 additions, found %',
      'Expected 53 unique finance category codes after 3B-1.1 additions, found %',
      'Expected is_postable=true for 31 categories after 3B-1.1 additions, found %',
      'Expected is_postable=false for 22 categories after 3B-1.1 additions, found %',
      'Expected no category with children to be postable after 3B-1.1, found %',
      'Expected no inactive category to be postable after 3B-1.1, found %',
      'Expected no root category to be postable after 3B-1.1, found %',
      'Expected 3B-1.1 categories to be terminal, found % children',
      'OBRIGACOES_OPERACIONAIS parent is not in expected active non-postable root state for 3B-1.1',
      'OPERACOES_E_SUPORTE parent is not in expected active non-postable root state for 3B-1.1',
      'skipping as idempotent no-op',
      'financial_transactions count changed unexpectedly during 3B-1.1',
      'financial_transaction_allocations count changed unexpectedly during 3B-1.1',
      'financial_accounts count changed unexpectedly during 3B-1.1',
    ];

    for (const fragment of requiredFragments) {
      expect(migrationSql).toContain(fragment);
    }

    expect(migrationSql).not.toMatch(/INSERT INTO financial_(accounts|transactions|transaction_allocations|cost_centers|recognition_policies)/);
    expect(migrationSql).not.toMatch(/rio[\s_-]*de[\s_-]*janeiro/i);
    expect(migrationSql).not.toContain('1,5');
    expect(migrationSql).not.toContain('1.5');
  });
});
