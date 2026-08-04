import { Router, Request, Response } from 'express';
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
