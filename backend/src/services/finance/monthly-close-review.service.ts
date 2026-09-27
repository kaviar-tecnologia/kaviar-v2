/**
 * PR #407: administrative INTERNAL review of a monthly preview.
 * No final closing exists here. No statement verification, revenue certification,
 * financial transaction update, payment, account balance update or ledger lock.
 * Audit and state mutation are atomic. Historical versions are never deleted.
 */
import { createHash, randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { loadMonthlyClosePreview } from './monthly-close-preview.service';
import {
  FinanceTransactionAuditContext, safeSerializeForAudit,
  writeFinanceTransactionAuditTx,
} from './finance-transaction-audit';

export type ReviewActor = FinanceTransactionAuditContext & { role: 'FINANCE' | 'SUPER_ADMIN' };
export class CloseReviewError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
export const INTERNAL_REVIEW_APPROVED = 'INTERNAL_REVIEW_APPROVED';
const EXTERNAL_MISSING = 'EXTERNAL_STATEMENT_AND_ACCOUNTANT_EVIDENCE_MISSING';

/**
 * Database groupBy result order is not guaranteed. Canonicalize object keys
 * and unordered preview collections BEFORE hashing, but keep the original
 * snapshot for readable audit evidence.
 */
function canonicalizeSnapshot(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalizeSnapshot).sort((a, b) => {
      const aa = JSON.stringify(a);
      const bb = JSON.stringify(b);
      return aa < bb ? -1 : aa > bb ? 1 : 0;
    });
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, item]) => [key, canonicalizeSnapshot(item)])
    );
  }
  return value;
}

export function stableReviewSnapshotHash(value: unknown): string {
  const safe = safeSerializeForAudit(value);
  const json = JSON.stringify(canonicalizeSnapshot(safe));
  return createHash('sha256').update(json).digest('hex');
}

function snapshotOf(preview: NonNullable<Awaited<ReturnType<typeof loadMonthlyClosePreview>>>) {
  const snapshot = safeSerializeForAudit(preview) as Record<string, unknown>;
  return { snapshot: snapshot as Prisma.InputJsonValue, hash: stableReviewSnapshotHash(snapshot) };
}
function internalIssues(preview: NonNullable<Awaited<ReturnType<typeof loadMonthlyClosePreview>>>) {
  return preview.reviewReasons.filter((reason) => reason !== EXTERNAL_MISSING);
}
function view(row: any) {
  return {
    id: row.id, legalEntityId: row.legal_entity_id, competence: String(row.year) + '-' +
      String(row.month).padStart(2, '0'), version: row.version, status: row.status,
    snapshot: row.snapshot, snapshotHash: row.snapshot_hash,
    reviewReasons: row.review_reasons, preparedByAdminId: row.prepared_by_admin_id,
    submittedByAdminId: row.submitted_by_admin_id, approvedByAdminId: row.approved_by_admin_id,
    reopenedByAdminId: row.reopened_by_admin_id, reopenReason: row.reopen_reason,
    createdAt: row.created_at, submittedAt: row.submitted_at,
    approvedAt: row.approved_at, reopenedAt: row.reopened_at,
    finalClosing: false, externalStatementsVerified: false, zeroRevenueVerified: false,
  };
}
async function writeAudit(tx: Prisma.TransactionClient, actor: ReviewActor, action: string,
  id: string, before: unknown, after: unknown, reason?: string) {
  await writeFinanceTransactionAuditTx(tx, actor, {
    action, entityType: 'finance_monthly_close_reviews', entityId: id,
    oldValue: before, newValue: after, reason,
  });
}
async function currentReview(id: string) {
  const row = await prisma.finance_monthly_close_reviews.findUnique({ where: { id } });
  if (!row) throw new CloseReviewError(404, 'MONTHLY_REVIEW_NOT_FOUND');
  const latest = await prisma.finance_monthly_close_reviews.findFirst({
    where: { legal_entity_id: row.legal_entity_id, year: row.year, month: row.month },
    orderBy: { version: 'desc' }, select: { id: true },
  });
  if (latest?.id !== id) throw new CloseReviewError(409, 'HISTORICAL_REVIEW_READ_ONLY');
  return row;
}
export async function listMonthlyCloseReviews(entity: string, year: number, month: number) {
  const exists = await prisma.legal_entities.findFirst({
    where: { id: entity, is_active: true }, select: { id: true },
  });
  if (!exists) throw new CloseReviewError(404, 'LEGAL_ENTITY_NOT_FOUND');
  const rows = await prisma.finance_monthly_close_reviews.findMany({
    where: { legal_entity_id: entity, year, month }, orderBy: { version: 'desc' },
  });
  return rows.map(view);
}
export async function prepareMonthlyCloseReview(entity: string, year: number, month: number, actor: ReviewActor) {
  const preview = await loadMonthlyClosePreview(entity, year, month);
  if (!preview) throw new CloseReviewError(404, 'LEGAL_ENTITY_NOT_FOUND');
  const { snapshot, hash } = snapshotOf(preview);
  return prisma.$transaction(async (tx) => {
    const latest = await tx.finance_monthly_close_reviews.findFirst({
      where: { legal_entity_id: entity, year, month }, orderBy: { version: 'desc' },
    });
    if (latest && latest.status !== 'REOPENED')
      throw new CloseReviewError(409, 'REVIEW_ALREADY_EXISTS');
    const row = await tx.finance_monthly_close_reviews.create({ data: {
      id: randomUUID(), legal_entity_id: entity, year, month,
      version: (latest?.version ?? 0) + 1, status: 'DRAFT', snapshot,
      snapshot_hash: hash, review_reasons: preview.reviewReasons,
      prepared_by_admin_id: actor.adminId,
    } });
    await writeAudit(tx, actor, 'FINANCE_MONTHLY_REVIEW_PREPARE', row.id, null,
      { entity, year, month, version: row.version, status: row.status, hash });
    return view(row);
  });
}
export async function submitMonthlyCloseReview(id: string, actor: ReviewActor) {
  const current = await currentReview(id);
  if (current.status !== 'DRAFT') throw new CloseReviewError(409, 'INVALID_REVIEW_STATE');
  return prisma.$transaction(async (tx) => {
    const result = await tx.finance_monthly_close_reviews.updateMany({
      where: { id, status: 'DRAFT' },
      data: { status: 'IN_REVIEW', submitted_by_admin_id: actor.adminId, submitted_at: new Date() },
    });
    if (result.count !== 1) throw new CloseReviewError(409, 'CONCURRENT_REVIEW_CONFLICT');
    const row = await tx.finance_monthly_close_reviews.findUniqueOrThrow({ where: { id } });
    await writeAudit(tx, actor, 'FINANCE_MONTHLY_REVIEW_SUBMIT', id,
      { status: current.status }, { status: row.status, hash: row.snapshot_hash });
    return view(row);
  });
}
export async function approveInternalMonthlyCloseReview(id: string, actor: ReviewActor) {
  if (actor.role !== 'SUPER_ADMIN') throw new CloseReviewError(403, 'SUPER_ADMIN_REQUIRED');
  const current = await currentReview(id);
  if (current.status !== 'IN_REVIEW') throw new CloseReviewError(409, 'INVALID_REVIEW_STATE');
  const preview = await loadMonthlyClosePreview(current.legal_entity_id, current.year, current.month);
  if (!preview) throw new CloseReviewError(404, 'LEGAL_ENTITY_NOT_FOUND');
  if (internalIssues(preview).length > 0)
    throw new CloseReviewError(409, 'INTERNAL_REVIEW_PENDING_ITEMS');
  if (snapshotOf(preview).hash !== current.snapshot_hash)
    throw new CloseReviewError(409, 'STALE_MONTHLY_REVIEW_SNAPSHOT');
  // External evidence is still missing: approve review only, NEVER final close.
  return prisma.$transaction(async (tx) => {
    const result = await tx.finance_monthly_close_reviews.updateMany({
      where: { id, status: 'IN_REVIEW', snapshot_hash: current.snapshot_hash },
      data: { status: INTERNAL_REVIEW_APPROVED, approved_by_admin_id: actor.adminId,
        approved_at: new Date() },
    });
    if (result.count !== 1) throw new CloseReviewError(409, 'CONCURRENT_REVIEW_CONFLICT');
    const row = await tx.finance_monthly_close_reviews.findUniqueOrThrow({ where: { id } });
    await writeAudit(tx, actor, 'FINANCE_MONTHLY_INTERNAL_REVIEW_APPROVE', id,
      { status: current.status }, { status: row.status, hash: row.snapshot_hash,
        externalEvidenceStillMissing: true });
    return view(row);
  });
}
export async function reopenMonthlyCloseReview(id: string, reason: string, actor: ReviewActor) {
  if (actor.role !== 'SUPER_ADMIN') throw new CloseReviewError(403, 'SUPER_ADMIN_REQUIRED');
  if (!reason.trim() || reason.trim().length < 10 || reason.length > 500)
    throw new CloseReviewError(400, 'REOPEN_REASON_REQUIRED');
  const current = await currentReview(id);
  // A submitted review with unresolved items must not become stuck forever.
  // Return it for correction with a reason, preserving the old snapshot/version.
  if (current.status !== 'IN_REVIEW' && current.status !== INTERNAL_REVIEW_APPROVED)
    throw new CloseReviewError(409, 'INVALID_REVIEW_STATE');
  return prisma.$transaction(async (tx) => {
    const result = await tx.finance_monthly_close_reviews.updateMany({
      where: { id, status: current.status },
      data: { status: 'REOPENED', reopened_by_admin_id: actor.adminId,
        reopened_at: new Date(), reopen_reason: reason.trim() },
    });
    if (result.count !== 1) throw new CloseReviewError(409, 'CONCURRENT_REVIEW_CONFLICT');
    const row = await tx.finance_monthly_close_reviews.findUniqueOrThrow({ where: { id } });
    await writeAudit(tx, actor, current.status === 'IN_REVIEW'
      ? 'FINANCE_MONTHLY_INTERNAL_REVIEW_RETURN_FOR_CORRECTION'
      : 'FINANCE_MONTHLY_INTERNAL_REVIEW_REOPEN', id,
      { status: current.status }, { status: row.status, version: row.version }, reason);
    return view(row);
  });
}
