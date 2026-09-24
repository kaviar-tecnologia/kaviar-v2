import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateAdmin, requireSuperAdmin } from '../middlewares/auth';
import { audit, auditCtx } from '../utils/audit';
import { COMPANY } from '../config/company';
import { isLegacyPayAllowed, isMonthLegacy, isValidReferenceMonth } from '../services/finance/territory/engine-selection';
import crypto from 'crypto';
import { buildTerritorialManagerContractV12, TERRITORIAL_MANAGER_CONTRACT_VERSION, type TerritorialManagerContractInput } from '../services/contracts/territorial-manager-contract-v1_2';

const router = Router();
router.use(authenticateAdmin, requireSuperAdmin);

function maskPix(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 4) return '***';
  return key.substring(0, 3) + '***' + key.substring(key.length - 3);
}

function maskCpf(cpf: string | null): string | null {
  if (!cpf) return null;
  return '***' + cpf.slice(-4);
}

// ─── Operator Profiles ───────────────────────────────────────────────────────

router.get('/operators', async (_req: Request, res: Response) => {
  try {
    const operators = await prisma.operator_profiles.findMany({
      include: { admin: { select: { name: true, email: true } }, territory: { select: { id: true, name: true, level: true } } },
      orderBy: { created_at: 'desc' },
    });
    const masked = operators.map(o => ({ ...o, pix_key: maskPix(o.pix_key), document_cpf: maskCpf(o.document_cpf), legal_representative_cpf: maskCpf(o.legal_representative_cpf) }));
    res.json({ success: true, data: masked });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao listar operadores' });
  }
});

router.get('/operators/:id', async (req: Request, res: Response) => {
  try {
    const op = await prisma.operator_profiles.findUnique({
      where: { id: req.params.id },
      include: { admin: { select: { name: true, email: true } }, territory: { select: { id: true, name: true } }, payouts: { orderBy: { created_at: 'desc' }, take: 10 } },
    });
    if (!op) return res.status(404).json({ success: false, error: 'Operador não encontrado' });
    res.json({ success: true, data: op });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao buscar operador' });
  }
});

const emptyToNull = z.string().optional().nullable().transform(v => v === '' ? null : v);
const optionalEmail = z.string().optional().nullable().transform(v => v === '' ? null : v).refine(v => v === null || v === undefined || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), { message: 'Invalid email' });

const createOperatorSchema = z.object({
  admin_id: z.string().min(1),
  territory_id: z.string().min(1),
  recipient_type: z.enum(['individual', 'company', 'association']),
  relationship_type: z.enum(['territorial_operator', 'association_partner', 'consultant']).default('territorial_operator'),
  display_name: z.string().min(2),
  email: optionalEmail,
  phone: emptyToNull,
  address: emptyToNull,
  pix_key: emptyToNull,
  pix_key_type: z.enum(['cpf', 'cnpj', 'email', 'phone', 'random']).optional().nullable(),
  bank_name: emptyToNull,
  full_name: emptyToNull,
  document_cpf: emptyToNull,
  document_rg: emptyToNull,
  company_name: emptyToNull,
  trade_name: emptyToNull,
  document_cnpj: emptyToNull,
  legal_representative_name: emptyToNull,
  legal_representative_cpf: emptyToNull,
  notes: emptyToNull,
});

router.post('/operators', async (req: Request, res: Response) => {
  try {
    const data = createOperatorSchema.parse(req.body);

    const admin = await prisma.admins.findUnique({ where: { id: data.admin_id } });
    if (!admin) return res.status(400).json({ success: false, error: 'Admin não encontrado' });

    const territory = await prisma.operational_territories.findUnique({ where: { id: data.territory_id } });
    if (!territory) return res.status(400).json({ success: false, error: 'Território não encontrado' });

    const existing = await prisma.operator_profiles.findUnique({ where: { admin_id: data.admin_id } });
    if (existing) return res.status(409).json({ success: false, error: 'Este admin já possui perfil de operador' });

    const activeInTerritory = await prisma.operator_profiles.findFirst({ where: { territory_id: data.territory_id, is_active: true } });
    if (activeInTerritory) return res.status(409).json({ success: false, error: 'Já existe operador ativo neste território' });

    // Validate required fields by type
    if (data.recipient_type === 'individual' && !data.full_name) return res.status(400).json({ success: false, error: 'Nome completo obrigatório para PF' });
    if (data.recipient_type === 'individual' && !data.document_cpf) return res.status(400).json({ success: false, error: 'CPF obrigatório para PF' });
    if (data.recipient_type === 'company' && !data.company_name) return res.status(400).json({ success: false, error: 'Razão social obrigatória para PJ' });
    if (data.recipient_type === 'company' && !data.document_cnpj) return res.status(400).json({ success: false, error: 'CNPJ obrigatório para PJ' });
    if (data.recipient_type === 'company' && !data.legal_representative_name) return res.status(400).json({ success: false, error: 'Responsável legal obrigatório para PJ' });
    if (data.recipient_type === 'company' && !data.legal_representative_cpf) return res.status(400).json({ success: false, error: 'CPF do responsável legal obrigatório para PJ' });
    if (data.recipient_type === 'association' && !data.company_name) return res.status(400).json({ success: false, error: 'Nome da associação obrigatório' });
    if (data.recipient_type === 'association' && !data.legal_representative_name) return res.status(400).json({ success: false, error: 'Presidente/responsável obrigatório para associação' });
    if (data.recipient_type === 'association' && !data.legal_representative_cpf) return res.status(400).json({ success: false, error: 'CPF do responsável obrigatório para associação' });

    const operator = await prisma.operator_profiles.create({ data: { ...data, email: data.email || null, phone: data.phone || null, address: data.address || null, pix_key: data.pix_key || null, pix_key_type: data.pix_key_type || null, bank_name: data.bank_name || null, full_name: data.full_name || null, document_cpf: data.document_cpf || null, document_rg: data.document_rg || null, company_name: data.company_name || null, trade_name: data.trade_name || null, document_cnpj: data.document_cnpj || null, legal_representative_name: data.legal_representative_name || null, legal_representative_cpf: data.legal_representative_cpf || null, notes: data.notes || null } });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'create_operator_profile', entityType: 'operator_profile', entityId: operator.id, newValue: { display_name: data.display_name, recipient_type: data.recipient_type, territory: territory.name }, ipAddress: ctx.ip });

    res.status(201).json({ success: true, data: operator });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: error.errors[0].message });
    res.status(500).json({ success: false, error: 'Erro ao criar operador' });
  }
});

router.patch('/operators/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.operator_profiles.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Operador não encontrado' });

    const { document_status, contract_status, is_active, rejected_reason, ...fields } = req.body;
    const updates: any = {};

    // Field updates
    for (const [k, v] of Object.entries(fields)) {
      if (['display_name', 'email', 'phone', 'address', 'pix_key', 'pix_key_type', 'bank_name', 'full_name', 'document_cpf', 'document_rg', 'company_name', 'trade_name', 'document_cnpj', 'legal_representative_name', 'legal_representative_cpf', 'notes', 'terms_accepted_at', 'responsibility_terms_accepted_at', 'confidentiality_terms_accepted_at', 'terms_version', 'terms_accepted_by', 'contract_url', 'contract_signed_at'].includes(k)) {
        updates[k] = v;
      }
    }

    if (document_status === 'verified') {
      updates.document_status = 'verified';
      updates.verified_by = (req as any).admin.id;
      updates.verified_at = new Date();
    } else if (document_status === 'rejected') {
      updates.document_status = 'rejected';
      updates.rejected_reason = rejected_reason || null;
      updates.is_active = false;
    }

    if (contract_status) updates.contract_status = contract_status;

    // Activation logic
    if (is_active === true) {
      if ((updates.document_status || existing.document_status) !== 'verified') return res.status(400).json({ success: false, error: 'Operador precisa estar verificado para ser ativado' });
      const cs = updates.contract_status || existing.contract_status;
      if (cs !== 'signed' && cs !== 'not_required') return res.status(400).json({ success: false, error: 'Contrato precisa estar assinado ou dispensado' });
      if (!existing.pix_key && !updates.pix_key) return res.status(400).json({ success: false, error: 'Pix obrigatório para ativar operador' });
      // Terms validation
      if (!existing.responsibility_terms_accepted_at && !updates.responsibility_terms_accepted_at) return res.status(400).json({ success: false, error: 'Termo de responsabilidade obrigatório para ativar operador' });
      if (!existing.confidentiality_terms_accepted_at && !updates.confidentiality_terms_accepted_at) return res.status(400).json({ success: false, error: 'Termo de confidencialidade/LGPD obrigatório para ativar operador' });
      // PJ/Association: require signed contract
      if ((existing.recipient_type === 'company' || existing.recipient_type === 'association') && cs !== 'signed') return res.status(400).json({ success: false, error: 'PJ/Associação exige contrato assinado para ativação' });
      // Association without CNPJ warning
      if (existing.recipient_type === 'association' && !existing.document_cnpj && cs !== 'signed') return res.status(400).json({ success: false, error: 'Associação sem CNPJ exige aprovação especial da matriz e termo assinado' });
      const activeInTerritory = await prisma.operator_profiles.findFirst({ where: { territory_id: existing.territory_id, is_active: true, id: { not: req.params.id } } });
      if (activeInTerritory) return res.status(409).json({ success: false, error: 'Já existe operador ativo neste território' });
      updates.is_active = true;
    }
    if (is_active === false) updates.is_active = false;

    const operator = await prisma.operator_profiles.update({ where: { id: req.params.id }, data: updates });

    const ctx = auditCtx(req);
    const action = document_status === 'verified' ? 'verify_operator_profile' : document_status === 'rejected' ? 'reject_operator_profile' : 'update_operator_profile';
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action, entityType: 'operator_profile', entityId: req.params.id, newValue: updates, ipAddress: ctx.ip });

    res.json({ success: true, data: operator });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao atualizar operador' });
  }
});

// ─── Territory Payouts ───────────────────────────────────────────────────────

router.get('/payouts', async (req: Request, res: Response) => {
  try {
    const { status, territory_id } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (territory_id) where.territory_id = territory_id;

    const payouts = await prisma.territory_payouts.findMany({
      where,
      include: { territory: { select: { name: true } }, operator: { select: { display_name: true, pix_key: true, pix_key_type: true, recipient_type: true } } },
      orderBy: { created_at: 'desc' },
    });
    const masked = payouts.map(p => ({ ...p, operator: { ...p.operator, pix_key: maskPix(p.operator.pix_key) } }));
    res.json({ success: true, data: masked });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao listar repasses' });
  }
});

router.post('/payouts/calculate', async (req: Request, res: Response) => {
  try {
    const { territory_id, reference_month } = req.body;
    if (!territory_id || !reference_month) return res.status(400).json({ success: false, error: 'territory_id e reference_month obrigatórios' });
    if (!isValidReferenceMonth(reference_month)) return res.status(400).json({ success: false, error: 'reference_month deve ser YYYY-MM com mês entre 01 e 12' });
    if (!isMonthLegacy(reference_month)) return res.status(409).json({ success: false, error: 'MANAGER_PAYOUT_LEGACY_CALCULATION_DISABLED' });

    const territory = await prisma.operational_territories.findUnique({ where: { id: territory_id } });
    if (!territory) return res.status(404).json({ success: false, error: 'Território não encontrado' });

    const rule = await prisma.territory_finance_rules.findFirst({ where: { territory_id, is_active: true } });
    if (!rule) return res.status(400).json({ success: false, error: 'Nenhuma regra financeira ativa' });

    const operator = await prisma.operator_profiles.findFirst({ where: { territory_id, is_active: true, document_status: 'verified' } });
    if (!operator) return res.status(400).json({ success: false, error: 'Nenhum operador verificado e ativo' });
    if (!operator.pix_key) return res.status(400).json({ success: false, error: 'Operador sem Pix cadastrado' });

    const existingPayout = await prisma.territory_payouts.findUnique({ where: { territory_id_reference_month: { territory_id, reference_month } } });
    if (existingPayout) return res.status(409).json({ success: false, error: `Repasse já existe para ${reference_month} (status: ${existingPayout.status})` });

    const [year, month] = reference_month.split('-').map(Number);
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 1);

    const nIds = (await prisma.neighborhoods.findMany({ where: { territory_id }, select: { id: true } })).map(n => n.id);
    if (nIds.length === 0) return res.status(400).json({ success: false, error: 'Território sem bairros vinculados' });

    const settlements = await prisma.ride_settlements.aggregate({
      where: { origin_neighborhood_id: { in: nIds }, settled_at: { gte: monthStart, lt: monthEnd, not: null } },
      _sum: { fee_amount: true, final_price: true },
      _count: true,
    });

    const feeTotal = Number(settlements._sum.fee_amount || 0);
    const grossTotal = Number(settlements._sum.final_price || 0);
    const ridesCount = settlements._count;
    const regionalPercent = Number(rule.regional_share_percent);
    const regionalGross = feeTotal * regionalPercent / 100;

    const pIds = (await prisma.territorial_partners.findMany({ where: { territory_id }, select: { id: true } })).map(p => p.id);
    let partnerCommissions = 0;
    if (pIds.length > 0) {
      const comms = await prisma.partner_commissions.aggregate({ where: { partner_id: { in: pIds }, created_at: { gte: monthStart, lt: monthEnd } }, _sum: { commission_amount: true } });
      partnerCommissions = Number(comms._sum.commission_amount || 0);
    }

    const netAmount = Math.round((regionalGross - partnerCommissions) * 100) / 100;

    const payout = await prisma.territory_payouts.create({
      data: {
        territory_id,
        operator_profile_id: operator.id,
        reference_month,
        calculated_amount: netAmount,
        fiscal_document_required: operator.recipient_type === 'company',
        fiscal_document_type: operator.recipient_type === 'company' ? 'nfse' : operator.recipient_type === 'association' ? 'receipt' : 'none',
        calculation_details: { period: reference_month, territory: territory.name, rides_count: ridesCount, gross_total: grossTotal, fee_total: feeTotal, regional_share_percent: regionalPercent, regional_gross: Math.round(regionalGross * 100) / 100, partner_commissions: partnerCommissions, net_regional: netAmount },
      },
    });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'calculate_payout', entityType: 'territory_payout', entityId: payout.id, newValue: { territory: territory.name, month: reference_month, amount: netAmount }, ipAddress: ctx.ip });

    res.status(201).json({ success: true, data: payout });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao calcular repasse' });
  }
});

router.patch('/payouts/:id/approve', async (req: Request, res: Response) => {
  try {
    const payout = await prisma.territory_payouts.findUnique({ where: { id: req.params.id } });
    if (!payout) return res.status(404).json({ success: false, error: 'Repasse não encontrado' });
    if (payout.status !== 'calculated') return res.status(400).json({ success: false, error: `Status "${payout.status}" não permite aprovação` });

    const { approved_amount, notes } = req.body;
    const amount = approved_amount ?? Number(payout.calculated_amount);

    const updated = await prisma.territory_payouts.update({
      where: { id: req.params.id },
      data: { status: 'approved', approved_amount: amount, approved_by: (req as any).admin.id, approved_at: new Date(), notes: notes || payout.notes },
    });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'approve_payout', entityType: 'territory_payout', entityId: req.params.id, newValue: { approved_amount: amount }, ipAddress: ctx.ip });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao aprovar' });
  }
});

router.patch('/payouts/:id/pay', async (req: Request, res: Response) => {
  try {
    const payout = await prisma.territory_payouts.findUnique({ where: { id: req.params.id }, include: { operator: true } });
    if (!payout) return res.status(404).json({ success: false, error: 'Repasse não encontrado' });
    if (!isLegacyPayAllowed(payout.reference_month)) return res.status(409).json({ success: false, error: 'MANAGER_PAYOUT_LEGACY_PAYMENT_DISABLED' });
    if (payout.status !== 'approved') return res.status(400).json({ success: false, error: `Status "${payout.status}" não permite registro de pagamento` });

    const { payment_method, payment_ref, receipt_url, notes } = req.body;
    if (!payment_ref) return res.status(400).json({ success: false, error: 'payment_ref obrigatório' });

    const updated = await prisma.territory_payouts.update({
      where: { id: req.params.id },
      data: { status: 'paid', paid_by: (req as any).admin.id, paid_at: new Date(), payment_method: payment_method || 'pix', payment_ref, receipt_url: receipt_url || null, notes: notes || payout.notes, ...(req.body.fiscal_document_url && { fiscal_document_url: req.body.fiscal_document_url }), ...(req.body.fiscal_document_ref && { fiscal_document_ref: req.body.fiscal_document_ref }), ...(req.body.fiscal_notes && { fiscal_notes: req.body.fiscal_notes }) },
    });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'pay_payout', entityType: 'territory_payout', entityId: req.params.id, newValue: { payment_method: payment_method || 'pix', payment_ref }, ipAddress: ctx.ip });

    res.json({ success: true, data: { ...updated, operator_pix: payout.operator.pix_key, operator_name: payout.operator.display_name } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao registrar pagamento' });
  }
});

router.patch('/payouts/:id/cancel', async (req: Request, res: Response) => {
  try {
    const payout = await prisma.territory_payouts.findUnique({ where: { id: req.params.id } });
    if (!payout) return res.status(404).json({ success: false, error: 'Repasse não encontrado' });
    if (payout.status === 'paid') return res.status(400).json({ success: false, error: 'Repasse pago não pode ser cancelado' });
    if (payout.status === 'canceled') return res.status(400).json({ success: false, error: 'Já cancelado' });

    const { cancel_reason } = req.body;
    if (!cancel_reason) return res.status(400).json({ success: false, error: 'Motivo obrigatório' });

    const updated = await prisma.territory_payouts.update({ where: { id: req.params.id }, data: { status: 'canceled', cancel_reason } });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'cancel_payout', entityType: 'territory_payout', entityId: req.params.id, newValue: { cancel_reason }, ipAddress: ctx.ip });

    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao cancelar' });
  }
});

// POST /payouts/:id/receipt — upload receipt file
import { uploadToS3 } from '../config/s3-upload';
router.post('/payouts/:id/receipt', uploadToS3.single('file'), async (req: Request, res: Response) => {
  try {
    const payout = await prisma.territory_payouts.findUnique({ where: { id: req.params.id } });
    if (!payout) return res.status(404).json({ success: false, error: 'Repasse não encontrado' });

    const file = req.file as any;
    if (!file) return res.status(400).json({ success: false, error: 'Arquivo obrigatório' });

    const receipt_url = file.location || file.key || file.path;
    await prisma.territory_payouts.update({ where: { id: req.params.id }, data: { receipt_url } });

    res.json({ success: true, data: { receipt_url } });
  } catch (error) {
    console.error('[admin-payouts] receipt upload error:', error);
    res.status(500).json({ success: false, error: 'Erro ao anexar comprovante' });
  }
});

// ─── Contract Upload & View ──────────────────────────────────────────────────

import multer from 'multer';
import multerS3 from 'multer-s3';
import { S3Client } from '@aws-sdk/client-s3';
import { getPresignedUrl } from '../config/s3-upload';

const contractS3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
const contractBucket = process.env.AWS_S3_BUCKET || 'kaviar-uploads-847895361928';

const uploadContract = multer({
  storage: multerS3({
    s3: contractS3,
    bucket: contractBucket,
    contentType: multerS3.AUTO_CONTENT_TYPE,
    key: (_req: Request, _file: Express.Multer.File, cb: (error: any, key?: string) => void) => {
      const id = (_req as any).params.id;
      cb(null, `manager-contracts/${id}/${Date.now()}.pdf`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') cb(null, true);
    else cb(new Error('Apenas PDF permitido'));
  },
});

// POST /operators/:id/contract — Upload de contrato (SUPER_ADMIN)
router.post('/operators/:id/contract', uploadContract.single('file'), async (req: Request, res: Response) => {
  try {
    const operator = await prisma.operator_profiles.findUnique({ where: { id: req.params.id } });
    if (!operator) return res.status(404).json({ success: false, error: 'Operador não encontrado' });

    const file = req.file as any;
    if (!file) return res.status(400).json({ success: false, error: 'Arquivo PDF obrigatório' });

    const contract_url = file.key; // S3 key interna
    const previousKey = operator.contract_url || null;

    await prisma.operator_profiles.update({
      where: { id: req.params.id },
      data: { contract_url, updated_at: new Date() },
    });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'upload_contract', entityType: 'operator_profile', entityId: req.params.id, oldValue: previousKey ? { contract_url: previousKey } : undefined, newValue: { contract_url }, ipAddress: ctx.ip });

    res.json({ success: true, data: { uploaded: true } });
  } catch (error: any) {
    if (error.message === 'Apenas PDF permitido') return res.status(400).json({ success: false, error: error.message });
    console.error('[admin-payouts] contract upload error:', error);
    res.status(500).json({ success: false, error: 'Erro ao anexar contrato' });
  }
});

// GET /operators/:id/contract-url — Presigned URL para visualização (SUPER_ADMIN)
router.get('/operators/:id/contract-url', async (req: Request, res: Response) => {
  try {
    const operator = await prisma.operator_profiles.findUnique({ where: { id: req.params.id }, select: { contract_url: true } });
    if (!operator) return res.status(404).json({ success: false, error: 'Operador não encontrado' });
    if (!operator.contract_url) return res.status(404).json({ success: false, error: 'Contrato não disponível' });

    const url = await getPresignedUrl(operator.contract_url);
    res.json({ success: true, data: { url } });
  } catch (error) {
    console.error('[admin-payouts] contract-url error:', error);
    res.status(500).json({ success: false, error: 'Erro ao gerar URL do contrato' });
  }
});

// POST /operators/:id/contract-template — Upload modelo de contrato (SUPER_ADMIN)
router.post('/operators/:id/contract-template', uploadContract.single('file'), async (req: Request, res: Response) => {
  try {
    const operator = await prisma.operator_profiles.findUnique({ where: { id: req.params.id } });
    if (!operator) return res.status(404).json({ success: false, error: 'Operador não encontrado' });

    const file = req.file as any;
    if (!file) return res.status(400).json({ success: false, error: 'Arquivo PDF obrigatório' });

    const templateKey = `manager-contract-templates/${req.params.id}/${Date.now()}.pdf`;
    // Note: multerS3 already uploaded with the contract key pattern. For templates we use a different prefix.
    // Since we reuse uploadContract middleware, the key is already set. We override by storing the correct reference.
    const s3Key = file.key; // already uploaded by multerS3

    const previousKey = operator.contract_template_url || null;
    const allowedForTemplate = ['pending', 'rejected', 'available'];
    if (!allowedForTemplate.includes(operator.contract_status)) {
      return res.status(409).json({ success: false, error: `Não é possível substituir modelo no estado '${operator.contract_status}'. Permitido: pending, rejected, available.` });
    }
    const newStatus = operator.contract_status === 'available' ? 'available' : 'available';

    await prisma.operator_profiles.update({
      where: { id: req.params.id },
      data: { contract_template_url: s3Key, contract_status: 'available', updated_at: new Date() },
    });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'upload_contract_template', entityType: 'operator_profile', entityId: req.params.id, oldValue: previousKey ? { contract_template_url: previousKey } : undefined, newValue: { contract_template_url: s3Key, contract_status: 'available' }, ipAddress: ctx.ip });

    // Notify gestor(a) territorial (non-blocking, conditional)
    let emailSent = false, whatsappSent = false;
    try {
      const operatorAdmin = await prisma.admins.findUnique({ where: { id: operator.admin_id }, select: { name: true, email: true, phone: true } });

      // E-mail: only if explicitly enabled
      if (process.env.ENABLE_CONTRACT_EMAIL_NOTIFICATION === 'true' && operatorAdmin?.email) {
        const { emailService } = await import('../services/email/email.service');
        await emailService.sendMail({
          to: operatorAdmin.email,
          subject: 'Seu contrato está disponível — Plataforma KAVIAR',
          text: `Olá, ${operatorAdmin.name}.\n\nSeu contrato de parceria operacional territorial com a Plataforma KAVIAR já está disponível para conferência e assinatura.\n\nAcesse o painel:\nhttps://kaviar.com.br/admin/meu-contrato\n\nBaixe o contrato, assine e envie o PDF assinado pelo próprio painel.\n\nEm caso de dúvidas: contato@kaviar.com.br\n\nKAVIAR — Rio de Janeiro/RJ`,
          html: `<p>Olá, <strong>${operatorAdmin.name}</strong>.</p><p>Seu contrato de parceria operacional territorial com a <strong>Plataforma KAVIAR</strong> já está disponível para conferência e assinatura.</p><p><a href="https://kaviar.com.br/admin/meu-contrato">Acessar painel</a></p><p>Baixe o contrato, assine e envie o PDF assinado pelo próprio painel.</p><p>Em caso de dúvidas: <a href="mailto:contato@kaviar.com.br">contato@kaviar.com.br</a></p><p><em>KAVIAR — Plataforma de Mobilidade</em></p>`,
        });
        emailSent = true;
      }

      // WhatsApp: only if specific template is configured (not generic)
      if (operatorAdmin?.phone && process.env.WA_TPL_CONTRACT_AVAILABLE) {
        const { whatsappService } = await import('../modules/whatsapp');
        const firstName = operatorAdmin.name?.split(' ')[0] || operatorAdmin.name;
        await whatsappService.sendTemplate({ to: operatorAdmin.phone, template: 'kaviar_contract_available_v1' as any, variables: { '1': firstName, '2': 'https://kaviar.com.br/admin/meu-contrato' } });
        whatsappSent = true;
      }
    } catch (notifyErr) {
      console.error('[CONTRACT_NOTIFY_FAIL]', (notifyErr as Error).message?.slice(0, 100));
    }
    console.log(`[CONTRACT_AVAILABLE] operator=${req.params.id} email=${emailSent} whatsapp=${whatsappSent}`);

    res.json({ success: true, data: { uploaded: true, contract_status: 'available', emailSent, whatsappSent } });
  } catch (error: any) {
    if (error.message === 'Apenas PDF permitido') return res.status(400).json({ success: false, error: error.message });
    console.error('[admin-payouts] contract-template upload error:', error);
    res.status(500).json({ success: false, error: 'Erro ao anexar modelo de contrato' });
  }
});

// GET /operators/:id/contract-template-url — Presigned URL do modelo (SUPER_ADMIN)
router.get('/operators/:id/contract-template-url', async (req: Request, res: Response) => {
  try {
    const operator = await prisma.operator_profiles.findUnique({ where: { id: req.params.id }, select: { contract_template_url: true } });
    if (!operator) return res.status(404).json({ success: false, error: 'Operador não encontrado' });
    if (!operator.contract_template_url) return res.status(404).json({ success: false, error: 'Modelo de contrato não disponível' });

    const url = await getPresignedUrl(operator.contract_template_url);
    res.json({ success: true, data: { url } });
  } catch (error) {
    console.error('[admin-payouts] contract-template-url error:', error);
    res.status(500).json({ success: false, error: 'Erro ao gerar URL do modelo' });
  }
});

// GET /contracts-queue — Fila de contratos pendentes (SUPER_ADMIN)
router.get('/contracts-queue', async (req: Request, res: Response) => {
  try {
    const submissions = await prisma.contract_submissions.findMany({
      where: { status: { in: ['submitted', 'in_review'] } },
      include: {
        operator: { select: { id: true, display_name: true, territory: { select: { name: true } } } },
      },
      orderBy: { created_at: 'asc' },
    });
    res.json({ success: true, data: submissions.map(s => ({
      id: s.id,
      operator_name: s.operator.display_name,
      territory: s.operator.territory?.name || '—',
      status: s.status,
      submitted_at: s.created_at,
    })) });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao buscar fila de contratos' });
  }
});

// GET /submissions/:id/url — Presigned URL do PDF enviado (SUPER_ADMIN)
router.get('/submissions/:id/url', async (req: Request, res: Response) => {
  try {
    const submission = await prisma.contract_submissions.findUnique({ where: { id: req.params.id }, select: { s3_key: true } });
    if (!submission) return res.status(404).json({ success: false, error: 'Submissão não encontrada' });

    const url = await getPresignedUrl(submission.s3_key);
    res.json({ success: true, data: { url } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao gerar URL' });
  }
});

// PATCH /submissions/:id/review — Aprovar ou rejeitar (SUPER_ADMIN)
router.patch('/submissions/:id/review', async (req: Request, res: Response) => {
  try {
    const { action, rejection_reason } = req.body;
    if (!['approve', 'reject'].includes(action)) return res.status(400).json({ success: false, error: 'action deve ser approve ou reject' });
    if (action === 'reject' && (!rejection_reason || rejection_reason.trim().length < 3)) {
      return res.status(400).json({ success: false, error: 'Motivo da rejeição obrigatório (mínimo 3 caracteres)' });
    }

    const submission = await prisma.contract_submissions.findUnique({
      where: { id: req.params.id },
      include: { operator: { select: { id: true, admin_id: true, relationship_type: true } } },
    });
    if (!submission) return res.status(404).json({ success: false, error: 'Submissão não encontrada' });
    if (!['submitted', 'in_review'].includes(submission.status)) {
      return res.status(409).json({ success: false, error: `Submissão no estado '${submission.status}' não pode ser revisada` });
    }

    const adminId = (req as any).admin.id;
    const now = new Date();

    if (
      action === 'approve' &&
      submission.operator.relationship_type === 'territorial_manager' &&
      submission.contract_version !== TERRITORIAL_MANAGER_CONTRACT_VERSION
    ) {
      return res.status(409).json({
        success: false,
        error: `Contrato legado não pode ser aprovado para Gestor Territorial. Gere e reenvie a versão ${TERRITORIAL_MANAGER_CONTRACT_VERSION}.`,
        required_contract_version: TERRITORIAL_MANAGER_CONTRACT_VERSION,
        submitted_contract_version: submission.contract_version,
      });
    }

    if (action === 'approve') {
      await prisma.contract_submissions.update({
        where: { id: req.params.id },
        data: { status: 'approved', reviewed_by: adminId, reviewed_at: now, updated_at: now },
      });
      await prisma.operator_profiles.update({
        where: { id: submission.operator_profile_id },
        data: { contract_status: 'signed', contract_url: submission.s3_key, terms_version: submission.contract_version || TERRITORIAL_MANAGER_CONTRACT_VERSION, contract_reviewed_by: adminId, contract_reviewed_at: now, contract_signed_at: now, updated_at: now },
      });
    } else {
      await prisma.contract_submissions.update({
        where: { id: req.params.id },
        data: { status: 'rejected', reviewed_by: adminId, reviewed_at: now, rejection_reason, updated_at: now },
      });
      await prisma.operator_profiles.update({
        where: { id: submission.operator_profile_id },
        data: { contract_status: 'rejected', contract_reviewed_by: adminId, contract_reviewed_at: now, contract_rejection_reason: rejection_reason, updated_at: now },
      });
    }

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: action === 'approve' ? 'approve_contract' : 'reject_contract', entityType: 'contract_submission', entityId: req.params.id, newValue: { action, rejection_reason: rejection_reason || null }, ipAddress: ctx.ip });

    res.json({ success: true, data: { action, submission_id: req.params.id } });
  } catch (error) {
    console.error('[admin-payouts] review error:', error);
    res.status(500).json({ success: false, error: 'Erro ao revisar contrato' });
  }
});

// GET /operators/:id/contract-data — Diagnóstico de dados para geração de contrato (SUPER_ADMIN)
router.get('/operators/:id/contract-data', async (req: Request, res: Response) => {
  try {
    const operator = await prisma.operator_profiles.findUnique({
      where: { id: req.params.id },
      include: {
        admin: { select: { name: true, email: true, phone: true } },
        territory: {
          select: {
            id: true,
            name: true,
            city_name: true,
            uf: true,
            updated_at: true,
            neighborhoods: {
              where: { is_active: true },
              select: { name: true },
              orderBy: { name: 'asc' },
            },
          },
        },
      },
    });
    if (!operator) return res.status(404).json({ success: false, error: 'Operador não encontrado' });

    const email = operator.email || operator.admin.email || null;
    const telefone = operator.phone || operator.admin.phone || null;
    const endereco = operator.address || null;
    const territorio = operator.territory?.name || null;
    const cidadeUf = operator.territory?.city_name && operator.territory?.uf
      ? `${operator.territory.city_name}/${operator.territory.uf}`
      : null;
    const pixKey = operator.pix_key || null;

    const missingFields: string[] = [];
    if (!email) missingFields.push('email');
    if (!endereco) missingFields.push('endereco');
    if (!telefone) missingFields.push('telefone');
    if (!territorio) missingFields.push('territorio');
    if (!cidadeUf) missingFields.push('cidadeUf');

    if (operator.recipient_type === 'individual') {
      if (!operator.document_cpf) missingFields.push('cpf');
    } else {
      if (!operator.document_cnpj) missingFields.push('cnpj');
      if (!operator.legal_representative_name) missingFields.push('legal_representative_name');
      if (!operator.legal_representative_cpf) missingFields.push('legal_representative_cpf');
    }

    const canGenerateContract = missingFields.length === 0;

    res.json({
      success: true,
      data: {
        canGenerateContract,
        contractVersion: TERRITORIAL_MANAGER_CONTRACT_VERSION,
        missingFields,
        availableFields: {
          recipientType: operator.recipient_type,
          displayName: operator.display_name,
          email,
          telefone,
          endereco,
          cpf: operator.document_cpf || null,
          rg: operator.document_rg || null,
          companyName: operator.company_name || null,
          tradeName: operator.trade_name || null,
          cnpj: operator.document_cnpj || null,
          legalRepresentativeName: operator.legal_representative_name || null,
          legalRepresentativeCpf: operator.legal_representative_cpf || null,
          territorio,
          territoryId: operator.territory?.id || null,
          territoryVersion: operator.territory?.updated_at?.toISOString() || null,
          neighborhoods: operator.territory?.neighborhoods?.map(n => n.name) || [],
          cidadeUf,
          pixKey,
        },
        warnings: {
          pixMissing: !pixKey,
          pixNote: !pixKey ? 'Pix não é obrigatório para gerar a minuta, mas será necessário para repasses quando aplicável.' : null,
          financialActivation: 'A geração/assinatura da minuta v1.2 não cria Ativação Financeira.',
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao buscar dados para contrato' });
  }
});

// ─── Generate Contract Template v1.2 (PDF canônico) ──────────────────────────

import { PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import fs from 'fs';

router.post('/operators/:id/generate-contract-template', async (req: Request, res: Response) => {
  try {
    const operator = await prisma.operator_profiles.findUnique({
      where: { id: req.params.id },
      include: {
        admin: { select: { name: true, email: true, phone: true } },
        territory: {
          select: {
            id: true,
            name: true,
            city_name: true,
            uf: true,
            updated_at: true,
            neighborhoods: {
              where: { is_active: true },
              select: { name: true },
              orderBy: { name: 'asc' },
            },
          },
        },
      },
    });
    if (!operator) return res.status(404).json({ success: false, error: 'Operador não encontrado' });
    if (operator.contract_status === 'signed') {
      return res.status(409).json({ success: false, error: 'Contrato já assinado. Não é possível gerar novo modelo.' });
    }

    const email = operator.email || operator.admin.email || null;
    const telefone = operator.phone || operator.admin.phone || null;
    const endereco = operator.address || null;
    const territorio = operator.territory?.name || null;
    const cidadeUf = operator.territory?.city_name && operator.territory?.uf
      ? `${operator.territory.city_name}/${operator.territory.uf}`
      : null;

    const missingFields: string[] = [];
    if (!email) missingFields.push('email');
    if (!telefone) missingFields.push('telefone');
    if (!endereco) missingFields.push('endereco');
    if (!territorio) missingFields.push('territorio');
    if (!cidadeUf) missingFields.push('cidadeUf');

    if (operator.recipient_type === 'individual') {
      if (!operator.document_cpf) missingFields.push('cpf');
    } else {
      if (!operator.document_cnpj) missingFields.push('cnpj');
      if (!operator.legal_representative_name) missingFields.push('legal_representative_name');
      if (!operator.legal_representative_cpf) missingFields.push('legal_representative_cpf');
    }

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Dados insuficientes para gerar contrato v1.2.',
        missingFields,
      });
    }

    const generatedAt = new Date();
    const input: TerritorialManagerContractInput = {
      recipientType: operator.recipient_type as TerritorialManagerContractInput['recipientType'],
      displayName: operator.display_name || operator.admin.name,
      email: email!,
      phone: telefone!,
      address: endereco!,
      cpf: operator.document_cpf,
      rg: operator.document_rg,
      companyName: operator.company_name,
      tradeName: operator.trade_name,
      cnpj: operator.document_cnpj,
      legalRepresentativeName: operator.legal_representative_name,
      legalRepresentativeCpf: operator.legal_representative_cpf,
      territory: {
        id: operator.territory.id,
        name: territorio!,
        cityUf: cidadeUf!,
        version: operator.territory.updated_at.toISOString(),
        neighborhoods: operator.territory.neighborhoods.map(n => n.name),
      },
      generatedAt: generatedAt.toISOString(),
    };

    const contract = buildTerritorialManagerContractV12(input);

    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const pdfDone = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    const logoPath = path.resolve(__dirname, '../../assets/kaviar-logo.jpg');
    let logoBuffer: Buffer | null = null;
    try { logoBuffer = fs.readFileSync(logoPath); } catch {}

    const ensureSpace = (needed = 90) => {
      if (doc.y > 760 - needed) doc.addPage();
    };

    contract.parts.forEach((part, partIndex) => {
      if (partIndex > 0) doc.addPage();
      if (logoBuffer) doc.image(logoBuffer, 205, 35, { width: 150 });
      doc.moveDown(5.8);
      doc.font('Helvetica-Bold').fontSize(partIndex === 0 ? 15 : 14).text(part.title, { align: 'center' });
      if (part.subtitle) {
        doc.moveDown(0.25);
        doc.font('Helvetica').fontSize(9).text(part.subtitle, { align: 'center' });
      }
      doc.moveDown(0.8);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#B8942E');
      doc.moveDown(0.6);

      for (const metadata of part.metadata || []) {
        ensureSpace(35);
        doc.font('Helvetica').fontSize(8.5).text(metadata);
      }
      if ((part.metadata || []).length) doc.moveDown(0.7);

      for (const section of part.sections) {
        ensureSpace(100);
        doc.font('Helvetica-Bold').fontSize(9).text(section.title);
        doc.moveDown(0.2);

        for (const paragraph of section.paragraphs || []) {
          ensureSpace(65);
          doc.font('Helvetica').fontSize(8.7).text(paragraph, { align: 'justify', lineGap: 1.2 });
          doc.moveDown(0.35);
        }

        for (const bullet of section.bullets || []) {
          ensureSpace(45);
          doc.font('Helvetica').fontSize(8.7).text(`• ${bullet}`, { indent: 10, lineGap: 1.1 });
          doc.moveDown(0.2);
        }
        doc.moveDown(0.45);
      }
    });

    ensureSpace(210);
    doc.moveDown(1);
    doc.font('Helvetica-Bold').fontSize(10).text('ASSINATURAS', { align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica').fontSize(8.5)
      .text(`Versão contratual: ${TERRITORIAL_MANAGER_CONTRACT_VERSION}`, { align: 'center' })
      .text(`Data de geração da minuta: ${generatedAt.toLocaleDateString('pt-BR')}`, { align: 'center' })
      .text('A data acima não constitui Ativação Financeira.', { align: 'center' });
    doc.moveDown(1.6);
    doc.text('Local e data da assinatura: __________________________________________', { align: 'center' });
    doc.moveDown(1.8);
    doc.text('___________________________________________', { align: 'center' });
    doc.text('KAVIAR TECNOLOGIA E SERVIÇOS DIGITAIS LTDA', { align: 'center' });
    doc.moveDown(1.8);
    doc.text('___________________________________________', { align: 'center' });
    doc.text(`${input.displayName} — Gestor(a) Territorial / Representante`, { align: 'center' });

    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(7).font('Helvetica').fillColor('#888888')
        .text(
          `KAVIAR — Contrato Territorial ${TERRITORIAL_MANAGER_CONTRACT_VERSION} | ${COMPANY.email} | ${COMPANY.website}`,
          50,
          780,
          { align: 'center', width: 495 },
        );
      doc.fillColor('#1a1a1a');
    }

    doc.end();
    const pdfBuffer = await pdfDone;
    const templateHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    const s3Key = `manager-contract-templates/${req.params.id}/${TERRITORIAL_MANAGER_CONTRACT_VERSION}/${Date.now()}.pdf`;
    await contractS3.send(new PutObjectCommand({
      Bucket: contractBucket,
      Key: s3Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
      Metadata: {
        contract_version: TERRITORIAL_MANAGER_CONTRACT_VERSION,
        territory_id: input.territory.id,
        territory_version: input.territory.version,
        sha256: templateHash,
      },
    }));

    const previousKey = operator.contract_template_url || null;
    await prisma.operator_profiles.update({
      where: { id: req.params.id },
      data: {
        contract_template_url: s3Key,
        contract_status: 'available',
        terms_version: TERRITORIAL_MANAGER_CONTRACT_VERSION,
        updated_at: new Date(),
      },
    });

    const ctx = auditCtx(req);
    audit({
      adminId: ctx.adminId,
      adminEmail: ctx.adminEmail,
      action: 'generate_contract_template',
      entityType: 'operator_profile',
      entityId: req.params.id,
      oldValue: previousKey ? { contract_template_url: previousKey } : undefined,
      newValue: {
        contract_template_url: s3Key,
        contract_status: 'available',
        contract_version: TERRITORIAL_MANAGER_CONTRACT_VERSION,
        territory_id: input.territory.id,
        territory_version: input.territory.version,
        template_sha256: templateHash,
        financial_activation_created: false,
        method: 'auto_generate_canonical_v1_2',
      } as any,
      ipAddress: ctx.ip,
    });

    let whatsappSent = false;
    try {
      const operatorAdmin = operator.admin;
      if (operatorAdmin?.phone && process.env.WA_TPL_CONTRACT_AVAILABLE) {
        const { whatsappService } = await import('../modules/whatsapp');
        const firstName = operatorAdmin.name?.split(' ')[0] || operatorAdmin.name;
        await whatsappService.sendTemplate({
          to: operatorAdmin.phone,
          template: 'kaviar_contract_available_v1' as any,
          variables: { '1': firstName, '2': 'https://kaviar.com.br/admin/meu-contrato' },
        });
        whatsappSent = true;
      }
    } catch (notifyErr) {
      console.error('[CONTRACT_NOTIFY_FAIL]', (notifyErr as Error).message?.slice(0, 100));
    }

    console.log(
      `[CONTRACT_GENERATED] operator=${req.params.id} version=${TERRITORIAL_MANAGER_CONTRACT_VERSION} territory=${input.territory.id} whatsapp=${whatsappSent}`,
    );

    res.json({
      success: true,
      data: {
        contract_status: 'available',
        contract_version: TERRITORIAL_MANAGER_CONTRACT_VERSION,
        territory_id: input.territory.id,
        territory_version: input.territory.version,
        financial_activation_created: false,
        whatsappSent,
        generated: true,
      },
    });
  } catch (error: any) {
    console.error('[admin-payouts] generate-contract-template error:', (error as Error).message?.slice(0, 200));
    res.status(500).json({ success: false, error: 'Erro ao gerar contrato automaticamente' });
  }
});

export default router;
