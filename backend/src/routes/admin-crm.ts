import { Router, Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateAdmin, requireSuperAdmin, requireRole } from '../middlewares/auth';
import { applyTerritoryScope } from '../middlewares/territory-scope';

const router = Router();
const prisma = new PrismaClient();

const CRM_ROLES = requireRole(['SUPER_ADMIN', 'TERRITORIAL_MANAGER']);

const VALID_STATUSES = ['NEW', 'CONTACTED', 'INTERESTED', 'WAITING_DOCUMENTS', 'WAITING_CONTRACT', 'WAITING_APPROVAL', 'ACTIVE', 'LOST', 'REJECTED', 'PAUSED'];
const VALID_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const VALID_LEAD_TYPES = ['TERRITORIAL_MANAGER', 'ASSOCIATION', 'DRIVER', 'PASSENGER', 'LOCAL_BUSINESS', 'RESTAURANT', 'BAKERY', 'PIZZERIA', 'SNACK_BAR', 'MARKET', 'PHARMACY', 'PET_SHOP', 'BEAUTY_SALON', 'WORKSHOP', 'PRIVATE_RIDE_CLIENT', 'PET_DRIVER', 'PARTNER', 'ADVERTISER', 'SUPPORT_POINT', 'OTHER'];
const VALID_SOURCES = ['MANUAL', 'MANAGER_REFERRAL', 'TEAM_MEMBER_REFERRAL', 'PET_FORM', 'PRIVATE_RIDE', 'WHATSAPP', 'ASSOCIATION', 'WEBSITE', 'LOCAL_VISIT', 'LOCAL_BUSINESS_PROSPECTION', 'OTHER'];
const VALID_EVENT_TYPES = ['NOTE', 'CALL', 'WHATSAPP', 'EMAIL', 'STATUS_CHANGE', 'ASSIGNED', 'DOCUMENT_RECEIVED', 'CONTRACT_SENT', 'PAYMENT_DISCUSSION', 'LOCAL_VISIT', 'PROPOSAL_SENT', 'PARTNERSHIP_DISCUSSION', 'SHOWCASE_DISCUSSION', 'OTHER'];

// Helper: build where clause with territory scope
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildLeadWhere(admin: any, scope: any, query: any) {
  const where: any = { deleted_at: null };

  // Territory scope for non-SUPER_ADMIN
  if (admin.role !== 'SUPER_ADMIN') {
    // Candidate decisions and private recruitment notes belong to SUPER_ADMIN only.
    where.NOT = { lead_type: 'TERRITORIAL_MANAGER' };
    const tIds = (scope?.territoryIds || []).filter((id: string) => id && UUID_RE.test(id));
    if (tIds.length === 0) {
      where.assigned_admin_id = admin.id;
    } else {
      where.OR = [
        { territory_id: { in: tIds } },
        { assigned_admin_id: admin.id },
      ];
    }
  }

  // Filters
  if (query.status) where.status = query.status;
  if (query.lead_type) where.lead_type = query.lead_type;
  if (query.source) where.source = query.source;
  if (query.territory_id && admin.role === 'SUPER_ADMIN') where.territory_id = query.territory_id;
  if (query.assigned_admin_id) where.assigned_admin_id = query.assigned_admin_id;
  if (query.business_category) where.business_category = query.business_category;
  if (query.priority) where.priority = query.priority;

  if (query.search) {
    const s = query.search as string;
    where.AND = [
      ...(where.AND || []),
      {
        OR: [
          { name: { contains: s, mode: 'insensitive' } },
          { business_name: { contains: s, mode: 'insensitive' } },
          { phone: { contains: s } },
          { email: { contains: s, mode: 'insensitive' } },
        ],
      },
    ];
  }

  if (query.date_from) {
    where.created_at = { ...(where.created_at || {}), gte: new Date(query.date_from as string) };
  }
  if (query.date_to) {
    where.created_at = { ...(where.created_at || {}), lte: new Date(query.date_to as string) };
  }

  if (query.captured_by_member_id) {
    where.captured_by_member_id = query.captured_by_member_id === 'none' ? null : (UUID_RE.test(query.captured_by_member_id as string) ? query.captured_by_member_id : undefined);
  }

  return where;
}

// GET /api/admin/crm/stats — summary cards
router.get('/stats', authenticateAdmin, CRM_ROLES, applyTerritoryScope, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;

    // Build where based on scope
    const baseWhere: any = { deleted_at: null };

    if (admin.role !== 'SUPER_ADMIN') {
      const tIds = (scope?.territoryIds || []).filter((id: string) => id && UUID_RE.test(id));
      if (tIds.length === 0) {
        baseWhere.assigned_admin_id = admin.id;
      } else {
        baseWhere.OR = [
          { territory_id: { in: tIds } },
          { assigned_admin_id: admin.id },
        ];
      }
    }

    // Use individual counts for robustness
    const statuses = ['NEW', 'CONTACTED', 'INTERESTED', 'WAITING_DOCUMENTS', 'WAITING_CONTRACT', 'WAITING_APPROVAL', 'ACTIVE', 'LOST', 'REJECTED', 'PAUSED'];
    const localBusinessTypes = ['LOCAL_BUSINESS', 'RESTAURANT', 'BAKERY', 'PIZZERIA', 'SNACK_BAR', 'MARKET', 'PHARMACY', 'PET_SHOP', 'BEAUTY_SALON', 'WORKSHOP', 'ADVERTISER', 'SUPPORT_POINT'];

    const results = await Promise.all([
      ...statuses.map(s => prisma.crm_leads.count({ where: { ...baseWhere, status: s } }).catch(() => 0)),
      prisma.crm_leads.count({ where: { ...baseWhere, lead_type: { in: localBusinessTypes } } }).catch(() => 0),
    ]);

    const stats: Record<string, number> = {};
    statuses.forEach((s, i) => { if (results[i] > 0) stats[s] = results[i]; });
    stats.LOCAL_BUSINESSES = results[results.length - 1];

    res.json({ success: true, data: stats });
  } catch (error) {
    console.error('[admin-crm] stats error:', error);
    res.status(500).json({ success: false, error: 'Erro ao carregar estatísticas' });
  }
});

// GET /api/admin/crm/leads — list with filters and pagination
router.get('/leads', authenticateAdmin, CRM_ROLES, applyTerritoryScope, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;
    const where = buildLeadWhere(admin, scope, req.query);

    // G2: resolve "my_team" filter
    if (req.query.captured_by_member_id === 'my_team') {
      const members = await prisma.manager_team_members.findMany({ where: { manager_admin_id: admin.id }, select: { id: true } });
      where.captured_by_member_id = members.length > 0 ? { in: members.map((m: any) => m.id) } : 'impossible-no-members';
    }

    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const offset = (page - 1) * limit;

    const [leads, total] = await Promise.all([
      prisma.crm_leads.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: offset,
        take: limit,
        include: { captured_by_member: { select: { id: true, name: true, role_type: true } } },
      }),
      prisma.crm_leads.count({ where }),
    ]);

    res.json({ success: true, data: leads, total, page, limit });
  } catch (error) {
    console.error('[admin-crm] list error:', error);
    res.status(500).json({ success: false, error: 'Erro ao listar leads' });
  }
});

// GET /api/admin/crm/leads/:id — detail
router.get('/leads/:id', authenticateAdmin, CRM_ROLES, applyTerritoryScope, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;
    const lead = await prisma.crm_leads.findFirst({
      where: { id: req.params.id, deleted_at: null },
      include: { interactions: { orderBy: { created_at: 'desc' }, take: 50 }, captured_by_member: { select: { id: true, name: true, role_type: true } } },
    });
    if (!lead) return res.status(404).json({ success: false, error: 'Lead não encontrado' });

    // Scope check for non-SUPER_ADMIN
    if (admin.role !== 'SUPER_ADMIN') {
      if (lead.lead_type === 'TERRITORIAL_MANAGER') return res.status(403).json({ success: false, error: 'Candidatura de Gestor restrita ao SUPER_ADMIN' });
      const inScope = (scope?.territoryIds || []).includes(lead.territory_id) || lead.assigned_admin_id === admin.id;
      if (!inScope) return res.status(403).json({ success: false, error: 'Sem permissão' });
    }

    res.json({ success: true, data: lead });
  } catch (error) {
    console.error('[admin-crm] detail error:', error);
    res.status(500).json({ success: false, error: 'Erro ao carregar lead' });
  }
});

// POST /api/admin/crm/leads — create
router.post('/leads', authenticateAdmin, CRM_ROLES, applyTerritoryScope, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;
    const { name, business_name, phone, email, lead_type, status, source, priority, business_category, business_address, contact_person, wants_showcase, wants_delivery_support, wants_partnership, wants_ads, commercial_notes, territory_id, neighborhood_id, assigned_admin_id, notes, next_action, next_action_at, captured_by_member_id } = req.body;

    if (!name) return res.status(400).json({ success: false, error: 'Nome é obrigatório' });
    if (admin.role !== 'SUPER_ADMIN' && lead_type === 'TERRITORIAL_MANAGER') return res.status(403).json({ success: false, error: 'Candidatura de Gestor restrita ao SUPER_ADMIN' });

    // Validate captured_by_member_id ownership
    let validCapturedBy: string | null = null;
    if (captured_by_member_id && UUID_RE.test(captured_by_member_id)) {
      const memberWhere: any = { id: captured_by_member_id };
      if (admin.role !== 'SUPER_ADMIN') memberWhere.manager_admin_id = admin.id;
      const member = await prisma.manager_team_members.findFirst({ where: memberWhere });
      if (!member) return res.status(400).json({ success: false, error: 'Captador não encontrado ou não pertence à sua equipe' });
      validCapturedBy = member.id;
    }

    // TERRITORIAL_MANAGER must use own territory
    let finalTerritoryId = territory_id && UUID_RE.test(territory_id) ? territory_id : null;
    if (admin.role !== 'SUPER_ADMIN') {
      const tIds = (scope?.territoryIds || []).filter((id: string) => id && UUID_RE.test(id));
      if (tIds.length > 0) {
        finalTerritoryId = territory_id && tIds.includes(territory_id) ? territory_id : tIds[0];
      } else {
        finalTerritoryId = null;
      }
    }

    const lead = await prisma.crm_leads.create({
      data: {
        name,
        business_name: business_name || null,
        phone: phone || null,
        email: email || null,
        lead_type: lead_type && VALID_LEAD_TYPES.includes(lead_type) ? lead_type : 'OTHER',
        status: status && VALID_STATUSES.includes(status) ? status : 'NEW',
        source: source && VALID_SOURCES.includes(source) ? source : 'MANUAL',
        priority: priority && VALID_PRIORITIES.includes(priority) ? priority : 'NORMAL',
        business_category: business_category || null,
        business_address: business_address || null,
        contact_person: contact_person || null,
        wants_showcase: wants_showcase ?? null,
        wants_delivery_support: wants_delivery_support ?? null,
        wants_partnership: wants_partnership ?? null,
        wants_ads: wants_ads ?? null,
        commercial_notes: commercial_notes || null,
        territory_id: finalTerritoryId,
        neighborhood_id: neighborhood_id || null,
        assigned_admin_id: admin.role === 'SUPER_ADMIN' ? (assigned_admin_id || admin.id) : admin.id,
        notes: notes || null,
        next_action: next_action || null,
        next_action_at: next_action_at ? new Date(next_action_at) : null,
        created_by_admin_id: admin.id,
        captured_by_member_id: validCapturedBy,
      },
    });

    // Create initial interaction
    await prisma.crm_interactions.create({
      data: { lead_id: lead.id, event_type: 'NOTE', description: 'Lead criado', created_by_admin_id: admin.id },
    });

    res.status(201).json({ success: true, data: lead });
  } catch (error) {
    console.error('[admin-crm] create error:', error);
    res.status(500).json({ success: false, error: 'Erro ao criar lead' });
  }
});

// PATCH /api/admin/crm/leads/:id — update
router.patch('/leads/:id', authenticateAdmin, CRM_ROLES, applyTerritoryScope, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;

    const existing = await prisma.crm_leads.findFirst({ where: { id: req.params.id, deleted_at: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Lead não encontrado' });

    // Scope check
    if (admin.role !== 'SUPER_ADMIN') {
      if (existing.lead_type === 'TERRITORIAL_MANAGER') return res.status(403).json({ success: false, error: 'Candidatura de Gestor restrita ao SUPER_ADMIN' });
      const inScope = (scope?.territoryIds || []).includes(existing.territory_id) || existing.assigned_admin_id === admin.id;
      if (!inScope) return res.status(403).json({ success: false, error: 'Sem permissão' });
    }

    const { name, business_name, phone, email, lead_type, source, priority, business_category, business_address, contact_person, wants_showcase, wants_delivery_support, wants_partnership, wants_ads, commercial_notes, territory_id, neighborhood_id, assigned_admin_id, notes, next_action, next_action_at, last_contact_at, captured_by_member_id } = req.body;

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (business_name !== undefined) data.business_name = business_name || null;
    if (phone !== undefined) data.phone = phone || null;
    if (email !== undefined) data.email = email || null;
    if (lead_type !== undefined && VALID_LEAD_TYPES.includes(lead_type)) data.lead_type = lead_type;
    if (source !== undefined && VALID_SOURCES.includes(source)) data.source = source;
    if (priority !== undefined && VALID_PRIORITIES.includes(priority)) data.priority = priority;
    if (business_category !== undefined) data.business_category = business_category || null;
    if (business_address !== undefined) data.business_address = business_address || null;
    if (contact_person !== undefined) data.contact_person = contact_person || null;
    if (wants_showcase !== undefined) data.wants_showcase = wants_showcase;
    if (wants_delivery_support !== undefined) data.wants_delivery_support = wants_delivery_support;
    if (wants_partnership !== undefined) data.wants_partnership = wants_partnership;
    if (wants_ads !== undefined) data.wants_ads = wants_ads;
    if (commercial_notes !== undefined) data.commercial_notes = commercial_notes || null;
    if (neighborhood_id !== undefined) data.neighborhood_id = neighborhood_id || null;
    if (notes !== undefined) data.notes = notes || null;
    if (next_action !== undefined) data.next_action = next_action || null;
    if (next_action_at !== undefined) data.next_action_at = next_action_at ? new Date(next_action_at) : null;
    if (last_contact_at !== undefined) data.last_contact_at = last_contact_at ? new Date(last_contact_at) : null;

    // Validate captured_by_member_id ownership
    if (captured_by_member_id !== undefined) {
      if (captured_by_member_id === null || captured_by_member_id === '') {
        data.captured_by_member_id = null;
      } else if (UUID_RE.test(captured_by_member_id)) {
        const memberWhere: any = { id: captured_by_member_id };
        if (admin.role !== 'SUPER_ADMIN') memberWhere.manager_admin_id = admin.id;
        const member = await prisma.manager_team_members.findFirst({ where: memberWhere });
        if (!member) return res.status(400).json({ success: false, error: 'Captador não encontrado ou não pertence à sua equipe' });
        data.captured_by_member_id = member.id;
      }
    }

    // Territorial managers cannot turn a regular CRM lead into a manager application.
    if (admin.role !== 'SUPER_ADMIN' && lead_type === 'TERRITORIAL_MANAGER') return res.status(403).json({ success: false, error: 'Candidatura de Gestor restrita ao SUPER_ADMIN' });

    // Only SUPER_ADMIN can reassign or change territory
    if (admin.role === 'SUPER_ADMIN') {
      if (assigned_admin_id !== undefined) data.assigned_admin_id = assigned_admin_id || null;
      if (territory_id !== undefined) data.territory_id = territory_id || null;
    }

    const lead = await prisma.crm_leads.update({ where: { id: req.params.id }, data });
    res.json({ success: true, data: lead });
  } catch (error) {
    console.error('[admin-crm] update error:', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar lead' });
  }
});

// PATCH /api/admin/crm/leads/:id/status — change status (creates interaction)
router.patch('/leads/:id/status', authenticateAdmin, CRM_ROLES, applyTerritoryScope, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;
    const { status, description } = req.body;

    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, error: `Status inválido. Válidos: ${VALID_STATUSES.join(', ')}` });
    }

    const existing = await prisma.crm_leads.findFirst({ where: { id: req.params.id, deleted_at: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Lead não encontrado' });

    if (admin.role !== 'SUPER_ADMIN') {
      if (existing.lead_type === 'TERRITORIAL_MANAGER') return res.status(403).json({ success: false, error: 'Candidatura de Gestor restrita ao SUPER_ADMIN' });
      const inScope = (scope?.territoryIds || []).includes(existing.territory_id) || existing.assigned_admin_id === admin.id;
      if (!inScope) return res.status(403).json({ success: false, error: 'Sem permissão' });
    }

    const [lead] = await prisma.$transaction([
      prisma.crm_leads.update({ where: { id: req.params.id }, data: { status } }),
      prisma.crm_interactions.create({
        data: {
          lead_id: req.params.id,
          event_type: 'STATUS_CHANGE',
          description: description || `Status alterado: ${existing.status} → ${status}`,
          old_status: existing.status,
          new_status: status,
          created_by_admin_id: admin.id,
        },
      }),
    ]);

    res.json({ success: true, data: lead });
  } catch (error) {
    console.error('[admin-crm] status change error:', error);
    res.status(500).json({ success: false, error: 'Erro ao alterar status' });
  }
});

// POST /api/admin/crm/leads/:id/interactions — add interaction
router.post('/leads/:id/interactions', authenticateAdmin, CRM_ROLES, applyTerritoryScope, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;
    const { event_type, description } = req.body;

    if (!event_type || !VALID_EVENT_TYPES.includes(event_type)) {
      return res.status(400).json({ success: false, error: `Tipo inválido. Válidos: ${VALID_EVENT_TYPES.join(', ')}` });
    }

    const existing = await prisma.crm_leads.findFirst({ where: { id: req.params.id, deleted_at: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Lead não encontrado' });

    if (admin.role !== 'SUPER_ADMIN') {
      if (existing.lead_type === 'TERRITORIAL_MANAGER') return res.status(403).json({ success: false, error: 'Candidatura de Gestor restrita ao SUPER_ADMIN' });
      const inScope = (scope?.territoryIds || []).includes(existing.territory_id) || existing.assigned_admin_id === admin.id;
      if (!inScope) return res.status(403).json({ success: false, error: 'Sem permissão' });
    }

    const interaction = await prisma.crm_interactions.create({
      data: {
        lead_id: req.params.id,
        event_type,
        description: description || null,
        created_by_admin_id: admin.id,
      },
    });

    // Update last_contact_at
    await prisma.crm_leads.update({ where: { id: req.params.id }, data: { last_contact_at: new Date() } });

    res.status(201).json({ success: true, data: interaction });
  } catch (error) {
    console.error('[admin-crm] interaction error:', error);
    res.status(500).json({ success: false, error: 'Erro ao registrar interação' });
  }
});

// GET /api/admin/crm/leads/:id/interactions — list interactions
router.get('/leads/:id/interactions', authenticateAdmin, CRM_ROLES, applyTerritoryScope, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;

    const existing = await prisma.crm_leads.findFirst({ where: { id: req.params.id, deleted_at: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Lead não encontrado' });

    if (admin.role !== 'SUPER_ADMIN') {
      if (existing.lead_type === 'TERRITORIAL_MANAGER') return res.status(403).json({ success: false, error: 'Candidatura de Gestor restrita ao SUPER_ADMIN' });
      const inScope = (scope?.territoryIds || []).includes(existing.territory_id) || existing.assigned_admin_id === admin.id;
      if (!inScope) return res.status(403).json({ success: false, error: 'Sem permissão' });
    }

    const interactions = await prisma.crm_interactions.findMany({
      where: { lead_id: req.params.id },
      orderBy: { created_at: 'desc' },
    });

    res.json({ success: true, data: interactions });
  } catch (error) {
    console.error('[admin-crm] interactions list error:', error);
    res.status(500).json({ success: false, error: 'Erro ao listar interações' });
  }
});

// GET /api/admin/crm/export — CSV export (SUPER_ADMIN only)
router.get('/export', authenticateAdmin, requireSuperAdmin, applyTerritoryScope, async (req: Request, res: Response) => {
  try {
    const where = buildLeadWhere((req as any).admin, null, req.query);
    const leads = await prisma.crm_leads.findMany({ where, orderBy: { created_at: 'desc' }, take: 5000 });

    const header = 'id,name,business_name,phone,email,lead_type,status,priority,source,business_category,territory_id,assigned_admin_id,next_action,next_action_at,last_contact_at,created_at\n';
    const rows = leads.map(l => [
      l.id, `"${(l.name || '').replace(/"/g, '""')}"`, `"${(l.business_name || '').replace(/"/g, '""')}"`,
      l.phone || '', l.email || '', l.lead_type, l.status, l.priority || 'NORMAL', l.source,
      l.business_category || '', l.territory_id || '', l.assigned_admin_id || '',
      `"${(l.next_action || '').replace(/"/g, '""')}"`, l.next_action_at || '', l.last_contact_at || '', l.created_at,
    ].join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=crm_leads_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(header + rows);
  } catch (error) {
    console.error('[admin-crm] export error:', error);
    res.status(500).json({ success: false, error: 'Erro ao exportar' });
  }
});

// DELETE /api/admin/crm/leads/:id — soft delete (SUPER_ADMIN only)
router.delete('/leads/:id', authenticateAdmin, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const existing = await prisma.crm_leads.findFirst({ where: { id: req.params.id, deleted_at: null } });
    if (!existing) return res.status(404).json({ success: false, error: 'Lead não encontrado' });

    await prisma.crm_leads.update({ where: { id: req.params.id }, data: { deleted_at: new Date() } });
    res.json({ success: true });
  } catch (error) {
    console.error('[admin-crm] delete error:', error);
    res.status(500).json({ success: false, error: 'Erro ao remover lead' });
  }
});

export default router;
