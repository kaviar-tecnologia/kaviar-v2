/**
 * Finance Workspace — read models for Accounts Receivable and Treasury.
 *
 * Design principles:
 * - Reuses financial_transactions as the source of truth.
 * - No schema changes and no duplicated ledger.
 * - BigInt never crosses the HTTP boundary; amounts are serialized as strings.
 * - Treasury "current" balance uses only final/realized transaction statuses.
 * - Treasury "projected" balance adds DRAFT/PENDING movements.
 */
import { prisma } from '../../lib/prisma';

const OPEN_STATUSES = ['DRAFT', 'PENDING'] as const;
const REALIZED_STATUSES = ['POSTED', 'RECONCILED', 'CLOSED'] as const;

export type ReceivableState =
  | 'ALL'
  | 'OPEN'
  | 'OVERDUE'
  | 'DUE_7'
  | 'DUE_30'
  | 'NO_DUE_DATE'
  | 'SETTLED';

export type ReceivablesQuery = {
  page: number;
  limit: number;
  search?: string;
  state?: ReceivableState;
};

function utcDateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function addUtcDays(value: Date, days: number): Date {
  const d = utcDateOnly(value);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function bigint(value: bigint | number | string | null | undefined): bigint {
  if (value == null) return 0n;
  return typeof value === 'bigint' ? value : BigInt(String(value));
}

export function classifyReceivableDueDate(
  dueDate: Date | null | undefined,
  asOf: Date = new Date(),
): 'NO_DUE_DATE' | 'OVERDUE' | 'DUE_TODAY' | 'DUE_7' | 'DUE_30' | 'FUTURE' {
  if (!dueDate) return 'NO_DUE_DATE';

  const due = utcDateOnly(dueDate).getTime();
  const today = utcDateOnly(asOf).getTime();
  if (due < today) return 'OVERDUE';
  if (due === today) return 'DUE_TODAY';
  if (due <= addUtcDays(asOf, 7).getTime()) return 'DUE_7';
  if (due <= addUtcDays(asOf, 30).getTime()) return 'DUE_30';
  return 'FUTURE';
}

function buildReceivableWhere(query: ReceivablesQuery, asOf: Date) {
  const today = utcDateOnly(asOf);
  const state = query.state || 'OPEN';

  const where: any = {
    transaction_type: 'RECEIVABLE',
    direction: 'IN',
  };

  if (state === 'OPEN') {
    where.status = { in: [...OPEN_STATUSES] };
  } else if (state === 'OVERDUE') {
    where.status = { in: [...OPEN_STATUSES] };
    where.due_date = { lt: today };
  } else if (state === 'DUE_7') {
    where.status = { in: [...OPEN_STATUSES] };
    where.due_date = { gte: today, lte: addUtcDays(asOf, 7) };
  } else if (state === 'DUE_30') {
    where.status = { in: [...OPEN_STATUSES] };
    where.due_date = { gte: today, lte: addUtcDays(asOf, 30) };
  } else if (state === 'NO_DUE_DATE') {
    where.status = { in: [...OPEN_STATUSES] };
    where.due_date = null;
  } else if (state === 'SETTLED') {
    where.status = { in: [...REALIZED_STATUSES] };
  }

  const term = query.search?.trim();
  if (term) {
    where.OR = [
      { description: { contains: term, mode: 'insensitive' } },
      { memo: { contains: term, mode: 'insensitive' } },
      { external_reference: { contains: term, mode: 'insensitive' } },
      { source_id: { contains: term, mode: 'insensitive' } },
      { origin_id: { contains: term, mode: 'insensitive' } },
    ];
  }

  return where;
}

export async function listFinanceReceivables(
  query: ReceivablesQuery,
  asOf: Date = new Date(),
) {
  const where = buildReceivableWhere(query, asOf);
  const [rows, total] = await Promise.all([
    prisma.financial_transactions.findMany({
      where,
      orderBy: [
        { due_date: { sort: 'asc', nulls: 'last' } },
        { transaction_date: 'desc' },
        { created_at: 'desc' },
      ],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        description: true,
        status: true,
        payment_method: true,
        source_type: true,
        source_id: true,
        external_reference: true,
        transaction_date: true,
        competence_date: true,
        due_date: true,
        settlement_date: true,
        gross_amount_cents: true,
        net_amount_cents: true,
        metadata: true,
        created_at: true,
        updated_at: true,
        account: { select: { id: true, code: true, name: true, type: true } },
        category: { select: { id: true, code: true, name: true, kind: true } },
        cost_center: { select: { id: true, code: true, name: true, type: true } },
      },
    }),
    prisma.financial_transactions.count({ where }),
  ]);

  return {
    data: rows.map((row) => ({
      ...row,
      gross_amount_cents: row.gross_amount_cents.toString(),
      net_amount_cents: row.net_amount_cents.toString(),
      due_state: OPEN_STATUSES.includes(row.status as any)
        ? classifyReceivableDueDate(row.due_date, asOf)
        : 'SETTLED',
    })),
    pagination: {
      page: query.page,
      limit: query.limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    },
  };
}

export async function getFinanceReceivablesSummary(asOf: Date = new Date()) {
  const openRows = await prisma.financial_transactions.findMany({
    where: {
      transaction_type: 'RECEIVABLE',
      direction: 'IN',
      status: { in: [...OPEN_STATUSES] },
    },
    select: {
      net_amount_cents: true,
      due_date: true,
    },
  });

  const settledAggregate = await prisma.financial_transactions.aggregate({
    where: {
      transaction_type: 'RECEIVABLE',
      direction: 'IN',
      status: { in: [...REALIZED_STATUSES] },
    },
    _sum: { net_amount_cents: true },
    _count: { _all: true },
  });

  const summary = {
    open_count: 0,
    open_total_cents: 0n,
    overdue_count: 0,
    overdue_total_cents: 0n,
    due_7_count: 0,
    due_7_total_cents: 0n,
    due_30_count: 0,
    due_30_total_cents: 0n,
    no_due_date_count: 0,
    no_due_date_total_cents: 0n,
  };

  for (const row of openRows) {
    const amount = bigint(row.net_amount_cents);
    const bucket = classifyReceivableDueDate(row.due_date, asOf);

    summary.open_count += 1;
    summary.open_total_cents += amount;

    if (bucket === 'OVERDUE') {
      summary.overdue_count += 1;
      summary.overdue_total_cents += amount;
    }
    if (bucket === 'DUE_TODAY' || bucket === 'DUE_7') {
      summary.due_7_count += 1;
      summary.due_7_total_cents += amount;
    }
    if (bucket === 'DUE_TODAY' || bucket === 'DUE_7' || bucket === 'DUE_30') {
      summary.due_30_count += 1;
      summary.due_30_total_cents += amount;
    }
    if (bucket === 'NO_DUE_DATE') {
      summary.no_due_date_count += 1;
      summary.no_due_date_total_cents += amount;
    }
  }

  return {
    as_of: utcDateOnly(asOf).toISOString().slice(0, 10),
    open_count: summary.open_count,
    open_total_cents: summary.open_total_cents.toString(),
    overdue_count: summary.overdue_count,
    overdue_total_cents: summary.overdue_total_cents.toString(),
    due_7_count: summary.due_7_count,
    due_7_total_cents: summary.due_7_total_cents.toString(),
    due_30_count: summary.due_30_count,
    due_30_total_cents: summary.due_30_total_cents.toString(),
    no_due_date_count: summary.no_due_date_count,
    no_due_date_total_cents: summary.no_due_date_total_cents.toString(),
    settled_count: settledAggregate._count._all,
    settled_total_cents: bigint(settledAggregate._sum.net_amount_cents).toString(),
  };
}

export async function getFinanceTreasurySummary() {
  const accounts = await prisma.financial_accounts.findMany({
    where: {
      is_active: true,
      OR: [
        { is_cash_equivalent: true },
        { type: { in: ['BANK', 'CASH', 'PIX_WALLET'] } },
      ],
    },
    orderBy: [{ is_cash_equivalent: 'desc' }, { name: 'asc' }],
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      institution_name: true,
      currency: true,
      opening_balance_cents: true,
      opening_balance_date: true,
      allows_negative_balance: true,
      is_cash_equivalent: true,
    },
  });

  if (accounts.length === 0) {
    return {
      account_count: 0,
      negative_account_count: 0,
      current_total_cents: '0',
      projected_total_cents: '0',
      pending_in_cents: '0',
      pending_out_cents: '0',
      accounts: [],
    };
  }

  const accountIds = accounts.map((account) => account.id);
  const [realizedGroups, forecastGroups] = await Promise.all([
    prisma.financial_transactions.groupBy({
      by: ['account_id', 'direction'],
      where: {
        account_id: { in: accountIds },
        status: { in: [...REALIZED_STATUSES] },
      },
      _sum: { net_amount_cents: true },
      _count: { _all: true },
    }),
    prisma.financial_transactions.groupBy({
      by: ['account_id', 'direction'],
      where: {
        account_id: { in: accountIds },
        status: { in: [...OPEN_STATUSES] },
      },
      _sum: { net_amount_cents: true },
      _count: { _all: true },
    }),
  ]);

  const realizedMap = new Map<string, { in: bigint; out: bigint; count: number }>();
  const forecastMap = new Map<string, { in: bigint; out: bigint; count: number }>();

  for (const group of realizedGroups) {
    const current = realizedMap.get(group.account_id) || { in: 0n, out: 0n, count: 0 };
    const amount = bigint(group._sum.net_amount_cents);
    if (group.direction === 'IN') current.in += amount;
    else current.out += amount;
    current.count += group._count._all;
    realizedMap.set(group.account_id, current);
  }

  for (const group of forecastGroups) {
    const current = forecastMap.get(group.account_id) || { in: 0n, out: 0n, count: 0 };
    const amount = bigint(group._sum.net_amount_cents);
    if (group.direction === 'IN') current.in += amount;
    else current.out += amount;
    current.count += group._count._all;
    forecastMap.set(group.account_id, current);
  }

  let currentTotal = 0n;
  let projectedTotal = 0n;
  let pendingInTotal = 0n;
  let pendingOutTotal = 0n;
  let negativeCount = 0;

  const rows = accounts.map((account) => {
    const realized = realizedMap.get(account.id) || { in: 0n, out: 0n, count: 0 };
    const forecast = forecastMap.get(account.id) || { in: 0n, out: 0n, count: 0 };
    const opening = bigint(account.opening_balance_cents);
    const currentBalance = opening + realized.in - realized.out;
    const projectedBalance = currentBalance + forecast.in - forecast.out;

    currentTotal += currentBalance;
    projectedTotal += projectedBalance;
    pendingInTotal += forecast.in;
    pendingOutTotal += forecast.out;
    if (currentBalance < 0n) negativeCount += 1;

    return {
      ...account,
      opening_balance_cents: opening.toString(),
      realized_in_cents: realized.in.toString(),
      realized_out_cents: realized.out.toString(),
      current_balance_cents: currentBalance.toString(),
      pending_in_cents: forecast.in.toString(),
      pending_out_cents: forecast.out.toString(),
      projected_balance_cents: projectedBalance.toString(),
      realized_transaction_count: realized.count,
      pending_transaction_count: forecast.count,
      is_negative: currentBalance < 0n,
    };
  });

  return {
    account_count: rows.length,
    negative_account_count: negativeCount,
    current_total_cents: currentTotal.toString(),
    projected_total_cents: projectedTotal.toString(),
    pending_in_cents: pendingInTotal.toString(),
    pending_out_cents: pendingOutTotal.toString(),
    accounts: rows,
  };
}
