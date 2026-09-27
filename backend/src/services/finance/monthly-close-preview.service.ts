/**
 * PR #406: read-only monthly closing PREVIEW. Not a closing/lock, bank balance
 * certification, accountant approval, or declaration of zero revenue.
 *
 * All monetary figures are segregated by source and represent only what is
 * currently recorded. Never add accounting obligations to finance obligations:
 * the same liability may be present in both modules.
 */
import { prisma } from '../../lib/prisma';

type Db = typeof prisma;
type Totals = { count: number; netAmountCents: string };
type TxGroup = {
  status: string;
  transaction_type: string;
  direction: string;
  _count: { _all: number };
  _sum: { net_amount_cents: bigint | null };
};
type ObligationGroup = {
  status: string;
  _count: { _all: number };
  _sum: { net_amount_cents: bigint | null };
};
type AccountantObligationGroup = {
  status: string;
  _count: { _all: number };
  _sum: { amount_cents: number | null };
};

export function monthWindow(year: number, month: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100 ||
      !Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error('INVALID_COMPETENCE');
  }
  return {
    competence: String(year) + '-' + String(month).padStart(2, '0'),
    from: new Date(Date.UTC(year, month - 1, 1)),
    until: new Date(Date.UTC(year, month, 1)),
  };
}

function totals(count: number, cents: bigint | number | null): Totals {
  return { count, netAmountCents: String(cents ?? 0) };
}

const UNFINALIZED = new Set(['DRAFT', 'PENDING', 'BLOCKED']);
const ACCOUNTANT_OPEN = new Set([
  'SENT_TO_COMPANY', 'VIEWED', 'SCHEDULED', 'PAID',
  'PROOF_UPLOADED', 'UNDER_VERIFICATION', 'REJECTED',
]);
const FINANCE_OPEN = new Set([
  'DRAFT', 'PENDING', 'APPROVED', 'READY', 'QUEUED',
  'PROCESSING', 'SENT', 'UNKNOWN', 'FAILED', 'BLOCKED',
]);

export function assembleMonthlyClosePreview(input: {
  legalEntityId: string;
  year: number;
  month: number;
  now: Date;
  accountCount: number;
  txGroups: TxGroup[];
  financeGroups: ObligationGroup[];
  accountantGroups: AccountantObligationGroup[];
  unassignedTransactionCount: number;
  mismatchedAccountTransactionCount: number;
  unallocatedBusinessUnitCount: number;
}) {
  const window = monthWindow(input.year, input.month);
  const periodEnded = input.now.getTime() >= window.until.getTime();
  let postedIncomeCents = 0n;
  let postedIncomeCount = 0;
  let nonFinalTransactionCount = 0;
  let allTransactionCount = 0;
  const txStatusCount: Record<string, number> = {};
  const activeStatuses = new Set(['POSTED', 'RECONCILED', 'CLOSED']);

  for (const group of input.txGroups) {
    allTransactionCount += group._count._all;
    txStatusCount[group.status] = (txStatusCount[group.status] || 0) + group._count._all;
    if (UNFINALIZED.has(group.status)) nonFinalTransactionCount += group._count._all;
    if (activeStatuses.has(group.status) && group.direction === 'IN' &&
        group.transaction_type === 'INCOME') {
      postedIncomeCents += group._sum.net_amount_cents ?? 0n;
      postedIncomeCount += group._count._all;
    }
  }

  const financeObligations = input.financeGroups.map((group) => ({
    status: group.status,
    ...totals(group._count._all, group._sum.net_amount_cents),
  }));
  const accountantObligations = input.accountantGroups.map((group) => ({
    status: group.status,
    ...totals(group._count._all, group._sum.amount_cents),
  }));
  const financeOpenCount = financeObligations.filter((x) =>
    FINANCE_OPEN.has(x.status)).reduce((sum, x) => sum + x.count, 0);
  const accountantOpenCount = accountantObligations.filter((x) =>
    ACCOUNTANT_OPEN.has(x.status)).reduce((sum, x) => sum + x.count, 0);

  const reviewReasons: string[] = [];
  if (!periodEnded) reviewReasons.push('PERIOD_NOT_ENDED');
  if (input.accountCount === 0) reviewReasons.push('NO_ASSIGNED_FINANCIAL_ACCOUNTS');
  if (input.unassignedTransactionCount > 0) reviewReasons.push('UNASSIGNED_LEGAL_ENTITY_TRANSACTIONS');
  if (input.mismatchedAccountTransactionCount > 0) reviewReasons.push('MISMATCHED_ACCOUNT_ENTITY');
  if (input.unallocatedBusinessUnitCount > 0) reviewReasons.push('UNALLOCATED_BUSINESS_UNIT');
  if (nonFinalTransactionCount > 0) reviewReasons.push('NON_FINAL_TRANSACTIONS');
  if (financeOpenCount > 0) reviewReasons.push('FINANCIAL_OBLIGATIONS_REQUIRE_REVIEW');
  if (accountantOpenCount > 0) reviewReasons.push('ACCOUNTANT_OBLIGATIONS_REQUIRE_REVIEW');
  // This phase does not consume authentic statements or accountant attestations.
  // Even an apparently empty ledger NEVER permits declaring verified zero revenue.
  reviewReasons.push('EXTERNAL_STATEMENT_AND_ACCOUNTANT_EVIDENCE_MISSING');

  return {
    mode: 'PREVIEW_ONLY' as const,
    closingStatus: 'NOT_CLOSED' as const,
    ledgerEvidence: postedIncomeCount === 0
      ? 'NO_POSTED_INCOME_IN_SCOPED_LEDGER' as const
      : 'POSTED_INCOME_IN_SCOPED_LEDGER' as const,
    zeroRevenueVerified: false as const,
    legalEntityId: input.legalEntityId,
    competence: window.competence,
    periodEnded,
    financialAccountCount: input.accountCount,
    ledger: {
      transactionCount: allTransactionCount,
      transactionStatusCounts: txStatusCount,
      postedIncomeEntries: totals(postedIncomeCount, postedIncomeCents),
      nonFinalTransactionCount,
      unassignedTransactionCount: input.unassignedTransactionCount,
      mismatchedAccountTransactionCount: input.mismatchedAccountTransactionCount,
      unallocatedBusinessUnitCount: input.unallocatedBusinessUnitCount,
    },
    // Separate sources: NOT combined into one liability or cash total.
    obligations: {
      finance: { byStatus: financeObligations, openCount: financeOpenCount },
      accountantPortal: { byStatus: accountantObligations, openCount: accountantOpenCount },
      sourcesMayOverlap: true as const,
    },
    reviewReasons,
    readyForFinalClosing: false as const,
    externalStatementsVerified: false as const,
  };
}

export async function loadMonthlyClosePreview(
  legalEntityId: string,
  year: number,
  month: number,
  now = new Date(),
  db: Db = prisma,
) {
  const window = monthWindow(year, month);
  const entity = await db.legal_entities.findFirst({
    where: { id: legalEntityId, is_active: true },
    select: { id: true },
  });
  if (!entity) return null;
  const accounts = await db.financial_accounts.findMany({
    where: { legal_entity_id: legalEntityId },
    select: { id: true },
  });
  const accountIds = accounts.map((account) => account.id);
  const dateFilter = { gte: window.from, lt: window.until };
  const transactionWhere = {
    legal_entity_id: legalEntityId,
    competence_date: dateFilter,
  };
  const [
    txGroups, financeGroups, accountantGroups,
    unassignedTransactionCount, mismatchedAccountTransactionCount,
    unallocatedBusinessUnitCount,
  ] = await Promise.all([
    db.financial_transactions.groupBy({
      by: ['status', 'transaction_type', 'direction'],
      where: transactionWhere,
      _count: { _all: true }, _sum: { net_amount_cents: true },
    }),
    db.financial_obligations.groupBy({
      by: ['status'],
      where: { legal_entity_id: legalEntityId, competence_date: dateFilter },
      _count: { _all: true }, _sum: { net_amount_cents: true },
    }),
    db.accounting_payment_obligations.groupBy({
      by: ['status'],
      where: {
        legal_entity_id: legalEntityId,
        competence_year: year,
        competence_month: month,
      },
      _count: { _all: true }, _sum: { amount_cents: true },
    }),
    accountIds.length ? db.financial_transactions.count({
      where: {
        account_id: { in: accountIds },
        legal_entity_id: null,
        competence_date: dateFilter,
      },
    }) : Promise.resolve(0),
    db.financial_transactions.count({
      where: {
        ...transactionWhere,
        account_id: { notIn: accountIds },
      },
    }),
    db.financial_transactions.count({
      where: { ...transactionWhere, business_unit_id: null },
    }),
  ]);
  return assembleMonthlyClosePreview({
    legalEntityId, year, month, now,
    accountCount: accounts.length,
    txGroups, financeGroups, accountantGroups,
    unassignedTransactionCount, mismatchedAccountTransactionCount,
    unallocatedBusinessUnitCount,
  });
}
