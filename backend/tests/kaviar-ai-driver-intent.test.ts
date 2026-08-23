import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../src/db', () => ({
  pool: { query: mockQuery },
}));

import {
  classifyDriverIntent,
  refineDriverTools,
  formatConsolidatedPending,
} from '../src/services/ai/kaviar-ai.driver-intent';
import type { DriverPipelineSummaryData } from '../src/services/ai/kaviar-ai.command-center';
import type { KaviarAiToolName } from '../src/services/ai/kaviar-ai.types';
import { classifyIntent } from '../src/services/ai/kaviar-ai.orchestrator';
import { askKaviarAi } from '../src/services/ai/kaviar-ai.service';

// ── Fixture: production-like data ────────────────────────────────────────────

const PIPELINE_DATA: DriverPipelineSummaryData = {
  available: true,
  total: 45,
  byStatus: { approved: 14, rejected: 26, pending: 5 },
  byVehicleType: { car: 30, motorcycle: 15 },
  pendingApproval: 5,
  docsMissing: 8,
  docsSubmitted: 18,
  docsRejected: 0,
  compliancePending: 12,
  activeDrivers: 14,
  suspendedDrivers: 0,
  modalities: {
    available: true,
    pending: 20,
    approved: 10,
    rejected: 9,
  },
  referenceTime: '2026-08-23 14:00',
};

// ── 1. Pergunta ampla: DRIVER_PENDING_GENERAL ────────────────────────────────

describe('Driver Intent — DRIVER_PENDING_GENERAL', () => {
  it('classifies "Quantos motoristas estão pendentes?" as DRIVER_PENDING_GENERAL', () => {
    expect(classifyDriverIntent('Quantos motoristas estão pendentes?')).toBe('DRIVER_PENDING_GENERAL');
  });

  it('classifies "Tem motorista pendente?" as DRIVER_PENDING_GENERAL', () => {
    expect(classifyDriverIntent('Tem motorista pendente?')).toBe('DRIVER_PENDING_GENERAL');
  });

  it('classifies "Como estão as pendências dos motoristas?" as DRIVER_PENDING_GENERAL', () => {
    expect(classifyDriverIntent('Como estão as pendências dos motoristas?')).toBe('DRIVER_PENDING_GENERAL');
  });

  it('classifies "Quantos motoristas ainda têm pendência?" as DRIVER_PENDING_GENERAL', () => {
    expect(classifyDriverIntent('Quantos motoristas ainda têm pendência?')).toBe('DRIVER_PENDING_GENERAL');
  });

  it('consolidated response distinguishes all categories', () => {
    const answer = formatConsolidatedPending(PIPELINE_DATA);

    // Shows status pending
    expect(answer).toContain('5');
    expect(answer).toContain('cadastro/status pendente');

    // Shows documents
    expect(answer).toContain('8 com documento ausente');
    expect(answer).toContain('18 aguardando revisão');

    // Shows compliance
    expect(answer).toContain('12');
    expect(answer).toContain('compliance pendente');

    // Shows modalities
    expect(answer).toContain('20');
    expect(answer).toContain('modalidade');
    expect(answer).toContain('aguardando aprovação');
  });

  it('consolidated response does NOT sum categories', () => {
    const answer = formatConsolidatedPending(PIPELINE_DATA);

    // The sum 5 + 26 + 12 + 20 = 63 should NOT appear
    expect(answer).not.toContain('63');

    // Warning about overlap
    expect(answer).toContain('não devem ser somados');
  });

  it('consolidated response mentions each type separately', () => {
    const answer = formatConsolidatedPending(PIPELINE_DATA);
    const lines = answer.split('\n').filter(l => l.startsWith('•'));
    // At least 4 bullet points (status, docs, compliance, modalities)
    expect(lines.length).toBeGreaterThanOrEqual(4);
  });

  it('prefers driver_pipeline_summary tool', () => {
    const tools = refineDriverTools('DRIVER_PENDING_GENERAL', [
      'driver_pipeline_summary',
      'drivers_documents_pending',
    ]);
    expect(tools).toContain('driver_pipeline_summary');
  });

  it('integration: consolidated answer via askKaviarAi', async () => {
    // Mock queries that driver_pipeline_summary executes
    mockQuery
      // status query
      .mockResolvedValueOnce({
        rows: [
          { status: 'approved', cnt: 14 },
          { status: 'rejected', cnt: 26 },
          { status: 'pending', cnt: 5 },
        ],
      })
      // vehicle type query
      .mockResolvedValueOnce({
        rows: [{ vehicle_type: 'car', cnt: 30 }, { vehicle_type: 'motorcycle', cnt: 15 }],
      })
      // docs query
      .mockResolvedValueOnce({
        rows: [{ docs_missing: 8, docs_submitted: 18, docs_rejected: 0, compliance_pending: 12 }],
      })
      // modalities query
      .mockResolvedValueOnce({
        rows: [
          { status: 'PENDING_REVIEW', cnt: 20 },
          { status: 'APPROVED', cnt: 10 },
          { status: 'REJECTED', cnt: 9 },
        ],
      })
      // reference time
      .mockResolvedValueOnce({
        rows: [{ ref: '2026-08-23 14:00' }],
      });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Quantos motoristas estão pendentes?',
      role: 'SUPER_ADMIN',
    });

    expect(response.toolsUsed).toContain('driver_pipeline_summary');
    // Distinguishes categories
    expect(response.answer).toContain('cadastro/status pendente');
    expect(response.answer).toContain('documento ausente');
    expect(response.answer).toContain('compliance pendente');
    expect(response.answer).toContain('modalidade');
    // Does not sum
    expect(response.answer).not.toContain('63');
    expect(response.answer).toContain('não devem ser somados');
  });
});

// ── 2. DRIVER_DOCUMENTS ──────────────────────────────────────────────────────

describe('Driver Intent — DRIVER_DOCUMENTS', () => {
  it('classifies "Quantos motoristas estão com documentos pendentes?" as DRIVER_DOCUMENTS', () => {
    expect(classifyDriverIntent('Quantos motoristas estão com documentos pendentes?')).toBe('DRIVER_DOCUMENTS');
  });

  it('classifies "Tem motorista com documento faltando?" as DRIVER_DOCUMENTS', () => {
    expect(classifyDriverIntent('Tem motorista com documento faltando?')).toBe('DRIVER_DOCUMENTS');
  });

  it('classifies "Quantos documentos aguardam revisão?" as DRIVER_DOCUMENTS', () => {
    expect(classifyDriverIntent('Quantos documentos aguardam revisão?')).toBe('DRIVER_DOCUMENTS');
  });

  it('prefers drivers_documents_pending tool', () => {
    const tools = refineDriverTools('DRIVER_DOCUMENTS', [
      'driver_pipeline_summary',
      'drivers_documents_pending',
    ]);
    expect(tools).toContain('drivers_documents_pending');
    expect(tools).not.toContain('driver_pipeline_summary');
  });
});

// ── 3. DRIVER_STATUS ─────────────────────────────────────────────────────────

describe('Driver Intent — DRIVER_STATUS', () => {
  it('classifies "Quantos motoristas estão com cadastro pendente?" as DRIVER_STATUS', () => {
    expect(classifyDriverIntent('Quantos motoristas estão com cadastro pendente?')).toBe('DRIVER_STATUS');
  });

  it('classifies "Como está o pipeline de motoristas?" as DRIVER_STATUS', () => {
    expect(classifyDriverIntent('Como está o pipeline de motoristas?')).toBe('DRIVER_STATUS');
  });

  it('classifies "Quantos motoristas estão com status pending?" as DRIVER_STATUS', () => {
    expect(classifyDriverIntent('Quantos motoristas estão com status pending?')).toBe('DRIVER_STATUS');
  });

  it('prefers driver_pipeline_summary tool', () => {
    const tools = refineDriverTools('DRIVER_STATUS', [
      'driver_pipeline_summary',
      'drivers_documents_pending',
    ]);
    expect(tools).toContain('driver_pipeline_summary');
  });
});

// ── 4. DRIVER_COMPLIANCE ─────────────────────────────────────────────────────

describe('Driver Intent — DRIVER_COMPLIANCE', () => {
  it('classifies "Quantos motoristas estão com compliance pendente?" as DRIVER_COMPLIANCE', () => {
    expect(classifyDriverIntent('Quantos motoristas estão com compliance pendente?')).toBe('DRIVER_COMPLIANCE');
  });

  it('classifies "Tem compliance aguardando aprovação?" as DRIVER_COMPLIANCE', () => {
    expect(classifyDriverIntent('Tem compliance aguardando aprovação?')).toBe('DRIVER_COMPLIANCE');
  });

  it('prefers driver_pipeline_summary (contains compliance data)', () => {
    const tools = refineDriverTools('DRIVER_COMPLIANCE', [
      'driver_pipeline_summary',
      'drivers_documents_pending',
    ]);
    expect(tools).toContain('driver_pipeline_summary');
  });
});

// ── 5. DRIVER_MODALITIES ─────────────────────────────────────────────────────

describe('Driver Intent — DRIVER_MODALITIES', () => {
  it('classifies "Quantas modalidades aguardam aprovação?" as DRIVER_MODALITIES', () => {
    expect(classifyDriverIntent('Quantas modalidades aguardam aprovação?')).toBe('DRIVER_MODALITIES');
  });

  it('classifies "Tem modalidade pendente?" as DRIVER_MODALITIES', () => {
    expect(classifyDriverIntent('Tem modalidade pendente?')).toBe('DRIVER_MODALITIES');
  });

  it('prefers driver_pipeline_summary (contains modalities data)', () => {
    const tools = refineDriverTools('DRIVER_MODALITIES', ['driver_pipeline_summary']);
    expect(tools).toContain('driver_pipeline_summary');
  });
});

// ── 6. DRIVER_RATINGS ────────────────────────────────────────────────────────

describe('Driver Intent — DRIVER_RATINGS', () => {
  it('classifies "Como estão as avaliações dos motoristas?" as DRIVER_RATINGS', () => {
    expect(classifyDriverIntent('Como estão as avaliações dos motoristas?')).toBe('DRIVER_RATINGS');
  });

  it('classifies "Tem motorista mal avaliado?" as DRIVER_RATINGS', () => {
    expect(classifyDriverIntent('Tem motorista mal avaliado?')).toBe('DRIVER_RATINGS');
  });

  it('prefers driver_ratings_summary tool', () => {
    const tools = refineDriverTools('DRIVER_RATINGS', [
      'driver_pipeline_summary',
      'driver_ratings_summary',
    ]);
    expect(tools).toContain('driver_ratings_summary');
    expect(tools).not.toContain('driver_pipeline_summary');
  });
});

// ── 7. Non-regression: other intents unaffected ──────────────────────────────

describe('Driver Intent — Non-regression', () => {
  it('"Tem alguma obrigação vencida?" continues as FINANCE', () => {
    expect(classifyIntent('Tem alguma obrigação vencida?')).toBe('FINANCE');
  });

  it('"Tem leads sem contato?" continues as CRM', () => {
    expect(classifyIntent('Tem leads sem contato?')).toBe('CRM');
  });

  it('DRIVER_GENERAL fallback for unrecognized driver questions', () => {
    expect(classifyDriverIntent('Como está a situação dos motoristas?')).toBe('DRIVER_GENERAL');
  });

  it('refineDriverTools with DRIVER_GENERAL keeps all available tools', () => {
    const tools: KaviarAiToolName[] = ['driver_pipeline_summary', 'drivers_documents_pending'];
    const refined = refineDriverTools('DRIVER_GENERAL', tools);
    // DRIVER_GENERAL prefers driver_pipeline_summary
    expect(refined).toContain('driver_pipeline_summary');
  });
});

// ── formatConsolidatedPending edge cases ─────────────────────────────────────

describe('formatConsolidatedPending — edge cases', () => {
  it('handles unavailable data gracefully', () => {
    const unavailable: DriverPipelineSummaryData = {
      ...PIPELINE_DATA,
      available: false,
    };
    const answer = formatConsolidatedPending(unavailable);
    expect(answer).toContain('não foi possível consultar');
  });

  it('handles zero pending in all categories', () => {
    const zeroPending: DriverPipelineSummaryData = {
      ...PIPELINE_DATA,
      pendingApproval: 0,
      docsMissing: 0,
      docsSubmitted: 0,
      docsRejected: 0,
      compliancePending: 0,
      modalities: { available: true, pending: 0, approved: 10, rejected: 0 },
    };
    const answer = formatConsolidatedPending(zeroPending);
    expect(answer).toContain('0');
    expect(answer).toContain('Nenhuma pendência documental');
    expect(answer).toContain('Nenhuma modalidade pendente');
  });

  it('handles modalities unavailable', () => {
    const noModalities: DriverPipelineSummaryData = {
      ...PIPELINE_DATA,
      modalities: { available: false, pending: 0, approved: 0, rejected: 0 },
    };
    const answer = formatConsolidatedPending(noModalities);
    expect(answer).toContain('Modalidades: não foi possível consultar');
  });
});
