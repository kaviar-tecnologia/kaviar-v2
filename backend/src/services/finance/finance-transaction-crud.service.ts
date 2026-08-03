/**
 * Financial Transaction CRUD — Manual Entries (fail-closed)
 * - CAS optimistic concurrency via updateMany + expected_updated_at
 * - State machine: DRAFT/PENDING → editable; POSTED/RECONCILED/CLOSED → locked
 * - Audit: before/after snapshots
 * - Only source_type=MANUAL entries mutable
 */
import { prisma } from '../../lib/prisma';
import type {
  FinanceTransactionCreateBody,
  FinanceTransactionUpdateBody,
  FinanceTransactionPostBody,
  FinanceTransactionCancelBody,
} from './finance-transaction-validation';
import { validateDirectionTypeCompatibility } from './finance-transaction-validation';

export class TransactionWriteError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'TransactionWriteError';
    this.status = status;
  }
}

const EDITABLE_STATUSES = ['DRAFT', 'PENDING'] as any[];
const POSTABLE_STATUSES = ['DRAFT', 'PENDING'] as any[];
const CANCELABLE_STATUSES = ['DRAFT', 'PENDING'] as any[];

const DETAIL_SELECT = {
  id: true, external_reference: true, source_type: true, source_id: true,
  origin_type: true, origin_id: true, provider: true, provider_event_id: true,
  account_id: true, counterparty_account_id: true, category_id: true, cost_center_id: true,
  direction: true, transaction_type: true, status: true, payment_method: true,
  competence_date: true, transaction_date: true, due_date: true, settlement_date: true,
  gross_amount_cents: true, fee_amount_cents: true, discount_amount_cents: true,
  retention_amount_cents: true, net_amount_cents: true,
  description: true, memo: true, metadata: true,
  canceled_reason: true, canceled_at: true,
  created_by_admin_id: true, approved_by_admin_id: true, responsible_admin_id: true,
  created_at: true, updated_at: true,
  account: { select: { id: true, code: true, name: true, type: true } },
  category: { select: { id: true, code: true, name: true, kind: true } },
  cost_center: { select: { id: true, code: true, name: true, type: true } },
  created_by_admin: { select: { id: true, name: true } },
  approved_by_admin: { select: { id: true, name: true } },
  responsible_admin: { select: { id: true, name: true } },
};

function snapshotForAudit(record: any) {
  if (!record) return null;
  return {
    id: record.id,
    status: record.status,
    direction: record.direction,
    transaction_type: record.transaction_type,
    account_id: record.account_id,
    category_id: record.category_id,
    cost_center_id: record.cost_center_id,
    gross_amount_cents: record.gross_amount_cents?.toString(),
    net_amount_cents: record.net_amount_cents?.toString(),
    description: record.description,
    competence_date: record.competence_date,
    transaction_date: record.transaction_date,
    due_date: record.due_date,
    settlement_date: record.settlement_date,
    updated_at: record.updated_at,
  };
}

async function validateAccountActive(id: string): Promise<void> {
  const acc = await prisma.financial_accounts.findUnique({ where: { id }, select: { id: true, is_active: true } });
  if (!acc) throw new TransactionWriteError('Conta financeira não encontrada', 404);
  if (!acc.is_active) throw new TransactionWriteError('Conta financeira está inativa');
}

async function validateCategoryActive(id: string): Promise<void> {
  const cat = await prisma.financial_categories.findUnique({ where: { id }, select: { id: true, is_active: true } });
  if (!cat) throw new TransactionWriteError('Categoria não encontrada', 404);
  if (!cat.is_active) throw new TransactionWriteError('Categoria está inativa');
}

async function validateCostCenterActive(id: string | null | undefined): Promise<void> {
  if (!id) return;
  const cc = await prisma.financial_cost_centers.findUnique({ where: { id }, select: { id: true, is_active: true } });
  if (!cc) throw new TransactionWriteError('Centro de custo não encontrado', 404);
  if (!cc.is_active) throw new TransactionWriteError('Centro de custo está inativo');
}

// ── CREATE ────────────────────────────────────────────────────────────────

export async function createFinanceTransaction(
  body: FinanceTransactionCreateBody,
  admin: { id: string; email: string; role: string },
) {
  await validateAccountActive(body.account_id);
  await validateCategoryActive(body.category_id);
  await validateCostCenterActive(body.cost_center_id);

  if (body.counterparty_account_id) {
    await validateAccountActive(body.counterparty_account_id);
    if (body.counterparty_account_id === body.account_id) {
      throw new TransactionWriteError('Conta de contraparte não pode ser igual à conta principal');
    }
  }

  const record = await prisma.financial_transactions.create({
    data: {
      source_type: 'MANUAL',
      origin_type: 'MANUAL',
      account_id: body.account_id,
      counterparty_account_id: body.counterparty_account_id ?? null,
      category_id: body.category_id,
      cost_center_id: body.cost_center_id ?? null,
      direction: body.direction,
      transaction_type: body.transaction_type,
      status: 'DRAFT',
      payment_method: body.payment_method ?? null,
      competence_date: body.competence_date,
      transaction_date: body.transaction_date,
      due_date: body.due_date ?? null,
      gross_amount_cents: body.gross_amount_cents,
      fee_amount_cents: BigInt(0),
      discount_amount_cents: BigInt(0),
      retention_amount_cents: BigInt(0),
      net_amount_cents: body.net_amount_cents,
      description: body.description,
      memo: body.memo ?? null,
      external_reference: body.external_reference ?? null,
      metadata: body.metadata ? JSON.parse(JSON.stringify(body.metadata)) : undefined,
      created_by_admin_id: admin.id,
      responsible_admin_id: admin.id,
    },
    select: { id: true },
  });

  const created = await prisma.financial_transactions.findUnique({ where: { id: record.id }, select: DETAIL_SELECT });
  return { record: created, auditBefore: null, auditAfter: { id: record.id, status: 'DRAFT', description: body.description } };
}

// ── UPDATE (CAS) ──────────────────────────────────────────────────────────

export async function updateFinanceTransaction(
  id: string,
  body: FinanceTransactionUpdateBody,
  admin: { id: string; email: string; role: string },
) {
  const { expected_updated_at, ...fields } = body;

  // Validate references
  if (fields.account_id) await validateAccountActive(fields.account_id);
  if (fields.category_id) await validateCategoryActive(fields.category_id);
  await validateCostCenterActive(fields.cost_center_id);
  if (fields.counterparty_account_id) {
    await validateAccountActive(fields.counterparty_account_id);
  }

  // Capture before state for audit
  const before = await prisma.financial_transactions.findUnique({ where: { id }, select: DETAIL_SELECT });
  if (!before) throw new TransactionWriteError('Lançamento não encontrado', 404);
  if (before.source_type !== 'MANUAL') throw new TransactionWriteError('Somente lançamentos manuais podem ser editados', 403);

  // Validate direction/type compatibility considering existing + new values
  const effectiveDirection = fields.direction || before.direction;
  const effectiveType = fields.transaction_type || before.transaction_type;
  const compatErr = validateDirectionTypeCompatibility(effectiveDirection, effectiveType);
  if (compatErr) throw new TransactionWriteError(compatErr);

  // Validate counterparty != account
  const effectiveAccount = fields.account_id || before.account_id;
  const effectiveCounterparty = fields.counterparty_account_id !== undefined
    ? fields.counterparty_account_id
    : before.counterparty_account_id;
  if (effectiveCounterparty && effectiveCounterparty === effectiveAccount) {
    throw new TransactionWriteError('Conta de contraparte não pode ser igual à conta principal');
  }

  // CAS: atomic update only if conditions match
  const result = await prisma.financial_transactions.updateMany({
    where: {
      id,
      source_type: 'MANUAL',
      status: { in: EDITABLE_STATUSES },
      updated_at: expected_updated_at,
    },
    data: { ...fields, metadata: fields.metadata ? JSON.parse(JSON.stringify(fields.metadata)) : undefined },
  });

  if (result.count === 0) {
    if (!EDITABLE_STATUSES.includes(before.status as any)) {
      throw new TransactionWriteError(`Lançamento com status ${before.status} não pode ser editado`);
    }
    throw new TransactionWriteError('Conflito de atualização: o registro foi alterado por outra sessão', 409);
  }

  const after = await prisma.financial_transactions.findUnique({ where: { id }, select: DETAIL_SELECT });
  return { record: after, auditBefore: snapshotForAudit(before), auditAfter: snapshotForAudit(after) };
}

// ── POST (liquidate, CAS) ─────────────────────────────────────────────────

export async function postFinanceTransaction(
  id: string,
  body: FinanceTransactionPostBody,
  admin: { id: string; email: string; role: string },
) {
  const before = await prisma.financial_transactions.findUnique({ where: { id }, select: DETAIL_SELECT });
  if (!before) throw new TransactionWriteError('Lançamento não encontrado', 404);
  if (before.source_type !== 'MANUAL') throw new TransactionWriteError('Somente lançamentos manuais podem ser liquidados', 403);

  const result = await prisma.financial_transactions.updateMany({
    where: {
      id,
      source_type: 'MANUAL',
      status: { in: POSTABLE_STATUSES },
      updated_at: body.expected_updated_at,
    },
    data: {
      status: 'POSTED',
      settlement_date: body.settlement_date ?? new Date(),
      approved_by_admin_id: admin.id,
    },
  });

  if (result.count === 0) {
    if (before.status === 'POSTED') throw new TransactionWriteError('Lançamento já está liquidado');
    if (!POSTABLE_STATUSES.includes(before.status as any)) throw new TransactionWriteError(`Lançamento com status ${before.status} não pode ser liquidado. POSTED exige estorno para alteração.`);
    throw new TransactionWriteError('Conflito de atualização: o registro foi alterado por outra sessão', 409);
  }

  const after = await prisma.financial_transactions.findUnique({ where: { id }, select: DETAIL_SELECT });
  return { record: after, auditBefore: snapshotForAudit(before), auditAfter: snapshotForAudit(after) };
}

// ── CANCEL (CAS) ──────────────────────────────────────────────────────────

export async function cancelFinanceTransaction(
  id: string,
  body: FinanceTransactionCancelBody,
  admin: { id: string; email: string; role: string },
) {
  const before = await prisma.financial_transactions.findUnique({ where: { id }, select: DETAIL_SELECT });
  if (!before) throw new TransactionWriteError('Lançamento não encontrado', 404);
  if (before.source_type !== 'MANUAL') throw new TransactionWriteError('Somente lançamentos manuais podem ser cancelados', 403);

  const result = await prisma.financial_transactions.updateMany({
    where: {
      id,
      source_type: 'MANUAL',
      status: { in: CANCELABLE_STATUSES },
      updated_at: body.expected_updated_at,
    },
    data: {
      status: 'CANCELED',
      canceled_reason: body.canceled_reason,
      canceled_at: new Date(),
    },
  });

  if (result.count === 0) {
    if (before.status === 'CANCELED') throw new TransactionWriteError('Lançamento já está cancelado');
    if (before.status === 'POSTED') throw new TransactionWriteError('Lançamento liquidado não pode ser cancelado diretamente. Utilize estorno.');
    if (before.status === 'CLOSED') throw new TransactionWriteError('Lançamento fechado não pode ser cancelado');
    throw new TransactionWriteError('Conflito de atualização: o registro foi alterado por outra sessão', 409);
  }

  const after = await prisma.financial_transactions.findUnique({ where: { id }, select: DETAIL_SELECT });
  return { record: after, auditBefore: snapshotForAudit(before), auditAfter: snapshotForAudit(after) };
}
