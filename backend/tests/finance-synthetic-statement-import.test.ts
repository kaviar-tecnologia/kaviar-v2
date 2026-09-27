import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseSyntheticStatement, buildSyntheticImportPreview,
} from '../src/services/finance/synthetic-statement-import.service';
import type { LedgerCandidate } from '../src/services/finance/reconciliation-preview.service';

const fixture = (name: string) => readFileSync(
  resolve(process.cwd(), 'tests/fixtures/finance', name), 'utf8',
);
const sumup = fixture('synthetic-sumup-2026-09.csv');
const asaas = fixture('synthetic-asaas-2026-09.csv');
const empty = fixture('synthetic-empty-month.csv');
const sumupContext = {
  provider: 'SUMUP' as const, accountId: 'synthetic-account-su', legalEntityId: 'synthetic-entity-a',
};
const asaasContext = {
  provider: 'ASAAS' as const, accountId: 'synthetic-account-as', legalEntityId: 'synthetic-entity-a',
};
const candidate = (
  id: string, external_reference: string, direction: 'IN' | 'OUT', amount: number,
  status = 'POSTED',
): LedgerCandidate => ({
  id, external_reference, direction, net_amount_cents: BigInt(amount), status,
});
const sumupLedger: LedgerCandidate[] = [
  candidate('su-ledger-credit', 'sim:su:credit:001', 'IN', 10000),
  candidate('su-ledger-fee', 'sim:su:fee:001', 'OUT', 300),
  candidate('su-ledger-wrong', 'sim:su:credit:002', 'IN', 6000),
];
const asaasLedger: LedgerCandidate[] = [
  candidate('as-ledger-payout', 'sim:as:payout:001', 'OUT', 7000),
  candidate('as-ledger-fee', 'sim:as:fee:001', 'OUT', 150),
];
const header = 'event_id,occurred_on,event_type,direction,amount_cents,currency,external_reference';
const one = 'su_credit_001,2026-09-26,CREDIT,IN,10000,BRL,sim:su:credit:001';

beforeEach(() => vi.stubEnv('NODE_ENV', 'test'));
afterEach(() => vi.unstubAllEnvs());

describe('PR #404 synthetic import and reconciliation (test-only)', () => {
  it('imports SumUp scenario with independent credit, fee, refund and value mismatch', () => {
    const r = buildSyntheticImportPreview(sumupContext, sumup, sumupLedger);
    expect(r.mode).toBe('SYNTHETIC_DRY_RUN');
    expect(r.summary).toEqual({ total: 4, reviewRequired: 2, candidateCount: 2, emptyMonth: false });
    expect(r.rows.map((row) => row.status)).toEqual([
      'CANDIDATE_FOR_REVIEW', 'CANDIDATE_FOR_REVIEW', 'UNMATCHED', 'AMOUNT_MISMATCH',
    ]);
    expect(r.rows[0]).toMatchObject({
      eventType: 'CREDIT', direction: 'IN', amountCents: '10000',
      candidateTransactionId: 'su-ledger-credit',
    });
    expect(r.rows[1]).toMatchObject({
      eventType: 'FEE', direction: 'OUT', amountCents: '300',
      candidateTransactionId: 'su-ledger-fee',
    });
    expect(r.rows[2].candidateTransactionId).toBeNull();
    expect(r.rows[3].candidateTransactionId).toBeNull();
    expect(r.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it('imports Asaas payout, separate fee and tentative reversal without declaring paid', () => {
    const r = buildSyntheticImportPreview(asaasContext, asaas, asaasLedger);
    expect(r.summary).toMatchObject({ total: 3, candidateCount: 2, reviewRequired: 1 });
    expect(r.rows.map((row) => row.status)).toEqual([
      'CANDIDATE_FOR_REVIEW', 'CANDIDATE_FOR_REVIEW', 'UNMATCHED',
    ]);
    expect(r.rows[2]).toMatchObject({ eventType: 'REVERSAL', direction: 'IN' });
    expect(r.mode).not.toBe('RECONCILED');
    expect(JSON.stringify(r)).not.toContain('"paid":true');
  });

  it('accepts a zero-movement month without inventing revenue, cash or a synthetic entry', () => {
    expect(parseSyntheticStatement(empty)).toEqual([]);
    const r = buildSyntheticImportPreview(sumupContext, empty, []);
    expect(r).toMatchObject({
      mode: 'SYNTHETIC_DRY_RUN', rows: [], receipts: [],
      summary: { total: 0, reviewRequired: 0, candidateCount: 0, emptyMonth: true },
    });
  });

  it('detects a repeated identical event in another batch without a second candidate', () => {
    const first = buildSyntheticImportPreview(sumupContext, sumup, sumupLedger);
    const second = buildSyntheticImportPreview(sumupContext, sumup, sumupLedger, first.receipts);
    expect(second.rows.map((r) => r.status)).toEqual([
      'DUPLICATE_PREVIOUS_IMPORT', 'DUPLICATE_PREVIOUS_IMPORT',
      'DUPLICATE_PREVIOUS_IMPORT', 'DUPLICATE_PREVIOUS_IMPORT',
    ]);
    expect(second.rows.every((r) => r.candidateTransactionId === null)).toBe(true);
  });

  it('detects conflict if an already imported external ID is reused with altered cents', () => {
    const first = buildSyntheticImportPreview(sumupContext, sumup, sumupLedger);
    const changed = sumup.replace(
      'su_credit_001,2026-09-26,CREDIT,IN,10000',
      'su_credit_001,2026-09-26,CREDIT,IN,10001',
    );
    const next = buildSyntheticImportPreview(sumupContext, changed, sumupLedger, first.receipts);
    expect(next.rows[0].status).toBe('CONFLICTING_PREVIOUS_IMPORT');
    expect(next.rows[0].candidateTransactionId).toBeNull();
  });

  it('separates source-id dedupe by provider, account and legal entity', () => {
    const first = buildSyntheticImportPreview(sumupContext, sumup, sumupLedger);
    const otherProvider = buildSyntheticImportPreview(
      { ...sumupContext, provider: 'ASAAS' }, sumup, sumupLedger, first.receipts,
    );
    const otherAccount = buildSyntheticImportPreview(
      { ...sumupContext, accountId: 'synthetic-account-other' }, sumup, sumupLedger, first.receipts,
    );
    const otherEntity = buildSyntheticImportPreview(
      { ...sumupContext, legalEntityId: 'synthetic-entity-b' }, sumup, sumupLedger, first.receipts,
    );
    for (const r of [otherProvider, otherAccount, otherEntity]) {
      expect(r.rows[0].status).toBe('CANDIDATE_FOR_REVIEW');
    }
  });

  it('rejects duplicate IDs/refs inside a single file and ambiguous existing ledger refs', () => {
    const duplicated = [header, one, one].join('\n');
    const r = buildSyntheticImportPreview(sumupContext, duplicated, sumupLedger);
    expect(r.rows.map((row) => row.status)).toEqual([
      'DUPLICATE_SOURCE_ID', 'DUPLICATE_SOURCE_ID',
    ]);
    const ambiguous = buildSyntheticImportPreview(sumupContext, [header, one].join('\n'),
      [sumupLedger[0], { ...sumupLedger[0], id: 'second-ledger' }]);
    expect(ambiguous.rows[0].status).toBe('AMBIGUOUS_LEDGER_REFERENCE');
    expect(ambiguous.rows[0].candidateTransactionId).toBeNull();
  });

  it.each([
    ['=HYPERLINK(1),2026-09-26,CREDIT,IN,10000,BRL,sim:su:credit:001'],
    ['su_credit_001,2026-09-26,CREDIT,IN,10.00,BRL,sim:su:credit:001'],
    ['su_credit_001,2026-09-26,CREDIT,IN,0,BRL,sim:su:credit:001'],
    ['su_credit_001,2026-02-30,CREDIT,IN,10000,BRL,sim:su:credit:001'],
    ['su_credit_001,2026-09-26,CREDIT,IN,10000,USD,sim:su:credit:001'],
    ['su_credit_001,2026-09-26,FEE,IN,10000,BRL,sim:su:credit:001'],
    ['su_credit_001,2026-09-26,PAYOUT,IN,10000,BRL,sim:su:credit:001'],
    ['su_credit_001,2026-09-26,CREDIT,IN,10000,BRL,=2+3'],
    ['su_credit_001,2026-09-26,CREDIT,IN,10000,BRL,sim:su:credit:001,extra'],
  ])('rejects invalid synthetic financial data and CSV injection', (line) => {
    expect(() => parseSyntheticStatement([header, line].join('\n'))).toThrow();
  });

  it('rejects more than 100 rows and oversized content', () => {
    expect(() => parseSyntheticStatement([header, ...Array(101).fill(one)].join('\n')))
      .toThrow('SYNTHETIC_CSV_HEADER_OR_LIMIT');
    expect(() => parseSyntheticStatement([header, 'x'.repeat(65_537)].join('\n')))
      .toThrow('SYNTHETIC_CSV_UNSAFE');
  });

  it('is blocked in production even when someone invokes this module directly', () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => parseSyntheticStatement([header, one].join('\n')))
      .toThrow('SYNTHETIC_IMPORT_TEST_ONLY');
    expect(() => buildSyntheticImportPreview(sumupContext, sumup, sumupLedger))
      .toThrow('SYNTHETIC_IMPORT_TEST_ONLY');
  });

  it('does not return raw CSV/PII and never pretends that a receipt was persisted', () => {
    const r = buildSyntheticImportPreview(sumupContext, sumup, sumupLedger);
    expect(JSON.stringify(r)).not.toContain('event_id,occurred_on');
    expect(JSON.stringify(r)).not.toContain('CPF');
    expect(r.receipts).toHaveLength(4);
    expect(r.receipts[0].fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(r)).not.toContain('persisted');
  });
});
