import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { authenticateAdmin, requireSuperAdmin } from '../middlewares/auth';
import { audit, auditCtx } from '../utils/audit';
import {
  dryRunPrepareCity,
  executePrepareCity,
} from '../services/territory/city-preparation.service';
import { resolveGeojsonPath } from '../services/territory/territorial-dataset-registry';
import { acquireCityDataset } from '../services/territory/territorial-dataset-acquisition.service';
import {
  previewDatasetVersion,
  rejectDatasetVersion,
  listTerritoryDatasets,
} from '../services/territory/territorial-dataset-review.service';
import { applyDatasetVersion } from '../services/territory/territorial-dataset-apply.service';

const router = Router();
router.use(authenticateAdmin, requireSuperAdmin);

const VALID_LEVELS = ['country', 'state', 'city', 'region', 'operation'];
const VALID_STATUSES = ['planning', 'preparation', 'active', 'inactive'];
const ALLOWED_REGIONAL_ROLE = 'TERRITORIAL_OPERATOR';

// ─── Territories ─────────────────────────────────────────────────────────────

// GET /api/admin/territories
router.get('/', async (_req: Request, res: Response) => {
  try {
    const territories = await prisma.operational_territories.findMany({
      include: {
        _count: { select: { neighborhoods: true, territorial_partners: true, admin_access: true } },
        parent: { select: { id: true, name: true } },
      },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    });
    res.json({ success: true, data: territories });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao listar territórios' });
  }
});

// GET /api/admin/territories/:id
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const territory = await prisma.operational_territories.findUnique({
      where: { id: req.params.id },
      include: {
        parent: { select: { id: true, name: true, level: true } },
        children: { select: { id: true, name: true, level: true, status: true } },
        neighborhoods: { select: { id: true, name: true, city: true, is_active: true }, orderBy: { name: 'asc' } },
        territorial_partners: { select: { id: true, name: true, partner_type: true, status: true, plan: true, responsible_name: true, responsible_phone: true } },
        admin_access: {
          include: { admin: { select: { id: true, name: true, email: true, role: true, is_active: true } } },
        },
      },
    });
    if (!territory) return res.status(404).json({ success: false, error: 'Território não encontrado' });
    res.json({ success: true, data: territory });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao buscar território' });
  }
});

const createTerritorySchema = z.object({
  name: z.string().min(2).max(100),
  level: z.enum(['country', 'state', 'city', 'region', 'operation'] as const),
  status: z.enum(['planning', 'preparation', 'active', 'inactive'] as const).default('planning'),
  parent_id: z.string().optional().nullable(),
  uf: z.string().max(2).optional().nullable(),
  city_name: z.string().optional().nullable(),
  center_lat: z.number().min(-90).max(90).optional().nullable(),
  center_lng: z.number().min(-180).max(180).optional().nullable(),
  notes: z.string().optional().nullable(),
});

// POST /api/admin/territories
router.post('/', async (req: Request, res: Response) => {
  try {
    const data = createTerritorySchema.parse(req.body);

    if (data.parent_id) {
      const parent = await prisma.operational_territories.findUnique({ where: { id: data.parent_id } });
      if (!parent) return res.status(400).json({ success: false, error: 'Território pai não encontrado' });
    }

    const territory = await prisma.operational_territories.create({
      data: {
        name: data.name,
        level: data.level,
        status: data.status,
        parent_id: data.parent_id || null,
        uf: data.uf?.toUpperCase() || null,
        city_name: data.city_name || null,
        center_lat: data.center_lat ?? null,
        center_lng: data.center_lng ?? null,
        notes: data.notes || null,
        is_active: data.status === 'active',
      },
    });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'create_territory', entityType: 'territory', entityId: territory.id, newValue: { name: data.name, level: data.level, status: data.status }, ipAddress: ctx.ip });

    res.status(201).json({ success: true, data: territory });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: error.errors[0].message });
    res.status(500).json({ success: false, error: 'Erro ao criar território' });
  }
});

const updateTerritorySchema = z.object({
  name: z.string().min(2).max(100).optional(),
  status: z.enum(['planning', 'preparation', 'active', 'inactive'] as const).optional(),
  uf: z.string().max(2).optional().nullable(),
  city_name: z.string().optional().nullable(),
  center_lat: z.number().min(-90).max(90).optional().nullable(),
  center_lng: z.number().min(-180).max(180).optional().nullable(),
  notes: z.string().optional().nullable(),
  regulatory_status: z.enum(['not_evaluated', 'in_review', 'credentialing_required', 'controlled_operation', 'approved', 'blocked', 'suspended'] as const).optional(),
  regulatory_notes: z.string().optional().nullable(),
  moto_express_enabled: z.boolean().optional(),
  moto_passenger_enabled: z.boolean().optional(),
});

// PATCH /api/admin/territories/:id
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.operational_territories.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Território não encontrado' });

    const data = updateTerritorySchema.parse(req.body);
    const updates: any = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.status !== undefined) { updates.status = data.status; updates.is_active = data.status === 'active'; }
    if (data.uf !== undefined) updates.uf = data.uf?.toUpperCase() || null;
    if (data.city_name !== undefined) updates.city_name = data.city_name;
    if (data.center_lat !== undefined) updates.center_lat = data.center_lat;
    if (data.center_lng !== undefined) updates.center_lng = data.center_lng;
    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.regulatory_status !== undefined) { updates.regulatory_status = data.regulatory_status; updates.regulatory_checked_at = new Date(); updates.regulatory_checked_by = (req as any).admin.id; }
    if (data.regulatory_notes !== undefined) updates.regulatory_notes = data.regulatory_notes;
    if (data.moto_express_enabled !== undefined) updates.moto_express_enabled = data.moto_express_enabled;
    if (data.moto_passenger_enabled !== undefined) {
      if (data.moto_passenger_enabled === true) {
        const compliance = await prisma.moto_passenger_compliance.findUnique({ where: { territory_id: req.params.id } });
        if (compliance?.status !== 'APPROVED') {
          return res.status(403).json({ success: false, error: 'MOTO_PASSENGER_COMPLIANCE_NOT_APPROVED' });
        }
      }
      updates.moto_passenger_enabled = data.moto_passenger_enabled;
    }

    if (Object.keys(updates).length === 0) return res.status(400).json({ success: false, error: 'Nenhuma alteração' });

    const territory = await prisma.operational_territories.update({ where: { id: req.params.id }, data: updates });

    const ctx = auditCtx(req);
    const action = data.status ? (data.status === 'active' ? 'activate_territory' : data.status === 'inactive' ? 'deactivate_territory' : 'update_territory') : 'update_territory';
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action, entityType: 'territory', entityId: territory.id, oldValue: { status: existing.status }, newValue: updates, ipAddress: ctx.ip });

    res.json({ success: true, data: territory });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: error.errors[0].message });
    res.status(500).json({ success: false, error: 'Erro ao atualizar território' });
  }
});

// GET /api/admin/territories/:id/finance (read-only)
router.get('/:id/finance', async (req: Request, res: Response) => {
  try {
    const territory = await prisma.operational_territories.findUnique({ where: { id: req.params.id } });
    if (!territory) return res.status(404).json({ success: false, error: 'Território não encontrado' });

    // Resolve neighborhood_ids for this territory
    const neighborhoods = await prisma.neighborhoods.findMany({
      where: { territory_id: req.params.id },
      select: { id: true },
    });
    const nIds = neighborhoods.map((n) => n.id);

    // Resolve partner_ids for this territory
    const partners = await prisma.territorial_partners.findMany({
      where: { territory_id: req.params.id },
      select: { id: true },
    });
    const pIds = partners.map((p) => p.id);

    // Resolve driver_ids in territory
    const drivers = await prisma.drivers.findMany({
      where: { neighborhood_id: { in: nIds } },
      select: { id: true },
    });
    const dIds = drivers.map((d) => d.id);

    // Rides
    const rideFilter = nIds.length > 0 ? { origin_neighborhood_id: { in: nIds } } : { id: '__none__' };
    const [ridesTotal, ridesCompleted, ridesCanceled, ridesNoDriver] = await Promise.all([
      prisma.rides_v2.count({ where: rideFilter }),
      prisma.rides_v2.count({ where: { ...rideFilter, status: 'completed' } }),
      prisma.rides_v2.count({ where: { ...rideFilter, status: { in: ['canceled_by_passenger', 'canceled_by_driver'] } } }),
      prisma.rides_v2.count({ where: { ...rideFilter, status: 'no_driver' } }),
    ]);

    // Entities
    const passengersCount = nIds.length > 0
      ? await prisma.passengers.count({ where: { neighborhood_id: { in: nIds } } })
      : 0;

    // Credits
    let creditsPurchased = 0;
    let creditsConsumed = 0;
    if (dIds.length > 0) {
      const purchased = await prisma.driver_credit_purchases.aggregate({
        where: { driver_id: { in: dIds }, status: 'confirmed' },
        _sum: { credits_amount: true },
      });
      creditsPurchased = purchased._sum.credits_amount || 0;

      const consumed = await prisma.driver_credit_ledger.aggregate({
        where: { driver_id: { in: dIds }, delta: { lt: 0 } },
        _sum: { delta: true },
      });
      creditsConsumed = Math.abs(Number(consumed._sum.delta || 0));
    }

    // Compensations
    const compensations = dIds.length > 0
      ? await prisma.ride_compensations.aggregate({
          where: { driver_id: { in: dIds } },
          _count: true,
          _sum: { amount_cents: true },
        })
      : { _count: 0, _sum: { amount_cents: 0 } };

    // Partner finance
    let commissionsTotal = 0;
    let paymentsTotal = 0;
    let mensalidadesTotal = 0;
    if (pIds.length > 0) {
      const comms = await prisma.partner_commissions.aggregate({
        where: { partner_id: { in: pIds } },
        _sum: { commission_amount: true },
      });
      commissionsTotal = Number(comms._sum.commission_amount || 0);

      const payments = await prisma.partner_payments.aggregate({
        where: { partner_id: { in: pIds } },
        _sum: { amount_cents: true },
      });
      paymentsTotal = payments._sum.amount_cents || 0;

      const mensalidades = await prisma.partner_member_payments.aggregate({
        where: { partner_id: { in: pIds } },
        _sum: { amount_cents: true },
      });
      mensalidadesTotal = mensalidades._sum.amount_cents || 0;
    }

    // Revenue estimate from settlements
    let grossEstimated = 0;
    if (nIds.length > 0) {
      const revenue = await prisma.ride_settlements.aggregate({
        where: { origin_neighborhood_id: { in: nIds }, settled_at: { not: null } },
        _sum: { final_price: true },
      });
      grossEstimated = Number(revenue._sum.final_price || 0);
    }

    res.json({
      success: true,
      data: {
        rides: { total: ridesTotal, completed: ridesCompleted, canceled: ridesCanceled, no_driver: ridesNoDriver },
        entities: { drivers: dIds.length, passengers: passengersCount, partners: pIds.length },
        credits: { purchased: creditsPurchased, consumed: creditsConsumed },
        revenue: { gross_estimated: grossEstimated },
        compensations: { total: compensations._count, amount_cents: compensations._sum.amount_cents || 0 },
        partner_finance: { commissions_total: commissionsTotal, payments_total: paymentsTotal, mensalidades_total: mensalidadesTotal },
        status: territory.status,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao buscar financeiro territorial' });
  }
});

// ─── Finance Rules (Simulação) ───────────────────────────────────────────────

// GET /api/admin/territories/:id/finance-rules
router.get('/:id/finance-rules', async (req: Request, res: Response) => {
  try {
    const rules = await prisma.territory_finance_rules.findMany({
      where: { territory_id: req.params.id },
      orderBy: { created_at: 'desc' },
    });
    res.json({ success: true, data: rules });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao buscar regras' });
  }
});

const financeRuleSchema = z.object({
  matrix_share_percent: z.number().min(0).max(100),
  regional_share_percent: z.number().min(0).max(100),
  partner_commission_percent: z.number().min(0).max(100).default(5),
  min_monthly_fee_cents: z.number().int().optional().nullable(),
  revenue_threshold_cents: z.number().int().optional().nullable(),
  description: z.string().optional().nullable(),
  valid_from: z.string().optional().nullable(),
  valid_until: z.string().optional().nullable(),
});

// POST /api/admin/territories/:id/finance-rules
router.post('/:id/finance-rules', async (req: Request, res: Response) => {
  try {
    const data = financeRuleSchema.parse(req.body);

    if (Math.abs(data.matrix_share_percent + data.regional_share_percent - 100) > 0.01) {
      return res.status(400).json({ success: false, error: 'matrix_share_percent + regional_share_percent deve ser 100%' });
    }

    const territory = await prisma.operational_territories.findUnique({ where: { id: req.params.id } });
    if (!territory) return res.status(404).json({ success: false, error: 'Território não encontrado' });

    // Desativar regra ativa anterior
    await prisma.territory_finance_rules.updateMany({
      where: { territory_id: req.params.id, is_active: true },
      data: { is_active: false },
    });

    const rule = await prisma.territory_finance_rules.create({
      data: {
        territory_id: req.params.id,
        matrix_share_percent: data.matrix_share_percent,
        regional_share_percent: data.regional_share_percent,
        partner_commission_percent: data.partner_commission_percent,
        min_monthly_fee_cents: data.min_monthly_fee_cents ?? null,
        revenue_threshold_cents: data.revenue_threshold_cents ?? null,
        description: data.description || null,
        is_active: true,
        valid_from: data.valid_from ? new Date(data.valid_from) : null,
        valid_until: data.valid_until ? new Date(data.valid_until) : null,
        created_by: (req as any).admin.id,
      },
    });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'create_territory_finance_rule', entityType: 'territory_finance_rule', entityId: rule.id, newValue: { matrix: data.matrix_share_percent, regional: data.regional_share_percent, partner: data.partner_commission_percent }, ipAddress: ctx.ip });

    res.status(201).json({ success: true, data: rule });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: error.errors[0].message });
    res.status(500).json({ success: false, error: 'Erro ao criar regra' });
  }
});

// PATCH /api/admin/territories/:id/finance-rules/:ruleId
router.patch('/:id/finance-rules/:ruleId', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.territory_finance_rules.findUnique({ where: { id: req.params.ruleId } });
    if (!existing || existing.territory_id !== req.params.id) return res.status(404).json({ success: false, error: 'Regra não encontrada' });

    const data = financeRuleSchema.partial().parse(req.body);

    const matrix = data.matrix_share_percent ?? Number(existing.matrix_share_percent);
    const regional = data.regional_share_percent ?? Number(existing.regional_share_percent);
    if (Math.abs(matrix + regional - 100) > 0.01) {
      return res.status(400).json({ success: false, error: 'matrix_share_percent + regional_share_percent deve ser 100%' });
    }

    const rule = await prisma.territory_finance_rules.update({
      where: { id: req.params.ruleId },
      data: {
        ...(data.matrix_share_percent !== undefined && { matrix_share_percent: data.matrix_share_percent }),
        ...(data.regional_share_percent !== undefined && { regional_share_percent: data.regional_share_percent }),
        ...(data.partner_commission_percent !== undefined && { partner_commission_percent: data.partner_commission_percent }),
        ...(data.min_monthly_fee_cents !== undefined && { min_monthly_fee_cents: data.min_monthly_fee_cents }),
        ...(data.revenue_threshold_cents !== undefined && { revenue_threshold_cents: data.revenue_threshold_cents }),
        ...(data.description !== undefined && { description: data.description }),
      },
    });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'update_territory_finance_rule', entityType: 'territory_finance_rule', entityId: rule.id, oldValue: { matrix: Number(existing.matrix_share_percent), regional: Number(existing.regional_share_percent) }, newValue: { matrix, regional }, ipAddress: ctx.ip });

    res.json({ success: true, data: rule });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: error.errors[0].message });
    res.status(500).json({ success: false, error: 'Erro ao atualizar regra' });
  }
});

// DELETE /api/admin/territories/:id/finance-rules/:ruleId
router.delete('/:id/finance-rules/:ruleId', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.territory_finance_rules.findUnique({ where: { id: req.params.ruleId } });
    if (!existing || existing.territory_id !== req.params.id) return res.status(404).json({ success: false, error: 'Regra não encontrada' });

    await prisma.territory_finance_rules.update({ where: { id: req.params.ruleId }, data: { is_active: false } });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'deactivate_territory_finance_rule', entityType: 'territory_finance_rule', entityId: req.params.ruleId, ipAddress: ctx.ip });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao desativar regra' });
  }
});

// GET /api/admin/territories/:id/finance-simulation
router.get('/:id/finance-simulation', async (req: Request, res: Response) => {
  try {
    const territory = await prisma.operational_territories.findUnique({ where: { id: req.params.id } });
    if (!territory) return res.status(404).json({ success: false, error: 'Território não encontrado' });

    const rule = await prisma.territory_finance_rules.findFirst({
      where: { territory_id: req.params.id, is_active: true },
    });

    if (!rule) return res.json({ success: true, data: { has_rule: false, message: 'Nenhuma regra financeira ativa para este território.' } });

    // Período: mês atual
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const nIds = (await prisma.neighborhoods.findMany({ where: { territory_id: req.params.id }, select: { id: true } })).map(n => n.id);
    const pIds = (await prisma.territorial_partners.findMany({ where: { territory_id: req.params.id }, select: { id: true } })).map(p => p.id);

    if (nIds.length === 0) return res.json({ success: true, data: { has_rule: true, no_data: true, message: 'Território sem bairros vinculados.' } });

    // Fee total from settlements
    const settlements = await prisma.ride_settlements.aggregate({
      where: { origin_neighborhood_id: { in: nIds }, settled_at: { gte: monthStart } },
      _sum: { fee_amount: true, final_price: true },
      _count: true,
    });

    const totalFee = Number(settlements._sum.fee_amount || 0);
    const totalGross = Number(settlements._sum.final_price || 0);
    const ridesCount = settlements._count;

    const matrixShare = totalFee * Number(rule.matrix_share_percent) / 100;
    const regionalShare = totalFee * Number(rule.regional_share_percent) / 100;

    // Partner commissions in period
    let partnerCommissions = 0;
    if (pIds.length > 0) {
      const comms = await prisma.partner_commissions.aggregate({
        where: { partner_id: { in: pIds }, created_at: { gte: monthStart } },
        _sum: { commission_amount: true },
      });
      partnerCommissions = Number(comms._sum.commission_amount || 0);
    }

    const netRegional = regionalShare - partnerCommissions;

    res.json({
      success: true,
      data: {
        has_rule: true,
        period: { from: monthStart.toISOString(), to: now.toISOString(), label: `${now.toLocaleString('pt-BR', { month: 'long', year: 'numeric' })}` },
        rule: { matrix_share_percent: Number(rule.matrix_share_percent), regional_share_percent: Number(rule.regional_share_percent), partner_commission_percent: Number(rule.partner_commission_percent) },
        simulation: {
          rides_completed: ridesCount,
          gross_revenue: totalGross,
          platform_fee_total: totalFee,
          matrix_share_simulated: Math.round(matrixShare * 100) / 100,
          regional_share_simulated: Math.round(regionalShare * 100) / 100,
          partner_commissions: partnerCommissions,
          net_regional_simulated: Math.round(netRegional * 100) / 100,
        },
        disclaimer: 'Simulação financeira. Estes valores não representam repasse real, saldo disponível, cobrança, split ou pagamento automático.',
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao simular financeiro' });
  }
});

// ─── Regional Admins ─────────────────────────────────────────────────────────

// GET /api/admin/territories/regional-admins
router.get('/regional-admins/list', async (_req: Request, res: Response) => {
  try {
    const admins = await prisma.admins.findMany({
      where: { territory_access: { some: {} } },
      select: {
        id: true, name: true, email: true, role: true, is_active: true, created_at: true,
        territory_access: { include: { territory: { select: { id: true, name: true, level: true, status: true } } } },
        operator_profile: { select: { is_active: true, contract_status: true, document_status: true, contract_url: true, relationship_type: true, terms_accepted_at: true } },
      },
      orderBy: { created_at: 'desc' },
    });
    const data = admins.map(a => ({
      ...a,
      operator_profile: a.operator_profile ? {
        is_active: a.operator_profile.is_active,
        contract_status: a.operator_profile.contract_status,
        document_status: a.operator_profile.document_status,
        has_contract: !!a.operator_profile.contract_url,
        has_online_acceptance: !!a.operator_profile.terms_accepted_at,
        relationship_type: a.operator_profile.relationship_type,
      } : null,
    }));
    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao listar admins regionais' });
  }
});

const createRegionalAdminSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  territory_id: z.string().min(1),
  access_level: z.enum(['full', 'read_only']).default('full'),
  role_type: z.enum(['operator', 'manager']).default('operator'),
});

// POST /api/admin/territories/regional-admins
router.post('/regional-admins', async (req: Request, res: Response) => {
  try {
    const data = createRegionalAdminSchema.parse(req.body);

    const existingEmail = await prisma.admins.findUnique({ where: { email: data.email } });
    if (existingEmail) return res.status(409).json({ success: false, error: 'Email já cadastrado' });

    const territory = await prisma.operational_territories.findUnique({ where: { id: data.territory_id } });
    if (!territory) return res.status(400).json({ success: false, error: 'Território não encontrado' });

    const password = await bcrypt.hash(data.password, 12);
    const isManager = data.role_type === 'manager';
    const adminRole = isManager ? 'TERRITORIAL_MANAGER' : ALLOWED_REGIONAL_ROLE;
    const relationshipType = isManager ? 'territorial_manager' : 'territorial_operator';

    const result = await prisma.$transaction(async (tx) => {
      const admin = await tx.admins.create({
        data: {
          name: data.name,
          email: data.email.toLowerCase(),
          password,
          role: adminRole,
          is_active: true,
          must_change_password: true,
        },
      });
      const access = await tx.admin_territory_access.create({
        data: { admin_id: admin.id, territory_id: data.territory_id, access_level: data.access_level },
      });
      await tx.operator_profiles.create({
        data: {
          admin_id: admin.id,
          territory_id: data.territory_id,
          display_name: data.name,
          relationship_type: relationshipType,
          recipient_type: 'individual',
          contract_status: 'pending',
          document_status: 'pending',
          is_active: false,
        },
      });
      return { admin, access };
    });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'create_regional_admin', entityType: 'admin', entityId: result.admin.id, newValue: { name: data.name, email: data.email, territory: territory.name }, ipAddress: ctx.ip });

    res.status(201).json({ success: true, data: { id: result.admin.id, name: result.admin.name, email: result.admin.email, role: result.admin.role, territory: territory.name } });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: error.errors[0].message });
    res.status(500).json({ success: false, error: 'Erro ao criar admin regional' });
  }
});

// PATCH /api/admin/territories/regional-admins/:id
router.patch('/regional-admins/:id', async (req: Request, res: Response) => {
  try {
    const { is_active } = req.body;
    if (typeof is_active !== 'boolean') return res.status(400).json({ success: false, error: 'is_active obrigatório' });

    const admin = await prisma.admins.findUnique({ where: { id: req.params.id } });
    if (!admin) return res.status(404).json({ success: false, error: 'Admin não encontrado' });
    if (admin.role === 'SUPER_ADMIN') return res.status(403).json({ success: false, error: 'Não é possível alterar SUPER_ADMIN' });

    await prisma.admins.update({ where: { id: req.params.id }, data: { is_active } });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: is_active ? 'activate_regional_admin' : 'deactivate_regional_admin', entityType: 'admin', entityId: req.params.id, newValue: { is_active }, ipAddress: ctx.ip });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao atualizar admin' });
  }
});

// POST /api/admin/territories/regional-admins/:id/territories
router.post('/regional-admins/:id/territories', async (req: Request, res: Response) => {
  try {
    const { territory_id, access_level } = req.body;
    if (!territory_id) return res.status(400).json({ success: false, error: 'territory_id obrigatório' });

    const admin = await prisma.admins.findUnique({ where: { id: req.params.id } });
    if (!admin) return res.status(404).json({ success: false, error: 'Admin não encontrado' });
    if (admin.role === 'SUPER_ADMIN') return res.status(403).json({ success: false, error: 'SUPER_ADMIN não precisa de vínculo territorial' });

    const territory = await prisma.operational_territories.findUnique({ where: { id: territory_id } });
    if (!territory) return res.status(400).json({ success: false, error: 'Território não encontrado' });

    const existing = await prisma.admin_territory_access.findUnique({
      where: { admin_id_territory_id: { admin_id: req.params.id, territory_id } },
    });
    if (existing) return res.status(409).json({ success: false, error: 'Vínculo já existe' });

    await prisma.admin_territory_access.create({
      data: { admin_id: req.params.id, territory_id, access_level: access_level || 'full' },
    });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'link_admin_territory', entityType: 'admin_territory_access', entityId: req.params.id, newValue: { territory: territory.name, access_level: access_level || 'full' }, ipAddress: ctx.ip });

    res.status(201).json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao vincular território' });
  }
});

// DELETE /api/admin/territories/regional-admins/:id/territories/:territoryId
router.delete('/regional-admins/:id/territories/:territoryId', async (req: Request, res: Response) => {
  try {
    const existing = await prisma.admin_territory_access.findUnique({
      where: { admin_id_territory_id: { admin_id: req.params.id, territory_id: req.params.territoryId } },
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Vínculo não encontrado' });

    await prisma.admin_territory_access.delete({
      where: { admin_id_territory_id: { admin_id: req.params.id, territory_id: req.params.territoryId } },
    });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'unlink_admin_territory', entityType: 'admin_territory_access', entityId: req.params.id, newValue: { territory_id: req.params.territoryId }, ipAddress: ctx.ip });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao remover vínculo' });
  }
});

// DELETE /api/admin/territories/:id (safe delete)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const territory = await prisma.operational_territories.findUnique({ where: { id: req.params.id } });
    if (!territory) return res.status(404).json({ success: false, error: 'Território não encontrado' });

    const [neighborhoods, partners, admins, children] = await Promise.all([
      prisma.neighborhoods.count({ where: { territory_id: req.params.id } }),
      prisma.territorial_partners.count({ where: { territory_id: req.params.id } }),
      prisma.admin_territory_access.count({ where: { territory_id: req.params.id } }),
      prisma.operational_territories.count({ where: { parent_id: req.params.id } }),
    ]);

    if (neighborhoods + partners + admins + children > 0) {
      return res.status(409).json({
        success: false,
        error: 'Este território possui vínculos e não pode ser deletado. Você pode inativá-lo.',
        details: { neighborhoods, partners, admins, children },
      });
    }

    await prisma.operational_territories.delete({ where: { id: req.params.id } });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'delete_territory', entityType: 'territory', entityId: req.params.id, oldValue: { name: territory.name, level: territory.level }, ipAddress: ctx.ip });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao deletar território' });
  }
});

// POST /api/admin/territories/regional-admins/:id/reset-password
const RESET_TARGET_ROLES = ['TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR'];
router.post('/regional-admins/:id/reset-password', async (req: Request, res: Response) => {
  try {
    const target = await prisma.admins.findUnique({ where: { id: req.params.id }, select: { id: true, name: true, email: true, role: true, is_active: true } });
    if (!target) return res.status(404).json({ success: false, error: 'Conta não encontrada.' });
    if (!RESET_TARGET_ROLES.includes(target.role)) return res.status(400).json({ success: false, error: 'Conta não elegível para redefinição por esta rota.' });

    // Generate secure temp password (16 chars, upper+lower+digit+special)
    const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ', lower = 'abcdefghjkmnpqrstuvwxyz', digits = '23456789', special = '!@#$%&*';
    const all = upper + lower + digits + special;
    const buf = crypto.randomBytes(16);
    const chars: string[] = [upper[buf[0] % upper.length], lower[buf[1] % lower.length], digits[buf[2] % digits.length], special[buf[3] % special.length]];
    for (let i = 4; i < 16; i++) chars.push(all[buf[i] % all.length]);
    const shuffleBuf = crypto.randomBytes(16);
    for (let i = chars.length - 1; i > 0; i--) { const j = shuffleBuf[i] % (i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
    const tempPassword = chars.join('');

    const hash = await bcrypt.hash(tempPassword, 10);
    await prisma.admins.update({ where: { id: target.id }, data: { password: hash, must_change_password: true } });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'admin_password_reset', entityType: 'admin', entityId: target.id, newValue: { target_email: target.email, target_role: target.role, must_change_password: true }, ipAddress: ctx.ip, userAgent: ctx.ua });

    res.json({ success: true, data: { email: target.email, name: target.name, temp_password: tempPassword } });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao redefinir senha.' });
  }
});

// ─── Preparar cidade (dry-run + confirmação) ─────────────────────────────────
// Fluxo assistido e production-safe: nunca grava sem confirmação explícita do
// Super Admin. NÃO ativa a cidade, NÃO altera status/modalidades, NÃO mexe em
// outras cidades. Reusa neighborhoods/neighborhood_geofences/territory_id.
//
// GENÉRICO: o arquivo territorial é resolvido pelo registro
// (territorial-datasets.json) via (city, uf). Onboardar nova cidade = registrar
// dataset + colocar o arquivo; sem lógica especial de cidade aqui.

function resolveGeojsonPathForTerritory(territory: {
  city_name: string | null;
  name: string;
  uf: string | null;
}): string | null {
  const city = (territory.city_name || territory.name || '').trim();
  if (!city) return null;
  const resolved = resolveGeojsonPath(city, territory.uf);
  return resolved ? resolved.filePath : null;
}

// POST /api/admin/territories/:id/prepare-city/acquire
// Fase 1: busca automática do dataset via provider (OSM/Overpass), normaliza,
// valida e persiste como VERSÃO DRAFT (S3 + territorial_dataset_versions).
// Somente SUPER_ADMIN (router usa requireSuperAdmin). Somente leitura externa;
// única escrita = S3 + linha DRAFT. NÃO cria neighborhoods/geofences, NÃO altera
// território/gestor/status/modalidade.
router.post('/:id/prepare-city/acquire', async (req: Request, res: Response) => {
  try {
    const territory = await prisma.operational_territories.findUnique({ where: { id: req.params.id } });
    if (!territory) return res.status(404).json({ success: false, error: 'Território não encontrado' });

    const ctx = auditCtx(req);

    // Cancela a aquisição se o cliente fechar a conexão (propaga por todo o pipeline).
    const reqAbort = new AbortController();
    const onClose = () => reqAbort.abort();
    req.on('close', onClose);

    let result;
    try {
      result = await acquireCityDataset({
        territoryId: territory.id,
        createdBy: ctx.adminId,
        prisma,
        signal: reqAbort.signal,
      });
    } finally {
      req.off('close', onClose);
    }

    if (!result.ok) {
      // Cancelamento/deadline: nada persistido.
      if (result.code === 'ACQUISITION_ABORTED' || result.code === 'ACQUISITION_DEADLINE_EXCEEDED') {
        audit({
          adminId: ctx.adminId, adminEmail: ctx.adminEmail,
          action: 'prepare_city_acquire_cancelled', entityType: 'territory', entityId: territory.id,
          newValue: { code: result.code }, ipAddress: ctx.ip, userAgent: ctx.ua,
        });
        // 499-like: cliente cancelou; 504 quando deadline. Usa 504 p/ deadline.
        const st = result.code === 'ACQUISITION_DEADLINE_EXCEEDED' ? 504 : 499;
        return res.status(st).json({ success: false, error: result.reason, code: result.code });
      }
      // Qualidade insuficiente ou falha externa: nada foi persistido.
      audit({
        adminId: ctx.adminId, adminEmail: ctx.adminEmail,
        action: 'prepare_city_acquire_failed', entityType: 'territory', entityId: territory.id,
        newValue: { code: result.code, reason: result.reason, stats: result.stats },
        ipAddress: ctx.ip, userAgent: ctx.ua,
      });
      const status = result.code === 'NO_VALID_FEATURES' ? 422 : 502;
      return res.status(status).json({ success: false, error: result.reason, code: result.code, stats: result.stats });
    }

    audit({
      adminId: ctx.adminId, adminEmail: ctx.adminEmail,
      action: 'prepare_city_acquire_draft', entityType: 'territorial_dataset_version', entityId: result.datasetVersionId,
      newValue: {
        city: result.city, uf: result.uf,
        providerId: result.provenance.providerId, isOfficial: result.provenance.isOfficial,
        sourceUrl: result.provenance.sourceUrl, stats: result.stats,
      },
      ipAddress: ctx.ip, userAgent: ctx.ua,
    });

    return res.json({
      success: true,
      mode: 'acquired-draft',
      data: {
        datasetVersionId: result.datasetVersionId,
        city: result.city,
        uf: result.uf,
        provenance: result.provenance,   // inclui source, sourceUrl, query, sourceIds, isOfficial=false
        stats: result.stats,
        s3: result.s3,
        checksum: result.checksum,
        // reforço explícito na resposta:
        isOfficial: false,
        sourceVerified: false,
        status: 'DRAFT',
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Erro na aquisição de dataset' });
  }
});

// ─── Fase 2: revisão de datasets DRAFT (listar / preview / reject) ───────────
// SUPER_ADMIN (router). NÃO efetiva bairros/geofences (isso é Fase 3).

// GET /api/admin/territories/:id/prepare-city/datasets
router.get('/:id/prepare-city/datasets', async (req: Request, res: Response) => {
  try {
    const result = await listTerritoryDatasets(req.params.id, { prisma });
    if (!result.ok) {
      const map: Record<string, number> = { TERRITORY_NOT_FOUND: 404, DATASET_TERRITORY_AMBIGUOUS: 409, CITY_UF_MISSING: 400 };
      return res.status(map[result.code] ?? 400).json({ success: false, error: result.code });
    }
    return res.json({ success: true, data: result.datasets });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Erro ao listar datasets' });
  }
});

// POST /api/admin/territories/:id/prepare-city/datasets/:versionId/preview
// Read-only quanto a bairros/geofences/território. DRAFT -> PREVIEWED só no sucesso.
router.post('/:id/prepare-city/datasets/:versionId/preview', async (req: Request, res: Response) => {
  const ctx = auditCtx(req);
  const reqAbort = new AbortController();
  const onClose = () => reqAbort.abort();
  req.on('close', onClose);
  try {
    const result = await previewDatasetVersion({
      territoryId: req.params.id,
      versionId: req.params.versionId,
      signal: reqAbort.signal,
      createdBy: ctx.adminId,
      prisma,
    });

    if (!result.ok) {
      const map: Record<string, number> = {
        TERRITORY_NOT_FOUND: 404, DATASET_NOT_FOUND: 404,
        DATASET_TERRITORY_MISMATCH: 403, DATASET_TERRITORY_AMBIGUOUS: 409,
        CITY_UF_MISSING: 400, INVALID_STATUS_TRANSITION: 409,
        CHECKSUM_MISMATCH: 409, NORMALIZED_TOO_LARGE: 413,
        PREVIEW_DEADLINE_EXCEEDED: 504, PREVIEW_ABORTED: 499,
      };
      const status = map[result.code] ?? 422;
      audit({
        adminId: ctx.adminId, adminEmail: ctx.adminEmail,
        action: 'prepare_city_dataset_preview_failed', entityType: 'territorial_dataset_version', entityId: req.params.versionId,
        newValue: { code: result.code, status: (result as any).status }, ipAddress: ctx.ip, userAgent: ctx.ua,
      });
      return res.status(status).json({ success: false, error: result.reason, code: result.code });
    }

    audit({
      adminId: ctx.adminId, adminEmail: ctx.adminEmail,
      action: 'prepare_city_dataset_previewed', entityType: 'territorial_dataset_version', entityId: result.versionId,
      newValue: {
        transitioned: result.transitioned,
        toCreate: result.plan.totals.toCreate,
        toUpdate: result.plan.totals.toUpdate,
        canProceed: result.plan.canProceed,
      },
      ipAddress: ctx.ip, userAgent: ctx.ua,
    });

    return res.json({ success: true, mode: 'preview', data: { status: result.status, transitioned: result.transitioned, plan: result.plan } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Erro no preview do dataset' });
  } finally {
    req.off('close', onClose);
  }
});

const rejectDatasetSchema = z.object({ reason: z.string().max(500).optional() });

// POST /api/admin/territories/:id/prepare-city/datasets/:versionId/reject
router.post('/:id/prepare-city/datasets/:versionId/reject', async (req: Request, res: Response) => {
  try {
    const parsed = rejectDatasetSchema.safeParse(req.body ?? {});
    const reason = parsed.success ? parsed.data.reason : undefined;
    const ctx = auditCtx(req);
    const result = await rejectDatasetVersion({
      territoryId: req.params.id, versionId: req.params.versionId, reason, createdBy: ctx.adminId, prisma,
    });
    if (!result.ok) {
      const map: Record<string, number> = {
        TERRITORY_NOT_FOUND: 404, DATASET_NOT_FOUND: 404,
        DATASET_TERRITORY_MISMATCH: 403, DATASET_TERRITORY_AMBIGUOUS: 409,
        CITY_UF_MISSING: 400, INVALID_STATUS_TRANSITION: 409,
      };
      return res.status(map[result.code] ?? 400).json({ success: false, error: result.code, status: result.status });
    }
    audit({
      adminId: ctx.adminId, adminEmail: ctx.adminEmail,
      action: 'prepare_city_dataset_rejected', entityType: 'territorial_dataset_version', entityId: req.params.versionId,
      reason, ipAddress: ctx.ip, userAgent: ctx.ua,
    });
    return res.json({ success: true, mode: 'rejected', data: { status: 'REJECTED' } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Erro ao rejeitar dataset' });
  }
});

// POST /api/admin/territories/:id/prepare-city/dry-run
// Retorna a prévia (nenhuma gravação).
router.post('/:id/prepare-city/dry-run', async (req: Request, res: Response) => {
  try {
    const territory = await prisma.operational_territories.findUnique({ where: { id: req.params.id } });
    if (!territory) return res.status(404).json({ success: false, error: 'Território não encontrado' });

    const geojsonPath = resolveGeojsonPathForTerritory(territory);
    if (!geojsonPath) {
      return res.status(400).json({
        success: false,
        error: `Nenhum dataset territorial (GeoJSON) registrado para "${territory.city_name || territory.name}"${territory.uf ? '/' + territory.uf : ''}. Adicione o arquivo em backend/data/geojson e registre-o em backend/data/geojson/territorial-datasets.json (city, uf, file).`,
      });
    }

    const { plan } = await dryRunPrepareCity({ territoryId: territory.id, geojsonPath, prisma });

    const ctx = auditCtx(req);
    audit({
      adminId: ctx.adminId, adminEmail: ctx.adminEmail,
      action: 'prepare_city_dry_run', entityType: 'territory', entityId: territory.id,
      newValue: { city: plan.city, toCreate: plan.totals.toCreate, toUpdate: plan.totals.toUpdate, canProceed: plan.canProceed },
      ipAddress: ctx.ip, userAgent: ctx.ua,
    });

    res.json({ success: true, mode: 'dry-run', data: plan });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Erro no dry-run de preparação' });
  }
});

const confirmPrepareSchema = z.object({
  // Confirmação explícita obrigatória. O front deve exigir digitar/toggle.
  confirm: z.literal(true),
  reason: z.string().max(500).optional(),
});

// POST /api/admin/territories/:id/prepare-city/confirm
// Executa a importação idempotente APÓS confirmação explícita do Super Admin.
router.post('/:id/prepare-city/confirm', async (req: Request, res: Response) => {
  try {
    const parsed = confirmPrepareSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Confirmação explícita (confirm=true) é obrigatória.' });
    }

    const territory = await prisma.operational_territories.findUnique({ where: { id: req.params.id } });
    if (!territory) return res.status(404).json({ success: false, error: 'Território não encontrado' });

    const geojsonPath = resolveGeojsonPathForTerritory(territory);
    if (!geojsonPath) {
      return res.status(400).json({
        success: false,
        error: `Nenhum dataset territorial (GeoJSON) registrado para "${territory.city_name || territory.name}"${territory.uf ? '/' + territory.uf : ''}. Registre-o em backend/data/geojson/territorial-datasets.json.`,
      });
    }

    const params = { territoryId: territory.id, geojsonPath, prisma };

    // Revalida o plano antes de gravar (defesa em profundidade).
    const { plan } = await dryRunPrepareCity(params);
    if (!plan.canProceed) {
      return res.status(422).json({
        success: false,
        error: 'Plano não pode prosseguir.',
        risks: plan.risks,
      });
    }

    const result = await executePrepareCity(params);

    const ctx = auditCtx(req);
    audit({
      adminId: ctx.adminId, adminEmail: ctx.adminEmail,
      action: 'prepare_city_execute', entityType: 'territory', entityId: territory.id,
      newValue: {
        city: result.city,
        created: result.created,
        updated: result.updated,
        geofencesWritten: result.geofencesWritten,
        linkedToTerritory: result.linkedToTerritory,
        errors: result.errors.length,
      },
      reason: parsed.data.reason,
      ipAddress: ctx.ip, userAgent: ctx.ua,
    });

    res.json({ success: true, mode: 'executed', data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Erro ao executar preparação' });
  }
});

const applyDatasetSchema = z.object({
  // Confirmação explícita obrigatória (mesma disciplina do /confirm legado).
  confirm: z.literal(true),
});

// POST /api/admin/territories/:id/prepare-city/datasets/:versionId/apply
// FASE 3B — apply transacional/idempotente de uma dataset version PREVIEWED.
// Somente SUPER_ADMIN (router.use requireSuperAdmin). NÃO altera o /confirm legado.
// Ownership territorial validado antes da escrita; PREVIEWED→APPLYING→APPLIED em
// transação única; rollback integral em falha. Auditoria SEM GeoJSON completo.
router.post('/:id/prepare-city/datasets/:versionId/apply', async (req: Request, res: Response) => {
  const ctx = auditCtx(req);
  try {
    const parsed = applyDatasetSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: 'Confirmação explícita (confirm=true) é obrigatória.' });
    }

    const result = await applyDatasetVersion({
      territoryId: req.params.id,
      versionId: req.params.versionId,
      createdBy: ctx.adminId,
      prisma,
    });

    if (!result.ok) {
      const map: Record<string, number> = {
        TERRITORY_NOT_FOUND: 404, DATASET_NOT_FOUND: 404,
        DATASET_TERRITORY_MISMATCH: 403, DATASET_TERRITORY_AMBIGUOUS: 409,
        CITY_UF_MISSING: 400, INVALID_STATUS_TRANSITION: 409,
        NORMALIZED_KEY_MISSING: 422, CHECKSUM_MISMATCH: 409,
        INVALID_GEOJSON: 422, INVALID_GEOMETRY: 422,
        APPLY_CONFLICT: 409, S3_LOAD_FAILED: 502,
      };
      const status = map[result.code] ?? 422;
      // Auditoria da falha — SEM conteúdo de GeoJSON.
      audit({
        adminId: ctx.adminId, adminEmail: ctx.adminEmail,
        action: 'prepare_city_dataset_apply_failed', entityType: 'territorial_dataset_version', entityId: req.params.versionId,
        newValue: { territoryId: req.params.id, code: result.code, from: result.from },
        ipAddress: ctx.ip, userAgent: ctx.ua,
      });
      return res.status(status).json({ success: false, error: result.reason, code: result.code });
    }

    // Auditoria de sucesso — created/updated/unchanged/conflicts/skipped, SEM GeoJSON.
    audit({
      adminId: ctx.adminId, adminEmail: ctx.adminEmail,
      action: 'prepare_city_dataset_applied', entityType: 'territorial_dataset_version', entityId: result.versionId ?? req.params.versionId,
      newValue: {
        territoryId: result.territoryId,
        from: result.from, to: result.to,
        created: result.counters?.created,
        updated: result.counters?.updated,
        unchanged: result.counters?.unchanged,
        conflicts: result.counters?.conflicts,
        skipped: result.counters?.skipped,
        geofencesWritten: result.counters?.geofencesWritten,
      },
      ipAddress: ctx.ip, userAgent: ctx.ua,
    });

    return res.json({
      success: true,
      mode: 'applied',
      data: {
        versionId: result.versionId,
        territoryId: result.territoryId,
        status: result.to,
        counters: result.counters,
        conflicts: result.conflicts,
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Erro ao aplicar dataset' });
  }
});

export default router;
