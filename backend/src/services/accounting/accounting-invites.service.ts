import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { EntityValidationError } from './accounting-entities.service';
import { writeAccountingAuditTx } from './accounting-audit';

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export async function createInvite(accountantId: string, adminId: string, ip?: string, userAgent?: string) {
  // Validate accountant exists
  const accountant = await prisma.accountants.findUnique({ where: { id: accountantId } });
  if (!accountant) {
    throw new EntityValidationError('Contador não encontrado');
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h

  const invite = await prisma.$transaction(async (tx) => {
    // Revoke any existing PENDING invite for same accountant
    await tx.accountant_invites.updateMany({
      where: { accountant_id: accountantId, status: 'PENDING' },
      data: { status: 'REVOKED', revoked_at: new Date() },
    });

    const created = await tx.accountant_invites.create({
      data: {
        accountant_id: accountantId,
        token_hash: tokenHash,
        status: 'PENDING',
        expires_at: expiresAt,
        created_by_admin_id: adminId,
      },
      include: {
        accountant: true,
        created_by_admin: { select: { id: true, name: true, role: true } },
      },
    });

    await writeAccountingAuditTx(tx, {
      adminId,
      action: 'CREATE_ACCOUNTANT_INVITE',
      entityType: 'accountant_invite',
      entityId: created.id,
      newValue: { accountant_id: accountantId },
      ipAddress: ip,
      userAgent,
    });

    return created;
  });

  return { invite, rawToken };
}

export async function revokeInvite(inviteId: string, adminId: string, ip?: string, userAgent?: string) {
  const invite = await prisma.accountant_invites.findUnique({ where: { id: inviteId } });
  if (!invite) {
    throw new EntityValidationError('Convite não encontrado');
  }
  if (invite.status !== 'PENDING') {
    throw new EntityValidationError('Somente convites pendentes podem ser revogados');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.accountant_invites.update({
      where: { id: inviteId },
      data: { status: 'REVOKED', revoked_at: new Date() },
      include: {
        accountant: true,
        created_by_admin: { select: { id: true, name: true, role: true } },
      },
    });

    await writeAccountingAuditTx(tx, {
      adminId,
      action: 'REVOKE_ACCOUNTANT_INVITE',
      entityType: 'accountant_invite',
      entityId: inviteId,
      oldValue: { status: 'PENDING' },
      newValue: { status: 'REVOKED' },
      ipAddress: ip,
      userAgent,
    });

    return updated;
  });
}

export async function getInviteByToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);

  const invite = await prisma.accountant_invites.findFirst({
    where: { token_hash: tokenHash, status: 'PENDING' },
    include: {
      accountant: true,
      created_by_admin: { select: { id: true, name: true, role: true } },
    },
  });

  if (!invite) return null;

  // Check expiration
  if (new Date() > invite.expires_at) {
    // Mark as expired
    await prisma.accountant_invites.update({
      where: { id: invite.id },
      data: { status: 'EXPIRED' },
    });
    return null;
  }

  return invite;
}

export async function markAccepted(inviteId: string) {
  const invite = await prisma.accountant_invites.findUnique({ where: { id: inviteId } });
  if (!invite) {
    throw new EntityValidationError('Convite não encontrado');
  }
  if (invite.status !== 'PENDING') {
    throw new EntityValidationError('Somente convites pendentes podem ser aceitos');
  }
  if (new Date() > invite.expires_at) {
    await prisma.accountant_invites.update({
      where: { id: inviteId },
      data: { status: 'EXPIRED' },
    });
    throw new EntityValidationError('Convite expirado');
  }

  return prisma.accountant_invites.update({
    where: { id: inviteId },
    data: { status: 'ACCEPTED', accepted_at: new Date() },
    include: {
      accountant: true,
      created_by_admin: { select: { id: true, name: true, role: true } },
    },
  });
}
