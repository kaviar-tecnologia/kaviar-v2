import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import path from 'path';
import fs from 'fs';
import { authenticateAdmin, requireSuperAdmin, allowReadAccess } from '../middlewares/auth';
import { applyTerritoryScope } from '../middlewares/territory-scope';
import { requireTerritoryScope } from '../middlewares/require-territory-scope';
import { uploadToS3 } from '../config/s3-upload';
import { ApprovalController } from '../modules/admin/approval-controller';
import { config } from '../config';
import { createAuditLog } from '../utils/audit';
import { getDriverFinancialSummary } from '../services/financial-summary.service';

const router = Router();
const approvalController = new ApprovalController();

// Aplicar autenticação admin em todas as rotas
router.use(authenticateAdmin);

const createDriverSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório'),
  email: z.string().email('Email inválido'),
  phone: z.string().optional()
});

// POST /api/admin/drivers/create
router.post('/drivers/create', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const data = createDriverSchema.parse(req.body);

    // Verificar se email já existe
    const existing = await prisma.drivers.findUnique({
      where: { email: data.email }
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Email já cadastrado'
      });
    }

    // Criar motorista
    const driver = await prisma.drivers.create({
      data: {
        id: `driver-${Date.now()}`,
        name: data.name,
        email: data.email,
        phone: data.phone || null,
        status: 'pending',
        created_at: new Date(),
        updated_at: new Date()
      }
    });

    res.json({
      success: true,
      message: 'Motorista criado com sucesso',
      data: {
        id: driver.id,
        name: driver.name,
        email: driver.email,
        status: driver.status,
        first_access_link: (() => {
          const token = jwt.sign(
            { userId: driver.id, userType: 'driver', purpose: 'password_reset' },
            config.jwtResetSecret,
            { expiresIn: '7d' }
          );
          return `${config.frontendUrl}/admin/reset-password?token=${token}`;
        })()
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: error.errors[0].message
      });
    }
    console.error('Error creating driver:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao criar motorista'
    });
  }
});

// GET /api/admin/drivers?status=pending
router.get('/drivers', allowReadAccess, applyTerritoryScope, requireTerritoryScope, async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string;
    const vehicle_type = req.query.vehicle_type as string;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    // Validate vehicle_type if provided
    if (vehicle_type && !['CAR', 'MOTORCYCLE'].includes(vehicle_type)) {
      return res.status(400).json({ success: false, error: 'vehicle_type inválido. Use CAR ou MOTORCYCLE.' });
    }

    const where: any = status ? { status } : {};
    if (vehicle_type) where.vehicle_type = vehicle_type;

    // Escopo territorial: filtra por neighborhood_id ou territory (via neighborhoods.territory_id)
    const scope = (req as any).territoryScope;
    if (scope) {
      const hasNeighborhoods = scope.neighborhoodIds && scope.neighborhoodIds.length > 0;
      const hasTerritories = scope.territoryIds && scope.territoryIds.length > 0;

      if (hasNeighborhoods) {
        where.neighborhood_id = { in: scope.neighborhoodIds };
      } else if (hasTerritories) {
        // Território novo sem bairros cadastrados: filtrar via relação neighborhood→territory
        where.neighborhoods = { territory_id: { in: scope.territoryIds } };
      } else {
        // Scope vazio: não retornar nada (deny-by-default)
        where.id = '__DENY__';
      }
    }

    const [drivers, total] = await Promise.all([
      prisma.drivers.findMany({
        where,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          status: true,
          created_at: true,
          certidao_nada_consta_url: true,
          pix_key: true,
          pix_key_type: true,
          neighborhood_id: true,
          vehicle_color: true,
          vehicle_model: true,
          vehicle_plate: true,
          vehicle_type: true,
          neighborhoods: {
            select: {
              name: true
            }
          },
          municipal_authorizations: {
            select: {
              status: true,
              updated_at: true,
            },
            orderBy: { updated_at: 'desc' },
            take: 1,
          }
        },
        orderBy: { created_at: 'desc' },
        take: limit,
        skip
      }),
      prisma.drivers.count({ where })
    ]);

    // Normalize para camelCase (frontend compatibility)
    const admin = (req as any).admin;
    const isTerritorial = admin.role === 'TERRITORIAL_OPERATOR' || admin.role === 'TERRITORIAL_MANAGER';

    const normalized = drivers.map(d => {
      const base: any = {
        id: d.id,
        name: d.name,
        email: d.email,
        phone: d.phone,
        status: d.status,
        createdAt: d.created_at?.toISOString(),
        neighborhoodId: d.neighborhood_id,
        vehicleColor: d.vehicle_color,
        vehicleModel: d.vehicle_model,
        vehiclePlate: d.vehicle_plate,
        neighborhoods: d.neighborhoods,
      };

      const latestMunicipal = d.municipal_authorizations?.[0] || null;
      if (latestMunicipal) {
        base.municipalSummary = {
          status: latestMunicipal.status,
          updatedAt: latestMunicipal.updated_at?.toISOString?.() || null,
        };
      }

      if (!isTerritorial) {
        base.certidaoNadaConstaUrl = d.certidao_nada_consta_url;
        base.pixKey = d.pix_key;
        base.pixKeyType = d.pix_key_type;
      }
      return base;
    });

    res.json({
      success: true,
      data: normalized,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error listing drivers:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao listar motoristas'
    });
  }
});

// GET /api/admin/drivers/:id
router.get('/drivers/:id', allowReadAccess, applyTerritoryScope, async (req: Request, res: Response) => {
  const requestId = (req as any).requestId || req.headers['x-request-id'] || 'unknown';
  
  try {
    const { id } = req.params;
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;
    const isTerritorial = admin.role === 'TERRITORIAL_OPERATOR' || admin.role === 'TERRITORIAL_MANAGER';

    // Block email/phone lookup for territorial roles — only ID allowed
    if (isTerritorial && (id.includes('@') || /^\+?\d{8,}$/.test(id))) {
      return res.status(404).json({ success: false, error: 'Motorista não encontrado', requestId });
    }

    // Territorial roles: validate scope exists before any DB query
    if (isTerritorial && (!scope || !scope.neighborhoodIds || scope.neighborhoodIds.length === 0)) {
      return res.status(404).json({ success: false, error: 'Motorista não encontrado', requestId });
    }

    // Allowlist: territorial roles get limited columns; SUPER_ADMIN gets all except password_hash
    const TERRITORIAL_COLS = `d.id, d.name, d.email, d.phone, d.status, d.neighborhood_id, d.community_id,
      d.vehicle_plate, d.vehicle_model, d.vehicle_color, d.photo_url, d.created_at, d.approved_at,
      d.available, d.available_updated_at, d.is_premium, d.premium_tourism_status,
      d.suspension_reason, d.suspended_at, d.rejected_reason, d.rejected_at,
      d.territory_type, d.active_since`;

    const SA_COLS = `d.id, d.name, d.email, d.phone, d.status, d.neighborhood_id, d.community_id,
      d.vehicle_plate, d.vehicle_model, d.vehicle_color, d.photo_url, d.created_at, d.approved_at,
      d.available, d.available_updated_at, d.is_premium, d.premium_tourism_status,
      d.suspension_reason, d.suspended_at, d.suspended_by, d.rejected_reason, d.rejected_at, d.rejected_by,
      d.document_cpf, d.document_rg, d.document_cnh, d.pix_key, d.pix_key_type,
      d.certidao_nada_consta_url, d.territory_type, d.active_since,
      d.last_active_at,
      d.banned_at, d.banned_reason, d.banned_by, d.deleted_at, d.deleted_by,
      d.women_preference_eligible, d.women_matching_opt_in,
      d.virtual_fence_center_lat, d.virtual_fence_center_lng,
      d.secondary_base_lat, d.secondary_base_lng, d.secondary_base_label, d.secondary_base_enabled,
      d.territorial_partner_id, d.territorial_partner_linked_at`;

    const cols = isTerritorial ? TERRITORIAL_COLS : SA_COLS;
    const whereSQL = isTerritorial ? `d.id = $1` : `d.id = $1 OR d.email = $1 OR d.phone = $1`;
    const sql = `SELECT ${cols}, n.id as neighborhood_id_obj, n.name as neighborhood_name, c.id as community_id_obj, c.name as community_name
      FROM drivers d LEFT JOIN neighborhoods n ON d.neighborhood_id = n.id LEFT JOIN communities c ON d.community_id = c.id
      WHERE ${whereSQL} LIMIT 1`;

    const { pool } = require('../db');
    const queryResult = await pool.query(sql, [id]);
    const driverRaw = queryResult.rows;

    if (!driverRaw || driverRaw.length === 0) {
      return res.status(404).json({ success: false, error: 'Motorista não encontrado', requestId });
    }

    const driver = driverRaw[0];

    // Scope check: territorial roles must have driver in their territory — return 404 (not 403)
    if (isTerritorial) {
      if (!driver.neighborhood_id || !scope.neighborhoodIds.includes(driver.neighborhood_id)) {
        return res.status(404).json({ success: false, error: 'Motorista não encontrado', requestId });
      }
    }

    // Reconstruct nested objects for compatibility
    const result = {
      ...driver,
      neighborhoods: driver.neighborhood_id_obj ? {
        id: driver.neighborhood_id_obj,
        name: driver.neighborhood_name
      } : null,
      communities: driver.community_id_obj ? {
        id: driver.community_id_obj,
        name: driver.community_name
      } : null,
      driver_consents: [] // Empty for now, not critical
    };

    // Remove temp fields
    delete result.neighborhood_id_obj;
    delete result.neighborhood_name;
    delete result.community_id_obj;
    delete result.community_name;

    // P0: password_hash never selected — no delete needed

    // Log qual campo casou
    let matchedBy = 'id';
    if (!isTerritorial) {
      if (driver.email === id) matchedBy = 'email';
      else if (driver.phone === id) matchedBy = 'phone';
    }
    console.log(`[Admin] Driver found by ${matchedBy}: ${driver.id}`);

    res.json({
      success: true,
      data: result
    });
  } catch (error: any) {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      requestId,
      path: req.path,
      driverId: req.params.id,
      error: error?.message || String(error),
      stack: error?.stack
    }));
    
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar motorista',
      requestId
    });
  }
});

// GET /api/admin/drivers/:id/documents
router.get('/drivers/:id/documents', allowReadAccess, applyTerritoryScope, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // TERRITORIAL_OPERATOR: verificar que motorista pertence ao território
    const admin = (req as any).admin;
    if (admin.role === 'TERRITORIAL_OPERATOR' || admin.role === 'TERRITORIAL_MANAGER') {
      const scope = (req as any).territoryScope;
      if (!scope || scope.neighborhoodIds.length === 0) {
        return res.status(403).json({ success: false, error: 'Acesso negado' });
      }
      const driver = await prisma.drivers.findUnique({ where: { id }, select: { neighborhood_id: true } });
      if (!driver || !driver.neighborhood_id || !scope.neighborhoodIds.includes(driver.neighborhood_id)) {
        return res.status(403).json({ success: false, error: 'Motorista fora do seu território' });
      }
    }

    const documents = await prisma.driver_documents.findMany({
      where: { driver_id: id },
      orderBy: { created_at: 'desc' }
    });

    // Masking para TERRITORIAL_OPERATOR: ocultar URLs dos documentos
    if (admin.role === 'TERRITORIAL_OPERATOR' || admin.role === 'TERRITORIAL_MANAGER') {
      const masked = documents.map(doc => ({
        id: doc.id,
        driver_id: doc.driver_id,
        type: doc.type,
        status: doc.status,
        submitted_at: doc.submitted_at,
        verified_at: doc.verified_at,
        rejected_at: doc.rejected_at,
        reject_reason: doc.reject_reason,
        created_at: doc.created_at,
        // Ocultar URLs sensíveis
        document_url: undefined,
        file_url: undefined,
      }));
      return res.json({ success: true, data: masked });
    }

    res.json({
      success: true,
      data: documents
    });
  } catch (error) {
    console.error('Error getting driver documents:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao buscar documentos'
    });
  }
});

// PUT /api/admin/drivers/:id/documents/:docId/verify
// PUT /api/admin/drivers/:id/documents/:docId/reject
import { DriverAdminController } from '../modules/admin/driver-admin-controller';
const driverAdminController = new DriverAdminController();
router.put('/drivers/:id/documents/:docId/verify', requireSuperAdmin, driverAdminController.verifyDocument);
router.put('/drivers/:id/documents/:docId/reject', requireSuperAdmin, driverAdminController.rejectDocument);

// POST/PUT /api/admin/drivers/:id/approve (delegado ao ApprovalController)
// Aceita ambos métodos para compatibilidade frontend
router.post('/drivers/:id/approve', requireSuperAdmin, approvalController.approveDriver);
router.put('/drivers/:id/approve', requireSuperAdmin, approvalController.approveDriver);

// POST /api/admin/drivers/:id/reject
router.post('/drivers/:id/reject', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminId = (req as any).userId;

    if (!reason || reason.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Motivo da rejeição é obrigatório'
      });
    }

    const driver = await prisma.drivers.findUnique({ where: { id } });

    if (!driver) {
      return res.status(404).json({
        success: false,
        error: 'Motorista não encontrado'
      });
    }

    await prisma.drivers.update({
      where: { id },
      data: {
        status: 'rejected',
        rejected_at: new Date(),
        rejected_by: adminId,
        rejected_reason: reason,
        approved_at: null,
        approved_by: null,
        updated_at: new Date()
      }
    });

    res.json({
      success: true,
      message: 'Motorista rejeitado'
    });
  } catch (error) {
    console.error('Error rejecting driver:', error);
    res.status(500).json({
      success: false,
      error: 'Erro ao rejeitar motorista'
    });
  }
});

// 🔍 DEBUG ENDPOINT (ADMIN ONLY, ENV GATED)
// GET /api/admin/debug/uploads-check?file=<filename>
router.get('/debug/uploads-check', requireSuperAdmin, async (req: Request, res: Response) => {
  // Feature flag: só habilitar em produção com env var
  if (process.env.ENABLE_UPLOADS_DEBUG !== 'true') {
    return res.status(404).json({ error: 'Not found' });
  }

  const { file } = req.query;
  
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const uploadDir = path.join(process.cwd(), 'uploads', 'certidoes');
  
  const result = {
    cwd: process.cwd(),
    uploadsDir,
    uploadDir,
    uploadsDirExists: fs.existsSync(uploadsDir),
    uploadDirExists: fs.existsSync(uploadDir),
    fileExists: null as boolean | null,
    filePath: null as string | null,
    uploadsDirContents: [] as string[],
    uploadDirContents: [] as string[]
  };

  // Listar conteúdo dos diretórios
  if (result.uploadsDirExists) {
    try {
      result.uploadsDirContents = fs.readdirSync(uploadsDir);
    } catch (e) {
      result.uploadsDirContents = [`Error: ${e}`];
    }
  }

  if (result.uploadDirExists) {
    try {
      result.uploadDirContents = fs.readdirSync(uploadDir);
    } catch (e) {
      result.uploadDirContents = [`Error: ${e}`];
    }
  }

  // Verificar arquivo específico
  if (file && typeof file === 'string') {
    result.filePath = path.join(uploadDir, file);
    result.fileExists = fs.existsSync(result.filePath);
  }

  res.json(result);
});

// PATCH /api/admin/drivers/:id/approve
router.patch('/drivers/:id/approve', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const driver = await prisma.drivers.findUnique({ where: { id } });
    if (!driver) {
      return res.status(404).json({ success: false, error: 'Motorista não encontrado' });
    }

    const updated = await prisma.drivers.update({
      where: { id },
      data: {
        status: 'approved',
        approved_at: new Date(),
        approved_by: (req as any).admin?.id || 'admin',
        updated_at: new Date()
      }
    });

    res.json({
      success: true,
      driver: { id: updated.id, status: updated.status }
    });
  } catch (error) {
    console.error('Error approving driver:', error);
    res.status(500).json({ success: false, error: 'Erro ao aprovar motorista' });
  }
});

// PATCH /api/admin/drivers/:id/activate
router.patch('/drivers/:id/activate', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const driver = await prisma.drivers.findUnique({ where: { id } });
    if (!driver) {
      return res.status(404).json({ success: false, error: 'Motorista não encontrado' });
    }

    // Se activeSince não existe, setar agora (primeira ativação)
    const updateData: any = {
      status: 'active',
      updated_at: new Date()
    };

    if (!driver.active_since) {
      updateData.active_since = new Date();
    }

    const updated = await prisma.drivers.update({
      where: { id },
      data: updateData
    });

    res.json({ success: true, driver: { id: updated.id, status: updated.status, activeSince: updated.active_since } });
  } catch (error) {
    console.error('Error activating driver:', error);
    res.status(500).json({ success: false, error: 'Erro ao ativar motorista' });
  }
});

// GET /api/admin/drivers/:id/premium-eligibility
router.get('/drivers/:id/premium-eligibility', allowReadAccess, applyTerritoryScope, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const driver = await prisma.drivers.findUnique({ where: { id } });
    if (!driver) {
      return res.status(404).json({ success: false, error: 'Motorista não encontrado' });
    }

    // Scope check
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;
    if (admin.role === 'TERRITORIAL_OPERATOR' || admin.role === 'TERRITORIAL_MANAGER') {
      if (!scope || scope.neighborhoodIds.length === 0 || !driver.neighborhood_id || !scope.neighborhoodIds.includes(driver.neighborhood_id)) {
        return res.status(403).json({ success: false, error: 'Motorista fora do seu território' });
      }
    }

    const requiredMonths = parseInt(process.env.PREMIUM_TOURISM_MIN_MONTHS || '6');
    let monthsActive = 0;
    let eligibleByTime = false;

    if (driver.active_since) {
      const diffMs = Date.now() - driver.active_since.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      monthsActive = Math.floor(diffDays / 30);
      eligibleByTime = monthsActive >= requiredMonths;
    }

    // Docs/Terms check (placeholder - retornar null se não existir validação)
    const docsOk = null;
    const termsOk = null;

    const eligible = eligibleByTime && driver.status === 'active';

    res.json({
      success: true,
      data: {
        driverId: driver.id,
        status: driver.status,
        activeSince: driver.active_since?.toISOString() || null,
        monthsActive,
        requiredMonths,
        eligibleByTime,
        docsOk,
        termsOk,
        eligible,
        currentPremiumTourismStatus: driver.premium_tourism_status
      }
    });
  } catch (error) {
    console.error('Error checking premium eligibility:', error);
    res.status(500).json({ success: false, error: 'Erro ao verificar elegibilidade' });
  }
});

// GET /api/admin/drivers/:id/eligibility (MVP - tenure-based)
router.get('/drivers/:id/eligibility', allowReadAccess, applyTerritoryScope, async (req: Request, res: Response) => {
  const requestId = (req as any).requestId || req.headers['x-request-id'] || 'unknown';
  
  try {
    const { id } = req.params;

    const driver = await prisma.drivers.findUnique({
      where: { id },
      include: {
        driver_consents: true
      }
    });

    if (!driver) {
      return res.status(404).json({ success: false, error: 'Motorista não encontrado', requestId });
    }

    // Scope check
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;
    if (admin.role === 'TERRITORIAL_OPERATOR' || admin.role === 'TERRITORIAL_MANAGER') {
      if (!scope || scope.neighborhoodIds.length === 0 || !driver.neighborhood_id || !scope.neighborhoodIds.includes(driver.neighborhood_id)) {
        return res.status(403).json({ success: false, error: 'Motorista fora do seu território' });
      }
    }

    // Calcular tenure desde createdAt
    const createdAt = driver.created_at;
    const now = new Date();
    const diffMs = now.getTime() - createdAt.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const tenureMonths = Math.floor(diffDays / 30);

    const tenureLabel = tenureMonths === 0 ? 'menos de 1 mês' :
                        tenureMonths === 1 ? 'há 1 mês' :
                        `há ${tenureMonths} meses`;

    // Verificar docs (MVP: considerar OK se certidao_nada_consta_url existe)
    const docsOk = !!driver.certidao_nada_consta_url;

    // Verificar termos (MVP: considerar OK se driver_consents existe)
    const termsOk = !!driver.driver_consents;

    // Calcular elegibilidade
    const reasons: string[] = [];
    if (tenureMonths < 6) reasons.push('TENURE_LT_6');
    if (!docsOk) reasons.push('DOCS_PENDING');
    if (!termsOk) reasons.push('TERMS_NOT_ACCEPTED');

    const eligiblePremium = tenureMonths >= 6 && docsOk && termsOk;

    res.json({
      success: true,
      data: {
        driverId: driver.id,
        createdAt: createdAt.toISOString(),
        tenureMonths,
        tenureLabel,
        docsOk,
        termsOk,
        eligiblePremium,
        reasons
      }
    });
  } catch (error: any) {
    // Log estruturado com stack + requestId
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      requestId,
      path: req.path,
      driverId: req.params.id,
      error: error?.message || String(error),
      stack: error?.stack
    }));
    
    res.status(500).json({ 
      success: false, 
      error: 'Erro ao verificar elegibilidade', 
      requestId 
    });
  }
});

// PATCH /api/admin/drivers/:id/promote-premium-tourism
router.patch('/drivers/:id/promote-premium-tourism', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const driver = await prisma.drivers.findUnique({ where: { id } });
    if (!driver) {
      return res.status(404).json({ success: false, error: 'Motorista não encontrado' });
    }

    if (driver.status !== 'active') {
      return res.status(400).json({ success: false, error: 'Driver not active' });
    }

    if (!driver.active_since) {
      return res.status(400).json({ success: false, error: 'ActiveSince not set' });
    }

    if (driver.premium_tourism_status === 'premium') {
      return res.status(409).json({ success: false, error: 'Already premium' });
    }

    const requiredMonths = parseInt(process.env.PREMIUM_TOURISM_MIN_MONTHS || '6');
    const diffMs = Date.now() - driver.active_since.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const monthsActive = Math.floor(diffDays / 30);

    if (monthsActive < requiredMonths) {
      return res.status(403).json({ 
        success: false, 
        error: `Not eligible: requires ${requiredMonths} months active (current: ${monthsActive})` 
      });
    }

    const updated = await prisma.drivers.update({
      where: { id },
      data: {
        premium_tourism_status: 'premium',
        premium_tourism_promoted_at: new Date(),
        updated_at: new Date()
      }
    });

    res.json({
      success: true,
      data: {
        driverId: updated.id,
        premiumTourismStatus: updated.premium_tourism_status,
        promotedAt: updated.premium_tourism_promoted_at
      }
    });
  } catch (error) {
    console.error('Error promoting to premium tourism:', error);
    res.status(500).json({ success: false, error: 'Erro ao promover motorista' });
  }
});

// GET /api/admin/drivers/:id/financial-summary
router.get('/drivers/:id/financial-summary', allowReadAccess, applyTerritoryScope, async (req: Request, res: Response) => {
  try {
    // Scope check: TERRITORIAL_OPERATOR só acessa financeiro de motorista do seu território
    const admin = (req as any).admin;
    if (admin.role === 'TERRITORIAL_OPERATOR' || admin.role === 'TERRITORIAL_MANAGER') {
      const scope = (req as any).territoryScope;
      if (!scope || scope.neighborhoodIds.length === 0) {
        return res.status(403).json({ success: false, error: 'Acesso negado' });
      }
      const driver = await prisma.drivers.findUnique({ where: { id: req.params.id }, select: { neighborhood_id: true } });
      if (!driver || !driver.neighborhood_id || !scope.neighborhoodIds.includes(driver.neighborhood_id)) {
        return res.status(403).json({ success: false, error: 'Motorista fora do seu território' });
      }
    }

    const data = await getDriverFinancialSummary(req.params.id, (req.query.period as string) || '30d');
    res.json({ success: true, data });
  } catch (error: any) {
    console.error('[ADMIN_DRIVER_FINANCIAL_SUMMARY_ERROR]', error);
    res.status(500).json({ success: false, error: 'Erro ao carregar resumo financeiro' });
  }
});

const driverEditSchema = z.object({
  phone: z.string().min(10).optional(),
  email: z.string().email().optional(),
  vehicle_plate: z.string().optional(),
  vehicle_model: z.string().optional(),
  vehicle_color: z.string().optional(),
  neighborhood_id: z.string().nullable().optional(),
  community_id: z.string().nullable().optional(),
  pix_key: z.string().nullable().optional(),
  pix_key_type: z.string().nullable().optional(),
  // @deprecated 2026-07-27 — aceitos para compatibilidade, ignorados antes do Prisma
  family_bonus_accepted: z.unknown().optional(),
  family_bonus_profile: z.unknown().optional(),
}).strict().transform(({ family_bonus_accepted, family_bonus_profile, ...clean }) => clean);

// PATCH /api/admin/drivers/:id — edit driver operational data
router.patch('/drivers/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const driver = await prisma.drivers.findUnique({ where: { id: req.params.id } });
    if (!driver) return res.status(404).json({ success: false, error: 'Motorista não encontrado' });

    const updates = driverEditSchema.parse(req.body);
    if (Object.keys(updates).length === 0) return res.status(400).json({ success: false, error: 'Nenhum campo para atualizar' });

    // Check email uniqueness if changing
    if (updates.email && updates.email !== driver.email) {
      const existing = await prisma.drivers.findUnique({ where: { email: updates.email } });
      if (existing) return res.status(409).json({ success: false, error: 'Email já cadastrado por outro motorista' });
    }

    // Build old values for audit (only changed fields)
    const oldValues: Record<string, any> = {};
    const newValues: Record<string, any> = {};
    for (const [key, val] of Object.entries(updates)) {
      const oldVal = (driver as any)[key];
      if (String(val ?? '') !== String(oldVal ?? '')) {
        oldValues[key] = oldVal;
        newValues[key] = val;
      }
    }

    if (Object.keys(newValues).length === 0) return res.json({ success: true, data: driver, message: 'Nenhuma alteração detectada' });

    const updated = await prisma.drivers.update({
      where: { id: req.params.id },
      data: { ...newValues, updated_at: new Date() },
    });

    const adminId = (req as any).adminId || (req as any).admin?.id;
    await createAuditLog({
      adminId,
      action: 'DRIVER_EDIT',
      entityType: 'driver',
      entityId: req.params.id,
      oldValue: oldValues,
      newValue: newValues,
      ipAddress: req.ip,
    });

    console.log(`[ADMIN_DRIVER_EDIT] driver=${req.params.id} by=${adminId} fields=${Object.keys(newValues).join(',')}`);
    res.json({ success: true, data: updated });
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ success: false, error: error.errors[0].message });
    console.error('[ADMIN_DRIVER_EDIT_ERROR]', error);
    res.status(500).json({ success: false, error: 'Erro ao atualizar motorista' });
  }
});

// PUT /api/admin/drivers/:id/photo-approve — aprova foto de perfil e popula drivers.photo_url
router.put('/drivers/:id/photo-approve', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const doc = await prisma.driver_documents.findFirst({
      where: { driver_id: id, type: 'PROFILE_PHOTO', status: { not: 'rejected' } },
      orderBy: { created_at: 'desc' },
    });
    if (!doc) return res.status(404).json({ success: false, error: 'Foto de perfil não encontrada' });

    const photoUrl = doc.file_url || doc.document_url;
    if (!photoUrl) return res.status(400).json({ success: false, error: 'URL da foto ausente no documento' });

    await prisma.$transaction([
      prisma.driver_documents.update({
        where: { id: doc.id },
        data: { status: 'VERIFIED', verified_at: new Date() },
      }),
      prisma.drivers.update({
        where: { id },
        data: { photo_url: photoUrl },
      }),
    ]);

    console.log(`[PHOTO_APPROVED] driver_id=${id} doc_id=${doc.id}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[PHOTO_APPROVE_ERROR]', error);
    res.status(500).json({ success: false, error: 'Erro ao aprovar foto' });
  }
});

// PUT /api/admin/drivers/:id/photo-reject — rejeita foto e limpa drivers.photo_url
router.put('/drivers/:id/photo-reject', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const doc = await prisma.driver_documents.findFirst({
      where: { driver_id: id, type: 'PROFILE_PHOTO', status: { not: 'rejected' } },
      orderBy: { created_at: 'desc' },
    });
    if (!doc) return res.status(404).json({ success: false, error: 'Foto de perfil não encontrada' });

    await prisma.$transaction([
      prisma.driver_documents.update({
        where: { id: doc.id },
        data: { status: 'rejected', rejected_at: new Date() },
      }),
      prisma.drivers.update({
        where: { id },
        data: { photo_url: null },
      }),
    ]);

    console.log(`[PHOTO_REJECTED] driver_id=${id} doc_id=${doc.id}`);
    res.json({ success: true });
  } catch (error: any) {
    console.error('[PHOTO_REJECT_ERROR]', error);
    res.status(500).json({ success: false, error: 'Erro ao rejeitar foto' });
  }
});

// GET /api/admin/drivers/:id/audit — audit log for a driver
router.get('/drivers/:id/audit', allowReadAccess, applyTerritoryScope, async (req: Request, res: Response) => {
  try {
    // Scope check
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;
    if (admin.role === 'TERRITORIAL_OPERATOR' || admin.role === 'TERRITORIAL_MANAGER') {
      if (!scope || scope.neighborhoodIds.length === 0) return res.status(403).json({ success: false, error: 'Acesso negado' });
      const driver = await prisma.drivers.findUnique({ where: { id: req.params.id }, select: { neighborhood_id: true } });
      if (!driver || !driver.neighborhood_id || !scope.neighborhoodIds.includes(driver.neighborhood_id)) {
        return res.status(403).json({ success: false, error: 'Motorista fora do seu território' });
      }
    }

    const { pool } = require('../db');
    const result = await pool.query(
      `SELECT id, admin_id, action, old_value, new_value, reason, created_at
       FROM admin_audit_logs WHERE entity_type = 'driver' AND entity_id = $1
       ORDER BY created_at DESC LIMIT 50`,
      [req.params.id]
    );

    // Sanitize old_value/new_value
    // GLOBAL: passwords, tokens, secrets — redacted for ALL roles including SUPER_ADMIN
    const ALWAYS_REDACT = ['password', 'password_hash', 'token', 'access_token', 'refresh_token', 'expo_push_token', 'fcm_push_token', 'push_token', 'credentials', 'secret', 'api_key'];
    // TERRITORIAL only: PII and sensitive personal data
    const TERRITORIAL_REDACT = ['pix_key', 'pix_key_type', 'cpf', 'document_cpf', 'rg', 'document_rg', 'cnh', 'document_cnh', 'device_id', 'last_lat', 'last_lng'];
    const isTerritorial = admin.role === 'TERRITORIAL_OPERATOR' || admin.role === 'TERRITORIAL_MANAGER';
    const redactKeys = isTerritorial ? [...ALWAYS_REDACT, ...TERRITORIAL_REDACT] : ALWAYS_REDACT;

    const sanitized = result.rows.map((row: any) => {
      const sanitizeValue = (val: any) => {
        if (!val || typeof val !== 'string') return val;
        try {
          const obj = JSON.parse(val);
          for (const key of redactKeys) { if (key in obj) obj[key] = '[REDACTED]'; }
          return JSON.stringify(obj);
        } catch { return redactKeys.some(k => val.toLowerCase().includes(k)) ? '[REDACTED]' : val; }
      };
      return { ...row, old_value: sanitizeValue(row.old_value), new_value: sanitizeValue(row.new_value) };
    });

    res.json({ success: true, data: sanitized });
  } catch (error: any) {
    console.error('[ADMIN_DRIVER_AUDIT_ERROR]', error);
    res.json({ success: true, data: [] });
  }
});

// POST /api/admin/drivers/:id/photo-upload — admin uploads/replaces driver or vehicle photo
router.post('/drivers/:id/photo-upload', requireSuperAdmin, uploadToS3.single('photo'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type } = req.body;
    if (!['PROFILE_PHOTO', 'VEHICLE_PHOTO'].includes(type)) {
      return res.status(400).json({ success: false, error: 'type deve ser PROFILE_PHOTO ou VEHICLE_PHOTO' });
    }
    const file = req.file as any;
    if (!file) return res.status(400).json({ success: false, error: 'Arquivo não enviado' });
    if (!file.mimetype.startsWith('image/')) return res.status(400).json({ success: false, error: 'Apenas imagens são permitidas' });

    const fileUrl = file.key || `certidoes/${file.filename}`;
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.driver_documents.upsert({
        where: { driver_id_type: { driver_id: id, type } },
        create: { id: `doc_${id}_${type}_${Date.now()}`, driver_id: id, type, file_url: fileUrl, status: 'VERIFIED', verified_at: now, submitted_at: now, updated_at: now },
        update: { file_url: fileUrl, status: 'VERIFIED', verified_at: now, submitted_at: now, updated_at: now },
      });
      if (type === 'PROFILE_PHOTO') {
        await tx.drivers.update({ where: { id }, data: { photo_url: fileUrl } });
      }
    });

    res.json({ success: true, data: { type, file_url: fileUrl, status: 'VERIFIED' } });
  } catch (error: any) {
    console.error('[ADMIN_PHOTO_UPLOAD_ERROR]', error);
    res.status(500).json({ success: false, error: 'Erro ao enviar foto' });
  }
});

// ── Excellence Seal ──────────────────────────────────────────────────────────

router.get('/drivers/:id/excellence-seal', allowReadAccess, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const badge = await prisma.driver_badges.findUnique({ where: { driver_id_badge_type: { driver_id: id, badge_type: 'EXCELLENCE_SEAL' } } });
    const events = await prisma.driver_badge_events.findMany({
      where: { driver_id: id, badge_code: 'EXCELLENCE_SEAL' },
      orderBy: { created_at: 'desc' },
      take: 20,
      select: { id: true, event_type: true, reason: true, criteria_snapshot: true, admin_id: true, created_at: true },
    });
    return res.json({
      success: true,
      data: {
        hasSeal: !!badge,
        active: badge ? Number(badge.progress) === 100 : false,
        suspended: badge ? Number(badge.progress) === 0 : false,
        grantedAt: badge?.unlocked_at ?? null,
        history: events,
      },
    });
  } catch (error) {
    console.error('[EXCELLENCE_SEAL_QUERY]', error);
    return res.status(500).json({ success: false, error: 'Erro ao consultar selo.' });
  }
});

router.post('/drivers/:id/excellence-seal/revoke', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const adminId = (req as any).admin?.id;
    const reason = req.body?.reason;
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({ success: false, error: 'Motivo obrigatório (mínimo 5 caracteres).' });
    }
    const badge = await prisma.driver_badges.findUnique({ where: { driver_id_badge_type: { driver_id: id, badge_type: 'EXCELLENCE_SEAL' } } });
    if (!badge) {
      return res.status(404).json({ success: false, error: 'Motorista não possui o Selo Excelência.' });
    }
    await prisma.driver_badges.delete({ where: { driver_id_badge_type: { driver_id: id, badge_type: 'EXCELLENCE_SEAL' } } });
    await prisma.driver_badge_events.create({
      data: { driver_id: id, badge_code: 'EXCELLENCE_SEAL', event_type: 'REVOKED', reason: reason.trim(), admin_id: adminId },
    });
    return res.json({ success: true, message: 'Selo revogado.' });
  } catch (error) {
    console.error('[EXCELLENCE_SEAL_REVOKE]', error);
    return res.status(500).json({ success: false, error: 'Erro ao revogar selo.' });
  }
});

export default router;
