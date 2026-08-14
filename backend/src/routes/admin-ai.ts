import { Router, Request, Response } from 'express';
import {
  authenticateAdmin,
  allowFinanceAccess,
  requireSuperAdmin,
} from '../middlewares/auth';
import { askKaviarAi } from '../services/ai/kaviar-ai.service';
import { createOpenAiProviderIfConfigured } from '../services/ai/kaviar-ai.openai-provider';
import { searchRegulatoryRequirements, startRegulatorySearch, retrieveRegulatorySearch, classifyRegulatorySearchError } from '../services/ai/kaviar-ai.regulatory-search';
import { prisma } from '../lib/prisma';
import { audit, auditCtx } from '../utils/audit';
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
    const { city, uf } = req.body;
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

export default router;