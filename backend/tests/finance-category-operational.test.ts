/**
 * Tests for Frente 2/9 — Operational financial categories (KAVIAR real expenses).
 *
 * Validates:
 * 1. All required operational categories exist in the seed with correct attributes
 * 2. Activated categories (CONTABILIDADE, PRO_LABORE, OUTRAS_DESPESAS) are active and postable
 * 3. Tax category group (IMPOSTOS_E_TAXAS) has proper hierarchy
 * 4. All new categories have deterministic IDs via md5(idSource)
 * 5. No duplicates introduced
 * 6. Hierarchy invariants maintained (kind matches parent, no cycles)
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const seedModule = await import('../prisma/seed');
const seed = (seedModule as any).default ?? seedModule;

type CategorySeed = {
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
};

const categories: CategorySeed[] = seed.FINANCE_CATEGORY_SEEDS;

function deterministicCategoryId(source: string) {
  return `fcat_${createHash('md5').update(source).digest('hex')}`;
}

function byCode(code: string): CategorySeed | undefined {
  return categories.find((c) => c.code === code);
}

// ── New operational categories added in Frente 2/9 ──────────────────────────

const NEW_OPERATIONAL_CODES = [
  'IMPOSTOS_E_TAXAS',
  'IRPJ',
  'CSLL',
  'ISS',
  'PIS_COFINS',
  'SIMPLES_NACIONAL',
  'OUTROS_IMPOSTOS',
  'GITHUB',
  'GESTORES_TERRITORIAIS',
  'LICENCAS_MUNICIPAIS',
  'DIVULGACAO_MARKETING',
  'SERVICOS_JURIDICOS',
];

const ACTIVATED_CODES = ['CONTABILIDADE', 'PRO_LABORE', 'OUTRAS_DESPESAS'];

describe('Frente 2/9 — Operational financial categories', () => {
  describe('new categories exist with correct attributes', () => {
    it('IMPOSTOS_E_TAXAS is a root EXPENSE group (not postable)', () => {
      const cat = byCode('IMPOSTOS_E_TAXAS');
      expect(cat).toBeDefined();
      expect(cat?.kind).toBe('EXPENSE');
      expect(cat?.parent_code).toBeUndefined();
      expect(cat?.is_active).toBe(true);
      expect(cat?.is_postable).toBe(false);
      expect(cat?.default_direction).toBe('OUT');
      expect(cat?.is_system).toBe(true);
      expect(cat?.sort_order).toBe(2000);
      expect(deterministicCategoryId(cat?.idSource ?? '')).toBe('fcat_9cb6d78d7a883ba1c3e30f0973dbe341');
    });

    it.each([
      ['IRPJ', 'IRPJ', 2010, true],
      ['CSLL', 'CSLL', 2020, true],
      ['ISS', 'ISS', 2030, true],
      ['PIS_COFINS', 'PIS/COFINS', 2040, true],
      ['SIMPLES_NACIONAL', 'Simples Nacional', 2050, true],
      ['OUTROS_IMPOSTOS', 'Outros impostos e taxas', 2090, false],
    ] as const)('%s is a postable tax child of IMPOSTOS_E_TAXAS', (code, name, sortOrder, requiresDoc) => {
      const cat = byCode(code);
      expect(cat).toBeDefined();
      expect(cat?.name).toBe(name);
      expect(cat?.kind).toBe('EXPENSE');
      expect(cat?.parent_code).toBe('IMPOSTOS_E_TAXAS');
      expect(cat?.is_active).toBe(true);
      expect(cat?.is_postable).toBe(true);
      expect(cat?.default_direction).toBe('OUT');
      expect(cat?.is_system).toBe(true);
      expect(cat?.sort_order).toBe(sortOrder);
      expect(cat?.requires_document).toBe(requiresDoc);
    });

    it('GITHUB is under TECNOLOGIA_E_PRODUTO', () => {
      const cat = byCode('GITHUB');
      expect(cat).toBeDefined();
      expect(cat?.name).toBe('GitHub');
      expect(cat?.kind).toBe('EXPENSE');
      expect(cat?.parent_code).toBe('TECNOLOGIA_E_PRODUTO');
      expect(cat?.is_active).toBe(true);
      expect(cat?.is_postable).toBe(true);
      expect(cat?.sort_order).toBe(5015);
      expect(deterministicCategoryId(cat?.idSource ?? '')).toBe('fcat_da6b3ede41336c2473cd22bbc1affc51');
    });

    it('GESTORES_TERRITORIAIS is under OPERACOES_E_SUPORTE', () => {
      const cat = byCode('GESTORES_TERRITORIAIS');
      expect(cat).toBeDefined();
      expect(cat?.name).toBe('Gestores territoriais');
      expect(cat?.kind).toBe('EXPENSE');
      expect(cat?.parent_code).toBe('OPERACOES_E_SUPORTE');
      expect(cat?.is_active).toBe(true);
      expect(cat?.is_postable).toBe(true);
      expect(cat?.sort_order).toBe(4050);
      expect(deterministicCategoryId(cat?.idSource ?? '')).toBe('fcat_df1314d767be46d6f0d7c34cf7ea5afa');
    });

    it('LICENCAS_MUNICIPAIS is under OPERACOES_E_SUPORTE with requires_document', () => {
      const cat = byCode('LICENCAS_MUNICIPAIS');
      expect(cat).toBeDefined();
      expect(cat?.name).toBe('Licenças e taxas municipais');
      expect(cat?.kind).toBe('EXPENSE');
      expect(cat?.parent_code).toBe('OPERACOES_E_SUPORTE');
      expect(cat?.is_active).toBe(true);
      expect(cat?.is_postable).toBe(true);
      expect(cat?.requires_document).toBe(true);
      expect(cat?.sort_order).toBe(4060);
      expect(deterministicCategoryId(cat?.idSource ?? '')).toBe('fcat_ed994bd0ce7c65ba47a03c8724be9f36');
    });

    it('DIVULGACAO_MARKETING is under MARKETING_E_VENDAS', () => {
      const cat = byCode('DIVULGACAO_MARKETING');
      expect(cat).toBeDefined();
      expect(cat?.name).toBe('Divulgação e marketing');
      expect(cat?.kind).toBe('EXPENSE');
      expect(cat?.parent_code).toBe('MARKETING_E_VENDAS');
      expect(cat?.is_active).toBe(true);
      expect(cat?.is_postable).toBe(true);
      expect(cat?.sort_order).toBe(6030);
      expect(deterministicCategoryId(cat?.idSource ?? '')).toBe('fcat_da2a5828541b6e0e1b2c3bc7e87d1254');
    });

    it('SERVICOS_JURIDICOS is under DESPESAS_ADMINISTRATIVAS', () => {
      const cat = byCode('SERVICOS_JURIDICOS');
      expect(cat).toBeDefined();
      expect(cat?.name).toBe('Serviços jurídicos');
      expect(cat?.kind).toBe('EXPENSE');
      expect(cat?.parent_code).toBe('DESPESAS_ADMINISTRATIVAS');
      expect(cat?.is_active).toBe(true);
      expect(cat?.is_postable).toBe(true);
      expect(cat?.sort_order).toBe(7040);
      expect(deterministicCategoryId(cat?.idSource ?? '')).toBe('fcat_ec867fa7664d6e952cbed1b850eb2e66');
    });
  });

  describe('activated categories are now active and postable', () => {
    it.each(ACTIVATED_CODES)('%s is active and postable', (code) => {
      const cat = byCode(code);
      expect(cat).toBeDefined();
      expect(cat?.is_active).toBe(true);
      expect(cat?.is_postable).toBe(true);
      expect(cat?.is_system).toBe(true);
      expect(cat?.kind).toBe('EXPENSE');
      expect(cat?.parent_code).toBe('DESPESAS_ADMINISTRATIVAS');
    });
  });

  describe('structural invariants', () => {
    it('all new categories have unique codes not conflicting with existing', () => {
      const codes = categories.map((c) => c.code);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    it('all new categories have unique deterministic IDs', () => {
      const ids = categories.map((c) => deterministicCategoryId(c.idSource));
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('all new categories have kind matching their parent', () => {
      const map = new Map(categories.map((c) => [c.code, c]));
      for (const code of NEW_OPERATIONAL_CODES) {
        const cat = map.get(code);
        if (!cat?.parent_code) continue;
        const parent = map.get(cat.parent_code);
        expect(parent, `parent ${cat.parent_code} not found for ${code}`).toBeDefined();
        expect(cat.kind, `kind mismatch: ${code} is ${cat.kind} but parent ${cat.parent_code} is ${parent?.kind}`).toBe(parent?.kind);
      }
    });

    it('no cycles introduced', () => {
      const map = new Map(categories.map((c) => [c.code, c]));
      for (const start of categories) {
        const visited = new Set<string>();
        let current: string | undefined | null = start.code;
        while (current) {
          expect(visited.has(current), `cycle detected at ${current}`).toBe(false);
          visited.add(current);
          current = map.get(current)?.parent_code ?? null;
        }
      }
    });

    it('IMPOSTOS_LEGACY remains inactive (backward compatibility)', () => {
      const legacy = byCode('IMPOSTOS_LEGACY');
      expect(legacy).toBeDefined();
      expect(legacy?.is_active).toBe(false);
      expect(legacy?.is_postable).toBe(false);
    });

    it('total catalog is 65 categories', () => {
      expect(categories).toHaveLength(65);
    });

    it('all new operational categories are terminal (no children)', () => {
      const childrenOf = new Map<string, string[]>();
      for (const cat of categories) {
        if (!cat.parent_code) continue;
        const list = childrenOf.get(cat.parent_code) ?? [];
        list.push(cat.code);
        childrenOf.set(cat.parent_code, list);
      }

      const LEAF_CODES = NEW_OPERATIONAL_CODES.filter((c) => c !== 'IMPOSTOS_E_TAXAS');
      for (const code of LEAF_CODES) {
        expect(childrenOf.get(code) ?? [], `${code} should be terminal`).toHaveLength(0);
      }
    });

    it('IMPOSTOS_E_TAXAS has exactly 6 children', () => {
      const children = categories.filter((c) => c.parent_code === 'IMPOSTOS_E_TAXAS');
      expect(children).toHaveLength(6);
      const childCodes = new Set(children.map((c) => c.code));
      expect(childCodes).toEqual(new Set(['IRPJ', 'CSLL', 'ISS', 'PIS_COFINS', 'SIMPLES_NACIONAL', 'OUTROS_IMPOSTOS']));
    });
  });

  describe('idempotency — seed uses upsert by unique code', () => {
    it('all idSources are unique strings', () => {
      const sources = categories.map((c) => c.idSource);
      expect(new Set(sources).size).toBe(sources.length);
    });

    it('financeCategoryId produces stable IDs from idSource', () => {
      // Verify a known mapping
      expect(deterministicCategoryId('despesa.github')).toBe('fcat_da6b3ede41336c2473cd22bbc1affc51');
      expect(deterministicCategoryId('impostos_e_taxas')).toBe('fcat_9cb6d78d7a883ba1c3e30f0973dbe341');
      // Verify stability
      expect(deterministicCategoryId('despesa.github')).toBe(deterministicCategoryId('despesa.github'));
    });
  });
});
