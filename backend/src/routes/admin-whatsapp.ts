import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { authenticateAdmin, requireRole } from '../middlewares/auth';
import { applyTerritoryScope } from '../middlewares/territory-scope';
import { getAdminTerritoryScope, TerritoryScope } from '../services/territory-scope.service';
import { auditWrite } from '../middlewares/audit-write';
import { getTwilioClient, getWhatsAppFrom, normalizeWhatsAppTo, WHATSAPP_ENV } from '../modules/whatsapp/whatsapp-client';

const router = Router();

const TERRITORIAL_ROLES = ["TERRITORIAL_MANAGER", "TERRITORIAL_OPERATOR"];

function isTerritorialRole(role: string | undefined): boolean {
  return Boolean(role && TERRITORIAL_ROLES.includes(role));
}

function noRowsWhere() {
  return { id: "__none__" };
}

async function buildTerritorialConversationWhere(admin: any, scope: TerritoryScope | null): Promise<any> {
  if (!isTerritorialRole(admin?.role)) return {};

  const territoryIds = Array.isArray(scope?.territoryIds) ? scope!.territoryIds : [];
  const neighborhoodIds = Array.isArray(scope?.neighborhoodIds) ? scope!.neighborhoodIds : [];
  if (!territoryIds.length && !neighborhoodIds.length) return noRowsWhere();

  const [drivers, passengers, guides, crmLeads] = await Promise.all([
    neighborhoodIds.length
      ? prisma.drivers.findMany({ where: { neighborhood_id: { in: neighborhoodIds } }, select: { id: true } })
      : Promise.resolve([]),
    neighborhoodIds.length
      ? prisma.passengers.findMany({ where: { neighborhood_id: { in: neighborhoodIds } }, select: { id: true } })
      : Promise.resolve([]),
    neighborhoodIds.length
      ? prisma.tourist_guides.findMany({ where: { community_id: { in: neighborhoodIds } }, select: { id: true } })
      : Promise.resolve([]),
    territoryIds.length
      ? prisma.crm_leads.findMany({ where: { deleted_at: null, territory_id: { in: territoryIds } }, select: { id: true } })
      : Promise.resolve([]),
  ]);

  const driverIds = drivers.map((d) => d.id);
  const passengerIds = passengers.map((p) => p.id);
  const guideIds = guides.map((g) => g.id);
  const crmLeadIds = crmLeads.map((l) => l.id);
  const petHomologations = await prisma.pet_homologations.findMany({
    where: {
      OR: [
        ...(driverIds.length ? [{ driver_id: { in: driverIds } }] : []),
        { operator_id: admin.id },
      ],
    },
    select: { id: true },
  });
  const petIds = petHomologations.map((p) => p.id);

  const or: any[] = [];
  if (driverIds.length) or.push({ linked_entity_type: "driver", linked_entity_id: { in: driverIds } });
  if (passengerIds.length) or.push({ linked_entity_type: "passenger", linked_entity_id: { in: passengerIds } });
  if (guideIds.length) or.push({ linked_entity_type: "guide", linked_entity_id: { in: guideIds } });
  if (crmLeadIds.length) or.push({ linked_entity_type: "consultant_lead", linked_entity_id: { in: crmLeadIds } });
  if (crmLeadIds.length) or.push({ linked_entity_type: "lead", linked_entity_id: { in: crmLeadIds } });
  if (crmLeadIds.length) or.push({ linked_entity_type: "crm_lead", linked_entity_id: { in: crmLeadIds } });
  if (petIds.length) or.push({ linked_entity_type: "pet_homologation", linked_entity_id: { in: petIds } });

  return or.length ? { OR: or } : noRowsWhere();
}

async function buildConversationWhere(admin: any, scope: TerritoryScope | null, filters: any[] = []): Promise<any> {
  if (admin?.role === "PET_OPERATOR") return { assignee_id: admin.id, ...Object.assign({}, ...filters) };
  const scopeWhere = await buildTerritorialConversationWhere(admin, scope);
  const and = [scopeWhere, ...filters].filter((item) => item && Object.keys(item).length > 0);
  return and.length ? { AND: and } : {};
}

async function canAccessConversation(conversation: any, admin: any, scope: TerritoryScope | null): Promise<boolean> {
  if (!conversation) return false;
  if (admin?.role === "SUPER_ADMIN" || admin?.role === "OPERATOR") return true;
  if (admin?.role === "PET_OPERATOR") return conversation.assignee_id === admin.id;
  if (!isTerritorialRole(admin?.role)) return false;

  const scopeWhere = await buildTerritorialConversationWhere(admin, scope);
  const count = await prisma.wa_conversations.count({ where: { AND: [{ id: conversation.id }, scopeWhere] } });
  return count > 0;
}

// GET /api/admin/whatsapp/messages/:id/media — proxy seguro (auth via query param para <img src>)
router.get('/messages/:id/media', async (req: Request, res: Response) => {
  try {
    const tokenStr = (req.headers.authorization?.replace('Bearer ', '') || req.query.token) as string;
    if (!tokenStr) return res.status(401).json({ success: false, error: 'Não autorizado' });

    const jwt = require('jsonwebtoken');
    let admin: any = null;
    try {
      const decoded = jwt.verify(tokenStr, process.env.JWT_SECRET) as any;
      const adminId = decoded.userId || decoded.adminId;
      if (adminId) {
        const found = await prisma.admins.findUnique({ where: { id: adminId } });
        if (found?.is_active) admin = { id: found.id, role: found.role, name: found.name };
      }
    } catch {}
    if (!admin) return res.status(401).json({ success: false, error: 'Não autorizado' });

    const message = await prisma.wa_messages.findUnique({
      where: { id: req.params.id },
      include: { conversation: { select: { id: true, assignee_id: true, linked_entity_type: true, linked_entity_id: true } } },
    });

    if (!message || !message.media_url) {
      return res.status(404).json({ success: false, error: 'Mídia não encontrada' });
    }

    if (admin.role === 'PET_OPERATOR' && message.conversation.assignee_id !== admin.id) {
      return res.status(403).json({ success: false, error: 'Sem permissão' });
    }
    if (isTerritorialRole(admin.role)) {
      const scope = await getAdminTerritoryScope(admin.id, admin.role);
      if (!(await canAccessConversation(message.conversation, admin, scope))) {
        return res.status(403).json({ success: false, error: 'Conversa fora do seu território.' });
      }
    }

    const twilioUrl = message.media_url;
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    const response = await fetch(twilioUrl, {
      headers: { Authorization: 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64') },
    });

    if (!response.ok) {
      return res.status(502).json({ success: false, error: 'Erro ao buscar mídia' });
    }

    res.set('Content-Type', message.media_type || 'application/octet-stream');
    res.set('Cache-Control', 'private, max-age=3600');
    const buffer = Buffer.from(await response.arrayBuffer());
    res.send(buffer);
  } catch (err: any) {
    console.error('[WA_MEDIA] proxy error:', err.message);
    res.status(500).json({ success: false, error: 'Erro ao servir mídia' });
  }
});

router.use(authenticateAdmin);
router.use(requireRole(['SUPER_ADMIN', 'OPERATOR', 'PET_OPERATOR', 'TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR']));
router.use(applyTerritoryScope);

// GET /api/admin/whatsapp/conversations
router.get('/conversations', async (req: Request, res: Response) => {
  try {
    const { status, contact_type, search, page = '1', limit = '30' } = req.query;
    const take = Math.min(parseInt(limit as string) || 30, 100);
    const skip = (Math.max(parseInt(page as string) || 1, 1) - 1) * take;

    const admin = (req as any).admin;
    const scope = (req as any).territoryScope as TerritoryScope | null;
    const filters: any[] = [];
    if (status) filters.push({ status });
    if (contact_type) filters.push({ contact_type });
    if (search) {
      const s = String(search).trim();
      filters.push({
        OR: [
          { phone: { contains: s } },
          { contact_name: { contains: s, mode: "insensitive" } },
          { whatsapp_name: { contains: s, mode: "insensitive" } },
        ],
      });
    }
    const where = await buildConversationWhere(admin, scope, filters);

    const [conversations, total] = await Promise.all([
      prisma.wa_conversations.findMany({
        where,
        orderBy: [
          { priority: 'desc' },  // urgent (u) > normal (n) alphabetically desc
          { last_message_at: { sort: 'desc', nulls: 'last' } },
        ],
        take,
        skip,
      }),
      prisma.wa_conversations.count({ where }),
    ]);

    const unreadTotal = await prisma.wa_conversations.aggregate({
      _sum: { unread_count: true },
      where: { AND: [where, { unread_count: { gt: 0 } }] },
    });

    res.json({
      success: true,
      data: conversations,
      pagination: { page: Math.floor(skip / take) + 1, limit: take, total, totalPages: Math.ceil(total / take) },
      unreadTotal: unreadTotal._sum.unread_count || 0,
    });
  } catch (err: any) {
    console.error('[WA_ADMIN] list error:', err);
    res.status(500).json({ success: false, error: 'Erro ao listar conversas' });
  }
});

// POST /api/admin/whatsapp/conversations/send — enviar mensagem criando/usando conversa existente
router.post('/conversations/send', auditWrite('send_whatsapp', 'conversation'), async (req: Request, res: Response) => {
  try {
    const { phone, body, contact_type, linked_entity_type, linked_entity_id, assignee_id } = req.body;
    if (!phone || !body?.trim()) {
      return res.status(400).json({ success: false, error: 'phone e body são obrigatórios' });
    }

    const admin = (req as any).admin;
    const scope = (req as any).territoryScope as TerritoryScope | null;
    if (isTerritorialRole(admin.role) && (!linked_entity_type || !linked_entity_id)) {
      return res.status(403).json({ success: false, error: 'Informe um contato vinculado ao seu território para iniciar conversa.' });
    }
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    // Normalizar para E.164: +55DDDNÚMERO
    let normalizedPhone = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;
    const digits = normalizedPhone.replace(/\D/g, '');
    if (digits.length === 11) normalizedPhone = `+55${digits}`; // DDD+num sem código país
    else if (digits.length === 13 && digits.startsWith('55')) normalizedPhone = `+${digits}`;
    else if (digits.length >= 12 && !digits.startsWith('55')) normalizedPhone = `+${digits}`;

    // Buscar conversa existente por telefone (variantes para evitar duplicidade)
    const suffix9 = digits.slice(-9);
    const allConvs = await prisma.wa_conversations.findMany({ where: { phone: { contains: suffix9 }, status: { not: 'spam' } }, take: 5 });
    let conversation = allConvs.find(c => c.phone.replace(/\D/g, '').slice(-9) === suffix9) || null;

    if (!conversation) {
      conversation = await prisma.wa_conversations.create({
        data: {
          phone: normalizedPhone,
          contact_type: contact_type || 'pet',
          linked_entity_type: linked_entity_type || null,
          linked_entity_id: linked_entity_id || null,
          assignee_id: assignee_id || null,
          status: 'in_progress',
          priority: 'normal',
          unread_count: 0,
          message_count: 0,
          last_message_at: new Date(),
          last_message_preview: body.trim().substring(0, 200),
        },
      });
    } else if (contact_type && linked_entity_type && linked_entity_id) {
      // Conversa existente recebe contexto Pet: atualizar classificação e vínculo
      conversation = await prisma.wa_conversations.update({
        where: { id: conversation.id },
        data: {
          contact_type,
          linked_entity_type,
          linked_entity_id,
          ...(assignee_id ? { assignee_id } : {}),
        },
      });
    }

    if (!(await canAccessConversation(conversation, admin, scope))) {
      return res.status(403).json({ success: false, error: 'Conversa fora do seu território.' });
    }

    // Enviar via Twilio
    let twilioSid: string | null = null;
    if (WHATSAPP_ENV.enabled) {
      const client = getTwilioClient();
      const toPhone = conversation.phone.startsWith('+') ? conversation.phone : `+${conversation.phone}`;
      const msg = await client.messages.create({
        from: getWhatsAppFrom(),
        to: normalizeWhatsAppTo(toPhone),
        body: body.trim(),
      });
      twilioSid = msg.sid;
    }

    // Persistir mensagem outbound
    const message = await prisma.wa_messages.create({
      data: {
        conversation_id: conversation.id,
        direction: 'outbound',
        body: body.trim(),
        twilio_sid: twilioSid,
        sent_by_admin_id: admin.id,
        sent_by_admin_name: admin.name,
      },
    });

    // Atualizar conversa
    await prisma.wa_conversations.update({
      where: { id: conversation.id },
      data: {
        message_count: { increment: 1 },
        last_message_at: new Date(),
        last_message_preview: body.trim().substring(0, 200),
        status: conversation.status === 'new' ? 'in_progress' : undefined,
      },
    });

    console.log(`[WA_SEND] conv=${conversation.id} admin=${admin.name} twilio=${twilioSid || 'disabled'}`);
    res.json({ success: true, data: { conversation_id: conversation.id, message } });
  } catch (err: any) {
    console.error('[WA_SEND] error:', err);
    res.status(500).json({ success: false, error: 'Erro ao enviar mensagem' });
  }
});

// POST /api/admin/whatsapp/conversations/send-template — enviar template para primeiro contato
router.post('/conversations/send-template', auditWrite('send_whatsapp_template', 'conversation'), async (req: Request, res: Response) => {
  try {
    const { phone, template, variables, contact_type, linked_entity_type, linked_entity_id, assignee_id } = req.body;
    if (!phone || !template) {
      return res.status(400).json({ success: false, error: 'phone e template são obrigatórios' });
    }

    const admin = (req as any).admin;
    const scope = (req as any).territoryScope as TerritoryScope | null;
    if (isTerritorialRole(admin.role) && (!linked_entity_type || !linked_entity_id)) {
      return res.status(403).json({ success: false, error: 'Informe um contato vinculado ao seu território para iniciar conversa.' });
    }
    const { WhatsAppService } = require('../modules/whatsapp/whatsapp.service');
    const wa = new WhatsAppService();

    // Normalizar telefone
    const digits = phone.replace(/[^\d]/g, '');
    let normalizedPhone = digits.length === 11 ? `+55${digits}` : digits.length === 13 && digits.startsWith('55') ? `+${digits}` : phone.startsWith('+') ? phone : `+${digits}`;

    // Buscar ou criar conversa
    const suffix9 = digits.slice(-9);
    const allConvs = await prisma.wa_conversations.findMany({ where: { phone: { contains: suffix9 }, status: { not: 'spam' } }, take: 5 });
    let conversation = allConvs.find(c => c.phone.replace(/\D/g, '').slice(-9) === suffix9) || null;

    if (!conversation) {
      conversation = await prisma.wa_conversations.create({
        data: { phone: normalizedPhone, contact_type: contact_type || 'pet', linked_entity_type: linked_entity_type || null, linked_entity_id: linked_entity_id || null, assignee_id: assignee_id || null, status: 'in_progress', priority: 'normal', unread_count: 0, message_count: 0, last_message_at: new Date(), last_message_preview: `[Template: ${template}]` },
      });
    } else if (contact_type && linked_entity_type && linked_entity_id) {
      conversation = await prisma.wa_conversations.update({ where: { id: conversation.id }, data: { contact_type, linked_entity_type, linked_entity_id, ...(assignee_id ? { assignee_id } : {}) } });
    }

    if (!(await canAccessConversation(conversation, admin, scope))) {
      return res.status(403).json({ success: false, error: 'Conversa fora do seu território.' });
    }

    // Enviar template
    const result = await wa.sendTemplate({ to: normalizedPhone, template, variables: variables || {} });

    // Salvar outbound
    await prisma.wa_messages.create({
      data: { conversation_id: conversation.id, direction: 'outbound', body: `[Template: ${template}]`, twilio_sid: result.sid || null, sent_by_admin_id: admin.id, sent_by_admin_name: admin.name },
    });
    await prisma.wa_conversations.update({ where: { id: conversation.id }, data: { message_count: { increment: 1 }, last_message_at: new Date(), last_message_preview: `[Template: ${template}]` } });

    console.log(`[WA_TEMPLATE] conv=${conversation.id} template=${template} admin=${admin.name} sid=${result.sid || 'skipped'}`);
    res.json({ success: true, data: { conversation_id: conversation.id, twilio_sid: result.sid } });
  } catch (err: any) {
    console.error('[WA_TEMPLATE] error:', err.message);
    res.status(500).json({ success: false, error: err.message || 'Erro ao enviar template' });
  }
});

// GET /api/admin/whatsapp/conversations/:id
router.get('/conversations/:id', async (req: Request, res: Response) => {
  try {
    const conversation = await prisma.wa_conversations.findUnique({
      where: { id: req.params.id },
      include: {
        messages: { orderBy: { created_at: 'asc' } },
      },
    });

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversa não encontrada' });
    }

    const admin = (req as any).admin;
    const scope = (req as any).territoryScope as TerritoryScope | null;
    if (!(await canAccessConversation(conversation, admin, scope))) {
      return res.status(403).json({ success: false, error: 'Conversa fora do seu território.' });
    }

    // Resolver contexto da entidade vinculada
    let linkedEntity: any = null;
    if (conversation.linked_entity_type && conversation.linked_entity_id) {
      linkedEntity = await resolveLinkedEntity(conversation.linked_entity_type, conversation.linked_entity_id, !isTerritorialRole(admin.role));
    }

    // Marcar como lida
    if (conversation.unread_count > 0) {
      await prisma.wa_conversations.update({
        where: { id: conversation.id },
        data: { unread_count: 0 },
      });
    }

    res.json({
      success: true,
      data: {
        ...conversation,
        unread_count: 0,
        linkedEntity,
      },
    });
  } catch (err: any) {
    console.error('[WA_ADMIN] detail error:', err);
    res.status(500).json({ success: false, error: 'Erro ao buscar conversa' });
  }
});

// POST /api/admin/whatsapp/conversations/:id/messages
router.post('/conversations/:id/messages', auditWrite('send_whatsapp', 'conversation'), async (req: Request, res: Response) => {
  try {
    const { body } = req.body;
    if (!body || !body.trim()) {
      return res.status(400).json({ success: false, error: 'Mensagem não pode ser vazia' });
    }

    const conversation = await prisma.wa_conversations.findUnique({ where: { id: req.params.id } });
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversa não encontrada' });
    }

    const admin = (req as any).admin;
    const scope = (req as any).territoryScope as TerritoryScope | null;
    if (!(await canAccessConversation(conversation, admin, scope))) {
      return res.status(403).json({ success: false, error: 'Conversa fora do seu território.' });
    }
    const messageBody = body.trim();

    // Enviar via Twilio
    let twilioSid: string | null = null;
    if (WHATSAPP_ENV.enabled) {
      const client = getTwilioClient();
      const msg = await client.messages.create({
        from: getWhatsAppFrom(),
        to: normalizeWhatsAppTo(conversation.phone),
        body: messageBody,
      });
      twilioSid = msg.sid;
    }

    // Persistir mensagem outbound
    const message = await prisma.wa_messages.create({
      data: {
        conversation_id: conversation.id,
        direction: 'outbound',
        body: messageBody,
        twilio_sid: twilioSid,
        sent_by_admin_id: admin.id,
        sent_by_admin_name: admin.name,
      },
    });

    // Atualizar conversa
    await prisma.wa_conversations.update({
      where: { id: conversation.id },
      data: {
        message_count: { increment: 1 },
        last_message_at: new Date(),
        last_message_preview: messageBody.substring(0, 200),
        status: conversation.status === 'new' ? 'in_progress' : conversation.status,
      },
    });

    console.log(`[WA_OUTBOUND] conv=${conversation.id} admin=${admin.name} twilio=${twilioSid || 'disabled'}`);

    res.json({ success: true, data: message });
  } catch (err: any) {
    console.error('[WA_ADMIN] send error:', err);
    res.status(500).json({ success: false, error: 'Erro ao enviar mensagem' });
  }
});

// PATCH /api/admin/whatsapp/conversations/:id
router.patch('/conversations/:id', async (req: Request, res: Response) => {
  try {
    const conversation = await prisma.wa_conversations.findUnique({ where: { id: req.params.id } });
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversa não encontrada' });
    }

    const admin = (req as any).admin;
    const scope = (req as any).territoryScope as TerritoryScope | null;
    if (!(await canAccessConversation(conversation, admin, scope))) {
      return res.status(403).json({ success: false, error: 'Conversa fora do seu território.' });
    }

    const { status, contact_type, linked_entity_type, linked_entity_id, internal_notes } = req.body;
    const data: any = {};

    if (status !== undefined) data.status = status;
    if (contact_type !== undefined) data.contact_type = contact_type;
    if (internal_notes !== undefined) data.internal_notes = internal_notes;

    // Vínculo: atualizar tipo + id juntos, e resolver nome
    if (linked_entity_type !== undefined) {
      data.linked_entity_type = linked_entity_type || null;
      data.linked_entity_id = linked_entity_id || null;

      if (linked_entity_type && linked_entity_id) {
        const entity = await resolveLinkedEntity(linked_entity_type, linked_entity_id);
        if (entity) data.contact_name = entity.name;
      }
    }

    const updated = await prisma.wa_conversations.update({
      where: { id: req.params.id },
      data,
    });

    res.json({ success: true, data: updated });
  } catch (err: any) {
    console.error('[WA_ADMIN] update error:', err);
    res.status(500).json({ success: false, error: 'Erro ao atualizar conversa' });
  }
});

// Resolver entidade vinculada para o painel de contexto
async function resolveLinkedEntity(type: string, id: string, includeCredit = true): Promise<any> {
  switch (type) {
    case 'driver': {
      const d = await prisma.drivers.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, phone: true, status: true, vehicle_model: true, vehicle_color: true, vehicle_plate: true, neighborhood_id: true },
      });
      if (!d) return null;
      if (!includeCredit) return { ...d, type: 'driver' };
      const balance = await prisma.$queryRawUnsafe<any[]>('SELECT balance FROM credit_balance WHERE driver_id = $1', id);
      return { ...d, type: 'driver', credits: balance[0]?.balance ? parseFloat(balance[0].balance) : 0 };
    }
    case 'passenger': {
      return prisma.passengers.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, phone: true, status: true, neighborhood_id: true },
      }).then(p => p ? { ...p, type: 'passenger' } : null);
    }
    case 'guide': {
      return prisma.tourist_guides.findUnique({
        where: { id },
        select: { id: true, name: true, email: true, phone: true, status: true, community_id: true },
      }).then(g => g ? { ...g, type: 'guide' } : null);
    }
    case 'crm_lead': {
      return prisma.crm_leads.findFirst({
        where: { id, deleted_at: null },
        select: { id: true, name: true, email: true, phone: true, status: true, lead_type: true, source: true },
      }).then(l => l ? { ...l, type: 'crm_lead' } : null);
    }
    case 'consultant_lead': {
      return prisma.consultant_leads.findUnique({
        where: { id },
        select: { id: true, name: true, phone: true, status: true, region: true, source: true },
      }).then(l => l ? { ...l, type: 'consultant_lead' } : null);
    }
    case 'pet_homologation': {
      return prisma.pet_homologations.findUnique({
        where: { id },
        select: { id: true, name: true, phone: true, status: true, region: true, driver_id: true, operator_id: true, source: true },
      }).then(h => h ? { ...h, type: 'pet_homologation' } : null);
    }
    default:
      return null;
  }
}

export default router;
