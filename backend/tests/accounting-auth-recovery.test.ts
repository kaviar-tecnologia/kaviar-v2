import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma: any = {
    accountants: { findUnique: vi.fn(), update: vi.fn() },
    accountant_password_resets: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    accountant_sessions: { updateMany: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  };
  return { mockPrisma };
});

vi.mock('../src/lib/prisma', () => ({ prisma: mockPrisma }));

import { forgotPassword, resetPassword, AccountingAuthError } from '../src/services/accounting/accounting-auth.service';

describe('Accounting Auth - Password Recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ip = '192.168.1.1';
  const userAgent = 'Mozilla/5.0';
  const validPassword = 'SuperSecurePass!2024x';

  describe('forgotPassword', () => {
    it('should return null when email does not exist (route handles generic message)', async () => {
      mockPrisma.accountants.findUnique.mockResolvedValue(null);

      const result = await forgotPassword('notfound@test.com', ip, userAgent);

      expect(result).toBeNull();
    });

    it('should return rawToken and accountant for valid email', async () => {
      const accountant = { id: 'acc-1', email: 'test@test.com', status: 'ACTIVE' };
      mockPrisma.accountants.findUnique.mockResolvedValue(accountant);

      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          accountant_password_resets: {
            updateMany: vi.fn(),
            create: vi.fn(),
          },
          $executeRaw: vi.fn(),
        };
        return fn(tx);
      });

      const result = await forgotPassword('test@test.com', ip, userAgent);

      expect(result).not.toBeNull();
      expect(result!.rawToken).toBeDefined();
      expect(result!.rawToken.length).toBe(64);
      expect(result!.accountant.id).toBe('acc-1');
    });

    it('should return null for inactive account (route handles generic message)', async () => {
      const accountant = { id: 'acc-1', email: 'test@test.com', status: 'SUSPENDED' };
      mockPrisma.accountants.findUnique.mockResolvedValue(accountant);

      const result = await forgotPassword('test@test.com', ip, userAgent);

      expect(result).toBeNull();
      // Should NOT create a reset token for inactive accounts
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should revoke existing pending resets when creating new one', async () => {
      const accountant = { id: 'acc-1', email: 'test@test.com', status: 'ACTIVE' };
      mockPrisma.accountants.findUnique.mockResolvedValue(accountant);

      let revokedPending = false;
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          accountant_password_resets: {
            updateMany: vi.fn().mockImplementation(() => {
              revokedPending = true;
              return { count: 1 };
            }),
            create: vi.fn(),
          },
          $executeRaw: vi.fn(),
        };
        return fn(tx);
      });

      await forgotPassword('test@test.com', ip, userAgent);

      expect(revokedPending).toBe(true);
    });
  });

  describe('resetPassword', () => {
    function makeResetRecord(overrides = {}) {
      return {
        id: 'reset-1',
        accountant_id: 'acc-1',
        token_hash: crypto.createHash('sha256').update('valid-reset-token').digest('hex'),
        status: 'PENDING',
        expires_at: new Date(Date.now() + 60 * 60 * 1000),
        accountant: {
          id: 'acc-1',
          email: 'test@test.com',
          cpf: '12345678901',
          password_version: 1,
        },
        ...overrides,
      };
    }

    it('should reset password with valid token', async () => {
      const resetRecord = makeResetRecord();
      mockPrisma.accountant_password_resets.findFirst.mockResolvedValue(resetRecord);

      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          accountant_password_resets: { update: vi.fn() },
          accountants: { update: vi.fn() },
          accountant_sessions: { updateMany: vi.fn() },
          $executeRaw: vi.fn(),
        };
        return fn(tx);
      });

      const result = await resetPassword('valid-reset-token', validPassword, validPassword, ip, userAgent);

      expect(result.success).toBe(true);
    });

    it('should reject if token is empty', async () => {
      await expect(resetPassword('', validPassword, validPassword, ip, userAgent))
        .rejects.toThrow('Token é obrigatório');
    });

    it('should reject if passwords do not match', async () => {
      await expect(resetPassword('token', validPassword, 'different!!', ip, userAgent))
        .rejects.toThrow('Senhas não conferem');
    });

    it('should reject if token not found', async () => {
      mockPrisma.accountant_password_resets.findFirst.mockResolvedValue(null);

      await expect(resetPassword('invalid-token', validPassword, validPassword, ip, userAgent))
        .rejects.toThrow('Token inválido ou expirado');
    });

    it('should reject if token is expired', async () => {
      const resetRecord = makeResetRecord({ expires_at: new Date(Date.now() - 1000) });
      mockPrisma.accountant_password_resets.findFirst.mockResolvedValue(resetRecord);
      mockPrisma.accountant_password_resets.update.mockResolvedValue(resetRecord);

      await expect(resetPassword('valid-reset-token', validPassword, validPassword, ip, userAgent))
        .rejects.toThrow('Token expirado');
    });

    it('should reject weak password on reset', async () => {
      const resetRecord = makeResetRecord();
      mockPrisma.accountant_password_resets.findFirst.mockResolvedValue(resetRecord);

      await expect(resetPassword('valid-reset-token', 'short', 'short', ip, userAgent))
        .rejects.toThrow('mínimo');
    });

    it('should revoke all sessions after password reset', async () => {
      const resetRecord = makeResetRecord();
      mockPrisma.accountant_password_resets.findFirst.mockResolvedValue(resetRecord);

      let sessionsRevoked = false;
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          accountant_password_resets: { update: vi.fn() },
          accountants: { update: vi.fn() },
          accountant_sessions: {
            updateMany: vi.fn().mockImplementation(() => {
              sessionsRevoked = true;
              return { count: 2 };
            }),
          },
          $executeRaw: vi.fn(),
        };
        return fn(tx);
      });

      await resetPassword('valid-reset-token', validPassword, validPassword, ip, userAgent);

      expect(sessionsRevoked).toBe(true);
    });

    it('should increment password_version on reset', async () => {
      const resetRecord = makeResetRecord();
      mockPrisma.accountant_password_resets.findFirst.mockResolvedValue(resetRecord);

      let updatedData: any;
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          accountant_password_resets: { update: vi.fn() },
          accountants: {
            update: vi.fn().mockImplementation((args: any) => {
              updatedData = args.data;
            }),
          },
          accountant_sessions: { updateMany: vi.fn() },
          $executeRaw: vi.fn(),
        };
        return fn(tx);
      });

      await resetPassword('valid-reset-token', validPassword, validPassword, ip, userAgent);

      expect(updatedData.password_version).toBe(2);
    });
  });
});
