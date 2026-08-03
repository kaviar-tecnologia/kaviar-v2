import { prisma } from '../../lib/prisma';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { FINANCE_TRANSACTION_DETAIL_SELECT } from './finance-transaction-selects';

const NON_FINAL_TRANSACTION_STATUSES = ['DRAFT', 'PENDING', 'BLOCKED'] as const;
const ACCOUNT_STRUCTURAL_FIELDS = ['code', 'type', 'currency', 'opening_balance_cents', 'opening_balance_date'] as const;
const ACCOUNT_FINANCE_PATCH_FIELDS = ['name', 'institution_name', 'bank_code', 'allows_negative_balance', 'is_cash_equivalent', 'is_active', 'notes'] as const;
const CATEGORY_FINANCE_PATCH_FIELDS = ['name', 'parent_id', 'default_direction', 'requires_document', 'is_active', 'sort_order'] as const;
const CATEGORY_SYSTEM_SUPER_ADMIN_PATCH_FIELDS = ['name', 'default_direction', 'requires_document', 'sort_order'] as const;
const COST_CENTER_STRUCTURAL_FIELDS = ['code', 'type'] as const;
const COST_CENTER_FINANCE_PATCH_FIELDS = ['name', 'parent_id', 'territory_id', 'city', 'state', 'is_active'] as const;
const HIERARCHY_DEPTH_LIMIT = 50;

export class FinanceWriteError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function isKnownPrismaError(error: unknown): error is Prisma.PrismaClientKnownRequestError {
  return error instanceof Prisma.PrismaClientKnownRequestError;
}

function isCodeUniqueViolation(error: unknown) {
  if (!isKnownPrismaError(error) || error.code !== 'P2002') return false;
  const target = (error.meta as any)?.target;
  if (Array.isArray(target)) return target.includes('code');
  return String(target || '').includes('code');
}

const SERIALIZABLE_CONFLICT_MESSAGE = 'Conflito de concorrência. Recarregue os dados e tente novamente.';

function extractSqlStateFromDatabaseError(databaseError: unknown) {
  if (typeof databaseError !== 'string') return null;

  const sqlStateMatch = databaseError.match(/SQLSTATE[^0-9A-Z]*([0-9A-Z]{5})/i);
  if (sqlStateMatch?.[1]) return sqlStateMatch[1].toUpperCase();

  const anyCodeMatch = databaseError.match(/\b([0-9A-Z]{5})\b/i);
  if (anyCodeMatch?.[1]) return anyCodeMatch[1].toUpperCase();

  return null;
}

function isSerializableConflict(error: unknown) {
  if (isKnownPrismaError(error)) {
    if (error.code === 'P2034') return true;

    if (error.code === 'P2010') {
      const meta = (error.meta ?? {}) as any;
      const metaCode = typeof meta.code === 'string' ? meta.code.toUpperCase() : null;
      if (metaCode === '40001') return true;

      const databaseErrorSqlState = extractSqlStateFromDatabaseError(meta.database_error);
      if (databaseErrorSqlState === '40001') return true;
    }

    return false;
  }

  const maybePgError = error as any;
  const directCode = typeof maybePgError?.code === 'string' ? maybePgError.code.toUpperCase() : null;
  return directCode === '40001';
}

function assertOpeningBalanceConstraint(balance: bigint, allowsNegativeBalance: boolean) {
  if (balance < BigInt(0) && !allowsNegativeBalance) {
    throw new FinanceWriteError(400, 'opening_balance_cents negativo exige allows_negative_balance=true');
  }
}

type FinanceActor = {
  id: string;
  role: string;
  email?: string;
  ip?: string;
  ua?: string;
};

function isSuperAdmin(actor: FinanceActor) {
  return actor.role === 'SUPER_ADMIN';
}

function hasAnyField(data: Record<string, any>, fields: readonly string[]) {
  return fields.some((field) => Object.prototype.hasOwnProperty.call(data, field));
}

function ensureOnlyAllowedFields(data: Record<string, any>, allowedFields: readonly string[], message: string) {
  const invalidFields = Object.keys(data).filter(
    (field) => field !== 'expected_updated_at' && !allowedFields.includes(field),
  );
  if (invalidFields.length > 0) {
    throw new FinanceWriteError(403, message);
  }
}

function buildAccountId() {
  return `facc_${randomUUID().replace(/-/g, '')}`;
}

function buildCategoryId() {
  return `fcat_${randomUUID().replace(/-/g, '')}`;
}

function buildCostCenterId() {
  return `fcc_${randomUUID().replace(/-/g, '')}`;
}

async function assertCategoryParent(parentId: string | null | undefined, kind?: string) {
  if (!parentId) return;
  const parent = await prisma.financial_categories.findUnique({ where: { id: parentId }, select: { id: true, kind: true } });
  if (!parent) throw new FinanceWriteError(404, 'Categoria pai não encontrada');
  if (kind && parent.kind !== kind) throw new FinanceWriteError(400, 'kind da categoria pai deve ser igual ao da categoria filha');
}

async function lockRow(tx: any, tableName: 'financial_accounts' | 'financial_categories' | 'financial_cost_centers' | 'financial_recognition_policies', id: string) {
  const rows: Array<{ id: string }> = await tx.$queryRawUnsafe(
    `SELECT id FROM "${tableName}" WHERE id = $1 FOR UPDATE`,
    id,
  );
  return rows.length > 0;
}

async function countAccountTransactions(tx: any, accountId: string, statuses?: readonly string[]) {
  return tx.financial_transactions.count({
    where: {
      OR: [{ account_id: accountId }, { counterparty_account_id: accountId }],
      ...(statuses ? { status: { in: [...statuses] } } : {}),
    },
  });
}

async function countCategoryTransactions(tx: any, categoryId: string, statuses?: readonly string[]) {
  return tx.financial_transactions.count({
    where: {
      category_id: categoryId,
      ...(statuses ? { status: { in: [...statuses] } } : {}),
    },
  });
}

async function countCategoryAllocations(tx: any, categoryId: string, statuses?: readonly string[]) {
  return tx.financial_transaction_allocations.count({
    where: {
      category_id: categoryId,
      ...(statuses ? { transaction: { status: { in: [...statuses] } } } : {}),
    },
  });
}

async function countCostCenterTransactions(tx: any, costCenterId: string, statuses?: readonly string[]) {
  return tx.financial_transactions.count({
    where: {
      cost_center_id: costCenterId,
      ...(statuses ? { status: { in: [...statuses] } } : {}),
    },
  });
}

async function countCostCenterAllocations(tx: any, costCenterId: string, statuses?: readonly string[]) {
  return tx.financial_transaction_allocations.count({
    where: {
      cost_center_id: costCenterId,
      ...(statuses ? { transaction: { status: { in: [...statuses] } } } : {}),
    },
  });
}

async function countActiveCategoryChildren(tx: any, categoryId: string) {
  return tx.financial_categories.count({ where: { parent_id: categoryId, is_active: true } });
}

async function countCategoryChildren(tx: any, categoryId: string) {
  return tx.financial_categories.count({ where: { parent_id: categoryId } });
}

async function countActiveCostCenterChildren(tx: any, costCenterId: string) {
  return tx.financial_cost_centers.count({ where: { parent_id: costCenterId, is_active: true } });
}

async function countCostCenterChildren(tx: any, costCenterId: string) {
  return tx.financial_cost_centers.count({ where: { parent_id: costCenterId } });
}

async function assertCategoryHierarchy(tx: any, parentId: string | null | undefined, selfId: string | null, expectedKind: string) {
  if (!parentId) return;

  let cursor: string | null = parentId;
  const seen = new Set<string>();

  for (let depth = 0; depth < HIERARCHY_DEPTH_LIMIT && cursor; depth += 1) {
    if (selfId && cursor === selfId) {
      throw new FinanceWriteError(409, 'Ciclo hierárquico em categoria');
    }
    if (seen.has(cursor)) {
      throw new FinanceWriteError(409, 'Hierarquia de categoria inválida');
    }
    seen.add(cursor);

    const parent: any = await tx.financial_categories.findUnique({
      where: { id: cursor },
      select: { id: true, parent_id: true, kind: true },
    });

    if (!parent) {
      if (depth === 0) throw new FinanceWriteError(404, 'Categoria pai não encontrada');
      throw new FinanceWriteError(409, 'Hierarquia de categoria inválida');
    }

    if (depth === 0 && parent.kind !== expectedKind) {
      throw new FinanceWriteError(409, 'kind da categoria pai deve ser igual ao da categoria filha');
    }

    cursor = parent.parent_id;
  }

  if (cursor) {
    throw new FinanceWriteError(409, 'Hierarquia de categoria excede o limite seguro');
  }
}

async function assertCostCenterHierarchy(tx: any, parentId: string | null | undefined, selfId: string | null) {
  if (!parentId) return;

  let cursor: string | null = parentId;
  const seen = new Set<string>();

  for (let depth = 0; depth < HIERARCHY_DEPTH_LIMIT && cursor; depth += 1) {
    if (selfId && cursor === selfId) {
      throw new FinanceWriteError(409, 'Ciclo hierárquico em centro de custo');
    }
    if (seen.has(cursor)) {
      throw new FinanceWriteError(409, 'Hierarquia de centro de custo inválida');
    }
    seen.add(cursor);

    const parent: any = await tx.financial_cost_centers.findUnique({
      where: { id: cursor },
      select: { id: true, parent_id: true },
    });

    if (!parent) {
      if (depth === 0) throw new FinanceWriteError(404, 'Centro de custo pai não encontrado');
      throw new FinanceWriteError(409, 'Hierarquia de centro de custo inválida');
    }

    cursor = parent.parent_id;
  }

  if (cursor) {
    throw new FinanceWriteError(409, 'Hierarquia de centro de custo excede o limite seguro');
  }
}

function serializeAccountAuditState(record: any) {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    type: record.type,
    institution_name: record.institution_name ?? null,
    bank_code: record.bank_code ?? null,
    currency: record.currency,
    opening_balance_cents: record.opening_balance_cents?.toString() ?? '0',
    opening_balance_date: record.opening_balance_date?.toISOString?.() ?? record.opening_balance_date ?? null,
    allows_negative_balance: record.allows_negative_balance,
    is_cash_equivalent: record.is_cash_equivalent,
    is_active: record.is_active,
    notes: record.notes ?? null,
    created_by_admin_id: record.created_by_admin_id ?? null,
    updated_by_admin_id: record.updated_by_admin_id ?? null,
    created_at: record.created_at?.toISOString?.() ?? record.created_at ?? null,
    updated_at: record.updated_at?.toISOString?.() ?? record.updated_at ?? null,
  };
}

function serializeCategoryAuditState(record: any) {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    kind: record.kind,
    parent_id: record.parent_id ?? null,
    default_direction: record.default_direction ?? null,
    requires_document: record.requires_document,
    is_system: record.is_system,
    is_active: record.is_active,
    is_postable: record.is_postable,
    sort_order: record.sort_order,
    created_by_admin_id: record.created_by_admin_id ?? null,
    updated_by_admin_id: record.updated_by_admin_id ?? null,
    created_at: record.created_at?.toISOString?.() ?? record.created_at ?? null,
    updated_at: record.updated_at?.toISOString?.() ?? record.updated_at ?? null,
  };
}

function serializeCostCenterAuditState(record: any) {
  return {
    id: record.id,
    code: record.code,
    name: record.name,
    type: record.type,
    parent_id: record.parent_id ?? null,
    territory_id: record.territory_id ?? null,
    city: record.city ?? null,
    state: record.state ?? null,
    is_active: record.is_active,
    created_by_admin_id: record.created_by_admin_id ?? null,
    updated_by_admin_id: record.updated_by_admin_id ?? null,
    created_at: record.created_at?.toISOString?.() ?? record.created_at ?? null,
    updated_at: record.updated_at?.toISOString?.() ?? record.updated_at ?? null,
  };
}

async function assertCostCenterParent(parentId: string | null | undefined) {
  if (!parentId) return;
  const parent = await prisma.financial_cost_centers.findUnique({ where: { id: parentId }, select: { id: true } });
  if (!parent) throw new FinanceWriteError(404, 'Centro de custo pai não encontrado');
}

async function assertTerritory(tx: any, territoryId: string | null | undefined) {
  if (!territoryId) return;
  const territory = await tx.operational_territories.findUnique({ where: { id: territoryId }, select: { id: true } });
  if (!territory) throw new FinanceWriteError(404, 'Território não encontrado');
}

function paginationResult<T>(rows: T[], total: number, page: number, limit: number) {
  return {
    rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit),
    },
  };
}

function buildStringSearchWhere(search: string | undefined, fields: string[]) {
  if (!search) return undefined;
  return {
    OR: fields.map((field) => ({ [field]: { contains: search, mode: 'insensitive' } })),
  };
}

function dateFieldFilter(field: string, dateFrom?: Date, dateTo?: Date) {
  if (!dateFrom && !dateTo) return undefined;
  return {
    [field]: {
      ...(dateFrom ? { gte: dateFrom } : {}),
      ...(dateTo ? { lte: dateTo } : {}),
    },
  };
}

export async function listFinanceAccounts(query: any) {
  const where: any = {};
  const searchFilter = buildStringSearchWhere(query.search, ['code', 'name']);
  if (searchFilter) Object.assign(where, searchFilter);
  if (query.type) where.type = query.type;
  if (query.is_active !== undefined) where.is_active = query.is_active;
  if (query.is_cash_equivalent !== undefined) where.is_cash_equivalent = query.is_cash_equivalent;
  if (query.allows_negative_balance !== undefined) where.allows_negative_balance = query.allows_negative_balance;

  const [rows, total] = await Promise.all([
    prisma.financial_accounts.findMany({
      where,
      orderBy: [{ is_active: 'desc' }, { name: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        institution_name: true,
        bank_code: true,
        currency: true,
        opening_balance_cents: true,
        opening_balance_date: true,
        allows_negative_balance: true,
        is_cash_equivalent: true,
        is_active: true,
        notes: true,
        created_at: true,
        updated_at: true,
        created_by_admin: { select: { id: true, name: true, role: true } },
        updated_by_admin: { select: { id: true, name: true, role: true } },
      },
    }),
    prisma.financial_accounts.count({ where }),
  ]);

  return paginationResult(rows, total, query.page, query.limit);
}

export async function getFinanceAccountById(id: string) {
  return prisma.financial_accounts.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      institution_name: true,
      bank_code: true,
      currency: true,
      opening_balance_cents: true,
      opening_balance_date: true,
      allows_negative_balance: true,
      is_cash_equivalent: true,
      is_active: true,
      notes: true,
      created_at: true,
      updated_at: true,
      created_by_admin_id: true,
      updated_by_admin_id: true,
      created_by_admin: { select: { id: true, name: true, role: true } },
      updated_by_admin: { select: { id: true, name: true, role: true } },
    },
  });
}

export async function listFinanceCategories(query: any) {
  const where: any = {};
  if (query.kind) where.kind = query.kind;
  if (query.parent_id) where.parent_id = query.parent_id;
  if (query.is_active !== undefined) where.is_active = query.is_active;
  if (query.is_system !== undefined) where.is_system = query.is_system;

  const [rows, total] = await Promise.all([
    prisma.financial_categories.findMany({
      where,
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        code: true,
        name: true,
        kind: true,
        parent_id: true,
        default_direction: true,
        requires_document: true,
        is_system: true,
        is_active: true,
        is_postable: true,
        sort_order: true,
        created_at: true,
        updated_at: true,
        created_by_admin: { select: { id: true, name: true, role: true } },
        updated_by_admin: { select: { id: true, name: true, role: true } },
        parent: { select: { id: true, code: true, name: true, kind: true, is_active: true, is_postable: true, sort_order: true } },
        _count: { select: { children: true } },
      },
    }),
    prisma.financial_categories.count({ where }),
  ]);

  return paginationResult(rows, total, query.page, query.limit);
}

export async function getFinanceCategoryById(id: string) {
  return prisma.financial_categories.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      kind: true,
      parent_id: true,
      default_direction: true,
      requires_document: true,
      is_system: true,
      is_active: true,
      is_postable: true,
      sort_order: true,
      created_at: true,
      updated_at: true,
      created_by_admin_id: true,
      updated_by_admin_id: true,
      created_by_admin: { select: { id: true, name: true, role: true } },
      updated_by_admin: { select: { id: true, name: true, role: true } },
      parent: { select: { id: true, code: true, name: true, kind: true, is_active: true, is_postable: true, sort_order: true } },
      children: { select: { id: true, code: true, name: true, kind: true, is_active: true, is_postable: true, sort_order: true }, orderBy: [{ sort_order: 'asc' }, { name: 'asc' }] },
    },
  });
}

export async function listFinanceCostCenters(query: any) {
  const where: any = {};
  if (query.type) where.type = query.type;
  if (query.parent_id) where.parent_id = query.parent_id;
  if (query.territory_id) where.territory_id = query.territory_id;
  if (query.city) where.city = query.city;
  if (query.state) where.state = query.state;
  if (query.is_active !== undefined) where.is_active = query.is_active;

  const [rows, total] = await Promise.all([
    prisma.financial_cost_centers.findMany({
      where,
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        parent_id: true,
        territory_id: true,
        city: true,
        state: true,
        is_active: true,
        created_at: true,
        updated_at: true,
        created_by_admin: { select: { id: true, name: true, role: true } },
        updated_by_admin: { select: { id: true, name: true, role: true } },
        parent: { select: { id: true, code: true, name: true, type: true, is_active: true } },
        territory: { select: { id: true, name: true, status: true } },
        _count: { select: { children: true } },
      },
    }),
    prisma.financial_cost_centers.count({ where }),
  ]);

  return paginationResult(rows, total, query.page, query.limit);
}

export async function getFinanceCostCenterById(id: string) {
  return prisma.financial_cost_centers.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      type: true,
      parent_id: true,
      territory_id: true,
      city: true,
      state: true,
      is_active: true,
      created_at: true,
      updated_at: true,
      created_by_admin_id: true,
      updated_by_admin_id: true,
      created_by_admin: { select: { id: true, name: true, role: true } },
      updated_by_admin: { select: { id: true, name: true, role: true } },
      parent: { select: { id: true, code: true, name: true, type: true, is_active: true } },
      territory: { select: { id: true, name: true, status: true } },
      children: { select: { id: true, code: true, name: true, type: true, is_active: true }, orderBy: [{ type: 'asc' }, { name: 'asc' }] },
    },
  });
}

export async function listFinanceRecognitionPolicies(query: any) {
  const where: any = {};
  if (query.subject) where.subject = query.subject;
  if (query.scope_type) where.scope_type = query.scope_type;
  if (query.policy) where.policy = query.policy;
  if (query.status) where.status = query.status;
  if (query.territory_id) where.territory_id = query.territory_id;
  if (query.cost_center_id) where.cost_center_id = query.cost_center_id;
  if (query.city) where.city = query.city;
  if (query.state) where.state = query.state;

  const [rows, total] = await Promise.all([
    prisma.financial_recognition_policies.findMany({
      where,
      orderBy: [{ subject: 'asc' }, { effective_from: 'desc' }, { created_at: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        code: true,
        subject: true,
        scope_type: true,
        territory_id: true,
        cost_center_id: true,
        city: true,
        state: true,
        policy: true,
        status: true,
        effective_from: true,
        effective_until: true,
        approved_by_admin_id: true,
        approved_at: true,
        reason: true,
        notes: true,
        created_by_admin_id: true,
        updated_by_admin_id: true,
        created_at: true,
        updated_at: true,
        territory: { select: { id: true, name: true, status: true } },
        cost_center: { select: { id: true, code: true, name: true, type: true, is_active: true } },
        approved_by_admin: { select: { id: true, name: true, role: true } },
        created_by_admin: { select: { id: true, name: true, role: true } },
        updated_by_admin: { select: { id: true, name: true, role: true } },
      },
    }),
    prisma.financial_recognition_policies.count({ where }),
  ]);

  return paginationResult(rows, total, query.page, query.limit);
}

export async function getFinanceRecognitionPolicyById(id: string) {
  return prisma.financial_recognition_policies.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      subject: true,
      scope_type: true,
      territory_id: true,
      cost_center_id: true,
      city: true,
      state: true,
      policy: true,
      status: true,
      effective_from: true,
      effective_until: true,
      approved_by_admin_id: true,
      approved_at: true,
      reason: true,
      notes: true,
      created_by_admin_id: true,
      updated_by_admin_id: true,
      created_at: true,
      updated_at: true,
      territory: { select: { id: true, name: true, status: true } },
      cost_center: { select: { id: true, code: true, name: true, type: true, is_active: true } },
      approved_by_admin: { select: { id: true, name: true, role: true } },
      created_by_admin: { select: { id: true, name: true, role: true } },
      updated_by_admin: { select: { id: true, name: true, role: true } },
    },
  });
}

export async function listFinanceTransactions(query: any) {
  const where: any = {};
  const search = query.search;

  if (query.account_id) where.account_id = query.account_id;
  if (query.counterparty_account_id) where.counterparty_account_id = query.counterparty_account_id;
  if (query.category_id) where.category_id = query.category_id;
  if (query.cost_center_id) where.cost_center_id = query.cost_center_id;
  if (query.direction) where.direction = query.direction;
  if (query.transaction_type) where.transaction_type = query.transaction_type;
  if (query.status) where.status = query.status;
  if (query.payment_method) where.payment_method = query.payment_method;
  if (query.source_type) where.source_type = query.source_type;
  if (query.origin_type) where.origin_type = query.origin_type;
  if (query.provider) where.provider = query.provider;
  if (query.transfer_group_id) where.transfer_group_id = query.transfer_group_id;

  const searchFilter = buildStringSearchWhere(search, ['description', 'memo', 'external_reference', 'source_id', 'origin_id', 'provider_event_id', 'idempotency_key']);
  if (searchFilter) Object.assign(where, searchFilter);

  if (query.date_from || query.date_to) {
    Object.assign(where, dateFieldFilter(query.date_field, query.date_from, query.date_to));
  }

  const [rows, total] = await Promise.all([
    prisma.financial_transactions.findMany({
      where,
      orderBy: [{ transaction_date: 'desc' }, { created_at: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      select: {
        id: true,
        description: true,
        direction: true,
        transaction_type: true,
        status: true,
        payment_method: true,
        source_type: true,
        source_id: true,
        origin_type: true,
        origin_id: true,
        reversal_of_id: true,
        competence_date: true,
        transaction_date: true,
        due_date: true,
        settlement_date: true,
        gross_amount_cents: true,
        fee_amount_cents: true,
        discount_amount_cents: true,
        retention_amount_cents: true,
        net_amount_cents: true,
        transfer_amount_cents: true,
        created_at: true,
        updated_at: true,
        account: { select: { id: true, code: true, name: true, type: true, is_active: true } },
        counterparty_account: { select: { id: true, code: true, name: true, type: true, is_active: true } },
        category: { select: { id: true, code: true, name: true, kind: true, is_active: true, is_postable: true } },
        cost_center: { select: { id: true, code: true, name: true, type: true, is_active: true } },
      },
    }),
    prisma.financial_transactions.count({ where }),
  ]);

  return paginationResult(rows, total, query.page, query.limit);
}

export async function getFinanceTransactionById(id: string) {
  return prisma.financial_transactions.findUnique({
    where: { id },
    select: FINANCE_TRANSACTION_DETAIL_SELECT,
  });
}

export async function createFinanceAccount(data: any, actor: FinanceActor) {
  try {
    const openingBalance = BigInt(data.opening_balance_cents ?? '0');
    const allowsNegativeBalance = data.allows_negative_balance ?? false;
    assertOpeningBalanceConstraint(openingBalance, allowsNegativeBalance);

    const created = await prisma.financial_accounts.create({
      data: {
        id: buildAccountId(),
        code: data.code,
        name: data.name,
        type: data.type,
        institution_name: data.institution_name ?? null,
        bank_code: data.bank_code ?? null,
        currency: data.currency ?? 'BRL',
        opening_balance_cents: openingBalance,
        opening_balance_date: data.opening_balance_date ?? null,
        allows_negative_balance: allowsNegativeBalance,
        is_cash_equivalent: data.is_cash_equivalent ?? false,
        is_active: data.is_active ?? true,
        notes: data.notes ?? null,
        created_by_admin_id: actor.id,
        updated_by_admin_id: actor.id,
      },
    });

    const record = await getFinanceAccountById(created.id);
    return {
      record,
      auditBefore: null,
      auditAfter: serializeAccountAuditState(created),
    };
  } catch (error) {
    if (isCodeUniqueViolation(error)) throw new FinanceWriteError(409, 'code já existe');
    if (isSerializableConflict(error)) throw new FinanceWriteError(409, SERIALIZABLE_CONFLICT_MESSAGE);
    throw error;
  }
}

export async function updateFinanceAccount(id: string, data: any, actor: FinanceActor) {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const exists = await lockRow(tx, 'financial_accounts', id);
      if (!exists) throw new FinanceWriteError(404, 'Conta financeira não encontrada');

    const current = await tx.financial_accounts.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        institution_name: true,
        bank_code: true,
        currency: true,
        opening_balance_cents: true,
        opening_balance_date: true,
        allows_negative_balance: true,
        is_cash_equivalent: true,
        is_active: true,
        notes: true,
        created_by_admin_id: true,
        updated_by_admin_id: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!current) throw new FinanceWriteError(404, 'Conta financeira não encontrada');

    if (!isSuperAdmin(actor)) {
      ensureOnlyAllowedFields(data, ACCOUNT_FINANCE_PATCH_FIELDS, 'Campo sem permissão para FINANCE');
    }

    const touchesStructuralFields = hasAnyField(data, ACCOUNT_STRUCTURAL_FIELDS);
    if (touchesStructuralFields && !isSuperAdmin(actor)) {
      throw new FinanceWriteError(403, 'Campo estrutural exige SUPER_ADMIN');
    }

    const [relatedTransactionsCount, nonFinalTransactionsCount] = await Promise.all([
      (touchesStructuralFields ? countAccountTransactions(tx, id) : Promise.resolve(0)),
      (data.is_active === false && current.is_active ? countAccountTransactions(tx, id, NON_FINAL_TRANSACTION_STATUSES) : Promise.resolve(0)),
    ]);

    if (touchesStructuralFields && relatedTransactionsCount > 0) {
      throw new FinanceWriteError(409, 'Campo estrutural bloqueado porque a conta já foi usada');
    }

    if (data.is_active === false && current.is_active && nonFinalTransactionsCount > 0) {
      throw new FinanceWriteError(409, 'Conta não pode ser desativada com transações não finais');
    }

      const nextOpeningBalance = data.opening_balance_cents !== undefined
        ? BigInt(data.opening_balance_cents)
        : current.opening_balance_cents;
      const nextAllowsNegativeBalance = data.allows_negative_balance !== undefined
        ? data.allows_negative_balance
        : current.allows_negative_balance;
      assertOpeningBalanceConstraint(nextOpeningBalance, nextAllowsNegativeBalance);

      const updateData: any = { updated_by_admin_id: actor.id };
      for (const key of [
        'code',
        'name',
        'type',
        'institution_name',
        'bank_code',
        'currency',
        'opening_balance_date',
        'allows_negative_balance',
        'is_cash_equivalent',
        'is_active',
        'notes',
      ]) {
        if (data[key] !== undefined) updateData[key] = data[key];
      }
      if (data.opening_balance_cents !== undefined) {
        updateData.opening_balance_cents = nextOpeningBalance;
      }

      const updated = await tx.financial_accounts.updateMany({
        where: { id, updated_at: data.expected_updated_at },
        data: updateData,
      });

      if (updated.count !== 1) {
        throw new FinanceWriteError(409, 'Conflito de atualização (expected_updated_at divergente)');
      }

      const after = await tx.financial_accounts.findUnique({
        where: { id },
        select: {
          id: true,
          code: true,
          name: true,
          type: true,
          institution_name: true,
          bank_code: true,
          currency: true,
          opening_balance_cents: true,
          opening_balance_date: true,
          allows_negative_balance: true,
          is_cash_equivalent: true,
          is_active: true,
          notes: true,
          created_by_admin_id: true,
          updated_by_admin_id: true,
          created_at: true,
          updated_at: true,
        },
      });

      return {
        auditBefore: serializeAccountAuditState(current),
        auditAfter: serializeAccountAuditState(after),
      };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const record = await getFinanceAccountById(id);
    return { record, ...result };
  } catch (error) {
    if (isSerializableConflict(error)) throw new FinanceWriteError(409, SERIALIZABLE_CONFLICT_MESSAGE);
    throw error;
  }
}

export async function createFinanceCategory(data: any, actor: FinanceActor) {
  try {
    const created = await prisma.$transaction(async (tx) => {
      await assertCategoryHierarchy(tx, data.parent_id, null, data.kind);

      return tx.financial_categories.create({
        data: {
          id: buildCategoryId(),
          code: data.code,
          name: data.name,
          kind: data.kind,
          parent_id: data.parent_id ?? null,
          default_direction: data.default_direction ?? null,
          requires_document: data.requires_document ?? false,
          is_system: false,
          is_active: data.is_active ?? true,
          is_postable: false,
          sort_order: data.sort_order ?? 0,
          created_by_admin_id: actor.id,
          updated_by_admin_id: actor.id,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const record = await getFinanceCategoryById(created.id);
    return {
      record,
      auditBefore: null,
      auditAfter: serializeCategoryAuditState(created),
    };
  } catch (error) {
    if (isCodeUniqueViolation(error)) throw new FinanceWriteError(409, 'code já existe');
    if (isSerializableConflict(error)) throw new FinanceWriteError(409, SERIALIZABLE_CONFLICT_MESSAGE);
    throw error;
  }
}

export async function updateFinanceCategory(id: string, data: any, actor: FinanceActor) {
  try {
    const result = await prisma.$transaction(async (tx) => {
    const exists = await lockRow(tx, 'financial_categories', id);
    if (!exists) throw new FinanceWriteError(404, 'Categoria financeira não encontrada');

    const current = await tx.financial_categories.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        kind: true,
        parent_id: true,
        default_direction: true,
        requires_document: true,
        is_system: true,
        is_active: true,
        sort_order: true,
        created_by_admin_id: true,
        updated_by_admin_id: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!current) throw new FinanceWriteError(404, 'Categoria financeira não encontrada');

    if (!isSuperAdmin(actor)) {
      if (current.is_system) {
        throw new FinanceWriteError(403, 'FINANCE não pode editar categoria de sistema');
      }
      ensureOnlyAllowedFields(data, CATEGORY_FINANCE_PATCH_FIELDS, 'Campo sem permissão para FINANCE');
    }

    if (current.is_system && isSuperAdmin(actor)) {
      const protectedFields = Object.keys(data).filter(
        (field) => field !== 'expected_updated_at' && !CATEGORY_SYSTEM_SUPER_ADMIN_PATCH_FIELDS.includes(field as any),
      );
      if (protectedFields.length > 0) {
        throw new FinanceWriteError(409, 'Categoria de sistema protegida');
      }
    }

    if (data.parent_id === id) {
      throw new FinanceWriteError(409, 'Categoria não pode apontar para si mesma');
    }

    const nextKind = data.kind ?? current.kind;
    const willDeactivate = data.is_active === false && current.is_active;
    const touchesStructuralFields = hasAnyField(data, ['code', 'kind']);
    const kindWillChange = data.kind !== undefined && data.kind !== current.kind;

    if (touchesStructuralFields && !isSuperAdmin(actor)) {
      throw new FinanceWriteError(403, 'Campo estrutural exige SUPER_ADMIN');
    }

    const [childrenCount, activeChildrenCount, txUsageCount, allocationUsageCount, nonFinalTxCount, nonFinalAllocationCount] = await Promise.all([
      (kindWillChange ? countCategoryChildren(tx, id) : Promise.resolve(0)),
      (willDeactivate ? countActiveCategoryChildren(tx, id) : Promise.resolve(0)),
      (touchesStructuralFields ? countCategoryTransactions(tx, id) : Promise.resolve(0)),
      (touchesStructuralFields ? countCategoryAllocations(tx, id) : Promise.resolve(0)),
      (willDeactivate ? countCategoryTransactions(tx, id, NON_FINAL_TRANSACTION_STATUSES) : Promise.resolve(0)),
      (willDeactivate ? countCategoryAllocations(tx, id, NON_FINAL_TRANSACTION_STATUSES) : Promise.resolve(0)),
    ]);

    if (kindWillChange && childrenCount > 0) {
      throw new FinanceWriteError(409, 'kind não pode ser alterado quando a categoria possui filhos');
    }
    if (touchesStructuralFields && (txUsageCount > 0 || allocationUsageCount > 0)) {
      throw new FinanceWriteError(409, 'Campo estrutural bloqueado porque a categoria já foi usada');
    }
    if (willDeactivate && activeChildrenCount > 0) {
      throw new FinanceWriteError(409, 'Categoria não pode ser desativada com filho ativo');
    }
    if (willDeactivate && (nonFinalTxCount > 0 || nonFinalAllocationCount > 0)) {
      throw new FinanceWriteError(409, 'Categoria não pode ser desativada com uso não final');
    }

    if (data.parent_id !== undefined || kindWillChange) {
      await assertCategoryHierarchy(tx, data.parent_id ?? current.parent_id, id, nextKind);
    }

    const updateData: any = { updated_by_admin_id: actor.id };
    for (const key of ['code', 'name', 'kind', 'parent_id', 'default_direction', 'requires_document', 'is_active', 'sort_order']) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }

    const updated = await tx.financial_categories.updateMany({
      where: { id, updated_at: data.expected_updated_at },
      data: updateData,
    });

    if (updated.count !== 1) {
      throw new FinanceWriteError(409, 'Conflito de atualização (expected_updated_at divergente)');
    }

    const after = await tx.financial_categories.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        kind: true,
        parent_id: true,
        default_direction: true,
        requires_document: true,
        is_system: true,
        is_active: true,
        sort_order: true,
        created_by_admin_id: true,
        updated_by_admin_id: true,
        created_at: true,
        updated_at: true,
      },
    });

    return {
      auditBefore: serializeCategoryAuditState(current),
      auditAfter: serializeCategoryAuditState(after),
    };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const record = await getFinanceCategoryById(id);
    return { record, ...result };
  } catch (error) {
    if (isSerializableConflict(error)) throw new FinanceWriteError(409, SERIALIZABLE_CONFLICT_MESSAGE);
    throw error;
  }
}

export async function createFinanceCostCenter(data: any, actor: FinanceActor) {
  try {
    const created = await prisma.$transaction(async (tx) => {
      await assertCostCenterHierarchy(tx, data.parent_id, null);
      await assertTerritory(tx, data.territory_id);

      return tx.financial_cost_centers.create({
        data: {
          id: buildCostCenterId(),
          code: data.code,
          name: data.name,
          type: data.type,
          parent_id: data.parent_id ?? null,
          territory_id: data.territory_id ?? null,
          city: data.city ?? null,
          state: data.state ?? null,
          is_active: data.is_active ?? true,
          created_by_admin_id: actor.id,
          updated_by_admin_id: actor.id,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const record = await getFinanceCostCenterById(created.id);
    return {
      record,
      auditBefore: null,
      auditAfter: serializeCostCenterAuditState(created),
    };
  } catch (error) {
    if (isCodeUniqueViolation(error)) throw new FinanceWriteError(409, 'code já existe');
    if (isSerializableConflict(error)) throw new FinanceWriteError(409, SERIALIZABLE_CONFLICT_MESSAGE);
    throw error;
  }
}

export async function updateFinanceCostCenter(id: string, data: any, actor: FinanceActor) {
  try {
    const result = await prisma.$transaction(async (tx) => {
    const exists = await lockRow(tx, 'financial_cost_centers', id);
    if (!exists) throw new FinanceWriteError(404, 'Centro de custo não encontrado');

    const current = await tx.financial_cost_centers.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        parent_id: true,
        territory_id: true,
        city: true,
        state: true,
        is_active: true,
        created_by_admin_id: true,
        updated_by_admin_id: true,
        created_at: true,
        updated_at: true,
      },
    });

    if (!current) throw new FinanceWriteError(404, 'Centro de custo não encontrado');

    if (!isSuperAdmin(actor)) {
      ensureOnlyAllowedFields(data, COST_CENTER_FINANCE_PATCH_FIELDS, 'Campo sem permissão para FINANCE');
    }

    const touchesStructuralFields = hasAnyField(data, COST_CENTER_STRUCTURAL_FIELDS);
    const typeWillChange = data.type !== undefined && data.type !== current.type;
    const willDeactivate = data.is_active === false && current.is_active;

    if (touchesStructuralFields && !isSuperAdmin(actor)) {
      throw new FinanceWriteError(403, 'Campo estrutural exige SUPER_ADMIN');
    }
    if (data.parent_id === id) {
      throw new FinanceWriteError(409, 'Centro de custo não pode apontar para si mesmo');
    }

    const [childrenCount, activeChildrenCount, txUsageCount, allocationUsageCount, nonFinalTxCount, nonFinalAllocationCount] = await Promise.all([
      (typeWillChange ? countCostCenterChildren(tx, id) : Promise.resolve(0)),
      (willDeactivate ? countActiveCostCenterChildren(tx, id) : Promise.resolve(0)),
      (touchesStructuralFields ? countCostCenterTransactions(tx, id) : Promise.resolve(0)),
      (touchesStructuralFields ? countCostCenterAllocations(tx, id) : Promise.resolve(0)),
      (willDeactivate ? countCostCenterTransactions(tx, id, NON_FINAL_TRANSACTION_STATUSES) : Promise.resolve(0)),
      (willDeactivate ? countCostCenterAllocations(tx, id, NON_FINAL_TRANSACTION_STATUSES) : Promise.resolve(0)),
    ]);

    if (typeWillChange && childrenCount > 0) {
      throw new FinanceWriteError(409, 'type não pode ser alterado quando o centro de custo possui filhos');
    }
    if (touchesStructuralFields && (txUsageCount > 0 || allocationUsageCount > 0)) {
      throw new FinanceWriteError(409, 'Campo estrutural bloqueado porque o centro de custo já foi usado');
    }
    if (willDeactivate && activeChildrenCount > 0) {
      throw new FinanceWriteError(409, 'Centro de custo não pode ser desativado com filho ativo');
    }
    if (willDeactivate && (nonFinalTxCount > 0 || nonFinalAllocationCount > 0)) {
      throw new FinanceWriteError(409, 'Centro de custo não pode ser desativado com uso não final');
    }

    if (data.parent_id !== undefined) {
      await assertCostCenterHierarchy(tx, data.parent_id, id);
    }
    if (data.territory_id !== undefined) {
      await assertTerritory(tx, data.territory_id);
    }

    const updateData: any = { updated_by_admin_id: actor.id };
    for (const key of ['code', 'name', 'type', 'parent_id', 'territory_id', 'city', 'state', 'is_active']) {
      if (data[key] !== undefined) updateData[key] = data[key];
    }

    const updated = await tx.financial_cost_centers.updateMany({
      where: { id, updated_at: data.expected_updated_at },
      data: updateData,
    });

    if (updated.count !== 1) {
      throw new FinanceWriteError(409, 'Conflito de atualização (expected_updated_at divergente)');
    }

    const after = await tx.financial_cost_centers.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        parent_id: true,
        territory_id: true,
        city: true,
        state: true,
        is_active: true,
        created_by_admin_id: true,
        updated_by_admin_id: true,
        created_at: true,
        updated_at: true,
      },
    });

    return {
      auditBefore: serializeCostCenterAuditState(current),
      auditAfter: serializeCostCenterAuditState(after),
    };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const record = await getFinanceCostCenterById(id);
    return { record, ...result };
  } catch (error) {
    if (isSerializableConflict(error)) throw new FinanceWriteError(409, SERIALIZABLE_CONFLICT_MESSAGE);
    throw error;
  }
}

// ─── Recognition Policy helpers ──────────────────────────────────────────────

function buildPolicyId() {
  return `frp_${randomUUID().replace(/-/g, '')}`;
}

function serializePolicyAuditState(policy: any) {
  if (!policy) return null;
  return {
    id: policy.id,
    code: policy.code,
    subject: policy.subject,
    scope_type: policy.scope_type,
    territory_id: policy.territory_id ?? null,
    cost_center_id: policy.cost_center_id ?? null,
    city: policy.city ?? null,
    state: policy.state ?? null,
    policy: policy.policy,
    status: policy.status,
    effective_from: policy.effective_from?.toISOString() ?? null,
    effective_until: policy.effective_until?.toISOString() ?? null,
    approved_by_admin_id: policy.approved_by_admin_id ?? null,
    approved_at: policy.approved_at?.toISOString() ?? null,
    reason: policy.reason,
    notes: policy.notes ?? null,
    created_by_admin_id: policy.created_by_admin_id ?? null,
    updated_by_admin_id: policy.updated_by_admin_id ?? null,
    created_at: policy.created_at?.toISOString() ?? null,
    updated_at: policy.updated_at?.toISOString() ?? null,
  };
}

function buildScopeMatchWhere(scope_type: string, policy: any) {
  switch (scope_type) {
    case 'GLOBAL':
      return { territory_id: null, cost_center_id: null, city: null, state: null };
    case 'TERRITORY':
      return { territory_id: policy.territory_id };
    case 'CITY':
      return { city: policy.city, state: policy.state };
    case 'COST_CENTER':
      return { cost_center_id: policy.cost_center_id };
    default:
      return {};
  }
}

function scopesMatch(a: any, b: any): boolean {
  switch (a.scope_type) {
    case 'GLOBAL':
      return true;
    case 'TERRITORY':
      return a.territory_id === b.territory_id;
    case 'CITY':
      return a.city === b.city && a.state === b.state;
    case 'COST_CENTER':
      return a.cost_center_id === b.cost_center_id;
    default:
      return false;
  }
}

// Checks for an APPROVED policy with the same subject+scope and overlapping dates.
// excludeId: policy to ignore (used during supersede to skip the old policy).
// Runs inside an existing Serializable transaction for concurrency safety.
async function assertNoConflictingApprovedPolicy(tx: Prisma.TransactionClient, policy: any, excludeId: string | null) {
  const scopeWhere = buildScopeMatchWhere(policy.scope_type, policy);

  // Two intervals overlap when: A.from <= B.until AND B.from <= A.until
  // null effective_until means indefinite (+∞), so:
  //   A.until IS NULL always satisfies B.from <= A.until
  //   B.until IS NULL always satisfies A.from <= B.until
  // We use explicit OR conditions to handle NULLs — NOT OR fails because
  // NULL comparisons evaluate to NULL (not FALSE), causing rows to be skipped.
  const overlapConditions: any[] = [
    // existing.until IS NULL (indefinite) OR existing.until >= new.from
    { OR: [{ effective_until: null }, { effective_until: { gte: policy.effective_from } }] },
  ];
  if (policy.effective_until) {
    // new.until IS NOT NULL → existing.from <= new.until
    overlapConditions.push({ effective_from: { lte: policy.effective_until } });
  }

  const conflicts = await tx.financial_recognition_policies.findMany({
    where: {
      ...(excludeId ? { id: { not: excludeId } } : {}),
      subject: policy.subject,
      scope_type: policy.scope_type,
      ...scopeWhere,
      status: 'APPROVED',
      AND: overlapConditions,
    },
    select: { id: true, code: true },
    take: 1,
  });

  if (conflicts.length > 0) {
    throw new FinanceWriteError(409, `Conflito de vigência com policy APPROVED existente: ${conflicts[0].code}`);
  }
}

// The select shape used for all policy reads inside transactions (audit snapshot).
const POLICY_SELECT = {
  id: true,
  code: true,
  subject: true,
  scope_type: true,
  territory_id: true,
  cost_center_id: true,
  city: true,
  state: true,
  policy: true,
  status: true,
  effective_from: true,
  effective_until: true,
  approved_by_admin_id: true,
  approved_at: true,
  reason: true,
  notes: true,
  created_by_admin_id: true,
  updated_by_admin_id: true,
  created_at: true,
  updated_at: true,
} as const;

// ─── Recognition Policy service functions ────────────────────────────────────

export function previousUtcDate(date: Date): Date {
  const prev = new Date(date);
  prev.setUTCDate(prev.getUTCDate() - 1);
  return prev;
}

async function auditInTx(
  tx: Prisma.TransactionClient,
  params: {
    adminId: string;
    adminEmail?: string;
    action: string;
    entityType: string;
    entityId: string;
    oldValue?: any;
    newValue?: any;
    ipAddress?: string;
  },
) {
  const oldJson: string | null = params.oldValue != null ? JSON.stringify(params.oldValue) : null;
  const newJson: string | null = params.newValue != null ? JSON.stringify(params.newValue) : null;
  await tx.$executeRaw`
    INSERT INTO admin_audit_logs
      (admin_id, admin_email, action, entity_type, entity_id, old_value, new_value, ip_address)
    VALUES (
      ${params.adminId},
      ${params.adminEmail ?? null},
      ${params.action},
      ${params.entityType},
      ${params.entityId},
      ${oldJson}::jsonb,
      ${newJson}::jsonb,
      ${params.ipAddress ?? null}
    )
  `;
}

export async function createFinanceRecognitionPolicy(data: any, actor: FinanceActor) {
  if (!isSuperAdmin(actor)) {
    throw new FinanceWriteError(403, 'Criação de política de reconhecimento exige SUPER_ADMIN');
  }

  try {
    const created = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const id = buildPolicyId();
      const policy = await tx.financial_recognition_policies.create({
        data: {
          id,
          code: data.code,
          subject: data.subject,
          scope_type: data.scope_type,
          territory_id: data.territory_id ?? null,
          cost_center_id: data.cost_center_id ?? null,
          city: data.city ?? null,
          state: data.state ?? null,
          policy: data.policy,
          status: 'DRAFT',
          effective_from: data.effective_from,
          effective_until: data.effective_until ?? null,
          reason: data.reason,
          notes: data.notes ?? null,
          approved_by_admin_id: null,
          approved_at: null,
          created_by_admin_id: actor.id,
          updated_by_admin_id: actor.id,
        },
        select: POLICY_SELECT,
      });
      await auditInTx(tx, {
        adminId: actor.id,
        adminEmail: actor.email,
        action: 'FINANCE_RECOGNITION_POLICY_CREATE',
        entityType: 'financial_recognition_policies',
        entityId: policy.id,
        oldValue: null,
        newValue: serializePolicyAuditState(policy),
        ipAddress: actor.ip,
      });
      return policy;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const record = await getFinanceRecognitionPolicyById(created.id);
    return { record };
  } catch (error) {
    if (isCodeUniqueViolation(error)) {
      throw new FinanceWriteError(409, 'Código de política já existe');
    }
    if (isSerializableConflict(error)) throw new FinanceWriteError(409, SERIALIZABLE_CONFLICT_MESSAGE);
    throw error;
  }
}

export async function updateFinanceRecognitionPolicyDraft(id: string, data: any, actor: FinanceActor) {
  if (!isSuperAdmin(actor)) {
    throw new FinanceWriteError(403, 'Edição de política de reconhecimento exige SUPER_ADMIN');
  }

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const exists = await lockRow(tx, 'financial_recognition_policies', id);
      if (!exists) throw new FinanceWriteError(404, 'Política de reconhecimento não encontrada');

      const current = await tx.financial_recognition_policies.findUnique({ where: { id }, select: POLICY_SELECT });
      if (!current) throw new FinanceWriteError(404, 'Política de reconhecimento não encontrada');

      if (current.status !== 'DRAFT') {
        throw new FinanceWriteError(409, 'Somente políticas DRAFT podem ser editadas');
      }

      const updateData: any = { updated_by_admin_id: actor.id };
      for (const key of ['code', 'subject', 'scope_type', 'territory_id', 'cost_center_id', 'city', 'state', 'policy', 'effective_from', 'effective_until', 'reason', 'notes']) {
        if (data[key] !== undefined) updateData[key] = data[key];
      }

      const updated = await tx.financial_recognition_policies.updateMany({
        where: { id, updated_at: data.expected_updated_at },
        data: updateData,
      });

      if (updated.count !== 1) {
        throw new FinanceWriteError(409, 'Conflito de atualização (expected_updated_at divergente)');
      }

      const after = await tx.financial_recognition_policies.findUnique({ where: { id }, select: POLICY_SELECT });
      await auditInTx(tx, {
        adminId: actor.id,
        adminEmail: actor.email,
        action: 'FINANCE_RECOGNITION_POLICY_UPDATE',
        entityType: 'financial_recognition_policies',
        entityId: id,
        oldValue: serializePolicyAuditState(current),
        newValue: serializePolicyAuditState(after),
        ipAddress: actor.ip,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const record = await getFinanceRecognitionPolicyById(id);
    return { record };
  } catch (error) {
    if (isSerializableConflict(error)) throw new FinanceWriteError(409, SERIALIZABLE_CONFLICT_MESSAGE);
    if (isCodeUniqueViolation(error)) throw new FinanceWriteError(409, 'Código de política já existe');
    throw error;
  }
}

export async function approveFinanceRecognitionPolicy(id: string, data: any, actor: FinanceActor) {
  if (!isSuperAdmin(actor)) {
    throw new FinanceWriteError(403, 'Aprovação de política exige SUPER_ADMIN');
  }

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const exists = await lockRow(tx, 'financial_recognition_policies', id);
      if (!exists) throw new FinanceWriteError(404, 'Política de reconhecimento não encontrada');

      const current = await tx.financial_recognition_policies.findUnique({ where: { id }, select: POLICY_SELECT });
      if (!current) throw new FinanceWriteError(404, 'Política de reconhecimento não encontrada');

      if (current.status !== 'DRAFT') {
        throw new FinanceWriteError(409, 'Somente políticas DRAFT podem ser aprovadas');
      }
      if (current.policy === 'UNCLASSIFIED') {
        throw new FinanceWriteError(422, 'Política UNCLASSIFIED não pode ser aprovada');
      }

      await assertNoConflictingApprovedPolicy(tx, current, null);

      const approvedAt = new Date();
      const updated = await tx.financial_recognition_policies.updateMany({
        where: { id, updated_at: data.expected_updated_at },
        data: {
          status: 'APPROVED',
          approved_by_admin_id: actor.id,
          approved_at: approvedAt,
          reason: data.reason,
          updated_by_admin_id: actor.id,
        },
      });

      if (updated.count !== 1) {
        throw new FinanceWriteError(409, 'Conflito de atualização (expected_updated_at divergente)');
      }

      const after = await tx.financial_recognition_policies.findUnique({ where: { id }, select: POLICY_SELECT });
      await auditInTx(tx, {
        adminId: actor.id,
        adminEmail: actor.email,
        action: 'FINANCE_RECOGNITION_POLICY_APPROVE',
        entityType: 'financial_recognition_policies',
        entityId: id,
        oldValue: serializePolicyAuditState(current),
        newValue: serializePolicyAuditState(after),
        ipAddress: actor.ip,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const record = await getFinanceRecognitionPolicyById(id);
    return { record };
  } catch (error) {
    if (isSerializableConflict(error)) throw new FinanceWriteError(409, SERIALIZABLE_CONFLICT_MESSAGE);
    throw error;
  }
}

export async function revokeFinanceRecognitionPolicy(id: string, data: any, actor: FinanceActor) {
  if (!isSuperAdmin(actor)) {
    throw new FinanceWriteError(403, 'Revogação de política exige SUPER_ADMIN');
  }

  try {
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const exists = await lockRow(tx, 'financial_recognition_policies', id);
      if (!exists) throw new FinanceWriteError(404, 'Política de reconhecimento não encontrada');

      const current = await tx.financial_recognition_policies.findUnique({ where: { id }, select: POLICY_SELECT });
      if (!current) throw new FinanceWriteError(404, 'Política de reconhecimento não encontrada');

      if (current.status !== 'APPROVED') {
        throw new FinanceWriteError(409, 'Somente políticas APPROVED podem ser revogadas');
      }

      const updated = await tx.financial_recognition_policies.updateMany({
        where: { id, updated_at: data.expected_updated_at },
        data: {
          status: 'REVOKED',
          reason: data.reason,
          updated_by_admin_id: actor.id,
          // approved_by_admin_id and approved_at are intentionally preserved
        },
      });

      if (updated.count !== 1) {
        throw new FinanceWriteError(409, 'Conflito de atualização (expected_updated_at divergente)');
      }

      const after = await tx.financial_recognition_policies.findUnique({ where: { id }, select: POLICY_SELECT });
      await auditInTx(tx, {
        adminId: actor.id,
        adminEmail: actor.email,
        action: 'FINANCE_RECOGNITION_POLICY_REVOKE',
        entityType: 'financial_recognition_policies',
        entityId: id,
        oldValue: serializePolicyAuditState(current),
        newValue: serializePolicyAuditState(after),
        ipAddress: actor.ip,
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const record = await getFinanceRecognitionPolicyById(id);
    return { record };
  } catch (error) {
    if (isSerializableConflict(error)) throw new FinanceWriteError(409, SERIALIZABLE_CONFLICT_MESSAGE);
    throw error;
  }
}

// Atomically transitions old policy APPROVED → SUPERSEDED and new policy DRAFT → APPROVED.
// Both updates occur in the same Serializable transaction — no window where two APPROVED
// policies with conflicting dates can coexist.
export async function supersedFinanceRecognitionPolicy(id: string, data: any, actor: FinanceActor) {
  if (!isSuperAdmin(actor)) {
    throw new FinanceWriteError(403, 'Substituição de política exige SUPER_ADMIN');
  }

  try {
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // Lock both rows in deterministic lexical-ID order to prevent deadlocks under concurrency.
      const sortedIds = [id, data.replacement_policy_id].sort();
      for (const rowId of sortedIds) {
        const exists = await lockRow(tx, 'financial_recognition_policies', rowId);
        if (!exists) {
          if (rowId === id) throw new FinanceWriteError(404, 'Política original não encontrada');
          throw new FinanceWriteError(404, 'Política de substituição não encontrada');
        }
      }

      const [oldPolicy, newPolicy] = await Promise.all([
        tx.financial_recognition_policies.findUnique({ where: { id }, select: POLICY_SELECT }),
        tx.financial_recognition_policies.findUnique({ where: { id: data.replacement_policy_id }, select: POLICY_SELECT }),
      ]);

      if (!oldPolicy) throw new FinanceWriteError(404, 'Política original não encontrada');
      if (!newPolicy) throw new FinanceWriteError(404, 'Política de substituição não encontrada');

      if (oldPolicy.status !== 'APPROVED') {
        throw new FinanceWriteError(409, 'Política original deve estar APPROVED');
      }
      if (newPolicy.status !== 'DRAFT') {
        throw new FinanceWriteError(409, 'Política de substituição deve estar DRAFT');
      }
      if (newPolicy.policy === 'UNCLASSIFIED') {
        throw new FinanceWriteError(422, 'Política de substituição não pode ser UNCLASSIFIED');
      }
      if (oldPolicy.subject !== newPolicy.subject) {
        throw new FinanceWriteError(409, 'subject da política de substituição deve ser igual ao da original');
      }
      if (oldPolicy.scope_type !== newPolicy.scope_type) {
        throw new FinanceWriteError(409, 'scope_type da política de substituição deve ser igual ao da original');
      }
      if (!scopesMatch(oldPolicy, newPolicy)) {
        throw new FinanceWriteError(409, 'Escopo concreto da política de substituição deve ser igual ao da original');
      }
      if (newPolicy.effective_from <= oldPolicy.effective_from) {
        throw new FinanceWriteError(409, 'effective_from da política de substituição deve ser estritamente posterior ao da original');
      }

      // Compute inclusive upper bound for old policy: day before new policy starts.
      const oldEffectiveUntil = previousUtcDate(newPolicy.effective_from);

      const approvedAt = new Date();

      // OL updates first — throw OL error before conflict check so callers see the right 409 message.
      const [updatedOld, updatedNew] = await Promise.all([
        tx.financial_recognition_policies.updateMany({
          where: { id, updated_at: data.expected_updated_at },
          data: { status: 'SUPERSEDED', effective_until: oldEffectiveUntil, reason: data.reason, updated_by_admin_id: actor.id },
        }),
        tx.financial_recognition_policies.updateMany({
          where: { id: data.replacement_policy_id, updated_at: data.expected_updated_at_new },
          data: {
            status: 'APPROVED',
            approved_by_admin_id: actor.id,
            approved_at: approvedAt,
            reason: data.reason,
            updated_by_admin_id: actor.id,
          },
        }),
      ]);

      if (updatedOld.count !== 1) {
        throw new FinanceWriteError(409, 'Conflito de atualização na política original (expected_updated_at divergente)');
      }
      if (updatedNew.count !== 1) {
        throw new FinanceWriteError(409, 'Conflito de atualização na política de substituição (expected_updated_at_new divergente)');
      }

      // Conflict check: exclude the newly-approved replacement policy itself.
      await assertNoConflictingApprovedPolicy(tx, newPolicy, data.replacement_policy_id);

      const [afterOld, afterNew] = await Promise.all([
        tx.financial_recognition_policies.findUnique({ where: { id }, select: POLICY_SELECT }),
        tx.financial_recognition_policies.findUnique({ where: { id: data.replacement_policy_id }, select: POLICY_SELECT }),
      ]);

      await auditInTx(tx, {
        adminId: actor.id,
        adminEmail: actor.email,
        action: 'FINANCE_RECOGNITION_POLICY_SUPERSEDE',
        entityType: 'financial_recognition_policies',
        entityId: id,
        oldValue: serializePolicyAuditState(oldPolicy),
        newValue: serializePolicyAuditState(afterOld),
        ipAddress: actor.ip,
      });
      await auditInTx(tx, {
        adminId: actor.id,
        adminEmail: actor.email,
        action: 'FINANCE_RECOGNITION_POLICY_APPROVE',
        entityType: 'financial_recognition_policies',
        entityId: data.replacement_policy_id,
        oldValue: serializePolicyAuditState(newPolicy),
        newValue: serializePolicyAuditState(afterNew),
        ipAddress: actor.ip,
      });

      return null;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    const [superseded, approved] = await Promise.all([
      getFinanceRecognitionPolicyById(id),
      getFinanceRecognitionPolicyById(data.replacement_policy_id),
    ]);

    return { superseded, approved };
  } catch (error) {
    if (isSerializableConflict(error)) throw new FinanceWriteError(409, SERIALIZABLE_CONFLICT_MESSAGE);
    throw error;
  }
}
