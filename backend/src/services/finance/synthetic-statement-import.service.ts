/**
 * PR #404: test-only, in-memory import of explicitly synthetic statement events.
 * No production route, provider API, database write, ledger mutation or payment.
 *
 * This is a controlled simulator, NOT an adapter for actual SumUp/Asaas exports.
 */
import { createHash } from 'node:crypto';
import {
  type LedgerCandidate, type StatementProvider, type PreviewStatus,
  parseNormalizedStatement, previewStatement, StatementPreviewError,
} from './reconciliation-preview.service';

const HEADER = 'event_id,occurred_on,event_type,direction,amount_cents,currency,external_reference';
const EVENT_TYPES = ['CREDIT', 'PAYOUT', 'FEE', 'REFUND', 'REVERSAL'] as const;
type SyntheticEventType = typeof EVENT_TYPES[number];

export interface SyntheticContext {
  provider: StatementProvider;
  accountId: string;
  legalEntityId: string;
}

export interface SyntheticImportReceipt extends SyntheticContext {
  eventId: string;
  fingerprint: string;
}

interface SyntheticRow {
  externalId: string;
  eventType: SyntheticEventType;
  occurredOn: string;
  direction: 'IN' | 'OUT';
  amountCents: bigint;
  externalReference: string | null;
}

export type SyntheticResultStatus = PreviewStatus |
  'DUPLICATE_PREVIOUS_IMPORT' | 'CONFLICTING_PREVIOUS_IMPORT';

const MAX_BYTES = 65_536;
const MAX_ROWS = 100;
const ID_RE = /^[a-z0-9][a-z0-9_-]{2,99}$/i;
const REF_RE = /^[a-zA-Z0-9:_-]{1,120}$/;
const AMOUNT_RE = /^[1-9][0-9]{0,15}$/;

function digest(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function identity(ctx: SyntheticContext, id: string): string {
  return [ctx.provider, ctx.legalEntityId, ctx.accountId, id].join('|');
}

function fingerprint(row: SyntheticRow): string {
  return digest([
    row.externalId, row.occurredOn, row.eventType, row.direction,
    row.amountCents.toString(), row.externalReference ?? '',
  ].join('|'));
}

function assertSyntheticMode(): void {
  // Intentionally fail closed even if called by future production code.
  if (process.env.NODE_ENV !== 'test') {
    throw new StatementPreviewError('SYNTHETIC_IMPORT_TEST_ONLY');
  }
}

export function parseSyntheticStatement(csv: string): SyntheticRow[] {
  assertSyntheticMode();
  if (typeof csv !== 'string' || Buffer.byteLength(csv, 'utf8') > MAX_BYTES ||
      csv.includes('\0') || csv.includes('"') || csv.includes('\uFEFF') ||
      (csv.includes('\r') && !csv.includes('\r\n'))) {
    throw new StatementPreviewError('SYNTHETIC_CSV_UNSAFE');
  }
  const lines = csv.split(/\r\n|\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  if (lines[0] !== HEADER || lines.length > MAX_ROWS + 1 ||
      lines.some((line) => line.includes('\r') || line.length > 512)) {
    throw new StatementPreviewError('SYNTHETIC_CSV_HEADER_OR_LIMIT');
  }
  if (lines.length === 1) return []; // A legitimate zero-movement test month.

  const rows = lines.slice(1).map((line, index) => {
    const cells = line.split(',');
    if (cells.length !== 7) throw new StatementPreviewError('SYNTHETIC_CSV_ROW_' + (index + 2));
    const [id, date, kind, direction, amount, currency, reference] = cells;
    if (!ID_RE.test(id) || !EVENT_TYPES.some((value) => kind === value) ||
        (direction !== 'IN' && direction !== 'OUT') ||
        !AMOUNT_RE.test(amount) || BigInt(amount) > BigInt(Number.MAX_SAFE_INTEGER) ||
        currency !== 'BRL' || (reference !== '' && !REF_RE.test(reference))) {
      throw new StatementPreviewError('SYNTHETIC_CSV_ROW_' + (index + 2));
    }
    if ((kind === 'CREDIT' && direction !== 'IN') ||
        (kind === 'PAYOUT' && direction !== 'OUT') ||
        (kind === 'FEE' && direction !== 'OUT')) {
      throw new StatementPreviewError('SYNTHETIC_DIRECTION_CONFLICT_' + (index + 2));
    }
    return {
      externalId: id, occurredOn: date, eventType: kind as SyntheticEventType,
      direction: direction as 'IN' | 'OUT',
      amountCents: BigInt(amount), externalReference: reference || null,
    };
  });

  // Reuse PR #403 strict calendar-date, amount and normalized-reference parser.
  parseNormalizedStatement(normalizeSyntheticStatement(rows));
  return rows;
}

function normalizeSyntheticStatement(rows: SyntheticRow[]): string {
  return ['external_id,occurred_on,direction,amount_cents,currency,external_reference',
    ...rows.map((r) => [
      r.externalId, r.occurredOn, r.direction, r.amountCents.toString(),
      'BRL', r.externalReference || '',
    ].join(',')),
  ].join('\n');
}

export function buildSyntheticImportPreview(
  context: SyntheticContext,
  csv: string,
  ledger: LedgerCandidate[],
  priorReceipts: SyntheticImportReceipt[] = [],
) {
  assertSyntheticMode();
  if (!['SUMUP', 'ASAAS'].includes(context.provider) ||
      !context.accountId || !context.legalEntityId ||
      context.accountId.includes('|') || context.legalEntityId.includes('|') ||
      ledger.length > 100 || priorReceipts.length > 1000) {
    throw new StatementPreviewError('SYNTHETIC_SCOPE_INVALID');
  }
  const rows = parseSyntheticStatement(csv);
  const simulatedSourceSha256 = digest(csv);
  if (rows.length === 0) {
    return {
      mode: 'SYNTHETIC_DRY_RUN' as const, context,
      sourceSha256: simulatedSourceSha256,
      rows: [],
      receipts: [] as SyntheticImportReceipt[],
      summary: { total: 0, reviewRequired: 0, candidateCount: 0, emptyMonth: true },
    };
  }
  const base = previewStatement(
    normalizeSyntheticStatement(rows),
    parseNormalizedStatement(normalizeSyntheticStatement(rows)),
    ledger,
  );
  const known = new Map<string, Set<string>>();
  for (const old of priorReceipts) {
    const key = identity(old, old.eventId);
    const values = known.get(key) || new Set<string>();
    values.add(old.fingerprint);
    known.set(key, values);
  }
  const receipts: SyntheticImportReceipt[] = [];
  const inspected = rows.map((row, index) => {
    const id = identity(context, row.externalId);
    const fp = fingerprint(row);
    const stored = known.get(id);
    let status: SyntheticResultStatus = base.rows[index].status;
    if (stored?.size) {
      status = stored.size === 1 && stored.has(fp)
        ? 'DUPLICATE_PREVIOUS_IMPORT'
        : 'CONFLICTING_PREVIOUS_IMPORT';
    }
    // Output is a candidate for a future staging store, not a committed receipt.
    receipts.push({ ...context, eventId: row.externalId, fingerprint: fp });
    return {
      eventId: row.externalId,
      eventType: row.eventType,
      occurredOn: row.occurredOn,
      direction: row.direction,
      amountCents: row.amountCents.toString(),
      externalReference: row.externalReference,
      status,
      candidateTransactionId: status === 'CANDIDATE_FOR_REVIEW'
        ? base.rows[index].candidateTransactionId : null,
    };
  });
  return {
    mode: 'SYNTHETIC_DRY_RUN' as const, context,
    sourceSha256: simulatedSourceSha256,
    rows: inspected,
    receipts,
    summary: {
      total: inspected.length,
      reviewRequired: inspected.filter((r) => r.status !== 'CANDIDATE_FOR_REVIEW').length,
      candidateCount: inspected.filter((r) => r.status === 'CANDIDATE_FOR_REVIEW').length,
      emptyMonth: false,
    },
  };
}
