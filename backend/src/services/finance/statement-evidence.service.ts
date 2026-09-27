/**
 * PR #408: synthetic-only evidence manifest used to validate documentary
 * workflow in a disposable PostgreSQL database. NEVER accept real statements.
 * This is not a native SumUp/Asaas adapter or a document archive.
 * The raw bytes are processed in memory, hashed on the server and discarded.
 */
import { createHash, randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { assertSafeFinanceDatabase } from '../../lib/assert-safe-finance-db';
import { monthWindow } from './monthly-close-preview.service';
import {
  buildSyntheticImportPreview, parseSyntheticStatement,
} from './synthetic-statement-import.service';
import {
  FinanceTransactionAuditContext, writeFinanceTransactionAuditTx,
} from './finance-transaction-audit';

export type EvidenceProvider = 'SUMUP' | 'ASAAS';
export class EvidenceError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}
export interface SyntheticEvidenceRequest {
  legalEntityId: string;
  accountId: string;
  provider: EvidenceProvider;
  year: number;
  month: number;
  contentBase64: string;
}
export interface EvidenceActor extends FinanceTransactionAuditContext {
  role: 'FINANCE' | 'SUPER_ADMIN';
}

const MODE = 'SYNTHETIC_EVIDENCE_MANIFEST_ONLY' as const;
const UNVERIFIED = 'SYNTHETIC_RECORDED_UNVERIFIED';
const UTF8 = new TextDecoder('utf-8', { fatal: true });

function requireSyntheticDatabase() {
  // Both conditions are required: production cannot enable the ingestion
  // by setting an override or by sending an apparently synthetic payload.
  if (process.env.NODE_ENV !== 'test') throw new EvidenceError(404, 'SYNTHETIC_ONLY');
  assertSafeFinanceDatabase();
}
export function decodeSyntheticEvidence(contentBase64: string) {
  if (typeof contentBase64 !== 'string' || contentBase64.length < 8 ||
      contentBase64.length > 88_000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(contentBase64)) {
    throw new EvidenceError(400, 'INVALID_EVIDENCE_ENCODING');
  }
  const bytes = Buffer.from(contentBase64, 'base64');
  if (bytes.length === 0 || bytes.length > 65_536 ||
      bytes.toString('base64') !== contentBase64) {
    throw new EvidenceError(400, 'INVALID_EVIDENCE_BYTES');
  }
  let csv: string;
  try { csv = UTF8.decode(bytes); }
  catch { throw new EvidenceError(400, 'EVIDENCE_UTF8_REQUIRED'); }
  return {
    csv, byteCount: bytes.length,
    contentSha256: createHash('sha256').update(bytes).digest('hex'),
  };
}
function evidenceView(row: any) {
  return {
    id: row.id, legalEntityId: row.legal_entity_id, accountId: row.account_id,
    provider: row.provider, competence: String(row.year) + '-' + String(row.month).padStart(2, '0'),
    contentSha256: row.content_sha256, byteCount: row.byte_count, eventCount: row.event_count,
    previewSummary: row.preview_summary, sourceKind: row.source_kind, status: row.status,
    recordedByAdminId: row.recorded_by_admin_id, recordedAt: row.recorded_at,
    rawContentRetained: false, officialSourceVerified: false, realStatementVerified: false,
    zeroRevenueVerified: false, finalClosing: false,
  };
}
async function assertEntity(entity: string) {
  const row = await prisma.legal_entities.findFirst({
    where: { id: entity, is_active: true }, select: { id: true },
  });
  if (!row) throw new EvidenceError(404, 'LEGAL_ENTITY_NOT_FOUND');
}
export async function evidenceRequirements(entity: string, year: number, month: number) {
  monthWindow(year, month);
  await assertEntity(entity);
  const records = await prisma.finance_statement_evidence.groupBy({
    by: ['provider'], where: { legal_entity_id: entity, year, month },
    _count: { _all: true },
  });
  const counts = Object.fromEntries(records.map(row => [row.provider, row._count._all]));
  return {
    mode: 'READ_ONLY_EVIDENCE_REQUIREMENTS' as const, legalEntityId: entity,
    competence: String(year) + '-' + String(month).padStart(2, '0'),
    sources: (['SUMUP','ASAAS'] as const).map(provider => ({
      provider, syntheticManifestCount: counts[provider] || 0,
      officialStatementStatus: 'NOT_VERIFIED' as const,
    })),
    providerStatementsVerified: false, accountantEvidenceVerified: false,
    zeroRevenueVerified: false, readyForFinalClosing: false, finalClosing: false,
    reviewReasons: ['OFFICIAL_SUMUP_STATEMENT_NOT_VERIFIED',
      'OFFICIAL_ASAAS_STATEMENT_NOT_VERIFIED',
      'ACCOUNTANT_ATTESTATION_NOT_VERIFIED'],
  };
}
export async function listEvidence(entity: string, year: number, month: number) {
  monthWindow(year, month);
  await assertEntity(entity);
  const rows = await prisma.finance_statement_evidence.findMany({
    where: { legal_entity_id: entity, year, month }, orderBy: { recorded_at: 'desc' },
    take: 100,
  });
  return rows.map(evidenceView);
}
export async function recordSyntheticEvidence(
  input: SyntheticEvidenceRequest,
  actor: EvidenceActor,
  options: { injectFailureAfterInsertForTest?: boolean } = {},
) {
  requireSyntheticDatabase();
  monthWindow(input.year, input.month);
  if (actor.role !== 'FINANCE' && actor.role !== 'SUPER_ADMIN' || !actor.adminId)
    throw new EvidenceError(403, 'FORBIDDEN');
  if (input.provider !== 'SUMUP' && input.provider !== 'ASAAS')
    throw new EvidenceError(400, 'UNSUPPORTED_PROVIDER');
  const { csv, byteCount, contentSha256 } = decodeSyntheticEvidence(input.contentBase64);
  const rows = parseSyntheticStatement(csv);
  const competence = String(input.year) + '-' + String(input.month).padStart(2, '0');
  if (rows.some(row => !row.occurredOn.startsWith(competence + '-')))
    throw new EvidenceError(400, 'EVIDENCE_PERIOD_MISMATCH');
  await assertEntity(input.legalEntityId);
  const account = await prisma.financial_accounts.findFirst({
    where: {
      id: input.accountId, legal_entity_id: input.legalEntityId,
      is_active: true, currency: 'BRL',
      type: { in: ['BANK', 'PIX_WALLET', 'CLEARING'] },
    }, select: { id: true },
  });
  if (!account) throw new EvidenceError(404, 'FINANCIAL_ACCOUNT_SCOPE_NOT_VERIFIED');
  const refs = [...new Set(rows.map(row => row.externalReference).filter(
    (ref): ref is string => !!ref,
  ))];
  const ledger = refs.length ? await prisma.financial_transactions.findMany({
    where: {
      account_id: input.accountId, legal_entity_id: input.legalEntityId,
      provider: { equals: input.provider, mode: 'insensitive' },
      external_reference: { in: refs },
      status: { in: ['POSTED', 'RECONCILED', 'CLOSED'] },
    }, select: {
      id: true, external_reference: true, direction: true,
      net_amount_cents: true, status: true,
    },
  }) : [];
  const preview = buildSyntheticImportPreview({
    provider: input.provider, accountId: input.accountId, legalEntityId: input.legalEntityId,
  }, csv, ledger);
  const summary = {
    total: preview.summary.total, candidateCount: preview.summary.candidateCount,
    reviewRequired: preview.summary.reviewRequired, emptyMonth: preview.summary.emptyMonth,
    counts: preview.rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1; return acc;
    }, {}),
  };
  return prisma.$transaction(async tx => {
    const row = await tx.finance_statement_evidence.create({ data: {
      id: randomUUID(), legal_entity_id: input.legalEntityId, account_id: input.accountId,
      provider: input.provider, year: input.year, month: input.month,
      content_sha256: contentSha256, byte_count: byteCount, event_count: rows.length,
      preview_summary: summary as Prisma.InputJsonValue, source_kind: 'SYNTHETIC_FIXTURE',
      status: UNVERIFIED, recorded_by_admin_id: actor.adminId,
    } });
    // This injectable failure exists only in the test-only codepath; verifies
    // metadata cannot commit without its required audit entry.
    if (options.injectFailureAfterInsertForTest) throw new Error('TEST_INJECTED_EVIDENCE_AUDIT_FAILURE');
    await writeFinanceTransactionAuditTx(tx, actor, {
      action: 'FINANCE_SYNTHETIC_STATEMENT_MANIFEST_REGISTER',
      entityType: 'finance_statement_evidence', entityId: row.id,
      newValue: {
        entity: input.legalEntityId, account: input.accountId, provider: input.provider,
        competence, contentSha256, byteCount, eventCount: rows.length,
        status: UNVERIFIED, summary,
      },
    });
    return { mode: MODE, ...evidenceView(row) };
  });
}
