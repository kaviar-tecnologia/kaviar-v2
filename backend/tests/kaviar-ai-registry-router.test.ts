import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../src/db', () => ({
  pool: { query: mockQuery },
}));

import {
  getRegisteredTools,
  getToolByName,
  executeTool,
} from '../src/services/ai/kaviar-ai.registry';
import {
  routeByRules,
  routeByModel,
  getRouterMode,
  validateModelDecision,
} from '../src/services/ai/kaviar-ai.router';
import type { KaviarAiModelProvider } from '../src/services/ai/kaviar-ai.provider';
import { askKaviarAi } from '../src/services/ai/kaviar-ai.service';

// ── Registry ───────────────────────────────────────────────────────────────

describe('kaviar-ai.registry', () => {
  it('contém exatamente 5 ferramentas autorizadas', () => {
    const tools = getRegisteredTools();
    expect(tools).toHaveLength(5);
    const names = tools.map((t) => t.name);
    expect(names).toContain('rides_summary_today');
    expect(names).toContain('drivers_documents_pending');
    expect(names).toContain('finance_due_obligations');
  });

  it('todas as ferramentas estão marcadas como readOnly', () => {
    const tools = getRegisteredTools();
    for (const tool of tools) {
      expect(tool.readOnly).toBe(true);
    }
  });

  it('cada ferramenta possui descrição não vazia', () => {
    const tools = getRegisteredTools();
    for (const tool of tools) {
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  it('cada ferramenta possui argSchema do tipo object', () => {
    const tools = getRegisteredTools();
    for (const tool of tools) {
      expect(tool.argSchema.type).toBe('object');
    }
  });

  it('getToolByName retorna a ferramenta correta', () => {
    const tool = getToolByName('rides_summary_today');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('rides_summary_today');
  });

  it('getToolByName retorna undefined para ferramenta inexistente', () => {
    const tool = getToolByName('hack_database');
    expect(tool).toBeUndefined();
  });

  it('executeTool lança erro para ferramenta não registrada', async () => {
    await expect(executeTool('drop_tables')).rejects.toThrow(
      'não está registrada'
    );
  });

  it('executeTool lança erro para string vazia', async () => {
    await expect(executeTool('')).rejects.toThrow(
      'não está registrada'
    );
  });

  it('executeTool executa ferramenta registrada com sucesso', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ rides: 3, gross_total: '100.00', platform_fee_total: '10.00' }],
    });

    const result = await executeTool('rides_summary_today');
    expect(result.tool).toBe('rides_summary_today');
    expect(result.data).toHaveProperty('rides');
  });
});

// ── Router ─────────────────────────────────────────────────────────────────

describe('kaviar-ai.router', () => {
  describe('getRouterMode', () => {
    it('retorna rules como padrão', () => {
      delete process.env.KAVIAR_AI_ROUTER_MODE;
      expect(getRouterMode()).toBe('rules');
    });

    it('retorna rules para valor não reconhecido', () => {
      process.env.KAVIAR_AI_ROUTER_MODE = 'banana';
      expect(getRouterMode()).toBe('rules');
      delete process.env.KAVIAR_AI_ROUTER_MODE;
    });

    it('retorna model quando configurado', () => {
      process.env.KAVIAR_AI_ROUTER_MODE = 'model';
      expect(getRouterMode()).toBe('model');
      delete process.env.KAVIAR_AI_ROUTER_MODE;
    });
  });

  describe('routeByRules', () => {
    it('roteia corridas corretamente', () => {
      expect(routeByRules('Quanto ganhou hoje?').toolsToCall).toEqual([
        'rides_summary_today',
      ]);
      expect(routeByRules('Corridas hoje?').toolsToCall).toEqual([
        'rides_summary_today',
      ]);
    });

    it('roteia documentos de motorista corretamente', () => {
      expect(
        routeByRules('Quantos motoristas têm documentos pendentes?').toolsToCall
      ).toEqual(['drivers_documents_pending']);
    });

    it('roteia finanças corretamente', () => {
      expect(
        routeByRules('Quais obrigações financeiras estão pendentes?').toolsToCall
      ).toEqual(['finance_due_obligations']);
    });

    it('retorna vazio para pergunta não reconhecida', () => {
      expect(routeByRules('Qual é o clima?').toolsToCall).toEqual([]);
    });

    it('ferramenta financeira não vira ferramenta de documentos', () => {
      const result = routeByRules('Tem conta vencida?');
      expect(result.toolsToCall).not.toContain('drivers_documents_pending');
    });

    it('ferramenta de documentos não vira financeira', () => {
      const result = routeByRules('Quais documentos dos motoristas estão pendentes?');
      expect(result.toolsToCall).not.toContain('finance_due_obligations');
      expect(result.toolsToCall).toContain('drivers_documents_pending');
    });
  });

  describe('routeByModel', () => {
    it('falha de forma controlada sem provider', async () => {
      await expect(routeByModel('Teste', undefined)).rejects.toThrow(
        'nenhum provider disponível'
      );
    });

    it('rejeita decisão inteira se contiver ferramenta não registrada (fail-closed)', async () => {
      const mockProvider: KaviarAiModelProvider = {
        decide: vi.fn().mockResolvedValue({
          toolsToCall: ['rides_summary_today', 'hack_database', 'finance_due_obligations'],
        }),
      };

      await expect(routeByModel('Teste', mockProvider)).rejects.toThrow(
        'ferramenta não registrada'
      );
    });

    it('aceita decisão com apenas ferramentas válidas', async () => {
      const mockProvider: KaviarAiModelProvider = {
        decide: vi.fn().mockResolvedValue({
          toolsToCall: ['rides_summary_today', 'finance_due_obligations'],
        }),
      };

      const result = await routeByModel('Teste', mockProvider);
      expect(result.toolsToCall).toEqual([
        'rides_summary_today',
        'finance_due_obligations',
      ]);
    });

    it('passa contexto correto ao provider (sem credenciais)', async () => {
      const mockProvider: KaviarAiModelProvider = {
        decide: vi.fn().mockResolvedValue({ toolsToCall: [] }),
      };

      await routeByModel('Minha pergunta', mockProvider);

      expect(mockProvider.decide).toHaveBeenCalledWith(
        expect.objectContaining({
          question: 'Minha pergunta',
          availableTools: expect.arrayContaining([
            expect.objectContaining({ name: 'rides_summary_today' }),
          ]),
        })
      );

      const callArg = (mockProvider.decide as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(JSON.stringify(callArg)).not.toContain('DATABASE_URL');
      expect(JSON.stringify(callArg)).not.toContain('JWT_SECRET');
      expect(JSON.stringify(callArg)).not.toContain('password');
    });
  });

  describe('validateModelDecision', () => {
    it('rejeita null', () => {
      expect(() => validateModelDecision(null)).toThrow('não é um objeto');
    });

    it('rejeita undefined', () => {
      expect(() => validateModelDecision(undefined)).toThrow('não é um objeto');
    });

    it('rejeita string', () => {
      expect(() => validateModelDecision('oops')).toThrow('não é um objeto');
    });

    it('rejeita objeto sem toolsToCall', () => {
      expect(() => validateModelDecision({ tools: [] })).toThrow(
        'toolsToCall ausente ou não é array'
      );
    });

    it('rejeita toolsToCall que não é array', () => {
      expect(() => validateModelDecision({ toolsToCall: 'rides_summary_today' })).toThrow(
        'toolsToCall ausente ou não é array'
      );
    });

    it('rejeita array com elemento não-string', () => {
      expect(() => validateModelDecision({ toolsToCall: [123] })).toThrow(
        'contém elemento não-string'
      );
    });

    it('rejeita array com ferramenta não registrada', () => {
      expect(() =>
        validateModelDecision({ toolsToCall: ['rides_summary_today', 'evil_tool'] })
      ).toThrow('ferramenta não registrada');
    });

    it('aceita array vazio', () => {
      expect(validateModelDecision({ toolsToCall: [] })).toEqual([]);
    });

    it('aceita ferramentas válidas', () => {
      expect(
        validateModelDecision({ toolsToCall: ['rides_summary_today', 'finance_due_obligations'] })
      ).toEqual(['rides_summary_today', 'finance_due_obligations']);
    });
  });
});

// ── Integração service + registry + router ─────────────────────────────────

describe('askKaviarAi — integração com registry + router', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.KAVIAR_AI_ROUTER_MODE;
  });

  it('pergunta de corrida continua funcionando', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ rides: 5, gross_total: '250.00', platform_fee_total: '25.00' }],
    });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Quanto ganhou hoje?',
    });

    expect(response.toolsUsed).toContain('rides_summary_today');
    expect(response.answer).toContain('5 corridas liquidadas');
  });

  it('pergunta de documentos continua funcionando', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ status: 'SUBMITTED', driver_count: 2 }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ pending_count: 0 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ total_drivers: 2 }] });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Quantos motoristas têm documentos pendentes?',
    });

    expect(response.toolsUsed).toContain('drivers_documents_pending');
    expect(response.answer).toContain('2 motoristas');
  });

  it('pergunta financeira continua funcionando', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_pending: 3,
        total_amount_cents: '125000',
        overdue_count: 1,
        overdue_amount_cents: '30000',
        due_soon_count: 2,
        due_soon_amount_cents: '50000',
      }],
    });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Quais obrigações financeiras estão pendentes?',
    });

    expect(response.toolsUsed).toContain('finance_due_obligations');
    expect(response.answer).toContain('3 obrigações pendentes');
  });

  it('modo model sem provider falha de forma segura', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';

    await expect(
      askKaviarAi({ userId: 'admin-1', question: 'Teste' })
    ).rejects.toThrow('nenhum provider disponível');

    delete process.env.KAVIAR_AI_ROUTER_MODE;
  });

  it('modo model com provider funciona (single tool)', async () => {
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';

    const mockProvider: KaviarAiModelProvider = {
      decide: vi.fn().mockResolvedValue({
        toolsToCall: ['rides_summary_today'],
      }),
    };

    mockQuery.mockResolvedValueOnce({
      rows: [{ rides: 1, gross_total: '50.00', platform_fee_total: '5.00' }],
    });

    const response = await askKaviarAi(
      { userId: 'admin-1', question: 'Como foi hoje?' },
      mockProvider
    );

    expect(response.toolsUsed).toContain('rides_summary_today');
    expect(response.answer).toContain('1 corrida liquidada');

    delete process.env.KAVIAR_AI_ROUTER_MODE;
  });

  it('pergunta vazia retorna orientação', async () => {
    const response = await askKaviarAi({
      userId: 'admin-1',
      question: '   ',
    });

    expect(response.answer).toContain('Faça uma pergunta');
    expect(response.toolsUsed).toHaveLength(0);
  });

  it('pergunta não reconhecida retorna fallback', async () => {
    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Qual é o clima?',
    });

    expect(response.answer).toContain('Ainda não sei responder');
    expect(response.toolsUsed).toHaveLength(0);
  });
});

// ── Multi-tool execution ───────────────────────────────────────────────────

describe('askKaviarAi — multi-tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';
  });

  afterEach(() => {
    delete process.env.KAVIAR_AI_ROUTER_MODE;
  });

  it('executa duas ferramentas válidas', async () => {
    const mockProvider: KaviarAiModelProvider = {
      decide: vi.fn().mockResolvedValue({
        toolsToCall: ['rides_summary_today', 'finance_due_obligations'],
      }),
    };

    // rides_summary_today query
    mockQuery.mockResolvedValueOnce({
      rows: [{ rides: 2, gross_total: '100.00', platform_fee_total: '10.00' }],
    });
    // finance_due_obligations query
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_pending: 1,
        total_amount_cents: '50000',
        overdue_count: 0,
        overdue_amount_cents: '0',
        due_soon_count: 1,
        due_soon_amount_cents: '50000',
      }],
    });

    const response = await askKaviarAi(
      { userId: 'admin-1', question: 'Resumo geral' },
      mockProvider
    );

    expect(response.toolsUsed).toHaveLength(2);
    expect(response.toolsUsed).toEqual(['rides_summary_today', 'finance_due_obligations']);
    expect(response.answer).toContain('2 corridas liquidadas');
    expect(response.answer).toContain('1 obrigação pendente');
  });

  it('executa três ferramentas válidas na ordem', async () => {
    const mockProvider: KaviarAiModelProvider = {
      decide: vi.fn().mockResolvedValue({
        toolsToCall: ['drivers_documents_pending', 'rides_summary_today', 'finance_due_obligations'],
      }),
    };

    // drivers_documents_pending (3 queries)
    mockQuery.mockResolvedValueOnce({
      rows: [{ status: 'SUBMITTED', driver_count: 1 }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ pending_count: 0 }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ total_drivers: 1 }] });
    // rides_summary_today
    mockQuery.mockResolvedValueOnce({
      rows: [{ rides: 3, gross_total: '150.00', platform_fee_total: '15.00' }],
    });
    // finance_due_obligations
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_pending: 2,
        total_amount_cents: '80000',
        overdue_count: 1,
        overdue_amount_cents: '30000',
        due_soon_count: 1,
        due_soon_amount_cents: '50000',
      }],
    });

    const response = await askKaviarAi(
      { userId: 'admin-1', question: 'Panorama completo' },
      mockProvider
    );

    expect(response.toolsUsed).toHaveLength(3);
    expect(response.toolsUsed).toEqual([
      'drivers_documents_pending',
      'rides_summary_today',
      'finance_due_obligations',
    ]);
    expect(response.answer).toContain('1 motorista');
    expect(response.answer).toContain('3 corridas liquidadas');
    expect(response.answer).toContain('2 obrigações pendentes');
  });

  it('toolsUsed contém exatamente as ferramentas executadas', async () => {
    const mockProvider: KaviarAiModelProvider = {
      decide: vi.fn().mockResolvedValue({
        toolsToCall: ['finance_due_obligations'],
      }),
    };

    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_pending: 0,
        total_amount_cents: '0',
        overdue_count: 0,
        overdue_amount_cents: '0',
        due_soon_count: 0,
        due_soon_amount_cents: '0',
      }],
    });

    const response = await askKaviarAi(
      { userId: 'admin-1', question: 'Finanças?' },
      mockProvider
    );

    expect(response.toolsUsed).toEqual(['finance_due_obligations']);
  });

  it('ferramenta inexistente isolada → nenhuma execução (fail-closed)', async () => {
    const mockProvider: KaviarAiModelProvider = {
      decide: vi.fn().mockResolvedValue({
        toolsToCall: ['hack_database'],
      }),
    };

    await expect(
      askKaviarAi({ userId: 'admin-1', question: 'Hack' }, mockProvider)
    ).rejects.toThrow('ferramenta não registrada');

    // Nenhuma query deve ter sido executada
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('uma válida + uma inventada → nenhuma execução (fail-closed)', async () => {
    const mockProvider: KaviarAiModelProvider = {
      decide: vi.fn().mockResolvedValue({
        toolsToCall: ['rides_summary_today', 'drop_all_tables'],
      }),
    };

    await expect(
      askKaviarAi({ userId: 'admin-1', question: 'Teste' }, mockProvider)
    ).rejects.toThrow('ferramenta não registrada');

    // Nenhuma query executada — fail-closed impede tudo
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('decisão sem toolsToCall → falha controlada', async () => {
    const mockProvider: KaviarAiModelProvider = {
      decide: vi.fn().mockResolvedValue({ result: 'oops' }),
    };

    await expect(
      askKaviarAi({ userId: 'admin-1', question: 'Teste' }, mockProvider)
    ).rejects.toThrow('toolsToCall ausente ou não é array');
  });

  it('toolsToCall que não é array → falha controlada', async () => {
    const mockProvider: KaviarAiModelProvider = {
      decide: vi.fn().mockResolvedValue({ toolsToCall: 'rides_summary_today' }),
    };

    await expect(
      askKaviarAi({ userId: 'admin-1', question: 'Teste' }, mockProvider)
    ).rejects.toThrow('toolsToCall ausente ou não é array');
  });

  it('modo rules atual continua funcionando com multi-tool off', async () => {
    delete process.env.KAVIAR_AI_ROUTER_MODE;

    mockQuery.mockResolvedValueOnce({
      rows: [{ rides: 7, gross_total: '350.00', platform_fee_total: '35.00' }],
    });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Corridas hoje?',
    });

    expect(response.toolsUsed).toEqual(['rides_summary_today']);
    expect(response.answer).toContain('7 corridas liquidadas');
  });
});
