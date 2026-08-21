import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../src/db', () => ({
  pool: { query: mockQuery },
}));

vi.mock('../src/services/email/inbound-email-security-risk', () => ({
  evaluateInboundEmailSecurityRisk: () => ({ level: 'LOW', suspicious: false, reasons: [] }),
}));

import { askKaviarAi } from '../src/services/ai/kaviar-ai.service';
import type { KaviarAiModelProvider } from '../src/services/ai/kaviar-ai.provider';

// ── Generative Fallback Tests ──────────────────────────────────────────────

describe('askKaviarAi — generative fallback (hybrid routing)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  afterEach(() => {
    mockQuery.mockReset();
    delete process.env.KAVIAR_AI_ROUTER_MODE;
  });

  // ── Known questions still use deterministic tools ────────────────────────

  it('pergunta de CNPJ/empresa → usa company_profile, sem fallback', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';

    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'ent-1',
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
        natureza_juridica: 'LTDA',
        capital_social_cents: '10000',
        email_institucional: 'contato@kaviar.com.br',
        telefone_institucional: null,
        whatsapp_institucional: null,
        site: 'https://kaviar.com.br',
        logradouro: 'Rua Teste',
        numero: '123',
        complemento: null,
        bairro: 'Centro',
        cep: '20000000',
        cnae_principal: '6311-9/00',
        cnaes_secundarios: [],
      }],
    });

    const mockProvider: KaviarAiModelProvider & { compose: any; answerGeneral: any } = {
      decide: vi.fn(),
      compose: vi.fn(),
      answerGeneral: vi.fn(),
    };

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'qual o CNPJ da KAVIAR?', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    expect(result.toolsUsed).toContain('company_profile');
    expect(result.answer).toContain('67.783.601/0001-99');
    // answerGeneral should NOT be called — rules matched
    expect(mockProvider.answerGeneral).not.toHaveBeenCalled();
    expect(mockProvider.compose).not.toHaveBeenCalled();
  });

  it('pergunta financeira → usa tool atual, sem fallback', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';

    mockQuery.mockResolvedValueOnce({
      rows: [{ rides: 3, gross_total: '150.00', platform_fee_total: '15.00' }],
    });

    const mockProvider: KaviarAiModelProvider & { compose: any; answerGeneral: any } = {
      decide: vi.fn(),
      compose: vi.fn(),
      answerGeneral: vi.fn(),
    };

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'quanto a KAVIAR ganhou hoje?', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    expect(result.toolsUsed).toContain('rides_summary_today');
    expect(mockProvider.answerGeneral).not.toHaveBeenCalled();
  });

  // ── Drafting continues working as before ────────────────────────────────

  it('drafting → continua usando composer atual', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';

    const mockProvider: KaviarAiModelProvider & { compose: any; answerGeneral: any } = {
      decide: vi.fn(),
      compose: vi.fn().mockResolvedValue('Ofício redigido...'),
      answerGeneral: vi.fn(),
    };

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'prepare um ofício', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    expect(result.answer).toBe('Ofício redigido...');
    expect(mockProvider.compose).toHaveBeenCalledTimes(1);
    expect(mockProvider.answerGeneral).not.toHaveBeenCalled();
  });

  // ── Dev-intent continues working ───────────────────────────────────────

  it('dev-intent → continua fluxo atual', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';

    const mockProvider: KaviarAiModelProvider & { compose: any; answerGeneral: any } = {
      decide: vi.fn(),
      compose: vi.fn(),
      answerGeneral: vi.fn(),
    };

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'implementar uma feature de relatórios', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    expect(result.developmentProposal).toBeDefined();
    expect(result.developmentProposal?.category).toBe('FEATURE');
    expect(mockProvider.answerGeneral).not.toHaveBeenCalled();
  });

  // ── Unknown question with model mode → generative fallback ──────────────

  it('pergunta desconhecida simples → chama fallback do modelo uma vez', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';

    const mockProvider: KaviarAiModelProvider & { compose: any; answerGeneral: any } = {
      decide: vi.fn().mockResolvedValue({ toolsToCall: [] }),
      compose: vi.fn(),
      answerGeneral: vi.fn().mockResolvedValue('A KAVIAR é uma plataforma de mobilidade comunitária.'),
    };

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'posso parcelar uma corrida no cartão?', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    expect(result.answer).toBe('A KAVIAR é uma plataforma de mobilidade comunitária.');
    expect(result.toolsUsed).toEqual([]);
    expect(mockProvider.answerGeneral).toHaveBeenCalledTimes(1);
    expect(mockProvider.answerGeneral).toHaveBeenCalledWith('posso parcelar uma corrida no cartão?');
    // compose should NOT be called (not drafting)
    expect(mockProvider.compose).not.toHaveBeenCalled();
  });

  // ── Fallback error → safe message ──────────────────────────────────────

  it('fallback com erro → mensagem segura', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';

    const mockProvider: KaviarAiModelProvider & { compose: any; answerGeneral: any } = {
      decide: vi.fn().mockResolvedValue({ toolsToCall: [] }),
      compose: vi.fn(),
      answerGeneral: vi.fn().mockRejectedValue(new Error('OpenAI 503')),
    };

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'algo aleatório desconhecido', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    expect(result.answer).toContain('Não foi possível processar a pergunta');
    expect(result.toolsUsed).toEqual([]);
  });

  // ── Mode 'rules' → no fallback ─────────────────────────────────────────

  it('modo rules → pergunta desconhecida NÃO chama modelo', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'rules';

    const mockProvider: KaviarAiModelProvider & { compose: any; answerGeneral: any } = {
      decide: vi.fn(),
      compose: vi.fn(),
      answerGeneral: vi.fn(),
    };

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'algo aleatório desconhecido', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    expect(result.answer).toContain('Ainda não sei responder');
    expect(mockProvider.answerGeneral).not.toHaveBeenCalled();
    expect(mockProvider.decide).not.toHaveBeenCalled();
  });

  it('sem env KAVIAR_AI_ROUTER_MODE (default rules) → sem fallback', async () => {
    delete process.env.KAVIAR_AI_ROUTER_MODE;

    const mockProvider: KaviarAiModelProvider & { compose: any; answerGeneral: any } = {
      decide: vi.fn(),
      compose: vi.fn(),
      answerGeneral: vi.fn(),
    };

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'algo aleatório desconhecido', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    expect(result.answer).toContain('Ainda não sei responder');
    expect(mockProvider.answerGeneral).not.toHaveBeenCalled();
  });

  // ── No external action ─────────────────────────────────────────────────

  it('nenhum caso de fallback executa ação externa (DB não é chamado)', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';

    const mockProvider: KaviarAiModelProvider & { compose: any; answerGeneral: any } = {
      decide: vi.fn().mockResolvedValue({ toolsToCall: [] }),
      compose: vi.fn(),
      answerGeneral: vi.fn().mockResolvedValue('Resposta segura.'),
    };

    await askKaviarAi(
      { userId: 'admin-1', question: 'qual o sentido da vida?', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    // No DB queries should have been made
    expect(mockQuery).not.toHaveBeenCalled();
  });

  // ── Provider without answerGeneral falls back to old behavior ───────────

  it('provider sem answerGeneral → retorna "Ainda não sei responder" mesmo em mode model', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';

    // Provider that only has decide (no answerGeneral)
    const mockProvider: KaviarAiModelProvider = {
      decide: vi.fn().mockResolvedValue({ toolsToCall: [] }),
    };

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'algo desconhecido', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    expect(result.answer).toContain('Ainda não sei responder');
  });
});

// ── knowledge_answer noMatch → answerGeneral fallback ─────────────────────

describe('askKaviarAi — knowledge_answer noMatch fallback', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  afterEach(() => {
    mockQuery.mockReset();
    delete process.env.KAVIAR_AI_ROUTER_MODE;
  });

  it('knowledge_answer encontra artigo aprovado + mode=model → resposta aprovada, answerGeneral 0 chamadas', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';

    // Simulate knowledge_answer finding an article (full-text search returns results)
    mockQuery.mockResolvedValueOnce({
      rows: [{
        slug: 'visao-geral-kaviar',
        title: 'Visão geral da KAVIAR',
        version: 1,
        content_md: 'A KAVIAR é uma plataforma brasileira de mobilidade comunitária.',
        rank: 0.9,
      }],
    });

    const mockProvider: KaviarAiModelProvider & { compose: any; answerGeneral: any } = {
      decide: vi.fn(),
      compose: vi.fn(),
      answerGeneral: vi.fn(),
    };

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'explique o processo de dispatch', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    // Should have used knowledge_answer tool and NOT called answerGeneral
    expect(result.toolsUsed).toContain('knowledge_answer');
    expect(mockProvider.answerGeneral).not.toHaveBeenCalled();
    // The answer should contain the article content (either synthesized or raw snippet)
    expect(result.answer).toContain('KAVIAR');
  });

  it('knowledge_answer sem resultado + mode=model → chama answerGeneral uma vez', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';

    // Simulate knowledge_answer finding no articles (empty result set)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const mockProvider: KaviarAiModelProvider & { compose: any; answerGeneral: any } = {
      decide: vi.fn(),
      compose: vi.fn(),
      answerGeneral: vi.fn().mockResolvedValue('Resposta generativa sobre mobilidade urbana.'),
    };

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'explique de forma simples quais são os cuidados ao iniciar operação em uma nova cidade', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    expect(result.answer).toBe('Resposta generativa sobre mobilidade urbana.');
    expect(result.toolsUsed).toEqual([]);
    expect(mockProvider.answerGeneral).toHaveBeenCalledTimes(1);
  });

  it('knowledge_answer sem resultado + mode=rules → mensagem atual, answerGeneral 0 chamadas', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'rules';

    // Simulate knowledge_answer finding no articles
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const mockProvider: KaviarAiModelProvider & { compose: any; answerGeneral: any } = {
      decide: vi.fn(),
      compose: vi.fn(),
      answerGeneral: vi.fn(),
    };

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'explique algo conceitual sobre mobilidade', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    expect(result.answer).toContain('Não foi encontrada informação aprovada');
    expect(mockProvider.answerGeneral).not.toHaveBeenCalled();
  });

  it('erro real de knowledge_answer (DB failure) → não mascara como vazio', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';

    // Simulate a real DB error
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));

    const mockProvider: KaviarAiModelProvider & { compose: any; answerGeneral: any } = {
      decide: vi.fn(),
      compose: vi.fn(),
      answerGeneral: vi.fn(),
    };

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'explique algo conceitual', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    // Should return the DB error message, NOT call answerGeneral
    expect(result.answer).toContain('não foi possível consultar');
    expect(mockProvider.answerGeneral).not.toHaveBeenCalled();
  });
});
