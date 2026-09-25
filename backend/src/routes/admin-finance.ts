import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { allowFinanceAccess, authenticateAdmin } from '../middlewares/auth';
import { audit, auditCtx } from '../utils/audit';
import {
  financeAccountCreateBodySchema,
  financeAccountPatchBodySchema,
  financeAccountsListQuerySchema,
  financeCategoriesListQuerySchema,
  financeCategoryCreateBodySchema,
  financeCategoryPatchBodySchema,
  financeCostCenterCreateBodySchema,
  financeCostCenterPatchBodySchema,
  financeCostCentersListQuerySchema,
  financeIdParamSchema,
  financeRecognitionPoliciesListQuerySchema,
  financeRecognitionPolicyApproveBodySchema,
  financeRecognitionPolicyCreateBodySchema,
  financeRecognitionPolicyPatchBodySchema,
  financeRecognitionPolicyRevokeBodySchema,
  financeRecognitionPolicySupersedBodySchema,
  financeTransactionsListQuerySchema,
} from '../services/finance/finance-query-validation';
import {
  FinanceWriteError,
  approveFinanceRecognitionPolicy,
  createFinanceAccount,
  createFinanceCategory,
  createFinanceCostCenter,
  createFinanceRecognitionPolicy,
  getFinanceAccountById,
  getFinanceCategoryById,
  getFinanceCostCenterById,
  getFinanceRecognitionPolicyById,
  getFinanceTransactionById,
  listFinanceAccounts,
  listFinanceCategories,
  listFinanceCostCenters,
  listFinanceRecognitionPolicies,
  listFinanceTransactions,
  revokeFinanceRecognitionPolicy,
  supersedFinanceRecognitionPolicy,
  updateFinanceAccount,
  updateFinanceCategory,
  updateFinanceCostCenter,
  updateFinanceRecognitionPolicyDraft,
} from '../services/finance/finance-query.service';
import {
  serializeAccountDetail,
  serializeAccountItem,
  serializeCategoryDetail,
  serializeCategoryListItem,
  serializeCostCenterDetail,
  serializeCostCenterListItem,
  serializeRecognitionPolicyDetail,
  serializeRecognitionPolicyListItem,
  serializeTransactionDetail,
  serializeTransactionItem,
} from '../services/finance/finance-serializers';

const router = Router();

router.use(authenticateAdmin);
router.use(allowFinanceAccess);

function validationError(response: Response, error: any) {
  const message = error?.issues?.[0]?.message || error?.message || 'Query inválida';
  return response.status(400).json({ success: false, error: message });
}

function requireWriteRecord<T>(record: T | null, entityLabel: string): T {
  if (!record) {
    throw new Error(`${entityLabel} não pôde ser recarregado após a operação`);
  }
  return record;
}

function notFound(response: Response, message: string) {
  return response.status(404).json({ success: false, error: message });
}

function financeWriteError(response: Response, error: unknown) {
  if (error instanceof FinanceWriteError) {
    return response.status(error.status).json({ success: false, error: error.message });
  }
  return response.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

async function registerFinanceAudit(
  req: Request,
  action: string,
  entityType: string,
  entityId: string,
  oldValue: any,
  newValue: any,
) {
  const ctx = auditCtx(req);
  await audit({
    adminId: ctx.adminId,
    adminEmail: ctx.adminEmail,
    action,
    entityType,
    entityId,
    oldValue,
    newValue,
    ipAddress: ctx.ip,
    userAgent: ctx.ua,
  });
}

function financeTransactionAuditContext(req: Request): FinanceTransactionAuditContext {
  const ctx = auditCtx(req);
  return {
    adminId: ctx.adminId,
    adminEmail: ctx.adminEmail,
    ipAddress: ctx.ip,
    userAgent: ctx.ua,
  };
}

// ── Independent finance dimensions: legal entity + business unit ───────────

const assignmentCreateSchema = z.object({
  legal_entity_id: z.string().trim().min(1).max(120),
  territory_id: z.string().trim().min(1).max(120),
  effective_from: z.coerce.date(),
  notes: z.string().trim().max(2000).nullable().optional(),
}).strict();

const assignmentCloseSchema = z.object({
  effective_until: z.coerce.date(),
}).strict();

router.get('/business-units', async (req: Request, res: Response) => {
  try {
    const activeOnly = req.query.is_active !== 'false';
    const rows = await prisma.financial_business_units.findMany({
      where: activeOnly ? { is_active: true } : {},
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      select: { id: true, code: true, name: true, description: true, is_system: true, is_active: true, sort_order: true },
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('[ADMIN_FINANCE_BUSINESS_UNITS_LIST]', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

router.get('/entity-territory-assignments', async (req: Request, res: Response) => {
  try {
    const territoryId = typeof req.query.territory_id === 'string' ? req.query.territory_id.trim() : '';
    const legalEntityId = typeof req.query.legal_entity_id === 'string' ? req.query.legal_entity_id.trim() : '';
    const activeOnly = req.query.active_only !== 'false';
    const rows = await prisma.financial_entity_territory_assignments.findMany({
      where: {
        ...(territoryId ? { territory_id: territoryId } : {}),
        ...(legalEntityId ? { legal_entity_id: legalEntityId } : {}),
        ...(activeOnly ? { is_active: true } : {}),
      },
      orderBy: [{ effective_from: 'desc' }, { created_at: 'desc' }],
      select: {
        id: true, legal_entity_id: true, territory_id: true,
        effective_from: true, effective_until: true, is_active: true, notes: true,
        legal_entity: { select: { id: true, razao_social: true, nome_fantasia: true, cnpj: true, entity_type: true, municipio: true, uf: true, is_active: true } },
        territory: { select: { id: true, name: true, level: true, status: true, city_name: true, uf: true, is_active: true } },
      },
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    console.error('[ADMIN_FINANCE_ENTITY_TERRITORY_LIST]', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

router.post('/entity-territory-assignments', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    if (admin?.role !== 'SUPER_ADMIN') return res.status(403).json({ success: false, error: 'Somente SUPER_ADMIN pode vincular filial e território' });
    const parsed = assignmentCreateSchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);
    const { legal_entity_id, territory_id, effective_from, notes } = parsed.data;

    const [entity, territory] = await Promise.all([
      prisma.legal_entities.findUnique({ where: { id: legal_entity_id }, select: { id: true, is_active: true } }),
      prisma.operational_territories.findUnique({ where: { id: territory_id }, select: { id: true, is_active: true } }),
    ]);
    if (!entity) return res.status(404).json({ success: false, error: 'Empresa/filial não encontrada' });
    if (!territory) return res.status(404).json({ success: false, error: 'Território não encontrado' });
    if (!entity.is_active) return res.status(409).json({ success: false, error: 'Empresa/filial está inativa' });
    if (!territory.is_active) return res.status(409).json({ success: false, error: 'Território está inativo' });

    const conflict = await prisma.financial_entity_territory_assignments.findFirst({
      where: {
        territory_id,
        is_active: true,
        OR: [{ effective_until: null }, { effective_until: { gte: effective_from } }],
      },
      select: { id: true, legal_entity_id: true },
    });
    if (conflict) return res.status(409).json({ success: false, error: 'Território já possui empresa/filial responsável no período' });

    const created = await prisma.financial_entity_territory_assignments.create({
      data: { legal_entity_id, territory_id, effective_from, notes: notes ?? null },
      select: { id: true, legal_entity_id: true, territory_id: true, effective_from: true, effective_until: true, is_active: true, notes: true },
    });
    await registerFinanceAudit(req, 'FINANCE_ENTITY_TERRITORY_ASSIGN', 'financial_entity_territory_assignments', created.id, null, created);
    return res.status(201).json({ success: true, data: created });
  } catch (error) {
    console.error('[ADMIN_FINANCE_ENTITY_TERRITORY_CREATE]', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

router.patch('/entity-territory-assignments/:id/close', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    if (admin?.role !== 'SUPER_ADMIN') return res.status(403).json({ success: false, error: 'Somente SUPER_ADMIN pode encerrar vínculo territorial' });
    const id = String(req.params.id || '').trim();
    const parsed = assignmentCloseSchema.safeParse(req.body);
    if (!id || !parsed.success) return validationError(res, parsed.success ? { message: 'ID inválido' } : parsed.error);

    const current = await prisma.financial_entity_territory_assignments.findUnique({ where: { id } });
    if (!current) return res.status(404).json({ success: false, error: 'Vínculo não encontrado' });
    if (!current.is_active) return res.status(409).json({ success: false, error: 'Vínculo já está encerrado' });
    if (parsed.data.effective_until < current.effective_from) return res.status(400).json({ success: false, error: 'effective_until não pode ser anterior a effective_from' });

    const updated = await prisma.financial_entity_territory_assignments.update({
      where: { id },
      data: { effective_until: parsed.data.effective_until, is_active: false },
    });
    await registerFinanceAudit(req, 'FINANCE_ENTITY_TERRITORY_CLOSE', 'financial_entity_territory_assignments', id, current, updated);
    return res.json({ success: true, data: updated });
  } catch (error) {
    console.error('[ADMIN_FINANCE_ENTITY_TERRITORY_CLOSE]', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

router.get('/accounts', async (req: Request, res: Response) => {
  try {
    const parsed = financeAccountsListQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed.error);
    const result = await listFinanceAccounts(parsed.data);
    return res.json({ success: true, data: result.rows.map(serializeAccountItem), pagination: result.pagination });
  } catch (error) {
    console.error('[ADMIN_FINANCE_ACCOUNTS_LIST]', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

router.get('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const parsed = financeIdParamSchema.safeParse(req.params);
    if (!parsed.success) return validationError(res, parsed.error);
    const record = await getFinanceAccountById(parsed.data.id);
    if (!record) return notFound(res, 'Conta financeira não encontrada');
    return res.json({ success: true, data: serializeAccountDetail(record) });
  } catch (error) {
    console.error('[ADMIN_FINANCE_ACCOUNT_DETAIL]', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

router.post('/accounts', async (req: Request, res: Response) => {
  try {
    const parsed = financeAccountCreateBodySchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const admin = (req as any).admin;
    const created = await createFinanceAccount(parsed.data, admin);
    const record = requireWriteRecord(created.record, 'Conta financeira');
    await registerFinanceAudit(req, 'FINANCE_ACCOUNT_CREATE', 'financial_accounts', record.id, created.auditBefore, created.auditAfter);
    return res.status(201).json({ success: true, data: serializeAccountDetail(record) });
  } catch (error) {
    console.error('[ADMIN_FINANCE_ACCOUNT_CREATE]', error);
    return financeWriteError(res, error);
  }
});

router.patch('/accounts/:id', async (req: Request, res: Response) => {
  try {
    const parsedParams = financeIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) return validationError(res, parsedParams.error);

    const parsedBody = financeAccountPatchBodySchema.safeParse(req.body);
    if (!parsedBody.success) return validationError(res, parsedBody.error);

    const admin = (req as any).admin;
    const updated = await updateFinanceAccount(parsedParams.data.id, parsedBody.data, admin);
    const record = requireWriteRecord(updated.record, 'Conta financeira');
    await registerFinanceAudit(req, 'FINANCE_ACCOUNT_UPDATE', 'financial_accounts', record.id, updated.auditBefore, updated.auditAfter);
    return res.json({ success: true, data: serializeAccountDetail(record) });
  } catch (error) {
    console.error('[ADMIN_FINANCE_ACCOUNT_PATCH]', error);
    return financeWriteError(res, error);
  }
});

router.get('/categories', async (req: Request, res: Response) => {
  try {
    const parsed = financeCategoriesListQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed.error);
    const result = await listFinanceCategories(parsed.data);
    return res.json({ success: true, data: result.rows.map(serializeCategoryListItem), pagination: result.pagination });
  } catch (error) {
    console.error('[ADMIN_FINANCE_CATEGORIES_LIST]', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

router.get('/categories/:id', async (req: Request, res: Response) => {
  try {
    const parsed = financeIdParamSchema.safeParse(req.params);
    if (!parsed.success) return validationError(res, parsed.error);
    const record = await getFinanceCategoryById(parsed.data.id);
    if (!record) return notFound(res, 'Categoria financeira não encontrada');
    return res.json({ success: true, data: serializeCategoryDetail(record) });
  } catch (error) {
    console.error('[ADMIN_FINANCE_CATEGORY_DETAIL]', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

router.post('/categories', async (req: Request, res: Response) => {
  try {
    const parsed = financeCategoryCreateBodySchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const admin = (req as any).admin;
    const created = await createFinanceCategory(parsed.data, admin);
    const record = requireWriteRecord(created.record, 'Categoria financeira');
    await registerFinanceAudit(req, 'FINANCE_CATEGORY_CREATE', 'financial_categories', record.id, created.auditBefore, created.auditAfter);
    return res.status(201).json({ success: true, data: serializeCategoryDetail(record) });
  } catch (error) {
    console.error('[ADMIN_FINANCE_CATEGORY_CREATE]', error);
    return financeWriteError(res, error);
  }
});

router.patch('/categories/:id', async (req: Request, res: Response) => {
  try {
    const parsedParams = financeIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) return validationError(res, parsedParams.error);

    const parsedBody = financeCategoryPatchBodySchema.safeParse(req.body);
    if (!parsedBody.success) return validationError(res, parsedBody.error);

    const admin = (req as any).admin;
    const updated = await updateFinanceCategory(parsedParams.data.id, parsedBody.data, admin);
    const record = requireWriteRecord(updated.record, 'Categoria financeira');
    await registerFinanceAudit(req, 'FINANCE_CATEGORY_UPDATE', 'financial_categories', record.id, updated.auditBefore, updated.auditAfter);
    return res.json({ success: true, data: serializeCategoryDetail(record) });
  } catch (error) {
    console.error('[ADMIN_FINANCE_CATEGORY_PATCH]', error);
    return financeWriteError(res, error);
  }
});

router.get('/cost-centers', async (req: Request, res: Response) => {
  try {
    const parsed = financeCostCentersListQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed.error);
    const result = await listFinanceCostCenters(parsed.data);
    return res.json({ success: true, data: result.rows.map(serializeCostCenterListItem), pagination: result.pagination });
  } catch (error) {
    console.error('[ADMIN_FINANCE_COST_CENTERS_LIST]', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

router.get('/cost-centers/:id', async (req: Request, res: Response) => {
  try {
    const parsed = financeIdParamSchema.safeParse(req.params);
    if (!parsed.success) return validationError(res, parsed.error);
    const record = await getFinanceCostCenterById(parsed.data.id);
    if (!record) return notFound(res, 'Centro de custo não encontrado');
    return res.json({ success: true, data: serializeCostCenterDetail(record) });
  } catch (error) {
    console.error('[ADMIN_FINANCE_COST_CENTER_DETAIL]', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

router.post('/cost-centers', async (req: Request, res: Response) => {
  try {
    const parsed = financeCostCenterCreateBodySchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const admin = (req as any).admin;
    const created = await createFinanceCostCenter(parsed.data, admin);
    const record = requireWriteRecord(created.record, 'Centro de custo');
    await registerFinanceAudit(req, 'FINANCE_COST_CENTER_CREATE', 'financial_cost_centers', record.id, created.auditBefore, created.auditAfter);
    return res.status(201).json({ success: true, data: serializeCostCenterDetail(record) });
  } catch (error) {
    console.error('[ADMIN_FINANCE_COST_CENTER_CREATE]', error);
    return financeWriteError(res, error);
  }
});

router.patch('/cost-centers/:id', async (req: Request, res: Response) => {
  try {
    const parsedParams = financeIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) return validationError(res, parsedParams.error);

    const parsedBody = financeCostCenterPatchBodySchema.safeParse(req.body);
    if (!parsedBody.success) return validationError(res, parsedBody.error);

    const admin = (req as any).admin;
    const updated = await updateFinanceCostCenter(parsedParams.data.id, parsedBody.data, admin);
    const record = requireWriteRecord(updated.record, 'Centro de custo');
    await registerFinanceAudit(req, 'FINANCE_COST_CENTER_UPDATE', 'financial_cost_centers', record.id, updated.auditBefore, updated.auditAfter);
    return res.json({ success: true, data: serializeCostCenterDetail(record) });
  } catch (error) {
    console.error('[ADMIN_FINANCE_COST_CENTER_PATCH]', error);
    return financeWriteError(res, error);
  }
});

router.get('/recognition-policies', async (req: Request, res: Response) => {
  try {
    const parsed = financeRecognitionPoliciesListQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed.error);
    const result = await listFinanceRecognitionPolicies(parsed.data);
    return res.json({ success: true, data: result.rows.map(serializeRecognitionPolicyListItem), pagination: result.pagination });
  } catch (error) {
    console.error('[ADMIN_FINANCE_RECOGNITION_POLICIES_LIST]', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

router.get('/recognition-policies/:id', async (req: Request, res: Response) => {
  try {
    const parsed = financeIdParamSchema.safeParse(req.params);
    if (!parsed.success) return validationError(res, parsed.error);
    const record = await getFinanceRecognitionPolicyById(parsed.data.id);
    if (!record) return notFound(res, 'Política de reconhecimento não encontrada');
    return res.json({ success: true, data: serializeRecognitionPolicyDetail(record) });
  } catch (error) {
    console.error('[ADMIN_FINANCE_RECOGNITION_POLICY_DETAIL]', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

router.post('/recognition-policies', async (req: Request, res: Response) => {
  try {
    const parsedBody = financeRecognitionPolicyCreateBodySchema.safeParse(req.body);
    if (!parsedBody.success) return validationError(res, parsedBody.error);
    const admin = (req as any).admin;
    const ctx = auditCtx(req);
    const actorWithCtx = { ...admin, ip: ctx.ip, ua: ctx.ua };
    const created = await createFinanceRecognitionPolicy(parsedBody.data, actorWithCtx);
    const record = requireWriteRecord(created.record, 'Política de reconhecimento');
    return res.status(201).json({ success: true, data: serializeRecognitionPolicyDetail(record) });
  } catch (error) {
    console.error('[ADMIN_FINANCE_RECOGNITION_POLICY_CREATE]', error);
    return financeWriteError(res, error);
  }
});

router.patch('/recognition-policies/:id', async (req: Request, res: Response) => {
  try {
    const parsedParams = financeIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) return validationError(res, parsedParams.error);
    const parsedBody = financeRecognitionPolicyPatchBodySchema.safeParse(req.body);
    if (!parsedBody.success) return validationError(res, parsedBody.error);
    const admin = (req as any).admin;
    const ctx = auditCtx(req);
    const actorWithCtx = { ...admin, ip: ctx.ip, ua: ctx.ua };
    const updated = await updateFinanceRecognitionPolicyDraft(parsedParams.data.id, parsedBody.data, actorWithCtx);
    const record = requireWriteRecord(updated.record, 'Política de reconhecimento');
    return res.json({ success: true, data: serializeRecognitionPolicyDetail(record) });
  } catch (error) {
    console.error('[ADMIN_FINANCE_RECOGNITION_POLICY_PATCH]', error);
    return financeWriteError(res, error);
  }
});

router.post('/recognition-policies/:id/approve', async (req: Request, res: Response) => {
  try {
    const parsedParams = financeIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) return validationError(res, parsedParams.error);
    const parsedBody = financeRecognitionPolicyApproveBodySchema.safeParse(req.body);
    if (!parsedBody.success) return validationError(res, parsedBody.error);
    const admin = (req as any).admin;
    const ctx = auditCtx(req);
    const actorWithCtx = { ...admin, ip: ctx.ip, ua: ctx.ua };
    const approved = await approveFinanceRecognitionPolicy(parsedParams.data.id, parsedBody.data, actorWithCtx);
    const record = requireWriteRecord(approved.record, 'Política de reconhecimento');
    return res.json({ success: true, data: serializeRecognitionPolicyDetail(record) });
  } catch (error) {
    console.error('[ADMIN_FINANCE_RECOGNITION_POLICY_APPROVE]', error);
    return financeWriteError(res, error);
  }
});

router.post('/recognition-policies/:id/revoke', async (req: Request, res: Response) => {
  try {
    const parsedParams = financeIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) return validationError(res, parsedParams.error);
    const parsedBody = financeRecognitionPolicyRevokeBodySchema.safeParse(req.body);
    if (!parsedBody.success) return validationError(res, parsedBody.error);
    const admin = (req as any).admin;
    const ctx = auditCtx(req);
    const actorWithCtx = { ...admin, ip: ctx.ip, ua: ctx.ua };
    const revoked = await revokeFinanceRecognitionPolicy(parsedParams.data.id, parsedBody.data, actorWithCtx);
    const record = requireWriteRecord(revoked.record, 'Política de reconhecimento');
    return res.json({ success: true, data: serializeRecognitionPolicyDetail(record) });
  } catch (error) {
    console.error('[ADMIN_FINANCE_RECOGNITION_POLICY_REVOKE]', error);
    return financeWriteError(res, error);
  }
});

router.post('/recognition-policies/:id/supersede', async (req: Request, res: Response) => {
  try {
    const parsedParams = financeIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) return validationError(res, parsedParams.error);
    const parsedBody = financeRecognitionPolicySupersedBodySchema.safeParse(req.body);
    if (!parsedBody.success) return validationError(res, parsedBody.error);
    const admin = (req as any).admin;
    const ctx = auditCtx(req);
    const actorWithCtx = { ...admin, ip: ctx.ip, ua: ctx.ua };
    const result = await supersedFinanceRecognitionPolicy(parsedParams.data.id, parsedBody.data, actorWithCtx);
    const superseded = requireWriteRecord(result.superseded, 'Política original');
    const approved = requireWriteRecord(result.approved, 'Política de substituição');
    return res.json({
      success: true,
      data: {
        superseded: serializeRecognitionPolicyDetail(superseded),
        approved: serializeRecognitionPolicyDetail(approved),
      },
    });
  } catch (error) {
    console.error('[ADMIN_FINANCE_RECOGNITION_POLICY_SUPERSEDE]', error);
    return financeWriteError(res, error);
  }
});

// ── Dashboard Summary ─────────────────────────────────────────────────────────

import { queryDashboardSummary } from '../services/finance/finance-dashboard.service';

router.get('/dashboard-summary', async (req: Request, res: Response) => {
  try {
    const parsed = financeTransactionsListQuerySchema.safeParse({ ...req.query, page: '1', limit: '1' });
    if (!parsed.success) return validationError(res, parsed.error);

    const { page: _p, limit: _l, ...filters } = parsed.data;
    const result = await queryDashboardSummary(filters);

    return res.json({ success: true, data: result });
  } catch (error) {
    console.error('[ADMIN_FINANCE_DASHBOARD_SUMMARY]', error);
    return res.status(500).json({ success: false, error: 'Erro interno ao gerar resumo financeiro.' });
  }
});

// ── CSV Export ────────────────────────────────────────────────────────────────

import {
  CSV_EXPORT_MAX_ROWS,
  queryTransactionsForCsvExport,
  buildCsvContent,
} from '../services/finance/finance-csv-export';

router.get('/transactions/export.csv', async (req: Request, res: Response) => {
  try {
    const parsed = financeTransactionsListQuerySchema.safeParse({ ...req.query, page: '1', limit: '1' });
    if (!parsed.success) return validationError(res, parsed.error);

    const { page: _p, limit: _l, ...filters } = parsed.data;
    const { rows, total } = await queryTransactionsForCsvExport(filters);

    if (total > CSV_EXPORT_MAX_ROWS) {
      return res.status(422).json({
        success: false,
        code: 'CSV_ROW_LIMIT_EXCEEDED',
        error: `O relatório possui ${total} linhas (máximo: ${CSV_EXPORT_MAX_ROWS}). Reduza o período ou aplique mais filtros.`,
        total,
        max: CSV_EXPORT_MAX_ROWS,
      });
    }

    if (rows.length === 0) {
      return res.status(200)
        .setHeader('Content-Type', 'text/csv; charset=utf-8')
        .setHeader('Content-Disposition', 'attachment; filename="kaviar-lancamentos.csv"')
        .send(buildCsvContent([]));
    }

    const csv = buildCsvContent(rows);
    return res.status(200)
      .setHeader('Content-Type', 'text/csv; charset=utf-8')
      .setHeader('Content-Disposition', 'attachment; filename="kaviar-lancamentos.csv"')
      .send(csv);
  } catch (error) {
    console.error('[ADMIN_FINANCE_TRANSACTIONS_CSV_EXPORT]', error);
    return res.status(500).json({ success: false, error: 'Erro interno ao gerar exportação CSV.' });
  }
});

router.get('/transactions', async (req: Request, res: Response) => {
  try {
    const parsed = financeTransactionsListQuerySchema.safeParse(req.query);
    if (!parsed.success) return validationError(res, parsed.error);
    const result = await listFinanceTransactions(parsed.data);
    return res.json({ success: true, data: result.rows.map(serializeTransactionItem), pagination: result.pagination });
  } catch (error) {
    console.error('[ADMIN_FINANCE_TRANSACTIONS_LIST]', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

router.get('/transactions/:id', async (req: Request, res: Response) => {
  try {
    const parsed = financeIdParamSchema.safeParse(req.params);
    if (!parsed.success) return validationError(res, parsed.error);
    const record = await getFinanceTransactionById(parsed.data.id);
    if (!record) return notFound(res, 'Lançamento financeiro não encontrado');
    return res.json({ success: true, data: serializeTransactionDetail(record) });
  } catch (error) {
    console.error('[ADMIN_FINANCE_TRANSACTION_DETAIL]', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ── Manual Transaction CRUD (SUPER_ADMIN only for writes) ─────────────────

import {
  financeTransactionCreateBodySchema,
  financeTransactionUpdateBodySchema,
  financeTransactionPostBodySchema,
  financeTransactionCancelBodySchema,
} from '../services/finance/finance-transaction-validation';
import {
  createFinanceTransaction,
  updateFinanceTransaction,
  postFinanceTransaction,
  cancelFinanceTransaction,
  TransactionWriteError,
} from '../services/finance/finance-transaction-crud.service';

import type { FinanceTransactionPostBody } from '../services/finance/finance-transaction-validation';

function requireSuperAdminRole(req: Request, res: Response): boolean {
  const admin = (req as any).admin;
  if (admin?.role !== 'SUPER_ADMIN') {
    res.status(403).json({ success: false, error: 'Somente SUPER_ADMIN pode executar esta ação' });
    return false;
  }
  return true;
}

function transactionWriteError(res: Response, error: unknown) {
  if (error instanceof TransactionWriteError) {
    return res.status(error.status).json({ success: false, error: error.message });
  }
  return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
}

router.post('/transactions', async (req: Request, res: Response) => {
  try {
    if (!requireSuperAdminRole(req, res)) return;
    const parsed = financeTransactionCreateBodySchema.safeParse(req.body);
    if (!parsed.success) return validationError(res, parsed.error);

    const admin = (req as any).admin;
    const result = await createFinanceTransaction(parsed.data, admin, financeTransactionAuditContext(req));
    return res.status(201).json({ success: true, data: serializeTransactionDetail(result.record) });
  } catch (error) {
    console.error('[ADMIN_FINANCE_TRANSACTION_CREATE]', error);
    return transactionWriteError(res, error);
  }
});

router.patch('/transactions/:id', async (req: Request, res: Response) => {
  try {
    if (!requireSuperAdminRole(req, res)) return;
    const parsedParams = financeIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) return validationError(res, parsedParams.error);
    const parsedBody = financeTransactionUpdateBodySchema.safeParse(req.body);
    if (!parsedBody.success) return validationError(res, parsedBody.error);

    const admin = (req as any).admin;
    const result = await updateFinanceTransaction(parsedParams.data.id, parsedBody.data, admin, financeTransactionAuditContext(req));
    return res.json({ success: true, data: serializeTransactionDetail(result.record) });
  } catch (error) {
    console.error('[ADMIN_FINANCE_TRANSACTION_UPDATE]', error);
    return transactionWriteError(res, error);
  }
});

router.post('/transactions/:id/post', async (req: Request, res: Response) => {
  try {
    if (!requireSuperAdminRole(req, res)) return;
    const parsedParams = financeIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) return validationError(res, parsedParams.error);
    const parsedBody = financeTransactionPostBodySchema.safeParse(req.body);
    if (!parsedBody.success) return validationError(res, parsedBody.error);

    const admin = (req as any).admin;
    const result = await postFinanceTransaction(parsedParams.data.id, parsedBody.data, admin, financeTransactionAuditContext(req));
    return res.json({ success: true, data: serializeTransactionDetail(result.record) });
  } catch (error) {
    console.error('[ADMIN_FINANCE_TRANSACTION_POST]', error);
    return transactionWriteError(res, error);
  }
});

router.post('/transactions/:id/cancel', async (req: Request, res: Response) => {
  try {
    if (!requireSuperAdminRole(req, res)) return;
    const parsedParams = financeIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) return validationError(res, parsedParams.error);
    const parsedBody = financeTransactionCancelBodySchema.safeParse(req.body);
    if (!parsedBody.success) return validationError(res, parsedBody.error);

    const admin = (req as any).admin;
    const result = await cancelFinanceTransaction(parsedParams.data.id, parsedBody.data, admin, financeTransactionAuditContext(req));
    return res.json({ success: true, data: serializeTransactionDetail(result.record) });
  } catch (error) {
    console.error('[ADMIN_FINANCE_TRANSACTION_CANCEL]', error);
    return transactionWriteError(res, error);
  }
});

import { FinanceTransactionAuditContext } from '../services/finance/finance-transaction-audit';
import { financeTransactionReverseBodySchema } from '../services/finance/finance-transaction-reversal-validation';
import { reverseFinanceTransaction } from '../services/finance/finance-transaction-reversal.service';

router.post('/transactions/:id/reverse', async (req: Request, res: Response) => {
  try {
    if (!requireSuperAdminRole(req, res)) return;
    const parsedParams = financeIdParamSchema.safeParse(req.params);
    if (!parsedParams.success) return validationError(res, parsedParams.error);
    const parsedBody = financeTransactionReverseBodySchema.safeParse(req.body);
    if (!parsedBody.success) return validationError(res, parsedBody.error);

    const admin = (req as any).admin;
    const result = await reverseFinanceTransaction(parsedParams.data.id, parsedBody.data, admin, financeTransactionAuditContext(req));
    return res.json({
      success: true,
      data: {
        original: result.original ? serializeTransactionDetail(result.original) : null,
        reversal: result.reversal ? serializeTransactionDetail(result.reversal) : null,
      },
    });
  } catch (error) {
    console.error('[ADMIN_FINANCE_TRANSACTION_REVERSE]', error);
    return transactionWriteError(res, error);
  }
});

export default router;
