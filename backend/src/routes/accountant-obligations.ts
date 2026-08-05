import { Router, Request, Response } from 'express';
import { PrismaClient, accounting_obligation_status } from '@prisma/client';
import { z } from 'zod';
import { verifyEntityAccess, getAccessibleEntityIds } from '../services/accounting/accounting-documents.service';

const prisma = new PrismaClient();
const router = Router();

// ── Validation ──────────────────────────────────────────────────────────

const createObligationSchema = z.object({
  legal_entity_id: z.string().uuid(),
  obligation_type: z.enum(['HONORARIOS', 'DAS_SIMPLES', 'GUIA_IMPOSTO', 'FGTS', 'INSS', 'TAXA_MUNICIPAL', 'BOLETO_FORNECEDOR', 'OUTRO']),
  description: z.string().trim().min(3).max(500),
  beneficiary: z.string().trim().max(200).nullish().transform(v => v || null),
  reference_number: z.string().trim().max(100).nullish().transform(v => v || null),
  competence_month: z.number().int().min(1).max(12).nullish().transform(v => v || null),
  competence_year: z.number().int().min(2020).max(2100).nullish().transform(v => v || null),
  amount_cents: z.number().int().min(1),
  issued_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().transform(v => v || null),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  barcode: z.string().trim().max(100).nullish().transform(v => v || null),
  pix_key: z.string().trim().max(200).nullish().transform(v => v || null),
  notes: z.string().trim().max(2000).nullish().transform(v => v || null),
}).strict();

const transitionSchema = z.object({
  status: z.enum(['SENT_TO_COMPANY', 'VIEWED', 'SCHEDULED', 'PAID', 'PROOF_UPLOADED', 'UNDER_VERIFICATION', 'VERIFIED', 'RECONCILED', 'REJECTED', 'CANCELED']),
  rejection_reason: z.string().trim().max(500).nullish().transform(v => v || null),
  paid_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().transform(v => v || null),
}).strict();

// ── Status machine ──────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, { targets: string[]; newOwner: Record<string, string> }> = {
  DRAFT: { targets: ['SENT_TO_COMPANY', 'CANCELED'], newOwner: { SENT_TO_COMPANY: 'COMPANY', CANCELED: 'ACCOUNTANT' } },
  SENT_TO_COMPANY: { targets: ['VIEWED', 'CANCELED'], newOwner: { VIEWED: 'COMPANY', CANCELED: 'ACCOUNTANT' } },
  VIEWED: { targets: ['SCHEDULED', 'PAID'], newOwner: { SCHEDULED: 'COMPANY', PAID: 'COMPANY' } },
  SCHEDULED: { targets: ['PAID'], newOwner: { PAID: 'COMPANY' } },
  PAID: { targets: ['PROOF_UPLOADED'], newOwner: { PROOF_UPLOADED: 'ACCOUNTANT' } },
  PROOF_UPLOADED: { targets: ['UNDER_VERIFICATION'], newOwner: { UNDER_VERIFICATION: 'ACCOUNTANT' } },
  UNDER_VERIFICATION: { targets: ['VERIFIED', 'REJECTED'], newOwner: { VERIFIED: 'ACCOUNTANT', REJECTED: 'COMPANY' } },
  VERIFIED: { targets: ['RECONCILED'], newOwner: { RECONCILED: 'ACCOUNTANT' } },
  REJECTED: { targets: ['PROOF_UPLOADED', 'PAID'], newOwner: { PROOF_UPLOADED: 'ACCOUNTANT', PAID: 'COMPANY' } },
  RECONCILED: { targets: [], newOwner: {} },
  CANCELED: { targets: [], newOwner: {} },
};

// ── Serializer ──────────────────────────────────────────────────────────

function toIso(d: any): string | null { return d ? (d instanceof Date ? d.toISOString() : String(d)) : null; }
function toDateStr(d: any): string | null { if (!d) return null; const dt = new Date(d); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`; }

function computeDueStatus(dueDate: any, status: string): string {
  if (['RECONCILED', 'CANCELED', 'VERIFIED'].includes(status)) return 'CLOSED';
  const due = new Date(dueDate);
  const today = new Date(); today.setHours(0,0,0,0);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 'OVERDUE';
  if (diffDays === 0) return 'DUE_TODAY';
  if (diffDays <= 7) return 'DUE_SOON';
  return 'OK';
}

function serialize(o: any) {
  return {
    id: o.id, legal_entity_id: o.legal_entity_id,
    obligation_type: o.obligation_type, status: o.status, action_owner: o.action_owner,
    description: o.description, beneficiary: o.beneficiary, reference_number: o.reference_number,
    competence_month: o.competence_month, competence_year: o.competence_year,
    amount_cents: o.amount_cents,
    amount_display: `R$ ${(o.amount_cents / 100).toFixed(2).replace('.', ',')}`,
    issued_at: toDateStr(o.issued_at), due_date: toDateStr(o.due_date),
    due_status: computeDueStatus(o.due_date, o.status),
    barcode: o.barcode, pix_key: o.pix_key, notes: o.notes,
    boleto_file_id: o.boleto_file_id, proof_file_id: o.proof_file_id,
    sent_at: toIso(o.sent_at), viewed_at: toIso(o.viewed_at), scheduled_at: toIso(o.scheduled_at),
    paid_at: toIso(o.paid_at), proof_uploaded_at: toIso(o.proof_uploaded_at),
    verified_at: toIso(o.verified_at), reconciled_at: toIso(o.reconciled_at),
    rejected_at: toIso(o.rejected_at), rejection_reason: o.rejection_reason,
    created_by_accountant_id: o.created_by_accountant_id,
    verified_by_accountant_id: o.verified_by_accountant_id,
    created_at: toIso(o.created_at), updated_at: toIso(o.updated_at),
    legal_entity: o.legal_entity ? { id: o.legal_entity.id, razao_social: o.legal_entity.razao_social, cnpj: o.legal_entity.cnpj } : undefined,
    created_by: o.created_by_accountant ? { nome_completo: o.created_by_accountant.nome_completo } : undefined,
  };
}

const INCLUDE = {
  legal_entity: { select: { id: true, razao_social: true, cnpj: true } },
  created_by_accountant: { select: { id: true, nome_completo: true } },
};

// ── Endpoints ───────────────────────────────────────────────────────────

router.get('/obligations', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const entityIds = await getAccessibleEntityIds(accountant.id);
    if (entityIds.length === 0) return res.json({ success: true, data: [] });

    const entityId = req.query.legal_entity_id as string;
    const filter = entityId && entityIds.includes(entityId) ? [entityId] : entityIds;
    const statusFilter = req.query.status as string;
    const actionOwner = req.query.action_owner as string;

    const where: any = { legal_entity_id: { in: filter } };
    if (statusFilter) where.status = statusFilter;
    if (actionOwner) where.action_owner = actionOwner;

    const obligations = await prisma.accounting_payment_obligations.findMany({
      where,
      include: INCLUDE,
      orderBy: [{ due_date: 'asc' }],
      take: 100,
    });

    res.json({ success: true, data: obligations.map(serialize) });
  } catch (err: any) {
    console.error('[obligations] list error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.get('/obligations/:id', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const ob = await prisma.accounting_payment_obligations.findUnique({
      where: { id: req.params.id }, include: INCLUDE,
    });
    if (!ob) return res.status(404).json({ success: false, error: 'Obrigação não encontrada' });

    const link = await verifyEntityAccess(accountant.id, ob.legal_entity_id);
    if (!link) return res.status(404).json({ success: false, error: 'Obrigação não encontrada' });

    res.json({ success: true, data: serialize(ob) });
  } catch (err: any) {
    console.error('[obligations] detail error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.post('/obligations', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const data = createObligationSchema.parse(req.body);

    const link = await verifyEntityAccess(accountant.id, data.legal_entity_id);
    if (!link) return res.status(403).json({ success: false, error: 'Acesso negado à empresa' });

    const ob = await prisma.accounting_payment_obligations.create({
      data: {
        ...data,
        due_date: new Date(data.due_date + 'T12:00:00Z'),
        issued_at: data.issued_at ? new Date(data.issued_at + 'T12:00:00Z') : null,
        created_by_accountant_id: accountant.id,
        action_owner: 'ACCOUNTANT',
        status: 'DRAFT',
      },
      include: INCLUDE,
    });

    res.status(201).json({ success: true, data: serialize(ob) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    console.error('[obligations] create error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// Status transition
router.post('/obligations/:id/transition', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const data = transitionSchema.parse(req.body);

    const ob = await prisma.accounting_payment_obligations.findUnique({ where: { id: req.params.id } });
    if (!ob) return res.status(404).json({ success: false, error: 'Obrigação não encontrada' });

    const link = await verifyEntityAccess(accountant.id, ob.legal_entity_id);
    if (!link) return res.status(404).json({ success: false, error: 'Obrigação não encontrada' });

    const machine = VALID_TRANSITIONS[ob.status];
    if (!machine || !machine.targets.includes(data.status)) {
      return res.status(400).json({ success: false, error: `Transição inválida: ${ob.status} → ${data.status}` });
    }

    const newOwner = machine.newOwner[data.status] || ob.action_owner;
    const now = new Date();

    const updateData: any = {
      status: data.status,
      action_owner: newOwner,
    };

    // Set timestamp for the new status
    const timestampMap: Record<string, string> = {
      SENT_TO_COMPANY: 'sent_at', VIEWED: 'viewed_at', SCHEDULED: 'scheduled_at',
      PAID: 'paid_at', PROOF_UPLOADED: 'proof_uploaded_at',
      UNDER_VERIFICATION: 'proof_uploaded_at', VERIFIED: 'verified_at',
      RECONCILED: 'reconciled_at', REJECTED: 'rejected_at',
    };
    const tsField = timestampMap[data.status];
    if (tsField) updateData[tsField] = now;

    if (data.status === 'REJECTED') updateData.rejection_reason = data.rejection_reason;
    if (data.status === 'VERIFIED' || data.status === 'RECONCILED') updateData.verified_by_accountant_id = accountant.id;
    if (data.paid_at) updateData.paid_at = new Date(data.paid_at + 'T12:00:00Z');

    const updated = await prisma.accounting_payment_obligations.update({
      where: { id: req.params.id },
      data: updateData,
      include: INCLUDE,
    });

    console.info('[obligations:audit]', JSON.stringify({
      action: 'STATUS_TRANSITION',
      obligation_id: ob.id,
      from: ob.status, to: data.status,
      accountant_id: accountant.id,
      timestamp: now.toISOString(),
    }));

    res.json({ success: true, data: serialize(updated) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    console.error('[obligations] transition error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// Attach boleto file
router.patch('/obligations/:id/boleto', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const { file_id } = req.body;
    if (!file_id) return res.status(400).json({ success: false, error: 'file_id é obrigatório' });

    const ob = await prisma.accounting_payment_obligations.findUnique({ where: { id: req.params.id } });
    if (!ob) return res.status(404).json({ success: false, error: 'Obrigação não encontrada' });

    const link = await verifyEntityAccess(accountant.id, ob.legal_entity_id);
    if (!link) return res.status(404).json({ success: false, error: 'Obrigação não encontrada' });

    const updated = await prisma.accounting_payment_obligations.update({
      where: { id: req.params.id },
      data: { boleto_file_id: file_id },
      include: INCLUDE,
    });

    res.json({ success: true, data: serialize(updated) });
  } catch (err: any) {
    console.error('[obligations] attach boleto error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// Attach proof file
router.patch('/obligations/:id/proof', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const { file_id } = req.body;
    if (!file_id) return res.status(400).json({ success: false, error: 'file_id é obrigatório' });

    const ob = await prisma.accounting_payment_obligations.findUnique({ where: { id: req.params.id } });
    if (!ob) return res.status(404).json({ success: false, error: 'Obrigação não encontrada' });

    const link = await verifyEntityAccess(accountant.id, ob.legal_entity_id);
    if (!link) return res.status(404).json({ success: false, error: 'Obrigação não encontrada' });

    const updated = await prisma.accounting_payment_obligations.update({
      where: { id: req.params.id },
      data: { proof_file_id: file_id, proof_uploaded_at: new Date() },
      include: INCLUDE,
    });

    res.json({ success: true, data: serialize(updated) });
  } catch (err: any) {
    console.error('[obligations] attach proof error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

export const accountantObligationsRoutes = router;
export default router;
