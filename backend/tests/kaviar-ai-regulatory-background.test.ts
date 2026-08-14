import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockResponsesCreate, mockResponsesRetrieve } = vi.hoisted(() => ({
  mockResponsesCreate: vi.fn(),
  mockResponsesRetrieve: vi.fn(),
}));

vi.mock('openai', () => ({
  default: class MockOpenAI {
    responses = { create: mockResponsesCreate, retrieve: mockResponsesRetrieve };
    constructor(opts: any) { (MockOpenAI as any).lastConfig = opts; }
    static lastConfig: any;
  },
}));

import { startRegulatorySearch, retrieveRegulatorySearch, classifyRegulatorySearchError, validateRegulatoryResult } from '../src/services/ai/kaviar-ai.regulatory-search';

const VALID_RESULT = {
  summary: 'Cidade regulamentada.',
  requirements: ['Alvará'],
  officialSources: [{ title: 'Lei', url: 'https://prefeitura.gov.br', orgao: 'Prefeitura' }],
  unconfirmedItems: [],
  recommendedNextSteps: ['Protocolar'],
  confidence: 'CONFIRMED',
};

describe('startRegulatorySearch — background mode', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.OPENAI_API_KEY = 'sk-test'; });
  afterEach(() => { delete process.env.OPENAI_API_KEY; });

  it('POST uses background: true', async () => {
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_abc123def456ghi789jkl012', status: 'queued' });
    await startRegulatorySearch('Ribeirão Preto', 'SP');
    const args = mockResponsesCreate.mock.calls[0][0];
    expect(args.background).toBe(true);
  });

  it('POST returns responseId and status', async () => {
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_abc123def456ghi789jkl012', status: 'queued' });
    const result = await startRegulatorySearch('Teste', 'SP');
    expect(result.responseId).toBe('resp_abc123def456ghi789jkl012');
    expect(result.status).toBe('queued');
  });

  it('preserves search_context_size low', async () => {
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_x', status: 'queued' });
    await startRegulatorySearch('Teste', 'SP');
    const args = mockResponsesCreate.mock.calls[0][0];
    expect(args.tools).toEqual([{ type: 'web_search', search_context_size: 'low' }]);
  });

  it('preserves max_output_tokens 4096', async () => {
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_x', status: 'queued' });
    await startRegulatorySearch('Teste', 'SP');
    expect(mockResponsesCreate.mock.calls[0][0].max_output_tokens).toBe(4096);
  });

  it('preserves store: false', async () => {
    mockResponsesCreate.mockResolvedValueOnce({ id: 'resp_x', status: 'queued' });
    await startRegulatorySearch('Teste', 'SP');
    expect(mockResponsesCreate.mock.calls[0][0].store).toBe(false);
  });

  it('throws on missing API key', async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(startRegulatorySearch('X', 'SP')).rejects.toThrow('OPENAI_API_KEY');
  });

  it('throws on invalid city/UF', async () => {
    await expect(startRegulatorySearch('', 'SP')).rejects.toThrow('inválida');
  });
});

describe('retrieveRegulatorySearch — polling', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.OPENAI_API_KEY = 'sk-test'; });
  afterEach(() => { delete process.env.OPENAI_API_KEY; });

  it('queued → returns pending status', async () => {
    mockResponsesRetrieve.mockResolvedValueOnce({ status: 'queued' });
    const r = await retrieveRegulatorySearch('resp_abc123def456ghi789jkl012');
    expect(r.status).toBe('queued');
    expect(r.result).toBeNull();
  });

  it('in_progress → returns pending status', async () => {
    mockResponsesRetrieve.mockResolvedValueOnce({ status: 'in_progress' });
    const r = await retrieveRegulatorySearch('resp_abc123def456ghi789jkl012');
    expect(r.status).toBe('in_progress');
    expect(r.result).toBeNull();
  });

  it('completed → validates and returns result', async () => {
    mockResponsesRetrieve.mockResolvedValueOnce({ status: 'completed', output_text: JSON.stringify(VALID_RESULT) });
    const r = await retrieveRegulatorySearch('resp_abc123def456ghi789jkl012');
    expect(r.status).toBe('completed');
    expect(r.result?.confidence).toBe('CONFIRMED');
    expect(r.result?.requirements).toContain('Alvará');
  });

  it('failed → throws PROVIDER_ERROR', async () => {
    mockResponsesRetrieve.mockResolvedValueOnce({ status: 'failed' });
    try {
      await retrieveRegulatorySearch('resp_x');
      expect.fail('should throw');
    } catch (e: any) {
      expect(e.regulatoryCode).toBe('PROVIDER_ERROR');
    }
  });

  it('incomplete → throws INVALID_RESPONSE', async () => {
    mockResponsesRetrieve.mockResolvedValueOnce({ status: 'incomplete', incomplete_details: { reason: 'max_tokens' } });
    try {
      await retrieveRegulatorySearch('resp_x');
      expect.fail('should throw');
    } catch (e: any) {
      expect(e.regulatoryCode).toBe('INVALID_RESPONSE');
    }
  });

  it('cancelled → throws PROVIDER_ERROR', async () => {
    mockResponsesRetrieve.mockResolvedValueOnce({ status: 'cancelled' });
    try {
      await retrieveRegulatorySearch('resp_x');
      expect.fail('should throw');
    } catch (e: any) {
      expect(e.regulatoryCode).toBe('PROVIDER_ERROR');
    }
  });

  it('completed with unconfirmedItems → NEEDS_HUMAN_REVIEW', async () => {
    const withUnconfirmed = { ...VALID_RESULT, unconfirmedItems: ['Conflito'] };
    mockResponsesRetrieve.mockResolvedValueOnce({ status: 'completed', output_text: JSON.stringify(withUnconfirmed) });
    const r = await retrieveRegulatorySearch('resp_x');
    expect(r.result?.confidence).toBe('NEEDS_HUMAN_REVIEW');
  });
});

describe('route — responseId validation', () => {
  it('valid responseId format accepted by pattern', () => {
    const pattern = /^resp_[a-zA-Z0-9]{20,80}$/;
    expect(pattern.test('resp_abc123def456ghi789jkl012')).toBe(true);
    expect(pattern.test('resp_short')).toBe(false);
    expect(pattern.test('invalid')).toBe(false);
    expect(pattern.test('')).toBe(false);
    expect(pattern.test('resp_' + 'a'.repeat(20))).toBe(true);
  });
});

describe('frontend — polling behavior', () => {
  it('frontend uses polling with 180s limit', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../frontend-app/src/pages/admin/KaviarAiPage.jsx'), 'utf8');
    expect(src).toContain('180000');
    expect(src).toContain('2000');
    expect(src).toContain('responseId');
    expect(src).toContain('em andamento');
  });

  it('frontend clears timer and loading in finally', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../frontend-app/src/pages/admin/KaviarAiPage.jsx'), 'utf8');
    expect(src).toContain('clearTimeout(abort.timer)');
    expect(src).toContain('setActionLoading(false)');
    expect(src).toContain('} finally {');
  });

  it('frontend shows "em andamento" message while polling', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../frontend-app/src/pages/admin/KaviarAiPage.jsx'), 'utf8');
    expect(src).toContain('Pesquisa regulatória em andamento');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Frontend cancellation on unmount
// ══════════════════════════════════════════════════════════════════════════════

describe('frontend — unmount cancellation', () => {
  it('uses regulatoryAbortRef with cancelled flag and timer', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../frontend-app/src/pages/admin/KaviarAiPage.jsx'), 'utf8');
    expect(src).toContain('regulatoryAbortRef');
    expect(src).toContain('regulatoryAbortRef.current.cancelled = true');
    expect(src).toContain('clearTimeout(regulatoryAbortRef.current.timer)');
  });

  it('cleanup effect sets cancelled on unmount', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../frontend-app/src/pages/admin/KaviarAiPage.jsx'), 'utf8');
    // useEffect with return function that sets cancelled
    expect(src).toContain('regulatoryAbortRef.current.cancelled = true');
    // The cleanup is in a useEffect returning a cleanup function
    const cleanupIdx = src.indexOf('regulatoryAbortRef.current.cancelled = true');
    const effectBlock = src.substring(Math.max(0, cleanupIdx - 100), cleanupIdx + 50);
    expect(effectBlock).toContain('return ()');
  });

  it('polling checks abort.cancelled before each iteration', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../frontend-app/src/pages/admin/KaviarAiPage.jsx'), 'utf8');
    const pollSection = src.split('handleRegulatorySearch')[1];
    // Multiple abort.cancelled checks
    const cancelledChecks = (pollSection.match(/abort\.cancelled/g) || []).length;
    expect(cancelledChecks).toBeGreaterThanOrEqual(4); // before poll, after start, after pollRes, in catch
  });

  it('does not call setState after cancellation', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../frontend-app/src/pages/admin/KaviarAiPage.jsx'), 'utf8');
    // After catch, if cancelled → return without setState
    expect(src).toContain("err.message === 'cancelled'");
    // In finally, only setActionLoading if not cancelled
    expect(src).toContain('if (!abort.cancelled) setActionLoading(false)');
  });

  it('abort.timer is stored and cleared in finally', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../frontend-app/src/pages/admin/KaviarAiPage.jsx'), 'utf8');
    expect(src).toContain('abort.timer = setTimeout(poll');
    expect(src).toContain('if (abort.timer) clearTimeout(abort.timer)');
  });
});
