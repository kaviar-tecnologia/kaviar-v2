import { describe, expect, it } from 'vitest';
import {
  assembleMonthlyClosePreview, monthWindow, periodEndedInSaoPaulo,
} from '../src/services/finance/monthly-close-preview.service';

const base = () => ({
  legalEntityId: 'synthetic-company',
  year: 2026, month: 8,
  now: new Date('2026-09-01T03:00:00.000Z'),
  accountCount: 1,
  txGroups: [] as any[],
  financeGroups: [] as any[],
  accountantGroups: [] as any[],
  unassignedTransactionCount: 0,
  mismatchedAccountTransactionCount: 0,
  unallocatedBusinessUnitCount: 0,
});

describe('Monthly closing preview: truthful zero-movement evidence', () => {
  it('handles calendar rollover, leap month and invalid competence', () => {
    expect(monthWindow(2026, 12).until.toISOString()).toBe('2027-01-01T00:00:00.000Z');
    expect(monthWindow(2024, 2).until.toISOString()).toBe('2024-03-01T00:00:00.000Z');
    expect(() => monthWindow(2026, 13)).toThrow('INVALID_COMPETENCE');
    expect(() => monthWindow(2026.2, 2)).toThrow('INVALID_COMPETENCE');
  });

  it('waits until Sao Paulo midnight, not UTC midnight, before ending August', () => {
    expect(periodEndedInSaoPaulo(2026, 8, new Date('2026-09-01T00:00:00.000Z')))
      .toBe(false); // 31/08 at 21h in Sao Paulo
    expect(periodEndedInSaoPaulo(2026, 8, new Date('2026-09-01T02:59:59.999Z')))
      .toBe(false);
    expect(periodEndedInSaoPaulo(2026, 8, new Date('2026-09-01T03:00:00.000Z')))
      .toBe(true);
  });

  it('reports no posted income, NOT verified zero revenue and NOT closed', () => {
    const r = assembleMonthlyClosePreview(base());
    expect(r).toMatchObject({
      mode: 'PREVIEW_ONLY', closingStatus: 'NOT_CLOSED',
      ledgerEvidence: 'NO_POSTED_INCOME_IN_SCOPED_LEDGER',
      zeroRevenueVerified: false,
      readyForFinalClosing: false,
      externalStatementsVerified: false,
      periodEnded: true,
      ledger: { transactionCount: 0, postedIncomeEntries: { count: 0, netAmountCents: '0' } },
      obligations: {
        finance: { byStatus: [], openCount: 0 },
        accountantPortal: { byStatus: [], openCount: 0 },
        sourcesMayOverlap: true,
      },
    });
    expect(r.reviewReasons).toContain('EXTERNAL_STATEMENT_AND_ACCOUNTANT_EVIDENCE_MISSING');
  });

  it('a month before its end cannot be closed or certified', () => {
    const r = assembleMonthlyClosePreview({
      ...base(), year: 2026, month: 9,
      now: new Date('2026-09-26T00:00:00.000Z'),
    });
    expect(r.periodEnded).toBe(false);
    expect(r.reviewReasons).toContain('PERIOD_NOT_ENDED');
  });

  it('account opening cash is not invented as income or conflated with balance', () => {
    const r = assembleMonthlyClosePreview({ ...base(), accountCount: 2 });
    expect(r.ledger.postedIncomeEntries.netAmountCents).toBe('0');
    expect(JSON.stringify(r)).not.toContain('cashBalance');
  });

  it('keeps payables from the finance and accountant sources separate', () => {
    const r = assembleMonthlyClosePreview({
      ...base(),
      financeGroups: [
        { status: 'PENDING', _count: { _all: 1 }, _sum: { net_amount_cents: 10000n } },
      ],
      accountantGroups: [
        { status: 'SENT_TO_COMPANY', _count: { _all: 1 }, _sum: { amount_cents: 10000 } },
      ],
    });
    expect(r.obligations).toMatchObject({
      finance: { openCount: 1, byStatus: [{ netAmountCents: '10000' }] },
      accountantPortal: { openCount: 1, byStatus: [{ netAmountCents: '10000' }] },
      sourcesMayOverlap: true,
    });
    expect(r.reviewReasons).toContain('FINANCIAL_OBLIGATIONS_REQUIRE_REVIEW');
    expect(r.reviewReasons).toContain('ACCOUNTANT_OBLIGATIONS_REQUIRE_REVIEW');
    expect(JSON.stringify(r)).not.toContain('combinedObligationTotal');
  });

  it('separates draft from posted and never counts a pending INCOME as earned', () => {
    const r = assembleMonthlyClosePreview({
      ...base(),
      txGroups: [
        { status: 'POSTED', transaction_type: 'INCOME', direction: 'IN',
          _count: { _all: 1 }, _sum: { net_amount_cents: 1500n } },
        { status: 'PENDING', transaction_type: 'INCOME', direction: 'IN',
          _count: { _all: 1 }, _sum: { net_amount_cents: 100000n } },
        { status: 'POSTED', transaction_type: 'EXPENSE', direction: 'OUT',
          _count: { _all: 1 }, _sum: { net_amount_cents: 700n } },
      ],
    });
    expect(r.ledger.postedIncomeEntries).toEqual({ count: 1, netAmountCents: '1500' });
    expect(r.ledger.nonFinalTransactionCount).toBe(1);
    expect(r.ledger.transactionCount).toBe(3);
    expect(r.ledgerEvidence).toBe('POSTED_INCOME_IN_SCOPED_LEDGER');
    expect(r.reviewReasons).toContain('NON_FINAL_TRANSACTIONS');
  });

  it('flags incomplete legal-entity and business-unit attribution', () => {
    const r = assembleMonthlyClosePreview({
      ...base(), accountCount: 0, unassignedTransactionCount: 2,
      mismatchedAccountTransactionCount: 1, unallocatedBusinessUnitCount: 3,
    });
    for (const reason of [
      'NO_ASSIGNED_FINANCIAL_ACCOUNTS',
      'UNASSIGNED_LEGAL_ENTITY_TRANSACTIONS',
      'MISMATCHED_ACCOUNT_ENTITY',
      'UNALLOCATED_BUSINESS_UNIT',
    ]) expect(r.reviewReasons).toContain(reason);
    expect(r.readyForFinalClosing).toBe(false);
  });
});
