import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { validatePassword, hashPassword, verifyPassword } from './accounting-password.service';
import { generateAccessToken, generateRefreshToken, hashToken } from './accounting-token.service';
import { writeAccountingAuditTx } from './accounting-audit';

const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_FAILED_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const RESET_TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

export class AccountingAuthError extends Error {
  constructor(public code: string, message: string, public statusCode: number = 400) {
    super(message);
    this.name = 'AccountingAuthError';
  }
}

// ═══════════════════════════════════════════════════════════════════
// activateAccount
// ═══════════════════════════════════════════════════════════════════

export async function activateAccount(
  token: string,
  password: string,
  passwordConfirmation: string,
  ip?: string,
  userAgent?: string
) {
  if (!token) {
    throw new AccountingAuthError('INVALID_TOKEN', 'Token é obrigatório');
  }

  if (password !== passwordConfirmation) {
    throw new AccountingAuthError('PASSWORD_MISMATCH', 'Senhas não conferem');
  }

  const tokenHash = hashToken(token);

  const invite = await prisma.accountant_invites.findFirst({
    where: { token_hash: tokenHash, status: 'PENDING' },
    include: { accountant: true },
  });

  if (!invite) {
    throw new AccountingAuthError('INVALID_TOKEN', 'Convite inválido ou expirado', 401);
  }

  if (new Date() > invite.expires_at) {
    await prisma.accountant_invites.update({
      where: { id: invite.id },
      data: { status: 'EXPIRED' },
    });
    throw new AccountingAuthError('TOKEN_EXPIRED', 'Convite expirado', 401);
  }

  const accountant = invite.accountant;

  // Validate password
  const validation = validatePassword(password, accountant.email, accountant.cpf);
  if (!validation.valid) {
    throw new AccountingAuthError('WEAK_PASSWORD', validation.errors.join('. '));
  }

  const passwordHash = await hashPassword(password);

  const result = await prisma.$transaction(async (tx) => {
    // Mark invite as accepted
    await tx.accountant_invites.update({
      where: { id: invite.id },
      data: {
        status: 'ACCEPTED',
        accepted_at: new Date(),
        accepted_ip: ip || null,
        accepted_user_agent: userAgent || null,
      },
    });

    // Activate accountant
    const updatedAccountant = await tx.accountants.update({
      where: { id: accountant.id },
      data: {
        status: 'ACTIVE',
        password_hash: passwordHash,
        password_changed_at: new Date(),
        password_version: 1,
        activated_at: new Date(),
        terms_accepted_at: new Date(),
        last_login_at: new Date(),
        failed_login_count: 0,
        locked_until: null,
      },
    });

    // Create session
    const refreshTokenRaw = generateRefreshToken();
    const refreshTokenHash = hashToken(refreshTokenRaw);
    const tokenFamilyId = crypto.randomUUID();

    const session = await tx.accountant_sessions.create({
      data: {
        accountant_id: accountant.id,
        token_family_id: tokenFamilyId,
        refresh_token_hash: refreshTokenHash,
        generation: 1,
        status: 'ACTIVE',
        scope: 'WEB',
        ip_address: ip || null,
        user_agent: userAgent || null,
        created_ip: ip || null,
        last_activity_at: new Date(),
        expires_at: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
      },
    });

    const accessToken = generateAccessToken(accountant.id, session.id);

    await writeAccountingAuditTx(tx, {
      adminId: accountant.id,
      action: 'ACCOUNTANT_ACTIVATE',
      entityType: 'accountant',
      entityId: accountant.id,
      newValue: { status: 'ACTIVE', invite_id: invite.id },
      ipAddress: ip,
      userAgent,
    });

    return { accountant: updatedAccountant, session, accessToken, refreshTokenRaw };
  });

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// login
// ═══════════════════════════════════════════════════════════════════

export async function login(
  email: string,
  password: string,
  ip?: string,
  userAgent?: string,
  deviceName?: string
) {
  if (!email || !password) {
    throw new AccountingAuthError('INVALID_CREDENTIALS', 'Email e senha são obrigatórios');
  }

  const accountant = await prisma.accountants.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!accountant || !accountant.password_hash) {
    throw new AccountingAuthError('INVALID_CREDENTIALS', 'Email ou senha inválidos', 401);
  }

  // Check if locked
  if (accountant.locked_until && new Date() < accountant.locked_until) {
    throw new AccountingAuthError('ACCOUNT_LOCKED', 'Conta bloqueada temporariamente. Tente novamente mais tarde.', 423);
  }

  // Check status
  if (accountant.status !== 'ACTIVE') {
    throw new AccountingAuthError('ACCOUNT_INACTIVE', 'Conta não está ativa', 403);
  }

  // Verify password
  const valid = await verifyPassword(password, accountant.password_hash);
  if (!valid) {
    // Increment failed attempts
    const newCount = accountant.failed_login_count + 1;
    const lockUntil = newCount >= MAX_FAILED_LOGIN_ATTEMPTS
      ? new Date(Date.now() + LOCK_DURATION_MS)
      : null;

    await prisma.accountants.update({
      where: { id: accountant.id },
      data: {
        failed_login_count: newCount,
        locked_until: lockUntil,
      },
    });

    throw new AccountingAuthError('INVALID_CREDENTIALS', 'Email ou senha inválidos', 401);
  }

  // Success: create session in transaction
  const result = await prisma.$transaction(async (tx) => {
    // Reset failed attempts
    await tx.accountants.update({
      where: { id: accountant.id },
      data: {
        failed_login_count: 0,
        locked_until: null,
        last_login_at: new Date(),
      },
    });

    const refreshTokenRaw = generateRefreshToken();
    const refreshTokenHash = hashToken(refreshTokenRaw);
    const tokenFamilyId = crypto.randomUUID();

    const session = await tx.accountant_sessions.create({
      data: {
        accountant_id: accountant.id,
        token_family_id: tokenFamilyId,
        refresh_token_hash: refreshTokenHash,
        generation: 1,
        status: 'ACTIVE',
        scope: 'WEB',
        device_name: deviceName || null,
        ip_address: ip || null,
        user_agent: userAgent || null,
        created_ip: ip || null,
        last_activity_at: new Date(),
        expires_at: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
      },
    });

    const accessToken = generateAccessToken(accountant.id, session.id);

    await writeAccountingAuditTx(tx, {
      adminId: accountant.id,
      action: 'ACCOUNTANT_LOGIN',
      entityType: 'accountant',
      entityId: accountant.id,
      newValue: { session_id: session.id, ip, device: deviceName },
      ipAddress: ip,
      userAgent,
    });

    return { accountant, session, accessToken, refreshTokenRaw };
  });

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// refreshSession
// ═══════════════════════════════════════════════════════════════════

export async function refreshSession(
  refreshTokenRaw: string,
  ip?: string,
  userAgent?: string
) {
  if (!refreshTokenRaw) {
    throw new AccountingAuthError('INVALID_TOKEN', 'Refresh token é obrigatório', 401);
  }

  const tokenHash = hashToken(refreshTokenRaw);

  const result = await prisma.$transaction(async (tx) => {
    // ATOMIC: Attempt to consume the session in a single conditional UPDATE.
    // Only one concurrent request can succeed because UPDATE takes a row lock.
    // If zero rows affected, the token was already rotated/revoked/expired.
    const consumed: any[] = await tx.$queryRaw`
      UPDATE accountant_sessions
      SET status = 'ROTATED', rotated_at = NOW()
      WHERE refresh_token_hash = ${tokenHash}
        AND status = 'ACTIVE'
        AND expires_at > NOW()
      RETURNING *
    `;

    if (consumed.length === 0) {
      // Token was not ACTIVE — check if it exists at all to determine reuse vs invalid
      const existing: any[] = await tx.$queryRaw`
        SELECT id, status, token_family_id, accountant_id
        FROM accountant_sessions
        WHERE refresh_token_hash = ${tokenHash}
        LIMIT 1
      `;

      if (existing.length > 0 && (existing[0].status === 'ROTATED' || existing[0].status === 'COMPROMISED')) {
        // TOKEN REUSE DETECTED — compromise entire family and COMMIT
        // We return a signal instead of throwing so the transaction commits the compromise.
        await tx.$executeRaw`
          UPDATE accountant_sessions
          SET status = 'COMPROMISED',
              revoked_at = NOW(),
              revocation_reason = 'TOKEN_REUSE_DETECTED',
              reuse_detected_at = NOW()
          WHERE token_family_id = ${existing[0].token_family_id}
            AND status IN ('ACTIVE', 'ROTATED')
        `;

        await writeAccountingAuditTx(tx, {
          adminId: existing[0].accountant_id,
          action: 'SESSION_REUSE_DETECTED',
          entityType: 'accountant_session',
          entityId: existing[0].id,
          newValue: { family_id: existing[0].token_family_id },
          ipAddress: ip,
          userAgent,
        });

        return { reuse: true } as const;
      }

      // Token expired or doesn't exist
      return { invalid: true } as const;
    }

    const rotatedSession = consumed[0];

    // Load accountant to check status
    const accountant = await tx.accountants.findUnique({
      where: { id: rotatedSession.accountant_id },
    });

    if (!accountant || accountant.status !== 'ACTIVE') {
      throw new AccountingAuthError('ACCOUNT_INACTIVE', 'Conta não está ativa', 403);
    }

    // Create new session in the same family
    const newRefreshTokenRaw = generateRefreshToken();
    const newRefreshTokenHash = hashToken(newRefreshTokenRaw);

    const newSession = await tx.accountant_sessions.create({
      data: {
        accountant_id: rotatedSession.accountant_id,
        token_family_id: rotatedSession.token_family_id,
        refresh_token_hash: newRefreshTokenHash,
        generation: rotatedSession.generation + 1,
        parent_session_id: rotatedSession.id,
        status: 'ACTIVE',
        scope: rotatedSession.scope || 'WEB',
        device_name: rotatedSession.device_name,
        ip_address: ip || null,
        user_agent: userAgent || null,
        created_ip: ip || null,
        last_activity_at: new Date(),
        expires_at: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
      },
    });

    // Update replaced_by on rotated session
    await tx.$executeRaw`
      UPDATE accountant_sessions
      SET replaced_by_id = ${newSession.id}
      WHERE id = ${rotatedSession.id}
    `;

    const accessToken = generateAccessToken(rotatedSession.accountant_id, newSession.id);

    await writeAccountingAuditTx(tx, {
      adminId: rotatedSession.accountant_id,
      action: 'SESSION_REFRESHED',
      entityType: 'accountant_session',
      entityId: newSession.id,
      newValue: { generation: newSession.generation, family_id: newSession.token_family_id },
      ipAddress: ip,
      userAgent,
    });

    return {
      accountant,
      session: newSession,
      accessToken,
      refreshTokenRaw: newRefreshTokenRaw,
    };
  });

  // Handle signals from the transaction (thrown AFTER commit to preserve DB state)
  if ('reuse' in result) {
    throw new AccountingAuthError('TOKEN_REUSE', 'Reutilização de token detectada', 401);
  }
  if ('invalid' in result) {
    throw new AccountingAuthError('INVALID_TOKEN', 'Sessão inválida ou expirada', 401);
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════
// logout
// ═══════════════════════════════════════════════════════════════════

export async function logout(sessionId: string, accountantId: string) {
  const session = await prisma.accountant_sessions.findFirst({
    where: { id: sessionId, accountant_id: accountantId, status: 'ACTIVE' },
  });

  if (!session) {
    // Already logged out or session not found — idempotent
    return;
  }

  await prisma.accountant_sessions.update({
    where: { id: session.id },
    data: {
      status: 'REVOKED',
      revoked_at: new Date(),
      revocation_reason: 'USER_LOGOUT',
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// logoutAll
// ═══════════════════════════════════════════════════════════════════

export async function logoutAll(accountantId: string, reason?: string) {
  await prisma.accountant_sessions.updateMany({
    where: { accountant_id: accountantId, status: 'ACTIVE' },
    data: {
      status: 'REVOKED',
      revoked_at: new Date(),
      revocation_reason: reason || 'LOGOUT_ALL',
    },
  });
}

// ═══════════════════════════════════════════════════════════════════
// forgotPassword
// ═══════════════════════════════════════════════════════════════════

export async function forgotPassword(email: string, ip?: string, userAgent?: string) {
  // Always return generic response regardless of whether email exists
  const accountant = await prisma.accountants.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  if (!accountant || accountant.status !== 'ACTIVE') {
    // Don't reveal if email exists
    return { message: 'Se o email estiver cadastrado, um link de recuperação será enviado.' };
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);

  await prisma.$transaction(async (tx) => {
    // Revoke any existing pending resets
    await tx.accountant_password_resets.updateMany({
      where: { accountant_id: accountant.id, status: 'PENDING' },
      data: { status: 'REVOKED', revoked_at: new Date() },
    });

    await tx.accountant_password_resets.create({
      data: {
        accountant_id: accountant.id,
        token_hash: tokenHash,
        status: 'PENDING',
        expires_at: new Date(Date.now() + RESET_TOKEN_EXPIRY_MS),
        requested_ip: ip || null,
        requested_user_agent: userAgent || null,
      },
    });

    await writeAccountingAuditTx(tx, {
      adminId: accountant.id,
      action: 'ACCOUNTANT_FORGOT_PASSWORD',
      entityType: 'accountant',
      entityId: accountant.id,
      newValue: { requested_from_ip: ip },
      ipAddress: ip,
      userAgent,
    });
  });

  // TODO: Send email with reset link containing rawToken
  // For now, return the token in non-production for testing
  const response: any = { message: 'Se o email estiver cadastrado, um link de recuperação será enviado.' };
  if (process.env.NODE_ENV !== 'production') {
    response._devToken = rawToken;
  }
  return response;
}

// ═══════════════════════════════════════════════════════════════════
// resetPassword
// ═══════════════════════════════════════════════════════════════════

export async function resetPassword(
  token: string,
  password: string,
  passwordConfirmation: string,
  ip?: string,
  userAgent?: string
) {
  if (!token) {
    throw new AccountingAuthError('INVALID_TOKEN', 'Token é obrigatório');
  }

  if (password !== passwordConfirmation) {
    throw new AccountingAuthError('PASSWORD_MISMATCH', 'Senhas não conferem');
  }

  const tokenHash = hashToken(token);

  const resetRecord = await prisma.accountant_password_resets.findFirst({
    where: { token_hash: tokenHash, status: 'PENDING' },
    include: { accountant: true },
  });

  if (!resetRecord) {
    throw new AccountingAuthError('INVALID_TOKEN', 'Token inválido ou expirado', 401);
  }

  if (new Date() > resetRecord.expires_at) {
    await prisma.accountant_password_resets.update({
      where: { id: resetRecord.id },
      data: { status: 'EXPIRED' },
    });
    throw new AccountingAuthError('TOKEN_EXPIRED', 'Token expirado', 401);
  }

  const accountant = resetRecord.accountant;

  // Validate password
  const validation = validatePassword(password, accountant.email, accountant.cpf);
  if (!validation.valid) {
    throw new AccountingAuthError('WEAK_PASSWORD', validation.errors.join('. '));
  }

  const passwordHash = await hashPassword(password);

  await prisma.$transaction(async (tx) => {
    // Mark reset as used
    await tx.accountant_password_resets.update({
      where: { id: resetRecord.id },
      data: {
        status: 'USED',
        used_at: new Date(),
        used_ip: ip || null,
      },
    });

    // Update password
    await tx.accountants.update({
      where: { id: accountant.id },
      data: {
        password_hash: passwordHash,
        password_changed_at: new Date(),
        password_version: accountant.password_version + 1,
        failed_login_count: 0,
        locked_until: null,
      },
    });

    // Revoke all active sessions
    await tx.accountant_sessions.updateMany({
      where: { accountant_id: accountant.id, status: 'ACTIVE' },
      data: {
        status: 'REVOKED',
        revoked_at: new Date(),
        revocation_reason: 'PASSWORD_RESET',
      },
    });

    await writeAccountingAuditTx(tx, {
      adminId: accountant.id,
      action: 'ACCOUNTANT_RESET_PASSWORD',
      entityType: 'accountant',
      entityId: accountant.id,
      newValue: { reset_id: resetRecord.id },
      ipAddress: ip,
      userAgent,
    });
  });

  return { success: true };
}
