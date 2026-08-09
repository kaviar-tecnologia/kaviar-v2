import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { verifyEntityAccess, getAccessibleEntityIds } from '../services/accounting/accounting-documents.service';
import {
  requireAccountingAccess,
  handleAccessError,
  getAccessibleEntityIdsForScope,
} from '../services/accounting/accounting-access.service';
import { runRecurringAutomation } from '../services/accounting/accounting-automation.service';

const prisma = new PrismaClient();
const router = Router();

// ── Recurring Templates ──────────────────────────────────────

const createTemplateSchema = z.object({
  legal_entity_id: z.string().uuid(),
  obligation_type: z.enum(['HONORARIOS', 'DAS_SIMPLES', 'GUIA_IMPOSTO', 'FGTS', 'INSS', 'TAXA_MUNICIPAL', 'BOLETO_FORNECEDOR', 'OUTRO']),
  description: z.string().trim().min(3).max(500),
  beneficiary: z.string().trim().max(200).nullish().transform(v => v || null),
  amount_cents: z.number().int().min(1),
  day_of_month_due: z.number().int().min(1).max(31),
  days_before_due_to_create: z.number().int().min(1).max(60).default(15),
  notes: z.string().trim().max(2000).nullish().transform(v => v || null),
}).strict();

router.get('/recurring-templates', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const entityIds = await getAccessibleEntityIdsForScope(accountant.id, 'FINANCEIRO');
    if (entityIds.length === 0) return res.json({ success: true, data: [] });

    const entityId = req.query.legal_entity_id as string;
    const filter = entityId && entityIds.includes(entityId) ? [entityId] : entityIds;

    const templates = await prisma.accounting_recurring_templates.findMany({
      where: { legal_entity_id: { in: filter } },
      include: { legal_entity: { select: { id: true, razao_social: true } } },
      orderBy: { day_of_month_due: 'asc' },
    });

    res.json({ success: true, data: templates.map(t => ({
      ...t,
      amount_display: `R$ ${(t.amount_cents / 100).toFixed(2).replace('.', ',')}`,
      created_at: t.created_at.toISOString(),
      updated_at: t.updated_at.toISOString(),
    })) });
  } catch (err: any) {
    console.error('[recurring-templates] list error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.post('/recurring-templates', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const data = createTemplateSchema.parse(req.body);

    await requireAccountingAccess(accountant.id, data.legal_entity_id, {
      scope: 'FINANCEIRO',
      permission: 'can_upload',
    });

    const template = await prisma.accounting_recurring_templates.create({
      data: { ...data, created_by_accountant_id: accountant.id },
      include: { legal_entity: { select: { id: true, razao_social: true } } },
    });

    res.status(201).json({ success: true, data: { ...template, amount_display: `R$ ${(template.amount_cents / 100).toFixed(2).replace('.', ',')}` } });
  } catch (err: any) {
    if (handleAccessError(err, res)) return;
    if (err.name === 'ZodError') return res.status(400).json({ success: false, error: 'Dados inválidos', details: err.errors });
    console.error('[recurring-templates] create error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.patch('/recurring-templates/:id', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const { is_active } = req.body;

    const template = await prisma.accounting_recurring_templates.findUnique({ where: { id: req.params.id } });
    if (!template) return res.status(404).json({ success: false, error: 'Modelo não encontrado' });

    await requireAccountingAccess(accountant.id, template.legal_entity_id, {
      scope: 'FINANCEIRO',
      permission: 'can_upload',
    });

    const updated = await prisma.accounting_recurring_templates.update({
      where: { id: req.params.id },
      data: { is_active: is_active ?? template.is_active },
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    if (handleAccessError(err, res)) return;
    console.error('[recurring-templates] update error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// ── Automation Config ──────────────────────────────────────

router.get('/automation-config', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const entityIds = await getAccessibleEntityIdsForScope(accountant.id, 'FINANCEIRO');

    const configs = await prisma.accounting_automation_config.findMany({
      where: { legal_entity_id: { in: entityIds } },
      include: { legal_entity: { select: { id: true, razao_social: true } } },
    });

    res.json({ success: true, data: configs });
  } catch (err: any) {
    console.error('[automation-config] error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

router.patch('/automation-config/:entityId', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const { entityId } = req.params;

    await requireAccountingAccess(accountant.id, entityId, {
      scope: 'FINANCEIRO',
      permission: 'can_upload',
    });

    const { is_active, auto_create_competency, auto_create_obligations, send_reminder_d7, send_reminder_d1 } = req.body;

    const config = await prisma.accounting_automation_config.upsert({
      where: { legal_entity_id: entityId },
      create: {
        legal_entity_id: entityId,
        is_active: is_active ?? false,
        auto_create_competency: auto_create_competency ?? false,
        auto_create_obligations: auto_create_obligations ?? false,
        activated_at: is_active ? new Date() : null,
      },
      update: {
        is_active: is_active ?? undefined,
        auto_create_competency: auto_create_competency ?? undefined,
        auto_create_obligations: auto_create_obligations ?? undefined,
        send_reminder_d7: send_reminder_d7 ?? undefined,
        send_reminder_d1: send_reminder_d1 ?? undefined,
        activated_at: is_active ? new Date() : undefined,
      },
    });

    res.json({ success: true, data: config });
  } catch (err: any) {
    if (handleAccessError(err, res)) return;
    console.error('[automation-config] update error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// ── Manual trigger (for accountant to run automation now) ──

router.post('/automation/run', async (req: Request, res: Response) => {
  try {
    const result = await runRecurringAutomation();
    console.info('[automation] manual run:', JSON.stringify(result));
    res.json({ success: true, data: result });
  } catch (err: any) {
    console.error('[automation] run error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// ── Automation log ──

router.get('/automation-log', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const entityIds = await getAccessibleEntityIdsForScope(accountant.id, 'FINANCEIRO');

    const logs = await prisma.accounting_automation_log.findMany({
      where: { legal_entity_id: { in: entityIds } },
      orderBy: { created_at: 'desc' },
      take: 50,
    });

    res.json({ success: true, data: logs });
  } catch (err: any) {
    console.error('[automation-log] error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

export const accountantAutomationRoutes = router;
export default router;
