import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateAdmin, requireSuperAdmin } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { emailService } from '../services/email/email.service';
import { buildKaviarTestEmailTemplate, buildOperationalNoticeTemplate } from '../services/email/templates/kaviar-defaults';
import {
  EMAIL_LOG_STATUS,
  MAX_ATTACHMENTS,
  buildAttachmentMetadata,
  escapeHtml,
  handleOfficialAttachmentsUpload,
  isEmailSendLogsTableMissing,
  mapAttachments,
  parseSender,
  writeEmailSendLog,
} from '../services/email/official-email-support';
import { audit, auditCtx } from '../utils/audit';

const router = Router();

const MAX_LOG_LIMIT = 50;

const sendTestEmailSchema = z.object({
  to: z.string().email('Email de destino invalido'),
  template: z.enum(['test', 'operational']).default('test'),
  from: z.enum([
    'KAVIAR <no-reply@kaviar.com.br>',
    'KAVIAR <contato@kaviar.com.br>',
    'KAVIAR Suporte <suporte@kaviar.com.br>',
    'KAVIAR Financeiro <financeiro@kaviar.com.br>',
    'KAVIAR Notificações <no-reply@kaviar.com.br>',
    'KAVIAR <suporte@kaviar.com.br>',
    'KAVIAR <financeiro@kaviar.com.br>',
    'no-reply@kaviar.com.br',
    'contato@kaviar.com.br',
    'suporte@kaviar.com.br',
    'financeiro@kaviar.com.br',
  ]).optional(),
  title: z.string().min(3).max(120).optional(),
  message: z.string().min(3).max(4000).optional(),
});

/**
 * Rejeita enderecos com caracteres CR/LF (header injection).
 */
function containsHeaderInjection(value: string): boolean {
  return /[\r\n]/.test(value);
}

/**
 * Normaliza lista de emails: trim, lowercase, remove vazios.
 */
function normalizeEmailList(raw: string[] | undefined): string[] {
  if (!raw || !raw.length) return [];
  return raw
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Valida que não há duplicatas cruzadas entre to, cc e bcc.
 * Retorna mensagem de erro ou null se OK.
 */
function findDuplicateBetweenLists(to: string[], cc: string[], bcc: string[]): string | null {
  const seen = new Map<string, string>();
  for (const email of to) {
    seen.set(email, 'Para');
  }
  for (const email of cc) {
    const existing = seen.get(email);
    if (existing) return `Endereco "${email}" duplicado entre ${existing} e CC.`;
    seen.set(email, 'CC');
  }
  for (const email of bcc) {
    const existing = seen.get(email);
    if (existing) return `Endereco "${email}" duplicado entre ${existing} e CCO.`;
    seen.set(email, 'CCO');
  }
  return null;
}

const sendOfficialEmailSchema = z.object({
  to: z.union([
    z.string().email('Email de destino invalido').transform((v) => [v]),
    z.array(z.string().email('Email de destino invalido')).min(1, 'Informe ao menos um destinatario').max(20, 'Maximo de 20 destinatarios'),
  ]),
  cc: z.array(z.string().email('Email de CC invalido')).max(10, 'Maximo de 10 destinatarios em CC').optional(),
  bcc: z.array(z.string().email('Email de CCO invalido')).max(10, 'Maximo de 10 destinatarios em CCO').optional(),
  subject: z.string().trim().min(3, 'Assunto obrigatorio').max(180, 'Assunto muito longo'),
  message: z.string().trim().min(3, 'Mensagem obrigatoria').max(12000, 'Mensagem muito longa'),
  from: z.enum([
    'KAVIAR <contato@kaviar.com.br>',
    'KAVIAR Suporte <suporte@kaviar.com.br>',
    'KAVIAR Financeiro <financeiro@kaviar.com.br>',
  ]),
});

function parseAllowlist(raw: string | undefined): Set<string> {
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter(Boolean)
  );
}

function isAllowedTestRecipient(email: string): boolean {
  const requested = email.trim().toLowerCase();

  const explicitAllowlist = parseAllowlist(process.env.EMAIL_TEST_ALLOWED_TO);
  if (explicitAllowlist.size > 0) {
    return explicitAllowlist.has(requested);
  }

  const forwardTo = process.env.FORWARD_TO_EMAIL?.trim().toLowerCase();
  if (forwardTo) {
    return requested === forwardTo;
  }

  return false;
}

function normalizeToArray(value: unknown): string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') return [value];
  return undefined;
}

function parseOfficialRequestBody(req: Request) {
  const body = req.body || {};
  return sendOfficialEmailSchema.parse({
    to: normalizeToArray(body.to) || body.to,
    cc: normalizeToArray(body.cc),
    bcc: normalizeToArray(body.bcc),
    from: body.from,
    subject: body.subject,
    message: body.message,
  });
}

function normalizeLogStatus(raw: unknown): typeof EMAIL_LOG_STATUS[keyof typeof EMAIL_LOG_STATUS] | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim().toUpperCase();
  if (value === EMAIL_LOG_STATUS.SENT || value === EMAIL_LOG_STATUS.ERROR) {
    return value;
  }
  return null;
}

async function writeAuditSafely(payload: Parameters<typeof audit>[0]) {
  try {
    await audit(payload);
  } catch (auditError) {
    console.error('[ADMIN_EMAIL_AUDIT_WRITE_FAILED]', auditError);
  }
}

function serializeEmailSendLog(log: any) {
  return {
    id: log.id,
    created_at: log.created_at,
    admin_id: log.admin_id,
    admin_email: log.admin_email,
    from_email: log.from_email,
    from_name: log.from_name,
    to_email: log.to_email,
    cc_email: log.cc_email,
    bcc_email: log.bcc_email,
    subject: log.subject,
    provider: log.provider,
    status: log.status,
    error_message: log.error_message,
    attachment_count: log.attachment_count,
    attachments_metadata: Array.isArray(log.attachments_metadata) ? log.attachments_metadata : null,
    provider_message_id: log.provider_message_id,
    reply_to_inbound_email_id: log.reply_to_inbound_email_id || null,
  };
}

router.use(authenticateAdmin);
router.use(requireSuperAdmin);

router.post('/test', async (req: Request, res: Response) => {
  try {
    const parsed = sendTestEmailSchema.parse(req.body);

    if (!isAllowedTestRecipient(parsed.to)) {
      return res.status(403).json({
        success: false,
        error: 'Envio de teste nao autorizado para este destinatario.',
      });
    }

    const template = parsed.template === 'operational'
      ? buildOperationalNoticeTemplate({
          title: parsed.title || 'Aviso Operacional',
          message: parsed.message || 'Mensagem operacional de teste do KAVIAR.',
        })
      : buildKaviarTestEmailTemplate();

    const result = await emailService.sendMail({
      to: parsed.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
      from: parsed.from || 'KAVIAR <no-reply@kaviar.com.br>',
    });

    if (!result.ok) {
      return res.status(502).json({
        success: false,
        error: 'Falha no envio SMTP. Verifique configuracao do provider e conectividade.',
        data: {
          provider: result.provider,
          from: result.from,
        },
      });
    }

    const runtime = emailService.getRuntimeInfo();

    return res.json({
      success: true,
      message: 'Solicitacao de envio processada.',
      data: {
        to: parsed.to,
        template: parsed.template,
        from: result.from,
        provider: result.provider,
        providerDefault: runtime.provider,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }

    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

router.post('/send', handleOfficialAttachmentsUpload, async (req: Request, res: Response) => {
  const ctx = auditCtx(req as any);
  const auditEntityId = `admin-email-${Date.now()}`;
  const admin = (req as any).admin;
  const adminId = String(admin?.id || ctx.adminId || '');
  const adminEmail = (admin?.email || ctx.adminEmail || null) as string | null;

  try {
    const parsed = parseOfficialRequestBody(req);
    const files = ((req.files as Express.Multer.File[]) || []);

    if (files.length > MAX_ATTACHMENTS) {
      return res.status(400).json({
        success: false,
        error: 'Voce pode enviar no maximo 3 anexos por email.',
      });
    }

    const attachments = mapAttachments(files);
    const attachmentMetadata = buildAttachmentMetadata(attachments);

    const normalizedTo = normalizeEmailList(parsed.to);
    const normalizedSubject = parsed.subject.trim();
    const normalizedMessage = parsed.message.trim();
    const sender = parseSender(parsed.from);
    const normalizedCc = normalizeEmailList(parsed.cc);
    const normalizedBcc = normalizeEmailList(parsed.bcc);

    // Validação: header injection
    const allEmails = [...normalizedTo, ...normalizedCc, ...normalizedBcc];
    for (const email of allEmails) {
      if (containsHeaderInjection(email)) {
        return res.status(400).json({ success: false, error: 'Endereco de email contem caracteres invalidos.' });
      }
    }
    if (containsHeaderInjection(normalizedSubject)) {
      return res.status(400).json({ success: false, error: 'Assunto contem caracteres invalidos.' });
    }

    // Validação: duplicatas cruzadas
    const dupError = findDuplicateBetweenLists(normalizedTo, normalizedCc, normalizedBcc);
    if (dupError) {
      return res.status(400).json({ success: false, error: dupError });
    }

    const html = `<div style="font-family: Arial, Helvetica, sans-serif; color: #111; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(normalizedMessage).replace(/\n/g, '<br/>')}</div>`;

    const result = await emailService.sendMail({
      to: normalizedTo[0],
      subject: normalizedSubject,
      text: normalizedMessage,
      html,
      from: parsed.from,
      cc: normalizedCc.length ? normalizedCc : undefined,
      bcc: normalizedBcc.length ? normalizedBcc : undefined,
      additionalTo: normalizedTo.length > 1 ? normalizedTo.slice(1) : undefined,
      attachments,
    });

    const toDisplay = normalizedTo.join(', ');

    if (!result.ok) {
      await writeEmailSendLog({
        adminId,
        adminEmail,
        fromEmail: sender.fromEmail,
        fromName: sender.fromName,
        toEmail: toDisplay,
        ccEmail: normalizedCc.length ? normalizedCc.join(', ') : null,
        bccEmail: normalizedBcc.length ? normalizedBcc.join(', ') : null,
        subject: normalizedSubject,
        provider: result.provider,
        status: EMAIL_LOG_STATUS.ERROR,
        errorMessage: result.error || 'send_failed',
        attachmentMetadata,
        providerMessageId: result.messageId || null,
      });

      await writeAuditSafely({
        adminId: ctx.adminId,
        adminEmail: ctx.adminEmail,
        action: 'admin_email_send_failed',
        entityType: 'admin_email',
        entityId: auditEntityId,
        newValue: {
          from: parsed.from,
          to: toDisplay,
          cc: normalizedCc.length ? normalizedCc : undefined,
          bcc: normalizedBcc.length ? normalizedBcc : undefined,
          subject: normalizedSubject,
          provider: result.provider,
          attachments: attachmentMetadata,
          status: 'error',
          error: result.error || 'send_failed',
        },
        ipAddress: ctx.ip,
        userAgent: ctx.ua,
      });

      return res.status(502).json({
        success: false,
        error: 'Falha no envio de email oficial. Verifique provider e conectividade.',
        data: {
          provider: result.provider,
          from: result.from,
          to: toDisplay,
          subject: normalizedSubject,
          attachments: attachmentMetadata,
        },
      });
    }

    await writeEmailSendLog({
      adminId,
      adminEmail,
      fromEmail: sender.fromEmail,
      fromName: sender.fromName,
      toEmail: toDisplay,
      ccEmail: normalizedCc.length ? normalizedCc.join(', ') : null,
      bccEmail: normalizedBcc.length ? normalizedBcc.join(', ') : null,
      subject: normalizedSubject,
      provider: result.provider,
      status: EMAIL_LOG_STATUS.SENT,
      attachmentMetadata,
      providerMessageId: result.messageId || null,
    });

    await writeAuditSafely({
      adminId: ctx.adminId,
      adminEmail: ctx.adminEmail,
      action: 'admin_email_send_success',
      entityType: 'admin_email',
      entityId: auditEntityId,
      newValue: {
        from: result.from,
        to: toDisplay,
        cc: normalizedCc.length ? normalizedCc : undefined,
        bcc: normalizedBcc.length ? normalizedBcc : undefined,
        subject: normalizedSubject,
        provider: result.provider,
        attachments: attachmentMetadata,
        status: 'success',
        providerMessageId: result.messageId || null,
      },
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
    });

    return res.json({
      success: true,
      message: 'Email oficial enviado com sucesso.',
      data: {
        status: 'success',
        provider: result.provider,
        from: result.from,
        to: toDisplay,
        subject: normalizedSubject,
        attachments: attachmentMetadata,
        messageId: result.messageId || null,
      },
    });
  } catch (error) {
    const body = req.body || {};
    const sender = typeof body.from === 'string' ? parseSender(body.from) : { fromEmail: 'unknown@kaviar.com.br', fromName: null };

    if (adminId) {
      await writeEmailSendLog({
        adminId,
        adminEmail,
        fromEmail: sender.fromEmail,
        fromName: sender.fromName,
        toEmail: typeof body.to === 'string' ? body.to.trim().toLowerCase() : 'invalid_to',
        subject: typeof body.subject === 'string' ? body.subject.trim().slice(0, 180) : 'invalid_subject',
        provider: emailService.getRuntimeInfo().provider,
        status: EMAIL_LOG_STATUS.ERROR,
        errorMessage: (error as Error)?.message || 'unknown_error',
        attachmentMetadata: [],
      });
    }

    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0].message });
    }

    await writeAuditSafely({
      adminId: ctx.adminId,
      adminEmail: ctx.adminEmail,
      action: 'admin_email_send_exception',
      entityType: 'admin_email',
      entityId: auditEntityId,
      newValue: {
        status: 'error',
        error: (error as Error).message,
      },
      ipAddress: ctx.ip,
      userAgent: ctx.ua,
    });

    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

router.get('/logs', async (req: Request, res: Response) => {
  try {
    const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
    const requestedLimit = parseInt(String(req.query.limit || String(MAX_LOG_LIMIT)), 10) || MAX_LOG_LIMIT;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_LOG_LIMIT);
    const where: any = {};

    if (req.query.to) {
      where.to_email = { contains: String(req.query.to).trim().toLowerCase(), mode: 'insensitive' };
    }

    if (req.query.from) {
      where.from_email = { contains: String(req.query.from).trim().toLowerCase(), mode: 'insensitive' };
    }

    if (req.query.status) {
      const status = normalizeLogStatus(req.query.status);
      if (!status) {
        return res.status(400).json({ success: false, error: 'Filtro status invalido. Use SENT ou ERROR.' });
      }
      where.status = status;
    }

    const dateFromRaw = req.query.date_from ? new Date(String(req.query.date_from)) : null;
    const dateToRaw = req.query.date_to ? new Date(String(req.query.date_to)) : null;

    if (dateFromRaw && Number.isNaN(dateFromRaw.getTime())) {
      return res.status(400).json({ success: false, error: 'date_from invalido.' });
    }

    if (dateToRaw && Number.isNaN(dateToRaw.getTime())) {
      return res.status(400).json({ success: false, error: 'date_to invalido.' });
    }

    if (dateFromRaw || dateToRaw) {
      where.created_at = {};
      if (dateFromRaw) where.created_at.gte = dateFromRaw;
      if (dateToRaw) where.created_at.lte = dateToRaw;
    }

    const [logs, total] = await Promise.all([
      prisma.email_send_logs.findMany({
        where,
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.email_send_logs.count({ where }),
    ]);

    return res.json({
      success: true,
      data: logs.map(serializeEmailSendLog),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  } catch (error) {
    if (isEmailSendLogsTableMissing(error)) {
      console.warn('[ADMIN_EMAIL_LOGS_TABLE_MISSING] migration pendente para email_send_logs');
      return res.json({
        success: true,
        data: [],
        pagination: {
          page: 1,
          limit: 50,
          total: 0,
          totalPages: 1,
        },
        warning: 'Historico temporariamente indisponivel. Execute a migration pendente para habilitar os logs.',
      });
    }

    console.error('[ADMIN_EMAIL_LOGS_ERROR]', error);
    return res.status(500).json({ success: false, error: 'Erro ao carregar historico de envios oficiais.' });
  }
});

export default router;
