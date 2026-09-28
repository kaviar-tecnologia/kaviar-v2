import { Router, Request, Response } from 'express';
import twilio from 'twilio';
import { prisma } from '../lib/prisma';
import { authenticateAdmin, requireRole } from '../middlewares/auth';
import { applyTerritoryScope } from '../middlewares/territory-scope';
import { getTwilioClient, getWhatsAppFrom, normalizeWhatsAppTo } from '../modules/whatsapp/whatsapp-client';
import { normalizeInviteType } from '../utils/normalize-invite-type';
import { audit, auditCtx } from '../utils/audit';

const router = Router();

const INVITE_TYPES = ['driver', 'passenger', 'manager', 'manager_application', 'pet', 'guide', 'lead'] as const;
type InviteType = typeof INVITE_TYPES[number];

const MANAGER_APPLICATION_TEMPLATE_SID = 'HX93d53081930b106c8e5b266174c7611e';

const TEMPLATE_ENV_BY_TYPE: Record<'driver' | 'passenger' | 'manager' | 'manager_application', string> = {
  driver: 'TWILIO_WHATSAPP_TEMPLATE_DRIVER_SID',
  passenger: 'TWILIO_WHATSAPP_TEMPLATE_PASSENGER_SID',
  manager: 'TWILIO_WHATSAPP_TEMPLATE_MANAGER_SID',
  manager_application: 'TWILIO_WHATSAPP_TEMPLATE_MANAGER_APPLICATION_SID',
};

const TEMPLATE_KEY_BY_TYPE: Record<'driver' | 'passenger' | 'manager' | 'manager_application', string> = {
  driver: 'official_invite_driver',
  passenger: 'official_invite_passenger',
  manager: 'official_invite_manager',
  manager_application: 'manager_application_confirmation',
};

const SEND_ROLES = ['SUPER_ADMIN', 'TERRITORIAL_MANAGER', 'TERRITORIAL_OPERATOR'];
const DUPLICATE_WINDOW_DAYS = 7;
const MANAGER_DAILY_LIMIT = 30;
const SUPER_ADMIN_DAILY_LIMIT = 200;
const INVITE_LOG_PERIODS = ['today', '7d', '30d'] as const;
type InviteLogPeriod = typeof INVITE_LOG_PERIODS[number];


function startOfDay(d = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function normalizeBrazilPhone(input: string): string {
  const digits = String(input || '').replace(/\D/g, '');
  if (!digits) throw new Error('Informe um telefone válido.');

  let normalized = digits;
  if (normalized.startsWith('00')) normalized = normalized.slice(2);
  if (normalized.startsWith('55')) normalized = normalized.slice(2);

  if (normalized.length !== 10 && normalized.length !== 11) {
    throw new Error('Informe um telefone brasileiro com DDD.');
  }

  return `+55${normalized}`;
}

function phoneVariants(e164: string): string[] {
  const digits = e164.replace(/\D/g, '');
  const national = digits.startsWith('55') ? digits.slice(2) : digits;
  return Array.from(new Set([
    e164,
    digits,
    national,
    `+${digits}`,
    `55${national}`,
    `+55${national}`,
  ]));
}

function getTemplateSid(type: InviteType): { sid: string; key: string; envName: string } | null {
  if (type !== 'driver' && type !== 'passenger' && type !== 'manager' && type !== 'manager_application') return null;
  const envName = TEMPLATE_ENV_BY_TYPE[type];
  const fallback = type === 'manager_application' ? MANAGER_APPLICATION_TEMPLATE_SID : '';
  return { sid: (process.env[envName] || fallback).trim(), key: TEMPLATE_KEY_BY_TYPE[type], envName };
}

function requireTwilioConfig(type: InviteType) {
  const missing: string[] = [];
  if (!process.env.TWILIO_ACCOUNT_SID) missing.push('TWILIO_ACCOUNT_SID');
  if (!process.env.TWILIO_AUTH_TOKEN) missing.push('TWILIO_AUTH_TOKEN');
  if (!process.env.TWILIO_WHATSAPP_FROM) missing.push('TWILIO_WHATSAPP_FROM');

  const template = getTemplateSid(type);
  if (!template) {
    return { ok: false as const, status: 400, message: 'Template Twilio ainda não configurado para este tipo de convite.' };
  }
  if (!template.sid) {
    return { ok: false as const, status: 400, message: 'Template Twilio ainda não configurado para este tipo de convite.', details: [template.envName] };
  }
  if (missing.length) {
    return { ok: false as const, status: 503, message: 'Configuração Twilio ausente no backend.', details: missing };
  }

  return { ok: true as const, template };
}

function publicApiBaseUrl(): string | null {
  const value = process.env.PUBLIC_API_BASE_URL || process.env.API_PUBLIC_BASE_URL || process.env.BACKEND_PUBLIC_URL || process.env.APP_PUBLIC_API_URL || process.env.API_BASE_URL || process.env.BASE_URL;
  if (!value) return null;
  return value.replace(/\/$/, '');
}

function statusCallbackUrl(): string | undefined {
  const base = publicApiBaseUrl();
  return base ? `${base}/api/webhooks/twilio/whatsapp-status` : undefined;
}

function statusTimestamp(status: string): Record<string, Date> {
  const now = new Date();
  if (status === 'sent') return { sent_at: now };
  if (status === 'delivered') return { delivered_at: now };
  if (status === 'read') return { read_at: now };
  if (status === 'failed' || status === 'undelivered') return { failed_at: now };
  return {};
}

function validateTwilioStatusSignature(req: Request): { ok: boolean; status: number; error?: string } {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const callbackUrl = statusCallbackUrl();
  const signature = String(req.headers['x-twilio-signature'] || '');
  const isProduction = process.env.NODE_ENV === 'production';

  if (!authToken || !callbackUrl) {
    if (isProduction) {
      return { ok: false, status: !authToken ? 500 : 403, error: 'Configuração de validação Twilio ausente.' };
    }
    // Local/test bypass: permite testes manuais sem URL pública ou secret carregado. Nunca habilitar em produção.
    return { ok: true, status: 200 };
  }

  if (!signature) {
    if (isProduction) return { ok: false, status: 403, error: 'Assinatura Twilio ausente.' };
    // Local/test bypass: alguns clientes locais não conseguem assinar o callback completo.
    return { ok: true, status: 200 };
  }

  const params = { ...(req.body || {}) };
  const valid = twilio.validateRequest(authToken, signature, callbackUrl, params);
  if (!valid) return { ok: false, status: 403, error: 'Assinatura Twilio inválida.' };

  return { ok: true, status: 200 };
}

type TargetTerritoryResolution = {
  territoryId: string | null;
  targetName: string | null;
  source: string | null;
  matched: boolean;
  matchStrength: 'exact' | 'suffix' | 'none';
};

async function resolveTargetTerritory(phone: string, type: InviteType): Promise<TargetTerritoryResolution> {
  const variants = phoneVariants(phone);
  const suffix9 = phone.replace(/\D/g, '').slice(-9);

  if (type === 'driver') {
    let matchStrength: TargetTerritoryResolution['matchStrength'] = 'exact';
    let driver = await prisma.drivers.findFirst({
      where: { phone: { in: variants } },
      select: { name: true, neighborhood_id: true, neighborhoods: { select: { territory_id: true } } },
    });
    if (!driver) {
      matchStrength = 'suffix';
      driver = await prisma.drivers.findFirst({
        where: { phone: { endsWith: suffix9 } },
        select: { name: true, neighborhood_id: true, neighborhoods: { select: { territory_id: true } } },
      });
    }
    if (driver) return { territoryId: driver.neighborhoods?.territory_id || null, targetName: driver.name, source: 'driver', matched: true, matchStrength };
  }

  if (type === 'passenger') {
    let matchStrength: TargetTerritoryResolution['matchStrength'] = 'exact';
    let passenger = await prisma.passengers.findFirst({
      where: { phone: { in: variants } },
      select: { name: true, neighborhood_id: true, neighborhoods: { select: { territory_id: true } } },
    });
    if (!passenger) {
      matchStrength = 'suffix';
      passenger = await prisma.passengers.findFirst({
        where: { phone: { endsWith: suffix9 } },
        select: { name: true, neighborhood_id: true, neighborhoods: { select: { territory_id: true } } },
      });
    }
    if (passenger) return { territoryId: passenger.neighborhoods?.territory_id || null, targetName: passenger.name, source: 'passenger', matched: true, matchStrength };
  }

  if (type === 'guide') {
    let matchStrength: TargetTerritoryResolution['matchStrength'] = 'exact';
    let guide = await prisma.tourist_guides.findFirst({
      where: { phone: { in: variants } },
      select: { name: true, community_id: true },
    });
    if (!guide) {
      matchStrength = 'suffix';
      guide = await prisma.tourist_guides.findFirst({
        where: { phone: { endsWith: suffix9 } },
        select: { name: true, community_id: true },
      });
    }
    if (guide) {
      const neighborhood = await prisma.neighborhoods.findUnique({ where: { id: guide.community_id }, select: { territory_id: true } });
      return { territoryId: neighborhood?.territory_id || null, targetName: guide.name, source: 'guide', matched: true, matchStrength };
    }
  }

  if (type === 'lead') {
    let matchStrength: TargetTerritoryResolution['matchStrength'] = 'exact';
    let crmLead = await prisma.crm_leads.findFirst({
      where: { deleted_at: null, phone: { in: variants } },
      select: { name: true, territory_id: true },
    });
    if (!crmLead) {
      matchStrength = 'suffix';
      crmLead = await prisma.crm_leads.findFirst({
        where: { deleted_at: null, phone: { endsWith: suffix9 } },
        select: { name: true, territory_id: true },
      });
    }
    if (crmLead) return { territoryId: crmLead.territory_id || null, targetName: crmLead.name, source: 'crm_lead', matched: true, matchStrength };

    matchStrength = 'exact';
    let consultantLead = await prisma.consultant_leads.findFirst({
      where: { phone: { in: variants } },
      select: { name: true },
    });
    if (!consultantLead) {
      matchStrength = 'suffix';
      consultantLead = await prisma.consultant_leads.findFirst({
        where: { phone: { endsWith: suffix9 } },
        select: { name: true },
      });
    }
    if (consultantLead) return { territoryId: null, targetName: consultantLead.name, source: 'consultant_lead', matched: true, matchStrength };
  }

  if (type === 'pet') {
    let matchStrength: TargetTerritoryResolution['matchStrength'] = 'exact';
    let pet = await prisma.pet_homologations.findFirst({
      where: { phone: { in: variants } },
      select: { name: true, driver_id: true, operator_id: true },
    });
    if (!pet) {
      matchStrength = 'suffix';
      pet = await prisma.pet_homologations.findFirst({
        where: { phone: { endsWith: suffix9 } },
        select: { name: true, driver_id: true, operator_id: true },
      });
    }
    if (pet?.driver_id) {
      const driver = await prisma.drivers.findUnique({ where: { id: pet.driver_id }, select: { neighborhoods: { select: { territory_id: true } } } });
      return { territoryId: driver?.neighborhoods?.territory_id || null, targetName: pet.name, source: 'pet_homologation', matched: true, matchStrength };
    }
    if (pet?.operator_id) {
      const operator = await prisma.operator_profiles.findFirst({ where: { admin_id: pet.operator_id }, select: { territory_id: true } });
      return { territoryId: operator?.territory_id || null, targetName: pet.name, source: 'pet_homologation', matched: true, matchStrength };
    }
    if (pet) return { territoryId: null, targetName: pet.name, source: 'pet_homologation', matched: true, matchStrength };
  }

  return { territoryId: null, targetName: null, source: null, matched: false, matchStrength: 'none' };
}

function isTerritorialRole(role: string): boolean {
  return role === 'TERRITORIAL_MANAGER' || role === 'TERRITORIAL_OPERATOR';
}

async function resolveAdminOwnTerritoryId(admin: any, scope: any): Promise<string | null> {
  if (!isTerritorialRole(admin.role)) return null;

  const profile = await prisma.operator_profiles.findUnique({
    where: { admin_id: admin.id },
    select: { territory_id: true, territory: { select: { id: true, is_active: true } } },
  });

  if (!profile?.territory_id || !profile.territory?.is_active) return null;

  const territoryIds = Array.isArray(scope?.territoryIds) ? scope.territoryIds : [];
  if (!territoryIds.includes(profile.territory_id)) return null;

  return profile.territory_id;
}

function buildTargetResolutions(resolutions: TargetTerritoryResolution[]): {
  matched: boolean;
  territoryIds: string[];
  exactTerritoryIds: string[];
  targetName: string | null;
  source: string | null;
} {
  const matched = resolutions.filter((resolution) => resolution.matched);
  const territoryIds = Array.from(new Set(matched.map((resolution) => resolution.territoryId).filter((id): id is string => Boolean(id))));
  const exactTerritoryIds = Array.from(new Set(matched
    .filter((resolution) => resolution.matchStrength === 'exact')
    .map((resolution) => resolution.territoryId)
    .filter((id): id is string => Boolean(id))));
  const named = matched.find((resolution) => resolution.targetName);

  return {
    matched: matched.length > 0,
    territoryIds,
    exactTerritoryIds,
    targetName: named?.targetName || null,
    source: named?.source || matched[0]?.source || null,
  };
}

async function resolveKnownTargetTerritories(phone: string, preferredType: InviteType) {
  const types = Array.from(new Set([preferredType, ...INVITE_TYPES.filter((inviteType) => inviteType !== 'manager')]));
  const resolutions = await Promise.all(types.map((inviteType) => resolveTargetTerritory(phone, inviteType)));
  return buildTargetResolutions(resolutions);
}

function scopedWhere(admin: any, scope: any): any {
  if (admin.role === 'SUPER_ADMIN') return {};
  const territoryIds = Array.isArray(scope?.territoryIds) ? scope.territoryIds : [];
  return { territory_id: { in: territoryIds.length ? territoryIds : ['__none__'] } };
}

function reportScope(admin: any, scope: any) {
  const global = admin.role === 'SUPER_ADMIN' || admin.role === 'OPERATOR';
  const territoryIdsApplied = global
    ? []
    : (Array.isArray(scope?.territoryIds) ? scope.territoryIds : []);

  return {
    role: admin.role,
    global,
    territoryIdsApplied,
  };
}

function normalizeInviteLogPeriod(value: unknown): InviteLogPeriod {
  return INVITE_LOG_PERIODS.includes(value as InviteLogPeriod) ? (value as InviteLogPeriod) : '30d';
}

function inviteLogPeriodStart(period: InviteLogPeriod, now = new Date()): Date {
  if (period === 'today') return startOfDay(now);
  const days = period === '7d' ? 7 : 30;
  const d = new Date(now);
  d.setDate(now.getDate() - days);
  return d;
}

function serializeLog(log: any) {
  return {
    id: log.id,
    adminId: log.admin_id,
    adminName: log.admin_name,
    adminEmail: log.admin_email,
    adminRole: log.admin_role,
    territoryId: log.territory_id,
    targetPhoneNormalized: log.target_phone_normalized,
    targetName: log.target_name,
    inviteType: log.invite_type,
    channel: log.channel,
    templateKey: log.template_key,
    twilioMessageSid: log.twilio_message_sid,
    twilioStatus: log.twilio_status,
    twilioErrorCode: log.twilio_error_code,
    twilioErrorMessage: log.twilio_error_message,
    duplicateOfLogId: log.duplicate_of_log_id,
    sourceScreen: log.source_screen,
    createdAt: log.created_at,
    updatedAt: log.updated_at,
    sentAt: log.sent_at,
    deliveredAt: log.delivered_at,
    readAt: log.read_at,
    failedAt: log.failed_at,
  };
}

router.post('/send', authenticateAdmin, requireRole(SEND_ROLES), applyTerritoryScope, async (req: Request, res: Response) => {
  let normalizedPhone: string | null = null;
  let type: InviteType | null = null;
  let duplicateLogId: string | null = null;

  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;
    const { phone, targetName, leadId, force = false } = req.body || {};

    const rawType = req.body?.type;
    const normalized = normalizeInviteType(rawType);
    type = normalized as InviteType | null;

    if (!phone || !type || !INVITE_TYPES.includes(type)) {
      return res.status(400).json({ success: false, error: 'phone e type válido são obrigatórios.' });
    }

    if ((type === 'manager' || type === 'manager_application') && admin.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: 'Comunicação de Gestor permitida apenas para SUPER_ADMIN.' });
    }

    normalizedPhone = normalizeBrazilPhone(phone);
    let candidate: { id: string; name: string; phone: string | null; territory_id: string | null; status: string } | null = null;
    if (type === 'manager_application') {
      if (typeof leadId !== 'string' || !leadId.trim()) {
        return res.status(400).json({ success: false, error: 'leadId do candidato é obrigatório.' });
      }
      candidate = await prisma.crm_leads.findFirst({
        where: { id: leadId, deleted_at: null, lead_type: 'TERRITORIAL_MANAGER', source: 'WEBSITE' },
        select: { id: true, name: true, phone: true, territory_id: true, status: true },
      });
      if (!candidate || !candidate.phone) {
        return res.status(404).json({ success: false, error: 'Candidatura de Gestor não encontrada no CRM.' });
      }
      if (['ACTIVE', 'LOST', 'REJECTED'].includes(candidate.status)) {
        return res.status(409).json({ success: false, error: 'Candidatura não está em acompanhamento.' });
      }
      if (normalizeBrazilPhone(candidate.phone) !== normalizedPhone) {
        return res.status(409).json({ success: false, error: 'Telefone informado difere do cadastro do candidato.' });
      }
    }
    const resolved = type === 'manager_application'
      ? { territoryIds: candidate?.territory_id ? [candidate.territory_id] : [], exactTerritoryIds: [], targetName: candidate?.name || null }
      : await resolveKnownTargetTerritories(normalizedPhone, type);
    // Para candidatura, o nome e território vêm exclusivamente do CRM, não do corpo da requisição.
    const finalTargetName = String(type === 'manager_application' ? candidate?.name : (targetName || resolved.targetName || '')).trim() || null;
    let logTerritoryId = resolved.territoryIds[0] || null;

    if (isTerritorialRole(admin.role)) {
      const adminTerritoryId = await resolveAdminOwnTerritoryId(admin, scope);
      if (!adminTerritoryId) {
        return res.status(403).json({ success: false, error: 'Usuário territorial sem territory_id válido no perfil.' });
      }

      const territoryIds = Array.isArray(scope?.territoryIds) ? scope.territoryIds : [];
      const outOfScopeTerritoryId = resolved.exactTerritoryIds.find((territoryId) => !territoryIds.includes(territoryId));
      if (outOfScopeTerritoryId) {
        return res.status(403).json({ success: false, error: 'Contato fora do seu território ou território não identificado.' });
      }

      logTerritoryId = adminTerritoryId;
    }

    const templateConfig = requireTwilioConfig(type);
    if (!templateConfig.ok) {
      return res.status(templateConfig.status).json({ success: false, error: templateConfig.message, missing: (templateConfig as any).details });
    }

    const duplicate = await prisma.whatsapp_invite_logs.findFirst({
      where: {
        target_phone_normalized: normalizedPhone,
        invite_type: type,
        created_at: { gte: daysAgo(DUPLICATE_WINDOW_DAYS) },
        duplicate_of_log_id: null,
      },
      orderBy: { created_at: 'desc' },
    });

    if (duplicate && (type === 'manager_application' || !force || admin.role !== 'SUPER_ADMIN')) {
      return res.status(409).json({
        success: false,
        code: 'DUPLICATE_INVITE',
        message: 'Este número já recebeu esse convite recentemente.',
        lastInvite: serializeLog(duplicate),
      });
    }
    if (duplicate) duplicateLogId = duplicate.id;

    const todayCount = await prisma.whatsapp_invite_logs.count({
      where: {
        admin_id: admin.id,
        created_at: { gte: startOfDay() },
        duplicate_of_log_id: null,
      },
    });
    const dailyLimit = admin.role === 'SUPER_ADMIN' ? SUPER_ADMIN_DAILY_LIMIT : MANAGER_DAILY_LIMIT;
    if (todayCount >= dailyLimit) {
      return res.status(429).json({
        success: false,
        code: 'DAILY_LIMIT_REACHED',
        message: 'Limite diário de convites oficiais atingido.',
        error: 'Limite diário de convites oficiais atingido.',
        limit: dailyLimit,
        used: todayCount,
      });
    }

    const callback = statusCallbackUrl();
    if (!callback) {
      return res.status(503).json({ success: false, error: 'PUBLIC_API_BASE_URL ainda não configurado para statusCallback Twilio.' });
    }

    const log = await prisma.whatsapp_invite_logs.create({
      data: {
        admin_id: admin.id,
        admin_name: admin.name || null,
        admin_email: admin.email || null,
        admin_role: admin.role,
        territory_id: logTerritoryId,
        target_phone_normalized: normalizedPhone,
        target_name: finalTargetName,
        invite_type: type,
        channel: 'twilio_whatsapp',
        template_key: templateConfig.template.key,
        duplicate_of_log_id: duplicateLogId,
        source_screen: type === 'manager_application' ? 'crm_manager_application' : 'whatsapp_central',
        twilio_status: 'queued',
      },
    });

    const client = getTwilioClient();
    let message: any;
    try {
      message = await client.messages.create({
        to: normalizeWhatsAppTo(normalizedPhone),
        from: getWhatsAppFrom(),
        contentSid: templateConfig.template.sid,
        contentVariables: JSON.stringify({ '1': finalTargetName || 'KAVIAR' }),
        statusCallback: callback,
      });
    } catch (sendErr: any) {
      const failed = await prisma.whatsapp_invite_logs.update({
        where: { id: log.id },
        data: {
          twilio_status: 'failed',
          twilio_error_code: sendErr?.code ? String(sendErr.code) : null,
          twilio_error_message: sendErr?.message || 'Falha ao chamar Twilio.',
          failed_at: new Date(),
        },
      });

      const ctx = auditCtx(req);
      audit({
        adminId: ctx.adminId,
        adminEmail: ctx.adminEmail,
        action: 'whatsapp_official_invite_failed',
        entityType: 'whatsapp_invite_log',
        entityId: failed.id,
        newValue: { phone: normalizedPhone, invite_type: type, territory_id: logTerritoryId, template_key: templateConfig.template.key, twilio_error_code: sendErr?.code || null, twilio_error_message: sendErr?.message || null },
        ipAddress: ctx.ip,
        userAgent: ctx.ua,
      });

      return res.status(502).json({ success: false, error: sendErr?.message || 'Twilio não conseguiu enviar o convite oficial.', data: serializeLog(failed) });
    }

    const status = message.status || 'queued';
    const updated = await prisma.whatsapp_invite_logs.update({
      where: { id: log.id },
      data: {
        twilio_message_sid: message.sid,
        twilio_status: status,
        ...statusTimestamp(status),
      },
    });

    const ctx = auditCtx(req);
    audit({
      adminId: ctx.adminId,
      adminEmail: ctx.adminEmail,
      action: 'whatsapp_official_invite_sent',
      entityType: 'whatsapp_invite_log',
      entityId: updated.id,
      newValue: { phone: normalizedPhone, invite_type: type, territory_id: logTerritoryId, template_key: templateConfig.template.key, twilio_message_sid: message.sid, forced: Boolean(force), duplicate_of_log_id: duplicateLogId },
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
    });

    return res.json({ success: true, message: 'Convite oficial enviado e registrado.', data: serializeLog(updated) });
  } catch (err: any) {
    console.error('[WA_INVITE_SEND] error:', err);
    return res.status(500).json({ success: false, error: err?.message || 'Erro ao enviar convite oficial.' });
  }
});

router.get('/stats', authenticateAdmin, requireRole(SEND_ROLES), applyTerritoryScope, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;
    const where = scopedWhere(admin, scope);
    const now = new Date();
    const today = startOfDay(now);
    const week = new Date(now); week.setDate(now.getDate() - 7);
    const month = new Date(now); month.setDate(now.getDate() - 30);

    const [todayCount, weekCount, monthCount, typeRows, statusRows] = await Promise.all([
      prisma.whatsapp_invite_logs.count({ where: { ...where, created_at: { gte: today } } }),
      prisma.whatsapp_invite_logs.count({ where: { ...where, created_at: { gte: week } } }),
      prisma.whatsapp_invite_logs.count({ where: { ...where, created_at: { gte: month } } }),
      prisma.whatsapp_invite_logs.groupBy({ by: ['invite_type'], where: { ...where, created_at: { gte: month } }, _count: { _all: true } }),
      prisma.whatsapp_invite_logs.groupBy({ by: ['twilio_status'], where: { ...where, created_at: { gte: month } }, _count: { _all: true } }),
    ]);

    res.json({
      success: true,
      scope: reportScope(admin, scope),
      data: {
        today: todayCount,
        week: weekCount,
        month: monthCount,
        byType: Object.fromEntries(typeRows.map(r => [r.invite_type, r._count._all])),
        byStatus: Object.fromEntries(statusRows.map(r => [r.twilio_status || 'unknown', r._count._all])),
      },
    });
  } catch (err: any) {
    console.error('[WA_INVITE_STATS] error:', err);
    res.status(500).json({ success: false, error: 'Erro ao carregar estatísticas de convites.' });
  }
});

router.get('/logs', authenticateAdmin, requireRole(SEND_ROLES), applyTerritoryScope, async (req: Request, res: Response) => {
  try {
    const admin = (req as any).admin;
    const scope = (req as any).territoryScope;
    const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit || '10'), 10) || 10, 1), 100);
    const where: any = scopedWhere(admin, scope);
    const period = normalizeInviteLogPeriod(req.query.period);

    if (req.query.type) {
      const q = normalizeInviteType(req.query.type);
      if (q) where.invite_type = q;
      else where.invite_type = String(req.query.type);
    }
    if (req.query.status) where.twilio_status = String(req.query.status);
    if (req.query.phone) where.target_phone_normalized = { contains: String(req.query.phone).replace(/\D/g, '') };
    if (req.query.from || req.query.to) {
      where.created_at = {};
      if (req.query.from) where.created_at.gte = new Date(String(req.query.from));
      if (req.query.to) where.created_at.lte = new Date(String(req.query.to));
    } else {
      where.created_at = { gte: inviteLogPeriodStart(period) };
    }

    const [logs, total] = await Promise.all([
      prisma.whatsapp_invite_logs.findMany({ where, orderBy: { created_at: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.whatsapp_invite_logs.count({ where }),
    ]);

    res.json({ success: true, scope: reportScope(admin, scope), data: logs.map(serializeLog), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (err: any) {
    console.error('[WA_INVITE_LOGS] error:', err);
    res.status(500).json({ success: false, error: 'Erro ao carregar logs de convites.' });
  }
});

export const twilioWhatsappStatusRouter = Router();

twilioWhatsappStatusRouter.post('/twilio/whatsapp-status', async (req: Request, res: Response) => {
  try {
    const signatureCheck = validateTwilioStatusSignature(req);
    if (!signatureCheck.ok) {
      return res.status(signatureCheck.status).json({ success: false, error: signatureCheck.error });
    }

    const sid = req.body.MessageSid || req.body.SmsSid;
    const status = req.body.MessageStatus || req.body.SmsStatus;
    const errorCode = req.body.ErrorCode || null;
    const errorMessage = req.body.ErrorMessage || null;

    if (!sid || !status) {
      return res.status(400).json({ success: false, error: 'MessageSid e MessageStatus são obrigatórios.' });
    }

    const inviteLog = await prisma.whatsapp_invite_logs.findUnique({ where: { twilio_message_sid: sid } });
    const regulatoryLog = await prisma.municipal_regulatory_consultation_logs.findUnique({ where: { twilio_message_sid: sid } });

    if (!inviteLog && !regulatoryLog) {
      return res.status(404).json({ success: false, error: 'Log não encontrado para MessageSid.' });
    }

    if (inviteLog) {
      await prisma.whatsapp_invite_logs.update({
        where: { id: inviteLog.id },
        data: {
          twilio_status: status,
          twilio_error_code: errorCode,
          twilio_error_message: errorMessage,
          ...statusTimestamp(status),
        },
      });
    }

    if (regulatoryLog) {
      await prisma.municipal_regulatory_consultation_logs.update({
        where: { id: regulatoryLog.id },
        data: {
          twilio_status: status,
          twilio_error_code: errorCode,
          twilio_error_message: errorMessage,
          ...statusTimestamp(status),
        },
      });
    }

    res.json({ success: true });
  } catch (err: any) {
    console.error('[WA_INVITE_STATUS] error:', err);
    res.status(500).json({ success: false, error: 'Erro ao atualizar status Twilio.' });
  }
});

export default router;
