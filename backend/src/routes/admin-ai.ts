import { Router, Request, Response } from 'express';
import {
  authenticateAdmin,
  allowFinanceAccess,
  requireSuperAdmin,
} from '../middlewares/auth';
import { askKaviarAi } from '../services/ai/kaviar-ai.service';
import { createOpenAiProviderIfConfigured } from '../services/ai/kaviar-ai.openai-provider';
import { startRegulatorySearch, retrieveRegulatorySearch, classifyRegulatorySearchError } from '../services/ai/kaviar-ai.regulatory-search';
import { prisma } from '../lib/prisma';
import { audit, auditCtx } from '../utils/audit';
import {
  isCoverageStatus,
  resolveCoverageNotes,
  resolveCoverageTransition,
} from '../services/ai/kaviar-ai.territory-coverage-governance';
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
    }, modelProvider);

    return res.json({
      success: true,
      answer: result.answer,
      toolsUsed: result.toolsUsed,
    });
  } catch (error) {
    console.error('[KAVIAR_AI] Erro ao processar pergunta');

    return res.status(500).json({
      success: false,
      error: 'Não foi possível processar a pergunta.',
    });
  }
});

// ── Territorial: Pesquisa regulatória ────────────────────────────────────────
router.post('/territory/regulatory-search', requireSuperAdmin, async (req: Request, res: Response) => {
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

router.get('/territory/regulatory-search/:responseId', requireSuperAdmin, async (req: Request, res: Response) => {
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

// ── Territorial: Criar território em planning ────────────────────────────────
router.post('/territory/create', requireSuperAdmin, async (req: Request, res: Response) => {
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
          status: 'active',
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
router.post('/territory/landing/enable', requireSuperAdmin, async (req: Request, res: Response) => {
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
router.post(
  '/territory/coverage/status',
  requireSuperAdmin,
  async (req: Request, res: Response) => {
    try {
      const {
        city,
        uf,
        expected_status,
        target_status,
        confirmation,
        notes,
      } = req.body ?? {};

      if (
        typeof city !== 'string' ||
        typeof uf !== 'string' ||
        !city.trim() ||
        uf.trim().length !== 2
      ) {
        return res.status(400).json({
          success: false,
          error: 'city e uf (2 letras) são obrigatórios.',
        });
      }

      if (
        !isCoverageStatus(expected_status) ||
        !isCoverageStatus(target_status)
      ) {
        return res.status(400).json({
          success: false,
          error: 'expected_status e target_status são obrigatórios e válidos.',
        });
      }

      const normalizedCity = city.trim();
      const normalizedUf = uf.trim().toUpperCase();
      const normalizedNotes =
        typeof notes === 'string' ? notes.trim() : '';

      if (normalizedNotes.length > 1000) {
        return res.status(400).json({
          success: false,
          error: 'notes deve ter no máximo 1000 caracteres.',
        });
      }

      const territory = await prisma.operational_territories.findFirst({
        where: {
          level: 'city',
          uf: normalizedUf,
          OR: [
            {
              city_name: {
                equals: normalizedCity,
                mode: 'insensitive',
              },
            },
            {
              name: {
                equals: normalizedCity,
                mode: 'insensitive',
              },
            },
          ],
        },
        orderBy: [
          { is_active: 'desc' },
          { created_at: 'desc' },
        ],
      });

      if (!territory) {
        return res.status(404).json({
          success: false,
          error: `Território ${normalizedCity}/${normalizedUf} não encontrado.`,
        });
      }

      if (!isCoverageStatus(territory.coverage_status)) {
        return res.status(409).json({
          success: false,
          error: 'Estado atual da cobertura territorial é inválido.',
        });
      }

      const currentStatus = territory.coverage_status;

      // Protege confirmação feita sobre informação antiga.
      if (currentStatus !== expected_status) {
        return res.status(409).json({
          success: false,
          code: 'COVERAGE_STATUS_CONFLICT',
          error:
            `A cobertura mudou de ${expected_status} para ${currentStatus}. ` +
            'Consulte novamente antes de confirmar.',
          current_status: currentStatus,
        });
      }

      const transition = resolveCoverageTransition(
        currentStatus,
        target_status
      );

      if (!transition) {
        return res.status(409).json({
          success: false,
          code: 'COVERAGE_INVALID_TRANSITION',
          error:
            `Transição de ${currentStatus} para ${target_status} não permitida.`,
        });
      }

      if (confirmation !== transition.confirmation) {
        return res.status(400).json({
          success: false,
          error:
            `Confirmação ${transition.confirmation} obrigatória.`,
        });
      }

      if (transition.requiresReason && !normalizedNotes) {
        return res.status(400).json({
          success: false,
          error: 'Motivo obrigatório para reabrir uma cobertura homologada.',
        });
      }

      const canonicalCity = territory.city_name || normalizedCity;

      const neighborhoodRows = await prisma.$queryRaw<
        Array<{ official_neighborhoods: number }>
      >`
        SELECT COUNT(*)::int AS official_neighborhoods
        FROM neighborhoods n
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
                SELECT COUNT(*)
                FROM operational_territories same_city
                WHERE same_city.level = 'city'
                  AND LOWER(
                    COALESCE(same_city.city_name, same_city.name)
                  ) = LOWER(${canonicalCity})
              ) = 1
            )
          )
      `;

      const officialNeighborhoods =
        neighborhoodRows[0]?.official_neighborhoods ?? 0;

      const requiresLoadedCoverage =
        (
          currentStatus === 'NOT_LOADED' &&
          target_status === 'AWAITING_REVIEW'
        ) ||
        target_status === 'COMPLETE';

      if (requiresLoadedCoverage && officialNeighborhoods === 0) {
        return res.status(422).json({
          success: false,
          code: 'COVERAGE_WITHOUT_OFFICIAL_NEIGHBORHOODS',
          error:
            'Não é possível revisar/homologar cobertura sem bairros oficiais ativos.',
        });
      }

      const ctx = auditCtx(req);

      const nextNotes = resolveCoverageNotes(
        territory.coverage_notes,
        normalizedNotes
      );

      const reviewedAt =
        target_status === 'COMPLETE' ? new Date() : null;

      const reviewedBy =
        target_status === 'COMPLETE' ? ctx.adminId : null;

      // Compare-and-set: evita sobrescrever alteração concorrente.
      const changed =
        await prisma.operational_territories.updateMany({
          where: {
            id: territory.id,
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
        return res.status(409).json({
          success: false,
          code: 'COVERAGE_STATUS_CONFLICT',
          error:
            'A cobertura foi alterada por outra operação. Consulte novamente.',
        });
      }

      await audit({
        adminId: ctx.adminId,
        adminEmail: ctx.adminEmail,
        action: transition.auditAction,
        entityType: 'operational_territory',
        entityId: territory.id,
        oldValue: {
          coverage_status: currentStatus,
          coverage_reviewed_at: territory.coverage_reviewed_at,
          coverage_reviewed_by: territory.coverage_reviewed_by,
          coverage_notes: territory.coverage_notes,
        },
        newValue: {
          coverage_status: target_status,
          coverage_reviewed_at: reviewedAt,
          coverage_reviewed_by: reviewedBy,
          coverage_notes: nextNotes,
          official_neighborhoods: officialNeighborhoods,
          source: 'chat_kaviar',
        },
        reason: normalizedNotes || undefined,
        ipAddress: ctx.ip,
      });

      return res.json({
        success: true,
        data: {
          territory_id: territory.id,
          city: canonicalCity,
          uf: territory.uf || normalizedUf,
          previous_status: currentStatus,
          coverage_status: target_status,
          official_neighborhoods: officialNeighborhoods,
          coverage_reviewed_at: reviewedAt,
          coverage_reviewed_by: reviewedBy,
          coverage_notes: nextNotes,
        },
      });
    } catch (error: any) {
      console.error(
        '[KAVIAR_AI_COVERAGE_STATUS]',
        error?.message || error
      );

      return res.status(500).json({
        success: false,
        error: 'Erro ao atualizar governança da cobertura territorial.',
      });
    }
  }
);


export default router;