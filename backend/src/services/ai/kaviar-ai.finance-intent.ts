import type { KaviarAiToolName } from './kaviar-ai.types';
import type { FinanceAccountingBriefData, FinanceDueObligationsData } from './kaviar-ai.tools';

// ── Finance sub-intent types ─────────────────────────────────────────────────

export type FinanceSubIntent =
  | 'FINANCE_PENDING_GENERAL'
  | 'FINANCE_OVERDUE'
  | 'FINANCE_DUE_SOON'
  | 'FINANCE_ACCOUNTING'
  | 'FINANCE_REVENUE'
  | 'FINANCE_INCENTIVE'
  | 'FINANCE_GENERAL';

// ── Tool preference per sub-intent ───────────────────────────────────────────

const FINANCE_SUBINTENT_TOOLS: Record<FinanceSubIntent, KaviarAiToolName[]> = {
  FINANCE_PENDING_GENERAL: ['finance_accounting_brief'],
  FINANCE_OVERDUE: ['finance_due_obligations'],
  FINANCE_DUE_SOON: ['finance_due_obligations'],
  FINANCE_ACCOUNTING: ['finance_accounting_brief'],
  FINANCE_REVENUE: ['rides_summary_today', 'rides_operations'],
  FINANCE_INCENTIVE: ['annual_incentive_summary'],
  FINANCE_GENERAL: ['finance_accounting_brief'],
};

// ── Classification ───────────────────────────────────────────────────────────

/**
 * Classifies a question (already known to be FINANCE intent) into a
 * specific finance sub-intent. Pure function, deterministic keyword matching.
 */
export function classifyFinanceIntent(question: string): FinanceSubIntent {
  const q = question
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  // FINANCE_INCENTIVE — gratificação, bônus, incentivo anual
  if (
    q.includes('gratificacao') || q.includes('bonus') ||
    q.includes('incentivo anual') ||
    (q.includes('incentivo') && q.includes('motorista'))
  ) {
    return 'FINANCE_INCENTIVE';
  }

  // FINANCE_REVENUE — faturamento, receita de corridas
  if (
    q.includes('fatur') || q.includes('receita') ||
    (q.includes('quanto') && (q.includes('ganhou') || q.includes('entrou'))) ||
    q.includes('corridas hoje') || q.includes('ganhou hoje')
  ) {
    return 'FINANCE_REVENUE';
  }

  // FINANCE_OVERDUE — explicitly vencida/atrasada
  if (
    (q.includes('vencida') || q.includes('vencido') || q.includes('atras')) &&
    !q.includes('vencendo') && !q.includes('proxim')
  ) {
    return 'FINANCE_OVERDUE';
  }

  // FINANCE_DUE_SOON — vence em breve, próximos dias/semana
  if (
    (q.includes('vence') || q.includes('vencendo')) &&
    (q.includes('semana') || q.includes('proxim') || q.includes('hoje') ||
     q.includes('amanha') || q.includes('dia') || q.includes('sexta') ||
     q.includes('mes'))
  ) {
    return 'FINANCE_DUE_SOON';
  }

  // "pagar até X" — implies upcoming due date
  if (
    q.includes('pagar') && (q.includes('ate') || q.includes('proxim'))
  ) {
    return 'FINANCE_DUE_SOON';
  }

  // FINANCE_PENDING_GENERAL — pendência financeira broad (BEFORE accounting!)
  if (
    (q.includes('pendencia') || q.includes('pendencias') || q.includes('pendente')) &&
    (q.includes('financeira') || q.includes('financeiro') || q.includes('pagar'))
  ) {
    return 'FINANCE_PENDING_GENERAL';
  }

  // Broad "o que temos pendente no financeiro"
  if (
    q.includes('pendente') && q.includes('financ')
  ) {
    return 'FINANCE_PENDING_GENERAL';
  }

  // FINANCE_ACCOUNTING — resumo contábil, balanço
  if (
    q.includes('resumo') || q.includes('balanco') ||
    q.includes('contabil') || q.includes('contador') ||
    (q.includes('como esta') && (q.includes('financeiro') || q.includes('financeira'))) ||
    q.includes('situacao contabil')
  ) {
    return 'FINANCE_ACCOUNTING';
  }

  return 'FINANCE_GENERAL';
}

// ── Tool refinement ──────────────────────────────────────────────────────────

/**
 * Refines the tool list for FINANCE intent based on the sub-intent.
 * Returns preferred tools filtered against available authorized tools.
 * Never adds tools not in the authorized set (except for canonical source
 * when called with explicit override).
 */
export function refineFinanceTools(
  subIntent: FinanceSubIntent,
  availableTools: KaviarAiToolName[]
): KaviarAiToolName[] {
  const preferred = FINANCE_SUBINTENT_TOOLS[subIntent];
  const matching = preferred.filter(t => availableTools.includes(t));

  if (matching.length > 0) {
    return matching;
  }

  // Fallback: keep first available finance tool
  return availableTools.slice(0, subIntent === 'FINANCE_PENDING_GENERAL' ? 2 : 1);
}

// ── Consolidated pending response formatter ──────────────────────────────────

/**
 * Formats a consolidated finance pending response for FINANCE_PENDING_GENERAL.
 * Shows overdue vs. due-soon separately. Does NOT mix with revenue/incentives.
 */
export function formatFinancePendingSummary(data: FinanceAccountingBriefData): string {
  const parts: string[] = [];
  parts.push('No financeiro, encontrei:');
  parts.push('');

  // Overdue
  if (data.overdueCount > 0) {
    parts.push(`• **${data.overdueCount}** obrigação${data.overdueCount !== 1 ? 'ões' : ''} vencida${data.overdueCount !== 1 ? 's' : ''} (${formatCents(data.overdueAmountCents)});`);
  } else {
    parts.push('• Nenhuma obrigação vencida;');
  }

  // Due soon (7d)
  if (data.due7dCount > 0) {
    parts.push(`• **${data.due7dCount}** obrigação${data.due7dCount !== 1 ? 'ões' : ''} a vencer nos próximos 7 dias;`);
  } else {
    parts.push('• Nenhuma obrigação vencendo nos próximos 7 dias;');
  }

  // Due 15d/30d
  if (data.due15dCount > 0 || data.due30dCount > 0) {
    const horizon: string[] = [];
    if (data.due15dCount > 0) horizon.push(`${data.due15dCount} em 15 dias`);
    if (data.due30dCount > 0) horizon.push(`${data.due30dCount} em 30 dias`);
    parts.push(`• Horizonte adicional: ${horizon.join(', ')};`);
  }

  // Uncategorized
  if (data.uncategorizedCount > 0) {
    parts.push(`• **${data.uncategorizedCount}** lançamento${data.uncategorizedCount !== 1 ? 's' : ''} sem categoria;`);
  }

  // Accounting pendencias
  if (data.accountingPendencias.available && data.accountingPendencias.total > 0) {
    parts.push(`• **${data.accountingPendencias.total}** pendência${data.accountingPendencias.total !== 1 ? 's' : ''} contábil${data.accountingPendencias.total !== 1 ? 'eis' : ''} (${data.accountingPendencias.urgent} urgente${data.accountingPendencias.urgent !== 1 ? 's' : ''}).`);
  }

  parts.push('');

  // Recommended action
  if (data.overdueCount > 0) {
    parts.push('**Próxima ação recomendada:** revisar obrigações vencidas e regularizar.');
  } else if (data.due7dCount > 0) {
    parts.push('**Próxima ação recomendada:** verificar obrigações com vencimento próximo.');
  } else {
    parts.push('**Situação:** sem pendências urgentes no momento.');
  }

  return parts.join('\n');
}


export function formatFinanceOverdue(data: FinanceDueObligationsData): string {
  if (data.overdueCount === 0) {
    return 'Não há obrigações financeiras vencidas.';
  }

  return `${data.overdueCount} ${data.overdueCount === 1 ? 'obrigação financeira vencida' : 'obrigações financeiras vencidas'}, totalizando ${formatCents(data.overdueAmountCents)}.`;
}

export function formatFinanceDueSoon(data: FinanceDueObligationsData): string {
  if (data.dueSoonCount === 0) {
    return 'Não há obrigações financeiras vencendo nos próximos 7 dias.';
  }

  return `${data.dueSoonCount} ${data.dueSoonCount === 1 ? 'obrigação financeira vence' : 'obrigações financeiras vencem'} nos próximos 7 dias, totalizando ${formatCents(data.dueSoonAmountCents)}.`;
}

// ── Helper ───────────────────────────────────────────────────────────────────

function formatCents(cents: string): string {
  const value = BigInt(cents);
  const isNegative = value < 0n;
  const abs = isNegative ? -value : value;
  const integer = (abs / 100n).toString();
  const fraction = (abs % 100n).toString().padStart(2, '0');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${isNegative ? '-' : ''}R$ ${grouped},${fraction}`;
}
