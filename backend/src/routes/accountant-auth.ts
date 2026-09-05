import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateAccountant } from '../middlewares/accountant-auth';
import { forgotPasswordRateLimit } from '../middlewares/accounting-rate-limit';
import * as authService from '../services/accounting/accounting-auth.service';
import { AccountingAuthError } from '../services/accounting/accounting-auth.service';
import { sendPasswordResetEmail } from '../services/accounting/accounting-email.service';
import { writeAccountingAuditTx } from '../services/accounting/accounting-audit';
import { prisma } from '../lib/prisma';

const router = Router();

// ═══════════════════════════════════════════════════════════════════
// Rate Limiters
// ═══════════════════════════════════════════════════════════════════

const accountantLoginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    success: false,
    error: 'Muitas tentativas. Tente novamente em 15 minutos.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const accountantActivateRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: {
    success: false,
    error: 'Muitas tentativas de ativação. Tente novamente em 15 minutos.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const accountantPasswordResetRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: {
    success: false,
    error: 'Muitas solicitações. Tente novamente em 1 hora.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

const accountantRefreshRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  message: {
    success: false,
    error: 'Muitas solicitações. Tente novamente em 1 minuto.',
    code: 'RATE_LIMIT_EXCEEDED',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
});

// ═══════════════════════════════════════════════════════════════════
// Helper: set refresh token cookie
// ═══════════════════════════════════════════════════════════════════

function setRefreshCookie(res: Response, refreshToken: string) {
  const isTest = process.env.NODE_ENV === 'test';
  res.cookie('accountant_refresh_token', refreshToken, {
    httpOnly: true,
    secure: !isTest,
    sameSite: 'strict',
    path: '/api/accountant/auth',
    maxAge: 604800 * 1000, // 7 days in ms
  });
}

function clearRefreshCookie(res: Response) {
  res.clearCookie('accountant_refresh_token', {
    httpOnly: true,
    path: '/api/accountant/auth',
  });
}

// ═══════════════════════════════════════════════════════════════════
// Helper: error response
// ═══════════════════════════════════════════════════════════════════

function handleError(err: unknown, res: Response) {
  if (err instanceof AccountingAuthError) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
    });
  }
  console.error('[accountant-auth] Unexpected error:', err);
  return res.status(500).json({ success: false, error: 'Erro interno' });
}

// ═══════════════════════════════════════════════════════════════════
// POST /activate
// ═══════════════════════════════════════════════════════════════════

router.post('/activate', accountantActivateRateLimit, async (req: Request, res: Response) => {
  try {
    const { token, password, passwordConfirmation } = req.body;
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await authService.activateAccount(token, password, passwordConfirmation, ip, userAgent);

    setRefreshCookie(res, result.refreshTokenRaw);

    return res.status(200).json({
      success: true,
      data: {
        accessToken: result.accessToken,
        accountant: {
          id: result.accountant.id,
          email: result.accountant.email,
          nome_completo: result.accountant.nome_completo,
          status: result.accountant.status,
        },
      },
    });
  } catch (err) {
    return handleError(err, res);
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /login
// ═══════════════════════════════════════════════════════════════════

router.post('/login', accountantLoginRateLimit, async (req: Request, res: Response) => {
  try {
    const { email, password, deviceName } = req.body;
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await authService.login(email, password, ip, userAgent, deviceName);

    setRefreshCookie(res, result.refreshTokenRaw);

    return res.status(200).json({
      success: true,
      data: {
        accessToken: result.accessToken,
        accountant: {
          id: result.accountant.id,
          email: result.accountant.email,
          nome_completo: result.accountant.nome_completo,
          status: result.accountant.status,
        },
      },
    });
  } catch (err) {
    return handleError(err, res);
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /refresh
// ═══════════════════════════════════════════════════════════════════

router.post('/refresh', accountantRefreshRateLimit, async (req: Request, res: Response) => {
  try {
    // Get refresh token from cookie ONLY (never from body)
    const refreshToken = req.cookies?.accountant_refresh_token;
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    if (!refreshToken) {
      return res.status(401).json({ success: false, error: 'Refresh token ausente', code: 'INVALID_TOKEN' });
    }

    const result = await authService.refreshSession(refreshToken, ip, userAgent);

    setRefreshCookie(res, result.refreshTokenRaw);

    return res.status(200).json({
      success: true,
      data: {
        accessToken: result.accessToken,
      },
    });
  } catch (err) {
    return handleError(err, res);
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /logout (authenticated)
// ═══════════════════════════════════════════════════════════════════

router.post('/logout', authenticateAccountant, async (req: Request, res: Response) => {
  try {
    const { id, sessionId } = (req as any).accountant;
    await authService.logout(sessionId, id);
    clearRefreshCookie(res);
    return res.status(200).json({ success: true });
  } catch (err) {
    return handleError(err, res);
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /forgot-password
// ═══════════════════════════════════════════════════════════════════

router.post('/forgot-password', forgotPasswordRateLimit, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email é obrigatório' });
    }

    const result = await authService.forgotPassword(email, ip, userAgent);

    // ALWAYS return generic response (don't reveal if email exists)
    const genericMessage = 'Se o email estiver cadastrado, um link de recuperação será enviado.';

    if (result) {
      // Account exists — send email AFTER the transaction committed
      const emailResult = await sendPasswordResetEmail({
        accountantId: result.accountant.id,
        accountantEmail: result.accountant.email,
        accountantName: result.accountant.nome_completo,
        rawToken: result.rawToken,
      });

      // Fire-and-forget audit
      try {
        await prisma.$transaction(async (tx) => {
          await writeAccountingAuditTx(tx, {
            adminId: result.accountant.id,
            action: emailResult.ok ? 'PASSWORD_RESET_EMAIL_SENT' : 'PASSWORD_RESET_EMAIL_FAILED',
            entityType: 'accountant',
            entityId: result.accountant.id,
            newValue: { email_sent: emailResult.ok },
            ipAddress: ip,
            userAgent,
          });
        });
      } catch {
        // Best effort — don't fail the response
      }
    }

    return res.status(200).json({ success: true, message: genericMessage });
  } catch (err) {
    return handleError(err, res);
  }
});

// ═══════════════════════════════════════════════════════════════════
// POST /reset-password
// ═══════════════════════════════════════════════════════════════════

router.post('/reset-password', accountantPasswordResetRateLimit, async (req: Request, res: Response) => {
  try {
    const { token, password, passwordConfirmation } = req.body;
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    await authService.resetPassword(token, password, passwordConfirmation, ip, userAgent);

    clearRefreshCookie(res);
    return res.status(200).json({ success: true, message: 'Senha alterada com sucesso. Faça login novamente.' });
  } catch (err) {
    return handleError(err, res);
  }
});

// ═══════════════════════════════════════════════════════════════════
// GET /me (authenticated)
// ═══════════════════════════════════════════════════════════════════

// Shared include + serializer for the authenticated accountant profile.
// Exposes ONLY safe/read-safe fields — never password_hash, tokens or internal ids beyond own.
const PROFILE_INCLUDE = {
  firm: { select: { id: true, razao_social: true, nome_fantasia: true, crc: true, crc_uf: true, telefone: true } },
  entity_links: {
    where: { status: 'ACTIVE' as const },
    include: {
      legal_entity: { select: { id: true, razao_social: true, nome_fantasia: true, cnpj: true } },
    },
  },
};

function serializeAccountantProfile(accountant: any) {
  return {
    id: accountant.id,
    email: accountant.email,
    nome_completo: accountant.nome_completo,
    cpf: accountant.cpf,
    crc: accountant.crc,
    crc_uf: accountant.crc_uf,
    job_title: accountant.job_title ?? null,
    department: accountant.department ?? null,
    is_responsible_accountant: accountant.is_responsible_accountant ?? false,
    status: accountant.status,
    mfa_enabled: accountant.mfa_enabled,
    last_login_at: accountant.last_login_at,
    firm: accountant.firm,
    entity_links: (accountant.entity_links || []).map((link: any) => ({
      id: link.id,
      scope: link.scope,
      is_primary: link.is_primary,
      can_view: link.can_view,
      can_upload: link.can_upload,
      can_download: link.can_download,
      can_request_correction: link.can_request_correction,
      can_mark_processed: link.can_mark_processed,
      can_close_period: link.can_close_period,
      legal_entity: link.legal_entity,
    })),
  };
}

router.get('/me', authenticateAccountant, async (req: Request, res: Response) => {
  try {
    const { id } = (req as any).accountant;
    const { prisma } = await import('../lib/prisma');

    const accountant = await prisma.accountants.findUnique({
      where: { id },
      include: PROFILE_INCLUDE,
    });

    if (!accountant) {
      return res.status(404).json({ success: false, error: 'Contador não encontrado' });
    }

    return res.status(200).json({ success: true, data: serializeAccountantProfile(accountant) });
  } catch (err) {
    return handleError(err, res);
  }
});

// ═══════════════════════════════════════════════════════════════════
// PATCH /me (authenticated) — edita apenas dados pessoais seguros
// ═══════════════════════════════════════════════════════════════════
//
// Whitelist estrita: nome_completo, job_title, department.
// A identidade vem SEMPRE do JWT (req.accountant.id); qualquer accountant_id,
// role, status, permissões, vínculo, escritório ou e-mail enviados no corpo
// são IGNORADOS. Não há alteração de e-mail neste fluxo.
const PROFILE_EDITABLE_FIELDS = ['nome_completo', 'job_title', 'department'] as const;

router.patch('/me', authenticateAccountant, async (req: Request, res: Response) => {
  try {
    const { id } = (req as any).accountant;
    const { prisma } = await import('../lib/prisma');

    const body = (req.body || {}) as Record<string, unknown>;
    const updateData: Record<string, string | null> = {};

    for (const field of PROFILE_EDITABLE_FIELDS) {
      if (!(field in body)) continue;
      const raw = body[field];

      // nome_completo é obrigatório se enviado; job_title/department podem ser limpos.
      if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
        if (field === 'nome_completo') {
          return res.status(400).json({ success: false, error: 'Nome completo não pode ficar vazio' });
        }
        updateData[field] = null;
        continue;
      }

      if (typeof raw !== 'string') {
        return res.status(400).json({ success: false, error: `Campo inválido: ${field}` });
      }
      const trimmed = raw.trim();
      if (trimmed.length > 200) {
        return res.status(400).json({ success: false, error: `Campo muito longo: ${field}` });
      }
      updateData[field] = trimmed;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, error: 'Nenhum campo editável informado' });
    }

    // Snapshot para auditoria (apenas campos editáveis).
    const before = await prisma.accountants.findUnique({
      where: { id },
      select: { nome_completo: true, job_title: true, department: true },
    });
    if (!before) {
      return res.status(404).json({ success: false, error: 'Contador não encontrado' });
    }

    const updated = await prisma.accountants.update({
      where: { id }, // SEMPRE o próprio usuário do JWT
      data: updateData,
      include: PROFILE_INCLUDE,
    });

    // Audit trail — quem, quando, o quê.
    try {
      await prisma.$transaction(async (tx) => {
        await writeAccountingAuditTx(tx, {
          adminId: id,
          action: 'ACCOUNTANT_PROFILE_UPDATED',
          entityType: 'accountant',
          entityId: id,
          oldValue: before,
          newValue: updateData,
          ipAddress: req.ip || req.socket.remoteAddress,
          userAgent: req.headers['user-agent'],
        });
      });
    } catch {
      // best-effort — não falha a resposta por causa da auditoria
    }

    return res.status(200).json({ success: true, data: serializeAccountantProfile(updated) });
  } catch (err) {
    return handleError(err, res);
  }
});

export const accountantAuthRoutes = router;
export default router;
