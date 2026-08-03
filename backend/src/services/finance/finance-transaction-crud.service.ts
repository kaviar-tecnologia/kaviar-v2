/**
 * Financial Transaction CRUD — Manual Entries (fail-closed)
 * - CAS optimistic concurrency via updateMany + expected_updated_at
 * - State machine: DRAFT/PENDING → editable; POSTED/RECONCILED/CLOSED → locked
 * - Atomic audit: writeFinanceTransactionAuditTx inside prisma.$transaction
 * - Only source_type=MANUAL entries mutable
 */
import { prisma } from '../../lib/prisma';
import { Prisma } from '@prisma/client';
import type {
  FinanceTransactionCreateBody,
  FinanceTransactionUpdateBody,
  FinanceTransactionPostBody,
  FinanceTransactionCancelBody,
} from './finance-transaction-validation';
import { validateDirectionTypeCompatibility } from './finance-transaction-validation';
import { FINANCE_TRANSACTION_DETAIL_SELECT } from './finance-transaction-selects';
import { writeFinanceTransactionAuditTx, safeSerializeForAudit, FinanceTransactionAuditContext } from './finance-transaction-audit';

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

async function validateAccountActive(tx: Prisma.TransactionClient, id: string): Promise<void> {
  const acc = await tx.financial_accounts.findUnique({ where: { id }, select: { id: true, is_active: true } });
  if (!acc) throw new TransactionWriteError('Conta financeira não encontrada', 404);
  if (!acc.is_active) throw new TransactionWriteError('Conta financeira está inativa');
}

async function validateCategoryActive(tx: Prisma.TransactionClient, id: string): Promise<void> {
  const cat = await tx.financial_categories.findUnique({ where: { id }, select: { id: true, is_active: true } });
  if (!cat) throw new TransactionWriteError('Categoria não encontrada', 404);
  if (!cat.is_active) throw new TransactionWriteError('Categoria está inativa');
}

async function validateCostCenterActive(tx: Prisma.TransactionClient, id: string | null | undefined): Promise<void> {
  if (!id) return;
  const cc = await tx.financial_cost_centers.findUnique({ where: { id }, select: { id: true, is_active: true } });
  if (!cc) throw new TransactionWriteError('Centro de custo não encontrado', 404);
  if (!cc.is_active) throw new TransactionWriteError('Centro de custo está inativo');
}

// ── CREATE ────────────────────────────────────────────────────────────────

export async function createFinanceTransaction(
  body: FinanceTransactionCreateBody,
  admin: { id: string; email: string; role: string },
  auditContext: FinanceTransactionAuditContext,
) {
  return prisma.$transaction(async (tx) => {
    await validateAccountActive(tx, body.account_id);
    await validateCategoryActive(tx, body.category_id);
    await validateCostCenterActive(tx, body.cost_center_id);

    if (body.counterparty_account_id) {
      await validateAccountActive(tx, body.counterparty_account_id);
      if (body.counterparty_account_id === body.account_id) {
        throw new TransactionWriteError('Conta de contraparte não pode ser igual à conta principal');
      }
    }

    const created = await tx.financial_transactions.create({
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

    const record = await tx.financial_transactions.findUnique({
      where: { id: created.id },
      select: FINANCE_TRANSACTION_DETAIL_SELECT,
    });

    await writeFinanceTransactionAuditTx(tx, auditContext, {
      action: 'FINANCE_TRANSACTION_CREATE',
      entityType: 'financial_transactions',
      entityId: created.id,
      oldValue: null,
      newValue: safeSerializeForAudit(record),
    });

    return { record };
  });
}

// ── UPDATE (CAS) ──────────────────────────────────────────────────────────

export async function updateFinanceTransaction(
  id: string,
  body: FinanceTransactionUpdateBody,
  admin: { id: string; email: string; role: string },
  auditContext: FinanceTransactionAuditContext,
) {
  const { expected_updated_at, ...fields } = body;

  return prisma.$transaction(async (tx) => {
    // Validate references
    if (fields.account_id) await validateAccountActive(tx, fields.account_id);
    if (fields.category_id) await validateCategoryActive(tx, fields.category_id);
    await validateCostCenterActive(tx, fields.cost_center_id);
    if (fields.counterparty_account_id) {
      await validateAccountActive(tx, fields.counterparty_account_id);
    }

    // Capture before state for audit
    const before = await tx.financial_transactions.findUnique({ where: { id }, select: FINANCE_TRANSACTION_DETAIL_SELECT });
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

    // Validate due_date >= transaction_date with effective values
    const effectiveTransactionDate = fields.transaction_date ?? before.transaction_date;
    const effectiveDueDate = fields.due_date !== undefined ? fields.due_date : before.due_date;
    if (effectiveDueDate && effectiveTransactionDate && effectiveDueDate < effectiveTransactionDate) {
      throw new TransactionWriteError('due_date não pode ser anterior a transaction_date');
    }

    // Validate net = gross in V1
    const effectiveGross = fields.gross_amount_cents ?? before.gross_amount_cents;
    const effectiveNet = fields.net_amount_cents ?? before.net_amount_cents;
    if (effectiveGross !== effectiveNet) {
      throw new TransactionWriteError('Nesta versão, net_amount_cents deve ser igual a gross_amount_cents');
    }

    // CAS: atomic update only if conditions match
    const result = await tx.financial_transactions.updateMany({
      where: {
        id,
        source_type: 'MANUAL',
        status: { in: EDITABLE_STATUSES },
        updated_at: expected_updated_at,
      },
      data: {
        ...fields,
        metadata: fields.metadata === null
          ? null  // explicitly clear
          : fields.metadata !== undefined
            ? JSON.parse(JSON.stringify(fields.metadata))
            : undefined,  // preserve existing
      },
    });

    if (result.count === 0) {
      if (!EDITABLE_STATUSES.includes(before.status as any)) {
        throw new TransactionWriteError(`Lançamento com status ${before.status} não pode ser editado`);
      }
      throw new TransactionWriteError('Conflito de atualização: o registro foi alterado por outra sessão', 409);
    }

    const after = await tx.financial_transactions.findUnique({ where: { id }, select: FINANCE_TRANSACTION_DETAIL_SELECT });

    await writeFinanceTransactionAuditTx(tx, auditContext, {
      action: 'FINANCE_TRANSACTION_UPDATE',
      entityType: 'financial_transactions',
      entityId: id,
      oldValue: safeSerializeForAudit(before),
      newValue: safeSerializeForAudit(after),
    });

    return { record: after };
  });
}

// ── POST (liquidate, CAS) ─────────────────────────────────────────────────

export async function postFinanceTransaction(
  id: string,
  body: FinanceTransactionPostBody,
  admin: { id: string; email: string; role: string },
  auditContext: FinanceTransactionAuditContext,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.financial_transactions.findUnique({ where: { id }, select: FINANCE_TRANSACTION_DETAIL_SELECT });
    if (!before) throw new TransactionWriteError('Lançamento não encontrado', 404);
    if (before.source_type !== 'MANUAL') throw new TransactionWriteError('Somente lançamentos manuais podem ser liquidados', 403);

    // Validate settlement_date >= transaction_date
    const settlementDate = body.settlement_date ?? new Date();
    if (before.transaction_date && settlementDate < before.transaction_date) {
      throw new TransactionWriteError('settlement_date não pode ser anterior a transaction_date');
    }

    const result = await tx.financial_transactions.updateMany({
      where: {
        id,
        source_type: 'MANUAL',
        status: { in: POSTABLE_STATUSES },
        updated_at: body.expected_updated_at,
      },
      data: {
        status: 'POSTED',
        settlement_date: settlementDate,
        approved_by_admin_id: admin.id,
      },
    });

    if (result.count === 0) {
      if (before.status === 'POSTED') throw new TransactionWriteError('Lançamento já está liquidado');
      if (!POSTABLE_STATUSES.includes(before.status as any)) throw new TransactionWriteError(`Lançamento com status ${before.status} não pode ser liquidado. POSTED exige estorno para alteração.`);
      throw new TransactionWriteError('Conflito de atualização: o registro foi alterado por outra sessão', 409);
    }

    const after = await tx.financial_transactions.findUnique({ where: { id }, select: FINANCE_TRANSACTION_DETAIL_SELECT });

    await writeFinanceTransactionAuditTx(tx, auditContext, {
      action: 'FINANCE_TRANSACTION_POST',
      entityType: 'financial_transactions',
      entityId: id,
      oldValue: safeSerializeForAudit(before),
      newValue: safeSerializeForAudit(after),
    });

    return { record: after };
  });
}

// ── CANCEL (CAS) ──────────────────────────────────────────────────────────

export async function cancelFinanceTransaction(
  id: string,
  body: FinanceTransactionCancelBody,
  admin: { id: string; email: string; role: string },
  auditContext: FinanceTransactionAuditContext,
) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.financial_transactions.findUnique({ where: { id }, select: FINANCE_TRANSACTION_DETAIL_SELECT });
    if (!before) throw new TransactionWriteError('Lançamento não encontrado', 404);
    if (before.source_type !== 'MANUAL') throw new TransactionWriteError('Somente lançamentos manuais podem ser cancelados', 403);

    const result = await tx.financial_transactions.updateMany({
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

    const after = await tx.financial_transactions.findUnique({ where: { id }, select: FINANCE_TRANSACTION_DETAIL_SELECT });

    await writeFinanceTransactionAuditTx(tx, auditContext, {
      action: 'FINANCE_TRANSACTION_CANCEL',
      entityType: 'financial_transactions',
      entityId: id,
      oldValue: safeSerializeForAudit(before),
      newValue: safeSerializeForAudit(after),
      reason: body.canceled_reason,
    });

    return { record: after };
  });
}
