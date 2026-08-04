import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma: any = {
    accountants: { findUnique: vi.fn(), update: vi.fn() },
    accountant_sessions: { updateMany: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  };
  return { mockPrisma };
});

vi.mock('../src/lib/prisma', () => ({ prisma: mockPrisma }));

import { logout, logoutAll } from '../src/services/accounting/accounting-auth.service';

describe('Accounting Auth - Admin Actions & Logout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('logout', () => {
    it('should revoke the current session', async () => {
      const session = { id: 'session-1', accountant_id: 'acc-1', status: 'ACTIVE' };
      mockPrisma.accountant_sessions.findFirst = vi.fn().mockResolvedValue(session);
      mockPrisma.accountant_sessions.update = vi.fn().mockResolvedValue(session);

      // Use real prisma mock since logout doesn't use $transaction
      const { prisma } = await import('../src/lib/prisma');
      (prisma as any).accountant_sessions = {
        findFirst: vi.fn().mockResolvedValue(session),
        update: vi.fn().mockResolvedValue(session),
      };

      await logout('session-1', 'acc-1');

      expect((prisma as any).accountant_sessions.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'REVOKED',
            revocation_reason: 'USER_LOGOUT',
          }),
        })
      );
    });

    it('should be idempotent if session not found', async () => {
      const { prisma } = await import('../src/lib/prisma');
      (prisma as any).accountant_sessions = {
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      };

      // Should not throw
      await logout('nonexistent-session', 'acc-1');

      expect((prisma as any).accountant_sessions.update).not.toHaveBeenCalled();
    });
  });

  describe('logoutAll', () => {
    it('should revoke all active sessions for accountant', async () => {
      const { prisma } = await import('../src/lib/prisma');
      (prisma as any).accountant_sessions = {
        updateMany: vi.fn().mockResolvedValue({ count: 3 }),
      };

      await logoutAll('acc-1', 'ADMIN_REVOKE');

      expect((prisma as any).accountant_sessions.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { accountant_id: 'acc-1', status: 'ACTIVE' },
          data: expect.objectContaining({
            status: 'REVOKED',
            revocation_reason: 'ADMIN_REVOKE',
          }),
        })
      );
    });

    it('should use LOGOUT_ALL as default reason', async () => {
      const { prisma } = await import('../src/lib/prisma');
      (prisma as any).accountant_sessions = {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      };

      await logoutAll('acc-1');

      expect((prisma as any).accountant_sessions.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            revocation_reason: 'LOGOUT_ALL',
          }),
        })
      );
    });
  });
});

describe('Accounting Password Validation', () => {
  let validatePassword: typeof import('../src/services/accounting/accounting-password.service').validatePassword;

  beforeEach(async () => {
    const mod = await import('../src/services/accounting/accounting-password.service');
    validatePassword = mod.validatePassword;
  });

  it('should reject passwords shorter than 15 chars', () => {
    const result = validatePassword('short123');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('mínimo'))).toBe(true);
  });

  it('should reject passwords longer than 128 chars', () => {
    const result = validatePassword('a'.repeat(129));
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('máximo'))).toBe(true);
  });

  it('should reject password equal to email', () => {
    const result = validatePassword('test@example.com', 'test@example.com');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('email'))).toBe(true);
  });

  it('should reject password equal to CPF', () => {
    const result = validatePassword('12345678901234567890', undefined, '123.456.789-01');
    // The CPF digits would be 12345678901 which is not the same as the password
    // Let's test with exact match
    const result2 = validatePassword('12345678901', undefined, '123.456.789-01');
    expect(result2.valid).toBe(false);
    expect(result2.errors.some(e => e.includes('CPF'))).toBe(true);
  });

  it('should accept valid passwords', () => {
    const result = validatePassword('MySecurePassw0rd!2024');
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject empty password', () => {
    const result = validatePassword('');
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('obrigatória'))).toBe(true);
  });
});

describe('Accounting Token Service', () => {
  let tokenService: typeof import('../src/services/accounting/accounting-token.service');

  beforeEach(async () => {
    process.env.ACCOUNTANT_JWT_SECRET = 'test-secret-key-for-accountant';
    tokenService = await import('../src/services/accounting/accounting-token.service');
  });

  it('should generate and verify access token', () => {
    const token = tokenService.generateAccessToken('acc-1', 'session-1');
    const payload = tokenService.verifyAccessToken(token);

    expect(payload.userId).toBe('acc-1');
    expect(payload.sessionId).toBe('session-1');
    expect(payload.userType).toBe('ACCOUNTANT');
    expect(payload.iss).toBe('kaviar-accounting');
    expect(payload.aud).toBe('kaviar-accountant-portal');
  });

  it('should generate refresh token with 64 hex chars', () => {
    const token = tokenService.generateRefreshToken();
    expect(token.length).toBe(64);
    expect(/^[0-9a-f]+$/.test(token)).toBe(true);
  });

  it('should hash token with SHA-256', () => {
    const raw = 'test-token';
    const hash = tokenService.hashToken(raw);
    expect(hash.length).toBe(64);
    expect(hash).not.toBe(raw);

    // Deterministic
    expect(tokenService.hashToken(raw)).toBe(hash);
  });

  it('should reject token with wrong secret', () => {
    const token = tokenService.generateAccessToken('acc-1', 'session-1');
    process.env.ACCOUNTANT_JWT_SECRET = 'different-secret';

    // Secret is read dynamically, so changing env should cause verification to fail
    expect(() => tokenService.verifyAccessToken(token)).toThrow();

    // Restore for other tests
    process.env.ACCOUNTANT_JWT_SECRET = 'test-secret-key-for-accountant';
  });
});
