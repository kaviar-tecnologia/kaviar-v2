import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../src/db', () => ({
  pool: { query: mockQuery },
}));

vi.mock('../src/services/email/inbound-email-security-risk', () => ({
  evaluateInboundEmailSecurityRisk: () => ({ level: 'LOW', suspicious: false, reasons: [] }),
}));

// Mock OpenAI at module level
const mockEmbeddingsCreate = vi.fn();
vi.mock('openai', () => ({
  default: class {
    embeddings = { create: mockEmbeddingsCreate };
    responses = { create: vi.fn().mockResolvedValue({ status: 'completed', output_text: 'mocked' }) };
  },
}));

import {
  searchKnowledgeSemantic,
  clearSemanticCache,
  SEMANTIC_SIMILARITY_THRESHOLD,
} from '../src/services/ai/kaviar-ai.knowledge-semantic';
import { askKaviarAi } from '../src/services/ai/kaviar-ai.service';
import type { KaviarAiModelProvider } from '../src/services/ai/kaviar-ai.provider';

// ── Unit: searchKnowledgeSemantic ──────────────────────────────────────────

describe('searchKnowledgeSemantic', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockEmbeddingsCreate.mockReset();
    clearSemanticCache();
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    clearSemanticCache();
    delete process.env.OPENAI_API_KEY;
  });

  it('returns available:false when OPENAI_API_KEY is not set', async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await searchKnowledgeSemantic('test', 'SUPER_ADMIN');
    expect(result.available).toBe(false);
    expect(result.matched).toBe(false);
  });

  it('returns matched:false when no APPROVED articles exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const result = await searchKnowledgeSemantic('test', 'SUPER_ADMIN');
    expect(result.available).toBe(true);
    expect(result.matched).toBe(false);
  });

  it('only loads APPROVED articles with knowledge_scope=CURRENT', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await searchKnowledgeSemantic('test', 'SUPER_ADMIN');

    const query = mockQuery.mock.calls[0][0];
    expect(query).toContain("status = 'APPROVED'");
    expect(query).toContain("knowledge_scope = 'CURRENT'");
  });

  it('returns matched:true with citations when similarity exceeds threshold', async () => {
    // Mock articles
    mockQuery.mockResolvedValueOnce({
      rows: [{
        slug: 'visao-geral-kaviar',
        title: 'Visão geral da KAVIAR',
        version: 1,
        content_md: 'A KAVIAR é uma plataforma de mobilidade comunitária.',
        allowed_roles: ['SUPER_ADMIN', 'FINANCE'],
      }],
    });

    // Mock batch embeddings for articles (dimension 3 for simplicity)
    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: [0.9, 0.1, 0.1] }],
    });

    // Mock question embedding — very similar to article
    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: [0.9, 0.1, 0.1] }],
    });

    const result = await searchKnowledgeSemantic('o que é a KAVIAR?', 'SUPER_ADMIN');

    expect(result.available).toBe(true);
    expect(result.matched).toBe(true);
    expect(result.score).toBeGreaterThan(SEMANTIC_SIMILARITY_THRESHOLD);
    expect(result.snippets).toHaveLength(1);
    expect(result.snippets[0]).toContain('Visão geral da KAVIAR');
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].slug).toBe('visao-geral-kaviar');
    expect(result.citations[0].title).toBe('Visão geral da KAVIAR');
  });

  it('returns matched:false when similarity is below threshold', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        slug: 'financeiro',
        title: 'Financeiro',
        version: 1,
        content_md: 'Módulo financeiro.',
        allowed_roles: ['SUPER_ADMIN'],
      }],
    });

    // Article embedding
    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: [1, 0, 0] }],
    });

    // Question embedding — orthogonal (dissimilar)
    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: [0, 1, 0] }],
    });

    const result = await searchKnowledgeSemantic('receita de bolo', 'SUPER_ADMIN');

    expect(result.available).toBe(true);
    expect(result.matched).toBe(false);
    expect(result.score).toBeLessThan(SEMANTIC_SIMILARITY_THRESHOLD);
  });

  it('filters articles by role (RBAC)', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        slug: 'super-only',
        title: 'Super Only',
        version: 1,
        content_md: 'Only for super admins.',
        allowed_roles: ['SUPER_ADMIN'], // not FINANCE
      }],
    });

    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: [0.9, 0.1, 0.1] }],
    });

    // FINANCE user should get no results even if articles loaded
    const result = await searchKnowledgeSemantic('test', 'FINANCE');
    expect(result.matched).toBe(false);
  });

  it('returns available:false on DB error without crashing', async () => {
    mockQuery.mockRejectedValueOnce(new Error('connection refused'));
    const result = await searchKnowledgeSemantic('test', 'SUPER_ADMIN');
    expect(result.available).toBe(false);
    expect(result.matched).toBe(false);
  });

  it('returns available:false on embedding API error without crashing', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ slug: 'a', title: 'A', version: 1, content_md: 'text', allowed_roles: ['SUPER_ADMIN'] }],
    });
    mockEmbeddingsCreate.mockRejectedValueOnce(new Error('API timeout'));

    const result = await searchKnowledgeSemantic('test', 'SUPER_ADMIN');
    expect(result.available).toBe(false);
  });

  it('threshold constant is 0.58 (calibrated against real embeddings)', () => {
    expect(SEMANTIC_SIMILARITY_THRESHOLD).toBe(0.58);
  });

  it('score ~0.50 (vaguely related) → matched:false', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ slug: 'art1', title: 'Artigo', version: 1, content_md: 'conteúdo', allowed_roles: ['SUPER_ADMIN'] }],
    });
    // Article embedding: normalized [1, 0, 0]
    mockEmbeddingsCreate.mockResolvedValueOnce({ data: [{ embedding: [1, 0, 0] }] });
    // Question embedding: ~50 degrees from article → cosine ~0.50
    mockEmbeddingsCreate.mockResolvedValueOnce({ data: [{ embedding: [0.5, 0.866, 0] }] });

    const result = await searchKnowledgeSemantic('pergunta vaga', 'SUPER_ADMIN');
    expect(result.matched).toBe(false);
    expect(result.score).toBeLessThan(SEMANTIC_SIMILARITY_THRESHOLD);
  });

  it('score ~0.69 (clearly related) → matched:true', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ slug: 'art1', title: 'Artigo', version: 1, content_md: 'conteúdo', allowed_roles: ['SUPER_ADMIN'] }],
    });
    // Article embedding: [1, 0, 0]
    mockEmbeddingsCreate.mockResolvedValueOnce({ data: [{ embedding: [1, 0, 0] }] });
    // Question embedding: ~46 degrees → cosine ~0.69
    mockEmbeddingsCreate.mockResolvedValueOnce({ data: [{ embedding: [0.69, 0.72, 0] }] });

    const result = await searchKnowledgeSemantic('pergunta relacionada', 'SUPER_ADMIN');
    expect(result.matched).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(SEMANTIC_SIMILARITY_THRESHOLD);
  });
});

// ── Integration: semantic fallback in askKaviarAi ──────────────────────────

describe('askKaviarAi — semantic knowledge fallback', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockEmbeddingsCreate.mockReset();
    clearSemanticCache();
    process.env.KAVIAR_AI_ROUTER_MODE = 'model';
    process.env.OPENAI_API_KEY = 'test-key';
  });

  afterEach(() => {
    mockQuery.mockReset();
    clearSemanticCache();
    delete process.env.KAVIAR_AI_ROUTER_MODE;
    delete process.env.OPENAI_API_KEY;
  });

  it('full-text match → uses full-text result without calling semantic', async () => {
    // Full-text finds an article
    mockQuery.mockResolvedValueOnce({
      rows: [{
        slug: 'dispatch',
        title: 'Dispatch',
        version: 1,
        content_md: 'O dispatch prioriza motoristas da mesma comunidade.',
        rank: 0.8,
      }],
    });

    const mockProvider: KaviarAiModelProvider & { compose: any; answerGeneral: any } = {
      decide: vi.fn(),
      compose: vi.fn(),
      answerGeneral: vi.fn(),
    };

    const result = await askKaviarAi(
      { userId: 'a', question: 'explique o dispatch', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    // Full-text matched → no semantic needed, no answerGeneral
    expect(result.toolsUsed).toContain('knowledge_answer');
    expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
    expect(mockProvider.answerGeneral).not.toHaveBeenCalled();
  });

  it('full-text noMatch + semantic match → grounded answer with citations', async () => {
    // Full-text: no match
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Semantic: loads articles
    mockQuery.mockResolvedValueOnce({
      rows: [{
        slug: 'visao-geral-kaviar',
        title: 'Visão geral da KAVIAR',
        version: 1,
        content_md: 'A KAVIAR é uma plataforma de mobilidade comunitária que conecta passageiros e motoristas.',
        allowed_roles: ['SUPER_ADMIN', 'FINANCE'],
      }],
    });

    // Article embeddings
    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: [0.9, 0.1, 0.1] }],
    });
    // Question embedding — very similar
    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: [0.85, 0.15, 0.1] }],
    });

    const mockProvider: KaviarAiModelProvider & { compose: any; answerGeneral: any } = {
      decide: vi.fn().mockResolvedValue({ toolsToCall: [] }),
      compose: vi.fn(),
      answerGeneral: vi.fn().mockResolvedValue('A KAVIAR conecta passageiros e motoristas em comunidades.'),
    };

    const result = await askKaviarAi(
      { userId: 'a', question: 'me explica como funciona a plataforma', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    // Should have grounded answer with citations
    expect(result.answer).toContain('Fontes:');
    expect(result.answer).toContain('visao-geral-kaviar');
    expect(result.toolsUsed).toContain('knowledge_answer');
    // answerGeneral was called with grounded context
    expect(mockProvider.answerGeneral).toHaveBeenCalledTimes(1);
    const callArg = mockProvider.answerGeneral.mock.calls[0][0];
    expect(callArg).toContain('Trechos aprovados');
    expect(callArg).toContain('mobilidade comunitária');
  });

  it('full-text noMatch + semantic below threshold → ungrounded fallback', async () => {
    // Full-text: no match
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Semantic: loads articles
    mockQuery.mockResolvedValueOnce({
      rows: [{
        slug: 'financeiro',
        title: 'Financeiro',
        version: 1,
        content_md: 'O módulo financeiro organiza receitas e despesas.',
        allowed_roles: ['SUPER_ADMIN'],
      }],
    });

    // Article embeddings
    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: [1, 0, 0] }],
    });
    // Question embedding — very different
    mockEmbeddingsCreate.mockResolvedValueOnce({
      data: [{ embedding: [0, 0, 1] }],
    });

    const mockProvider: KaviarAiModelProvider & { compose: any; answerGeneral: any } = {
      decide: vi.fn().mockResolvedValue({ toolsToCall: [] }),
      compose: vi.fn(),
      answerGeneral: vi.fn().mockResolvedValue('Resposta genérica sem grounding.'),
    };

    const result = await askKaviarAi(
      { userId: 'a', question: 'me explica como funciona a plataforma', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    // Should fall through to ungrounded answerGeneral
    expect(result.answer).toBe('Resposta genérica sem grounding.');
    expect(result.answer).not.toContain('Fontes:');
    expect(result.toolsUsed).toEqual([]);
  });

  it('semantic search failure → falls through to ungrounded fallback gracefully', async () => {
    // Full-text: no match
    mockQuery.mockResolvedValueOnce({ rows: [] });

    // Semantic: DB error on load
    mockQuery.mockRejectedValueOnce(new Error('timeout'));

    const mockProvider: KaviarAiModelProvider & { compose: any; answerGeneral: any } = {
      decide: vi.fn().mockResolvedValue({ toolsToCall: [] }),
      compose: vi.fn(),
      answerGeneral: vi.fn().mockResolvedValue('Fallback response.'),
    };

    const result = await askKaviarAi(
      { userId: 'a', question: 'me explica como funciona a plataforma', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    // Should still work via ungrounded fallback
    expect(result.answer).toBe('Fallback response.');
  });

  it('deterministic routes still work without triggering semantic', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ rides: 5, gross_total: '200.00', platform_fee_total: '20.00' }],
    });

    const mockProvider: KaviarAiModelProvider & { compose: any; answerGeneral: any } = {
      decide: vi.fn(),
      compose: vi.fn(),
      answerGeneral: vi.fn(),
    };

    const result = await askKaviarAi(
      { userId: 'a', question: 'quanto a KAVIAR ganhou hoje?', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    expect(result.toolsUsed).toContain('rides_summary_today');
    expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
    expect(mockProvider.answerGeneral).not.toHaveBeenCalled();
  });

  it('no write operations are performed', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // full-text
    mockQuery.mockResolvedValueOnce({ rows: [] }); // semantic

    const mockProvider: KaviarAiModelProvider & { compose: any; answerGeneral: any } = {
      decide: vi.fn().mockResolvedValue({ toolsToCall: [] }),
      compose: vi.fn(),
      answerGeneral: vi.fn().mockResolvedValue('ok'),
    };

    await askKaviarAi(
      { userId: 'a', question: 'me explica algo', role: 'SUPER_ADMIN' },
      mockProvider,
    );

    // All DB calls should be SELECTs (read-only)
    for (const call of mockQuery.mock.calls) {
      const sql = call[0] as string;
      expect(sql.toUpperCase()).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE)\b/);
    }
  });
});
