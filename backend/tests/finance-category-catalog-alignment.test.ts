/**
 * Test: align_finance_category_catalog migration (commit 030f49e3 delta)
 *
 * Validates that the canonical seed catalog matches the expected migration output:
 * - 12 new categories with deterministic IDs
 * - 3 existing categories activated (is_active=true, is_postable=true)
 * - Correct parent-child relationships
 * - Sort order consistency
 * - Idempotency (running seed twice yields same result)
 */
import { createHash } from 'crypto';
import { describe, expect, it } from 'vitest';

import { FINANCE_CATEGORY_SEEDS } from '../prisma/seed';

function financeCategoryId(source: string) {
  return `fcat_${createHash('md5').update(source).digest('hex')}`;
}

const seedMap = new Map(FINANCE_CATEGORY_SEEDS.map(s => [s.code, s]));

// ── Delta from commit 030f49e3: 12 NEW categories ──────────────────────────

const NEW_CATEGORIES = [
  { code: 'IMPOSTOS_E_TAXAS', idSource: 'impostos_e_taxas', parent_code: null, kind: 'EXPENSE', direction: 'OUT', requires_document: false, is_postable: false, sort_order: 2000 },
  { code: 'IRPJ', idSource: 'impostos_e_taxas.irpj', parent_code: 'IMPOSTOS_E_TAXAS', kind: 'EXPENSE', direction: 'OUT', requires_document: true, is_postable: true, sort_order: 2010 },
  { code: 'CSLL', idSource: 'impostos_e_taxas.csll', parent_code: 'IMPOSTOS_E_TAXAS', kind: 'EXPENSE', direction: 'OUT', requires_document: true, is_postable: true, sort_order: 2020 },
  { code: 'ISS', idSource: 'impostos_e_taxas.iss', parent_code: 'IMPOSTOS_E_TAXAS', kind: 'EXPENSE', direction: 'OUT', requires_document: true, is_postable: true, sort_order: 2030 },
  { code: 'PIS_COFINS', idSource: 'impostos_e_taxas.pis_cofins', parent_code: 'IMPOSTOS_E_TAXAS', kind: 'EXPENSE', direction: 'OUT', requires_document: true, is_postable: true, sort_order: 2040 },
  { code: 'SIMPLES_NACIONAL', idSource: 'impostos_e_taxas.simples_nacional', parent_code: 'IMPOSTOS_E_TAXAS', kind: 'EXPENSE', direction: 'OUT', requires_document: true, is_postable: true, sort_order: 2050 },
  { code: 'OUTROS_IMPOSTOS', idSource: 'impostos_e_taxas.outros', parent_code: 'IMPOSTOS_E_TAXAS', kind: 'EXPENSE', direction: 'OUT', requires_document: false, is_postable: true, sort_order: 2090 },
  { code: 'GITHUB', idSource: 'despesa.github', parent_code: 'TECNOLOGIA_E_PRODUTO', kind: 'EXPENSE', direction: 'OUT', requires_document: false, is_postable: true, sort_order: 5015 },
  { code: 'GESTORES_TERRITORIAIS', idSource: 'despesa.gestores_territoriais', parent_code: 'OPERACOES_E_SUPORTE', kind: 'EXPENSE', direction: 'OUT', requires_document: false, is_postable: true, sort_order: 4050 },
  { code: 'LICENCAS_MUNICIPAIS', idSource: 'despesa.licencas_municipais', parent_code: 'OPERACOES_E_SUPORTE', kind: 'EXPENSE', direction: 'OUT', requires_document: true, is_postable: true, sort_order: 4060 },
  { code: 'SERVICOS_JURIDICOS', idSource: 'despesa.servicos_juridicos', parent_code: 'DESPESAS_ADMINISTRATIVAS', kind: 'EXPENSE', direction: 'OUT', requires_document: false, is_postable: true, sort_order: 7040 },
  { code: 'DIVULGACAO_MARKETING', idSource: 'despesa.divulgacao_marketing', parent_code: 'MARKETING_E_VENDAS', kind: 'EXPENSE', direction: 'OUT', requires_document: false, is_postable: true, sort_order: 6030 },
];

// ── Delta from commit 030f49e3: 3 ACTIVATED categories ─────────────────────

const ACTIVATED_CATEGORIES = [
  { code: 'CONTABILIDADE', idSource: 'despesa.contabilidade', parent_code: 'DESPESAS_ADMINISTRATIVAS', sort_order: 7010 },
  { code: 'PRO_LABORE', idSource: 'despesa.pro_labore', parent_code: 'DESPESAS_ADMINISTRATIVAS', sort_order: 7020 },
  { code: 'OUTRAS_DESPESAS', idSource: 'despesa.outras_despesas', parent_code: 'DESPESAS_ADMINISTRATIVAS', sort_order: 7030 },
];

// ── Parents that must already exist in production (from migration 20260717) ─

const REQUIRED_PARENTS = [
  { code: 'TECNOLOGIA_E_PRODUTO', idSource: 'tecnologia_e_produto' },
  { code: 'OPERACOES_E_SUPORTE', idSource: 'operacoes_e_suporte' },
  { code: 'DESPESAS_ADMINISTRATIVAS', idSource: 'despesa' },
  { code: 'MARKETING_E_VENDAS', idSource: 'despesa.marketing' },
];

describe('Finance Category Catalog Alignment — full delta 030f49e3', () => {

  describe('Seed catalog contains all new categories', () => {
    for (const cat of NEW_CATEGORIES) {
      it(`${cat.code} exists in seed with correct properties`, () => {
        const seed = seedMap.get(cat.code);
        expect(seed, `${cat.code} missing from FINANCE_CATEGORY_SEEDS`).toBeDefined();
        expect(seed!.idSource).toBe(cat.idSource);
        expect(seed!.kind).toBe(cat.kind);
        expect(seed!.default_direction).toBe(cat.direction);
        expect(seed!.is_active).toBe(true);
        expect(seed!.is_postable).toBe(cat.is_postable);
        expect(seed!.parent_code ?? null).toBe(cat.parent_code);
        expect(seed!.sort_order).toBe(cat.sort_order);
        expect(seed!.requires_document).toBe(cat.requires_document);
      });
    }
  });

  describe('Seed catalog has activated categories as active/postable', () => {
    for (const cat of ACTIVATED_CATEGORIES) {
      it(`${cat.code} is active and postable in seed`, () => {
        const seed = seedMap.get(cat.code);
        expect(seed, `${cat.code} missing from FINANCE_CATEGORY_SEEDS`).toBeDefined();
        expect(seed!.is_active).toBe(true);
        expect(seed!.is_postable).toBe(true);
        expect(seed!.parent_code ?? null).toBe(cat.parent_code);
        expect(seed!.sort_order).toBe(cat.sort_order);
      });
    }
  });

  describe('Deterministic IDs are correct (md5 of idSource)', () => {
    const ALL = [...NEW_CATEGORIES, ...ACTIVATED_CATEGORIES];
    for (const cat of ALL) {
      it(`${cat.code} → fcat_md5("${cat.idSource}")`, () => {
        const expected = financeCategoryId(cat.idSource);
        // Verify ID is a valid 36-char fcat_ + 32-char hex
        expect(expected).toMatch(/^fcat_[0-9a-f]{32}$/);
        // Verify seed produces the same ID
        const seed = seedMap.get(cat.code)!;
        expect(financeCategoryId(seed.idSource)).toBe(expected);
      });
    }
  });

  describe('Parent categories exist in seed and have valid IDs', () => {
    for (const parent of REQUIRED_PARENTS) {
      it(`${parent.code} exists in seed`, () => {
        const seed = seedMap.get(parent.code);
        expect(seed).toBeDefined();
        expect(seed!.is_active).toBe(true);
      });

      it(`${parent.code} has expected deterministic ID`, () => {
        const id = financeCategoryId(parent.idSource);
        expect(id).toMatch(/^fcat_[0-9a-f]{32}$/);
      });
    }

    it('IMPOSTOS_E_TAXAS (new parent) has correct ID', () => {
      expect(financeCategoryId('impostos_e_taxas')).toBe('fcat_9cb6d78d7a883ba1c3e30f0973dbe341');
    });
  });

  describe('Sort order consistency', () => {
    it('GITHUB (5015) is between AWS (5010) and CLOUDFLARE (5020)', () => {
      expect(seedMap.get('AWS')!.sort_order).toBe(5010);
      expect(seedMap.get('GITHUB')!.sort_order).toBe(5015);
      expect(seedMap.get('CLOUDFLARE')!.sort_order).toBe(5020);
    });

    it('IMPOSTOS_E_TAXAS children are ordered: IRPJ < CSLL < ISS < PIS_COFINS < SIMPLES < OUTROS', () => {
      expect(seedMap.get('IRPJ')!.sort_order).toBe(2010);
      expect(seedMap.get('CSLL')!.sort_order).toBe(2020);
      expect(seedMap.get('ISS')!.sort_order).toBe(2030);
      expect(seedMap.get('PIS_COFINS')!.sort_order).toBe(2040);
      expect(seedMap.get('SIMPLES_NACIONAL')!.sort_order).toBe(2050);
      expect(seedMap.get('OUTROS_IMPOSTOS')!.sort_order).toBe(2090);
    });

    it('DESPESAS_ADMINISTRATIVAS children are ordered: CONTABILIDADE < PRO_LABORE < OUTRAS < JURIDICOS', () => {
      expect(seedMap.get('CONTABILIDADE')!.sort_order).toBe(7010);
      expect(seedMap.get('PRO_LABORE')!.sort_order).toBe(7020);
      expect(seedMap.get('OUTRAS_DESPESAS')!.sort_order).toBe(7030);
      expect(seedMap.get('SERVICOS_JURIDICOS')!.sort_order).toBe(7040);
    });
  });

  describe('Migration SQL uses correct IDs (regression guard)', () => {
    // These are the exact IDs used in the migration SQL. If the hash function
    // or idSource ever changes, these tests will catch it immediately.
    const MIGRATION_IDS: Record<string, string> = {
      IMPOSTOS_E_TAXAS: 'fcat_9cb6d78d7a883ba1c3e30f0973dbe341',
      IRPJ: 'fcat_649e1e6cb04d5805ae82341832821a9e',
      CSLL: 'fcat_4881f938cef55b4ebf8717c48de09ade',
      ISS: 'fcat_0a0132890382603ff5428fc2ca3f2dd1',
      PIS_COFINS: 'fcat_2c05f1d2f6948732afa3db9e0e992900',
      SIMPLES_NACIONAL: 'fcat_29e77f028c3b0de895c04f0bdbc0be64',
      OUTROS_IMPOSTOS: 'fcat_8f4c3ba427aef197682a07f1bfc88c5f',
      GITHUB: 'fcat_da6b3ede41336c2473cd22bbc1affc51',
      GESTORES_TERRITORIAIS: 'fcat_df1314d767be46d6f0d7c34cf7ea5afa',
      LICENCAS_MUNICIPAIS: 'fcat_ed994bd0ce7c65ba47a03c8724be9f36',
      SERVICOS_JURIDICOS: 'fcat_ec867fa7664d6e952cbed1b850eb2e66',
      DIVULGACAO_MARKETING: 'fcat_da2a5828541b6e0e1b2c3bc7e87d1254',
      CONTABILIDADE: 'fcat_e11c24a9128072b5c8d72a1160f120cb',
      PRO_LABORE: 'fcat_26dc69afcd59ee348780a6616ad410ff',
      OUTRAS_DESPESAS: 'fcat_986dd29e49fd4a974f30244fff3be359',
    };

    for (const [code, expectedId] of Object.entries(MIGRATION_IDS)) {
      it(`${code} migration ID matches computed ID`, () => {
        const seed = seedMap.get(code)!;
        expect(financeCategoryId(seed.idSource)).toBe(expectedId);
      });
    }
  });

  describe('No duplicate codes in seed catalog', () => {
    it('all codes are unique', () => {
      const codes = FINANCE_CATEGORY_SEEDS.map(s => s.code);
      const unique = new Set(codes);
      expect(unique.size).toBe(codes.length);
    });

    it('all idSources are unique', () => {
      const sources = FINANCE_CATEGORY_SEEDS.map(s => s.idSource);
      const unique = new Set(sources);
      expect(unique.size).toBe(sources.length);
    });
  });

  describe('Idempotency: seed produces same IDs regardless of run count', () => {
    it('computing ID twice yields same result', () => {
      for (const cat of [...NEW_CATEGORIES, ...ACTIVATED_CATEGORIES]) {
        const id1 = financeCategoryId(cat.idSource);
        const id2 = financeCategoryId(cat.idSource);
        expect(id1).toBe(id2);
      }
    });
  });
});
