/**
 * Financial Transaction CRUD Service — Manual Entries
 * SUPER_ADMIN: create, update (DRAFT/PENDING only), post, cancel
 * FINANCE: read-only (uses existing list/detail in finance-query.service)
 */
import { prisma } from '../../lib/prisma';
import type {
  FinanceTransactionCreateBody,
  FinanceTransactionUpdateBody,
  FinanceTransactionCancelBody,
} from './finance-transaction-validation';

export class TransactionWriteError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'TransactionWriteError';
    this.status = status;
  }
}

const EDITABLE_STATUSES = ['DRAFT', 'PENDING'] as const;

export async function createFinanceTransaction(
  body: FinanceTransactionCreateBody,
  admin: { id: string; email: string; role: string },
) {
  // Validate account exists
  const account = await prisma.financial_accounts.findUnique({ where: { id: body.account_id }, select: { id: true, is_active: true } });
  if (!account) throw new TransactionWriteError('Conta financeira não encontrada', 404);
  if (!account.is_active) throw new TransactionWriteError('Conta financeira está inativa', 400);

  // Validate category if provided
  if (body.category_id) {
    const cat = await prisma.financial_categories.findUnique({ where: { id: body.category_id }, select: { id: true, is_active: true } });
    if (!cat) throw new TransactionWriteError('Categoria não encontrada', 404);
    if (!cat.is_active) throw new TransactionWriteError('Categoria está inativa', 400);
  }

  // Validate cost center if provided
  if (body.cost_center_id) {
    const cc = await prisma.financial_cost_centers.findUnique({ where: { id: body.cost_center_id }, select: { id: true, is_active: true } });
    if (!cc) throw new TransactionWriteError('Centro de custo não encontrado', 404);
    if (!cc.is_active) throw new TransactionWriteError('Centro de custo está inativo', 400);
  }

  const record = await prisma.financial_transactions.create({
    data: {
      source_type: 'MANUAL',
      origin_type: 'MANUAL',
      account_id: body.account_id,
      counterparty_account_id: body.counterparty_account_id ?? null,
      category_id: body.category_id ?? null,
      cost_center_id: body.cost_center_id ?? null,
      direction: body.direction,
      transaction_type: body.transaction_type,
      status: 'DRAFT',
      payment_method: body.payment_method ?? null,
      competence_date: body.competence_date,
      transaction_date: body.transaction_date,
      due_date: body.due_date ?? null,
      gross_amount_cents: body.gross_amount_cents,
      fee_amount_cents: body.fee_amount_cents ?? BigInt(0),
      discount_amount_cents: body.discount_amount_cents ?? BigInt(0),
      retention_amount_cents: body.retention_amount_cents ?? BigInt(0),
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

  return prisma.financial_transactions.findUnique({
    where: { id: record.id },
    include: {
      account: { select: { id: true, code: true, name: true, type: true } },
      category: { select: { id: true, code: true, name: true, kind: true } },
      cost_center: { select: { id: true, code: true, name: true, type: true } },
      created_by_admin: { select: { id: true, name: true } },
      responsible_admin: { select: { id: true, name: true } },
    },
  });
}

export async function updateFinanceTransaction(
  id: string,
  body: FinanceTransactionUpdateBody,
  admin: { id: string; email: string; role: string },
) {
  const existing = await prisma.financial_transactions.findUnique({
    where: { id },
    select: { id: true, status: true, source_type: true },
  });

  if (!existing) throw new TransactionWriteError('Lançamento não encontrado', 404);
  if (existing.source_type !== 'MANUAL') throw new TransactionWriteError('Somente lançamentos manuais podem ser editados', 403);
  if (!EDITABLE_STATUSES.includes(existing.status as any)) {
    throw new TransactionWriteError(`Lançamento com status ${existing.status} não pode ser editado`, 400);
  }

  // Validate references if changed
  if (body.account_id) {
    const account = await prisma.financial_accounts.findUnique({ where: { id: body.account_id }, select: { id: true, is_active: true } });
    if (!account) throw new TransactionWriteError('Conta financeira não encontrada', 404);
    if (!account.is_active) throw new TransactionWriteError('Conta financeira está inativa', 400);
  }
  if (body.category_id) {
    const cat = await prisma.financial_categories.findUnique({ where: { id: body.category_id }, select: { id: true, is_active: true } });
    if (!cat) throw new TransactionWriteError('Categoria não encontrada', 404);
  }
  if (body.cost_center_id) {
    const cc = await prisma.financial_cost_centers.findUnique({ where: { id: body.cost_center_id }, select: { id: true, is_active: true } });
    if (!cc) throw new TransactionWriteError('Centro de custo não encontrado', 404);
  }

  const data: any = { ...body };
  // Don't allow changing source_type or origin_type
  delete data.source_type;
  delete data.origin_type;

  await prisma.financial_transactions.update({ where: { id }, data });

  return prisma.financial_transactions.findUnique({
    where: { id },
    include: {
      account: { select: { id: true, code: true, name: true, type: true } },
      category: { select: { id: true, code: true, name: true, kind: true } },
      cost_center: { select: { id: true, code: true, name: true, type: true } },
      created_by_admin: { select: { id: true, name: true } },
      responsible_admin: { select: { id: true, name: true } },
    },
  });
}

export async function postFinanceTransaction(
  id: string,
  settlementDate: Date | undefined,
  admin: { id: string; email: string; role: string },
) {
  const existing = await prisma.financial_transactions.findUnique({
    where: { id },
    select: { id: true, status: true, source_type: true },
  });

  if (!existing) throw new TransactionWriteError('Lançamento não encontrado', 404);
  if (existing.source_type !== 'MANUAL') throw new TransactionWriteError('Somente lançamentos manuais podem ser liquidados', 403);
  if (existing.status !== 'DRAFT' && existing.status !== 'PENDING') {
    throw new TransactionWriteError(`Lançamento com status ${existing.status} não pode ser liquidado`, 400);
  }

  await prisma.financial_transactions.update({
    where: { id },
    data: {
      status: 'POSTED',
      settlement_date: settlementDate ?? new Date(),
      approved_by_admin_id: admin.id,
    },
  });

  return prisma.financial_transactions.findUnique({
    where: { id },
    include: {
      account: { select: { id: true, code: true, name: true, type: true } },
      category: { select: { id: true, code: true, name: true, kind: true } },
      cost_center: { select: { id: true, code: true, name: true, type: true } },
      created_by_admin: { select: { id: true, name: true } },
      approved_by_admin: { select: { id: true, name: true } },
      responsible_admin: { select: { id: true, name: true } },
    },
  });
}

export async function cancelFinanceTransaction(
  id: string,
  body: FinanceTransactionCancelBody,
  admin: { id: string; email: string; role: string },
) {
  const existing = await prisma.financial_transactions.findUnique({
    where: { id },
    select: { id: true, status: true, source_type: true },
  });

  if (!existing) throw new TransactionWriteError('Lançamento não encontrado', 404);
  if (existing.source_type !== 'MANUAL') throw new TransactionWriteError('Somente lançamentos manuais podem ser cancelados', 403);
  if (existing.status === 'CANCELED') throw new TransactionWriteError('Lançamento já está cancelado', 400);
  if (existing.status === 'CLOSED') throw new TransactionWriteError('Lançamento fechado não pode ser cancelado', 400);

  await prisma.financial_transactions.update({
    where: { id },
    data: {
      status: 'CANCELED',
      canceled_reason: body.canceled_reason,
      canceled_at: new Date(),
    },
  });

  return prisma.financial_transactions.findUnique({
    where: { id },
    include: {
      account: { select: { id: true, code: true, name: true, type: true } },
      category: { select: { id: true, code: true, name: true, kind: true } },
      cost_center: { select: { id: true, code: true, name: true, type: true } },
      created_by_admin: { select: { id: true, name: true } },
      responsible_admin: { select: { id: true, name: true } },
    },
  });
}
