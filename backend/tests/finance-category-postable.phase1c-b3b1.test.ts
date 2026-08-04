import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const seedModule = await import('../prisma/seed');
const seed = (seedModule as any).default ?? seedModule;

const categories = seed.FINANCE_CATEGORY_SEEDS as Array<{
  idSource: string;
  code: string;
  parent_code?: string | null;
  is_active?: boolean;
  is_postable: boolean;
}>;

const expectedPostableByCode: Record<string, { id: string; is_postable: boolean }> = {
  RECEITAS_OPERACIONAIS: { id: 'fcat_750ab088b8618e7c4b22ebc7c28d9ef2', is_postable: false },
  TAXA_CORRIDA: { id: 'fcat_1e1b845507b2c72888ff7c9d0664e5f7', is_postable: true },
  ADESAO_GESTOR: { id: 'fcat_ffb5f52c9b0946d18f8edd69177a86fe', is_postable: true },
  GESTAO_TERRITORIAL: { id: 'fcat_64271f7accb4ae3206d5d427eab53bd0', is_postable: true },
  SERVICO_COMERCIAL: { id: 'fcat_65fcd75ef6a9367bd69badef10093235', is_postable: true },
  OUTRAS_RECEITAS: { id: 'fcat_7bc26a99002b22586bf8f3d8e62df701', is_postable: true },
  RECEITA_MENSALIDADE_LEGACY: { id: 'fcat_252885c877b47f584a170831e9826cbd', is_postable: false },
  DESPESAS_ADMINISTRATIVAS: { id: 'fcat_bafd5ddb91d03c60a27748d76e09d09c', is_postable: false },
  MARKETING_E_VENDAS: { id: 'fcat_a760da5ca4c4655821994de82acb0fb8', is_postable: false },
  CUSTOS_DIRETOS_PLATAFORMA: { id: 'fcat_250b87f0f1a5328d43ab794d43b4389a', is_postable: false },
  OPERACOES_E_SUPORTE: { id: 'fcat_95cbbd9bad2fbecfce1f9c76829bd191', is_postable: false },
  TECNOLOGIA_E_PRODUTO: { id: 'fcat_8809bbe62cb78a37d898848ab12fe6a5', is_postable: false },
  DESPESAS_FINANCEIRAS: { id: 'fcat_89781c1326b5e4cabf100441bffdd79b', is_postable: false },
  COMBO_PREMIUM: { id: 'fcat_31e30871123a6875ad17fd8624df61bd', is_postable: false },
  AWS: { id: 'fcat_dcebb7ae61af7532d613402a5eca44bf', is_postable: true },
  CLOUDFLARE: { id: 'fcat_6f33a9734b98d70c9fd80d6e48cd0cf0', is_postable: true },
  GOOGLE_PLAY_STORE: { id: 'fcat_27992c827ef0676e35138a8c31981939', is_postable: true },
  EXPO: { id: 'fcat_6be87ef879a1a77ba11e2c1b7c1808cb', is_postable: true },
  DOMINIOS_E_CERTIFICADOS: { id: 'fcat_badf4aa8fb238f545b6ee2468877de27', is_postable: true },
  EQUIPAMENTOS_LEGACY: { id: 'fcat_7d6482c651943d2c6c23dd1581673c06', is_postable: false },
  TWILIO: { id: 'fcat_e53f3bbfb08d5bd450e187c585ac1329', is_postable: true },
  TELEFONIA_INTERNET: { id: 'fcat_8fff5834777905ddcb4f04658eab1b56', is_postable: true },
  REGULACAO_MUNICIPAL: { id: 'fcat_7b5e85344192f123d2f0ec9f734c8050', is_postable: true },
  TAXAS_MUNICIPAIS_SOBRE_CORRIDAS: { id: 'fcat_cd17b84eaa92c309e549b872b98146ac', is_postable: true },
  CONTABILIDADE: { id: 'fcat_e11c24a9128072b5c8d72a1160f120cb', is_postable: false },
  PRO_LABORE: { id: 'fcat_26dc69afcd59ee348780a6616ad410ff', is_postable: false },
  OUTRAS_DESPESAS: { id: 'fcat_986dd29e49fd4a974f30244fff3be359', is_postable: false },
  PROCESSAMENTO_PAGAMENTOS: { id: 'fcat_db98c7abe0d5cdc80f326d904de60799', is_postable: true },
  TAXAS_BANCARIAS: { id: 'fcat_626d1e09c46592f55bb3347b5ffcc70c', is_postable: true },
  REEMBOLSOS: { id: 'fcat_709f8138749f094ea890c3f5b1385df9', is_postable: false },
  ASAAS_LEGACY: { id: 'fcat_0e242985e7f492fc9c2256203b7b6db4', is_postable: false },
  IMPOSTOS_LEGACY: { id: 'fcat_4ad584f0ff33840f0ef7a6daa1dd02a5', is_postable: false },
  PUBLICIDADE_DIGITAL: { id: 'fcat_531f9f95b7ba8537f54c773603cec791', is_postable: true },
  AJUSTES_E_DEDUCOES_RECEITA: { id: 'fcat_f90012ff6e8d8e576e07544cd3350e02', is_postable: false },
  CHARGEBACKS_LIQUIDACAO: { id: 'fcat_04e6957f162773e50c4de9ef48ced019', is_postable: true },
  APORTES: { id: 'fcat_54310b6d8acdd1df8b01f006beb923bb', is_postable: false },
  APORTE_SOCIO: { id: 'fcat_0f35bdc34e856d4e366c6b6e25205941', is_postable: true },
  RETIRADAS: { id: 'fcat_f3d9283e3b7dcdf0e46cf8914f7317a4', is_postable: false },
  RETIRADA_SOCIO: { id: 'fcat_fef13e02adb0cf30b67a31718ab03141', is_postable: true },
  TRANSFERENCIAS: { id: 'fcat_76713996d508b18e1b36bc9a8d138db9', is_postable: false },
  TRANSFERENCIA_INTERNA: { id: 'fcat_36d7e69accd07f9ab539f12a4b3f101e', is_postable: true },
  OBRIGACOES_OPERACIONAIS: { id: 'fcat_4c30cc6b6dd82c489d5748dd50e2dbf9', is_postable: false },
  CREDITOS_PRE_PAGOS: { id: 'fcat_5bf3c122925bbd61992ea683e02d3eb1', is_postable: true },
  VALORES_MOTORISTAS: { id: 'fcat_6b2a3382e8e51a19cd4bc46d574c1be2', is_postable: true },
  VALORES_GESTORES: { id: 'fcat_0bf19570c02140da0df2fa2b8062c467', is_postable: true },
  VALORES_COMERCIOS: { id: 'fcat_3b46cfde209a61fa1147695d65983f4a', is_postable: true },
  RETENCOES: { id: 'fcat_7554f1f984d6e2cec1ffebf9e9bfdf5c', is_postable: true },
  OUTROS_TERCEIROS: { id: 'fcat_64b288f3a9a88d7fb337636025756bbb', is_postable: true },
  BONUS_ANUAL_MOTORISTAS_A_PAGAR: { id: 'fcat_fb31c48ce603495524e0afcb71625353', is_postable: true },
  VALORES_EM_TRANSITO: { id: 'fcat_06f6c36e2a194d6fdb0156125463d49b', is_postable: false },
  VALORES_PROCESSADOR: { id: 'fcat_55aeb27283122e6d674ac56a8fd522f2', is_postable: true },
  RECEBIVEIS_LIQUIDAR: { id: 'fcat_847582905061204c351065cd7f93b531', is_postable: true },
  REEMBOLSOS_PROCESSAMENTO: { id: 'fcat_125141013f224853afa564a2150b06a8', is_postable: true },
};

function deterministicCategoryId(source: string) {
  return `fcat_${createHash('md5').update(source).digest('hex')}`;
}

function childrenByCode() {
  const map = new Map<string, number>();
  for (const category of categories) map.set(category.code, 0);
  for (const category of categories) {
    if (!category.parent_code) continue;
    map.set(category.parent_code, (map.get(category.parent_code) ?? 0) + 1);
  }
  return map;
}

describe('finance category postable phase 1C-B 3B-1', () => {
  it('declares is_postable as required Boolean in schema', () => {
    const schemaPath = resolve(process.cwd(), 'prisma', 'schema.prisma');
    const schema = readFileSync(schemaPath, 'utf8');
    const model = schema.match(/model financial_categories \{[\s\S]*?\n\}/)?.[0] ?? '';

    // Use regex to match regardless of Prisma column alignment changes
    expect(model).toMatch(/is_postable\s+Boolean\b/);
    expect(model).not.toMatch(/is_postable\s+Boolean\?/);
    expect(model).not.toMatch(/is_postable\s+Boolean\s+@default/);
  });

  it('keeps explicit 53/53 code -> id -> is_postable mapping with canonical invariants', () => {
    expect(categories).toHaveLength(53);

    const expectedCodes = Object.keys(expectedPostableByCode);
    expect(expectedCodes).toHaveLength(53);

    const codeSet = new Set(categories.map((c) => c.code));
    const idSet = new Set(categories.map((c) => deterministicCategoryId(c.idSource)));
    expect(codeSet.size).toBe(53);
    expect(idSet.size).toBe(53);

    const actualByCode = new Map(categories.map((category) => [category.code, category] as const));
    for (const code of expectedCodes) {
      const category = actualByCode.get(code);
      expect(category, `missing seed category ${code}`).toBeDefined();
      expect(deterministicCategoryId(category?.idSource ?? ''), `unexpected id for ${code}`).toBe(expectedPostableByCode[code].id);
      expect(category?.is_postable, `unexpected is_postable for ${code}`).toBe(expectedPostableByCode[code].is_postable);
    }

    expect(categories.filter((category) => category.is_postable)).toHaveLength(31);
    expect(categories.filter((category) => !category.is_postable)).toHaveLength(22);

    const childrenMap = childrenByCode();

    expect(categories.filter((category) => category.is_active === false && category.is_postable)).toHaveLength(0);
    expect(categories.filter((category) => !category.parent_code && category.is_postable)).toHaveLength(0);
    expect(
      categories.filter((category) => (childrenMap.get(category.code) ?? 0) > 0 && category.is_postable),
    ).toHaveLength(0);

    expect(actualByCode.get('CUSTOS_DIRETOS_PLATAFORMA')?.is_postable).toBe(false);
    expect(actualByCode.get('PUBLICIDADE_DIGITAL')?.is_postable).toBe(true);
  });

  it('contains the expected defensive markers in 3B-1 migration', () => {
    const migrationPath = resolve(
      process.cwd(),
      'prisma',
      'migrations',
      '20260719010000_add_financial_category_is_postable',
      'migration.sql',
    );
    const migrationSql = readFileSync(migrationPath, 'utf8');

    const requiredFragments = [
      'ADD COLUMN is_postable BOOLEAN',
      'Expected 51 finance categories before is_postable classification, found %',
      'Expected is_postable=true for 29 categories, found %',
      'Expected is_postable=false for 22 categories, found %',
      'Expected no category with children to be postable, found %',
      'Expected no inactive category to be postable, found %',
      'Expected no root category to be postable, found %',
      'CUSTOS_DIRETOS_PLATAFORMA must be non-postable',
      'PUBLICIDADE_DIGITAL must be postable and keep deterministic id',
      'ALTER COLUMN is_postable SET NOT NULL',
    ];

    for (const fragment of requiredFragments) {
      expect(migrationSql).toContain(fragment);
    }
  });
});
