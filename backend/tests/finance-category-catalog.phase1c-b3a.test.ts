import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';

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
  sort_order?: number;
}>;

const CODE_REGEX = /^[A-Z0-9][A-Z0-9._-]*$/;
const ACTIVE_REQUIRED_CODES = ['GESTAO_TERRITORIAL', 'REGULACAO_MUNICIPAL', 'PROCESSAMENTO_PAGAMENTOS', 'RECEITAS_OPERACIONAIS'];
const INACTIVE_LEGACY_CODES = ['RECEITA_MENSALIDADE_LEGACY', 'ASAAS_LEGACY', 'EQUIPAMENTOS_LEGACY', 'IMPOSTOS_LEGACY'];

function buildCategoryMap() {
  return new Map(categories.map((category) => [category.code, category] as const));
}

function buildChildrenMap() {
  const children = new Map<string, string[]>();

  for (const category of categories) {
    if (!category.parent_code) continue;
    const list = children.get(category.parent_code) ?? [];
    list.push(category.code);
    children.set(category.parent_code, list);
  }

  return children;
}

function detectCycle(): string[] | null {
  const map = buildCategoryMap();

  for (const start of categories) {
    const path = new Set<string>();
    let current: string | undefined | null = start.code;

    while (current) {
      if (path.has(current)) {
        return [...path, current];
      }
      path.add(current);
      current = map.get(current)?.parent_code ?? null;
    }
  }

  return null;
}

function deterministicCategoryId(source: string) {
  return `fcat_${createHash('md5').update(source).digest('hex')}`;
}

describe('finance category catalog phase 1C-B 3A', () => {
  it('matches the required structure and catalog invariants', () => {
    const categoryMap = buildCategoryMap();
    const childrenMap = buildChildrenMap();

    expect(categories).toHaveLength(65);
    expect(categories.filter((category) => category.is_active !== false)).toHaveLength(59);
    expect(categories.filter((category) => category.is_active === false)).toHaveLength(6);
    expect(categories.filter((category) => !category.parent_code)).toHaveLength(14);
    expect(categories.filter((category) => category.parent_code).length).toBe(51);

    expect(
      categories.reduce<Record<string, number>>((accumulator, category) => {
        accumulator[category.kind] = (accumulator[category.kind] ?? 0) + 1;
        return accumulator;
      }, {}),
    ).toEqual({
      REVENUE: 7,
      EXPENSE: 38,
      ADJUSTMENT: 2,
      CONTRIBUTION: 2,
      WITHDRAWAL: 2,
      TRANSFER: 2,
      LIABILITY: 8,
      CLEARING: 4,
    });

    const uniqueCodes = new Set(categories.map((category) => category.code));
    expect(uniqueCodes.size).toBe(categories.length);

    const siblingSortOrders = new Set<string>();
    for (const category of categories) {
      expect(category.code).toMatch(CODE_REGEX);
      expect(category.is_system).toBe(true);
      expect(category.default_direction).toMatch(/^(IN|OUT)$/);

      if (category.parent_code) {
        const parent = categoryMap.get(category.parent_code);
        expect(parent).toBeDefined();
        expect(parent?.kind).toBe(category.kind);
        expect(parent?.is_active === false && category.is_active !== false).toBe(false);

        const key = `${category.parent_code}:${category.sort_order}`;
        expect(siblingSortOrders.has(key)).toBe(false);
        siblingSortOrders.add(key);
      }
    }

    expect(detectCycle()).toBeNull();

    const childCount = categories.filter((category) => category.parent_code).length;
    expect(childCount).toBe(51);

    for (const code of ACTIVE_REQUIRED_CODES) {
      expect(categoryMap.get(code)?.is_active).toBe(true);
    }

    for (const code of INACTIVE_LEGACY_CODES) {
      expect(categoryMap.get(code)?.is_active).toBe(false);
      expect(categoryMap.get(code)?.is_system).toBe(true);
      expect(categoryMap.get(code)?.code).toMatch(CODE_REGEX);
    }

    const activeCodes = categories.filter((category) => category.is_active !== false).map((category) => category.code);
    for (const forbidden of ['ASAAS_LEGACY', 'EQUIPAMENTOS_LEGACY', 'IMPOSTOS_LEGACY', 'RECEITA_MENSALIDADE_LEGACY', 'COMBO_PREMIUM']) {
      expect(activeCodes).not.toContain(forbidden);
    }
  });

  it('keeps PUBLICIDADE_DIGITAL canonical seed attributes with deterministic id', () => {
    const categoryMap = buildCategoryMap();
    const publicidade = categoryMap.get('PUBLICIDADE_DIGITAL');

    expect(publicidade).toBeDefined();
    expect(publicidade?.idSource).toBe('publicidade_digital');
    expect(deterministicCategoryId(publicidade?.idSource ?? '')).toBe('fcat_531f9f95b7ba8537f54c773603cec791');
    expect(publicidade?.kind).toBe('EXPENSE');
    expect(publicidade?.parent_code).toBe('MARKETING_E_VENDAS');
    expect(publicidade?.is_active).toBe(true);
    expect(publicidade?.default_direction).toBe('OUT');
    expect(publicidade?.sort_order).toBe(6020);
    expect(publicidade?.is_system).toBe(true);
  });
});
