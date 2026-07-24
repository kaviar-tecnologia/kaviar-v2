import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authenticateAdmin, requireSuperAdmin } from '../middlewares/auth';
import { prisma } from '../lib/prisma';
import { emailService } from '../services/email/email.service';
import { InboundAttachmentValidationError, inboundEmailAttachmentsService } from '../services/inbound-email-attachments.service';
import {
  EMAIL_LOG_STATUS,
  MAX_ATTACHMENTS,
  buildAttachmentMetadata,
  escapeHtml,
  handleOfficialAttachmentsUpload,
  isAttachmentValidationError,
  mapAttachments,
  normalizeEmailBodyLineEndings,
  parseSender,
  writeEmailSendLog,
} from '../services/email/official-email-support';
import { buildInboundReplyPreview, InboundReplyPreview } from '../services/email/inbound-email-reply.service';
import { evaluateInboundEmailSecurityRisk } from '../services/email/inbound-email-security-risk';
import { audit, auditCtx } from '../utils/audit';

const router = Router();

const MAX_LIMIT = 50;
const INBOUND_STATUSES = {
  NEW: 'NEW',
  READ: 'READ',
  ARCHIVED: 'ARCHIVED',
} as const;

type InboundStatus = typeof INBOUND_STATUSES[keyof typeof INBOUND_STATUSES];

const patchStatusSchema = z.object({
  status: z.enum(['NEW', 'READ', 'ARCHIVED']),
});

const replyInboundEmailSchema = z.object({
  message: z.string().trim().min(3, 'Mensagem obrigatoria').max(12000, 'Mensagem muito longa'),
  cc: z.array(z.string().email('Email de CC invalido')).max(10, 'Maximo de 10 destinatarios em CC').optional(),
  bcc: z.array(z.string().email('Email de CCO invalido')).max(10, 'Maximo de 10 destinatarios em CCO').optional(),
});

function normalizeStatus(raw: unknown): InboundStatus | null {
  if (typeof raw !== 'string') return null;
  const status = raw.trim().toUpperCase();
  if (status === INBOUND_STATUSES.NEW || status === INBOUND_STATUSES.READ || status === INBOUND_STATUSES.ARCHIVED) {
    return status;
  }
  return null;
}

function normalizeOptionalText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function isInboundTableMissing(error: unknown): boolean {
  const code = (error as any)?.code;
  if (code === 'P2021') return true;

  const message = String((error as any)?.message || '').toLowerCase();
  return message.includes('inbound_email_messages') && (message.includes('does not exist') || message.includes('relation') || message.includes('table'));
}

function serializeReplyPreview(replyPreview: InboundReplyPreview) {
  return {
    allowed: replyPreview.allowed,
    to: replyPreview.to,
    from: replyPreview.from,
    subject: replyPreview.subject,
    in_reply_to: replyPreview.inReplyTo,
    references: replyPreview.references,
    blocked_reason: replyPreview.blockedReason,
  };
}

function serializeInboundEmail(item: any) {
  const replyPreview = buildInboundReplyPreview(item);
  const securityRisk = evaluateInboundEmailSecurityRisk(item);

  return {
    id: item.id,
    received_at: item.received_at,
    from_email: item.from_email,
    from_name: item.from_name,
    to_email: item.to_email,
    subject: item.subject,
    text_body: item.text_body,
    html_body: item.html_body,
    normalized_body: item.normalized_body,
    message_id: item.message_id,
    in_reply_to: item.in_reply_to,
    references_header: item.references_header,
    provider: item.provider,
    status: item.status,
    has_attachments: item.has_attachments,
    attachment_count: item.attachment_count,
    attachments: Array.isArray(item.attachments)
      ? item.attachments.map((attachment: any) => ({
          id: attachment.id,
          filename: attachment.filename,
          contentType: attachment.content_type,
          sizeBytes: attachment.size_bytes,
        }))
      : [],
    attachments_metadata: Array.isArray(item.attachments_metadata) ? item.attachments_metadata : null,
    raw_headers: item.raw_headers && typeof item.raw_headers === 'object' ? item.raw_headers : null,
    security_risk: securityRisk,
    reply_preview: serializeReplyPreview(replyPreview),
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

function serializeInboundListItem(item: any) {
  return {
    id: item.id,
    received_at: item.received_at,
    from_email: item.from_email,
    from_name: item.from_name,
    to_email: item.to_email,
    subject: item.subject,
    status: item.status,
    provider: item.provider,
    has_attachments: item.has_attachments,
    attachment_count: item.attachment_count,
    message_id: item.message_id,
    created_at: item.created_at,
    updated_at: item.updated_at,
    security_risk: evaluateInboundEmailSecurityRisk(item),
  };
}

async function writeAuditSafely(payload: Parameters<typeof audit>[0]) {
  try {
    await audit(payload);
  } catch (auditError) {
    console.error('[ADMIN_INBOUND_EMAIL_AUDIT_WRITE_FAILED]', auditError);
  }
}

router.use(authenticateAdmin, requireSuperAdmin);

router.get('/', async (req: Request, res: Response) => {
  try {
    const page = Math.max(parseInt(String(req.query.page || '1'), 10) || 1, 1);
    const requestedLimit = parseInt(String(req.query.limit || String(MAX_LIMIT)), 10) || MAX_LIMIT;
    const limit = Math.min(Math.max(requestedLimit, 1), MAX_LIMIT);
    const where: any = {};

    const status = normalizeStatus(req.query.status);
    if (req.query.status && !status) {
      return res.status(400).json({ success: false, error: 'Filtro status invalido. Use NEW, READ ou ARCHIVED.' });
    }
    if (status) {
      where.status = status;
    }

    if (req.query.to) {
      where.to_email = { contains: String(req.query.to).trim().toLowerCase(), mode: 'insensitive' };
    }

    if (req.query.from) {
      where.from_email = { contains: String(req.query.from).trim().toLowerCase(), mode: 'insensitive' };
    }

    const query = normalizeOptionalText(req.query.q);
    if (query) {
      where.OR = [
        { subject: { contains: query, mode: 'insensitive' } },
        { from_email: { contains: query, mode: 'insensitive' } },
        { from_name: { contains: query, mode: 'insensitive' } },
      ];
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
      where.received_at = {};
      if (dateFromRaw) where.received_at.gte = dateFromRaw;
      if (dateToRaw) where.received_at.lte = dateToRaw;
    }

    const [rows, total] = await Promise.all([
      prisma.inbound_email_messages.findMany({
        where,
        orderBy: { received_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          received_at: true,
          from_email: true,
          from_name: true,
          to_email: true,
          subject: true,
          status: true,
          provider: true,
          has_attachments: true,
          attachment_count: true,
          message_id: true,
          text_body: true,
          html_body: true,
          normalized_body: true,
          raw_headers: true,
          created_at: true,
          updated_at: true,
        },
      }),
      prisma.inbound_email_messages.count({ where }),
    ]);

    return res.json({
      success: true,
      data: rows.map(serializeInboundListItem),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.max(Math.ceil(total / limit), 1),
      },
    });
  } catch (error) {
    if (isInboundTableMissing(error)) {
      console.warn('[ADMIN_INBOUND_EMAIL_TABLE_MISSING] migration pendente para inbound_email_messages');
      return res.json({
        success: true,
        data: [],
        pagination: {
          page: 1,
          limit: 50,
          total: 0,
          totalPages: 1,
        },
        warning: 'Inbox temporariamente indisponivel. Execute a migration pendente.',
      });
    }

    console.error('[ADMIN_INBOUND_EMAILS_LIST_ERROR]', error);
    return res.status(500).json({ success: false, error: 'Erro ao listar caixa de entrada institucional.' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const item = await prisma.inbound_email_messages.findUnique({
      where: { id },
      include: {
        attachments: {
          where: { status: 'AVAILABLE' },
          orderBy: { created_at: 'asc' },
          select: {
            id: true,
            filename: true,
            content_type: true,
            size_bytes: true,
          },
        },
      },
    });

    if (!item) {
      return res.status(404).json({ success: false, error: 'Email inbound nao encontrado.' });
    }

    return res.json({ success: true, data: serializeInboundEmail(item) });
  } catch (error) {
    if (isInboundTableMissing(error)) {
      return res.status(503).json({ success: false, error: 'Inbox indisponivel ate aplicar migration.' });
    }

    console.error('[ADMIN_INBOUND_EMAILS_GET_ERROR]', error);
    return res.status(500).json({ success: false, error: 'Erro ao carregar email inbound.' });
  }
});

router.get('/:id/attachments/:attachmentId/download', async (req: Request, res: Response) => {
  try {
    const result = await inboundEmailAttachmentsService.createDownloadUrlForMessage(
      String(req.params.id || ''),
      String(req.params.attachmentId || '')
    );
    return res.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof InboundAttachmentValidationError) {
      return res.status(error.statusCode).json({ success: false, error: error.message });
    }

    console.error('[ADMIN_INBOUND_EMAILS_ATTACHMENT_DOWNLOAD_ERROR]', error);
    return res.status(500).json({ success: false, error: 'Erro ao gerar download temporario do anexo.' });
  }
});

router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const id = String(req.params.id || '');
    const parsed = patchStatusSchema.parse(req.body || {});

    const updated = await prisma.inbound_email_messages.update({
      where: { id },
      data: { status: parsed.status },
    });

    return res.json({ success: true, data: serializeInboundEmail(updated) });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0]?.message || 'Payload invalido.' });
    }

    if ((error as any)?.code === 'P2025') {
      return res.status(404).json({ success: false, error: 'Email inbound nao encontrado.' });
    }

    if (isInboundTableMissing(error)) {
      return res.status(503).json({ success: false, error: 'Inbox indisponivel ate aplicar migration.' });
    }

    console.error('[ADMIN_INBOUND_EMAILS_PATCH_ERROR]', error);
    return res.status(500).json({ success: false, error: 'Erro ao atualizar status do email inbound.' });
  }
});

router.post('/:id/reply', handleOfficialAttachmentsUpload, async (req: Request, res: Response) => {
  const ctx = auditCtx(req as any);
  const auditEntityId = `inbound-email-reply-${Date.now()}`;
  const admin = (req as any).admin;
  const adminId = String(admin?.id || ctx.adminId || '');
  const adminEmail = (admin?.email || ctx.adminEmail || null) as string | null;
  let inboundEmail: any = null;
  let replyPreview: InboundReplyPreview | null = null;
  let attachmentMetadata: ReturnType<typeof buildAttachmentMetadata> = [];

  try {
    const id = String(req.params.id || '');
    inboundEmail = await prisma.inbound_email_messages.findUnique({ where: { id } });

    if (!inboundEmail) {
      return res.status(404).json({ success: false, error: 'Email inbound nao encontrado.' });
    }

    replyPreview = buildInboundReplyPreview(inboundEmail);
    if (!replyPreview.allowed || !replyPreview.from || !replyPreview.inReplyTo) {
      return res.status(400).json({
        success: false,
        error: replyPreview.blockedReason || 'Reply indisponivel para este email.',
        data: {
          replyPreview: serializeReplyPreview(replyPreview),
        },
      });
    }

    const rawBody = req.body || {};
    const parsed = replyInboundEmailSchema.parse({
      message: rawBody.message,
      cc: Array.isArray(rawBody.cc) ? rawBody.cc : (rawBody.cc ? [rawBody.cc] : undefined),
      bcc: Array.isArray(rawBody.bcc) ? rawBody.bcc : (rawBody.bcc ? [rawBody.bcc] : undefined),
    });
    const files = ((req.files as Express.Multer.File[]) || []);

    if (files.length > MAX_ATTACHMENTS) {
      return res.status(400).json({
        success: false,
        error: 'Voce pode enviar no maximo 3 anexos por email.',
      });
    }

    const attachments = mapAttachments(files);
    attachmentMetadata = buildAttachmentMetadata(attachments);
    const normalizedMessage = normalizeEmailBodyLineEndings(parsed.message).trim();
    const normalizedCc = (parsed.cc || []).map((e: string) => e.trim().toLowerCase()).filter(Boolean);
    const normalizedBcc = (parsed.bcc || []).map((e: string) => e.trim().toLowerCase()).filter(Boolean);
    const sender = parseSender(replyPreview.from);
    const html = `<div style="font-family: Arial, Helvetica, sans-serif; color: #111; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(normalizedMessage).replace(/\n/g, '<br/>')}</div>`;

    const result = await emailService.sendMail({
      to: replyPreview.to,
      subject: replyPreview.subject,
      text: normalizedMessage,
      html,
      from: replyPreview.from,
      cc: normalizedCc.length ? normalizedCc : undefined,
      bcc: normalizedBcc.length ? normalizedBcc : undefined,
      inReplyTo: replyPreview.inReplyTo,
      references: replyPreview.references,
      attachments,
    });

    if (!result.ok) {
      await writeEmailSendLog({
        adminId,
        adminEmail,
        fromEmail: sender.fromEmail,
        fromName: sender.fromName,
        toEmail: replyPreview.to,
        ccEmail: normalizedCc.length ? normalizedCc.join(', ') : null,
        bccEmail: normalizedBcc.length ? normalizedBcc.join(', ') : null,
        subject: replyPreview.subject,
        provider: result.provider,
        status: EMAIL_LOG_STATUS.ERROR,
        errorMessage: result.error || 'send_failed',
        attachmentMetadata,
        providerMessageId: result.messageId || null,
        replyToInboundEmailId: inboundEmail.id,
      });

      await writeAuditSafely({
        adminId: ctx.adminId,
        adminEmail: ctx.adminEmail,
        action: 'admin_inbound_email_reply_failed',
        entityType: 'inbound_email_reply',
        entityId: auditEntityId,
        newValue: {
          inboundEmailId: inboundEmail.id,
          to: replyPreview.to,
          from: replyPreview.from,
          subject: replyPreview.subject,
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
        error: 'Falha no envio da resposta por email. Verifique provider e conectividade.',
        data: {
          provider: result.provider,
          from: result.from,
          to: replyPreview.to,
          subject: replyPreview.subject,
          attachments: attachmentMetadata,
          replyToInboundEmailId: inboundEmail.id,
        },
      });
    }

    await writeEmailSendLog({
      adminId,
      adminEmail,
      fromEmail: sender.fromEmail,
      fromName: sender.fromName,
      toEmail: replyPreview.to,
      ccEmail: normalizedCc.length ? normalizedCc.join(', ') : null,
      bccEmail: normalizedBcc.length ? normalizedBcc.join(', ') : null,
      subject: replyPreview.subject,
      provider: result.provider,
      status: EMAIL_LOG_STATUS.SENT,
      attachmentMetadata,
      providerMessageId: result.messageId || null,
      replyToInboundEmailId: inboundEmail.id,
    });

    await writeAuditSafely({
      adminId: ctx.adminId,
      adminEmail: ctx.adminEmail,
      action: 'admin_inbound_email_reply_success',
      entityType: 'inbound_email_reply',
      entityId: auditEntityId,
      newValue: {
        inboundEmailId: inboundEmail.id,
        to: replyPreview.to,
        from: result.from,
        subject: replyPreview.subject,
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
      message: 'Resposta enviada com sucesso.',
      data: {
        status: 'success',
        provider: result.provider,
        from: result.from,
        to: replyPreview.to,
        subject: replyPreview.subject,
        attachments: attachmentMetadata,
        messageId: result.messageId || null,
        replyToInboundEmailId: inboundEmail.id,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ success: false, error: error.errors[0]?.message || 'Payload invalido.' });
    }

    if (isInboundTableMissing(error)) {
      return res.status(503).json({ success: false, error: 'Inbox indisponivel ate aplicar migration.' });
    }

    if (isAttachmentValidationError(error)) {
      return res.status(400).json({ success: false, error: (error as Error).message });
    }

    if (adminId && inboundEmail && replyPreview?.from) {
      const sender = parseSender(replyPreview.from);
      await writeEmailSendLog({
        adminId,
        adminEmail,
        fromEmail: sender.fromEmail,
        fromName: sender.fromName,
        toEmail: replyPreview.to,
        subject: replyPreview.subject,
        provider: emailService.getRuntimeInfo().provider,
        status: EMAIL_LOG_STATUS.ERROR,
        errorMessage: (error as Error)?.message || 'unknown_error',
        attachmentMetadata,
        replyToInboundEmailId: inboundEmail.id,
      });
    }

    console.error('[ADMIN_INBOUND_EMAILS_REPLY_ERROR]', error);
    return res.status(500).json({ success: false, error: 'Erro ao responder email inbound.' });
  }
});

export default router;
