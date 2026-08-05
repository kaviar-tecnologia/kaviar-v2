import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

const TOKEN_BYTES = 32; // 256-bit random token
const DEFAULT_EXPIRY_DAYS = 30; // valid until ~10 days after typical due date

/**
 * Generate a new access token for an obligation.
 * Revokes any existing active tokens for the same obligation.
 */
export async function generateObligationToken(
  obligationId: string,
  accountantId: string,
  expiryDays: number = DEFAULT_EXPIRY_DAYS
): Promise<{ token: string; expiresAt: Date }> {
  const rawToken = crypto.randomBytes(TOKEN_BYTES).toString('hex'); // 64-char hex
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  // Revoke existing active tokens for this obligation
  await prisma.accounting_obligation_access_tokens.updateMany({
    where: { obligation_id: obligationId, is_active: true },
    data: { is_active: false, revoked_at: new Date() },
  });

  // Create new token
  await prisma.accounting_obligation_access_tokens.create({
    data: {
      obligation_id: obligationId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by_accountant_id: accountantId,
    },
  });

  return { token: rawToken, expiresAt };
}

/**
 * Validate a token and return the obligation if valid.
 * Updates access count and last_accessed_at.
 */
export async function validateObligationToken(rawToken: string): Promise<{
  valid: boolean;
  obligation?: any;
  tokenRecord?: any;
  error?: string;
}> {
  if (!rawToken || rawToken.length !== 64) {
    return { valid: false, error: 'Token inválido' };
  }

  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const tokenRecord = await prisma.accounting_obligation_access_tokens.findUnique({
    where: { token_hash: tokenHash },
    include: {
      obligation: {
        include: {
          legal_entity: { select: { id: true, razao_social: true, cnpj: true } },
        },
      },
    },
  });

  if (!tokenRecord) return { valid: false, error: 'Token não encontrado' };
  if (!tokenRecord.is_active) return { valid: false, error: 'Token revogado' };
  if (new Date() > tokenRecord.expires_at) return { valid: false, error: 'Token expirado' };

  // Check if obligation is still actionable
  const closedStatuses = ['RECONCILED', 'CANCELED'];
  if (closedStatuses.includes(tokenRecord.obligation.status)) {
    return { valid: false, error: 'Obrigação já encerrada' };
  }

  // Update access stats
  await prisma.accounting_obligation_access_tokens.update({
    where: { id: tokenRecord.id },
    data: { accessed_count: { increment: 1 }, last_accessed_at: new Date() },
  });

  return { valid: true, obligation: tokenRecord.obligation, tokenRecord };
}

/**
 * Record an audit event for an obligation.
 */
export async function auditObligation(params: {
  obligationId: string;
  action: string;
  actorType: 'ACCOUNTANT' | 'COMPANY' | 'SYSTEM';
  actorId?: string;
  details?: any;
  ip?: string;
  userAgent?: string;
}) {
  await prisma.accounting_obligation_audit.create({
    data: {
      obligation_id: params.obligationId,
      action: params.action,
      actor_type: params.actorType,
      actor_id: params.actorId || null,
      details: params.details || undefined,
      ip_address: params.ip || null,
      user_agent: params.userAgent || null,
    },
  });
}

export { prisma };
