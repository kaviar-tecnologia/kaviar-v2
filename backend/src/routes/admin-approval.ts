import { Router } from 'express';
import { ApprovalController } from '../modules/admin/approval-controller';
import { authenticateAdmin, requireSuperAdmin, allowReadAccess } from '../middlewares/auth';
import { applyTerritoryScope } from '../middlewares/territory-scope';
import { auditWrite } from '../middlewares/audit-write';
import { prisma } from '../lib/prisma';

const router = Router();
const approvalController = new ApprovalController();

// All admin routes require authentication
router.use(authenticateAdmin);

// Driver approval routes
router.get('/drivers', allowReadAccess, applyTerritoryScope, async (req, res) => {
  // TERRITORIAL_OPERATOR/MANAGER: filtrar motoristas pendentes do seu território
  const admin = (req as any).admin;
  const scope = (req as any).territoryScope;
  if (admin.role === 'TERRITORIAL_OPERATOR' || admin.role === 'TERRITORIAL_MANAGER') {
    const hasNeighborhoods = scope?.neighborhoodIds && scope.neighborhoodIds.length > 0;
    const hasTerritories = scope?.territoryIds && scope.territoryIds.length > 0;

    if (!scope || (!hasNeighborhoods && !hasTerritories)) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }
    // Inject neighborhood filter into query for the controller
    if (!req.query.neighborhood_ids) {
      (req as any).scopeNeighborhoodFilter = hasNeighborhoods ? scope.neighborhoodIds : null;
      (req as any).scopeTerritoryFilter = hasTerritories ? scope.territoryIds : null;
    }
  }

  // Intercept response to sanitize for territorial roles
  const isTerritorial = admin.role === 'TERRITORIAL_OPERATOR' || admin.role === 'TERRITORIAL_MANAGER';
  if (isTerritorial) {
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      if (body?.data && Array.isArray(body.data)) {
        body.data = body.data.map(({ documentCpf, documentRg, documentCnh, ...safe }: any) => safe);
      }
      return originalJson(body);
    };
  }
  return approvalController.getDrivers(req, res);
});
router.get('/drivers/metrics/by-neighborhood', allowReadAccess, applyTerritoryScope, async (req, res) => {
  const admin = (req as any).admin;
  const scope = (req as any).territoryScope;

  // TERRITORIAL_OPERATOR/MANAGER: injetar filtro de neighborhoods no controller
  if (admin.role === 'TERRITORIAL_OPERATOR' || admin.role === 'TERRITORIAL_MANAGER') {
    if (!scope) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }
    const hasNeighborhoods = scope.neighborhoodIds && scope.neighborhoodIds.length > 0;
    const hasTerritories = scope.territoryIds && scope.territoryIds.length > 0;

    if (!hasNeighborhoods && !hasTerritories) {
      return res.status(403).json({ success: false, error: 'Sem território vinculado. Acesso negado.' });
    }
    // Pass scope to controller via request
    (req as any).scopeNeighborhoodFilter = hasNeighborhoods ? scope.neighborhoodIds : null;
    (req as any).scopeTerritoryFilter = hasTerritories ? scope.territoryIds : null;
  }
  return approvalController.getDriversByNeighborhood(req, res);
});
router.put('/drivers/:id/approve', requireSuperAdmin, auditWrite('approve_driver', 'driver'), approvalController.approveDriver);
router.put('/drivers/:id/reject', requireSuperAdmin, auditWrite('reject_driver', 'driver'), approvalController.rejectDriver);

// PUT /api/admin/drivers/:id/request-documents — solicitar documentos pendentes
router.put('/drivers/:id/request-documents', requireSuperAdmin, auditWrite('request_documents', 'driver'), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    if (!reason || !reason.trim()) {
      return res.status(400).json({ success: false, error: 'Motivo é obrigatório' });
    }
    const driver = await prisma.drivers.findUnique({ where: { id } });
    if (!driver) return res.status(404).json({ success: false, error: 'Motorista não encontrado' });

    await prisma.drivers.update({
      where: { id },
      data: {
        status: 'needs_documents',
        pending_reason: reason.trim(),
        pending_reason_updated_at: new Date(),
        rejected_at: null,
        rejected_by: null,
        rejected_reason: null,
        updated_at: new Date()
      }
    });
    res.json({ success: true, message: 'Documentos solicitados ao motorista' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao solicitar documentos' });
  }
});

// PUT /api/admin/drivers/:id/archive — arquivar cadastro
router.put('/drivers/:id/archive', requireSuperAdmin, auditWrite('archive_driver', 'driver'), async (req, res) => {
  try {
    const { id } = req.params;
    const driver = await prisma.drivers.findUnique({ where: { id } });
    if (!driver) return res.status(404).json({ success: false, error: 'Motorista não encontrado' });

    await prisma.drivers.update({
      where: { id },
      data: { status: 'archived', updated_at: new Date() }
    });
    res.json({ success: true, message: 'Motorista arquivado' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao arquivar motorista' });
  }
});

// PUT /api/admin/drivers/:id/reopen — reabrir análise de motorista rejeitado/arquivado
router.put('/drivers/:id/reopen', requireSuperAdmin, auditWrite('reopen_driver', 'driver'), async (req, res) => {
  try {
    const { id } = req.params;
    const driver = await prisma.drivers.findUnique({ where: { id } });
    if (!driver) return res.status(404).json({ success: false, error: 'Motorista não encontrado' });
    if (!['rejected', 'archived'].includes(driver.status)) {
      return res.status(400).json({ success: false, error: 'Apenas motoristas rejeitados ou arquivados podem ser reabertos' });
    }

    await prisma.drivers.update({
      where: { id },
      data: {
        status: 'pending',
        rejected_at: null,
        rejected_by: null,
        rejected_reason: null,
        pending_reason: null,
        updated_at: new Date()
      }
    });
    res.json({ success: true, message: 'Análise reaberta — motorista voltou para Pendentes' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erro ao reabrir análise' });
  }
});

// DELETE /api/admin/drivers/:id — soft-delete
router.delete('/drivers/:id', requireSuperAdmin, auditWrite('delete_driver', 'driver'), async (req, res) => {
  try {
    const adminId = (req as any).userId;
    await prisma.drivers.update({
      where: { id: req.params.id },
      data: { deleted_at: new Date(), deleted_by: adminId, updated_at: new Date() }
    });
    res.json({ success: true, message: 'Driver deleted' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete driver' });
  }
});

// Guide approval routes  
router.get('/guides', allowReadAccess, approvalController.getGuides);
router.put('/guides/:id/approve', requireSuperAdmin, auditWrite('approve_guide', 'guide'), approvalController.approveGuide);
router.put('/guides/:id/reject', requireSuperAdmin, auditWrite('reject_guide', 'guide'), approvalController.rejectGuide);

// Audit route
router.get('/rides/audit', allowReadAccess, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const [audits, total] = await Promise.all([
      prisma.ride_admin_actions.findMany({
        take: limit,
        skip,
        orderBy: { created_at: 'desc' }
      }),
      prisma.ride_admin_actions.count()
    ]);

    res.json({
      success: true,
      data: audits,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      data: [],
      pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      error: 'Audit logs not available',
      code: 'AUDIT_UNAVAILABLE'
    });
  }
});

export { router as adminApprovalRoutes };
