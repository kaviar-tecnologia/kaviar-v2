import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticateAdmin, requireSuperAdmin } from '../middlewares/auth';
import { audit, auditCtx } from '../utils/audit';
import {
  isScopeReduction, requiresMutualAgreementForEarlyReduction, sameNeighborhoodSet,
} from '../services/manager-neighborhood-scope';

const router = Router();
router.use(authenticateAdmin, requireSuperAdmin);

const scheduleSchema = z.object({
  assignment_id: z.string().uuid(),
  neighborhood_ids: z.array(z.string().min(1)).max(2000),
  effective_from: z.string().datetime({ offset: true }),
  change_reason: z.string().trim().min(10).max(1000),
  agreement_reference: z.string().trim().min(8).max(500),
  mutual_agreement_confirmed: z.boolean(),
  expected_current_version_id: z.string().uuid().nullable(),
  confirmation: z.literal('AGENDAR_ESCOPO_GESTOR'),
});

const cancelSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
  confirmation: z.literal('CANCELAR_ESCOPO_AGENDADO'),
});

function errorResponse(res: Response, error: any, fallback: string): Response {
  if (error instanceof z.ZodError) {
    return res.status(400).json({ success: false, error: error.errors[0]?.message || 'Dados inválidos' });
  }
  if (Number.isInteger(error?.statusCode)) {
    return res.status(error.statusCode).json({ success: false, error: error.message });
  }
  console.error('[MANAGER_NEIGHBORHOOD_SCOPE]', error);
  return res.status(500).json({ success: false, error: fallback });
}

function reject(statusCode: number, message: string): never {
  throw Object.assign(new Error(message), { statusCode });
}

// Read-only planning view. Never implies activation of payment or of the city.
router.get('/:territoryId', async (req: Request, res: Response) => {
  try {
    const territory = await prisma.operational_territories.findUnique({
      where: { id: req.params.territoryId },
      select: { id: true, name: true, level: true, status: true },
    });
    if (!territory) return res.status(404).json({ success: false, error: 'Território não encontrado' });

    const [neighborhoods, assignments] = await Promise.all([
      prisma.neighborhoods.findMany({
        where: { territory_id: territory.id, is_active: true },
        select: { id: true, name: true, area_type: true },
        orderBy: { name: 'asc' },
      }),
      prisma.territory_manager_assignments.findMany({
        where: { territory_id: territory.id },
        select: {
          id: true, status: true, started_at: true, ended_at: true,
          admin: { select: { id: true, name: true, email: true, role: true, is_active: true } },
          neighborhood_scope_versions: {
            select: {
              id: true, neighborhood_ids: true, effective_from: true,
              agreement_reference: true, change_reason: true, created_by: true,
              created_at: true, canceled_at: true, canceled_by: true, cancel_reason: true,
            },
            orderBy: { effective_from: 'desc' },
          },
        },
        orderBy: { created_at: 'desc' },
      }),
    ]);
    const now = new Date();
    res.json({
      success: true,
      data: {
        territory, neighborhoods, server_now: now,
        assignments: assignments.map((a) => {
          const versions = a.neighborhood_scope_versions;
          const current = versions.find(v => !v.canceled_at && v.effective_from <= now);
          const scheduled = versions.find(v => !v.canceled_at && v.effective_from > now);
          return {
            id: a.id, admin: a.admin, status: a.status,
            started_at: a.started_at, ended_at: a.ended_at,
            current_version_id: current?.id || null,
            current_neighborhood_ids: current?.neighborhood_ids || neighborhoods.map(n => n.id),
            scheduled_version_id: scheduled?.id || null,
            history: versions,
          };
        }),
      },
    });
  } catch (error) {
    return errorResponse(res, error, 'Erro ao consultar escopo financeiro do gestor');
  }
});

// Append one prospective scope version. No edits to maps, admin access or old payouts.
router.post('/:territoryId/versions', async (req: Request, res: Response) => {
  try {
    const data = scheduleSchema.parse(req.body);
    const territoryId = req.params.territoryId;
    const effectiveFrom = new Date(data.effective_from);
    const adminId = (req as any).admin.id as string;

    if (new Set(data.neighborhood_ids).size !== data.neighborhood_ids.length) {
      return res.status(400).json({ success: false, error: 'Lista de bairros contém duplicatas' });
    }
    if (effectiveFrom.getTime() < Date.now() + 60_000) {
      return res.status(409).json({ success: false, error: 'A vigência deve iniciar no futuro (mínimo de 1 minuto)' });
    }

    const result = await prisma.$transaction(async (tx) => {
      // Serializes concurrent scheduling/cancellation for one financial assignment.
      await tx.$queryRaw`SELECT id FROM territory_manager_assignments WHERE id = ${data.assignment_id}::uuid FOR UPDATE`;
      const assignment = await tx.territory_manager_assignments.findUnique({
        where: { id: data.assignment_id },
        select: { id: true, territory_id: true, ended_at: true, admin: { select: { role: true } } },
      });
      if (!assignment || assignment.territory_id !== territoryId || assignment.admin.role !== 'TERRITORIAL_MANAGER') {
        return reject(404, 'Vínculo financeiro de gestor não pertence a este território');
      }
      if (assignment.ended_at && assignment.ended_at <= new Date()) {
        return reject(409, 'Vínculo financeiro encerrado não pode receber novo escopo');
      }
      if (assignment.ended_at && effectiveFrom >= assignment.ended_at) {
        return reject(409, 'Vigência deve começar antes do encerramento do vínculo financeiro');
      }
      const territory = await tx.operational_territories.findUnique({
        where: { id: territoryId }, select: { id: true, level: true },
      });
      if (!territory || territory.level !== 'city') return reject(409, 'A gestão por bairros exige território municipal');

      const neighborhoods = await tx.neighborhoods.findMany({
        where: { territory_id: territoryId, is_active: true },
        select: { id: true },
      });
      const allowed = new Set(neighborhoods.map(n => n.id));
      if (data.neighborhood_ids.some(id => !allowed.has(id))) {
        return reject(409, 'Há bairro inativo ou fora do território');
      }
      const now = new Date();
      if (effectiveFrom.getTime() < now.getTime() + 60_000) {
        return reject(409, 'A vigência deixou de estar no futuro durante a confirmação; escolha outra data');
      }
      const versions = await tx.territory_manager_neighborhood_scope_versions.findMany({
        where: { assignment_id: assignment.id, canceled_at: null },
        orderBy: { effective_from: 'desc' },
      });
      if (versions.some(v => v.effective_from > now)) {
        return reject(409, 'Já existe uma alteração futura; cancele-a antes de agendar outra');
      }
      const current = versions.find(v => v.effective_from <= now);
      if ((current?.id || null) !== data.expected_current_version_id) {
        return reject(409, 'O escopo mudou desde a leitura; atualize a página');
      }
      const before = current?.neighborhood_ids || neighborhoods.map(n => n.id);
      if (sameNeighborhoodSet(before, data.neighborhood_ids)) {
        return reject(409, 'A seleção é igual ao escopo atual');
      }
      const reduction = isScopeReduction(before, data.neighborhood_ids);
      if (!data.mutual_agreement_confirmed &&
          requiresMutualAgreementForEarlyReduction(before, data.neighborhood_ids, effectiveFrom, now)) {
        return reject(409, 'Redução territorial antes de 30 dias exige concordância expressa registrada');
      }
      const version = await tx.territory_manager_neighborhood_scope_versions.create({
        data: {
          assignment_id: assignment.id,
          neighborhood_ids: [...data.neighborhood_ids].sort(),
          effective_from: effectiveFrom,
          agreement_reference: data.agreement_reference,
          change_reason: data.change_reason,
          created_by: adminId,
        },
      });
      return { version, previous_neighborhood_ids: before, reduction };
    });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail,
      action: 'manager_neighborhood_financial_scope_schedule', entityType: 'manager_financial_scope',
      entityId: result.version.id,
      oldValue: { neighborhood_ids: result.previous_neighborhood_ids },
      newValue: { territory_id: territoryId, assignment_id: data.assignment_id,
        neighborhood_ids: result.version.neighborhood_ids, effective_from: result.version.effective_from,
        agreement_reference: data.agreement_reference, reduction: result.reduction,
        mutual_agreement_confirmed: data.mutual_agreement_confirmed },
      ipAddress: ctx.ip });
    return res.status(201).json({ success: true, data: result.version });
  } catch (error) {
    return errorResponse(res, error, 'Erro ao agendar escopo financeiro');
  }
});

// Cancel a future, not-yet-effective plan; keep the historical record.
router.post('/:territoryId/versions/:versionId/cancel', async (req: Request, res: Response) => {
  try {
    const data = cancelSchema.parse(req.body);
    const adminId = (req as any).admin.id as string;
    const result = await prisma.$transaction(async (tx) => {
      const version = await tx.territory_manager_neighborhood_scope_versions.findUnique({
        where: { id: req.params.versionId },
        select: { id: true, assignment_id: true },
      });
      if (!version) return reject(404, 'Versão não encontrada');
      await tx.$queryRaw`SELECT id FROM territory_manager_assignments WHERE id = ${version.assignment_id}::uuid FOR UPDATE`;
      const assignment = await tx.territory_manager_assignments.findUnique({
        where: { id: version.assignment_id }, select: { territory_id: true },
      });
      if (assignment?.territory_id !== req.params.territoryId) {
        return reject(404, 'Versão não pertence ao território');
      }
      const updated = await tx.territory_manager_neighborhood_scope_versions.updateMany({
        where: { id: version.id, canceled_at: null, effective_from: { gt: new Date() } },
        data: { canceled_at: new Date(), canceled_by: adminId, cancel_reason: data.reason },
      });
      if (updated.count !== 1) return reject(409, 'Somente versões futuras podem ser canceladas');
      return version;
    });
    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail,
      action: 'manager_neighborhood_financial_scope_cancel', entityType: 'manager_financial_scope',
      entityId: result.id, newValue: { reason: data.reason }, ipAddress: ctx.ip });
    return res.json({ success: true });
  } catch (error) {
    return errorResponse(res, error, 'Erro ao cancelar agendamento');
  }
});

export default router;
