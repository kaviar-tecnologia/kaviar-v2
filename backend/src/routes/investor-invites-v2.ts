import { Router, Request, Response } from 'express';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import { authenticateAdmin, requireSuperAdmin } from '../middlewares/auth';
import rateLimit from 'express-rate-limit';
import { emailService } from '../services/email/email.service';
import { investorInviteText, investorInviteHtml } from '../services/email/templates/investor-invite';
import { whatsappEvents } from '../modules/whatsapp';
import { WHATSAPP_ENV } from '../modules/whatsapp/whatsapp-client';
import { pool } from '../db';

const router = Router();

// Gera código curto legível: ex. GOES-8F4K
function generateShortCode(name: string): string {
  const prefix = name.replace(/[^a-zA-Z]/g, '').toUpperCase().slice(0, 4).padEnd(4, 'X');
  const suffix = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4).padEnd(4, '0');
  return `${prefix}-${suffix}`;
}

// GET /i/:code — público, redireciona para reset-password
router.get('/i/:code', async (req: Request, res: Response) => {
  try {
    const { code } = req.params;
    const admin = await prisma.admins.findFirst({
      where: { invite_code: code },
      select: { id: true, invite_code_expires_at: true, must_change_password: true }
    });

    if (!admin) {
      return res.redirect(`${config.frontendUrl}/admin/convite-expirado`);
    }

    if (!admin.invite_code_expires_at || admin.invite_code_expires_at < new Date()) {
      return res.redirect(`${config.frontendUrl}/admin/convite-expirado`);
    }

    if (!admin.must_change_password) {
      // Já usou o convite
      return res.redirect(`${config.frontendUrl}/admin/login`);
    }

    // Gerar token JWT temporário para reset-password
    const token = jwt.sign(
      { userId: admin.id, userType: 'admin', purpose: 'password_reset' },
      config.jwtResetSecret,
      { expiresIn: '30m' }
    );

    // Invalidar o código curto após uso
    await prisma.admins.update({
      where: { id: admin.id },
      data: { invite_code: null, invite_code_expires_at: null }
    });

    return res.redirect(`${config.frontendUrl}/admin/reset-password?token=${token}`);
  } catch (err: any) {
    console.error('[INVITE_REDIRECT_ERROR]', err.message);
    return res.redirect(`${config.frontendUrl}/admin/convite-expirado`);
  }
});

// Logger estruturado
const logger = {
  info: (data: any, msg: string) => console.log(JSON.stringify({ ...data, level: 'info', message: msg, ts: new Date().toISOString() })),
  warn: (data: any, msg: string) => console.warn(JSON.stringify({ ...data, level: 'warn', message: msg, ts: new Date().toISOString() })),
  error: (data: any, msg: string) => console.error(JSON.stringify({ ...data, level: 'error', message: msg, ts: new Date().toISOString() }))
};

const inviteSchemaEmail = z.object({
  channel: z.literal('email').optional(),
  email: z.string().email('Email inválido'),
  name: z.string().min(1).optional(),
  role: z.literal('INVESTOR_VIEW')
});

const inviteSchemaWhatsApp = z.object({
  channel: z.literal('whatsapp'),
  phone: z.string().regex(/^\+\d{10,15}$/, 'Telefone deve estar no formato E.164 (+5521...)'),
  name: z.string().min(1).optional(),
  role: z.literal('INVESTOR_VIEW')
});

const inviteSchema = z.union([inviteSchemaEmail, inviteSchemaWhatsApp]);

const inviteRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, error: 'Muitos convites enviados. Aguarde 1 minuto.' }
});

const generateInviteToken = (userId: string, userType: string) => {
  return jwt.sign(
    { userId, userType, purpose: 'password_reset' },
    config.jwtResetSecret,
    { expiresIn: '120m' }
  );
};

router.post('/invite', authenticateAdmin, requireSuperAdmin, inviteRateLimit, async (req: Request, res: Response) => {
  const requestId = `inv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  try {
    const data = inviteSchema.parse(req.body);
    const { role } = data;
    const channel = 'channel' in data ? data.channel : 'email';
    const inputName = 'name' in data ? (data as any).name as string : undefined;

    let email: string;
    let phone: string | null = null;
    let displayName: string;

    if (channel === 'whatsapp') {
      phone = (data as any).phone as string;
      email = `whatsapp${phone.replace(/\+/g, '').replace(/\D/g, '')}@kaviar.local`;
      displayName = inputName || 'Investidor';
    } else {
      email = (data as any).email as string;
      displayName = inputName || 'Investidor';
    }

    if (email.includes('<') || email.includes('>')) {
      return res.status(400).json({ success: false, error: 'Identificador inválido' });
    }

    if (channel === 'whatsapp' && !WHATSAPP_ENV.enabled) {
      return res.status(503).json({ 
        success: false, 
        error: 'WhatsApp não configurado. Entre em contato com o administrador.' 
      });
    }

    const existing = await prisma.admins.findUnique({
      where: { email },
      select: { id: true, role: true }
    });

    if (existing && existing.role !== role) {
      return res.status(409).json({ 
        success: false, 
        error: `Identificador já cadastrado com role ${existing.role}. Não é possível alterar role automaticamente.` 
      });
    }

    const admin = await prisma.admins.upsert({
      where: { email },
      create: {
        email,
        name: displayName,
        phone: phone || undefined,
        role,
        password: '$2a$10$placeholder',
        must_change_password: true,
        is_active: true
      },
      update: {
        must_change_password: true,
        is_active: true,
        role,
        ...(phone && { phone }),
      },
      select: { id: true, email: true, name: true }
    });

    const token = generateInviteToken(admin.id, 'admin');

    // Gerar código curto e salvar no admin
    const shortCode = generateShortCode(displayName);
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2h
    try {
      await prisma.admins.update({
        where: { id: admin.id },
        data: { invite_code: shortCode, invite_code_expires_at: expiresAt }
      });
      console.log(`[INVITE_CODE_SAVED] admin=${admin.id} code=${shortCode}`);
    } catch (codeErr: any) {
      console.error(`[INVITE_CODE_FAILED] admin=${admin.id}`, codeErr.message);
    }
    const inviteUrl = `${config.frontendUrl}/i/${shortCode}`;

    // WhatsApp first, email fallback
    if (channel === 'whatsapp' && phone && WHATSAPP_ENV.enabled) {
      logger.info({ requestId, phone, role }, 'INVESTOR_INVITE_WHATSAPP_ATTEMPT');
      
      try {
        await whatsappEvents.inviteInvestor(phone, {
          "1": displayName,
          "2": inviteUrl
        });
        
        logger.info({ requestId, phone, role }, 'INVESTOR_INVITE_WHATSAPP_SENT');
        return res.json({ 
          success: true, 
          message: 'Convite enviado via WhatsApp.' 
        });
      } catch (err: any) {
        const twilioError = {
          requestId,
          phone,
          twilioCode: err?.code,
          twilioStatus: err?.status,
          twilioMessage: err?.message,
          moreInfo: err?.moreInfo,
          stack: err?.stack?.split('\n')[0]
        };
        logger.warn(twilioError, 'INVESTOR_INVITE_WHATSAPP_FAILED');
        // Fallback to email
      }
    }

    // Email fallback
    const templateParams = { name: admin.name, accessLink: inviteUrl };

    await emailService.sendMail({
      to: admin.email,
      subject: 'KAVIAR - Convite para Acesso',
      text: investorInviteText(templateParams),
      html: investorInviteHtml(templateParams),
    });

    logger.info({ requestId, email }, 'INVESTOR_INVITE_EMAIL_SENT');
    return res.json({ 
      success: true, 
      message: channel === 'whatsapp' ? 'WhatsApp falhou. Convite enviado via email.' : 'Convite enviado via email.' 
    });

  } catch (error: any) {
    logger.error({ requestId, error: error?.message, stack: error?.stack?.split('\n')[0] }, 'INVESTOR_INVITE_ERROR');
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        error: error.errors[0].message 
      });
    }

    return res.status(500).json({ 
      success: false, 
      error: 'Erro ao enviar convite. Tente novamente.' 
    });
  }
});

// GET /api/admin/investors/followup-eligible
router.get('/followup-eligible', authenticateAdmin, requireSuperAdmin, async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(`
      SELECT a.id, a.name, COALESCE(a.phone, '+' || regexp_replace(split_part(a.email, '@', 1), '[^0-9]', '', 'g')) AS phone,
             a.role, a.password_changed_at, a.marketing_followup_sent_at
      FROM admins a
      WHERE a.role = 'INVESTOR_VIEW'
        AND a.is_active = true
        AND a.password_changed_at IS NOT NULL
        AND (a.phone IS NOT NULL OR a.email LIKE 'whatsapp%@kaviar.local')
      ORDER BY a.password_changed_at DESC
    `);

    const now = Date.now();
    const eligible = rows.map((r: any) => ({
      id: r.id,
      name: r.name,
      phone: r.phone,
      role: r.role,
      passwordCreatedAt: r.password_changed_at,
      firstLoginAt: r.password_changed_at,
      followupSentAt: r.marketing_followup_sent_at,
      hourssinceLogin: Math.round((now - new Date(r.password_changed_at).getTime()) / 3600000),
      eligible: !r.marketing_followup_sent_at && (now - new Date(r.password_changed_at).getTime()) >= 24 * 3600000,
    }));

    return res.json({ success: true, data: eligible });
  } catch (error: any) {
    logger.error({ error: error?.message }, 'FOLLOWUP_ELIGIBLE_ERROR');
    return res.status(500).json({ success: false, error: 'Erro ao buscar elegíveis.' });
  }
});

// POST /api/admin/investors/:id/followup
router.post('/:id/followup', authenticateAdmin, requireSuperAdmin, async (req: Request, res: Response) => {
  try {
    const admin = await prisma.admins.findUnique({
      where: { id: req.params.id },
      select: { id: true, name: true, email: true, phone: true, role: true, marketing_followup_sent_at: true, password_changed_at: true },
    });

    if (!admin) return res.status(404).json({ success: false, error: 'Admin não encontrado.' });
    if (admin.role !== 'INVESTOR_VIEW') return res.status(400).json({ success: false, error: 'Apenas Investor View.' });

    // Resolve phone: field or extract from whatsapp email
    const phone = admin.phone || (admin.email?.startsWith('whatsapp') ? '+' + admin.email.replace(/[^0-9]/g, '') : null);
    if (!phone) return res.status(400).json({ success: false, error: 'Sem telefone cadastrado.' });
    if (!admin.password_changed_at) return res.status(400).json({ success: false, error: 'Convidado ainda não criou senha.' });
    if (admin.marketing_followup_sent_at) return res.status(409).json({ success: false, error: 'Follow-up já enviado.', sentAt: admin.marketing_followup_sent_at });

    if (!WHATSAPP_ENV.enabled) return res.status(503).json({ success: false, error: 'WhatsApp não configurado.' });

    const displayName = admin.name.replace(/\s*\(.*\)$/, '') || 'Investidor';

    await whatsappEvents.followupAngel(phone, { "1": displayName });

    await prisma.admins.update({
      where: { id: admin.id },
      data: { marketing_followup_sent_at: new Date() },
    });

    logger.info({ adminId: admin.id, phone }, 'FOLLOWUP_ANGEL_SENT');
    return res.json({ success: true, message: 'Follow-up enviado.' });
  } catch (error: any) {
    logger.error({ adminId: req.params.id, error: error?.message }, 'FOLLOWUP_ANGEL_ERROR');
    return res.status(500).json({ success: false, error: 'Erro ao enviar follow-up.' });
  }
});

export default router;
