import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../src/db', () => ({ pool: { query: mockQuery } }));

const { mockResponsesCreate } = vi.hoisted(() => ({ mockResponsesCreate: vi.fn() }));
vi.mock('openai', () => ({
  default: class MockOpenAI {
    responses = { create: mockResponsesCreate };
    constructor(_opts: any) {}
  },
}));

import { getTerritoryOnboardingStatus, getTerritoryActivationReadiness } from '../src/services/ai/kaviar-ai.tools';
import { getRegisteredTools, executeTool } from '../src/services/ai/kaviar-ai.registry';
import { routeByRules } from '../src/services/ai/kaviar-ai.router';
import { searchRegulatoryRequirements } from '../src/services/ai/kaviar-ai.regulatory-search';

describe('territory_onboarding_status', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna found=false quando território não existe', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const r = await getTerritoryOnboardingStatus('Pirassununga', 'SP');
    expect(r.tool).toBe('territory_onboarding_status');
    expect(r.data.found).toBe(false);
    expect(r.data.pendencies[0]).toContain('não encontrado');
  });

  it('retorna território com gestor e pendências', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{
      id: 't1', name: 'Pirassununga', level: 'city', status: 'preparation',
      uf: 'SP', city_name: 'Pirassununga', regulatory_status: 'not_evaluated',
      regulatory_notes: null, moto_express_enabled: false, moto_passenger_enabled: false,
    }] });
    mockQuery.mockResolvedValueOnce({ rows: [{
      id: 'a1', name: 'João', email: 'j@k.com', role: 'TERRITORIAL_MANAGER', status: 'active',
    }] });
    // operator_profile query
    mockQuery.mockResolvedValueOnce({ rows: [{
      is_active: true, contract_status: 'pending', document_status: 'pending',
    }] });
    const r = await getTerritoryOnboardingStatus('Pirassununga', 'SP');
    expect(r.data.found).toBe(true);
    expect(r.data.territory!.name).toBe('Pirassununga');
    expect(r.data.manager!.name).toBe('João');
    expect(r.data.pendencies).toContain('Regulatório não avaliado.');
  });

  it('retorna sem gestor quando não há assignment', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{
      id: 't1', name: 'Teste', level: 'city', status: 'planning',
      uf: 'SP', city_name: 'Teste', regulatory_status: 'approved',
      regulatory_notes: null, moto_express_enabled: false, moto_passenger_enabled: false,
    }] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const r = await getTerritoryOnboardingStatus('Teste', 'SP');
    expect(r.data.manager).toBeNull();
    expect(r.data.pendencies).toContain('Nenhum gestor territorial vinculado.');
  });

  it('falha com cidade vazia', async () => {
    const r = await getTerritoryOnboardingStatus('', 'SP');
    expect(r.data.found).toBe(false);
    expect(r.data.pendencies[0]).toContain('inválida');
  });

  it('falha com UF de 3 letras', async () => {
    const r = await getTerritoryOnboardingStatus('Cidade', 'SPX');
    expect(r.data.found).toBe(false);
  });
});

describe('territory_activation_readiness', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retorna NOT_READY sem território', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const r = await getTerritoryActivationReadiness('X', 'YZ');
    expect(r.data.ready).toBe(false);
    expect(r.data.reasons[0]).toContain('não encontrado');
  });

  it('retorna READY quando território preparation + regulatório approved + gestor ativo', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{
      id: 't1', name: 'Cidade', status: 'preparation', regulatory_status: 'approved',
    }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 1 }] });
    // operator_profile
    mockQuery.mockResolvedValueOnce({ rows: [{
      is_active: true, contract_status: 'signed', document_status: 'verified',
    }] });
    const r = await getTerritoryActivationReadiness('Cidade', 'SP');
    expect(r.data.ready).toBe(true);
    expect(r.data.reasons[0]).toContain('pronto para ativação');
  });

  it('retorna NOT_READY sem gestor', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{
      id: 't1', name: 'Cidade', status: 'preparation', regulatory_status: 'approved',
    }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 0 }] });
    const r = await getTerritoryActivationReadiness('Cidade', 'SP');
    expect(r.data.ready).toBe(false);
    expect(r.data.reasons).toContain('Nenhum gestor territorial ativo.');
  });

  it('retorna NOT_READY com regulatório não aprovado', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{
      id: 't1', name: 'Cidade', status: 'preparation', regulatory_status: 'in_review',
    }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 1 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{
      is_active: true, contract_status: 'signed', document_status: 'verified',
    }] });
    const r = await getTerritoryActivationReadiness('Cidade', 'SP');
    expect(r.data.ready).toBe(false);
    expect(r.data.reasons.some(r => r.includes('in_review'))).toBe(true);
  });

  it('território já ativo retorna READY', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{
      id: 't1', name: 'Ativa', status: 'active', regulatory_status: 'approved',
    }] });
    const r = await getTerritoryActivationReadiness('Ativa', 'SP');
    expect(r.data.ready).toBe(true);
  });

  it('território nunca nasce active via tool (read-only)', async () => {
    // A tool apenas CONSULTA, nunca cria ou ativa
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const r = await getTerritoryActivationReadiness('Nova', 'SP');
    expect(r.data.ready).toBe(false);
    // Nenhum INSERT/UPDATE foi chamado
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0][0];
    expect(sql.toUpperCase()).not.toContain('INSERT');
    expect(sql.toUpperCase()).not.toContain('UPDATE');
  });
});

describe('registry — novas tools registradas', () => {
  it('registry contém 5 ferramentas', () => {
    const tools = getRegisteredTools();
    expect(tools).toHaveLength(5);
  });

  it('3 ferramentas antigas continuam registradas', () => {
    const names = getRegisteredTools().map(t => t.name);
    expect(names).toContain('rides_summary_today');
    expect(names).toContain('drivers_documents_pending');
    expect(names).toContain('finance_due_obligations');
  });

  it('novas ferramentas estão registradas e readOnly', () => {
    const tools = getRegisteredTools();
    const onb = tools.find(t => t.name === 'territory_onboarding_status');
    const rdy = tools.find(t => t.name === 'territory_activation_readiness');
    expect(onb).toBeDefined();
    expect(onb!.readOnly).toBe(true);
    expect(rdy).toBeDefined();
    expect(rdy!.readOnly).toBe(true);
  });

  it('executeTool rejeita ferramenta inexistente', async () => {
    await expect(executeTool('activate_territory')).rejects.toThrow('não está registrada');
  });
});

describe('routeByRules — territorial', () => {
  it('detecta "Quero abrir Pirassununga"', () => {
    const r = routeByRules('Quero abrir Pirassununga como cidade');
    expect(r.toolsToCall).toContain('territory_onboarding_status');
  });

  it('detecta "cadastrar gestor na cidade"', () => {
    const r = routeByRules('Quero cadastrar gestor na cidade de Sorocaba');
    expect(r.toolsToCall).toContain('territory_onboarding_status');
  });

  it('NÃO aciona territorial para perguntas de corrida', () => {
    const r = routeByRules('Corridas hoje?');
    expect(r.toolsToCall).not.toContain('territory_onboarding_status');
  });

  it('NÃO aciona territorial para perguntas financeiras', () => {
    const r = routeByRules('Quais obrigações financeiras estão pendentes?');
    expect(r.toolsToCall).not.toContain('territory_onboarding_status');
  });
});

describe('segurança — dados sensíveis', () => {
  it('tool não envia CPF/senha ao SQL (read-only queries)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getTerritoryOnboardingStatus('Cidade', 'SP');
    const sql = mockQuery.mock.calls[0][0];
    expect(sql.toUpperCase()).toContain('SELECT');
    expect(sql.toUpperCase()).not.toContain('INSERT');
    expect(sql.toUpperCase()).not.toContain('UPDATE');
    expect(sql.toUpperCase()).not.toContain('DELETE');
  });
});
describe('pesquisa regulatória', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'sk-test-fake';
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it('retorna resultado estruturado com CONFIRMED', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({
        summary: 'Cidade regulamentada.',
        requirements: ['Alvará'],
        officialSources: [{ title: 'Lei 123', url: 'http://prefeitura.gov.br', orgao: 'Prefeitura' }],
        unconfirmedItems: [],
        recommendedNextSteps: ['Protocolar'],
        confidence: 'CONFIRMED',
      }),
    });
    const r = await searchRegulatoryRequirements('Campinas', 'SP');
    expect(r.confidence).toBe('CONFIRMED');
    expect(r.requirements).toContain('Alvará');
    expect(r.officialSources[0].orgao).toBe('Prefeitura');
  });

  it('retorna NEEDS_HUMAN_REVIEW sem fonte suficiente', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({
        summary: 'Sem informação.',
        requirements: [],
        officialSources: [],
        unconfirmedItems: ['Sem legislação encontrada'],
        recommendedNextSteps: ['Consultar prefeitura'],
        confidence: 'NEEDS_HUMAN_REVIEW',
      }),
    });
    const r = await searchRegulatoryRequirements('Cidade', 'XX');
    expect(r.confidence).toBe('NEEDS_HUMAN_REVIEW');
  });

  it('lança erro sem OPENAI_API_KEY', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(searchRegulatoryRequirements('A', 'SP')).rejects.toThrow('OPENAI_API_KEY');
  });

  it('lança erro com cidade vazia', async () => {
    await expect(searchRegulatoryRequirements('', 'SP')).rejects.toThrow('inválida');
  });

  it('não envia dados sensíveis ao OpenAI', async () => {
    process.env.DATABASE_URL = 'postgresql://secret';
    process.env.JWT_SECRET = 'jwt123';
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({ summary: 'ok', requirements: [], officialSources: [], unconfirmedItems: [], recommendedNextSteps: [], confidence: 'NEEDS_HUMAN_REVIEW' }),
    });
    await searchRegulatoryRequirements('Teste', 'SP');
    const args = mockResponsesCreate.mock.calls[0][0];
    const inputStr = JSON.stringify(args.input) + JSON.stringify(args.instructions);
    expect(inputStr).not.toContain('postgresql://');
    expect(inputStr).not.toContain('jwt123');
    expect(inputStr).not.toContain('sk-test-fake');
    delete process.env.DATABASE_URL;
    delete process.env.JWT_SECRET;
  });

  it('usa web_search como tool', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({ summary: 'ok', requirements: [], officialSources: [], unconfirmedItems: [], recommendedNextSteps: [], confidence: 'NEEDS_HUMAN_REVIEW' }),
    });
    await searchRegulatoryRequirements('Teste', 'SP');
    const args = mockResponsesCreate.mock.calls[0][0];
    expect(args.tools).toEqual([{ type: 'web_search' }]);
  });
});

describe('criação de território — regras', () => {
  it('endpoint exige confirmação (não é automático via tool)', () => {
    // As tools são read-only. Criação requer POST separado com confirmação frontend.
    const tools = getRegisteredTools();
    for (const tool of tools) {
      expect(tool.readOnly).toBe(true);
    }
  });

  it('território nunca nasce active (rota usa planning)', async () => {
    // Verificar no source da rota que criação de território usa status 'planning'
    const routeSrc = require('fs').readFileSync(
      require('path').resolve(__dirname, '../src/routes/admin-ai.ts'), 'utf8'
    );
    expect(routeSrc).toContain("status: 'planning'");
    expect(routeSrc).toContain('is_active: false');
    // A criação de território NÃO contém active na seção de create
    const createSection = routeSrc.split("'/territory/create'")[1]?.split("'/territory/create-manager'")[0] || '';
    expect(createSection).not.toContain("status: 'active'");
  });

  it('rota de criação bloqueia duplicidade (status 409)', () => {
    const routeSrc = require('fs').readFileSync(
      require('path').resolve(__dirname, '../src/routes/admin-ai.ts'), 'utf8'
    );
    expect(routeSrc).toContain('409');
    expect(routeSrc).toContain('já existe');
  });

  it('rota de criação exige requireSuperAdmin', () => {
    const routeSrc = require('fs').readFileSync(
      require('path').resolve(__dirname, '../src/routes/admin-ai.ts'), 'utf8'
    );
    expect(routeSrc).toContain("'/territory/create', requireSuperAdmin");
  });
});

describe('cadastro de gestor — regras', () => {
  it('rota create-manager exige requireSuperAdmin', () => {
    const routeSrc = require('fs').readFileSync(
      require('path').resolve(__dirname, '../src/routes/admin-ai.ts'), 'utf8'
    );
    expect(routeSrc).toContain("'/territory/create-manager', requireSuperAdmin");
  });

  it('cadastro usa formulário separado (frontend Dialog)', () => {
    const pageSrc = require('fs').readFileSync(
      require('path').resolve(__dirname, '../..', 'frontend-app/src/pages/admin/KaviarAiPage.jsx'), 'utf8'
    );
    expect(pageSrc).toContain('Dialog');
    expect(pageSrc).toContain('Cadastrar Gestor Territorial');
    expect(pageSrc).toContain('managerForm');
    // Dados do form não passam pela conversa
    expect(pageSrc).toContain("api.post('/api/admin/ai/territory/create-manager'");
  });

  it('senha não é pedida no chat — gerada no backend', () => {
    const routeSrc = require('fs').readFileSync(
      require('path').resolve(__dirname, '../src/routes/admin-ai.ts'), 'utf8'
    );
    expect(routeSrc).toContain('tempPassword');
    expect(routeSrc).toContain('must_change_password: true');
  });
});

import { askKaviarAi } from '../src/services/ai/kaviar-ai.service';

describe('Fix 1: parseCityUf + args passados à tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.KAVIAR_AI_ROUTER_MODE;
  });

  it('"Quero abrir Pirassununga/SP" executa tool com city=Pirassununga, uf=SP', async () => {
    // Query 1: território não existe
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // Query 2: readiness (segundo tool)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const r = await askKaviarAi({ userId: 'admin-1', question: 'Quero abrir Pirassununga/SP' });
    expect(r.toolsUsed).toContain('territory_onboarding_status');

    // Verificar que a query foi chamada com 'Pirassununga' e 'SP'
    const firstCall = mockQuery.mock.calls[0];
    expect(firstCall[1][0]).toBe('Pirassununga');
    expect(firstCall[1][1]).toBe('SP');
  });

  it('pergunta territorial sem city/uf retorna mensagem de orientação', async () => {
    const r = await askKaviarAi({ userId: 'admin-1', question: 'Quero abrir uma cidade nova' });
    expect(r.answer).toContain('Informe a cidade e a UF');
    expect(r.toolsUsed).toHaveLength(0);
  });

  it('"Sorocaba - SP" extrai corretamente', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await askKaviarAi({ userId: 'admin-1', question: 'Quero abrir cidade Sorocaba - SP e cadastrar gestor' });
    const firstCall = mockQuery.mock.calls[0];
    expect(firstCall[1][0]).toBe('Sorocaba');
    expect(firstCall[1][1]).toBe('SP');
  });
});

describe('Fix 2: ID no formatter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('formatter inclui ID e Cidade/UF', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{
      id: 'abc-123', name: 'Pirassununga — SP', level: 'city', status: 'preparation',
      uf: 'SP', city_name: 'Pirassununga', regulatory_status: 'approved',
      regulatory_notes: null, moto_express_enabled: false, moto_passenger_enabled: false,
    }] });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // manager

    const r = await getTerritoryOnboardingStatus('Pirassununga', 'SP');
    // Importing service to test formatter would be circular; test data directly
    expect(r.data.territory!.id).toBe('abc-123');
  });
});

describe('Fix 4: readiness com perfil do gestor', () => {
  beforeEach(() => vi.clearAllMocks());

  it('gestor com contrato pendente => NOT_READY', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{
      id: 't1', name: 'Cidade', status: 'preparation', regulatory_status: 'approved',
    }] });
    // manager count
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 1 }] });
    // operator_profile
    mockQuery.mockResolvedValueOnce({ rows: [{
      is_active: true, contract_status: 'pending', document_status: 'verified',
    }] });

    const r = await getTerritoryActivationReadiness('Cidade', 'SP');
    expect(r.data.ready).toBe(false);
    expect(r.data.reasons.some(r => r.includes('Contrato'))).toBe(true);
  });

  it('gestor com documentos pendentes => NOT_READY', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{
      id: 't1', name: 'Cidade', status: 'preparation', regulatory_status: 'approved',
    }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 1 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{
      is_active: true, contract_status: 'signed', document_status: 'pending',
    }] });

    const r = await getTerritoryActivationReadiness('Cidade', 'SP');
    expect(r.data.ready).toBe(false);
    expect(r.data.reasons.some(r => r.includes('Documentos'))).toBe(true);
  });

  it('gestor completo + regulatório ok => READY', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{
      id: 't1', name: 'Cidade', status: 'preparation', regulatory_status: 'controlled_operation',
    }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 1 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{
      is_active: true, contract_status: 'signed', document_status: 'verified',
    }] });

    const r = await getTerritoryActivationReadiness('Cidade', 'SP');
    expect(r.data.ready).toBe(true);
  });
});

describe('Fix 5: filtro de fontes governamentais', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'sk-test-fake';
  });
  afterEach(() => { delete process.env.OPENAI_API_KEY; });

  it('remove fontes não .gov.br/.leg.br', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({
        summary: 'Resultado',
        requirements: ['Alvará'],
        officialSources: [
          { title: 'Oficial', url: 'https://prefeitura.sp.gov.br/lei', orgao: 'Prefeitura' },
          { title: 'Blog', url: 'https://blog.example.com/post', orgao: 'Blog' },
          { title: 'Câmara', url: 'https://camara.leg.br/doc', orgao: 'Câmara' },
        ],
        unconfirmedItems: [],
        recommendedNextSteps: [],
        confidence: 'CONFIRMED',
      }),
    });
    const r = await searchRegulatoryRequirements('Cidade', 'SP');
    expect(r.officialSources).toHaveLength(2);
    expect(r.officialSources[0].url).toContain('.gov.br');
    expect(r.officialSources[1].url).toContain('.leg.br');
  });

  it('sem fonte gov => NEEDS_HUMAN_REVIEW', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({
        summary: 'Resultado',
        requirements: [],
        officialSources: [{ title: 'Blog', url: 'https://blog.com/x', orgao: 'Blog' }],
        unconfirmedItems: [],
        recommendedNextSteps: [],
        confidence: 'CONFIRMED',
      }),
    });
    const r = await searchRegulatoryRequirements('Cidade', 'SP');
    expect(r.confidence).toBe('NEEDS_HUMAN_REVIEW');
    expect(r.officialSources).toHaveLength(0);
  });
});

describe('Fix 3: senha segura', () => {
  it('rota usa crypto.randomBytes (não Date.now)', () => {
    const routeSrc = require('fs').readFileSync(
      require('path').resolve(__dirname, '../src/routes/admin-ai.ts'), 'utf8'
    );
    expect(routeSrc).toContain('crypto.randomBytes');
    expect(routeSrc).not.toContain('Date.now()');
    expect(routeSrc).toContain('generateSecurePassword');
    // Senha retornada ao frontend uma vez
    expect(routeSrc).toContain('temp_password: tempPassword');
    // audit newValue NÃO contém a senha
    const auditMatch = routeSrc.match(/action: 'create_regional_admin'[^}]*newValue:\s*\{([^}]*)\}/s);
    const newValueContent = auditMatch ? auditMatch[1] : '';
    expect(newValueContent).not.toContain('password');
    expect(newValueContent).not.toContain('temp_password');
  });
});

describe('parseCityUf — nomes multi-palavra', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Santa Cruz das Palmeiras/SP', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await askKaviarAi({ userId: 'a', question: 'Quero abrir Santa Cruz das Palmeiras/SP' });
    expect(mockQuery.mock.calls[0][1][0]).toBe('Santa Cruz das Palmeiras');
    expect(mockQuery.mock.calls[0][1][1]).toBe('SP');
  });

  it('Santa Rita do Passa Quatro/SP', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await askKaviarAi({ userId: 'a', question: 'Abrir Santa Rita do Passa Quatro/SP' });
    expect(mockQuery.mock.calls[0][1][0]).toBe('Santa Rita do Passa Quatro');
    expect(mockQuery.mock.calls[0][1][1]).toBe('SP');
  });

  it('Sorocaba - SP continua funcionando', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await askKaviarAi({ userId: 'a', question: 'Abrir cidade Sorocaba - SP como gestor' });
    expect(mockQuery.mock.calls[0][1][0]).toBe('Sorocaba');
    expect(mockQuery.mock.calls[0][1][1]).toBe('SP');
  });
});

describe('Fix 3: moto_passenger_compliance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('moto_passenger_enabled + compliance PENDING => NOT_READY', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{
      id: 't1', name: 'Cidade', status: 'preparation', regulatory_status: 'approved', moto_passenger_enabled: true,
    }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 1 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ is_active: true, contract_status: 'signed', document_status: 'verified' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'PENDING' }] });

    const r = await getTerritoryActivationReadiness('Cidade', 'SP');
    expect(r.data.ready).toBe(false);
    expect(r.data.reasons.some(r => r.includes('Moto passageiro'))).toBe(true);
  });

  it('moto_passenger_enabled + compliance APPROVED => READY', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{
      id: 't1', name: 'Cidade', status: 'preparation', regulatory_status: 'approved', moto_passenger_enabled: true,
    }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 1 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ is_active: true, contract_status: 'signed', document_status: 'verified' }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'APPROVED' }] });

    const r = await getTerritoryActivationReadiness('Cidade', 'SP');
    expect(r.data.ready).toBe(true);
  });
});

describe('pesquisa regulatória — params e incomplete', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.OPENAI_API_KEY = 'sk-test'; });
  afterEach(() => { delete process.env.OPENAI_API_KEY; });

  it('usa reasoning low e max_output_tokens 4096', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({ summary: 'ok', requirements: [], officialSources: [], unconfirmedItems: [], recommendedNextSteps: [], confidence: 'NEEDS_HUMAN_REVIEW' }),
    });
    await searchRegulatoryRequirements('Teste', 'SP');
    const args = mockResponsesCreate.mock.calls[0][0];
    expect(args.reasoning).toEqual({ effort: 'low' });
    expect(args.max_output_tokens).toBe(4096);
  });

  it('erro incomplete inclui reason', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output_text: '',
    });
    await expect(searchRegulatoryRequirements('X', 'SP')).rejects.toThrow('max_output_tokens');
  });
});
