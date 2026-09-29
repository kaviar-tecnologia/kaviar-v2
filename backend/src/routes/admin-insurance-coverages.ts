import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateAdmin, requireRole } from '../middlewares/auth';
import { applyTerritoryScope } from '../middlewares/territory-scope';
import { requireTerritoryScope } from '../middlewares/require-territory-scope';
import { audit, auditCtx } from '../utils/audit';

const router = Router();
const ALLOWED_ROLES = ['SUPER_ADMIN', 'TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR'];
const MODALITIES = [
  'CAR_PASSENGER',
  'MOTO_PASSENGER',
  'MOTO_DELIVERY',
  'CARE_ASSISTED',
  'CARE_FOLDING_WHEELCHAIR',
  'CARE_ADAPTED_WHEELCHAIR',
] as const;
const READINESS_MODALITIES = ['CAR_PASSENGER', 'MOTO_PASSENGER', 'MOTO_DELIVERY'] as const;
const CARE_MODALITIES = [
  'CARE_ASSISTED',
  'CARE_FOLDING_WHEELCHAIR',
  'CARE_ADAPTED_WHEELCHAIR',
] as const;
const isCareModality = (value: string | null | undefined): boolean =>
  !!value && (CARE_MODALITIES as readonly string[]).includes(value);
const CARE_REVIEW_ROLE = requireRole(['SUPER_ADMIN']);
const COVERAGE_TYPES = ['APP', 'RC_F', 'PERSONAL_ACCIDENT', 'CARGO', 'OTHER'] as const;
const STATUSES = ['DRAFT', 'ACTIVE', 'EXPIRED', 'SUSPENDED'] as const;

router.use(authenticateAdmin, requireRole(ALLOWED_ROLES), applyTerritoryScope, requireTerritoryScope);

function toDateAtStart(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function inScope(admin: any, scope: any, territoryId: string | null | undefined) {
  if (admin?.role === 'SUPER_ADMIN') return true;
  if (!territoryId) return false;
  const territoryIds = Array.isArray(scope?.territoryIds) ? scope.territoryIds : [];
  return territoryIds.includes(territoryId);
}

function scopeWhere(admin: any, scope: any) {
  if (admin?.role === 'SUPER_ADMIN') return {};
  const territoryIds = Array.isArray(scope?.territoryIds) ? scope.territoryIds : [];
  return {
    OR: [
      { territory_id: { in: territoryIds } },
      { territory_id: null },
    ],
  };
}

const createSchema = z.object({
  territory_id: z.string().uuid().nullable().optional(),
  modality: z.enum(MODALITIES),
  provider_name: z.string().min(2).max(200),
  policy_number: z.string().min(2).max(120),
  coverage_type: z.enum(COVERAGE_TYPES),
  coverage_description: z.string().max(2000).nullable().optional(),
  coverage_amount_death: z.coerce.number().nonnegative().nullable().optional(),
  coverage_amount_disability: z.coerce.number().nonnegative().nullable().optional(),
  coverage_amount_medical: z.coerce.number().nonnegative().nullable().optional(),
  valid_from: z.string().min(10),
  valid_until: z.string().min(10),
  status: z.enum(STATUSES).default('DRAFT'),
  document_url: z.string().url().max(1000).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

const patchSchema = createSchema.partial();
const careScopeReviewSchema = z.object({
  decision: z.enum(['APPROVE', 'REVOKE']),
  reason: z.string().min(3).max(2000).optional(),
});

router.get('/', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;
    const { modality, status, territory_id } = req.query;

    const where: any = {
      ...scopeWhere(admin, scope),
    };

    if (modality) where.modality = String(modality);
    if (status) where.status = String(status);
    if (territory_id === 'GLOBAL') where.territory_id = null;
    if (territory_id && territory_id !== 'GLOBAL') where.territory_id = String(territory_id);

    const items = await prisma.operational_insurance_coverages.findMany({
      where,
      include: {
        territory: { select: { id: true, name: true, level: true, status: true } },
        created_by_admin: { select: { id: true, name: true, email: true } },
        updated_by_admin: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ valid_until: 'asc' }, { created_at: 'desc' }],
    });

    return res.json({ success: true, data: items });
  } catch {
    return res.status(500).json({ success: false, error: 'Erro ao listar coberturas de seguro.' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors[0]?.message || 'Payload inválido.' });
    }

    const payload = parsed.data;
    const validFrom = toDateAtStart(new Date(payload.valid_from));
    const validUntil = toDateAtStart(new Date(payload.valid_until));

    if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validUntil.getTime())) {
      return res.status(400).json({ success: false, error: 'Datas de vigência inválidas.' });
    }

    if (validUntil < validFrom) {
      return res.status(400).json({ success: false, error: 'valid_until não pode ser menor que valid_from.' });
    }

    if (!payload.territory_id && admin.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: 'Somente SUPER_ADMIN pode criar cobertura global.' });
    }

    if (payload.territory_id && !inScope(admin, scope, payload.territory_id)) {
      return res.status(403).json({ success: false, error: 'Território fora do seu escopo.' });
    }

    const created = await prisma.operational_insurance_coverages.create({
      data: {
        territory_id: payload.territory_id || null,
        modality: payload.modality,
        provider_name: payload.provider_name,
        policy_number: payload.policy_number,
        coverage_type: payload.coverage_type,
        coverage_description: payload.coverage_description || null,
        coverage_amount_death: payload.coverage_amount_death ?? null,
        coverage_amount_disability: payload.coverage_amount_disability ?? null,
        coverage_amount_medical: payload.coverage_amount_medical ?? null,
        valid_from: validFrom,
        valid_until: validUntil,
        status: payload.status,
        document_url: payload.document_url || null,
        notes: payload.notes || null,
        created_by_admin_id: admin.id,
        updated_by_admin_id: admin.id,
      },
      include: {
        territory: { select: { id: true, name: true, level: true, status: true } },
      },
    });

    return res.status(201).json({ success: true, data: created });
  } catch {
    return res.status(500).json({ success: false, error: 'Erro ao criar cobertura de seguro.' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;

    const existing = await prisma.operational_insurance_coverages.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Cobertura não encontrada.' });

    const targetTerritory = req.body?.territory_id !== undefined ? req.body.territory_id : existing.territory_id;
    if (targetTerritory && !inScope(admin, scope, targetTerritory)) {
      return res.status(403).json({ success: false, error: 'Território fora do seu escopo.' });
    }

    if (!targetTerritory && admin.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: 'Somente SUPER_ADMIN pode manter cobertura global.' });
    }

    const parsed = patchSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.errors[0]?.message || 'Payload inválido.' });
    }

    const data: any = { ...parsed.data };

    if (data.valid_from !== undefined) {
      const date = toDateAtStart(new Date(data.valid_from));
      if (Number.isNaN(date.getTime())) return res.status(400).json({ success: false, error: 'valid_from inválido.' });
      data.valid_from = date;
    }

    if (data.valid_until !== undefined) {
      const date = toDateAtStart(new Date(data.valid_until));
      if (Number.isNaN(date.getTime())) return res.status(400).json({ success: false, error: 'valid_until inválido.' });
      data.valid_until = date;
    }

    const finalFrom = data.valid_from || existing.valid_from;
    const finalUntil = data.valid_until || existing.valid_until;
    if (finalUntil < finalFrom) {
      return res.status(400).json({ success: false, error: 'valid_until não pode ser menor que valid_from.' });
    }

    data.updated_by_admin_id = admin.id;

    const updated = await prisma.operational_insurance_coverages.update({
      where: { id: req.params.id },
      data,
      include: {
        territory: { select: { id: true, name: true, level: true, status: true } },
        updated_by_admin: { select: { id: true, name: true, email: true } },
      },
    });

    return res.json({ success: true, data: updated });
  } catch {
    return res.status(500).json({ success: false, error: 'Erro ao atualizar cobertura de seguro.' });
  }
});

router.get('/readiness', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;
    const today = toDateAtStart(new Date());
    const in30days = new Date(today);
    in30days.setUTCDate(in30days.getUTCDate() + 30);

    const territoryWhere: any = {};
    if (admin.role !== 'SUPER_ADMIN') {
      territoryWhere.id = { in: scope?.territoryIds || [] };
    }

    const [territories, coverages] = await Promise.all([
      prisma.operational_territories.findMany({
        where: territoryWhere,
        select: { id: true, name: true, level: true, status: true, is_active: true },
        orderBy: { name: 'asc' },
      }),
      prisma.operational_insurance_coverages.findMany({
        where: scopeWhere(admin, scope),
        select: {
          id: true,
          territory_id: true,
          modality: true,
          status: true,
          valid_from: true,
          valid_until: true,
          provider_name: true,
          policy_number: true,
          coverage_type: true,
          territory: { select: { id: true, name: true } },
        },
      }),
    ]);

    const activeWindow = coverages.filter((item) => item.status === 'ACTIVE' && item.valid_from <= today && item.valid_until >= today);
    const expiring = activeWindow.filter((item) => item.valid_until <= in30days);

    const byModality: Record<string, any> = {};
    for (const modality of MODALITIES) {
      const modalityItems = activeWindow.filter((item) => item.modality === modality);
      const territoryWithCoverage = new Set(
        modalityItems.filter((item) => item.territory_id).map((item) => item.territory_id as string),
      );
      const hasGlobal = modalityItems.some((item) => item.territory_id === null);
      const activeTerritories = territories.filter((t) => t.is_active);
      const missingActive = hasGlobal
        ? []
        : activeTerritories.filter((territory) => !territoryWithCoverage.has(territory.id));

      byModality[modality] = {
        activeCoverageCount: modalityItems.length,
        expiringIn30Days: modalityItems.filter((item) => item.valid_until <= in30days).length,
        hasActiveCoverage: hasGlobal || modalityItems.length > 0,
        missingActiveTerritoryCount: missingActive.length,
      };
    }

    const missingAlerts = [] as any[];
    const activeTerritories = territories.filter((t) => t.is_active);
    for (const territory of activeTerritories) {
      for (const modality of MODALITIES) {
        const hasCoverage = activeWindow.some(
          (item) => item.modality === modality && (item.territory_id === territory.id || item.territory_id === null),
        );
        if (!hasCoverage) {
          missingAlerts.push({
            territoryId: territory.id,
            territoryName: territory.name,
            modality,
            severity: 'warning',
          });
        }
      }
    }

    return res.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        scope: {
          role: admin.role,
          territoryIds: admin.role === 'SUPER_ADMIN' ? null : (scope?.territoryIds || []),
        },
        territories,
        totals: {
          coverages: coverages.length,
          activeNow: activeWindow.length,
          expiringIn30Days: expiring.length,
        },
        byModality,
        missingAlerts,
        expiringCoverages: expiring
          .sort((a, b) => a.valid_until.getTime() - b.valid_until.getTime())
          .map((item) => ({
            id: item.id,
            modality: item.modality,
            territoryId: item.territory_id,
            territoryName: item.territory?.name || 'GLOBAL',
            validUntil: item.valid_until,
            providerName: item.provider_name,
            policyNumber: item.policy_number,
            coverageType: item.coverage_type,
          })),
      },
    });
  } catch {
    return res.status(500).json({ success: false, error: 'Erro ao calcular readiness de seguro.' });
  }
});

export default router;
