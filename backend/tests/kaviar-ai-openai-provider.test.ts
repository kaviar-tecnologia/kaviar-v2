import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock do pool (para executeTool)
const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../src/db', () => ({
  pool: { query: mockQuery },
}));

// Mock do SDK OpenAI — Responses API
const { mockResponsesCreate } = vi.hoisted(() => ({ mockResponsesCreate: vi.fn() }));
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      responses = {
        create: mockResponsesCreate,
      };
      constructor(_opts: any) {}
    },
  };
});

import { OpenAiProvider, createOpenAiProviderIfConfigured } from '../src/services/ai/kaviar-ai.openai-provider';
import { askKaviarAi } from '../src/services/ai/kaviar-ai.service';

// ── OpenAiProvider — instanciação ──────────────────────────────────────────

describe('OpenAiProvider — instanciação', () => {
  beforeEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.KAVIAR_AI_MODEL;
    delete process.env.KAVIAR_AI_ROUTER_MODE;
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.KAVIAR_AI_MODEL;
    delete process.env.KAVIAR_AI_ROUTER_MODE;
  });

  it('lança erro se OPENAI_API_KEY ausente', () => {
    expect(() => new OpenAiProvider()).toThrow('OPENAI_API_KEY não configurada');
  });

  it('erro não revela a chave real', () => {
    try {
      new OpenAiProvider();
    } catch (e: any) {
      expect(e.message).not.toContain('sk-');
      expect(e.message).not.toContain('API_KEY=');
    }
  });

  it('instancia com OPENAI_API_KEY definida', () => {
    process.env.OPENAI_API_KEY = 'sk-test-fake';
    const provider = new OpenAiProvider();
    expect(provider).toBeInstanceOf(OpenAiProvider);
  });

  it('createOpenAiProviderIfConfigured retorna undefined sem chave', () => {
    const provider = createOpenAiProviderIfConfigured();
    expect(provider).toBeUndefined();
  });

  it('createOpenAiProviderIfConfigured retorna provider com chave', () => {
    process.env.OPENAI_API_KEY = 'sk-test-fake';
    const provider = createOpenAiProviderIfConfigured();
    expect(provider).toBeInstanceOf(OpenAiProvider);
  });
});

// ── OpenAiProvider.decide — respostas do modelo ────────────────────────────

describe('OpenAiProvider.decide', () => {
  let provider: OpenAiProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'sk-test-fake';
    provider = new OpenAiProvider();
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.KAVIAR_AI_MODEL;
    delete process.env.KAVIAR_AI_ROUTER_MODE;
  });

  const context = {
    question: 'Teste',
    availableTools: [
      { name: 'rides_summary_today' as const, description: 'test', argSchema: { type: 'object' as const, properties: {}, required: [] } },
      { name: 'finance_due_obligations' as const, description: 'test2', argSchema: { type: 'object' as const, properties: {}, required: [] } },
    ],
  };

  it('retorna uma ferramenta selecionada', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: '{"toolsToCall":["rides_summary_today"]}',
    });

    const decision = await provider.decide(context);
    expect(decision.toolsToCall).toEqual(['rides_summary_today']);
  });

  it('retorna múltiplas ferramentas', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: '{"toolsToCall":["rides_summary_today","finance_due_obligations"]}',
    });

    const decision = await provider.decide(context);
    expect(decision.toolsToCall).toEqual(['rides_summary_today', 'finance_due_obligations']);
  });

  it('retorna nenhuma ferramenta', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: '{"toolsToCall":[]}',
    });

    const decision = await provider.decide(context);
    expect(decision.toolsToCall).toEqual([]);
  });

  it('lança erro para resposta vazia (output_text nulo)', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: '',
    });

    await expect(provider.decide(context)).rejects.toThrow('Resposta vazia');
  });

  it('lança erro para resposta incompleta (max_tokens)', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output_text: '{"toolsToCall":["rides',
    });

    await expect(provider.decide(context)).rejects.toThrow('incompleta');
  });

  it('lança erro para status failed', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'failed',
      output_text: null,
    });

    await expect(provider.decide(context)).rejects.toThrow('falhou ao gerar');
  });

  it('lança erro para JSON inválido', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: 'not json at all',
    });

    await expect(provider.decide(context)).rejects.toThrow('não é JSON válido');
  });

  it('lança erro para API error (simulação de rede)', async () => {
    mockResponsesCreate.mockRejectedValueOnce(new Error('Connection refused'));

    await expect(provider.decide(context)).rejects.toThrow('Connection refused');
  });

  it('lança erro para timeout', async () => {
    mockResponsesCreate.mockRejectedValueOnce(new Error('Request timed out'));

    await expect(provider.decide(context)).rejects.toThrow('timed out');
  });

  it('não envia segredos ao modelo (verifica input)', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: '{"toolsToCall":[]}',
    });

    process.env.DATABASE_URL = 'postgresql://secret';
    process.env.JWT_SECRET = 'mysecret';

    await provider.decide(context);

    const callArgs = mockResponsesCreate.mock.calls[0][0];
    const inputStr = JSON.stringify(callArgs.input);
    const instructionsStr = JSON.stringify(callArgs.instructions);
    expect(inputStr).not.toContain('postgresql://');
    expect(inputStr).not.toContain('mysecret');
    expect(inputStr).not.toContain('DATABASE_URL');
    expect(inputStr).not.toContain('JWT_SECRET');
    expect(inputStr).not.toContain('sk-test-fake');
    expect(instructionsStr).not.toContain('postgresql://');
    expect(instructionsStr).not.toContain('sk-test-fake');

    delete process.env.DATABASE_URL;
    delete process.env.JWT_SECRET;
  });

  it('usa modelo correto da env KAVIAR_AI_MODEL', async () => {
    delete process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'sk-test-fake';
    process.env.KAVIAR_AI_MODEL = 'gpt-5.4-turbo';

    const customProvider = new OpenAiProvider();

    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: '{"toolsToCall":[]}',
    });

    await customProvider.decide(context);

    const callArgs = mockResponsesCreate.mock.calls[0][0];
    expect(callArgs.model).toBe('gpt-5.4-turbo');

    delete process.env.KAVIAR_AI_MODEL;
  });

  it('usa structured output (text.format json_schema)', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: '{"toolsToCall":[]}',
    });

    await provider.decide(context);

    const callArgs = mockResponsesCreate.mock.calls[0][0];
    expect(callArgs.text.format.type).toBe('json_schema');
    expect(callArgs.text.format.name).toBe('kaviar_ai_decision');
    expect(callArgs.text.format.strict).toBe(true);
  });

  it('define max_output_tokens, reasoning effort e store (sem temperature)', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: '{"toolsToCall":[]}',
    });

    await provider.decide(context);

    const callArgs = mockResponsesCreate.mock.calls[0][0];
    expect(callArgs.max_output_tokens).toBe(256);
    expect(callArgs.reasoning.effort).toBe('low');
    expect(callArgs.store).toBe(false);
    expect(callArgs).not.toHaveProperty('temperature');
  });
});

// ── Integração: modo rules NÃO chama OpenAI ───────────────────────────────

describe('Integração — rules não chama OpenAI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.KAVIAR_AI_ROUTER_MODE;
  });

  it('modo rules não faz chamada ao modelo', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ rides: 3, gross_total: '100.00', platform_fee_total: '10.00' }],
    });

    await askKaviarAi({ userId: 'admin-1', question: 'Corridas hoje?' });

    expect(mockResponsesCreate).not.toHaveBeenCalled();
  });
});

// ── Integração: modo model com provider ────────────────────────────────────

describe('Integração — modo model com OpenAI provider', () => {
  let provider: OpenAiProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = 'sk-test-fake';
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';
    provider = new OpenAiProvider();
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.KAVIAR_AI_ROUTER_MODE;
  });

  it('seleciona e executa ferramenta via modelo', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: '{"toolsToCall":["rides_summary_today"]}',
    });

    mockQuery.mockResolvedValueOnce({
      rows: [{ rides: 7, gross_total: '350.00', platform_fee_total: '35.00' }],
    });

    const response = await askKaviarAi(
      { userId: 'admin-1', question: 'O que precisa da minha atenção?' },
      provider
    );

    expect(response.toolsUsed).toEqual(['rides_summary_today']);
    expect(response.answer).toContain('7 corridas liquidadas');
  });

  it('modelo retorna ferramenta inventada → fail-closed, nenhuma execução', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: '{"toolsToCall":["rides_summary_today","hack_system"]}',
    });

    await expect(
      askKaviarAi({ userId: 'admin-1', question: 'Teste' }, provider)
    ).rejects.toThrow('ferramenta não registrada');

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('modelo retorna resposta inválida (não JSON) → erro controlado', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: 'Sorry, I cannot help.',
    });

    await expect(
      askKaviarAi({ userId: 'admin-1', question: 'Teste' }, provider)
    ).rejects.toThrow('não é JSON válido');
  });

  it('API OpenAI falha → erro propagado', async () => {
    mockResponsesCreate.mockRejectedValueOnce(new Error('503 Service Unavailable'));

    await expect(
      askKaviarAi({ userId: 'admin-1', question: 'Teste' }, provider)
    ).rejects.toThrow('503 Service Unavailable');
  });

  it('nenhum segredo aparece em erro', async () => {
    mockResponsesCreate.mockRejectedValueOnce(new Error('API Error'));

    try {
      await askKaviarAi({ userId: 'admin-1', question: 'Teste' }, provider);
    } catch (e: any) {
      expect(e.message).not.toContain('sk-test-fake');
      expect(e.message).not.toContain('OPENAI_API_KEY');
    }
  });
});
