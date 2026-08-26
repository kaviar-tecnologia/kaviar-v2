import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { allowReadAccess, authenticateAdmin, requireRole, requireSuperAdmin } from '../middlewares/auth';
import { applyTerritoryScope } from '../middlewares/territory-scope';
import { getMunicipalRegulation, MUNICIPAL_MODALITIES, normalizeCity, normalizeState } from '../services/municipal-regulation.service';

const router = Router();

const MUNICIPAL_CONFIG_ROLE = requireRole(['SUPER_ADMIN']);
const MUNICIPAL_PROTOCOL_ROLE = requireRole(['SUPER_ADMIN', 'TERRITORIAL_MANAGER']);

router.use(authenticateAdmin);
router.use(applyTerritoryScope);

const regulationRequirementSchema = z.object({
  requirement_key: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional().nullable(),
  document_type: z.string().optional().nullable(),
  is_required: z.boolean().default(true),
  applies_when: z.any().optional().nullable(),
  sort_order: z.number().int().min(0).default(0),
});

const VEHICLE_AGE_BASES = ['MANUFACTURE_YEAR', 'MODEL_YEAR', 'FIRST_REGISTRATION'] as const;

const regulationCreateSchema = z.object({
  city: z.string().min(1),
  state: z.string().min(2).max(2),
  municipality_code: z.string().optional().nullable(),
  service_modality: z.enum(MUNICIPAL_MODALITIES),
  regulation_status: z.enum(['REGULATED', 'NOT_REGULATED', 'UNKNOWN', 'REQUIRES_CONFIRMATION']),
  law_number: z.string().optional().nullable(),
  law_date: z.string().optional().nullable(),
  law_document_url: z.string().optional().nullable(),
  requires_city_approval: z.boolean().default(false),
  requires_protocol: z.boolean().default(false),
  max_vehicle_age_years: z.number().int().optional().nullable(),
  vehicle_age_basis: z.enum(VEHICLE_AGE_BASES).optional().nullable(),
  authorization_validity_months: z.number().int().optional().nullable(),
  responsible_agency: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  is_active: z.boolean().default(true),
  requirements: z.array(regulationRequirementSchema).optional().default([]),
});

const regulationPatchSchema = regulationCreateSchema.partial();

function normalizeModality(value: string): string {
  return value.toUpperCase();
}

async function adminCanAccessMunicipality(req: Request, city: string, state: string): Promise<boolean> {
  const admin = (req as any).admin;
  if (admin.role === 'SUPER_ADMIN') return true;

  if (admin.role !== 'TERRITORIAL_MANAGER' && admin.role !== 'TERRITORIAL_OPERATOR') {
    return true;
  }

  const scope = (req as any).territoryScope;
  if (!scope || !Array.isArray(scope.territoryIds) || scope.territoryIds.length === 0) {
    return false;
  }

  const territories = await prisma.operational_territories.findMany({
    where: { id: { in: scope.territoryIds } },
    select: { city_name: true, uf: true },
  });

  const normalizedCity = normalizeCity(city).toLowerCase();
  const normalizedState = normalizeState(state).toLowerCase();
  return territories.some((t) =>
    String(t.city_name || '').trim().toLowerCase() === normalizedCity &&
    String(t.uf || '').trim().toLowerCase() === normalizedState,
  );
}

// GET /api/admin/municipal-regulations
router.get('/municipal-regulations', allowReadAccess, async (req: Request, res: Response) => {
  try {
    const city = req.query.city ? normalizeCity(String(req.query.city)) : undefined;
    const state = req.query.state ? normalizeState(String(req.query.state)) : undefined;
    const service_modality = req.query.service_modality ? normalizeModality(String(req.query.service_modality)) : undefined;
    const is_active = req.query.is_active !== undefined ? String(req.query.is_active) === 'true' : undefined;

    const where: any = {};
    if (city) where.city = { equals: city, mode: 'insensitive' };
    if (state) where.state = { equals: state, mode: 'insensitive' };
    if (service_modality) where.service_modality = service_modality;
    if (is_active !== undefined) where.is_active = is_active;

    const items = await prisma.municipal_regulations.findMany({
      where,
      include: { requirements: { orderBy: [{ sort_order: 'asc' }, { label: 'asc' }] } },
      orderBy: [{ city: 'asc' }, { state: 'asc' }, { service_modality: 'asc' }],
    });

    res.json({ success: true, data: items });
  } catch (error) {
    console.error('[MUNICIPAL_REGULATIONS_LIST_ERROR]', error);
    res.status(500).json({ success: false, error: 'Erro ao listar regras municipais.' });
  }
});

// GET /api/admin/municipal-regulations/:id
router.get('/municipal-regulations/:id', allowReadAccess, async (req: Request, res: Response) => {
  try {
    const item = await prisma.municipal_regulations.findUnique({
      where: { id: req.params.id },
      include: { requirements: { orderBy: [{ sort_order: 'asc' }, { label: 'asc' }] } },
    });

    if (!item) return res.status(404).json({ success: false, error: 'Regra municipal não encontrada.' });

    res.json({ success: true, data: item });
  } catch (error) {
    console.error('[MUNICIPAL_REGULATIONS_GET_ERROR]', error);
    res.status(500).json({ success: false, error: 'Erro ao buscar regra municipal.' });
  }
});

// POST /api/admin/municipal-regulations
router.post('/municipal-regulations', MUNICIPAL_CONFIG_ROLE, async (req: Request, res: Response) => {
  try {
    const payload = regulationCreateSchema.parse(req.body);

    const created = await prisma.$transaction(async (tx) => {
      const regulation = await tx.municipal_regulations.create({
        data: {
          city: normalizeCity(payload.city),
          state: normalizeState(payload.state),
          municipality_code: payload.municipality_code || null,
          service_modality: payload.service_modality,
          regulation_status: payload.regulation_status,
          law_number: payload.law_number || null,
          law_date: payload.law_date ? new Date(payload.law_date) : null,
          law_document_url: payload.law_document_url || null,
          requires_city_approval: payload.requires_city_approval,
          requires_protocol: payload.requires_protocol,
          max_vehicle_age_years: payload.max_vehicle_age_years ?? null,
          vehicle_age_basis: payload.vehicle_age_basis ?? null,
          authorization_validity_months: payload.authorization_validity_months ?? null,
          responsible_agency: payload.responsible_agency || null,
          notes: payload.notes || null,
          is_active: payload.is_active,
        },
      });

      if (payload.requirements.length > 0) {
        await tx.municipal_regulation_requirements.createMany({
          data: payload.requirements.map((r) => ({
            regulation_id: regulation.id,
            requirement_key: r.requirement_key,
            label: r.label,
            description: r.description || null,
            document_type: r.document_type || null,
            is_required: r.is_required,
            applies_when: r.applies_when ?? null,
            sort_order: r.sort_order,
          })),
        });
      }

      return tx.municipal_regulations.findUnique({
        where: { id: regulation.id },
        include: { requirements: { orderBy: [{ sort_order: 'asc' }, { label: 'asc' }] } },
      });
    });

    res.status(201).json({ success: true, data: created });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0]?.message || 'Payload inválido.' });
    }

    console.error('[MUNICIPAL_REGULATIONS_CREATE_ERROR]', error);
    res.status(500).json({ success: false, error: 'Erro ao criar regra municipal.' });
  }
});

// PATCH /api/admin/municipal-regulations/:id
router.patch('/municipal-regulations/:id', MUNICIPAL_CONFIG_ROLE, async (req: Request, res: Response) => {
  try {
    const payload = regulationPatchSchema.parse(req.body);

    const existing = await prisma.municipal_regulations.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Regra municipal não encontrada.' });

    const updated = await prisma.$transaction(async (tx) => {
      const data: any = {};
      if (payload.city !== undefined) data.city = normalizeCity(payload.city);
      if (payload.state !== undefined) data.state = normalizeState(payload.state);
      if (payload.municipality_code !== undefined) data.municipality_code = payload.municipality_code;
      if (payload.service_modality !== undefined) data.service_modality = payload.service_modality;
      if (payload.regulation_status !== undefined) data.regulation_status = payload.regulation_status;
      if (payload.law_number !== undefined) data.law_number = payload.law_number;
      if (payload.law_date !== undefined) data.law_date = payload.law_date ? new Date(payload.law_date) : null;
      if (payload.law_document_url !== undefined) data.law_document_url = payload.law_document_url;
      if (payload.requires_city_approval !== undefined) data.requires_city_approval = payload.requires_city_approval;
      if (payload.requires_protocol !== undefined) data.requires_protocol = payload.requires_protocol;
      if (payload.max_vehicle_age_years !== undefined) data.max_vehicle_age_years = payload.max_vehicle_age_years;
      if (payload.vehicle_age_basis !== undefined) data.vehicle_age_basis = payload.vehicle_age_basis;
      if (payload.authorization_validity_months !== undefined) data.authorization_validity_months = payload.authorization_validity_months;
      if (payload.responsible_agency !== undefined) data.responsible_agency = payload.responsible_agency;
      if (payload.notes !== undefined) data.notes = payload.notes;
      if (payload.is_active !== undefined) data.is_active = payload.is_active;

      await tx.municipal_regulations.update({
        where: { id: req.params.id },
        data,
      });

      if (payload.requirements !== undefined) {
        await tx.municipal_regulation_requirements.deleteMany({ where: { regulation_id: req.params.id } });
        if (payload.requirements.length > 0) {
          await tx.municipal_regulation_requirements.createMany({
            data: payload.requirements.map((r) => ({
              regulation_id: req.params.id,
              requirement_key: r.requirement_key,
              label: r.label,
              description: r.description || null,
              document_type: r.document_type || null,
              is_required: r.is_required,
              applies_when: r.applies_when ?? null,
              sort_order: r.sort_order,
            })),
          });
        }
      }

      return tx.municipal_regulations.findUnique({
        where: { id: req.params.id },
        include: { requirements: { orderBy: [{ sort_order: 'asc' }, { label: 'asc' }] } },
      });
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0]?.message || 'Payload inválido.' });
    }

    console.error('[MUNICIPAL_REGULATIONS_PATCH_ERROR]', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar regra municipal.' });
  }
});

// GET /api/admin/drivers/:id/municipal-authorizations
router.get('/drivers/:id/municipal-authorizations', allowReadAccess, async (req: Request, res: Response) => {
  try {
    const items = await prisma.municipal_authorizations.findMany({
      where: { driver_id: req.params.id },
      include: {
        regulation: {
          include: {
            requirements: {
              orderBy: [{ sort_order: 'asc' }, { label: 'asc' }],
            },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    });

    res.json({ success: true, data: items });
  } catch (error) {
    console.error('[DRIVER_MUNICIPAL_AUTH_LIST_ERROR]', error);
    res.status(500).json({ success: false, error: 'Erro ao listar autorizações municipais do motorista.' });
  }
});

const createAuthorizationSchema = z.object({
  regulation_id: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(2).max(2),
  service_modality: z.enum(MUNICIPAL_MODALITIES),
  status: z
    .enum([
      'NOT_STARTED',
      'DOCUMENTS_PENDING',
      'IN_REVIEW_BY_KAVIAR',
      'READY_FOR_CITY_HALL',
      'SUBMITTED_TO_CITY_HALL',
      'WAITING_CITY_HALL_REVIEW',
      'APPROVED_BY_CITY_HALL',
      'REJECTED_BY_CITY_HALL',
      'NEEDS_COMPLEMENT',
      'EXPIRED',
    ])
    .optional()
    .default('DOCUMENTS_PENDING'),
});

const SAFE_INITIAL_AUTHORIZATION_STATUSES = [
  'DOCUMENTS_PENDING',
  'IN_REVIEW_BY_KAVIAR',
  'READY_FOR_CITY_HALL',
] as const;

const OPEN_MANUAL_DRAFT_STATUSES = [
  'DOCUMENTS_PENDING',
  'IN_REVIEW_BY_KAVIAR',
  'READY_FOR_CITY_HALL',
] as const;

const PATCH_ALLOWED_STATUS_VALUES = [
  'DOCUMENTS_PENDING',
  'IN_REVIEW_BY_KAVIAR',
  'READY_FOR_CITY_HALL',
  'SUBMITTED_TO_CITY_HALL',
] as const;

// POST /api/admin/drivers/:id/municipal-authorizations
router.post('/drivers/:id/municipal-authorizations', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const payload = createAuthorizationSchema.parse(req.body);

    if (!SAFE_INITIAL_AUTHORIZATION_STATUSES.includes(payload.status as any)) {
      return res.status(400).json({
        success: false,
        error: 'Status inicial inválido para criação de autorização municipal.',
      });
    }

    const regulation = payload.regulation_id
      ? await prisma.municipal_regulations.findUnique({ where: { id: payload.regulation_id } })
      : await getMunicipalRegulation(payload.city, payload.state, payload.service_modality);

    if (!regulation) {
      return res.status(404).json({ success: false, error: 'Regra municipal ativa não encontrada para cidade/modalidade.' });
    }

    const normalizedCity = normalizeCity(payload.city);
    const normalizedState = normalizeState(payload.state);

    const openManualDraft = await prisma.municipal_authorizations.findFirst({
      where: {
        driver_id: req.params.id,
        city: normalizedCity,
        state: normalizedState,
        service_modality: payload.service_modality,
        source_driver_protocol_id: null,
        status: { in: [...OPEN_MANUAL_DRAFT_STATUSES] },
      },
      orderBy: [{ created_at: 'desc' }],
      include: {
        regulation: true,
      },
    });

    if (openManualDraft) {
      const authorization = await prisma.municipal_authorizations.update({
        where: { id: openManualDraft.id },
        data: {
          regulation_id: regulation.id,
          status: payload.status,
        },
        include: {
          regulation: true,
        },
      });

      return res.status(201).json({ success: true, data: authorization });
    }

    const hasAnyHistory = await prisma.municipal_authorizations.findFirst({
      where: {
        driver_id: req.params.id,
        city: normalizedCity,
        state: normalizedState,
        service_modality: payload.service_modality,
      },
      select: { id: true },
    });

    if (hasAnyHistory) {
      return res.status(409).json({
        success: false,
        code: 'MUNICIPAL_AUTHORIZATION_HISTORY_EXISTS_USE_REGULATORY_FLOW',
        error: 'Já existe histórico municipal para este motorista e modalidade. Use o fluxo regulatório por protocolo para novo ciclo ou renovação.',
      });
    }

    let authorization;

    try {
      authorization = await prisma.municipal_authorizations.create({
        data: {
          driver_id: req.params.id,
          regulation_id: regulation.id,
          city: normalizedCity,
          state: normalizedState,
          service_modality: payload.service_modality,
          source_driver_protocol_id: null,
          status: payload.status,
        },
        include: {
          regulation: true,
        },
      });
    } catch (error) {
      const isConcurrentDuplicate =
        (typeof error === 'object' && error !== null && (error as any).code === 'P2002');

      if (!isConcurrentDuplicate) {
        throw error;
      }

      const concurrentDraft = await prisma.municipal_authorizations.findFirst({
        where: {
          driver_id: req.params.id,
          city: normalizedCity,
          state: normalizedState,
          service_modality: payload.service_modality,
          source_driver_protocol_id: null,
          status: { in: [...OPEN_MANUAL_DRAFT_STATUSES] },
        },
        orderBy: [{ created_at: 'desc' }],
        select: { id: true },
      });

      if (!concurrentDraft) {
        throw error;
      }

      authorization = await prisma.municipal_authorizations.update({
        where: { id: concurrentDraft.id },
        data: {
          regulation_id: regulation.id,
          status: payload.status,
        },
        include: {
          regulation: true,
        },
      });
    }

    res.status(201).json({ success: true, data: authorization });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0]?.message || 'Payload inválido.' });
    }

    console.error('[DRIVER_MUNICIPAL_AUTH_CREATE_ERROR]', error);
    res.status(500).json({ success: false, error: 'Erro ao criar autorização municipal do motorista.' });
  }
});

const patchAuthorizationSchema = z.object({
  status: z
    .enum([
      'NOT_STARTED',
      'DOCUMENTS_PENDING',
      'IN_REVIEW_BY_KAVIAR',
      'READY_FOR_CITY_HALL',
      'SUBMITTED_TO_CITY_HALL',
      'WAITING_CITY_HALL_REVIEW',
      'APPROVED_BY_CITY_HALL',
      'REJECTED_BY_CITY_HALL',
      'NEEDS_COMPLEMENT',
      'EXPIRED',
    ])
    .optional(),
  city_hall_notes: z.string().optional().nullable(),
  authorization_number: z.string().optional().nullable(),
  authorization_document_url: z.string().optional().nullable(),
  authorization_valid_until: z.string().optional().nullable(),
});

// PATCH /api/admin/drivers/:id/municipal-authorizations/:authorizationId
router.patch('/drivers/:id/municipal-authorizations/:authorizationId', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const payload = patchAuthorizationSchema.parse(req.body);

    const current = await prisma.municipal_authorizations.findFirst({
      where: {
        id: req.params.authorizationId,
        driver_id: req.params.id,
      },
    });

    if (!current) return res.status(404).json({ success: false, error: 'Autorização municipal não encontrada.' });

    if (payload.status !== undefined) {
      if (!PATCH_ALLOWED_STATUS_VALUES.includes(payload.status as any)) {
        return res.status(400).json({
          success: false,
          error: 'Use a ação de decisão da Prefeitura para atualizar este status municipal.',
        });
      }

      if (payload.status === 'SUBMITTED_TO_CITY_HALL' && !current.municipal_package_url && !current.protocol_number && !current.protocol_receipt_url) {
        return res.status(409).json({
          success: false,
          error: 'Gere o Pacote Prefeitura ou registre o protocolo antes de marcar como enviado.',
        });
      }
    }

    const data: any = {};
    if (payload.status !== undefined) data.status = payload.status;
    if (payload.city_hall_notes !== undefined) data.city_hall_notes = payload.city_hall_notes;
    if (payload.authorization_number !== undefined) data.authorization_number = payload.authorization_number;
    if (payload.authorization_document_url !== undefined) data.authorization_document_url = payload.authorization_document_url;
    if (payload.authorization_valid_until !== undefined) {
      data.authorization_valid_until = payload.authorization_valid_until ? new Date(payload.authorization_valid_until) : null;
    }

    const updated = await prisma.municipal_authorizations.update({
      where: { id: req.params.authorizationId },
      data,
      include: { regulation: true },
    });

    await prisma.municipal_package_audit_logs.create({
      data: {
        driver_id: req.params.id,
        authorization_id: updated.id,
        action: 'STATUS_CHANGED',
        actor_admin_id: (req as any).admin.id,
        metadata: { fromStatus: current.status, toStatus: updated.status, source: 'admin_patch' },
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0]?.message || 'Payload inválido.' });
    }

    console.error('[DRIVER_MUNICIPAL_AUTH_PATCH_ERROR]', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar autorização municipal do motorista.' });
  }
});

// POST /api/admin/drivers/:id/municipal-authorizations/:authorizationId/generate-package
router.post('/drivers/:id/municipal-authorizations/:authorizationId/generate-package', MUNICIPAL_PROTOCOL_ROLE, async (req: Request, res: Response) => {
  try {
    const authorization = await prisma.municipal_authorizations.findFirst({
      where: {
        id: req.params.authorizationId,
        driver_id: req.params.id,
      },
      include: { regulation: true },
    });

    if (!authorization) return res.status(404).json({ success: false, error: 'Autorização municipal não encontrada.' });

    if (!(await adminCanAccessMunicipality(req, authorization.city, authorization.state))) {
      return res.status(403).json({ success: false, error: 'Sem acesso ao município desta autorização.' });
    }

    const admin = (req as any).admin;

    const packageUrl = authorization.municipal_package_url || `municipal-packages/${authorization.id}.json`;

    const updated = await prisma.municipal_authorizations.update({
      where: { id: authorization.id },
      data: {
        municipal_package_url: packageUrl,
        status: authorization.status === 'NOT_STARTED' ? 'READY_FOR_CITY_HALL' : authorization.status,
        submitted_by_admin_id: admin.role === 'SUPER_ADMIN' ? admin.id : authorization.submitted_by_admin_id,
        submitted_by_manager_id: admin.role === 'TERRITORIAL_MANAGER' ? admin.id : authorization.submitted_by_manager_id,
      },
    });

    await prisma.municipal_package_audit_logs.create({
      data: {
        driver_id: req.params.id,
        authorization_id: authorization.id,
        action: 'GENERATED',
        actor_admin_id: admin.id,
        metadata: { packageUrl, stub: true },
      },
    });

    res.status(201).json({ success: true, data: updated });
  } catch (error) {
    console.error('[MUNICIPAL_GENERATE_PACKAGE_ERROR]', error);
    res.status(500).json({ success: false, error: 'Erro ao gerar pacote para Prefeitura.' });
  }
});

const protocolSchema = z.object({
  protocol_number: z.string().min(1),
  protocol_date: z.string().optional().nullable(),
  protocol_agency: z.string().optional().nullable(),
  protocol_responsible_name: z.string().optional().nullable(),
  protocol_receipt_url: z.string().optional().nullable(),
  city_hall_notes: z.string().optional().nullable(),
});

// PATCH /api/admin/drivers/:id/municipal-authorizations/:authorizationId/protocol
router.patch('/drivers/:id/municipal-authorizations/:authorizationId/protocol', MUNICIPAL_PROTOCOL_ROLE, async (req: Request, res: Response) => {
  try {
    const payload = protocolSchema.parse(req.body);

    const authorization = await prisma.municipal_authorizations.findFirst({
      where: {
        id: req.params.authorizationId,
        driver_id: req.params.id,
      },
    });
    if (!authorization) return res.status(404).json({ success: false, error: 'Autorização municipal não encontrada.' });

    if (!(await adminCanAccessMunicipality(req, authorization.city, authorization.state))) {
      return res.status(403).json({ success: false, error: 'Sem acesso ao município desta autorização.' });
    }

    if (!authorization.municipal_package_url) {
      return res.status(409).json({ success: false, error: 'Pacote Prefeitura ainda não foi gerado.' });
    }

    const admin = (req as any).admin;

    const updated = await prisma.municipal_authorizations.update({
      where: { id: authorization.id },
      data: {
        protocol_number: payload.protocol_number,
        protocol_date: payload.protocol_date ? new Date(payload.protocol_date) : new Date(),
        protocol_agency: payload.protocol_agency || null,
        protocol_responsible_name: payload.protocol_responsible_name || null,
        protocol_receipt_url: payload.protocol_receipt_url || null,
        city_hall_notes: payload.city_hall_notes || authorization.city_hall_notes,
        status: 'SUBMITTED_TO_CITY_HALL',
        submitted_by_manager_id: admin.role === 'TERRITORIAL_MANAGER' ? admin.id : authorization.submitted_by_manager_id,
        submitted_by_admin_id: admin.role === 'SUPER_ADMIN' ? admin.id : authorization.submitted_by_admin_id,
      },
    });

    await prisma.municipal_package_audit_logs.create({
      data: {
        driver_id: req.params.id,
        authorization_id: authorization.id,
        action: 'PROTOCOL_UPDATED',
        actor_admin_id: admin.id,
        metadata: {
          protocol_number: payload.protocol_number,
          protocol_date: payload.protocol_date || null,
        },
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0]?.message || 'Payload inválido.' });
    }

    console.error('[MUNICIPAL_PROTOCOL_ERROR]', error);
    res.status(500).json({ success: false, error: 'Erro ao registrar protocolo municipal.' });
  }
});

const cityHallDecisionSchema = z.object({
  decision: z.enum(['APPROVED_BY_CITY_HALL', 'REJECTED_BY_CITY_HALL', 'NEEDS_COMPLEMENT', 'WAITING_CITY_HALL_REVIEW', 'EXPIRED']),
  city_hall_notes: z.string().optional().nullable(),
  authorization_number: z.string().optional().nullable(),
  authorization_document_url: z.string().optional().nullable(),
  authorization_valid_until: z.string().optional().nullable(),
});

// PATCH /api/admin/drivers/:id/municipal-authorizations/:authorizationId/city-hall-decision
router.patch('/drivers/:id/municipal-authorizations/:authorizationId/city-hall-decision', MUNICIPAL_PROTOCOL_ROLE, async (req: Request, res: Response) => {
  try {
    const payload = cityHallDecisionSchema.parse(req.body);

    const authorization = await prisma.municipal_authorizations.findFirst({
      where: {
        id: req.params.authorizationId,
        driver_id: req.params.id,
      },
      include: {
        regulation: true,
      },
    });

    if (!authorization) return res.status(404).json({ success: false, error: 'Autorização municipal não encontrada.' });

    if (!(await adminCanAccessMunicipality(req, authorization.city, authorization.state))) {
      return res.status(403).json({ success: false, error: 'Sem acesso ao município desta autorização.' });
    }

    const admin = (req as any).admin;

    if (
      admin.role !== 'SUPER_ADMIN' &&
      (payload.decision === 'APPROVED_BY_CITY_HALL' || payload.decision === 'REJECTED_BY_CITY_HALL')
    ) {
      const errorMessage = payload.decision === 'APPROVED_BY_CITY_HALL'
        ? 'Aprovação municipal final deve ser confirmada pelo Admin KAVIAR.'
        : 'Decisão municipal final deve ser confirmada pelo Admin KAVIAR.';

      return res.status(403).json({
        success: false,
        error: errorMessage,
      });
    }

    if (
      payload.decision === 'WAITING_CITY_HALL_REVIEW' &&
      authorization.status !== 'SUBMITTED_TO_CITY_HALL'
    ) {
      return res.status(409).json({
        success: false,
        error: 'Status aguardando análise só pode ser definido após envio à Prefeitura.',
      });
    }

    if (
      payload.decision === 'NEEDS_COMPLEMENT' &&
      !['SUBMITTED_TO_CITY_HALL', 'WAITING_CITY_HALL_REVIEW'].includes(authorization.status)
    ) {
      return res.status(409).json({
        success: false,
        error: 'Complemento só pode ser registrado após protocolo/análise da Prefeitura.',
      });
    }

    let validUntil: Date | null | undefined = undefined;
    if (payload.authorization_valid_until !== undefined) {
      validUntil = payload.authorization_valid_until ? new Date(payload.authorization_valid_until) : null;
    } else if (
      payload.decision === 'APPROVED_BY_CITY_HALL' &&
      authorization.regulation.authorization_validity_months &&
      authorization.regulation.authorization_validity_months > 0
    ) {
      const d = new Date();
      d.setMonth(d.getMonth() + authorization.regulation.authorization_validity_months);
      validUntil = d;
    }

    const updated = await prisma.municipal_authorizations.update({
      where: { id: authorization.id },
      data: {
        status: payload.decision,
        city_hall_notes: payload.city_hall_notes ?? authorization.city_hall_notes,
        authorization_number: payload.authorization_number ?? authorization.authorization_number,
        authorization_document_url: payload.authorization_document_url ?? authorization.authorization_document_url,
        authorization_valid_until: validUntil,
        approved_by_admin_id: payload.decision === 'APPROVED_BY_CITY_HALL' && admin.role === 'SUPER_ADMIN' ? admin.id : authorization.approved_by_admin_id,
      },
      include: { regulation: true },
    });

    await prisma.municipal_package_audit_logs.create({
      data: {
        driver_id: req.params.id,
        authorization_id: authorization.id,
        action: 'STATUS_CHANGED',
        actor_admin_id: admin.id,
        metadata: {
          fromStatus: authorization.status,
          toStatus: payload.decision,
        },
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0]?.message || 'Payload inválido.' });
    }

    console.error('[MUNICIPAL_CITY_HALL_DECISION_ERROR]', error);
    res.status(500).json({ success: false, error: 'Erro ao registrar decisão da Prefeitura.' });
  }
});

export default router;
