import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateAdmin, requireSuperAdmin } from '../middlewares/auth';
import { audit, auditCtx } from '../utils/audit';
import { COMPANY } from '../config/company';
import { isLegacyPayAllowed, isMonthLegacy, isValidReferenceMonth } from '../services/finance/territory/engine-selection';

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
      include: { operator: { select: { id: true, admin_id: true } } },
    });
    if (!submission) return res.status(404).json({ success: false, error: 'Submissão não encontrada' });
    if (!['submitted', 'in_review'].includes(submission.status)) {
      return res.status(409).json({ success: false, error: `Submissão no estado '${submission.status}' não pode ser revisada` });
    }

    const adminId = (req as any).admin.id;
    const now = new Date();

    if (action === 'approve') {
      await prisma.contract_submissions.update({
        where: { id: req.params.id },
        data: { status: 'approved', reviewed_by: adminId, reviewed_at: now, updated_at: now },
      });
      await prisma.operator_profiles.update({
        where: { id: submission.operator_profile_id },
        data: { contract_status: 'signed', contract_url: submission.s3_key, contract_reviewed_by: adminId, contract_reviewed_at: now, contract_signed_at: now, updated_at: now },
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
      include: { admin: { select: { name: true, email: true, phone: true } }, territory: { select: { name: true, city_name: true, uf: true } } },
    });
    if (!operator) return res.status(404).json({ success: false, error: 'Operador não encontrado' });

    const nome = operator.display_name || operator.admin.name;
    const email = operator.admin.email;
    const telefone = operator.phone || operator.admin.phone || null;
    const cpf = operator.document_cpf || null;
    const endereco = operator.address || null;
    const territorio = operator.territory?.name || null;
    const cidadeUf = operator.territory?.city_name && operator.territory?.uf ? `${operator.territory.city_name}/${operator.territory.uf}` : null;
    const pixKey = operator.pix_key || null;

    const missingFields: string[] = [];
    if (!cpf) missingFields.push('cpf');
    if (!endereco) missingFields.push('endereco');
    if (!telefone) missingFields.push('telefone');
    if (!territorio) missingFields.push('territorio');
    if (!cidadeUf) missingFields.push('cidadeUf');

    const canGenerateContract = missingFields.length === 0;

    res.json({
      success: true,
      data: {
        canGenerateContract,
        missingFields,
        availableFields: { nome, email, telefone, cpf, endereco, territorio, cidadeUf, pixKey },
        warnings: { pixMissing: !pixKey, pixNote: !pixKey ? 'Pix não é obrigatório para geração do contrato, mas é necessário para ativação e repasses.' : null },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao buscar dados para contrato' });
  }
});

// ─── Generate Contract Template (PDF) ────────────────────────────────────────

import { PutObjectCommand } from '@aws-sdk/client-s3';
import path from 'path';
import fs from 'fs';

router.post('/operators/:id/generate-contract-template', async (req: Request, res: Response) => {
  try {
    const operator = await prisma.operator_profiles.findUnique({
      where: { id: req.params.id },
      include: { admin: { select: { name: true, email: true, phone: true } }, territory: { select: { name: true, city_name: true, uf: true } } },
    });
    if (!operator) return res.status(404).json({ success: false, error: 'Operador não encontrado' });
    if (operator.contract_status === 'signed') return res.status(409).json({ success: false, error: 'Contrato já assinado. Não é possível gerar novo modelo.' });

    const nome = operator.display_name || operator.admin.name;
    const email = operator.admin.email;
    const telefone = operator.phone || operator.admin.phone || null;
    const cpf = operator.document_cpf || null;
    const rg = (operator as any).document_rg || '—';
    const endereco = operator.address || null;
    const territorio = operator.territory?.name || null;
    const cidadeUf = operator.territory?.city_name && operator.territory?.uf ? `${operator.territory.city_name}/${operator.territory.uf}` : null;

    const missingFields: string[] = [];
    if (!cpf) missingFields.push('cpf');
    if (!endereco) missingFields.push('endereco');
    if (!telefone) missingFields.push('telefone');
    if (!territorio) missingFields.push('territorio');
    if (!cidadeUf) missingFields.push('cidadeUf');

    if (missingFields.length > 0) {
      return res.status(400).json({ success: false, error: 'Dados insuficientes para gerar contrato.', missingFields });
    }

    // Generate PDF with pdfkit
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));

    const pdfDone = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)));
    });

    // Load logo
    const logoPath = path.resolve(__dirname, '../../assets/kaviar-logo.jpg');
    let logoBuffer: Buffer | null = null;
    try { logoBuffer = fs.readFileSync(logoPath); } catch {}

    const dataHoje = new Date().toLocaleDateString('pt-BR');

    // ─── CONTRATO PRINCIPAL ───
    if (logoBuffer) doc.image(logoBuffer, 200, 40, { width: 160 });
    doc.moveDown(6);
    doc.fontSize(18).font('Helvetica-Bold').text('KAVIAR', { align: 'center' });
    doc.fontSize(12).font('Helvetica').text('Contrato de Parceria Operacional Territorial — Plataforma KAVIAR', { align: 'center' });
    if (COMPANY.cnpj.includes('AGUARDANDO')) {
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#CC0000').text('MINUTA — dados empresariais pendentes de confirmação', { align: 'center' });
      doc.fillColor('#1a1a1a');
    }
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#B8942E');
    doc.moveDown(0.5);

    // Contratante
    doc.fontSize(9).font('Helvetica-Bold').text('CONTRATANTE:');
    doc.font('Helvetica').text(COMPANY.legalName);
    doc.text(`CNPJ: ${COMPANY.cnpj}`);
    doc.text(`${COMPANY.publicLocation} — ${COMPANY.serviceMode}`);
    doc.text(`${COMPANY.email} | ${COMPANY.website}`);
    doc.moveDown(0.8);

    // Contratada
    doc.font('Helvetica-Bold').text('CONTRATADA — PARTE GESTORA:');
    doc.font('Helvetica');
    doc.text(`Nome: ${nome}`);
    doc.text(`CPF: ${cpf}`);
    doc.text(`RG: ${rg}`);
    doc.text(`E-mail: ${email}`);
    doc.text(`Telefone: ${telefone}`);
    doc.text(`Endereço: ${endereco}`);
    doc.text(`Cidade/UF: ${cidadeUf}`);
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
    doc.moveDown(0.5);

    // Cláusulas
    const clausulas = [
      { t: '1. OBJETO', b: `A KAVIAR TECNOLOGIA E SERVIÇOS DIGITAIS LTDA contrata a PARTE GESTORA para acompanhamento, captação e suporte local à operação da Plataforma KAVIAR no Território Operacional "${territorio}" (${cidadeUf}), em regime de parceria autônoma, sem vínculo empregatício.` },
      { t: '2. TERRITÓRIO OPERACIONAL', b: `Território: ${territorio}\nCidade/UF: ${cidadeUf}\nA delimitação poderá ser ajustada pela KAVIAR mediante comunicação prévia.` },
      { t: '3. OBRIGAÇÕES DA PARTE GESTORA', b: '• Realizar captação ativa de motoristas e passageiros;\n• Fornecer suporte local presencial quando necessário;\n• Reportar problemas operacionais;\n• Manter sigilo sobre dados da plataforma;\n• Cumprir LGPD e normas de confidencialidade;\n• Não representar a KAVIAR perante terceiros sem autorização.' },
      { t: '4. OBRIGAÇÕES DA KAVIAR', b: '• Disponibilizar acesso ao painel operacional;\n• Processar repasses conforme Anexo Comercial;\n• Fornecer materiais de apoio à captação;\n• Comunicar alterações com antecedência razoável.' },
      { t: '5. REMUNERAÇÃO', b: 'A PARTE GESTORA fará jus à participação econômica conforme regras definidas no Anexo Comercial I, parte integrante deste contrato.' },
      { t: '6. PAGAMENTO', b: 'Os repasses serão realizados via Pix, mediante aprovação manual da KAVIAR, até o 15º dia útil do mês subsequente ao período de apuração.' },
      { t: '7. VIGÊNCIA', b: 'Este contrato tem vigência indeterminada, iniciando-se na data de assinatura, podendo ser rescindido por qualquer das partes mediante comunicação com 30 dias de antecedência.' },
      { t: '8. RESCISÃO', b: '• Por qualquer parte, com 30 dias de antecedência;\n• Imediatamente por justa causa (fraude, violação de sigilo, descumprimento grave);\n• Repasses pendentes serão calculados pro rata até a data de desligamento.' },
      { t: '9. CONFIDENCIALIDADE E LGPD', b: 'A PARTE GESTORA compromete-se a manter sigilo sobre dados de passageiros, motoristas, faturamento e operação da plataforma. O descumprimento autoriza rescisão imediata e responsabilização civil.' },
      { t: '10. DISPOSIÇÕES GERAIS', b: '• Não há vínculo empregatício entre as partes;\n• Este contrato não confere exclusividade territorial permanente;\n• Foro: comarca do Rio de Janeiro/RJ.' },
    ];

    for (const c of clausulas) {
      if (doc.y > 700) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(9).text(c.t);
      doc.font('Helvetica').fontSize(9).text(c.b);
      doc.moveDown(0.6);
    }

    // Assinaturas
    if (doc.y > 620) doc.addPage();
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9).text(`Local e data: Rio de Janeiro, ${dataHoje}`, { align: 'center' });
    doc.moveDown(2);
    doc.text('___________________________________________', { align: 'center' });
    doc.text('KAVIAR TECNOLOGIA E SERVIÇOS DIGITAIS LTDA', { align: 'center' });
    doc.moveDown(2);
    doc.text('___________________________________________', { align: 'center' });
    doc.text(`${nome} — Gestor(a) Territorial`, { align: 'center' });

    // ─── ANEXO COMERCIAL (nova página) ───
    doc.addPage();
    if (logoBuffer) doc.image(logoBuffer, 200, 40, { width: 160 });
    doc.moveDown(6);
    doc.fontSize(16).font('Helvetica-Bold').text('ANEXO COMERCIAL I', { align: 'center' });
    doc.fontSize(11).text('Regra Inicial de Repasse Territorial', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('Plataforma KAVIAR', { align: 'center' });
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#B8942E');
    doc.moveDown(0.5);

    doc.font('Helvetica-Bold').fontSize(9).text('PARTES');
    doc.font('Helvetica');
    doc.text(`${COMPANY.legalName} — CNPJ: ${COMPANY.cnpj}`);
    doc.text(`Gestor(a) Territorial: ${nome} — CPF: ${cpf}`);
    doc.text(`Território: ${territorio} — ${cidadeUf}`);
    doc.text(`Data de início: ${dataHoje}`);
    doc.moveDown(1);

    const anexoCl = [
      { t: '1. PARTICIPAÇÃO ECONÔMICA', b: 'A PARTE GESTORA fará jus à participação econômica de 40% (quarenta por cento) sobre a taxa líquida da plataforma efetivamente recebida pela KAVIAR nas operações elegíveis vinculadas ao seu Território Operacional.' },
      { t: '2. BASE DE CÁLCULO', b: '• Taxa líquida = valor cobrado do passageiro menos repasse ao motorista;\n• Apenas corridas concluídas e pagas são elegíveis;\n• Cancelamentos, estornos e fraudes são excluídos.' },
      { t: '3. EXEMPLO', b: `Corrida R$ 25,00 → motorista recebe R$ 20,30 → taxa líquida R$ 4,70\nRepasse ao(à) Gestor(a) Territorial: 40% × R$ 4,70 = R$ 1,88\nAplicável sobre a taxa líquida padrão de R$ 470,00 por 100 corridas (referência).` },
      { t: '4. APURAÇÃO E PAGAMENTO', b: '• Apuração mensal, fechamento no último dia do mês;\n• Relatório disponibilizado no painel até o 5º dia útil;\n• Pagamento via Pix até o 15º dia útil do mês seguinte;\n• Valor mínimo para repasse: R$ 50,00 (acumula se não atingido).' },
      { t: '5. CONDIÇÕES', b: '• A KAVIAR reserva-se o direito de revisar percentuais com 30 dias de antecedência;\n• Este anexo prevalece sobre comunicações verbais;\n• Alterações exigem formalização por escrito.' },
    ];

    for (const c of anexoCl) {
      if (doc.y > 700) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(9).text(c.t);
      doc.font('Helvetica').fontSize(9).text(c.b);
      doc.moveDown(0.6);
    }

    // Assinaturas do anexo
    if (doc.y > 620) doc.addPage();
    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#ccc');
    doc.moveDown(1);
    doc.font('Helvetica').fontSize(9).text(`Rio de Janeiro, ${dataHoje}`, { align: 'center' });
    doc.moveDown(2);
    doc.text('___________________________________________', { align: 'center' });
    doc.text('KAVIAR TECNOLOGIA E SERVIÇOS DIGITAIS LTDA', { align: 'center' });
    doc.moveDown(2);
    doc.text('___________________________________________', { align: 'center' });
    doc.text(`${nome} — Gestor(a) Territorial`, { align: 'center' });

    // Footer on all pages
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(7).font('Helvetica').fillColor('#888888')
        .text('KAVIAR — Plataforma de Mobilidade | contato@kaviar.com.br | kaviar.com.br', 50, 780, { align: 'center', width: 495 });
      doc.fillColor('#1a1a1a');
    }

    doc.end();
    const pdfBuffer = await pdfDone;

    // Upload to S3
    const s3Key = `manager-contract-templates/${req.params.id}/${Date.now()}.pdf`;
    await contractS3.send(new PutObjectCommand({
      Bucket: contractBucket,
      Key: s3Key,
      Body: pdfBuffer,
      ContentType: 'application/pdf',
    }));

    // Update operator
    const previousKey = operator.contract_template_url || null;
    await prisma.operator_profiles.update({
      where: { id: req.params.id },
      data: { contract_template_url: s3Key, contract_status: 'available', updated_at: new Date() },
    });

    // Audit
    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'generate_contract_template', entityType: 'operator_profile', entityId: req.params.id, oldValue: previousKey ? { contract_template_url: previousKey } : undefined, newValue: { contract_template_url: s3Key, contract_status: 'available', method: 'auto_generate' } as any, ipAddress: ctx.ip });

    // Notify (non-blocking)
    let whatsappSent = false;
    try {
      const operatorAdmin = operator.admin;
      if (operatorAdmin?.phone && process.env.WA_TPL_CONTRACT_AVAILABLE) {
        const { whatsappService } = await import('../modules/whatsapp');
        const firstName = operatorAdmin.name?.split(' ')[0] || operatorAdmin.name;
        await whatsappService.sendTemplate({ to: operatorAdmin.phone, template: 'kaviar_contract_available_v1' as any, variables: { '1': firstName, '2': 'https://kaviar.com.br/admin/meu-contrato' } });
        whatsappSent = true;
      }
    } catch (notifyErr) {
      console.error('[CONTRACT_NOTIFY_FAIL]', (notifyErr as Error).message?.slice(0, 100));
    }
    console.log(`[CONTRACT_GENERATED] operator=${req.params.id} whatsapp=${whatsappSent}`);

    res.json({ success: true, data: { contract_status: 'available', whatsappSent, generated: true } });
  } catch (error: any) {
    console.error('[admin-payouts] generate-contract-template error:', (error as Error).message?.slice(0, 200));
    res.status(500).json({ success: false, error: 'Erro ao gerar contrato automaticamente' });
  }
});

export default router;
