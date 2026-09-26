import { describe, expect, it } from 'vitest';
import {
  parseNormalizedStatement, previewStatement, StatementPreviewError,
  type LedgerCandidate,
} from '../src/services/finance/reconciliation-preview.service';

const head = 'external_id,occurred_on,direction,amount_cents,currency,external_reference';
const line = (id = 'sumup_001', ref = 'wallet_v2:001', amount = '2500', direction = 'IN') =>
  [id, '2026-09-26', direction, amount, 'BRL', ref].join(',');
const csv = (...lines: string[]) => [head, ...lines].join('\n');
const candidate = (changes: Partial<LedgerCandidate> = {}): LedgerCandidate => ({
  id: 'ledger-001', external_reference: 'wallet_v2:001', direction: 'IN',
  net_amount_cents: 2500n, status: 'POSTED', ...changes,
});
const codes = (...lines: string[]) =>
  previewStatement(csv(...lines), parseNormalizedStatement(csv(...lines)), [candidate()])
    .rows.map((row) => row.status);

describe('finance reconciliation normalized preview — no posting', () => {
  it('accepts ISO day, BRL cent integers and quoted normalized fields', () => {
    const rows = parseNormalizedStatement('\uFEFF' + csv('"sumup_001",2026-09-26,IN,2500,BRL,"wallet_v2:001"') + '\r\n');
    expect(rows).toMatchObject([{ line: 2, externalId: 'sumup_001',
      occurredOn: '2026-09-26', direction: 'IN', externalReference: 'wallet_v2:001' }]);
    expect(rows[0].amountCents).toBe(2500n);
  });

  it('marks exact identity as candidate needing review, never automatically reconciled', () => {
    const s = csv(line());
    const r = previewStatement(s, parseNormalizedStatement(s), [candidate()]);
    expect(r.mode).toBe('PREVIEW_ONLY');
    expect(r.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(r.rows).toMatchObject([{ status: 'CANDIDATE_FOR_REVIEW', candidateTransactionId: 'ledger-001' }]);
  });

  it('distinguishes unmatched, missing and amount/direction mismatches', () => {
    expect(codes(line('sumup_002', 'other_ref'))).toEqual(['UNMATCHED']);
    expect(codes(line('sumup_002', ''))).toEqual(['MISSING_REFERENCE']);
    expect(codes(line('sumup_002', 'wallet_v2:001', '2501'))).toEqual(['AMOUNT_MISMATCH']);
    expect(codes(line('sumup_002', 'wallet_v2:001', '2500', 'OUT'))).toEqual(['DIRECTION_MISMATCH']);
  });

  it('fails closed on duplicate source IDs and references within the same file', () => {
    expect(codes(line('sumup_001'), line('sumup_001'))).toEqual(
      ['DUPLICATE_SOURCE_ID', 'DUPLICATE_SOURCE_ID']);
    expect(codes(line('sumup_001'), line('sumup_002'))).toEqual(
      ['DUPLICATE_REFERENCE', 'DUPLICATE_REFERENCE']);
  });

  it('rejects multiple ledger records even if both have the same amount', () => {
    const s = csv(line());
    const r = previewStatement(s, parseNormalizedStatement(s), [
      candidate(), candidate({ id: 'ledger-002' }),
    ]);
    expect(r.rows[0].status).toBe('AMBIGUOUS_LEDGER_REFERENCE');
    expect(r.rows[0].candidateTransactionId).toBeNull();
  });

  it('does not match an already reconciled or closed ledger entry as new', () => {
    for (const status of ['RECONCILED', 'CLOSED']) {
      const s = csv(line());
      expect(previewStatement(s, parseNormalizedStatement(s), [candidate({ status })]).rows[0].status)
        .toBe('ALREADY_RECONCILED');
    }
  });

  it.each([
    [csv(line('=SUM(1)')),'CSV_INVALID_ROW_2'],
    [csv(line('sumup_001', 'wallet_v2:001', '25.00')),'CSV_INVALID_ROW_2'],
    [csv(line('sumup_001', 'wallet_v2:001', '0')),'CSV_INVALID_ROW_2'],
    [csv(line('sumup_001', 'wallet_v2:001', '9007199254740992')),'CSV_INVALID_ROW_2'],
    [csv(line().replace('BRL', 'USD')),'CSV_INVALID_ROW_2'],
    [csv(line().replace('2026-09-26', '2026-02-30')),'CSV_INVALID_ROW_2'],
    [csv(line('sumup_001', '=HYPERLINK(1)')),'CSV_INVALID_ROW_2'],
    [csv(line().replace(',IN,', ',CREDIT,')),'CSV_INVALID_ROW_2'],
    ['date,amount\n2026-09-26,2500','CSV_UNSUPPORTED_HEADER'],
    [csv('"sumup_001,2026-09-26,IN,2500,BRL,wallet_v2:001'),'CSV_MALFORMED'],
    [csv(line()) + '\n\n','CSV_ROW_LIMIT_OR_EMPTY'],
    [csv(line()) + '\0','CSV_INVALID_SIZE_OR_ENCODING'],
  ])('rejects malformed, ambiguous or unsafe input', (input, expected) => {
    expect(() => parseNormalizedStatement(input)).toThrowError(StatementPreviewError);
    try { parseNormalizedStatement(input); } catch (e) {
      expect((e as StatementPreviewError).code).toBe(expected);
    }
  });

  it('blocks over 100 rows and over 64 KiB', () => {
    const tooManyRows = csv(...Array.from({ length: 101 }, (_, i) => line('entry_' + String(i))));
    expect(() => parseNormalizedStatement(tooManyRows)).toThrow('CSV_ROW_LIMIT_OR_EMPTY');
    expect(() => parseNormalizedStatement('A'.repeat(65_537))).toThrow('CSV_INVALID_SIZE_OR_ENCODING');
  });

  it('does not include the raw CSV in its response', () => {
    const s = csv(line());
    const r = previewStatement(s, parseNormalizedStatement(s), []);
    expect(JSON.stringify(r)).not.toContain('external_id,occurred_on');
    expect(r.summary).toMatchObject({ total: 1, counts: { UNMATCHED: 1 } });
  });
});
