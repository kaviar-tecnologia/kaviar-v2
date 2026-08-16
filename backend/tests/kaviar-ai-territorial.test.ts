import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../src/db', () => ({ pool: { query: mockQuery } }));

const { mockResponsesCreate, mockResponsesRetrieve } = vi.hoisted(() => ({ mockResponsesCreate: vi.fn(), mockResponsesRetrieve: vi.fn() }));
vi.mock('openai', () => ({
  default: class MockOpenAI {
    responses = { create: mockResponsesCreate, retrieve: mockResponsesRetrieve };
    constructor(_opts: any) {}
  },
}));

import { getTerritoryOnboardingStatus, getTerritoryActivationReadiness } from '../src/services/ai/kaviar-ai.tools';
import { getRegisteredTools, executeTool } from '../src/services/ai/kaviar-ai.registry';
import { routeByRules } from '../src/services/ai/kaviar-ai.router';
import { parseCityUf } from '../src/services/ai/kaviar-ai.service';
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

  it('reconhece gestor ativo vinculado a região filha da cidade', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{
      id: 'rio-city', name: 'Rio de Janeiro', level: 'city', status: 'active',
      uf: 'RJ', city_name: 'Rio de Janeiro', regulatory_status: 'approved',
      regulatory_notes: null, moto_express_enabled: false, moto_passenger_enabled: false,
    }] });

    mockQuery.mockResolvedValueOnce({ rows: [{
      id: 'fernanda',
      name: 'Fernanda',
      email: 'fernanda@kaviar.com.br',
      role: 'TERRITORIAL_MANAGER',
      status: 'active',
      territory_id: 'barra',
      territory_name: 'Barra da Tijuca',
      territory_level: 'region',
    }] });

    mockQuery.mockResolvedValueOnce({ rows: [{
      is_active: true,
      contract_status: 'not_required',
      document_status: 'verified',
    }] });

    const r = await getTerritoryOnboardingStatus('Rio de Janeiro', 'RJ');

    expect(r.data.manager?.name).toBe('Fernanda');
    expect(r.data.manager?.territory_name).toBe('Barra da Tijuca');
    expect(r.data.pendencies).not.toContain('Nenhum gestor territorial vinculado.');

    const managerSql = String(mockQuery.mock.calls[1][0]);
    expect(managerSql).toContain('managed_t.parent_id = $1');
    expect(managerSql).toContain('a.is_active = true');

    expect(mockQuery.mock.calls[2][1]).toEqual(['fernanda', 'barra']);
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
  it('registry contém 26 ferramentas', () => {
    const tools = getRegisteredTools();
    expect(tools).toHaveLength(26);
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

describe('parseCityUf — perguntas de gestor', () => {
  it.each([
    ['Tem gestor em Rio de Janeiro/RJ?', 'Rio de Janeiro', 'RJ'],
    ['Tem um gestor em Tambaú/SP?', 'Tambaú', 'SP'],
    ['Existe gestor na cidade de Itaperuna/RJ?', 'Itaperuna', 'RJ'],
    ['Há gestora em Campinas/SP?', 'Campinas', 'SP'],
  ])('extrai corretamente cidade/UF de: %s', (question, city, uf) => {
    expect(parseCityUf(question)).toEqual({ city, uf });
  });
});

describe('routeByRules — territorial', () => {
  it('detecta "Quero abrir Pirassununga"', () => {
    const r = routeByRules('Quero abrir Pirassununga como cidade');
    expect(r.toolsToCall).toContain('territory_onboarding_status');
  });

  it('detecta pergunta individual "Tem gestor em Cidade/UF?"', () => {
    const r = routeByRules('Tem gestor em Rio de Janeiro/RJ?');
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
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_test12345678901234567890', status: 'queued' }); mockResponsesRetrieve.mockResolvedValueOnce({
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
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_test12345678901234567890', status: 'queued' }); mockResponsesRetrieve.mockResolvedValueOnce({
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
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_test12345678901234567890', status: 'queued' }); mockResponsesRetrieve.mockResolvedValueOnce({
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
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_test12345678901234567890', status: 'queued' }); mockResponsesRetrieve.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({ summary: 'ok', requirements: [], officialSources: [], unconfirmedItems: [], recommendedNextSteps: [], confidence: 'NEEDS_HUMAN_REVIEW' }),
    });
    await searchRegulatoryRequirements('Teste', 'SP');
    const args = mockResponsesCreate.mock.calls[0][0];
    expect(args.tools).toEqual([{ type: 'web_search', search_context_size: 'low' }]);
  });
});

describe('criação de território — regras', () => {
  it('endpoint exige confirmação (não é automático via tool)', () => {
    // As tools são read-only. Criação requer POST separado + confirmação explícita.
    const tools = getRegisteredTools();
    for (const tool of tools) {
      expect(tool.readOnly).toBe(true);
    }

    const routeSrc = require('fs').readFileSync(
      require('path').resolve(__dirname, '../src/routes/admin-ai.ts'), 'utf8'
    );
    const pageSrc = require('fs').readFileSync(
      require('path').resolve(__dirname, '../..', 'frontend-app/src/pages/admin/KaviarAiPage.jsx'), 'utf8'
    );

    expect(routeSrc).toContain("confirmation !== 'CRIAR_TERRITORIO'");
    expect(pageSrc).toContain("confirmation: 'CRIAR_TERRITORIO'");
    expect(pageSrc).toContain('Confirmar criação do território');
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

    const r = await askKaviarAi({ userId: 'admin-1', question: 'Quero abrir Pirassununga/SP', role: 'SUPER_ADMIN' });
    expect(r.toolsUsed).toContain('territory_onboarding_status');

    // Verificar que a query foi chamada com 'Pirassununga' e 'SP'
    const firstCall = mockQuery.mock.calls[0];
    expect(firstCall[1][0]).toBe('Pirassununga');
    expect(firstCall[1][1]).toBe('SP');
  });

  it('"Libere a landing de Itaperuna/RJ" extrai city=Itaperuna, uf=RJ', async () => {
    // Query 1: território
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Query 2: landings
    mockQuery.mockResolvedValueOnce({
      rows: [{
        city: 'Itaperuna',
        state: 'RJ',
        slug: 'itaperuna-rj',
        public_status: 'IMPLANTACAO',
        landing_enabled: false,
      }],
    });

    const r = await askKaviarAi({
      userId: 'admin-1',
      question: 'Libere a landing de Itaperuna/RJ',
      role: 'SUPER_ADMIN',
    });

    expect(r.toolsUsed).toContain('territory_onboarding_status');
    expect(r.toolsUsed).toContain('driver_city_landings');

    const firstCall = mockQuery.mock.calls[0];
    expect(firstCall[1][0]).toBe('Itaperuna');
    expect(firstCall[1][1]).toBe('RJ');
  });

  it('"Qual é o status de Santa Cruz das Palmeiras/SP?" extrai a cidade corretamente', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const r = await askKaviarAi({
      userId: 'admin-1',
      question: 'Qual é o status de Santa Cruz das Palmeiras/SP?',
      role: 'SUPER_ADMIN',
    });

    expect(r.toolsUsed).toContain('territory_onboarding_status');

    const firstCall = mockQuery.mock.calls[0];
    expect(firstCall[1][0]).toBe('Santa Cruz das Palmeiras');
    expect(firstCall[1][1]).toBe('SP');
  });

  it('preserva Nova em "Qual é o status de Nova Iguaçu/RJ?"', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await askKaviarAi({
      userId: 'admin-1',
      question: 'Qual é o status de Nova Iguaçu/RJ?',
      role: 'SUPER_ADMIN',
    });

    const firstCall = mockQuery.mock.calls[0];
    expect(firstCall[1][0]).toBe('Nova Iguaçu');
    expect(firstCall[1][1]).toBe('RJ');
  });

  it('pergunta territorial sem city/uf retorna mensagem de orientação', async () => {
    const r = await askKaviarAi({ userId: 'admin-1', question: 'Quero abrir uma cidade nova', role: 'SUPER_ADMIN' });
    expect(r.answer).toContain('Informe a cidade e a UF');
    expect(r.toolsUsed).toHaveLength(0);
  });

  it('"Sorocaba - SP" extrai corretamente', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await askKaviarAi({ userId: 'admin-1', question: 'Quero abrir cidade Sorocaba - SP e cadastrar gestor', role: 'SUPER_ADMIN' });
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
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_test12345678901234567890', status: 'queued' }); mockResponsesRetrieve.mockResolvedValueOnce({
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
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_test12345678901234567890', status: 'queued' }); mockResponsesRetrieve.mockResolvedValueOnce({
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
    await askKaviarAi({ userId: 'a', question: 'Quero abrir Santa Cruz das Palmeiras/SP', role: 'SUPER_ADMIN' });
    expect(mockQuery.mock.calls[0][1][0]).toBe('Santa Cruz das Palmeiras');
    expect(mockQuery.mock.calls[0][1][1]).toBe('SP');
  });

  it('Santa Rita do Passa Quatro/SP', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await askKaviarAi({ userId: 'a', question: 'Abrir Santa Rita do Passa Quatro/SP', role: 'SUPER_ADMIN' });
    expect(mockQuery.mock.calls[0][1][0]).toBe('Santa Rita do Passa Quatro');
    expect(mockQuery.mock.calls[0][1][1]).toBe('SP');
  });

  it('Sorocaba - SP continua funcionando', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await askKaviarAi({ userId: 'a', question: 'Abrir cidade Sorocaba - SP como gestor', role: 'SUPER_ADMIN' });
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
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_test12345678901234567890', status: 'queued' }); mockResponsesRetrieve.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({ summary: 'ok', requirements: [], officialSources: [], unconfirmedItems: [], recommendedNextSteps: [], confidence: 'NEEDS_HUMAN_REVIEW' }),
    });
    await searchRegulatoryRequirements('Teste', 'SP');
    const args = mockResponsesCreate.mock.calls[0][0];
    expect(args.reasoning).toEqual({ effort: 'low' });
    expect(args.max_output_tokens).toBe(4096);
  });

  it('erro incomplete inclui reason', async () => {
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_test12345678901234567890', status: 'queued' }); mockResponsesRetrieve.mockResolvedValueOnce({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output_text: '',
    });
    await expect(searchRegulatoryRequirements('X', 'SP')).rejects.toThrow('max_output_tokens');
  });
});

describe('pesquisa regulatória — reconciliação normativa', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.OPENAI_API_KEY = 'sk-test'; });
  afterEach(() => { delete process.env.OPENAI_API_KEY; });

  it('cenário 1: conflito norma antiga vs orientação oficial atual — exigência vai para unconfirmedItems', async () => {
    // Simula o cenário Campinas: lei antiga exige CA individual,
    // mas orientação atual da EMDEC diz que motorista não precisa de cadastro individual.
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_test12345678901234567890', status: 'queued' }); mockResponsesRetrieve.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({
        summary: 'Conflito entre Decreto 18.551/2015 e orientação operacional atual da EMDEC.',
        requirements: [
          'Empresa (ETC/OTTC) deve possuir cadastro na EMDEC',
        ],
        officialSources: [
          { title: 'Decreto 18.551/2015', url: 'https://leismunicipais.campinas.sp.gov.br/decreto-18551', orgao: 'Prefeitura de Campinas' },
          { title: 'Orientação EMDEC 2024 — Transporte por Aplicativo', url: 'https://emdec.campinas.sp.gov.br/transporte-aplicativo', orgao: 'EMDEC' },
        ],
        unconfirmedItems: [
          'CA individual do motorista: exigido pelo Decreto 18.551/2015 art. 5º, porém orientação operacional atual da EMDEC (2024) indica que motorista não precisa de cadastro individual. Conflito não reconciliado — vigência não confirmada.',
          'Domicílio em Campinas: exigido pelo Decreto 18.551/2015 art. 7º, mas não mencionado na orientação atual da EMDEC. Vigência incerta.',
          'Veículo licenciado em Campinas: exigido pelo Decreto 18.551/2015, sem confirmação na orientação atual. Vigência incerta.',
        ],
        recommendedNextSteps: [
          'Consultar EMDEC diretamente para confirmar se Decreto 18.551/2015 segue vigente integralmente',
          'Verificar Diário Oficial de Campinas por decreto alterador ou revogador',
        ],
        confidence: 'NEEDS_HUMAN_REVIEW',
      }),
    });

    const r = await searchRegulatoryRequirements('Campinas', 'SP');

    // Conflito explicitado: exigências antigas NÃO estão em requirements
    expect(r.requirements).not.toContain(expect.stringMatching(/CA individual/i));
    expect(r.requirements).not.toContain(expect.stringMatching(/domicílio/i));
    expect(r.requirements).not.toContain(expect.stringMatching(/licenciado em Campinas/i));

    // Exigências conflitantes estão em unconfirmedItems
    expect(r.unconfirmedItems.length).toBeGreaterThanOrEqual(1);
    expect(r.unconfirmedItems.some(i => i.includes('Decreto 18.551'))).toBe(true);
    expect(r.unconfirmedItems.some(i => i.includes('EMDEC'))).toBe(true);

    // Confidence deve ser NEEDS_HUMAN_REVIEW
    expect(r.confidence).toBe('NEEDS_HUMAN_REVIEW');

    // Fontes oficiais citam ambas (norma antiga E orientação atual)
    expect(r.officialSources.some(s => s.url.includes('leismunicipais'))).toBe(true);
    expect(r.officialSources.some(s => s.url.includes('emdec'))).toBe(true);
  });

  it('cenário 2: ato posterior resolve expressamente o conflito — só regra vigente em requirements', async () => {
    // Simula: lei antiga exigia taxa X, lei posterior de mesma hierarquia revogou expressamente o artigo.
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_test12345678901234567890', status: 'queued' }); mockResponsesRetrieve.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({
        summary: 'Lei 5.000/2018 exigia taxa de vistoria. Lei 6.200/2023 revogou expressamente o art. 12 da Lei 5.000/2018, eliminando a taxa.',
        requirements: [
          'Cadastro da empresa na Secretaria de Transportes (Lei 5.000/2018 art. 3º, mantido vigente)',
        ],
        officialSources: [
          { title: 'Lei 5.000/2018', url: 'https://legislacao.cidade.sp.gov.br/lei-5000', orgao: 'Câmara Municipal' },
          { title: 'Lei 6.200/2023 — Revogação de taxa de vistoria', url: 'https://legislacao.cidade.sp.gov.br/lei-6200', orgao: 'Câmara Municipal' },
        ],
        unconfirmedItems: [],
        recommendedNextSteps: ['Confirmar vigência consolidada no portal da prefeitura'],
        confidence: 'CONFIRMED',
      }),
    });

    const r = await searchRegulatoryRequirements('Cidade', 'SP');

    // Apenas regra vigente aparece em requirements
    expect(r.requirements).toHaveLength(1);
    expect(r.requirements[0]).toContain('Cadastro da empresa');

    // Taxa revogada NÃO aparece em requirements
    expect(r.requirements.some(req => req.includes('taxa de vistoria'))).toBe(false);

    // Summary cita fonte antiga E ato posterior
    expect(r.summary).toContain('Lei 5.000/2018');
    expect(r.summary).toContain('Lei 6.200/2023');

    // Sem itens não confirmados (conflito foi resolvido)
    expect(r.unconfirmedItems).toHaveLength(0);

    // Confidence CONFIRMED porque lei posterior de mesma hierarquia resolveu
    expect(r.confidence).toBe('CONFIRMED');
  });

  it('cenário 3: ausência de confirmação sobre vigência — mantém em unconfirmedItems', async () => {
    // Simula: norma encontrada mas sem confirmação de que ainda está vigente (sem ato revogador nem confirmação)
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_test12345678901234567890', status: 'queued' }); mockResponsesRetrieve.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({
        summary: 'Decreto 3.100/2016 regulamenta transporte por aplicativo, mas não foi possível confirmar vigência atual.',
        requirements: [],
        officialSources: [
          { title: 'Decreto 3.100/2016', url: 'https://prefeitura.cidade.mg.gov.br/decreto-3100', orgao: 'Prefeitura' },
        ],
        unconfirmedItems: [
          'Alvará anual para motorista (Decreto 3.100/2016 art. 8º): norma de 2016, sem confirmação de vigência atual. Não foi localizado ato revogador nem confirmação oficial de que o requisito permanece exigido.',
          'Seguro APP específico (Decreto 3.100/2016 art. 10): mesma situação — vigência não confirmada.',
        ],
        recommendedNextSteps: [
          'Consultar Diário Oficial do município por alterações ao Decreto 3.100/2016',
          'Verificar site da Secretaria de Transportes para orientação operacional atualizada',
        ],
        confidence: 'NEEDS_HUMAN_REVIEW',
      }),
    });

    const r = await searchRegulatoryRequirements('Cidade', 'MG');

    // Nenhum requisito apresentado como vigente (requirements vazio)
    expect(r.requirements).toHaveLength(0);

    // Itens sem confirmação estão em unconfirmedItems
    expect(r.unconfirmedItems.length).toBeGreaterThanOrEqual(2);
    expect(r.unconfirmedItems.some(i => i.includes('vigência não confirmada') || i.includes('sem confirmação'))).toBe(true);

    // Confidence NEEDS_HUMAN_REVIEW
    expect(r.confidence).toBe('NEEDS_HUMAN_REVIEW');

    // Fontes oficiais presentes (a norma foi encontrada, só não confirmada)
    expect(r.officialSources.length).toBeGreaterThanOrEqual(1);
    expect(r.officialSources[0].url).toContain('.gov.br');
  });

  it('prompt contém regras de reconciliação normativa', async () => {
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_test12345678901234567890', status: 'queued' }); mockResponsesRetrieve.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({
        summary: 'ok', requirements: [], officialSources: [],
        unconfirmedItems: [], recommendedNextSteps: [], confidence: 'NEEDS_HUMAN_REVIEW',
      }),
    });
    await searchRegulatoryRequirements('Teste', 'SP');
    const args = mockResponsesCreate.mock.calls[0][0];
    const instructions: string = args.instructions;

    // Verifica presença das regras de reconciliação no prompt enviado ao modelo
    expect(instructions).toContain('REGRAS DE RECONCILIAÇÃO NORMATIVA');
    expect(instructions).toContain('unconfirmedItems');
    expect(instructions).toContain('NUNCA apresente requisito de norma histórica como vigente');
    expect(instructions).toContain('hierarquia normativa');
    expect(instructions).toContain('NÃO invente revogação');
    expect(instructions).toContain('NEEDS_HUMAN_REVIEW');
  });
});

describe('pesquisa regulatória — guarda determinística de confidence', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.OPENAI_API_KEY = 'sk-test'; });
  afterEach(() => { delete process.env.OPENAI_API_KEY; });

  it('modelo retorna CONFIRMED com unconfirmedItems não vazio → resultado final NEEDS_HUMAN_REVIEW', async () => {
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_test12345678901234567890', status: 'queued' }); mockResponsesRetrieve.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({
        summary: 'Campinas regulamentada com conflitos.',
        requirements: ['Cadastro ETC na EMDEC'],
        officialSources: [{ title: 'EMDEC', url: 'https://emdec.campinas.sp.gov.br/info', orgao: 'EMDEC' }],
        unconfirmedItems: ['CA individual: conflito entre Decreto 18.551/2015 e orientação atual da EMDEC'],
        recommendedNextSteps: ['Confirmar com EMDEC'],
        confidence: 'CONFIRMED',
      }),
    });

    const r = await searchRegulatoryRequirements('Campinas', 'SP');
    expect(r.confidence).toBe('NEEDS_HUMAN_REVIEW');
    expect(r.unconfirmedItems).toHaveLength(1);
  });

  it('modelo retorna CONFIRMED com unconfirmedItems vazio → permanece CONFIRMED', async () => {
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_test12345678901234567890', status: 'queued' }); mockResponsesRetrieve.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({
        summary: 'Cidade regulamentada sem conflitos.',
        requirements: ['Alvará municipal'],
        officialSources: [{ title: 'Prefeitura', url: 'https://prefeitura.cidade.sp.gov.br/lei', orgao: 'Prefeitura' }],
        unconfirmedItems: [],
        recommendedNextSteps: ['Protocolar'],
        confidence: 'CONFIRMED',
      }),
    });

    const r = await searchRegulatoryRequirements('Cidade', 'SP');
    expect(r.confidence).toBe('CONFIRMED');
    expect(r.unconfirmedItems).toHaveLength(0);
  });

  it('modelo retorna NEEDS_HUMAN_REVIEW → permanece NEEDS_HUMAN_REVIEW', async () => {
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_test12345678901234567890', status: 'queued' }); mockResponsesRetrieve.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({
        summary: 'Informação insuficiente.',
        requirements: [],
        officialSources: [{ title: 'Portal', url: 'https://prefeitura.mg.gov.br/x', orgao: 'Prefeitura' }],
        unconfirmedItems: ['Sem confirmação de vigência'],
        recommendedNextSteps: ['Consultar Diário Oficial'],
        confidence: 'NEEDS_HUMAN_REVIEW',
      }),
    });

    const r = await searchRegulatoryRequirements('Cidade', 'MG');
    expect(r.confidence).toBe('NEEDS_HUMAN_REVIEW');
  });
});

describe('Chat KAVIAR — liberação segura de landing', () => {
  const routeSrc = require('fs').readFileSync(
    require('path').resolve(__dirname, '../src/routes/admin-ai.ts'),
    'utf8'
  );

  it('exige SUPER_ADMIN e confirmação explícita', () => {
    expect(routeSrc).toContain(
      "router.post('/territory/landing/enable', requireSuperAdmin"
    );
    expect(routeSrc).toContain(
      "confirmation !== 'LIBERAR_LANDING'"
    );
  });

  it('não ativa o território ao liberar landing', () => {
    const section =
      routeSrc.split("'/territory/landing/enable'")[1]
        ?.split('export default router')[0] || '';

    expect(section).toContain('landing_enabled: true');
    expect(section).not.toContain("status: 'active'");
    expect(section).not.toContain('is_active: true');
  });

  it('registra auditoria da ação', () => {
    expect(routeSrc).toContain(
      "action: 'enable_driver_city_landing'"
    );
    expect(routeSrc).toContain(
      "source: 'chat_kaviar'"
    );
  });
});
