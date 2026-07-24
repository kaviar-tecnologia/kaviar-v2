import path from 'path';
import multer from 'multer';
import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../lib/prisma';

export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_SIZE_BYTES = 5 * 1024 * 1024;
export const EMAIL_LOG_STATUS = {
  SENT: 'SENT',
  ERROR: 'ERROR',
} as const;
const ALLOWED_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);
const ALLOWED_ATTACHMENT_EXTENSIONS_BY_MIME: Record<string, string[]> = {
  'application/pdf': ['.pdf'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
};
const BLOCKED_EXTENSIONS = new Set([
  '.exe',
  '.zip',
  '.js',
  '.html',
  '.htm',
  '.docm',
  '.bat',
  '.cmd',
  '.com',
  '.msi',
  '.scr',
  '.ps1',
  '.vbs',
  '.jar',
  '.sh',
]);

const uploadOfficialAttachments = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_ATTACHMENT_SIZE_BYTES,
    files: MAX_ATTACHMENTS,
  },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (BLOCKED_EXTENSIONS.has(ext)) {
      cb(new Error(`Tipo de arquivo bloqueado: ${ext}`));
      return;
    }

    if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
      cb(new Error('Tipo de arquivo nao permitido. Use apenas PDF, JPG ou PNG.'));
      return;
    }

    cb(null, true);
  },
});

export type OfficialEmailAttachment = {
  filename: string;
  content: Buffer;
  contentType: string;
  size: number;
};

export type EmailAttachmentMetadata = {
  filename: string;
  contentType: string;
  size: number;
};

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sanitizeAttachmentFilename(originalName: string, mimeType: string, index: number): string {
  const baseName = path.basename(originalName || `anexo-${index + 1}`);
  const originalExt = path.extname(baseName).toLowerCase();
  const allowedExts = ALLOWED_ATTACHMENT_EXTENSIONS_BY_MIME[mimeType] || [];
  const selectedExt = allowedExts.includes(originalExt) ? originalExt : (allowedExts[0] || '');

  const rawWithoutExt = originalExt ? baseName.slice(0, -originalExt.length) : baseName;
  const asciiOnly = rawWithoutExt
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_\- ]+/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '');

  const safeBase = (asciiOnly || `anexo-${index + 1}`).slice(0, 80);
  return `${safeBase}${selectedExt}`;
}

export function mapAttachments(files: Express.Multer.File[]): OfficialEmailAttachment[] {
  return files.map((file, index) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExts = ALLOWED_ATTACHMENT_EXTENSIONS_BY_MIME[file.mimetype] || [];

    if (BLOCKED_EXTENSIONS.has(ext)) {
      throw new Error(`Tipo de arquivo bloqueado: ${ext}`);
    }

    if (!ALLOWED_ATTACHMENT_MIME_TYPES.has(file.mimetype)) {
      throw new Error('Tipo de arquivo nao permitido. Use apenas PDF, JPG ou PNG.');
    }

    if (!allowedExts.includes(ext)) {
      throw new Error(`Extensao nao permitida para ${file.mimetype}.`);
    }

    return {
      filename: sanitizeAttachmentFilename(file.originalname, file.mimetype, index),
      content: file.buffer,
      contentType: file.mimetype,
      size: file.size,
    };
  });
}

export function buildAttachmentMetadata(attachments: OfficialEmailAttachment[]): EmailAttachmentMetadata[] {
  return attachments.map((attachment) => ({
    filename: attachment.filename,
    size: attachment.size,
    contentType: attachment.contentType,
  }));
}

export function parseSender(value: string): { fromEmail: string; fromName: string | null } {
  const trimmed = (value || '').trim();
  const matched = trimmed.match(/^(.*)<([^>]+)>$/);
  if (matched) {
    const fromName = matched[1].trim().replace(/^"|"$/g, '');
    const fromEmail = matched[2].trim().toLowerCase();
    return {
      fromEmail,
      fromName: fromName || null,
    };
  }

  return {
    fromEmail: trimmed.toLowerCase(),
    fromName: null,
  };
}

export function isAttachmentValidationError(error: unknown): boolean {
  const message = String((error as Error)?.message || '');
  return message.includes('Tipo de arquivo bloqueado:')
    || message.includes('Tipo de arquivo nao permitido.')
    || message.includes('Extensao nao permitida para');
}

export async function writeEmailSendLog(params: {
  adminId: string;
  adminEmail: string | null;
  fromEmail: string;
  fromName: string | null;
  toEmail: string;
  ccEmail?: string | null;
  bccEmail?: string | null;
  subject: string;
  provider: string;
  status: typeof EMAIL_LOG_STATUS[keyof typeof EMAIL_LOG_STATUS];
  errorMessage?: string | null;
  attachmentMetadata: EmailAttachmentMetadata[];
  providerMessageId?: string | null;
  replyToInboundEmailId?: string | null;
}) {
  try {
    await prisma.email_send_logs.create({
      data: {
        admin_id: params.adminId,
        admin_email: params.adminEmail,
        from_email: params.fromEmail,
        from_name: params.fromName,
        to_email: params.toEmail,
        cc_email: params.ccEmail || null,
        bcc_email: params.bccEmail || null,
        subject: params.subject,
        provider: params.provider,
        status: params.status,
        error_message: params.errorMessage || null,
        attachment_count: params.attachmentMetadata.length,
        attachments_metadata: params.attachmentMetadata.length ? params.attachmentMetadata : undefined,
        provider_message_id: params.providerMessageId || null,
        reply_to_inbound_email_id: params.replyToInboundEmailId || null,
      },
    });
  } catch (logError) {
    console.error('[ADMIN_EMAIL_LOG_WRITE_FAILED]', logError);
  }
}

export function isEmailSendLogsTableMissing(error: unknown): boolean {
  const code = (error as any)?.code;
  if (code === 'P2021') return true;

  const message = String((error as any)?.message || '').toLowerCase();
  return message.includes('email_send_logs') && (message.includes('does not exist') || message.includes('relation') || message.includes('table'));
}

export function handleOfficialAttachmentsUpload(req: Request, res: Response, next: NextFunction): void {
  uploadOfficialAttachments.array('attachments', MAX_ATTACHMENTS)(req, res, (err: any) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({
          success: false,
          error: 'Cada anexo pode ter no maximo 5 MB.',
        });
        return;
      }

      if (err.code === 'LIMIT_FILE_COUNT') {
        res.status(400).json({
          success: false,
          error: 'Voce pode enviar no maximo 3 anexos por email.',
        });
        return;
      }

      res.status(400).json({
        success: false,
        error: 'Falha ao processar anexos. Revise os arquivos e tente novamente.',
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: err?.message || 'Arquivo invalido. Use somente PDF, JPG ou PNG.',
    });
  });
}
