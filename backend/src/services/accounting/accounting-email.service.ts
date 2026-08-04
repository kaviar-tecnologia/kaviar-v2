/**
 * Accounting portal email sending service.
 * Handles invite and password reset emails with proper logging and tracking.
 *
 * SECURITY:
 * - rawToken is NEVER logged
 * - Email addresses are masked in log output
 */

import { emailService } from '../email/email.service';
import { prisma } from '../../lib/prisma';
import { buildInviteEmail, buildReinviteEmail, buildPasswordResetEmail } from './accounting-email-templates';

const PORTAL_BASE_URL = process.env.ACCOUNTING_PORTAL_URL || 'https://admin.kaviar.com.br';
const FROM_ADDRESS = 'KAVIAR <no-reply@kaviar.com.br>';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***@***';
  const masked = local.length > 2 ? `${local[0]}***${local[local.length - 1]}` : '***';
  return `${masked}@${domain}`;
}

export async function sendInviteEmail(params: {
  accountantId: string;
  inviteId: string;
  accountantName: string;
  accountantEmail: string;
  rawToken: string;
  adminName: string;
  adminId: string;
  isReinvite?: boolean;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const activationUrl = `${PORTAL_BASE_URL}/contador/ativar#token=${params.rawToken}`;
  const expiresInHours = 48;

  const template = params.isReinvite
    ? buildReinviteEmail({
        nome: params.accountantName,
        activationUrl,
        expiresInHours,
      })
    : buildInviteEmail({
        nome: params.accountantName,
        activationUrl,
        adminName: params.adminName,
        expiresInHours,
      });

  const maskedEmail = maskEmail(params.accountantEmail);
  console.log(`[ACCOUNTING_EMAIL] Sending invite to=${maskedEmail} inviteId=${params.inviteId}`);

  try {
    const result = await emailService.sendMail({
      to: params.accountantEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
      from: FROM_ADDRESS,
    });

    // Log in email_send_logs
    let logId: string | undefined;
    try {
      const log = await prisma.email_send_logs.create({
        data: {
          admin_id: params.adminId,
          from_email: 'no-reply@kaviar.com.br',
          from_name: 'KAVIAR',
          to_email: params.accountantEmail,
          subject: template.subject,
          provider: result.provider || 'cloudflare',
          status: result.ok ? 'SENT' : 'FAILED',
          error_message: result.error || null,
          provider_message_id: result.messageId || null,
        },
      });
      logId = log.id;
    } catch (logError) {
      console.error(`[ACCOUNTING_EMAIL] Failed to write email_send_logs: ${(logError as Error).message}`);
    }

    // Update invite tracking
    try {
      await prisma.accountant_invites.update({
        where: { id: params.inviteId },
        data: {
          last_email_sent_at: new Date(),
          last_email_status: result.ok ? 'SENT' : 'FAILED',
          last_email_error: result.error || null,
          last_email_log_id: logId || null,
        },
      });
    } catch (updateError) {
      console.error(`[ACCOUNTING_EMAIL] Failed to update invite status: ${(updateError as Error).message}`);
    }

    if (result.ok) {
      console.log(`[ACCOUNTING_EMAIL] Invite sent successfully to=${maskedEmail} messageId=${result.messageId || 'N/A'}`);
      return { ok: true, messageId: result.messageId };
    } else {
      console.error(`[ACCOUNTING_EMAIL] Invite send failed to=${maskedEmail} error=${result.error}`);
      return { ok: false, error: result.error };
    }
  } catch (error) {
    const errorMessage = (error as Error).message;
    console.error(`[ACCOUNTING_EMAIL] Unexpected error sending invite to=${maskedEmail} error=${errorMessage}`);

    // Try to update invite status even on unexpected failure
    try {
      await prisma.accountant_invites.update({
        where: { id: params.inviteId },
        data: {
          last_email_sent_at: new Date(),
          last_email_status: 'FAILED',
          last_email_error: errorMessage,
        },
      });
    } catch {
      // Swallow — best effort
    }

    return { ok: false, error: errorMessage };
  }
}

export async function sendPasswordResetEmail(params: {
  accountantId: string;
  accountantEmail: string;
  accountantName: string;
  rawToken: string;
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const resetUrl = `${PORTAL_BASE_URL}/contador/recuperar#token=${params.rawToken}`;
  const expiresInMinutes = 30;

  const template = buildPasswordResetEmail({
    nome: params.accountantName,
    resetUrl,
    expiresInMinutes,
  });

  const maskedEmail = maskEmail(params.accountantEmail);
  console.log(`[ACCOUNTING_EMAIL] Sending password reset to=${maskedEmail}`);

  try {
    const result = await emailService.sendMail({
      to: params.accountantEmail,
      subject: template.subject,
      html: template.html,
      text: template.text,
      from: FROM_ADDRESS,
    });

    if (result.ok) {
      console.log(`[ACCOUNTING_EMAIL] Password reset sent to=${maskedEmail} messageId=${result.messageId || 'N/A'}`);
      return { ok: true, messageId: result.messageId };
    } else {
      console.error(`[ACCOUNTING_EMAIL] Password reset failed to=${maskedEmail} error=${result.error}`);
      return { ok: false, error: result.error };
    }
  } catch (error) {
    const errorMessage = (error as Error).message;
    console.error(`[ACCOUNTING_EMAIL] Unexpected error sending password reset to=${maskedEmail} error=${errorMessage}`);
    return { ok: false, error: errorMessage };
  }
}
