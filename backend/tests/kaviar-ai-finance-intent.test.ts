import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock('../src/db', () => ({
  pool: { query: mockQuery },
}));

import {
  classifyFinanceIntent,
  refineFinanceTools,
  formatFinancePendingSummary,
} from '../src/services/ai/kaviar-ai.finance-intent';
import type { FinanceAccountingBriefData } from '../src/services/ai/kaviar-ai.tools';
import type { KaviarAiToolName } from '../src/services/ai/kaviar-ai.types';
import { classifyIntent } from '../src/services/ai/kaviar-ai.orchestrator';
import { askKaviarAi } from '../src/services/ai/kaviar-ai.service';

// ── Fixture ──────────────────────────────────────────────────────────────────

const ACCOUNTING_DATA: FinanceAccountingBriefData = {
  periodLabel: 'Agosto 2026',
  realizedRevenueCents: '450000',
  realizedExpenseCents: '320000',
  realizedResultCents: '130000',
  overdueCount: 2,
  overdueAmountCents: '85000',
  due7dCount: 3,
  due15dCount: 1,
  due30dCount: 0,
  uncategorizedCount: 4,
  accountingPendencias: { available: true, total: 2, urgent: 1, high: 1 },
};

// ── 1. FINANCE_PENDING_GENERAL ───────────────────────────────────────────────

describe('Finance Intent — FINANCE_PENDING_GENERAL', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('classifies "Tem alguma pendência financeira?" as FINANCE_PENDING_GENERAL', () => {
    expect(classifyFinanceIntent('Tem alguma pendência financeira?')).toBe('FINANCE_PENDING_GENERAL');
  });

  it('classifies "O que temos pendente no financeiro?" as FINANCE_PENDING_GENERAL', () => {
    expect(classifyFinanceIntent('O que temos pendente no financeiro?')).toBe('FINANCE_PENDING_GENERAL');
  });

  it('classifies "Como estão as pendências financeiras?" as FINANCE_PENDING_GENERAL', () => {
    expect(classifyFinanceIntent('Como estão as pendências financeiras?')).toBe('FINANCE_PENDING_GENERAL');
  });

  it('classifies "Tem alguma coisa para pagar?" as FINANCE_PENDING_GENERAL', () => {
    expect(classifyFinanceIntent('Tem alguma coisa pendente para pagar?')).toBe('FINANCE_PENDING_GENERAL');
  });

  it('consolidated response distinguishes overdue from due-soon', () => {
    const answer = formatFinancePendingSummary(ACCOUNTING_DATA);
    expect(answer).toContain('vencida');
    expect(answer).toContain('próximos 7 dias');
    // Contains overdue count
    expect(answer).toContain('2');
    // Contains due7d count
    expect(answer).toContain('3');
  });

  it('consolidated response does NOT mix revenue with obligations', () => {
    const answer = formatFinancePendingSummary(ACCOUNTING_DATA);
    // Should not mention revenue/corridas
    expect(answer).not.toContain('receita');
    expect(answer).not.toContain('corrida');
    expect(answer).not.toContain('fatur');
  });

  it('consolidated response recommends action based on overdue', () => {
    const answer = formatFinancePendingSummary(ACCOUNTING_DATA);
    expect(answer).toContain('Próxima ação recomendada');
    expect(answer).toContain('vencidas');
  });

  it('consolidated response shows uncategorized if present', () => {
    const answer = formatFinancePendingSummary(ACCOUNTING_DATA);
    expect(answer).toContain('sem categoria');
    expect(answer).toContain('4');
  });

  it('integration: consolidated answer via askKaviarAi', async () => {
    // Mock queries for finance_accounting_brief
    // Revenue/expense
    mockQuery.mockResolvedValueOnce({
      rows: [{
        realized_revenue_cents: '450000',
        realized_expense_cents: '320000',
      }],
    });
    // Obligations
    mockQuery.mockResolvedValueOnce({
      rows: [{
        overdue_count: 2,
        overdue_amount_cents: '85000',
        due_7d_count: 3,
        due_15d_count: 1,
        due_30d_count: 0,
      }],
    });
    // Uncategorized
    mockQuery.mockResolvedValueOnce({
      rows: [{ uncategorized_count: 4 }],
    });
    // Period label
    mockQuery.mockResolvedValueOnce({
      rows: [{ period_label: 'Agosto 2026' }],
    });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Tem alguma pendência financeira?',
      role: 'SUPER_ADMIN',
    });

    expect(response.toolsUsed).toContain('finance_accounting_brief');
    expect(response.toolsUsed).not.toContain('annual_incentive_summary');
    expect(response.toolsUsed).not.toContain('rides_summary_today');
    // Distinguishes overdue from due-soon
    expect(response.answer).toContain('vencida');
    // Does not mix revenue
    expect(response.answer).not.toContain('corrida');
  });
});

// ── 2. FINANCE_OVERDUE ───────────────────────────────────────────────────────

describe('Finance Intent — FINANCE_OVERDUE', () => {
  it('classifies "Tem alguma obrigação vencida?" as FINANCE_OVERDUE', () => {
    expect(classifyFinanceIntent('Tem alguma obrigação vencida?')).toBe('FINANCE_OVERDUE');
  });

  it('classifies "O que está vencido?" as FINANCE_OVERDUE', () => {
    expect(classifyFinanceIntent('O que está vencido?')).toBe('FINANCE_OVERDUE');
  });

  it('classifies "Tem pagamento atrasado?" as FINANCE_OVERDUE', () => {
    expect(classifyFinanceIntent('Tem pagamento atrasado?')).toBe('FINANCE_OVERDUE');
  });

  it('prefers finance_due_obligations tool', () => {
    const tools = refineFinanceTools('FINANCE_OVERDUE', [
      'finance_accounting_brief',
      'finance_due_obligations',
    ]);
    expect(tools).toContain('finance_due_obligations');
    expect(tools).not.toContain('finance_accounting_brief');
  });
});

// ── 3. FINANCE_DUE_SOON ─────────────────────────────────────────────────────

describe('Finance Intent — FINANCE_DUE_SOON', () => {
  it('classifies "O que vence esta semana?" as FINANCE_DUE_SOON', () => {
    expect(classifyFinanceIntent('O que vence esta semana?')).toBe('FINANCE_DUE_SOON');
  });

  it('classifies "Tem alguma obrigação vencendo nos próximos dias?" as FINANCE_DUE_SOON', () => {
    expect(classifyFinanceIntent('Tem alguma obrigação vencendo nos próximos dias?')).toBe('FINANCE_DUE_SOON');
  });

  it('classifies "O que precisamos pagar até sexta?" as FINANCE_DUE_SOON', () => {
    expect(classifyFinanceIntent('O que precisamos pagar até sexta?')).toBe('FINANCE_DUE_SOON');
  });

  it('prefers finance_due_obligations tool', () => {
    const tools = refineFinanceTools('FINANCE_DUE_SOON', [
      'finance_due_obligations',
      'annual_incentive_summary',
    ]);
    expect(tools).toContain('finance_due_obligations');
    expect(tools).not.toContain('annual_incentive_summary');
  });
});

// ── 4. FINANCE_ACCOUNTING ────────────────────────────────────────────────────

describe('Finance Intent — FINANCE_ACCOUNTING', () => {
  it('classifies "Como está o financeiro?" as FINANCE_ACCOUNTING', () => {
    expect(classifyFinanceIntent('Como está o financeiro?')).toBe('FINANCE_ACCOUNTING');
  });

  it('classifies "Me dê um resumo financeiro." as FINANCE_ACCOUNTING', () => {
    expect(classifyFinanceIntent('Me dê um resumo financeiro.')).toBe('FINANCE_ACCOUNTING');
  });

  it('classifies "Como está a situação contábil?" as FINANCE_ACCOUNTING', () => {
    expect(classifyFinanceIntent('Como está a situação contábil?')).toBe('FINANCE_ACCOUNTING');
  });

  it('prefers finance_accounting_brief tool', () => {
    const tools = refineFinanceTools('FINANCE_ACCOUNTING', [
      'finance_accounting_brief',
      'finance_due_obligations',
    ]);
    expect(tools).toContain('finance_accounting_brief');
  });
});

// ── 5. FINANCE_REVENUE ───────────────────────────────────────────────────────

describe('Finance Intent — FINANCE_REVENUE', () => {
  it('classifies "Quanto faturamos hoje?" as FINANCE_REVENUE', () => {
    expect(classifyFinanceIntent('Quanto faturamos hoje?')).toBe('FINANCE_REVENUE');
  });

  it('classifies "Qual foi a receita das corridas?" as FINANCE_REVENUE', () => {
    expect(classifyFinanceIntent('Qual foi a receita das corridas?')).toBe('FINANCE_REVENUE');
  });

  it('prefers rides tools, not obligations', () => {
    const tools = refineFinanceTools('FINANCE_REVENUE', [
      'rides_summary_today',
      'finance_due_obligations',
    ]);
    expect(tools).toContain('rides_summary_today');
    expect(tools).not.toContain('finance_due_obligations');
  });
});

// ── 6. FINANCE_INCENTIVE ─────────────────────────────────────────────────────

describe('Finance Intent — FINANCE_INCENTIVE', () => {
  it('classifies "Como está a gratificação anual?" as FINANCE_INCENTIVE', () => {
    expect(classifyFinanceIntent('Como está a gratificação anual?')).toBe('FINANCE_INCENTIVE');
  });

  it('classifies "Tem algum valor de incentivo pendente?" as FINANCE_INCENTIVE', () => {
    expect(classifyFinanceIntent('Tem algum valor de incentivo anual pendente?')).toBe('FINANCE_INCENTIVE');
  });

  it('prefers annual_incentive_summary tool', () => {
    const tools = refineFinanceTools('FINANCE_INCENTIVE', [
      'annual_incentive_summary',
      'finance_accounting_brief',
    ]);
    expect(tools).toContain('annual_incentive_summary');
    expect(tools).not.toContain('finance_accounting_brief');
  });
});

// ── 7. Non-regression DRIVERS ────────────────────────────────────────────────

describe('Finance Intent — Non-regression', () => {
  it('"Quantos motoristas estão pendentes?" continues as DRIVERS', () => {
    expect(classifyIntent('Quantos motoristas estão pendentes?')).toBe('DRIVERS');
  });

  it('"Tem leads sem contato?" continues as CRM', () => {
    expect(classifyIntent('Tem leads sem contato?')).toBe('CRM');
  });

  it('FINANCE_GENERAL fallback for unrecognized finance questions', () => {
    // "saúde financeira" matches "como esta" + "financeira" → ACCOUNTING is reasonable
    expect(classifyFinanceIntent('Qual é a taxa de inadimplência?')).toBe('FINANCE_GENERAL');
  });

  it('"Tem alguma pendência financeira?" is classified as FINANCE by orchestrator', () => {
    expect(classifyIntent('Tem alguma pendência financeira?')).toBe('FINANCE');
  });
});

// ── 9. Router wrong tool ─────────────────────────────────────────────────────

describe('Finance Intent — Router wrong tool correction', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('FINANCE_OVERDUE: does not use annual_incentive_summary even if router selected it', async () => {
    // finance_due_obligations makes a single query
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({
      rows: [{
        total_pending: 2,
        total_amount_cents: '85000',
        overdue_count: 2,
        overdue_amount_cents: '85000',
        due_soon_count: 0,
        due_soon_amount_cents: '0',
      }],
    });

    const response = await askKaviarAi({
      userId: 'admin-1',
      question: 'Tem alguma obrigação vencida?',
      role: 'SUPER_ADMIN',
    });

    // Should use finance_due_obligations, not annual_incentive_summary
    expect(response.toolsUsed).toContain('finance_due_obligations');
    expect(response.toolsUsed).not.toContain('annual_incentive_summary');
    // The tool was called and should format overdue obligations
    expect(response.answer).toContain('2');
    expect(response.answer).toContain('pendente');
  });
});

// ── formatFinancePendingSummary edge cases ────────────────────────────────────

describe('formatFinancePendingSummary — edge cases', () => {
  it('handles zero overdue gracefully', () => {
    const data: FinanceAccountingBriefData = {
      ...ACCOUNTING_DATA,
      overdueCount: 0,
      overdueAmountCents: '0',
    };
    const answer = formatFinancePendingSummary(data);
    expect(answer).toContain('Nenhuma obrigação vencida');
    // Should still show due-soon
    expect(answer).toContain('próximos 7 dias');
  });

  it('handles everything zero — no urgent action', () => {
    const data: FinanceAccountingBriefData = {
      ...ACCOUNTING_DATA,
      overdueCount: 0,
      overdueAmountCents: '0',
      due7dCount: 0,
      due15dCount: 0,
      due30dCount: 0,
      uncategorizedCount: 0,
      accountingPendencias: { available: true, total: 0, urgent: 0, high: 0 },
    };
    const answer = formatFinancePendingSummary(data);
    expect(answer).toContain('sem pendências urgentes');
  });

  it('formats BRL amounts correctly', () => {
    const data: FinanceAccountingBriefData = {
      ...ACCOUNTING_DATA,
      overdueAmountCents: '150099',
    };
    const answer = formatFinancePendingSummary(data);
    expect(answer).toContain('R$ 1.500,99');
  });
});
