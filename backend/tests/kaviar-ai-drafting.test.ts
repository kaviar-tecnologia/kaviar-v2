import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../src/db', () => ({
  pool: { query: mockQuery },
}));

vi.mock('../src/services/email/inbound-email-security-risk', () => ({
  evaluateInboundEmailSecurityRisk: () => ({ level: 'LOW', suspicious: false, reasons: [] }),
}));

import { detectDraftingIntent } from '../src/services/ai/kaviar-ai.drafting-intent';
import { askKaviarAi } from '../src/services/ai/kaviar-ai.service';
import type { KaviarAiModelProvider } from '../src/services/ai/kaviar-ai.provider';

// ── Unit: detectDraftingIntent ─────────────────────────────────────────────

describe('detectDraftingIntent', () => {
  describe('detects drafting intent correctly', () => {
    it('detects "prepare um ofício"', () => {
      const result = detectDraftingIntent('prepare um ofício');
      expect(result.isDrafting).toBe(true);
      if (result.isDrafting) {
        expect(result.documentType).toBe('oficio');
      }
    });

    it('detects "escreva um e-mail"', () => {
      const result = detectDraftingIntent('escreva um e-mail');
      expect(result.isDrafting).toBe(true);
      if (result.isDrafting) {
        expect(result.documentType).toBe('email');
      }
    });

    it('detects "faça um comunicado"', () => {
      const result = detectDraftingIntent('faça um comunicado');
      expect(result.isDrafting).toBe(true);
      if (result.isDrafting) {
        expect(result.documentType).toBe('comunicado');
      }
    });

    it('detects "redija uma resposta"', () => {
      const result = detectDraftingIntent('redija uma resposta');
      expect(result.isDrafting).toBe(true);
      if (result.isDrafting) {
        expect(result.documentType).toBe('resposta');
      }
    });

    it('detects "elabore uma carta"', () => {
      const result = detectDraftingIntent('elabore uma carta');
      expect(result.isDrafting).toBe(true);
      if (result.isDrafting) {
        expect(result.documentType).toBe('carta');
      }
    });

    it('detects "gere um relatório"', () => {
      const result = detectDraftingIntent('gere um relatório');
      expect(result.isDrafting).toBe(true);
      if (result.isDrafting) {
        expect(result.documentType).toBe('relatorio');
      }
    });

    it('detects "monte uma notificação"', () => {
      const result = detectDraftingIntent('monte uma notificação');
      expect(result.isDrafting).toBe(true);
      if (result.isDrafting) {
        expect(result.documentType).toBe('notificacao');
      }
    });

    it('includes company_profile for context when KAVIAR mentioned', () => {
      const result = detectDraftingIntent('prepare um ofício com os dados da empresa KAVIAR');
      expect(result.isDrafting).toBe(true);
      if (result.isDrafting) {
        expect(result.toolsForContext).toContain('company_profile');
      }
    });

    it('includes company_profile for context when CNPJ mentioned', () => {
      const result = detectDraftingIntent('escreva um e-mail com o CNPJ');
      expect(result.isDrafting).toBe(true);
      if (result.isDrafting) {
        expect(result.toolsForContext).toContain('company_profile');
      }
    });

    it('handles uppercase and missing accents', () => {
      const result = detectDraftingIntent('PREPARE UM OFICIO');
      expect(result.isDrafting).toBe(true);
      if (result.isDrafting) {
        expect(result.documentType).toBe('oficio');
      }
    });
  });

  describe('does NOT detect drafting for factual questions', () => {
    it('does not detect "qual o CNPJ da KAVIAR?"', () => {
      const result = detectDraftingIntent('qual o CNPJ da KAVIAR?');
      expect(result.isDrafting).toBe(false);
    });

    it('does not detect "como está o financeiro?"', () => {
      const result = detectDraftingIntent('como está o financeiro?');
      expect(result.isDrafting).toBe(false);
    });

    it('does not detect "quantas corridas hoje?"', () => {
      const result = detectDraftingIntent('quantas corridas hoje?');
      expect(result.isDrafting).toBe(false);
    });

    it('does not detect "quem é o CEO?"', () => {
      const result = detectDraftingIntent('quem é o CEO da KAVIAR?');
      expect(result.isDrafting).toBe(false);
    });

    it('does not detect verb alone without document noun', () => {
      const result = detectDraftingIntent('prepare a reunião de amanhã');
      expect(result.isDrafting).toBe(false);
    });

    it('does not detect document noun alone without drafting verb', () => {
      const result = detectDraftingIntent('qual o status do ofício?');
      expect(result.isDrafting).toBe(false);
    });

    it('returns false for empty input', () => {
      expect(detectDraftingIntent('').isDrafting).toBe(false);
      expect(detectDraftingIntent(null as any).isDrafting).toBe(false);
    });
  });
});

// ── Integration: askKaviarAi with drafting ─────────────────────────────────

describe('askKaviarAi — drafting integration', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  afterEach(() => {
    mockQuery.mockReset();
  });

  it('"prepare um ofício" generates a draft and does NOT return raw company profile', async () => {
    const composedText = 'OFÍCIO Nº 001/2026\n\nAssunto: [COMPLETAR]\n\n--- Rascunho gerado pela KAVIAR IA. Revisar antes de uso.';

    const mockProvider: KaviarAiModelProvider & { compose: any } = {
      decide: vi.fn(),
      compose: vi.fn().mockResolvedValue(composedText),
    };

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'prepare um ofício', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    expect(result.answer).toBe(composedText);
    // Must NOT contain raw company_profile markers (since no KAVIAR context requested)
    expect(result.answer).not.toContain('🏢 Sobre a KAVIAR');
    expect(result.answer).not.toContain('📋 Identidade');
    expect(mockProvider.compose).toHaveBeenCalledTimes(1);
    expect(mockProvider.compose).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'prepare um ofício',
        documentType: 'oficio',
      }),
    );
  });

  it('"escreva um e-mail" generates text without sending anything', async () => {
    const composedText = 'Prezado(a),\n\nSegue comunicação...\n\n--- Rascunho gerado pela KAVIAR IA. Revisar antes de uso.';

    const mockProvider: KaviarAiModelProvider & { compose: any } = {
      decide: vi.fn(),
      compose: vi.fn().mockResolvedValue(composedText),
    };

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'escreva um e-mail formal', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    expect(result.answer).toBe(composedText);
    // No DB calls should have been made (no tools routed for this simple drafting)
    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockProvider.compose).toHaveBeenCalledTimes(1);
  });

  it('factual question "qual o CNPJ da KAVIAR?" still uses existing tool behavior', async () => {
    // Mock company_profile DB calls
    mockQuery
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({ rows: [] }) // governance
      .mockResolvedValueOnce({ rows: [] }); // structure

    const mockProvider: KaviarAiModelProvider & { compose: any } = {
      decide: vi.fn(),
      compose: vi.fn(),
    };

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'qual o CNPJ da KAVIAR?', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    // Should use the company_profile tool (factual), NOT drafting
    expect(result.toolsUsed).toContain('company_profile');
    expect(result.answer).toContain('67.783.601/0001-99');
    // compose() should NOT have been called
    expect(mockProvider.compose).not.toHaveBeenCalled();
  });

  it('returns fallback when no composer is available (no provider)', async () => {
    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'prepare um ofício', role: 'SUPER_ADMIN' },
      undefined,
    );

    expect(result.answer).toContain('Redação requer modelo de linguagem configurado');
    expect(result.toolsUsed).toEqual([]);
  });

  it('returns fallback when provider has no compose method', async () => {
    const mockProvider: KaviarAiModelProvider = {
      decide: vi.fn(),
    };

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'prepare um ofício', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    expect(result.answer).toContain('Redação requer modelo de linguagem configurado');
    expect(result.toolsUsed).toEqual([]);
  });

  it('drafting with KAVIAR context gathers company_profile data before composing', async () => {
    // Mock company_profile DB calls (entity, governance, structure)
    mockQuery
      .mockResolvedValueOnce({
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
      })
      .mockResolvedValueOnce({ rows: [{ nome: 'Fulano', funcao: 'Administrador', funcao_origem: 'RFB_QSA' }] }) // governance
      .mockResolvedValueOnce({ rows: [] }); // structure

    const composedText = 'Ofício com dados da KAVIAR...\n--- Rascunho gerado pela KAVIAR IA.';

    const mockProvider: KaviarAiModelProvider & { compose: any } = {
      decide: vi.fn(),
      compose: vi.fn().mockResolvedValue(composedText),
    };

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'prepare um ofício com os dados da empresa KAVIAR', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    expect(result.answer).toBe(composedText);
    expect(result.toolsUsed).toContain('company_profile');
    // Verify compose was called with factual context
    expect(mockProvider.compose).toHaveBeenCalledWith(
      expect.objectContaining({
        question: 'prepare um ofício com os dados da empresa KAVIAR',
        documentType: 'oficio',
        factualContext: expect.stringContaining('67.783.601/0001-99'),
      }),
    );
  });

  it('RBAC: FINANCE role can also use drafting', async () => {
    const composedText = 'Comunicado financeiro...\n--- Rascunho gerado pela KAVIAR IA.';

    const mockProvider: KaviarAiModelProvider & { compose: any } = {
      decide: vi.fn(),
      compose: vi.fn().mockResolvedValue(composedText),
    };

    const result = await askKaviarAi(
      { userId: 'admin-2', question: 'faça um comunicado', role: 'FINANCE' },
      mockProvider,
    );

    expect(result.answer).toBe(composedText);
    expect(mockProvider.compose).toHaveBeenCalledTimes(1);
  });

  it('returns error message when compose fails', async () => {
    const mockProvider: KaviarAiModelProvider & { compose: any } = {
      decide: vi.fn(),
      compose: vi.fn().mockRejectedValue(new Error('OpenAI timeout')),
    };

    const result = await askKaviarAi(
      { userId: 'admin-1', question: 'prepare um ofício', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    expect(result.answer).toContain('Não foi possível gerar o rascunho');
  });
});
