import { Router, Request, Response } from 'express';
import {
  authenticateAdmin,
  allowFinanceAccess,
  allowExecutiveConfirmedAction,
  allowExecutiveRegulatorySearch,
  allowExecutiveReadAccess,
  requireSuperAdmin,
} from '../middlewares/auth';
import { askKaviarAi } from '../services/ai/kaviar-ai.service';
import {
  createDevelopmentJob,
  confirmDevelopmentJob,
  getDevelopmentJob,
  DevelopmentJobError,
} from '../services/ai/kaviar-ai.development-jobs';
import { createOpenAiProviderIfConfigured } from '../services/ai/kaviar-ai.openai-provider';
import { startRegulatorySearch, retrieveRegulatorySearch, classifyRegulatorySearchError } from '../services/ai/kaviar-ai.regulatory-search';
import { prisma } from '../lib/prisma';
import { AdminService } from '../modules/admin/service';
import { audit, auditCtx } from '../utils/audit';
import {
  isCoverageStatus,
  resolveCoverageNotes,
  resolveCoverageTransition,
} from '../services/ai/kaviar-ai.territory-coverage-governance';
import {
  CareAdminConflict,
  lockCareAdminRow,
  writeCareAdminAuditTx,
} from '../services/care/care-admin-atomic';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

function generateSecurePassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*';
  const all = upper + lower + digits + special;
  const buf = crypto.randomBytes(16);
  const chars: string[] = [upper[buf[0] % upper.length], lower[buf[1] % lower.length], digits[buf[2] % digits.length], special[buf[3] % special.length]];
  for (let i = 4; i < 16; i++) chars.push(all[buf[i] % all.length]);
  const shuffleBuf = crypto.randomBytes(16);
  for (let i = chars.length - 1; i > 0; i--) { const j = shuffleBuf[i] % (i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}

const MAX_HISTORY_ITEMS = 6;
const MAX_HISTORY_CONTENT_LENGTH = 1000;
const MAX_HISTORY_TOTAL_LENGTH = 4000;

/**
 * Validates and sanitizes conversation history from the client.
 * Returns undefined if input is invalid or empty.
 * Strips any fields beyond role/content. Enforces limits.
 * Preserves most recent messages when total length exceeds MAX_HISTORY_TOTAL_LENGTH.
 * @internal Exported for testing only.
 */
export function sanitizeHistory(
  raw: unknown
): Array<{ role: 'user' | 'assistant'; content: string }> | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;

  const validated: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (const item of raw.slice(-MAX_HISTORY_ITEMS)) {
    if (
      item &&
      typeof item === 'object' &&
      (item.role === 'user' || item.role === 'assistant') &&
      typeof item.content === 'string' &&
      item.content.trim().length > 0
    ) {
      validated.push({
        role: item.role,
        content: item.content.trim().slice(0, MAX_HISTORY_CONTENT_LENGTH),
      });
    }
  }

  if (validated.length === 0) return undefined;

  // Enforce total character limit, keeping most recent messages
  const result: Array<{ role: 'user' | 'assistant'; content: string }> = [];
  let totalChars = 0;

  for (let i = validated.length - 1; i >= 0; i--) {
    const len = validated[i].content.length;
    if (totalChars + len > MAX_HISTORY_TOTAL_LENGTH) break;
    result.unshift(validated[i]);
    totalChars += len;
  }

  return result.length > 0 ? result : undefined;
}


function toCityLandingSlug(city: string, uf: string): string {
  return `${city}-${uf}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const router = Router();

router.use(authenticateAdmin);
router.use(allowFinanceAccess);

const MAX_QUESTION_LENGTH = 1000;

// Provider instanciado uma vez na inicialização da rota.
// Retorna undefined se OPENAI_API_KEY não estiver definida.
const modelProvider = createOpenAiProviderIfConfigured();

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;

    const question =
      typeof req.body?.question === 'string'
        ? req.body.question.trim()
        : '';

    if (!question) {
      return res.status(400).json({
        success: false,
        error: 'Pergunta obrigatória.',
      });
    }

    if (question.length > MAX_QUESTION_LENGTH) {
      return res.status(400).json({
        success: false,
        error: `Pergunta deve ter no máximo ${MAX_QUESTION_LENGTH} caracteres.`,
      });
    }

    const result = await askKaviarAi({
      userId: admin.id,
      question,
      role: admin.role,
      history: sanitizeHistory(req.body?.history),
    }, modelProvider);

    const responsePayload: Record<string, any> = {
      success: true,
      answer: result.answer,
      toolsUsed: result.toolsUsed,
    };

    if (result.developmentProposal && admin.role === 'SUPER_ADMIN') {
      const ctx = auditCtx(req);

      const developmentJob = await createDevelopmentJob(
        {
          category: result.developmentProposal.category,
          summary: result.developmentProposal.summary,
        },
        {
          adminId: admin.id,
          adminEmail: ctx.adminEmail,
          role: admin.role,
          ipAddress: ctx.ip,
          userAgent: ctx.ua,
        },
      );

      responsePayload.developmentProposal = {
        ...result.developmentProposal,
        jobId: developmentJob.id,
        status: developmentJob.status,
      };
    }

    return res.json(responsePayload);
  } catch (error) {
    console.error('[KAVIAR_AI] Erro ao processar pergunta');

    return res.status(500).json({
      success: false,
      error: 'Não foi possível processar a pergunta.',
    });
  }
});


// ── Development Agent: listagem de jobs ativos ──────────────────────────────
router.get('/dev-jobs', requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const jobs = await prisma.development_jobs.findMany({
      where: {
        status: { in: ['AWAITING_SCOPE', 'AWAITING_CONFIRMATION', 'QUEUED', 'RUNNING'] },
      },
      orderBy: { created_at: 'desc' },
      take: 50,
      select: {
        id: true,
        category: true,
        summary: true,
        status: true,
        created_at: true,
        scope_resolved_at: true,
        confirmed_at: true,
        error_message: true,
      },
    });

    return res.json({ success: true, data: jobs });
  } catch (error) {
    console.error('[KAVIAR_AI_DEV_JOBS_LIST] Erro ao listar jobs');
    return res.status(500).json({
      success: false,
      error: 'Não foi possível listar jobs de desenvolvimento.',
    });
  }
});

// ── Development Agent: consulta de status/resultado ─────────────────────────
router.get('/dev-jobs/:id', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const ctx = auditCtx(req);

    const job = await getDevelopmentJob(
      String(req.params.id ?? ''),
      {
        adminId: admin.id,
        adminEmail: ctx.adminEmail,
        role: admin.role,
        ipAddress: ctx.ip,
        userAgent: ctx.ua,
      },
    );

    return res.json({
      success: true,
      data: {
        id: job.id,
        category: job.category,
        summary: job.summary,
        status: job.status,
        allowedPaths: job.allowed_paths,
        resultChangedPaths: job.result_changed_paths,
        resultSummary: job.result_summary,
        errorMessage: job.error_message,
        completedAt: job.completed_at,
      },
    });
  } catch (error) {
    if (error instanceof DevelopmentJobError) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        error: error.message,
      });
    }

    console.error(
      '[KAVIAR_AI_DEV_JOB_GET] Erro ao consultar job',
    );

    return res.status(500).json({
      success: false,
      code: 'DEVELOPMENT_JOB_INTERNAL_ERROR',
      error: 'Não foi possível consultar o job de desenvolvimento.',
    });
  }
});

// ── Development Agent: confirmação humana ───────────────────────────────────
router.post('/dev-jobs/:id/confirm', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const ctx = auditCtx(req);

    const job = await confirmDevelopmentJob(
      String(req.params.id ?? ''),
      {
        adminId: admin.id,
        adminEmail: ctx.adminEmail,
        role: admin.role,
        ipAddress: ctx.ip,
        userAgent: ctx.ua,
      },
    );

    return res.json({
      success: true,
      data: {
        id: job.id,
        category: job.category,
        summary: job.summary,
        status: job.status,
        requestedByAdminId: job.requested_by_admin_id,
        confirmedByAdminId: job.confirmed_by_admin_id,
        confirmedAt: job.confirmed_at,
      },
    });
  } catch (error) {
    if (error instanceof DevelopmentJobError) {
      return res.status(error.statusCode).json({
        success: false,
        code: error.code,
        error: error.message,
      });
    }

    console.error('[KAVIAR_AI_DEV_JOB_CONFIRM] Erro ao confirmar job');

    return res.status(500).json({
      success: false,
      code: 'DEVELOPMENT_JOB_INTERNAL_ERROR',
      error: 'Não foi possível confirmar o job de desenvolvimento.',
    });
  }
});

// ── Territorial: Pesquisa regulatória ────────────────────────────────────────
router.post('/territory/regulatory-search', allowExecutiveRegulatorySearch, async (req: Request, res: Response) => {
  const city = req.body?.city ?? '';
  const uf = req.body?.uf ?? '';
  const model = process.env.KAVIAR_AI_MODEL || 'gpt-5.4-mini';

  const logCity = String(city).replace(/[\n\r]/g, '').slice(0, 60);
  const logUf = String(uf).replace(/[\n\r]/g, '').slice(0, 2);
  const logModel = String(model).replace(/[\n\r]/g, '').slice(0, 30);

  console.log(`[REGULATORY_SEARCH_START] city=${logCity} uf=${logUf} model=${logModel}`);

  try {
    if (!city || !uf) {
      return res.status(400).json({ success: false, code: 'REGULATORY_SEARCH_INVALID_INPUT', error: 'city e uf são obrigatórios.' });
    }
    const result = await startRegulatorySearch(city, uf);
    console.log(`[REGULATORY_SEARCH_INITIATED] city=${logCity} uf=${logUf} responseId=${result.responseId} status=${result.status}`);
    return res.status(202).json({ success: true, data: { responseId: result.responseId, status: result.status } });
  } catch (error: any) {
    const errName = error?.name || 'UnknownError';
    const errMsg = (error?.message || '').replace(/[\n\r]/g, ' ').slice(0, 200);
    console.error(`[REGULATORY_SEARCH_ERROR] city=${logCity} uf=${logUf} name=${errName} message=${errMsg}`);
    const classified = classifyRegulatorySearchError(error);
    return res.status(classified.httpStatus).json({ success: false, code: classified.code, error: classified.publicMessage });
  }
});

const RESPONSE_ID_PATTERN = /^resp_[a-zA-Z0-9]{20,80}$/;

router.get('/territory/regulatory-search/:responseId', allowExecutiveRegulatorySearch, async (req: Request, res: Response) => {
  const { responseId } = req.params;

  if (!responseId || !RESPONSE_ID_PATTERN.test(responseId)) {
    return res.status(400).json({ success: false, code: 'REGULATORY_SEARCH_INVALID_INPUT', error: 'responseId inválido.' });
  }

  try {
    const result = await retrieveRegulatorySearch(responseId);

    if (result.status === 'queued' || result.status === 'in_progress') {
      return res.status(202).json({ success: true, data: { responseId, status: result.status } });
    }

    // completed
    console.log(`[REGULATORY_SEARCH_COMPLETED] responseId=${responseId} confidence=${result.result!.confidence} sources=${result.result!.officialSources.length}`);
    return res.json({ success: true, data: result.result });
  } catch (error: any) {
    const errMsg = (error?.message || '').replace(/[\n\r]/g, ' ').slice(0, 200);
    console.error(`[REGULATORY_SEARCH_RETRIEVE_ERROR] responseId=${responseId} message=${errMsg}`);
    const classified = classifyRegulatorySearchError(error);
    return res.status(classified.httpStatus).json({ success: false, code: classified.code, error: classified.publicMessage });
  }
});


// ── Motoristas: prontidão + aprovação/rejeição via Chat KAVIAR ─────────────
router.get('/drivers/:id/readiness', allowExecutiveReadAccess, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const driver = await prisma.drivers.findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        error: 'Motorista não encontrado.',
      });
    }

    const adminService = new AdminService();
    const readiness = await adminService.getDriverApprovalReadiness(id);

    const statusAllowsApproval =
      driver.status === 'pending' || driver.status === 'needs_documents';

    return res.json({
      success: true,
      data: {
        driver,
        ...readiness,
        canApprove: readiness.isEligible && statusAllowsApproval,
        statusAllowsApproval,
        blockingReason: statusAllowsApproval
          ? null
          : 'Apenas motoristas pendentes podem ser aprovados.',
      },
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error?.message || 'Erro ao consultar prontidão do motorista.',
    });
  }
});

router.post('/drivers/:id/approve', allowExecutiveConfirmedAction, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { confirmation } = req.body;

    if (confirmation !== 'APROVAR_MOTORISTA') {
      return res.status(400).json({
        success: false,
        error: 'Confirmação APROVAR_MOTORISTA obrigatória.',
      });
    }

    const ctx = auditCtx(req);
    const adminService = new AdminService();
    const driver = await adminService.approveDriver(id, ctx.adminId);

    audit({
      adminId: ctx.adminId,
      adminEmail: ctx.adminEmail,
      action: 'approve_driver',
      entityType: 'driver',
      entityId: id,
      newValue: {
        status: 'approved',
        source: 'chat_kaviar',
      },
      ipAddress: ctx.ip,
    });

    return res.json({
      success: true,
      data: {
        id: driver.id,
        name: driver.name,
        status: driver.status,
      },
      message: 'Motorista aprovado com sucesso.',
    });
  } catch (error: any) {
    if (error?.code === 'DRIVER_INCOMPLETE') {
      return res.status(400).json({
        success: false,
        error: 'DRIVER_INCOMPLETE',
        message: 'Motorista possui documentos obrigatórios pendentes.',
        missingRequirements: error?.missingRequirements || [],
        details: error?.details || {},
      });
    }

    return res.status(400).json({
      success: false,
      error: error?.message || 'Erro ao aprovar motorista.',
    });
  }
});

router.post('/drivers/:id/reject', allowExecutiveConfirmedAction, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { confirmation, reason } = req.body;

    if (confirmation !== 'REJEITAR_MOTORISTA') {
      return res.status(400).json({
        success: false,
        error: 'Confirmação REJEITAR_MOTORISTA obrigatória.',
      });
    }

    if (!reason || typeof reason !== 'string' || !reason.trim()) {
      return res.status(400).json({
        success: false,
        error: 'Motivo da rejeição é obrigatório.',
      });
    }

    const existing = await prisma.drivers.findUnique({
      where: { id },
      select: { id: true, name: true, status: true },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Motorista não encontrado.',
      });
    }

    if (!['pending', 'needs_documents'].includes(existing.status)) {
      return res.status(400).json({
        success: false,
        error: 'Apenas motoristas pendentes podem ser rejeitados por este fluxo.',
      });
    }

    const ctx = auditCtx(req);

    const updated = await prisma.drivers.updateMany({
      where: {
        id,
        status: { in: ['pending', 'needs_documents'] },
      },
      data: {
        status: 'rejected',
        rejected_at: new Date(),
        rejected_by: ctx.adminId,
        rejected_reason: reason.trim(),
        approved_at: null,
        approved_by: null,
        updated_at: new Date(),
      },
    });

    if (updated.count !== 1) {
      return res.status(409).json({
        success: false,
        error: 'O status do motorista mudou. Atualize a consulta antes de rejeitar.',
      });
    }

    const driver = await prisma.drivers.findUniqueOrThrow({
      where: { id },
      select: { id: true, name: true, status: true },
    });

    audit({
      adminId: ctx.adminId,
      adminEmail: ctx.adminEmail,
      action: 'reject_driver',
      entityType: 'driver',
      entityId: id,
      newValue: {
        status: 'rejected',
        reason: reason.trim(),
        source: 'chat_kaviar',
      },
      ipAddress: ctx.ip,
    });

    return res.json({
      success: true,
      data: {
        id: driver.id,
        name: driver.name,
        status: driver.status,
      },
      message: 'Motorista rejeitado.',
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error?.message || 'Erro ao rejeitar motorista.',
    });
  }
});

// ── Territorial: Criar território em planning ────────────────────────────────
router.post('/territory/create', allowExecutiveConfirmedAction, async (req: Request, res: Response) => {
  try {
    const { city, uf, confirmation } = req.body;

    if (confirmation !== 'CRIAR_TERRITORIO') {
      return res.status(400).json({
        success: false,
        error: 'Confirmação CRIAR_TERRITORIO obrigatória.',
      });
    }

    if (!city || !uf || typeof city !== 'string' || typeof uf !== 'string' || uf.trim().length !== 2) {
      return res.status(400).json({ success: false, error: 'city e uf (2 letras) são obrigatórios.' });
    }

    const normalizedCity = city.trim();
    const normalizedUf = uf.trim().toUpperCase();

    // Bloquear duplicidade
    const existing = await prisma.operational_territories.findFirst({
      where: { city_name: { equals: normalizedCity, mode: 'insensitive' }, uf: normalizedUf, level: 'city' },
    });
    if (existing) {
      return res.status(409).json({ success: false, error: `Território ${normalizedCity}/${normalizedUf} já existe.`, territoryId: existing.id });
    }

    const territory = await prisma.operational_territories.create({
      data: {
        name: `${normalizedCity} — ${normalizedUf}`,
        level: 'city',
        status: 'planning',
        uf: normalizedUf,
        city_name: normalizedCity,
        is_active: false,
      },
    });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'create_territory', entityType: 'territory', entityId: territory.id, newValue: { name: territory.name, status: 'planning', source: 'chat_kaviar' }, ipAddress: ctx.ip });

    return res.status(201).json({ success: true, data: { id: territory.id, name: territory.name, status: territory.status } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'Erro ao criar território.' });
  }
});

// ── Territorial: Cadastrar gestor ────────────────────────────────────────────
router.post('/territory/create-manager', requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const { name, email, territory_id } = req.body;
    if (!name || !email || !territory_id) {
      return res.status(400).json({ success: false, error: 'name, email e territory_id são obrigatórios.' });
    }

    const existingEmail = await prisma.admins.findUnique({ where: { email: email.toLowerCase() } });
    if (existingEmail) {
      return res.status(409).json({ success: false, error: 'Email já cadastrado.' });
    }

    const territory = await prisma.operational_territories.findUnique({ where: { id: territory_id } });
    if (!territory) {
      return res.status(400).json({ success: false, error: 'Território não encontrado.' });
    }

    // Senha temporária segura via crypto.randomBytes
    const tempPassword = generateSecurePassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 12);

    const result = await prisma.$transaction(async (tx) => {
      const admin = await tx.admins.create({
        data: {
          name,
          email: email.toLowerCase(),
          password: hashedPassword,
          role: 'TERRITORIAL_MANAGER',
          is_active: true,
          must_change_password: true,
        },
      });
      await tx.admin_territory_access.create({
        data: { admin_id: admin.id, territory_id, access_level: 'full' },
      });
      await tx.operator_profiles.create({
        data: {
          admin_id: admin.id,
          territory_id,
          display_name: name,
          relationship_type: 'territorial_manager',
          recipient_type: 'individual',
          contract_status: 'pending',
          document_status: 'pending',
          is_active: false,
        },
      });
      await tx.territory_manager_assignments.create({
        data: {
          territory_id,
          admin_id: admin.id,
          // New territorial managers start in pre-production.
          // Financial participation only begins after explicit production activation.
          status: 'pending_approval',
          started_at: new Date(),
          created_by: (req as any).admin.id,
        },
      });
      return admin;
    });

    const ctx = auditCtx(req);
    audit({ adminId: ctx.adminId, adminEmail: ctx.adminEmail, action: 'create_regional_admin', entityType: 'admin', entityId: result.id, newValue: { name, email, territory: territory.name, source: 'chat_kaviar' }, ipAddress: ctx.ip });

    return res.status(201).json({
      success: true,
      data: {
        id: result.id,
        name: result.name,
        email: result.email,
        role: result.role,
        territory: territory.name,
        temp_password: tempPassword,
        status: {
          conta: 'concluída',
          territorio: 'concluído',
          perfil: 'pendente',
          contrato: 'pendente',
          documentos: 'pendente',
        },
      },
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'Erro ao cadastrar gestor.' });
  }
});


// ── Territorial: Liberar landing de motoristas ──────────────────────────────
router.post('/territory/landing/enable', allowExecutiveConfirmedAction, async (req: Request, res: Response) => {
  try {
    const { city, uf, confirmation } = req.body;

    // Dupla trava: conversa nunca escreve sozinha.
    if (confirmation !== 'LIBERAR_LANDING') {
      return res.status(400).json({
        success: false,
        error: 'Confirmação LIBERAR_LANDING obrigatória.',
      });
    }

    if (
      !city ||
      !uf ||
      typeof city !== 'string' ||
      typeof uf !== 'string' ||
      uf.trim().length !== 2
    ) {
      return res.status(400).json({
        success: false,
        error: 'city e uf (2 letras) são obrigatórios.',
      });
    }

    const normalizedCity = city.trim();
    const normalizedUf = uf.trim().toUpperCase();

    // A landing só pode ser liberada para um território já cadastrado.
    const territory = await prisma.operational_territories.findFirst({
      where: {
        city_name: { equals: normalizedCity, mode: 'insensitive' },
        uf: normalizedUf,
        level: 'city',
      },
    });

    if (!territory) {
      return res.status(404).json({
        success: false,
        error: `Território ${normalizedCity}/${normalizedUf} não encontrado.`,
      });
    }

    const canonicalCity = territory.city_name || normalizedCity;
    const canonicalUf = territory.uf || normalizedUf;
    const slug = toCityLandingSlug(canonicalCity, canonicalUf);

    const existing = await prisma.driver_city_landings.findFirst({
      where: {
        OR: [
          { slug },
          {
            city: { equals: canonicalCity, mode: 'insensitive' },
            state: canonicalUf,
          },
        ],
      },
    });

    const adminId = (req as any).admin.id;
    const alreadyEnabled = existing?.landing_enabled === true;

    const landing = existing
      ? await prisma.driver_city_landings.update({
          where: { id: existing.id },
          data: {
            landing_enabled: true,
            updated_by_admin_id: adminId,
          },
        })
      : await prisma.driver_city_landings.create({
          data: {
            city: canonicalCity,
            state: canonicalUf,
            slug,
            public_status: 'IMPLANTACAO',
            landing_enabled: true,
            created_by_admin_id: adminId,
            updated_by_admin_id: adminId,
          },
        });

    const ctx = auditCtx(req);
    audit({
      adminId: ctx.adminId,
      adminEmail: ctx.adminEmail,
      action: 'enable_driver_city_landing',
      entityType: 'driver_city_landing',
      entityId: landing.id,
      newValue: {
        city: landing.city,
        state: landing.state,
        slug: landing.slug,
        landing_enabled: true,
        source: 'chat_kaviar',
      },
      ipAddress: ctx.ip,
    });

    return res.status(existing ? 200 : 201).json({
      success: true,
      data: {
        id: landing.id,
        city: landing.city,
        state: landing.state,
        slug: landing.slug,
        public_status: landing.public_status,
        landing_enabled: landing.landing_enabled,
        already_enabled: alreadyEnabled,
        url: `https://kaviar.com.br/motorista/cidade/${landing.slug}`,
      },
    });
  } catch (error: any) {
    console.error('[KAVIAR_AI_LANDING_ENABLE]', error?.message || error);
    return res.status(500).json({
      success: false,
      error: 'Erro ao liberar landing.',
    });
  }
});


// ── Territorial: Governança da cobertura territorial ────────────────────────

type CoverageScopeStats = {
  official_neighborhoods: number;
  valid_geofences: number;
  verified_neighborhoods: number;
};

async function getCoverageScopeStats(
  db: Pick<typeof prisma, '$queryRaw'>,
  territory: {
    id: string;
    level: string;
    city_name: string | null;
    name: string;
    uf: string | null;
  }
): Promise<CoverageScopeStats> {
  if (territory.level === 'region') {
    const rows = await db.$queryRaw<Array<CoverageScopeStats>>`
      SELECT
        COUNT(*)::int AS official_neighborhoods,
        COUNT(*) FILTER (
          WHERE ng.geom IS NOT NULL
            AND ST_IsValid(ng.geom)
            AND ST_SRID(ng.geom) = 4326
        )::int AS valid_geofences,
        COUNT(*) FILTER (
          WHERE n.is_verified = true
            AND n.verified_at IS NOT NULL
            AND n.verified_at <= NOW()
            AND NULLIF(BTRIM(n.verified_by), '') IS NOT NULL
        )::int AS verified_neighborhoods
      FROM neighborhoods n
      LEFT JOIN neighborhood_geofences ng
        ON ng.neighborhood_id = n.id
      WHERE n.is_active = true
        AND n.area_type = 'BAIRRO_OFICIAL'
        AND n.territory_id = ${territory.id}
    `;

    return rows[0] ?? {
      official_neighborhoods: 0,
      valid_geofences: 0,
      verified_neighborhoods: 0,
    };
  }

  const canonicalCity = territory.city_name || territory.name;

  const rows = await db.$queryRaw<Array<CoverageScopeStats>>`
    SELECT
      COUNT(*)::int AS official_neighborhoods,
      COUNT(*) FILTER (
        WHERE ng.geom IS NOT NULL
          AND ST_IsValid(ng.geom)
          AND ST_SRID(ng.geom) = 4326
      )::int AS valid_geofences,
      COUNT(*) FILTER (
        WHERE n.is_verified = true
          AND n.verified_at IS NOT NULL
          AND n.verified_at <= NOW()
          AND NULLIF(BTRIM(n.verified_by), '') IS NOT NULL
      )::int AS verified_neighborhoods
    FROM neighborhoods n
    LEFT JOIN neighborhood_geofences ng
      ON ng.neighborhood_id = n.id
    WHERE n.is_active = true
      AND n.area_type = 'BAIRRO_OFICIAL'
      AND (
        n.territory_id = ${territory.id}

        OR n.territory_id IN (
          SELECT child.id
          FROM operational_territories child
          WHERE child.parent_id = ${territory.id}
            AND child.level = 'region'
        )

        OR (
          n.territory_id IS NULL
          AND LOWER(n.city) = LOWER(${canonicalCity})
          AND (
            SELECT COUNT(DISTINCT UPPER(same_city.uf))
            FROM operational_territories same_city
            WHERE same_city.level = 'city'
              AND LOWER(
                COALESCE(same_city.city_name, same_city.name)
              ) = LOWER(${canonicalCity})
          ) = 1
        )
      )
  `;

  return rows[0] ?? {
    official_neighborhoods: 0,
    valid_geofences: 0,
    verified_neighborhoods: 0,
  };
}

async function resolveCoverageTerritory(input: {
  territoryId?: unknown;
  city?: unknown;
  uf?: unknown;
}) {
  const explicitTerritoryId =
    typeof input.territoryId === 'string'
      ? input.territoryId.trim()
      : '';

  if (explicitTerritoryId) {
    const territory = await prisma.operational_territories.findUnique({
      where: { id: explicitTerritoryId },
      include: { parent: true },
    });

    if (!territory) return null;

    if (!['city', 'region'].includes(territory.level)) {
      throw Object.assign(
        new Error('A cobertura só pode ser governada em nível city ou region.'),
        { statusCode: 422, code: 'COVERAGE_SCOPE_LEVEL_UNSUPPORTED' }
      );
    }

    if (territory.level === 'region') {
      if (territory.is_active !== true || territory.status !== 'active') {
        throw Object.assign(
          new Error('Região precisa estar ativa para governança de cobertura.'),
          { statusCode: 409, code: 'COVERAGE_REGION_INACTIVE' }
        );
      }

      if (
        !territory.parent ||
        territory.parent.level !== 'city' ||
        territory.parent.is_active !== true ||
        territory.parent.status !== 'active'
      ) {
        throw Object.assign(
          new Error('Região precisa ter município-pai ativo e inequívoco.'),
          { statusCode: 409, code: 'COVERAGE_REGION_PARENT_INVALID' }
        );
      }

      const parentCity =
        (territory.parent.city_name || territory.parent.name).trim();
      const regionCity = territory.city_name?.trim() || '';
      const regionUf = territory.uf?.trim().toUpperCase() || '';
      const parentUf = territory.parent.uf?.trim().toUpperCase() || '';

      if (
        !regionCity ||
        regionCity.toLocaleLowerCase('pt-BR') !==
          parentCity.toLocaleLowerCase('pt-BR') ||
        !regionUf ||
        !parentUf ||
        regionUf !== parentUf
      ) {
        throw Object.assign(
          new Error(
            'Identidade municipal da região precisa coincidir com o município-pai.'
          ),
          { statusCode: 409, code: 'COVERAGE_REGION_CITY_IDENTITY_INVALID' }
        );
      }
    }

    return territory;
  }

  const city =
    typeof input.city === 'string'
      ? input.city.trim()
      : '';
  const uf =
    typeof input.uf === 'string'
      ? input.uf.trim().toUpperCase()
      : '';

  if (!city || uf.length !== 2) {
    throw Object.assign(
      new Error('city e uf (2 letras) são obrigatórios quando territory_id não é informado.'),
      { statusCode: 400, code: 'COVERAGE_SCOPE_REQUIRED' }
    );
  }

  return prisma.operational_territories.findFirst({
    where: {
      level: 'city',
      uf,
      OR: [
        {
          city_name: {
            equals: city,
            mode: 'insensitive',
          },
        },
        {
          name: {
            equals: city,
            mode: 'insensitive',
          },
        },
      ],
    },
    orderBy: [
      { is_active: 'desc' },
      { created_at: 'desc' },
    ],
    include: { parent: true },
  });
}

router.get(
  '/territory/coverage/:territoryId/readiness',
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const territory = await resolveCoverageTerritory({
        territoryId: req.params.territoryId,
      });

      if (!territory) {
        return res.status(404).json({
          success: false,
          error: 'Território não encontrado.',
        });
      }

      if (!isCoverageStatus(territory.coverage_status)) {
        return res.status(409).json({
          success: false,
          error: 'Estado atual da cobertura territorial é inválido.',
        });
      }

      const stats = await getCoverageScopeStats(prisma, territory);

      const neighborhoods =
        territory.level === 'region'
          ? await prisma.neighborhoods.findMany({
              where: {
                territory_id: territory.id,
                is_active: true,
                area_type: 'BAIRRO_OFICIAL',
              },
              orderBy: { name: 'asc' },
              select: {
                id: true,
                name: true,
                is_verified: true,
                verified_at: true,
                verified_by: true,
              },
            })
          : [];

      return res.json({
        success: true,
        data: {
          territory_id: territory.id,
          territory_name: territory.name,
          territory_level: territory.level,
          city: territory.city_name || territory.parent?.city_name || territory.name,
          uf: territory.uf || territory.parent?.uf || null,
          coverage_status: territory.coverage_status,
          coverage_reviewed_at: territory.coverage_reviewed_at,
          coverage_reviewed_by: territory.coverage_reviewed_by,
          ...stats,
          can_submit_review:
            stats.official_neighborhoods > 0 &&
            stats.valid_geofences === stats.official_neighborhoods,
          can_complete:
            stats.official_neighborhoods > 0 &&
            stats.valid_geofences === stats.official_neighborhoods &&
            stats.verified_neighborhoods === stats.official_neighborhoods,
          neighborhoods,
        },
      });
    } catch (error: any) {
      const statusCode =
        Number.isInteger(error?.statusCode) ? error.statusCode : 500;

      return res.status(statusCode).json({
        success: false,
        code: error?.code,
        error:
          statusCode === 500
            ? 'Erro ao consultar prontidão da cobertura territorial.'
            : error.message,
      });
    }
  }
);

router.patch(
  '/territory/neighborhoods/:id/review',
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const neighborhoodId = String(req.params.id || '').trim();
      const {
        territory_id,
        expected_verified,
        verified,
        confirmation,
        notes,
      } = req.body ?? {};

      if (
        !neighborhoodId ||
        typeof territory_id !== 'string' ||
        !territory_id.trim() ||
        typeof expected_verified !== 'boolean' ||
        typeof verified !== 'boolean'
      ) {
        return res.status(400).json({
          success: false,
          error:
            'territory_id, expected_verified e verified são obrigatórios.',
        });
      }

      if (expected_verified === verified) {
        return res.status(409).json({
          success: false,
          code: 'NEIGHBORHOOD_REVIEW_INVALID_TRANSITION',
          error: 'A revisão precisa alterar o estado atual do bairro.',
        });
      }

      const requiredConfirmation = verified
        ? 'VERIFICAR_BAIRRO_GEOFENCE'
        : 'REABRIR_BAIRRO_GEOFENCE';

      if (confirmation !== requiredConfirmation) {
        return res.status(400).json({
          success: false,
          error: `Confirmação ${requiredConfirmation} obrigatória.`,
        });
      }

      const normalizedNotes =
        typeof notes === 'string' ? notes.trim() : '';

      if (normalizedNotes.length > 1000) {
        return res.status(400).json({
          success: false,
          error: 'notes deve ter no máximo 1000 caracteres.',
        });
      }

      if (!verified && !normalizedNotes) {
        return res.status(400).json({
          success: false,
          error: 'Motivo obrigatório para reabrir a revisão do bairro.',
        });
      }

      const ctx = auditCtx(req);
      const normalizedTerritoryId = territory_id.trim();

      const result = await prisma.$transaction(async (tx) => {
        // Serialize neighborhood review with regional COMPLETE/reopen decisions.
        await lockCareAdminRow(tx, 'territory', normalizedTerritoryId);
        await lockCareAdminRow(tx, 'neighborhood', neighborhoodId);

        const [territory, neighborhood] = await Promise.all([
          tx.operational_territories.findUnique({
            where: { id: normalizedTerritoryId },
          }),
          tx.neighborhoods.findUnique({
            where: { id: neighborhoodId },
          }),
        ]);

        if (!territory) {
          throw Object.assign(new Error('Território não encontrado.'), {
            statusCode: 404,
            code: 'COVERAGE_TERRITORY_NOT_FOUND',
          });
        }

        if (!neighborhood) {
          throw Object.assign(new Error('Bairro não encontrado.'), {
            statusCode: 404,
            code: 'NEIGHBORHOOD_NOT_FOUND',
          });
        }

        if (
          neighborhood.is_active !== true ||
          neighborhood.area_type !== 'BAIRRO_OFICIAL'
        ) {
          throw Object.assign(
            new Error('Somente bairro oficial ativo pode ser revisado.'),
            { statusCode: 422, code: 'NEIGHBORHOOD_NOT_REVIEWABLE' }
          );
        }

        if (
          neighborhood.territory_id !== normalizedTerritoryId ||
          !['city', 'region'].includes(territory.level)
        ) {
          throw Object.assign(
            new Error('Bairro não pertence ao território informado.'),
            { statusCode: 409, code: 'NEIGHBORHOOD_TERRITORY_MISMATCH' }
          );
        }

        if (
          territory.is_active !== true ||
          territory.status !== 'active'
        ) {
          throw Object.assign(
            new Error('Território do bairro precisa estar ativo.'),
            { statusCode: 409, code: 'NEIGHBORHOOD_TERRITORY_INACTIVE' }
          );
        }

        if (territory.coverage_status !== 'AWAITING_REVIEW') {
          throw Object.assign(
            new Error(
              'A cobertura do território precisa estar em AWAITING_REVIEW para revisar bairros.'
            ),
            { statusCode: 409, code: 'COVERAGE_NOT_AWAITING_REVIEW' }
          );
        }

        if (neighborhood.is_verified !== expected_verified) {
          throw Object.assign(
            new Error(
              'O estado de revisão do bairro mudou. Consulte novamente antes de confirmar.'
            ),
            {
              statusCode: 409,
              code: 'NEIGHBORHOOD_REVIEW_CONFLICT',
              currentVerified: neighborhood.is_verified,
            }
          );
        }

        let geofenceEvidence: {
          id: string;
          source: string | null;
          has_geom: boolean;
          geom_valid: boolean;
          srid: number | null;
        } | null = null;

        if (verified) {
          const geofenceRows = await tx.$queryRaw<Array<{
            id: string;
            source: string | null;
            has_geom: boolean;
            geom_valid: boolean;
            srid: number | null;
          }>>`
            SELECT
              ng.id,
              ng.source,
              (ng.geom IS NOT NULL) AS has_geom,
              CASE
                WHEN ng.geom IS NOT NULL THEN ST_IsValid(ng.geom)
                ELSE false
              END AS geom_valid,
              CASE
                WHEN ng.geom IS NOT NULL THEN ST_SRID(ng.geom)
                ELSE NULL
              END AS srid
            FROM neighborhood_geofences ng
            WHERE ng.neighborhood_id = ${neighborhood.id}
            LIMIT 1
          `;

          geofenceEvidence = geofenceRows[0] ?? null;

          if (
            !geofenceEvidence ||
            geofenceEvidence.has_geom !== true ||
            geofenceEvidence.geom_valid !== true ||
            geofenceEvidence.srid !== 4326 ||
            !geofenceEvidence.source?.trim()
          ) {
            throw Object.assign(
              new Error(
                'Geofence do bairro precisa existir, ser válida, usar SRID 4326 e ter fonte identificada.'
              ),
              {
                statusCode: 422,
                code: 'NEIGHBORHOOD_GEOFENCE_NOT_VERIFIABLE',
              }
            );
          }
        }

        const verifiedAt = verified ? new Date() : null;
        const verifiedBy = verified ? ctx.adminId : null;

        const changed = await tx.neighborhoods.updateMany({
          where: {
            id: neighborhood.id,
            territory_id: normalizedTerritoryId,
            is_active: true,
            area_type: 'BAIRRO_OFICIAL',
            is_verified: expected_verified,
          },
          data: {
            is_verified: verified,
            verified_at: verifiedAt,
            verified_by: verifiedBy,
            updated_at: new Date(),
          },
        });

        if (changed.count !== 1) {
          throw new CareAdminConflict('NEIGHBORHOOD_REVIEW_CONFLICT');
        }

        await writeCareAdminAuditTx(tx, {
          adminId: ctx.adminId,
          action: verified
            ? 'territory_neighborhood_geofence_verify'
            : 'territory_neighborhood_geofence_reopen',
          entityType: 'neighborhood',
          entityId: neighborhood.id,
          oldValue: {
            is_verified: neighborhood.is_verified,
            verified_at: neighborhood.verified_at,
            verified_by: neighborhood.verified_by,
          },
          newValue: {
            is_verified: verified,
            verified_at: verifiedAt,
            verified_by: verifiedBy,
            territory_id: neighborhood.territory_id,
            territory_level: territory.level,
            geofence_id: geofenceEvidence?.id ?? null,
            geofence_source: geofenceEvidence?.source ?? null,
            source: 'chat_kaviar',
          },
          reason: normalizedNotes || undefined,
          ipAddress: ctx.ip,
          userAgent: ctx.ua,
        });

        return {
          id: neighborhood.id,
          name: neighborhood.name,
          territory_id: neighborhood.territory_id,
          territory_level: territory.level,
          is_verified: verified,
          verified_at: verifiedAt,
          verified_by: verifiedBy,
          geofence_id: geofenceEvidence?.id ?? null,
          geofence_source: geofenceEvidence?.source ?? null,
        };
      });

      return res.json({ success: true, data: result });
    } catch (error: any) {
      if (error instanceof CareAdminConflict) {
        return res.status(409).json({
          success: false,
          code: error.code,
          error: error.code,
        });
      }

      const statusCode =
        Number.isInteger(error?.statusCode) ? error.statusCode : 500;

      console.error(
        '[KAVIAR_AI_NEIGHBORHOOD_REVIEW]',
        error?.message || error
      );

      return res.status(statusCode).json({
        success: false,
        code: error?.code,
        current_verified: error?.currentVerified,
        error:
          statusCode === 500
            ? 'Erro ao revisar bairro/geofence.'
            : error.message,
      });
    }
  }
);


router.post(
  '/territory/coverage/status',
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const {
        territory_id,
        city,
        uf,
        expected_status,
        target_status,
        confirmation,
        notes,
      } = req.body ?? {};

      if (
        !isCoverageStatus(expected_status) ||
        !isCoverageStatus(target_status)
      ) {
        return res.status(400).json({
          success: false,
          error: 'expected_status e target_status são obrigatórios e válidos.',
        });
      }

      const normalizedNotes =
        typeof notes === 'string' ? notes.trim() : '';

      if (normalizedNotes.length > 1000) {
        return res.status(400).json({
          success: false,
          error: 'notes deve ter no máximo 1000 caracteres.',
        });
      }

      const territory = await resolveCoverageTerritory({
        territoryId: territory_id,
        city,
        uf,
      });

      if (!territory) {
        return res.status(404).json({
          success: false,
          error: 'Território não encontrado.',
        });
      }

      const ctx = auditCtx(req);

      const result = await prisma.$transaction(async (tx) => {
        // Serializes regional status changes with neighborhood review writes.
        await lockCareAdminRow(tx, 'territory', territory.id);

        const lockedTerritory =
          await tx.operational_territories.findUnique({
            where: { id: territory.id },
            include: { parent: true },
          });

        if (!lockedTerritory) {
          throw Object.assign(new Error('Território não encontrado.'), {
            statusCode: 404,
            code: 'COVERAGE_TERRITORY_NOT_FOUND',
          });
        }

        if (!isCoverageStatus(lockedTerritory.coverage_status)) {
          throw Object.assign(
            new Error('Estado atual da cobertura territorial é inválido.'),
            { statusCode: 409, code: 'COVERAGE_STATUS_INVALID' }
          );
        }

        const currentStatus = lockedTerritory.coverage_status;

        if (currentStatus !== expected_status) {
          throw Object.assign(
            new Error(
              `A cobertura mudou de ${expected_status} para ${currentStatus}. Consulte novamente antes de confirmar.`
            ),
            {
              statusCode: 409,
              code: 'COVERAGE_STATUS_CONFLICT',
              currentStatus,
            }
          );
        }

        const transition = resolveCoverageTransition(
          currentStatus,
          target_status
        );

        if (!transition) {
          throw Object.assign(
            new Error(
              `Transição de ${currentStatus} para ${target_status} não permitida.`
            ),
            { statusCode: 409, code: 'COVERAGE_INVALID_TRANSITION' }
          );
        }

        if (confirmation !== transition.confirmation) {
          throw Object.assign(
            new Error(
              `Confirmação ${transition.confirmation} obrigatória.`
            ),
            { statusCode: 400, code: 'COVERAGE_CONFIRMATION_REQUIRED' }
          );
        }

        if (transition.requiresReason && !normalizedNotes) {
          throw Object.assign(
            new Error(
              'Motivo obrigatório para reabrir uma cobertura homologada.'
            ),
            { statusCode: 400, code: 'COVERAGE_REOPEN_REASON_REQUIRED' }
          );
        }

        const stats = await getCoverageScopeStats(
          tx as Pick<typeof prisma, '$queryRaw'>,
          lockedTerritory
        );

        const requiresLoadedCoverage =
          (
            currentStatus === 'NOT_LOADED' &&
            target_status === 'AWAITING_REVIEW'
          ) ||
          target_status === 'COMPLETE';

        if (
          requiresLoadedCoverage &&
          stats.official_neighborhoods === 0
        ) {
          throw Object.assign(
            new Error(
              'Não é possível revisar/homologar cobertura sem bairros oficiais ativos.'
            ),
            {
              statusCode: 422,
              code: 'COVERAGE_WITHOUT_OFFICIAL_NEIGHBORHOODS',
            }
          );
        }

        if (
          lockedTerritory.level === 'region' &&
          requiresLoadedCoverage &&
          stats.valid_geofences !== stats.official_neighborhoods
        ) {
          throw Object.assign(
            new Error(
              'Todos os bairros oficiais ativos da região precisam ter geofence válida em SRID 4326.'
            ),
            {
              statusCode: 422,
              code: 'COVERAGE_GEOFENCE_INCOMPLETE',
              stats,
            }
          );
        }

        if (
          lockedTerritory.level === 'region' &&
          target_status === 'COMPLETE' &&
          stats.verified_neighborhoods !== stats.official_neighborhoods
        ) {
          throw Object.assign(
            new Error(
              'Todos os bairros oficiais ativos da região precisam estar revisados antes da homologação.'
            ),
            {
              statusCode: 422,
              code: 'COVERAGE_REVIEW_INCOMPLETE',
              stats,
            }
          );
        }

        const nextNotes = resolveCoverageNotes(
          lockedTerritory.coverage_notes,
          normalizedNotes
        );

        const reviewedAt =
          target_status === 'COMPLETE' ? new Date() : null;

        const reviewedBy =
          target_status === 'COMPLETE' ? ctx.adminId : null;

        const changed =
          await tx.operational_territories.updateMany({
            where: {
              id: lockedTerritory.id,
              coverage_status: expected_status,
            },
            data: {
              coverage_status: target_status,
              coverage_reviewed_at: reviewedAt,
              coverage_reviewed_by: reviewedBy,
              coverage_notes: nextNotes,
            },
          });

        if (changed.count !== 1) {
          throw new CareAdminConflict('COVERAGE_STATUS_CONFLICT');
        }

        await writeCareAdminAuditTx(tx, {
          adminId: ctx.adminId,
          action: transition.auditAction,
          entityType: 'operational_territory',
          entityId: lockedTerritory.id,
          oldValue: {
            coverage_status: currentStatus,
            coverage_reviewed_at:
              lockedTerritory.coverage_reviewed_at,
            coverage_reviewed_by:
              lockedTerritory.coverage_reviewed_by,
            coverage_notes: lockedTerritory.coverage_notes,
          },
          newValue: {
            coverage_status: target_status,
            coverage_reviewed_at: reviewedAt,
            coverage_reviewed_by: reviewedBy,
            coverage_notes: nextNotes,
            territory_level: lockedTerritory.level,
            official_neighborhoods: stats.official_neighborhoods,
            valid_geofences: stats.valid_geofences,
            verified_neighborhoods: stats.verified_neighborhoods,
            source: 'chat_kaviar',
          },
          reason: normalizedNotes || undefined,
          ipAddress: ctx.ip,
          userAgent: ctx.ua,
        });

        return {
          territory_id: lockedTerritory.id,
          territory_name: lockedTerritory.name,
          territory_level: lockedTerritory.level,
          city:
            lockedTerritory.city_name ||
            lockedTerritory.parent?.city_name ||
            lockedTerritory.name,
          uf: lockedTerritory.uf || lockedTerritory.parent?.uf || null,
          previous_status: currentStatus,
          coverage_status: target_status,
          official_neighborhoods: stats.official_neighborhoods,
          valid_geofences: stats.valid_geofences,
          verified_neighborhoods: stats.verified_neighborhoods,
          coverage_reviewed_at: reviewedAt,
          coverage_reviewed_by: reviewedBy,
          coverage_notes: nextNotes,
        };
      });

      return res.json({ success: true, data: result });
    } catch (error: any) {
      if (error instanceof CareAdminConflict) {
        return res.status(409).json({
          success: false,
          code: error.code,
          error: error.code,
        });
      }

      const statusCode =
        Number.isInteger(error?.statusCode) ? error.statusCode : 500;

      console.error(
        '[KAVIAR_AI_COVERAGE_STATUS]',
        error?.message || error
      );

      return res.status(statusCode).json({
        success: false,
        code: error?.code,
        current_status: error?.currentStatus,
        official_neighborhoods: error?.stats?.official_neighborhoods,
        valid_geofences: error?.stats?.valid_geofences,
        verified_neighborhoods: error?.stats?.verified_neighborhoods,
        error:
          statusCode === 500
            ? 'Erro ao atualizar governança da cobertura territorial.'
            : error.message,
      });
    }
  }
);


export default router;
