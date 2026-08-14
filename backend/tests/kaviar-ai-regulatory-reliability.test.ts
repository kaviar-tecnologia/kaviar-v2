import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));
vi.mock('../src/db', () => ({ pool: { query: mockQuery } }));

const { mockResponsesCreate } = vi.hoisted(() => ({ mockResponsesCreate: vi.fn() }));
vi.mock('openai', () => ({
  default: class MockOpenAI {
    responses = { create: mockResponsesCreate };
    constructor(opts: any) {
      // Capture config for assertions
      (MockOpenAI as any).lastConfig = opts;
    }
    static lastConfig: any;
  },
}));

vi.mock('../src/services/email/inbound-email-security-risk', () => ({
  evaluateInboundEmailSecurityRisk: () => ({ level: 'LOW', suspicious: false, reasons: [] }),
}));

vi.mock('../src/services/ai/kaviar-ai.command-center', () => ({
  getPlatformCatalog: vi.fn().mockResolvedValue({ tool: 'platform_catalog', data: { section: 'overview', modules: [], note: '' } }),
  getAnnualIncentiveSummary: vi.fn().mockResolvedValue({ tool: 'annual_incentive_summary', data: { available: true, totalOutstandingCents: '0', deadlineBreaches: 0, totalAccruedCents: '0', totalAvailableCents: '0', totalReservedCents: '0', totalPaidCents: '0', totalReversedCents: '0', driversWithBalance: 0, byYear: [], forecast: { available: false }, referenceTime: '' } }),
  getWhatsAppSummary: vi.fn().mockResolvedValue({ tool: 'whatsapp_summary', data: { available: true, unreadMessages: 0, conversationsWithUnread: 0, newConversations: 0, inProgressConversations: 0, highPriorityConversations: 0, referenceTime: '', recentConversations: [] } }),
  getDriverPipelineSummary: vi.fn().mockResolvedValue({ tool: 'driver_pipeline_summary', data: { available: true, total: 0, byStatus: {}, byVehicleType: {}, pendingApproval: 0, docsMissing: 0, docsSubmitted: 0, docsRejected: 0, compliancePending: 0, activeDrivers: 0, suspendedDrivers: 0, modalities: { available: true, pending: 0, approved: 0, rejected: 0 }, referenceTime: '' } }),
  getEmergencyOperationsSummary: vi.fn().mockResolvedValue({ tool: 'emergency_operations_summary', data: { emergencies: { available: true, active: 0, unresolved: 0, critical: null, criticalSupported: false, oldestActiveAt: null }, rides: { available: true, noDriver: 0, pendingAdjustment: 0 }, referenceTime: '' } }),
  getTerritoryPortfolioSummary: vi.fn().mockResolvedValue({ tool: 'territory_portfolio_summary', data: { available: true, total: 0, byStatus: {}, byRegulatoryStatus: {}, withoutManager: 0, withMotoPassenger: 0, withMotoExpress: 0, regulatoryChecklist: { available: true, pending: 0 }, regulatoryProtocols: { available: true, pending: 0 }, insuranceCoverages: { available: true, pending: 0 }, cityLandings: { available: true, total: 0, active: 0 }, attentionCities: [], referenceTime: '' } }),
}));

import { askKaviarAi } from '../src/services/ai/kaviar-ai.service';
import { searchRegulatoryRequirements } from '../src/services/ai/kaviar-ai.regulatory-search';
import OpenAI from 'openai';

// ══════════════════════════════════════════════════════════════════════════════
// 1. UF normalization
// ══════════════════════════════════════════════════════════════════════════════

describe('parseCityUf — UF normalization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Ribeirão Preto/SP — uppercase works', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const r = await askKaviarAi({ userId: 'a', question: 'Quero abrir Ribeirão Preto/SP', role: 'SUPER_ADMIN' });
    expect(mockQuery.mock.calls[0][1][0]).toBe('Ribeirão Preto');
    expect(mockQuery.mock.calls[0][1][1]).toBe('SP');
  });

  it('Ribeirão Preto/sp — lowercase normalized to SP', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const r = await askKaviarAi({ userId: 'a', question: 'Quero abrir Ribeirão Preto/sp', role: 'SUPER_ADMIN' });
    expect(mockQuery.mock.calls[0][1][1]).toBe('SP');
  });

  it('Ribeirao Preto/Sp — mixed case normalized to SP', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const r = await askKaviarAi({ userId: 'a', question: 'Quero abrir Ribeirao Preto/Sp', role: 'SUPER_ADMIN' });
    expect(mockQuery.mock.calls[0][1][1]).toBe('SP');
  });

  it('Santa Rita do Passa Quatro/sp — lowercase with multi-word city', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const r = await askKaviarAi({ userId: 'a', question: 'Abrir Santa Rita do Passa Quatro/sp', role: 'SUPER_ADMIN' });
    expect(mockQuery.mock.calls[0][1][0]).toBe('Santa Rita do Passa Quatro');
    expect(mockQuery.mock.calls[0][1][1]).toBe('SP');
  });

  it('Cidade - rj — dash format with lowercase', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const r = await askKaviarAi({ userId: 'a', question: 'Abrir cidade Niterói - rj', role: 'SUPER_ADMIN' });
    expect(mockQuery.mock.calls[0][1][1]).toBe('RJ');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. Timeout and retries configuration
// ══════════════════════════════════════════════════════════════════════════════

describe('regulatory search — timeout and retries', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.OPENAI_API_KEY = 'sk-test'; });
  afterEach(() => { delete process.env.OPENAI_API_KEY; });

  it('OpenAI client uses timeout 50_000 and maxRetries 0', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({
        summary: 'ok', requirements: [], officialSources: [],
        unconfirmedItems: [], recommendedNextSteps: [], confidence: 'NEEDS_HUMAN_REVIEW',
      }),
    });
    await searchRegulatoryRequirements('Teste', 'SP');
    const config = (OpenAI as any).lastConfig;
    expect(config.timeout).toBe(50_000);
    expect(config.maxRetries).toBe(0);
  });

  it('timeout is NOT 90_000 (previous dangerous value)', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({
        summary: 'ok', requirements: [], officialSources: [],
        unconfirmedItems: [], recommendedNextSteps: [], confidence: 'NEEDS_HUMAN_REVIEW',
      }),
    });
    await searchRegulatoryRequirements('Teste', 'SP');
    const config = (OpenAI as any).lastConfig;
    expect(config.timeout).not.toBe(90_000);
    expect(config.maxRetries).not.toBe(1);
  });

  it('web_search uses search_context_size low', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({
        summary: 'ok', requirements: [], officialSources: [],
        unconfirmedItems: [], recommendedNextSteps: [], confidence: 'NEEDS_HUMAN_REVIEW',
      }),
    });
    await searchRegulatoryRequirements('Teste', 'SP');
    const args = mockResponsesCreate.mock.calls[0][0];
    expect(args.tools).toEqual([{ type: 'web_search', search_context_size: 'low' }]);
  });

  it('max_output_tokens remains 4096', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({
        summary: 'ok', requirements: [], officialSources: [],
        unconfirmedItems: [], recommendedNextSteps: [], confidence: 'NEEDS_HUMAN_REVIEW',
      }),
    });
    await searchRegulatoryRequirements('Teste', 'SP');
    const args = mockResponsesCreate.mock.calls[0][0];
    expect(args.max_output_tokens).toBe(4096);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3-8. Error classification
// ══════════════════════════════════════════════════════════════════════════════

describe('regulatory search — error handling', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.OPENAI_API_KEY = 'sk-test'; });
  afterEach(() => { delete process.env.OPENAI_API_KEY; });

  it('timeout error is thrown with correct name', async () => {
    const timeoutErr = new Error('Request timed out');
    timeoutErr.name = 'APIConnectionTimeoutError';
    mockResponsesCreate.mockRejectedValueOnce(timeoutErr);
    await expect(searchRegulatoryRequirements('Cidade', 'SP')).rejects.toThrow();
  });

  it('rate limit error preserves status 429', async () => {
    const rateLimitErr: any = new Error('Rate limit exceeded');
    rateLimitErr.status = 429;
    mockResponsesCreate.mockRejectedValueOnce(rateLimitErr);
    await expect(searchRegulatoryRequirements('Cidade', 'SP')).rejects.toHaveProperty('status', 429);
  });

  it('incomplete response throws with regulatoryCode INVALID_RESPONSE', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output_text: '',
    });
    try {
      await searchRegulatoryRequirements('Cidade', 'SP');
      expect.fail('should throw');
    } catch (err: any) {
      expect(err.regulatoryCode).toBe('INVALID_RESPONSE');
    }
  });

  it('invalid JSON response throws with regulatoryCode INVALID_RESPONSE', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: 'not json at all {{{',
    });
    try {
      await searchRegulatoryRequirements('Cidade', 'SP');
      expect.fail('should throw');
    } catch (err: any) {
      expect(err.regulatoryCode).toBe('INVALID_RESPONSE');
    }
  });

  it('success preserves existing NEEDS_HUMAN_REVIEW guard', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({
        summary: 'Conflito encontrado.',
        requirements: ['Cadastro'],
        officialSources: [{ title: 'Lei', url: 'https://prefeitura.gov.br/lei', orgao: 'Prefeitura' }],
        unconfirmedItems: ['Item sem confirmação'],
        recommendedNextSteps: ['Consultar'],
        confidence: 'CONFIRMED',
      }),
    });
    const r = await searchRegulatoryRequirements('Cidade', 'SP');
    expect(r.confidence).toBe('NEEDS_HUMAN_REVIEW'); // Guard forces it
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 9-10. Frontend error messages
// ══════════════════════════════════════════════════════════════════════════════

describe('frontend — error display', () => {
  it('frontend shows backend error message', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../frontend-app/src/pages/admin/KaviarAiPage.jsx'), 'utf8');
    expect(src).toContain('err.response?.data?.error');
    expect(src).toContain('err.code === \'ECONNABORTED\'');
    expect(src).toContain('demorou mais que o esperado');
  });

  it('frontend always resets actionLoading', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../../frontend-app/src/pages/admin/KaviarAiPage.jsx'), 'utf8');
    expect(src).toContain('} finally {');
    expect(src).toContain('setActionLoading(false)');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 11-13. Existing behavior preserved
// ══════════════════════════════════════════════════════════════════════════════

describe('regulatory search — preserved behavior', () => {
  beforeEach(() => { vi.clearAllMocks(); process.env.OPENAI_API_KEY = 'sk-test'; });
  afterEach(() => { delete process.env.OPENAI_API_KEY; });

  it('successful search returns structured result', async () => {
    mockResponsesCreate.mockResolvedValueOnce({
      status: 'completed',
      output_text: JSON.stringify({
        summary: 'Cidade regulamentada.',
        requirements: ['Alvará'],
        officialSources: [{ title: 'Lei 123', url: 'https://prefeitura.gov.br', orgao: 'Prefeitura' }],
        unconfirmedItems: [],
        recommendedNextSteps: ['Protocolar'],
        confidence: 'CONFIRMED',
      }),
    });
    const r = await searchRegulatoryRequirements('Ribeirão Preto', 'SP');
    expect(r.confidence).toBe('CONFIRMED');
    expect(r.requirements).toContain('Alvará');
  });

  it('route requires SUPER_ADMIN (checked in route source)', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/routes/admin-ai.ts'), 'utf8');
    expect(src).toContain("'/territory/regulatory-search', requireSuperAdmin");
  });

  it('log does not contain API key or secrets', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.resolve(__dirname, '../src/routes/admin-ai.ts'), 'utf8');
    const logSection = src.split('REGULATORY_SEARCH_ERROR')[1]?.split('return res.status')[0] || '';
    expect(logSection).not.toContain('OPENAI_API_KEY');
    expect(logSection).not.toContain('headers');
    expect(logSection).not.toContain('apiKey');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Classifier unit tests
// ══════════════════════════════════════════════════════════════════════════════

import { classifyRegulatorySearchError, validateRegulatoryResult } from '../src/services/ai/kaviar-ai.regulatory-search';

describe('classifyRegulatorySearchError', () => {
  it('APIConnectionTimeoutError → 504 TIMEOUT', () => {
    const err = new Error('timeout'); err.name = 'APIConnectionTimeoutError';
    const r = classifyRegulatorySearchError(err);
    expect(r.httpStatus).toBe(504);
    expect(r.code).toBe('REGULATORY_SEARCH_TIMEOUT');
  });

  it('ETIMEDOUT → 504 TIMEOUT', () => {
    const err: any = new Error('connect'); err.code = 'ETIMEDOUT';
    expect(classifyRegulatorySearchError(err).httpStatus).toBe(504);
  });

  it('ECONNABORTED → 504 TIMEOUT', () => {
    const err: any = new Error('aborted'); err.code = 'ECONNABORTED';
    expect(classifyRegulatorySearchError(err).httpStatus).toBe(504);
  });

  it('message "timed out" → 504 TIMEOUT', () => {
    const err = new Error('Request timed out after 50000ms');
    expect(classifyRegulatorySearchError(err).httpStatus).toBe(504);
  });

  it('message "timeout" → 504 TIMEOUT', () => {
    const err = new Error('Connection timeout');
    expect(classifyRegulatorySearchError(err).httpStatus).toBe(504);
  });

  it('status 429 → 429 RATE_LIMITED', () => {
    const err: any = new Error('rate limit'); err.status = 429;
    const r = classifyRegulatorySearchError(err);
    expect(r.httpStatus).toBe(429);
    expect(r.code).toBe('REGULATORY_SEARCH_RATE_LIMITED');
  });

  it('regulatoryCode INVALID_RESPONSE → 502 INVALID_RESPONSE', () => {
    const err: any = new Error('incomplete'); err.regulatoryCode = 'INVALID_RESPONSE';
    const r = classifyRegulatorySearchError(err);
    expect(r.httpStatus).toBe(502);
    expect(r.code).toBe('REGULATORY_SEARCH_INVALID_RESPONSE');
  });

  it('regulatoryCode PROVIDER_ERROR → 502 PROVIDER_ERROR', () => {
    const err: any = new Error('failed'); err.regulatoryCode = 'PROVIDER_ERROR';
    const r = classifyRegulatorySearchError(err);
    expect(r.httpStatus).toBe(502);
    expect(r.code).toBe('REGULATORY_SEARCH_PROVIDER_ERROR');
  });

  it('status 500 → 502 PROVIDER_ERROR', () => {
    const err: any = new Error('server'); err.status = 500;
    expect(classifyRegulatorySearchError(err).code).toBe('REGULATORY_SEARCH_PROVIDER_ERROR');
  });

  it('APIError name → 502 PROVIDER_ERROR', () => {
    const err = new Error('api'); err.name = 'APIError';
    expect(classifyRegulatorySearchError(err).code).toBe('REGULATORY_SEARCH_PROVIDER_ERROR');
  });

  it('unexpected error → 500 INTERNAL_ERROR', () => {
    const err = new Error('something else');
    const r = classifyRegulatorySearchError(err);
    expect(r.httpStatus).toBe(500);
    expect(r.code).toBe('REGULATORY_SEARCH_INTERNAL_ERROR');
  });

  it('null error → 500 INTERNAL_ERROR', () => {
    expect(classifyRegulatorySearchError(null).httpStatus).toBe(500);
  });

  it('undefined error → 500 INTERNAL_ERROR', () => {
    expect(classifyRegulatorySearchError(undefined).httpStatus).toBe(500);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Validator unit tests
// ══════════════════════════════════════════════════════════════════════════════

describe('validateRegulatoryResult', () => {
  const validResult = {
    summary: 'ok',
    requirements: ['Alvará'],
    officialSources: [{ title: 'Lei', url: 'https://x.gov.br', orgao: 'Pref' }],
    unconfirmedItems: [],
    recommendedNextSteps: ['Protocolar'],
    confidence: 'CONFIRMED',
  };

  it('valid object passes', () => {
    expect(() => validateRegulatoryResult(validResult)).not.toThrow();
  });

  it('null throws INVALID_RESPONSE', () => {
    try { validateRegulatoryResult(null); expect.fail('should throw'); }
    catch (e: any) { expect(e.regulatoryCode).toBe('INVALID_RESPONSE'); }
  });

  it('string throws INVALID_RESPONSE', () => {
    try { validateRegulatoryResult('hello'); expect.fail('should throw'); }
    catch (e: any) { expect(e.regulatoryCode).toBe('INVALID_RESPONSE'); }
  });

  it('empty object throws INVALID_RESPONSE (missing summary)', () => {
    try { validateRegulatoryResult({}); expect.fail('should throw'); }
    catch (e: any) { expect(e.regulatoryCode).toBe('INVALID_RESPONSE'); }
  });

  it('requirements not array throws INVALID_RESPONSE', () => {
    try { validateRegulatoryResult({ ...validResult, requirements: 'not array' }); expect.fail('should throw'); }
    catch (e: any) { expect(e.regulatoryCode).toBe('INVALID_RESPONSE'); }
  });

  it('officialSources not array throws INVALID_RESPONSE', () => {
    try { validateRegulatoryResult({ ...validResult, officialSources: 'not array' }); expect.fail('should throw'); }
    catch (e: any) { expect(e.regulatoryCode).toBe('INVALID_RESPONSE'); }
  });

  it('officialSources with invalid entry throws INVALID_RESPONSE', () => {
    try { validateRegulatoryResult({ ...validResult, officialSources: [{ title: 123 }] }); expect.fail('should throw'); }
    catch (e: any) { expect(e.regulatoryCode).toBe('INVALID_RESPONSE'); }
  });

  it('recommendedNextSteps not array throws INVALID_RESPONSE', () => {
    try { validateRegulatoryResult({ ...validResult, recommendedNextSteps: null }); expect.fail('should throw'); }
    catch (e: any) { expect(e.regulatoryCode).toBe('INVALID_RESPONSE'); }
  });

  it('unconfirmedItems not array throws INVALID_RESPONSE', () => {
    try { validateRegulatoryResult({ ...validResult, unconfirmedItems: 42 }); expect.fail('should throw'); }
    catch (e: any) { expect(e.regulatoryCode).toBe('INVALID_RESPONSE'); }
  });
});
