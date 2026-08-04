import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma: any = {
    accountants: { findUnique: vi.fn() },
    accountant_invites: {
      updateMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  };
  return { mockPrisma };
});

vi.mock('../src/lib/prisma', () => ({ prisma: mockPrisma }));

import {
  createInvite,
  revokeInvite,
  getInviteByToken,
  markAccepted,
} from '../src/services/accounting/accounting-invites.service';

describe('Accounting Invites Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createInvite', () => {
    it('should store token hash (not raw token)', async () => {
      const fakeAccountant = { id: 'acc-1', nome_completo: 'Test' };
      mockPrisma.accountants.findUnique.mockResolvedValue(fakeAccountant);

      let createdData: any = null;
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          accountant_invites: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            create: vi.fn().mockImplementation((args: any) => {
              createdData = args.data;
              return {
                id: 'inv-1',
                ...args.data,
                accountant: fakeAccountant,
                created_by_admin: { id: 'admin-1', name: 'Admin', role: 'SUPER_ADMIN' },
              };
            }),
          },
          $executeRaw: vi.fn(),
        };
        return fn(tx);
      });

      const result = await createInvite('acc-1', 'admin-1', '127.0.0.1', 'test-agent');

      // Raw token is returned
      expect(result.rawToken).toBeDefined();
      expect(result.rawToken.length).toBe(64); // 32 bytes hex

      // Stored value is hash, not raw
      const expectedHash = crypto.createHash('sha256').update(result.rawToken).digest('hex');
      expect(createdData.token_hash).toBe(expectedHash);
      expect(createdData.token_hash).not.toBe(result.rawToken);
    });

    it('should set PENDING status on creation', async () => {
      const fakeAccountant = { id: 'acc-1', nome_completo: 'Test' };
      mockPrisma.accountants.findUnique.mockResolvedValue(fakeAccountant);

      let createdData: any = null;
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          accountant_invites: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            create: vi.fn().mockImplementation((args: any) => {
              createdData = args.data;
              return {
                id: 'inv-1',
                ...args.data,
                accountant: fakeAccountant,
                created_by_admin: { id: 'admin-1', name: 'Admin', role: 'SUPER_ADMIN' },
              };
            }),
          },
          $executeRaw: vi.fn(),
        };
        return fn(tx);
      });

      await createInvite('acc-1', 'admin-1');
      expect(createdData.status).toBe('PENDING');
    });

    it('should revoke previous PENDING invite on re-send', async () => {
      const fakeAccountant = { id: 'acc-1', nome_completo: 'Test' };
      mockPrisma.accountants.findUnique.mockResolvedValue(fakeAccountant);

      let updateManyCalledWith: any = null;
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          accountant_invites: {
            updateMany: vi.fn().mockImplementation((args: any) => {
              updateManyCalledWith = args;
              return { count: 1 };
            }),
            create: vi.fn().mockResolvedValue({
              id: 'inv-2',
              accountant: fakeAccountant,
              created_by_admin: { id: 'admin-1', name: 'Admin', role: 'SUPER_ADMIN' },
            }),
          },
          $executeRaw: vi.fn(),
        };
        return fn(tx);
      });

      await createInvite('acc-1', 'admin-1');

      expect(updateManyCalledWith).toBeDefined();
      expect(updateManyCalledWith.where.accountant_id).toBe('acc-1');
      expect(updateManyCalledWith.where.status).toBe('PENDING');
      expect(updateManyCalledWith.data.status).toBe('REVOKED');
    });

    it('should throw if accountant not found', async () => {
      mockPrisma.accountants.findUnique.mockResolvedValue(null);

      await expect(createInvite('nonexistent', 'admin-1')).rejects.toThrow('Contador não encontrado');
    });
  });

  describe('markAccepted', () => {
    it('should not accept a REVOKED invite', async () => {
      mockPrisma.accountant_invites.findUnique.mockResolvedValue({
        id: 'inv-1',
        status: 'REVOKED',
        expires_at: new Date(Date.now() + 1000 * 60 * 60),
      });

      await expect(markAccepted('inv-1')).rejects.toThrow('Somente convites pendentes podem ser aceitos');
    });

    it('should not accept an expired invite', async () => {
      mockPrisma.accountant_invites.findUnique.mockResolvedValue({
        id: 'inv-1',
        status: 'PENDING',
        expires_at: new Date(Date.now() - 1000), // expired
      });
      mockPrisma.accountant_invites.update.mockResolvedValue({
        id: 'inv-1',
        status: 'EXPIRED',
      });

      await expect(markAccepted('inv-1')).rejects.toThrow('Convite expirado');
    });
  });

  describe('getInviteByToken', () => {
    it('should hash the provided token to find matching invite', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      mockPrisma.accountant_invites.findFirst.mockImplementation((args: any) => {
        // Verify it searches by hash
        expect(args.where.token_hash).toBe(expectedHash);
        return {
          id: 'inv-1',
          token_hash: expectedHash,
          status: 'PENDING',
          expires_at: new Date(Date.now() + 1000 * 60 * 60),
          accountant: { id: 'acc-1' },
          created_by_admin: { id: 'admin-1', name: 'Admin', role: 'SUPER_ADMIN' },
        };
      });

      const result = await getInviteByToken(rawToken);
      expect(result).not.toBeNull();
      expect(result!.id).toBe('inv-1');
    });

    it('should return null for expired invite and mark it EXPIRED', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');

      mockPrisma.accountant_invites.findFirst.mockResolvedValue({
        id: 'inv-1',
        status: 'PENDING',
        expires_at: new Date(Date.now() - 1000), // expired
        accountant: { id: 'acc-1' },
        created_by_admin: { id: 'admin-1', name: 'Admin', role: 'SUPER_ADMIN' },
      });
      mockPrisma.accountant_invites.update.mockResolvedValue({});

      const result = await getInviteByToken(rawToken);
      expect(result).toBeNull();
      expect(mockPrisma.accountant_invites.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-1' },
          data: { status: 'EXPIRED' },
        }),
      );
    });
  });
});
