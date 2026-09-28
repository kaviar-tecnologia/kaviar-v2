import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateAdmin, requireRole } from '../middlewares/auth';
import { audit, auditCtx } from '../utils/audit';
import { managerPhoneVariants, normalizeManagerPhone } from '../services/whatsapp/manager-applicant-link';

const router = Router();
router.use(authenticateAdmin, requireRole(['SUPER_ADMIN']));

const DECISION_STATUS: Record<string, string | null> = {
  ADVANCE: 'INTERESTED',
  APPROVE_ONBOARDING: 'WAITING_DOCUMENTS',
  REQUEST_INFO: 'CONTACTED',
  KEEP_REVIEW: null,
  DO_NOT_PROCEED: 'REJECTED',
};

const DECISION_LABEL: Record<string, string> = {
  ADVANCE: 'Avançar para a próxima etapa',
  APPROVE_ONBOARDING: 'Candidatura aprovada — cadastro em preparação',
  REQUEST_INFO: 'Solicitar informações adicionais',
  KEEP_REVIEW: 'Manter em análise',
  DO_NOT_PROCEED: 'Não prosseguir',
};

function decisionData(record: any) {
  if (!record || record.event_type !== 'DECISION') return null;
  try {
    const data = JSON.parse(record.description || '{}');
    if (data.schema !== 'manager_application_decision_v1' || !DECISION_LABEL[data.outcome]) return null;
    return {
      id: record.id,
      outcome: data.outcome,
      label: DECISION_LABEL[data.outcome],
      justification: data.justification,
      actorName: data.actorName || 'Administração',
      actorId: record.created_by_admin_id,
      communicationRequested: data.communicationRequested === true,
      communicationStatus: data.communicationRequested ? 'pending_manual' : 'not_requested',
      oldStatus: record.old_status,
      newStatus: record.new_status,
      createdAt: record.created_at,
    };
  } catch {
    return null;
  }
}

// GET /api/admin/crm/manager-applications - read-only summary, without clearing WhatsApp unread counters.
router.get('/', async (_req: Request, res: Response) => {
  try {
    const where = { lead_type: 'TERRITORIAL_MANAGER', deleted_at: null };
    const [leads, total] = await Promise.all([
      prisma.crm_leads.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: 200,
        select: {
          id: true, name: true, phone: true, email: true, status: true, source: true,
          priority: true, notes: true, territory_id: true, next_action: true,
          created_at: true, updated_at: true, last_contact_at: true,
        },
      }),
      prisma.crm_leads.count({ where }),
    ]);
    if (!leads.length) return res.json({ success: true, data: [], total, truncated: false });

    const ids = leads.map(lead => lead.id);
    const byPhone = new Map<string, string[]>();
    for (const lead of leads) {
      const phone = normalizeManagerPhone(lead.phone);
      if (phone) byPhone.set(phone, [...(byPhone.get(phone) || []), lead.id]);
    }
    const phones = Array.from(byPhone.keys());

    const [conversations, inviteLogs, history] = await Promise.all([
      prisma.wa_conversations.findMany({
        where: {
          OR: [
            { linked_entity_type: 'crm_lead', linked_entity_id: { in: ids } },
            { phone: { in: Array.from(new Set(phones.flatMap(managerPhoneVariants))) } },
          ],
        },
        select: {
          id: true, phone: true, linked_entity_type: true, linked_entity_id: true,
          unread_count: true, last_message_at: true, last_message_preview: true,
          last_inbound_at: true, status: true,
        },
      }),
      prisma.whatsapp_invite_logs.findMany({
        where: { invite_type: 'manager_application', target_phone_normalized: { in: phones }, twilio_status: { notIn: ['failed', 'undelivered'] } },
        select: { target_phone_normalized: true },
      }),
      prisma.crm_interactions.findMany({
        where: { lead_id: { in: ids }, event_type: 'DECISION' },
        orderBy: { created_at: 'desc' },
      }),
    ]);
    const invited = new Set(inviteLogs.map(log => log.target_phone_normalized));
    const lastDecision = new Map<string, ReturnType<typeof decisionData>>();
    for (const item of history) {
      if (!lastDecision.has(item.lead_id)) lastDecision.set(item.lead_id, decisionData(item));
    }

    const data = leads.map(lead => {
      const phone = normalizeManagerPhone(lead.phone);
      const candidatesWithPhone = phone ? (byPhone.get(phone) || []) : [];
      const linked = conversations.find(c => c.linked_entity_type === 'crm_lead' && c.linked_entity_id === lead.id);
      // Phone fallback only after an official candidature template and unique full-phone match.
      const phoneConversation = !linked && phone && lead.source === 'WEBSITE' && candidatesWithPhone.length === 1 && invited.has(phone)
        ? conversations.find(c => normalizeManagerPhone(c.phone) === phone)
        : null;
      const conversation = linked || phoneConversation || null;
      const requiresReview = Boolean(phone && (
        candidatesWithPhone.length > 1 ||
        (phoneConversation && phoneConversation.linked_entity_id &&
          (phoneConversation.linked_entity_type !== 'crm_lead' || phoneConversation.linked_entity_id !== lead.id))
      ));
      return {
        lead,
        conversation: conversation ? {
          id: conversation.id,
          unreadCount: conversation.unread_count,
          lastMessageAt: conversation.last_message_at,
          lastMessagePreview: conversation.last_message_preview,
          lastInboundAt: conversation.last_inbound_at,
          status: conversation.status,
        } : null,
        linkStatus: requiresReview ? 'review' : conversation ? 'linked' : 'none',
        lastDecision: lastDecision.get(lead.id) || null,
      };
    });

    return res.json({ success: true, data, total, truncated: total > leads.length });
  } catch (error) {
    console.error('[MANAGER_APPLICATIONS] list failed', error);
    return res.status(500).json({ success: false, error: 'Erro ao carregar candidaturas.' });
  }
});

// GET /api/admin/crm/manager-applications/:id/decisions — immutable decision history.
router.get('/:id/decisions', async (req: Request, res: Response) => {
  try {
    const lead = await prisma.crm_leads.findFirst({
      where: { id: req.params.id, deleted_at: null, lead_type: 'TERRITORIAL_MANAGER' },
      select: { id: true },
    });
    if (!lead) return res.status(404).json({ success: false, error: 'Candidatura não encontrada.' });
    const rows = await prisma.crm_interactions.findMany({
      where: { lead_id: lead.id, event_type: 'DECISION' },
      orderBy: { created_at: 'desc' },
    });
    return res.json({ success: true, data: rows.map(decisionData).filter(Boolean) });
  } catch (error) {
    console.error('[MANAGER_APPLICATIONS] history failed', error);
    return res.status(500).json({ success: false, error: 'Erro ao carregar decisões.' });
  }
});

// POST /api/admin/crm/manager-applications/:id/decisions — records a decision, never sends WhatsApp.
router.post('/:id/decisions', async (req: Request, res: Response) => {
  const { outcome, justification, expectedUpdatedAt, communicationRequested = false } = req.body || {};
  const reason = typeof justification === 'string' ? justification.trim() : '';
  if (typeof outcome !== 'string' || !Object.prototype.hasOwnProperty.call(DECISION_STATUS, outcome)) {
    return res.status(400).json({ success: false, error: 'Decisão inválida.' });
  }
  if (reason.length < 10 || reason.length > 2000) {
    return res.status(400).json({ success: false, error: 'Informe uma justificativa entre 10 e 2000 caracteres.' });
  }
  if (typeof expectedUpdatedAt !== 'string' || Number.isNaN(Date.parse(expectedUpdatedAt))) {
    return res.status(400).json({ success: false, error: 'Atualize o card antes de registrar a decisão.' });
  }
  if (typeof communicationRequested !== 'boolean') {
    return res.status(400).json({ success: false, error: 'Opção de comunicação inválida.' });
  }

  try {
    const admin = (req as any).admin;
    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.crm_leads.findFirst({
        where: { id: req.params.id, deleted_at: null, lead_type: 'TERRITORIAL_MANAGER' },
        select: { id: true, status: true, updated_at: true },
      });
      if (!lead) throw new Error('CANDIDATE_NOT_FOUND');
      if (lead.status === 'ACTIVE') throw new Error('ALREADY_ACTIVE');
      if (lead.updated_at.getTime() !== new Date(expectedUpdatedAt).getTime()) throw new Error('STALE_CANDIDATE');
      // Starting an approved candidature is a separate explicit decision, not
      // an implication of ADVANCE or of a generic INTERESTED CRM status.
      if (outcome === 'APPROVE_ONBOARDING') {
        if (lead.status !== 'INTERESTED' || communicationRequested !== true) throw new Error('ONBOARDING_NOT_READY');
        const previous = await tx.crm_interactions.findFirst({
          where: { lead_id: lead.id, event_type: 'DECISION' },
          orderBy: { created_at: 'desc' },
          select: { event_type: true, description: true },
        });
        if (decisionData(previous)?.outcome !== 'ADVANCE') throw new Error('ONBOARDING_NOT_READY');
      }
      const nextStatus = DECISION_STATUS[outcome] || lead.status;
      const change = await tx.crm_leads.updateMany({
        where: { id: lead.id, updated_at: lead.updated_at, status: lead.status },
        data: {
          status: nextStatus,
          ...(outcome === 'APPROVE_ONBOARDING'
            ? { next_action: 'Conferir dados, território, documentos e contrato territorial v1.2 antes de ativar o Gestor.' }
            : {}),
        },
      });
      if (change.count !== 1) throw new Error('STALE_CANDIDATE');
      const interaction = await tx.crm_interactions.create({
        data: {
          lead_id: lead.id,
          event_type: 'DECISION',
          description: JSON.stringify({
            schema: 'manager_application_decision_v1',
            outcome,
            justification: reason,
            actorName: String(admin.name || 'Administração').slice(0, 255),
            communicationRequested,
          }),
          old_status: lead.status,
          new_status: nextStatus,
          created_by_admin_id: admin.id,
        },
      });
      const updated = await tx.crm_leads.findUnique({ where: { id: lead.id }, select: { id: true, status: true, updated_at: true } });
      return { decision: decisionData(interaction), lead: updated };
    });

    const ctx = auditCtx(req);
    audit({
      adminId: ctx.adminId,
      adminEmail: ctx.adminEmail,
      action: 'manager_application_decision_recorded',
      entityType: 'crm_lead',
      entityId: req.params.id,
      newValue: { outcome, oldStatus: result.decision?.oldStatus, newStatus: result.decision?.newStatus, communicationRequested, decisionId: result.decision?.id },
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
    });
    return res.status(201).json({
      success: true,
      data: result,
      communication: communicationRequested
        ? 'Decisão salva. Abra a Central WhatsApp para revisar e enviar manualmente; nenhuma mensagem foi enviada.'
        : 'Nenhum envio de WhatsApp solicitado.',
    });
  } catch (error: any) {
    if (error?.message === 'CANDIDATE_NOT_FOUND') return res.status(404).json({ success: false, error: 'Candidatura não encontrada.' });
    if (error?.message === 'ALREADY_ACTIVE') return res.status(409).json({ success: false, error: 'Gestor ativo: decisões de candidatura não alteram a operação.' });
    if (error?.message === 'ONBOARDING_NOT_READY') return res.status(409).json({ success: false, code: 'ONBOARDING_NOT_READY', error: 'O cadastro só pode ser iniciado após uma decisão atual de avanço, com preparo da comunicação oficial.' });
    if (error?.message === 'STALE_CANDIDATE') return res.status(409).json({ success: false, code: 'STALE_CANDIDATE', error: 'Cadastro alterado por outra operação. Atualize antes de decidir.' });
    console.error('[MANAGER_APPLICATIONS] decision failed', error);
    return res.status(500).json({ success: false, error: 'Erro ao registrar decisão.' });
  }
});

export default router;
