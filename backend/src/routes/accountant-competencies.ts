import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { verifyEntityAccess, getAccessibleEntityIds } from '../services/accounting/accounting-documents.service';

const prisma = new PrismaClient();
const router = Router();

// Validation
const createCompetencySchema = z.object({
  legal_entity_id: z.string().uuid(),
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  expected_deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish().transform(v => v || null),
  notes: z.string().trim().max(2000).nullish().transform(v => v || null),
}).strict();

const transitionSchema = z.object({
  status: z.enum(['OPEN', 'WAITING_DOCUMENTS', 'UNDER_REVIEW', 'PENDING_CORRECTION', 'COMPLETED', 'REOPENED', 'CANCELED']),
  reopen_reason: z.string().trim().max(500).nullish().transform(v => v || null),
}).strict();

// State machine
const VALID_TRANSITIONS: Record<string, string[]> = {
  OPEN: ['WAITING_DOCUMENTS', 'UNDER_REVIEW', 'CANCELED'],
  WAITING_DOCUMENTS: ['UNDER_REVIEW', 'OPEN', 'CANCELED'],
  UNDER_REVIEW: ['COMPLETED', 'PENDING_CORRECTION', 'CANCELED'],
  PENDING_CORRECTION: ['WAITING_DOCUMENTS', 'UNDER_REVIEW', 'CANCELED'],
  COMPLETED: ['REOPENED'],
  REOPENED: ['WAITING_DOCUMENTS', 'UNDER_REVIEW', 'OPEN', 'CANCELED'],
  CANCELED: [],
};

// Serializer
function toIso(d: any): string | null { return d ? (d instanceof Date ? d.toISOString() : String(d)) : null; }
function toDateStr(d: any): string | null { if (!d) return null; const dt = new Date(d); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`; }

const MONTH_NAMES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

function serialize(c: any) {
  return {
    id: c.id, legal_entity_id: c.legal_entity_id,
    month: c.month, year: c.year,
    period_label: `${MONTH_NAMES[c.month]}/${c.year}`,
    status: c.status, action_owner: c.action_owner,
    expected_deadline: toDateStr(c.expected_deadline),
    completed_at: toIso(c.completed_at),
    reopened_at: toIso(c.reopened_at), reopen_reason: c.reopen_reason,
    notes: c.notes,
    created_at: toIso(c.created_at), updated_at: toIso(c.updated_at),
    legal_entity: c.legal_entity ? { id: c.legal_entity.id, razao_social: c.legal_entity.razao_social } : undefined,
    responsible: c.responsible_accountant ? { nome_completo: c.responsible_accountant.nome_completo } : undefined,
    documents_count: c._count?.documents ?? undefined,
    obligations_count: c._count?.obligations ?? undefined,
  };
}

const INCLUDE = {
  legal_entity: { select: { id: true, razao_social: true, cnpj: true } },
  responsible_accountant: { select: { id: true, nome_completo: true } },
  _count: { select: { documents: true, obligations: true } },
};

// ── Endpoints ──────────────────────────────────────────────────

router.get('/competencies', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const entityIds = await getAccessibleEntityIds(accountant.id);
    if (entityIds.length === 0) return res.json({ success: true, data: [] });

    const entityId = req.query.legal_entity_id as string;
    const statusFilter = req.query.status as string;
    const filter = entityId && entityIds.includes(entityId) ? [entityId] : entityIds;

    const where: any = { legal_entity_id: { in: filter } };
    if (statusFilter) where.status = statusFilter;

    const competencies = await prisma.accounting_competencies.findMany({
      where, include: INCLUDE,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 100,
    });

    res.json({ success: true, data: competencies.map(serialize) });
  } catch (err: any) {
    console.error('[competencies] list error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.get('/competencies/:id', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const comp = await prisma.accounting_competencies.findUnique({
      where: { id: req.params.id },
      include: {
        ...INCLUDE,
        documents: { include: { document: { include: { document_type: { select: { name: true, category: true } } } } } },
        obligations: { select: { id: true, description: true, amount_cents: true, due_date: true, status: true } },
      },
    });
    if (!comp) return res.status(404).json({ success: false, error: 'Competência não encontrada' });

    const link = await verifyEntityAccess(accountant.id, comp.legal_entity_id);
    if (!link) return res.status(404).json({ success: false, error: 'Competência não encontrada' });

    const data = {
      ...serialize(comp),
      documents: comp.documents.map(d => ({ id: d.document_id, name: d.document?.document_type?.name, category: d.document?.document_type?.category, linked_at: d.linked_at })),
      obligations: comp.obligations.map(o => ({ id: o.id, description: o.description, amount_display: `R$ ${(o.amount_cents / 100).toFixed(2).replace('.', ',')}`, due_date: toDateStr(o.due_date), status: o.status })),
    };

    res.json({ success: true, data });
  } catch (err: any) {
    console.error('[competencies] detail error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.post('/competencies', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const data = createCompetencySchema.parse(req.body);

    const link = await verifyEntityAccess(accountant.id, data.legal_entity_id);
    if (!link) return res.status(403).json({ success: false, error: 'Acesso negado à empresa' });

    const comp = await prisma.accounting_competencies.create({
      data: {
        legal_entity_id: data.legal_entity_id,
        month: data.month,
        year: data.year,
        expected_deadline: data.expected_deadline ? new Date(data.expected_deadline + 'T12:00:00Z') : null,
        notes: data.notes,
        responsible_accountant_id: accountant.id,
        created_by_accountant_id: accountant.id,
      },
      include: INCLUDE,
    });

    res.status(201).json({ success: true, data: serialize(comp) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    if (err.code === 'P2002') return res.status(409).json({ success: false, error: 'Competência já existe para este período e empresa' });
    console.error('[competencies] create error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// Status transition
router.post('/competencies/:id/transition', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const data = transitionSchema.parse(req.body);

    const comp = await prisma.accounting_competencies.findUnique({ where: { id: req.params.id } });
    if (!comp) return res.status(404).json({ success: false, error: 'Competência não encontrada' });

    const link = await verifyEntityAccess(accountant.id, comp.legal_entity_id);
    if (!link) return res.status(404).json({ success: false, error: 'Competência não encontrada' });

    const allowed = VALID_TRANSITIONS[comp.status] || [];
    if (!allowed.includes(data.status)) {
      return res.status(400).json({ success: false, error: `Transição inválida: ${comp.status} → ${data.status}` });
    }

    // Specific rules
    if (data.status === 'REOPENED' && !data.reopen_reason) {
      return res.status(400).json({ success: false, error: 'Motivo de reabertura é obrigatório' });
    }

    const updateData: any = { status: data.status };

    if (data.status === 'COMPLETED') {
      updateData.completed_at = new Date();
      updateData.completed_by_accountant_id = accountant.id;
      updateData.action_owner = 'ACCOUNTANT';
    } else if (data.status === 'REOPENED') {
      updateData.reopened_at = new Date();
      updateData.reopen_reason = data.reopen_reason;
      updateData.completed_at = null;
      updateData.action_owner = 'ACCOUNTANT';
    } else if (data.status === 'WAITING_DOCUMENTS') {
      updateData.action_owner = 'COMPANY';
    } else {
      updateData.action_owner = 'ACCOUNTANT';
    }

    const updated = await prisma.accounting_competencies.update({
      where: { id: req.params.id },
      data: updateData,
      include: INCLUDE,
    });

    res.json({ success: true, data: serialize(updated) });
  } catch (err: any) {
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    console.error('[competencies] transition error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// Link document to competency
router.post('/competencies/:id/link-document', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const { document_id } = req.body;
    if (!document_id) return res.status(400).json({ success: false, error: 'document_id é obrigatório' });

    const comp = await prisma.accounting_competencies.findUnique({ where: { id: req.params.id } });
    if (!comp) return res.status(404).json({ success: false, error: 'Competência não encontrada' });

    const link = await verifyEntityAccess(accountant.id, comp.legal_entity_id);
    if (!link) return res.status(404).json({ success: false, error: 'Competência não encontrada' });

    await prisma.accounting_competency_documents.create({
      data: { competency_id: req.params.id, document_id, linked_by_accountant_id: accountant.id },
    });

    res.json({ success: true, data: { message: 'Documento vinculado à competência.' } });
  } catch (err: any) {
    if (err.code === 'P2002') return res.status(409).json({ success: false, error: 'Documento já vinculado' });
    console.error('[competencies] link-document error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// Link obligation to competency
router.post('/competencies/:id/link-obligation', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const { obligation_id } = req.body;
    if (!obligation_id) return res.status(400).json({ success: false, error: 'obligation_id é obrigatório' });

    const comp = await prisma.accounting_competencies.findUnique({ where: { id: req.params.id } });
    if (!comp) return res.status(404).json({ success: false, error: 'Competência não encontrada' });

    await prisma.accounting_payment_obligations.update({
      where: { id: obligation_id },
      data: { competency_id: req.params.id },
    });

    res.json({ success: true, data: { message: 'Obrigação vinculada à competência.' } });
  } catch (err: any) {
    console.error('[competencies] link-obligation error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

export const accountantCompetenciesRoutes = router;
export default router;
