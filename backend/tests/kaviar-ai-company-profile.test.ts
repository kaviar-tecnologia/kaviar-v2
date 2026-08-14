import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../src/db', () => ({ pool: { query: mockQuery } }));

vi.mock('../src/services/email/inbound-email-security-risk', () => ({
  evaluateInboundEmailSecurityRisk: () => ({ level: 'LOW', suspicious: false, reasons: [] }),
}));

import { askKaviarAi } from '../src/services/ai/kaviar-ai.service';
import { getRegisteredTools, canRoleExecuteTool } from '../src/services/ai/kaviar-ai.registry';
import { routeByRules } from '../src/services/ai/kaviar-ai.router';
import { getCompanyProfile } from '../src/services/ai/kaviar-ai.tools';

// ══════════════════════════════════════════════════════════════════════════════
// Fixture: KAVIAR entity mock row
// ══════════════════════════════════════════════════════════════════════════════

const KAVIAR_ENTITY = {
  id: 'entity-uuid-1',
  cnpj: '67783601000199',
  razao_social: 'KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA',
  nome_fantasia: 'KAVIAR',
  entity_type: 'MATRIZ',
  uf: 'RJ',
  municipio: 'Rio de Janeiro',
  data_abertura: new Date('2026-07-01'),
  situacao_cadastral: 'ATIVA',
  data_situacao_cadastral: new Date('2026-07-01'),
  porte: 'ME',
  natureza_juridica: '206-2 — Sociedade Empresária Limitada',
  capital_social_cents: '1000000',
  email_institucional: 'contato@kaviar.com.br',
  telefone_institucional: '(21) 96864-8777',
  whatsapp_institucional: '+55 21 96864-8777',
  site: 'https://kaviar.com.br',
  logradouro: 'Estrada das Furnas',
  numero: '03001',
  complemento: 'ANTIGOS 2253 781',
  bairro: 'Itanhangá',
  cep: '22.641-681',
  cnae_principal: '62.03-1-00 — Desenvolvimento e licenciamento de programas de computador não customizáveis',
  cnaes_secundarios: [
    '52.29-0-99 — Outras atividades auxiliares dos transportes terrestres não especificadas anteriormente',
    '63.19-4-00 — Portais, provedores de conteúdo e outros serviços de informação na internet',
    '74.90-1-04 — Atividades de intermediação e agenciamento de serviços e negócios em geral, exceto imobiliários',
  ],
};

const KAVIAR_PERSONS = [
  { nome: 'Aparecido de Goes', funcao: 'CEO', funcao_origem: 'INTERNAL' },
  { nome: 'Aparecido de Goes', funcao: 'Sócio-Administrador', funcao_origem: 'RFB_QSA' },
  { nome: 'Fernanda Aparecida de Goes', funcao: 'Sócia-Administradora', funcao_origem: 'RFB_QSA' },
];

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

describe('company_profile — identity', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pergunta de CNPJ retorna CNPJ formatado', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [KAVIAR_ENTITY] });
    const r = await askKaviarAi({ userId: 'a', question: 'Qual é o CNPJ da KAVIAR?', role: 'SUPER_ADMIN' });
    expect(r.toolsUsed).toContain('company_profile');
    expect(r.answer).toContain('67.783.601/0001-99');
  });

  it('retorna razão social e nome fantasia', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [KAVIAR_ENTITY] });
    const r = await askKaviarAi({ userId: 'a', question: 'Qual é a razão social da KAVIAR?', role: 'SUPER_ADMIN' });
    expect(r.answer).toContain('KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA');
    expect(r.answer).toContain('KAVIAR');
  });

  it('retorna data de abertura', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [KAVIAR_ENTITY] });
    const r = await askKaviarAi({ userId: 'a', question: 'Quando a KAVIAR foi aberta?', role: 'SUPER_ADMIN' });
    expect(r.answer).toContain('01/07/2026');
  });

  it('retorna capital social formatado', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [KAVIAR_ENTITY] });
    const r = await askKaviarAi({ userId: 'a', question: 'Qual é o capital social da KAVIAR?', role: 'SUPER_ADMIN' });
    expect(r.answer).toContain('R$ 10.000,00');
  });
});

describe('company_profile — contacts', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna telefone e WhatsApp institucional', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [KAVIAR_ENTITY] });
    const r = await askKaviarAi({ userId: 'a', question: 'Qual é o telefone institucional da KAVIAR?', role: 'SUPER_ADMIN' });
    expect(r.answer).toContain('(21) 96864-8777');
    expect(r.answer).toContain('+55 21 96864-8777');
  });

  it('retorna endereço da matriz', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [KAVIAR_ENTITY] });
    const r = await askKaviarAi({ userId: 'a', question: 'Onde fica a KAVIAR?', role: 'SUPER_ADMIN' });
    expect(r.answer).toContain('Estrada das Furnas');
    expect(r.answer).toContain('Itanhangá');
    expect(r.answer).toContain('Rio de Janeiro/RJ');
  });
});

describe('company_profile — governance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna sócios com qualificação', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [KAVIAR_ENTITY] })
      .mockResolvedValueOnce({ rows: KAVIAR_PERSONS });
    const r = await askKaviarAi({ userId: 'a', question: 'Quem são os sócios da KAVIAR?', role: 'SUPER_ADMIN' });
    expect(r.answer).toContain('Fernanda Aparecida de Goes');
    expect(r.answer).toContain('Sócia-Administradora');
    expect(r.answer).toContain('Aparecido de Goes');
    expect(r.answer).toContain('Sócio-Administrador');
  });

  it('retorna CEO', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [KAVIAR_ENTITY] })
      .mockResolvedValueOnce({ rows: KAVIAR_PERSONS });
    const r = await askKaviarAi({ userId: 'a', question: 'Quem é o CEO da KAVIAR?', role: 'SUPER_ADMIN' });
    expect(r.answer).toContain('Aparecido de Goes');
    expect(r.answer).toContain('CEO');
  });

  it('distingue CEO (função interna) de Sócio-Administrador (QSA)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [KAVIAR_ENTITY] })
      .mockResolvedValueOnce({ rows: KAVIAR_PERSONS });
    const r = await askKaviarAi({ userId: 'a', question: 'Quem são os sócios e administradores da empresa?', role: 'SUPER_ADMIN' });
    expect(r.answer).toContain('(QSA/Receita Federal)');
    expect(r.answer).toContain('(função interna)');
  });

  it('não exibe números pessoais na resposta', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [KAVIAR_ENTITY] })
      .mockResolvedValueOnce({ rows: KAVIAR_PERSONS });
    const r = await askKaviarAi({ userId: 'a', question: 'Quem são os sócios da empresa?', role: 'SUPER_ADMIN' });
    // No CPF, personal phone, etc.
    expect(r.answer).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/); // CPF
    expect(r.answer).not.toContain('pessoal');
  });
});

describe('company_profile — activities', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna CNAEs', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [KAVIAR_ENTITY] });
    const r = await askKaviarAi({ userId: 'a', question: 'Quais são os CNAEs da KAVIAR?', role: 'SUPER_ADMIN' });
    expect(r.answer).toContain('62.03-1-00');
    expect(r.answer).toContain('52.29-0-99');
    expect(r.answer).toContain('63.19-4-00');
    expect(r.answer).toContain('74.90-1-04');
  });
});

describe('company_profile — structure', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna matriz e filiais consultando dados reais', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [
      { cnpj: '67783601000199', nome_fantasia: 'KAVIAR', tipo: 'MATRIZ', uf: 'RJ', municipio: 'Rio de Janeiro', is_active: true },
    ] });
    const r = await askKaviarAi({ userId: 'a', question: 'A KAVIAR possui filiais?', role: 'SUPER_ADMIN' });
    expect(r.answer).toContain('KAVIAR');
    expect(r.answer).toContain('MATRIZ');
  });

  it('falha de consulta não afirma que não existem filiais', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection error'));
    const r = await getCompanyProfile({ section: 'structure' });
    expect(r.data.structure?.entities).toHaveLength(0);
    // The formatter should say "não foi possível consultar" — not "não existem"
  });
});

describe('company_profile — about (plataforma)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('"O que é a KAVIAR?" retorna descrição institucional', async () => {
    const r = await askKaviarAi({ userId: 'a', question: 'O que é a KAVIAR?', role: 'SUPER_ADMIN' });
    expect(r.toolsUsed).toContain('company_profile');
    expect(r.answer).toContain('plataforma brasileira de mobilidade urbana comunitária');
  });

  it('distingue empresa de plataforma', async () => {
    const r = await askKaviarAi({ userId: 'a', question: 'O que é a KAVIAR?', role: 'SUPER_ADMIN' });
    expect(r.answer).toContain('pessoa jurídica');
    expect(r.answer).toContain('sistema tecnológico');
  });

  it('distingue matriz/filial de território', async () => {
    const r = await askKaviarAi({ userId: 'a', question: 'O que é a KAVIAR?', role: 'SUPER_ADMIN' });
    expect(r.answer).toContain('estabelecimentos jurídicos');
    expect(r.answer).toContain('área municipal ou operacional');
  });

  it('explica que cadastrar território não ativa operação', async () => {
    const r = await askKaviarAi({ userId: 'a', question: 'Como funciona a KAVIAR?', role: 'SUPER_ADMIN' });
    expect(r.answer).toContain('cadastrar um território não significa ativá-lo');
  });

  it('não apresenta módulo como serviço ativo sem confirmação', async () => {
    const r = await askKaviarAi({ userId: 'a', question: 'Quais módulos a KAVIAR possui?', role: 'SUPER_ADMIN' });
    // Must not list specific modules as "active" — just concepts
    expect(r.answer).not.toContain('módulo disponível');
    expect(r.answer).not.toContain('ativo em produção');
  });

  it('descrição institucional NÃO é enviada à OpenAI (tool determinística sem API call)', async () => {
    const r = await askKaviarAi({ userId: 'a', question: 'O que é a KAVIAR?', role: 'SUPER_ADMIN' });
    // about section doesn't even call the DB (needsEntity=false for about)
    expect(mockQuery).not.toHaveBeenCalled();
    expect(r.toolsUsed).toContain('company_profile');
  });
});

describe('company_profile — disponibilidade', () => {
  beforeEach(() => vi.clearAllMocks());

  it('entidade sem dado retorna "não cadastrado"', async () => {
    const entity = { ...KAVIAR_ENTITY, email_institucional: null, telefone_institucional: null, whatsapp_institucional: null, site: null };
    mockQuery.mockResolvedValueOnce({ rows: [entity] });
    const r = await getCompanyProfile({ section: 'contacts' });
    expect(r.data.available).toBe(true);
    expect(r.data.contacts?.email).toBeNull();
  });

  it('falha de consulta não aparece como zero ou ausência confirmada', async () => {
    mockQuery.mockRejectedValueOnce(new Error('db error'));
    const r = await getCompanyProfile({ section: 'identity' });
    expect(r.data.available).toBe(false);
  });
});

describe('company_profile — RBAC', () => {
  beforeEach(() => vi.clearAllMocks());

  it('SUPER_ADMIN autorizado', () => {
    expect(canRoleExecuteTool('SUPER_ADMIN', 'company_profile')).toBe(true);
  });

  it('FINANCE autorizado e somente leitura', () => {
    expect(canRoleExecuteTool('FINANCE', 'company_profile')).toBe(true);
    const tool = getRegisteredTools().find(t => t.name === 'company_profile');
    expect(tool?.readOnly).toBe(true);
  });

  it('role ausente ou inválida bloqueada', async () => {
    const r = await askKaviarAi({ userId: 'x', question: 'Qual o CNPJ?', role: 'OPERATOR' });
    expect(r.answer).toContain('Acesso negado');
  });
});

describe('company_profile — integração com tools existentes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('registry atualizado com 11 tools', () => {
    expect(getRegisteredTools()).toHaveLength(18);
  });

  it('roteamentos antigos continuam funcionando — corridas hoje', () => {
    const r = routeByRules('Corridas hoje?');
    expect(r.toolsToCall).toContain('rides_summary_today');
    expect(r.toolsToCall).not.toContain('company_profile');
  });

  it('roteamentos antigos continuam funcionando — territorial', () => {
    const r = routeByRules('Quero abrir Pirassununga como cidade');
    expect(r.toolsToCall).toContain('territory_onboarding_status');
    expect(r.toolsToCall).not.toContain('company_profile');
  });

  it('roteamentos antigos continuam funcionando — briefing', () => {
    const r = routeByRules('O que precisa da minha atenção hoje?');
    expect(r.toolsToCall).toContain('daily_briefing');
    expect(r.toolsToCall).not.toContain('company_profile');
  });

  it('roteamentos antigos continuam funcionando — financeiro', () => {
    const r = routeByRules('Quais obrigações financeiras estão pendentes para a semana?');
    expect(r.toolsToCall).toContain('finance_due_obligations');
  });

  it('pergunta sobre cidades ativas deve consultar territorial, não company_profile', () => {
    const r = routeByRules('Qual o status da cidade de Campinas?');
    expect(r.toolsToCall).toContain('territory_onboarding_status');
    expect(r.toolsToCall).not.toContain('company_profile');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Correções: CNPJ reconciliation, upsert completo, data_situacao_cadastral
// ══════════════════════════════════════════════════════════════════════════════

describe('company_profile — CNPJ reconciliation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('tool localiza matriz usando CNPJ normalizado (somente dígitos)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [KAVIAR_ENTITY] });
    const r = await getCompanyProfile({ section: 'identity' });
    // Verifica que a query usa CNPJ numérico
    const sql: string = mockQuery.mock.calls[0][0];
    const params: string[] = mockQuery.mock.calls[0][1];
    expect(params[0]).toBe('67783601000199');
    expect(params[0]).not.toContain('.');
    expect(params[0]).not.toContain('/');
    expect(params[0]).not.toContain('-');
  });

  it('CNPJ preexistente formatado é reconciliado pela migration (somente KAVIAR, não global)', () => {
    const fs = require('fs');
    const path = require('path');
    const migrationSql = fs.readFileSync(
      path.resolve(__dirname, '../prisma/migrations/20260813140000_add_institutional_fields/migration.sql'),
      'utf8'
    );
    // Must NOT contain global regexp_replace on all CNPJs
    expect(migrationSql).not.toContain("UPDATE \"legal_entities\"\nSET \"cnpj\" = regexp_replace");
    expect(migrationSql).not.toMatch(/UPDATE\s+"legal_entities"\s+SET\s+"cnpj"\s*=\s*regexp_replace/);
    // Must contain targeted reconciliation only for KAVIAR CNPJ
    expect(migrationSql).toContain("'67783601000199'");
    expect(migrationSql).toContain("'67.783.601/0001-99'");
    // Must abort if duplicate exists
    expect(migrationSql).toContain('Manual reconciliation required');
    // Must only update WHERE cnpj = formatted KAVIAR
    expect(migrationSql).toContain("WHERE cnpj = '67.783.601/0001-99'");
  });

  it('upsert atualiza todos os campos institucionais no ON CONFLICT', () => {
    const fs = require('fs');
    const path = require('path');
    const migrationSql = fs.readFileSync(
      path.resolve(__dirname, '../prisma/migrations/20260813140000_add_institutional_fields/migration.sql'),
      'utf8'
    );
    const expectedFields = [
      'razao_social', 'nome_fantasia', 'entity_type', 'uf', 'municipio', 'endereco',
      'data_abertura', 'situacao_cadastral', 'data_situacao_cadastral',
      'porte', 'natureza_juridica', 'capital_social_cents',
      'email_institucional', 'telefone_institucional', 'whatsapp_institucional', 'site',
      'logradouro', 'numero', 'complemento', 'bairro', 'cep',
      'cnae_principal', 'cnaes_secundarios', 'is_active',
    ];
    for (const field of expectedFields) {
      expect(migrationSql).toContain(`"${field}" = EXCLUDED."${field}"`);
    }
    // updated_at uses NOW() instead of EXCLUDED
    expect(migrationSql).toContain('"updated_at" = NOW()');
  });
});

describe('company_profile — data da situação cadastral', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna situação cadastral com data em pt-BR', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [KAVIAR_ENTITY] });
    const r = await askKaviarAi({ userId: 'a', question: 'Qual é o CNPJ da KAVIAR?', role: 'SUPER_ADMIN' });
    expect(r.answer).toContain('Situação cadastral: ATIVA desde 01/07/2026');
  });

  it('data da situação cadastral presente nos dados estruturados', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [KAVIAR_ENTITY] });
    const r = await getCompanyProfile({ section: 'identity' });
    expect(r.data.identity?.dataSituacaoCadastral).toBe('2026-07-01');
    expect(r.data.identity?.situacaoCadastral).toBe('ATIVA');
  });
});

describe('company_profile — privacidade mantida', () => {
  beforeEach(() => vi.clearAllMocks());

  it('números pessoais não aparecem na resposta de governança', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [KAVIAR_ENTITY] })
      .mockResolvedValueOnce({ rows: KAVIAR_PERSONS });
    const r = await askKaviarAi({ userId: 'a', question: 'Quem são os sócios e o CEO?', role: 'SUPER_ADMIN' });
    // No personal phones or CPFs
    expect(r.answer).not.toMatch(/\(\d{2}\)\s*\d{4,5}-\d{4}/); // only institutional phone should be absent here (governance section)
    expect(r.answer).not.toMatch(/\d{3}\.\d{3}\.\d{3}-\d{2}/); // CPF
    // Institutional contacts should NOT appear in governance-only response
    expect(r.answer).not.toContain('96864-8777'); // governance section doesn't show contacts
  });
});
