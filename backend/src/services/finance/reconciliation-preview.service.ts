/**
 * PR #403 phase 1: deterministic, non-persistent preview of normalized
 * provider statements. This module never posts a ledger entry or moves money.
 *
 * Deliberately NOT a parser for native SumUp / Asaas exports: their formats
 * must be mapped from verified sample exports in a separate reviewed adapter.
 */
import { createHash } from 'node:crypto';

export type StatementProvider = 'SUMUP' | 'ASAAS';
export type PreviewStatus =
  | 'DUPLICATE_SOURCE_ID' | 'DUPLICATE_REFERENCE' | 'MISSING_REFERENCE'
  | 'UNMATCHED' | 'AMBIGUOUS_LEDGER_REFERENCE' | 'AMOUNT_MISMATCH'
  | 'DIRECTION_MISMATCH' | 'ALREADY_RECONCILED' | 'CANDIDATE_FOR_REVIEW';

export interface NormalizedStatementRow {
  line: number;
  externalId: string;
  occurredOn: string;
  direction: 'IN' | 'OUT';
  amountCents: bigint;
  externalReference: string | null;
}

export interface LedgerCandidate {
  id: string;
  external_reference: string | null;
  direction: 'IN' | 'OUT';
  net_amount_cents: bigint;
  status: string;
}

const HEADER = [
  'external_id', 'occurred_on', 'direction', 'amount_cents',
  'currency', 'external_reference',
] as const;
const MAX_CSV_BYTES = 65_536;
const MAX_ROWS = 100;
const SAFE_ID = /^[A-Za-z0-9_-]{3,100}$/;
const SAFE_REF = /^[A-Za-z0-9:_-]{1,120}$/;
const SAFE_CENTS = /^[1-9][0-9]{0,15}$/;

export class StatementPreviewError extends Error {
  constructor(public readonly code: string) { super(code); }
}

/** RFC-style double-quoted CSV fields; never accepts embedded line breaks. */
function parseLine(line: string): string[] {
  const cols: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') { quoted = false; closed = true; }
      else { field += ch; }
    } else if (closed) {
      if (ch !== ',') throw new StatementPreviewError('CSV_MALFORMED');
      cols.push(field);
      field = '';
      closed = false;
    } else if (ch === ',') {
      cols.push(field);
      field = '';
    } else if (ch === '"' && field === '') {
      quoted = true;
    } else if (ch === '"') {
      throw new StatementPreviewError('CSV_MALFORMED');
    } else {
      field += ch;
    }
    if (cols.length > HEADER.length || field.length > 256) {
      throw new StatementPreviewError('CSV_MALFORMED');
    }
  }
  if (quoted) throw new StatementPreviewError('CSV_MALFORMED');
  cols.push(field);
  return cols;
}

function isValidIsoDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const date = new Date(day + 'T00:00:00.000Z');
  return !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === day;
}

/** All-or-nothing validation; no untrusted or raw CSV content is returned. */
export function parseNormalizedStatement(csv: string): NormalizedStatementRow[] {
  if (typeof csv !== 'string' || Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES ||
      csv.includes('\0') || csv.includes('\uFEFF', 1)) {
    throw new StatementPreviewError('CSV_INVALID_SIZE_OR_ENCODING');
  }
  const normalized = csv.startsWith('\uFEFF') ? csv.slice(1) : csv;
  if (normalized.includes('\r') && !normalized.includes('\r\n')) {
    throw new StatementPreviewError('CSV_MALFORMED');
  }
  const lines = normalized.split(/\r\n|\n/);
  if (lines[lines.length - 1] === '') lines.pop();
  if (lines.length < 2 || lines.length > MAX_ROWS + 1 ||
      lines.some((line) => line === '' || line.includes('\r'))) {
    throw new StatementPreviewError('CSV_ROW_LIMIT_OR_EMPTY');
  }
  const headers = parseLine(lines[0]);
  if (headers.length !== HEADER.length ||
      headers.some((value, index) => value !== HEADER[index])) {
    throw new StatementPreviewError('CSV_UNSUPPORTED_HEADER');
  }

  return lines.slice(1).map((line, index) => {
    const values = parseLine(line);
    if (values.length !== HEADER.length) {
      throw new StatementPreviewError('CSV_MALFORMED');
    }
    const [id, day, direction, amount, currency, reference] = values;
    if (!SAFE_ID.test(id) || !isValidIsoDay(day) ||
        (direction !== 'IN' && direction !== 'OUT') ||
        !SAFE_CENTS.test(amount) || BigInt(amount) > BigInt(Number.MAX_SAFE_INTEGER) ||
        currency !== 'BRL' || (reference !== '' && !SAFE_REF.test(reference))) {
      throw new StatementPreviewError('CSV_INVALID_ROW_' + String(index + 2));
    }
    return {
      line: index + 2,
      externalId: id,
      occurredOn: day,
      direction,
      amountCents: BigInt(amount),
      externalReference: reference || null,
    };
  });
}

export function previewStatement(
  csv: string,
  rows: NormalizedStatementRow[],
  ledger: LedgerCandidate[],
) {
  const idCounts = new Map<string, number>();
  const refCounts = new Map<string, number>();
  const ledgerByRef = new Map<string, LedgerCandidate[]>();
  for (const row of rows) {
    idCounts.set(row.externalId, (idCounts.get(row.externalId) || 0) + 1);
    if (row.externalReference) {
      refCounts.set(row.externalReference, (refCounts.get(row.externalReference) || 0) + 1);
    }
  }
  for (const item of ledger) {
    if (!item.external_reference) continue;
    const matches = ledgerByRef.get(item.external_reference) || [];
    matches.push(item);
    ledgerByRef.set(item.external_reference, matches);
  }

  const result = rows.map((row) => {
    let status: PreviewStatus;
    let candidateTransactionId: string | null = null;
    const matches = row.externalReference
      ? ledgerByRef.get(row.externalReference) || [] : [];

    if ((idCounts.get(row.externalId) || 0) > 1) status = 'DUPLICATE_SOURCE_ID';
    else if (row.externalReference && (refCounts.get(row.externalReference) || 0) > 1) status = 'DUPLICATE_REFERENCE';
    else if (!row.externalReference) status = 'MISSING_REFERENCE';
    else if (matches.length === 0) status = 'UNMATCHED';
    else if (matches.length > 1) status = 'AMBIGUOUS_LEDGER_REFERENCE';
    else {
      const candidate = matches[0];
      if (candidate.net_amount_cents !== row.amountCents) status = 'AMOUNT_MISMATCH';
      else if (candidate.direction !== row.direction) status = 'DIRECTION_MISMATCH';
      else if (candidate.status === 'RECONCILED' || candidate.status === 'CLOSED') {
        status = 'ALREADY_RECONCILED';
      } else {
        status = 'CANDIDATE_FOR_REVIEW';
        candidateTransactionId = candidate.id;
      }
    }
    return {
      line: row.line,
      externalId: row.externalId,
      occurredOn: row.occurredOn,
      direction: row.direction,
      amountCents: row.amountCents.toString(),
      externalReference: row.externalReference,
      status,
      candidateTransactionId,
    };
  });
  const counts: Record<PreviewStatus, number> = {
    DUPLICATE_SOURCE_ID: 0, DUPLICATE_REFERENCE: 0, MISSING_REFERENCE: 0,
    UNMATCHED: 0, AMBIGUOUS_LEDGER_REFERENCE: 0, AMOUNT_MISMATCH: 0,
    DIRECTION_MISMATCH: 0, ALREADY_RECONCILED: 0, CANDIDATE_FOR_REVIEW: 0,
  };
  for (const row of result) counts[row.status]++;
  return {
    mode: 'PREVIEW_ONLY' as const,
    sourceSha256: createHash('sha256').update(csv, 'utf8').digest('hex'),
    rows: result,
    summary: { total: result.length, counts },
  };
}
