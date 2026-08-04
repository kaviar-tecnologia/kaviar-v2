/**
 * Finance Dashboard Summary — Server-side aggregation
 *
 * Rules:
 * - Realized: status IN (POSTED, RECONCILED, CLOSED)
 * - Forecast: status IN (DRAFT, PENDING)
 * - Excluded: CANCELED, REVERSED, BLOCKED
 * - Revenue: direction = IN AND transaction_type != TRANSFER AND transaction_type != REVERSAL
 * - Expense: direction = OUT AND transaction_type != TRANSFER AND transaction_type != REVERSAL
 * - Transfers: transaction_type = TRANSFER (shown separately, don't inflate revenue/expense)
 * - Reversals: transaction_type = REVERSAL (excluded from main indicators — they compensate originals)
 * - Overdue: due_date < today AND status IN (DRAFT, PENDING) AND due_date IS NOT NULL
 *
 * All monetary values are BigInt strings in centavos.
 * No Number, parseInt, or float used anywhere.
 */
import { prisma } from '../../lib/prisma';
import { Prisma } from '@prisma/client';

// ── Status classifications ───────────────────────────────────────────────────

const REALIZED_STATUSES = ['POSTED', 'RECONCILED', 'CLOSED'];
const FORECAST_STATUSES = ['DRAFT', 'PENDING'];
const EXCLUDED_STATUSES = ['CANCELED', 'REVERSED', 'BLOCKED'];

// ── Types ────────────────────────────────────────────────────────────────────

export interface DashboardFilters {
  search?: string;
  account_id?: string;
  counterparty_account_id?: string;
  category_id?: string;
  cost_center_id?: string;
  direction?: string;
  transaction_type?: string;
  status?: string;
  payment_method?: string;
  source_type?: string;
  origin_type?: string;
  provider?: string;
  transfer_group_id?: string;
  date_field?: string;
  date_from?: Date;
  date_to?: Date;
}

export interface DashboardSummary {
  // Realized
  realized_revenue_cents: string;
  realized_expense_cents: string;
  realized_result_cents: string;
  // Forecast
  forecast_revenue_cents: string;
  forecast_expense_cents: string;
  forecast_result_cents: string;
  // Pending & overdue
  pending_total_cents: string;
  overdue_total_cents: string;
  overdue_count: number;
  // Canceled in period
  canceled_total_cents: string;
  // Internal transfers
  transfer_total_cents: string;
  // Count
  total_transactions: number;
}

export interface DreGroupItem {
  dre_group: string;
  revenue_cents: string;
  expense_cents: string;
  result_cents: string;
  transaction_count: number;
}

export interface CategoryGroupItem {
  category_id: string | null;
  category_code: string | null;
  category_name: string;
  total_cents: string;
  transaction_count: number;
}

export interface AccountGroupItem {
  account_id: string;
  account_code: string;
  account_name: string;
  total_in_cents: string;
  total_out_cents: string;
  transaction_count: number;
}

export interface CostCenterGroupItem {
  cost_center_id: string | null;
  cost_center_code: string | null;
  cost_center_name: string;
  total_cents: string;
  transaction_count: number;
}

export interface DashboardResponse {
  summary: DashboardSummary;
  dre_groups: DreGroupItem[];
  by_category: CategoryGroupItem[];
  by_account: AccountGroupItem[];
  by_cost_center: CostCenterGroupItem[];
}

// ── Helper: today civil date (America/Sao_Paulo) ─────────────────────────────

export function todayCivilDate(): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const str = formatter.format(new Date()); // YYYY-MM-DD
  return new Date(str + 'T00:00:00.000Z');
}

// ── BigInt safe sum helper ───────────────────────────────────────────────────

function sumBigInt(rows: any[], field: string): bigint {
  let total = BigInt(0);
  for (const row of rows) {
    const val = row[field];
    if (val != null) {
      total += typeof val === 'bigint' ? val : BigInt(String(val));
    }
  }
  return total;
}

function bigStr(val: bigint): string {
  return val.toString();
}

// ── Where clause builder (reuses same logic as CSV export) ───────────────────

function buildWhereClause(filters: DashboardFilters): Prisma.financial_transactionsWhereInput {
  const where: Prisma.financial_transactionsWhereInput = {};

  if (filters.account_id) where.account_id = filters.account_id;
  if (filters.counterparty_account_id) where.counterparty_account_id = filters.counterparty_account_id;
  if (filters.category_id) where.category_id = filters.category_id;
  if (filters.cost_center_id) where.cost_center_id = filters.cost_center_id;
  if (filters.direction) where.direction = filters.direction as any;
  if (filters.transaction_type) where.transaction_type = filters.transaction_type as any;
  if (filters.status) where.status = filters.status as any;
  if (filters.payment_method) where.payment_method = filters.payment_method as any;
  if (filters.source_type) where.source_type = filters.source_type as any;
  if (filters.origin_type) where.origin_type = filters.origin_type as any;
  if (filters.provider) where.provider = filters.provider;
  if (filters.transfer_group_id) where.transfer_group_id = filters.transfer_group_id;

  const dateField = (filters.date_field || 'transaction_date') as string;
  if (filters.date_from || filters.date_to) {
    const dateWhere: any = {};
    if (filters.date_from) dateWhere.gte = filters.date_from;
    if (filters.date_to) dateWhere.lte = filters.date_to;
    (where as any)[dateField] = dateWhere;
  }

  if (filters.search) {
    const term = filters.search.trim();
    if (term) {
      where.OR = [
        { description: { contains: term, mode: 'insensitive' } },
        { memo: { contains: term, mode: 'insensitive' } },
        { external_reference: { contains: term, mode: 'insensitive' } },
      ];
    }
  }

  return where;
}

// ── Main query ───────────────────────────────────────────────────────────────

const DASHBOARD_SELECT = {
  id: true,
  direction: true,
  transaction_type: true,
  status: true,
  net_amount_cents: true,
  gross_amount_cents: true,
  due_date: true,
  account_id: true,
  category_id: true,
  cost_center_id: true,
  account: { select: { id: true, code: true, name: true } },
  category: { select: { id: true, code: true, name: true, dre_group: true } },
  cost_center: { select: { id: true, code: true, name: true } },
};

const DASHBOARD_MAX_ROWS = 50000; // Safety limit for aggregation

export async function queryDashboardSummary(filters: DashboardFilters): Promise<DashboardResponse> {
  const where = buildWhereClause(filters);

  const rows = await prisma.financial_transactions.findMany({
    where,
    select: DASHBOARD_SELECT,
    take: DASHBOARD_MAX_ROWS,
  });

  const today = todayCivilDate();

  // ── Compute summary indicators ─────────────────────────────────────────

  let realizedRevenue = BigInt(0);
  let realizedExpense = BigInt(0);
  let forecastRevenue = BigInt(0);
  let forecastExpense = BigInt(0);
  let pendingTotal = BigInt(0);
  let overdueTotal = BigInt(0);
  let overdueCount = 0;
  let canceledTotal = BigInt(0);
  let transferTotal = BigInt(0);

  // Groupings
  const dreMap = new Map<string, { revenue: bigint; expense: bigint; count: number }>();
  const catMap = new Map<string, { code: string | null; name: string; total: bigint; count: number }>();
  const accMap = new Map<string, { code: string; name: string; totalIn: bigint; totalOut: bigint; count: number }>();
  const ccMap = new Map<string, { code: string | null; name: string; total: bigint; count: number }>();

  for (const row of rows) {
    const net = typeof row.net_amount_cents === 'bigint'
      ? row.net_amount_cents
      : BigInt(String(row.net_amount_cents));
    const isTransfer = row.transaction_type === 'TRANSFER';
    const isReversal = row.transaction_type === 'REVERSAL';
    const isIn = row.direction === 'IN';
    const isOut = row.direction === 'OUT';

    // Skip reversals from main indicators (they compensate original which is REVERSED)
    // Skip transfers from revenue/expense

    if (REALIZED_STATUSES.includes(row.status)) {
      if (!isTransfer && !isReversal) {
        if (isIn) realizedRevenue += net;
        if (isOut) realizedExpense += net;
      }
      if (isTransfer) transferTotal += net;
    }

    if (FORECAST_STATUSES.includes(row.status)) {
      if (!isTransfer && !isReversal) {
        if (isIn) forecastRevenue += net;
        if (isOut) forecastExpense += net;
      }
      pendingTotal += net;

      // Overdue check
      if (row.due_date) {
        const dueDate = row.due_date instanceof Date ? row.due_date : new Date(String(row.due_date));
        if (dueDate < today) {
          overdueTotal += net;
          overdueCount++;
        }
      }
    }

    if (row.status === 'CANCELED') {
      canceledTotal += net;
    }

    // ── DRE grouping (only realized non-transfer non-reversal) ──
    if (REALIZED_STATUSES.includes(row.status) && !isTransfer && !isReversal) {
      const dreGroup = (row.category as any)?.dre_group || 'NÃO CLASSIFICADO';
      const existing = dreMap.get(dreGroup) || { revenue: BigInt(0), expense: BigInt(0), count: 0 };
      if (isIn) existing.revenue += net;
      if (isOut) existing.expense += net;
      existing.count++;
      dreMap.set(dreGroup, existing);
    }

    // ── Category grouping (realized, not canceled/reversed) ──
    if (!EXCLUDED_STATUSES.includes(row.status) && !isReversal) {
      const catId = row.category_id || '__none__';
      const catName = (row.category as any)?.name || 'Sem categoria';
      const catCode = (row.category as any)?.code || null;
      const existing = catMap.get(catId) || { code: catCode, name: catName, total: BigInt(0), count: 0 };
      existing.total += isOut ? net : (isIn ? net : BigInt(0));
      existing.count++;
      catMap.set(catId, existing);
    }

    // ── Account grouping ──
    if (!EXCLUDED_STATUSES.includes(row.status)) {
      const accId = row.account_id;
      const accName = (row.account as any)?.name || 'Conta desconhecida';
      const accCode = (row.account as any)?.code || '';
      const existing = accMap.get(accId) || { code: accCode, name: accName, totalIn: BigInt(0), totalOut: BigInt(0), count: 0 };
      if (isIn) existing.totalIn += net;
      if (isOut) existing.totalOut += net;
      existing.count++;
      accMap.set(accId, existing);
    }

    // ── Cost center grouping ──
    if (!EXCLUDED_STATUSES.includes(row.status) && !isReversal) {
      const ccId = row.cost_center_id || '__none__';
      const ccName = (row.cost_center as any)?.name || 'Sem centro de custo';
      const ccCode = (row.cost_center as any)?.code || null;
      const existing = ccMap.get(ccId) || { code: ccCode, name: ccName, total: BigInt(0), count: 0 };
      existing.total += net;
      existing.count++;
      ccMap.set(ccId, existing);
    }
  }

  // ── Build response ─────────────────────────────────────────────────────

  const summary: DashboardSummary = {
    realized_revenue_cents: bigStr(realizedRevenue),
    realized_expense_cents: bigStr(realizedExpense),
    realized_result_cents: bigStr(realizedRevenue - realizedExpense),
    forecast_revenue_cents: bigStr(forecastRevenue),
    forecast_expense_cents: bigStr(forecastExpense),
    forecast_result_cents: bigStr(forecastRevenue - forecastExpense),
    pending_total_cents: bigStr(pendingTotal),
    overdue_total_cents: bigStr(overdueTotal),
    overdue_count: overdueCount,
    canceled_total_cents: bigStr(canceledTotal),
    transfer_total_cents: bigStr(transferTotal),
    total_transactions: rows.length,
  };

  // DRE groups sorted by name
  const dre_groups: DreGroupItem[] = Array.from(dreMap.entries())
    .map(([group, data]) => ({
      dre_group: group,
      revenue_cents: bigStr(data.revenue),
      expense_cents: bigStr(data.expense),
      result_cents: bigStr(data.revenue - data.expense),
      transaction_count: data.count,
    }))
    .sort((a, b) => a.dre_group.localeCompare(b.dre_group, 'pt-BR'));

  // Top 20 categories by absolute total
  const by_category: CategoryGroupItem[] = Array.from(catMap.entries())
    .map(([id, data]) => ({
      category_id: id === '__none__' ? null : id,
      category_code: data.code,
      category_name: data.name,
      total_cents: bigStr(data.total),
      transaction_count: data.count,
    }))
    .sort((a, b) => {
      const absA = BigInt(a.total_cents) < BigInt(0) ? -BigInt(a.total_cents) : BigInt(a.total_cents);
      const absB = BigInt(b.total_cents) < BigInt(0) ? -BigInt(b.total_cents) : BigInt(b.total_cents);
      if (absB > absA) return 1;
      if (absB < absA) return -1;
      return 0;
    })
    .slice(0, 20);

  // Top 10 accounts
  const by_account: AccountGroupItem[] = Array.from(accMap.entries())
    .map(([id, data]) => ({
      account_id: id,
      account_code: data.code,
      account_name: data.name,
      total_in_cents: bigStr(data.totalIn),
      total_out_cents: bigStr(data.totalOut),
      transaction_count: data.count,
    }))
    .sort((a, b) => b.transaction_count - a.transaction_count)
    .slice(0, 10);

  // Top 10 cost centers
  const by_cost_center: CostCenterGroupItem[] = Array.from(ccMap.entries())
    .map(([id, data]) => ({
      cost_center_id: id === '__none__' ? null : id,
      cost_center_code: data.code,
      cost_center_name: data.name,
      total_cents: bigStr(data.total),
      transaction_count: data.count,
    }))
    .sort((a, b) => b.transaction_count - a.transaction_count)
    .slice(0, 10);

  return { summary, dre_groups, by_category, by_account, by_cost_center };
}
