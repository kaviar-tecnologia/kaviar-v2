import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma: any = {
    accountant_sessions: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  };
  return { mockPrisma };
});

vi.mock('../src/lib/prisma', () => ({ prisma: mockPrisma }));

import { refreshSession, AccountingAuthError } from '../src/services/accounting/accounting-auth.service';

describe('Accounting Auth - Refresh Session', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const ip = '192.168.1.1';
  const userAgent = 'Mozilla/5.0';

  function makeSession(overrides = {}) {
    return {
      id: 'session-1',
      accountant_id: 'acc-1',
      token_family_id: 'family-1',
      refresh_token_hash: crypto.createHash('sha256').update('valid-refresh-token').digest('hex'),
      generation: 1,
      status: 'ACTIVE',
      scope: 'WEB',
      device_name: 'Chrome',
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      accountant: {
        id: 'acc-1',
        email: 'test@test.com',
        nome_completo: 'Test',
        status: 'ACTIVE',
      },
      ...overrides,
    };
  }

  it('should rotate session and return new tokens', async () => {
    const session = makeSession();

    mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
      const tx = {
        accountant_sessions: {
          findFirst: vi.fn().mockResolvedValue(session),
          update: vi.fn().mockResolvedValue(session),
          updateMany: vi.fn(),
          create: vi.fn().mockImplementation((args: any) => ({
            id: 'session-2',
            ...args.data,
          })),
        },
        $executeRaw: vi.fn(),
      };
      return fn(tx);
    });

    const result = await refreshSession('valid-refresh-token', ip, userAgent);

    expect(result.accessToken).toBeDefined();
    expect(result.refreshTokenRaw).toBeDefined();
    expect(result.refreshTokenRaw).not.toBe('valid-refresh-token'); // New token
  });

  it('should reject if refresh token is empty', async () => {
    await expect(refreshSession('', ip, userAgent))
      .rejects.toThrow('Refresh token é obrigatório');
  });

  it('should reject if session not found', async () => {
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
      const tx = {
        accountant_sessions: {
          findFirst: vi.fn().mockResolvedValue(null),
          update: vi.fn(),
          updateMany: vi.fn(),
          create: vi.fn(),
        },
        $executeRaw: vi.fn(),
      };
      return fn(tx);
    });

    await expect(refreshSession('invalid-token', ip, userAgent))
      .rejects.toThrow('Sessão inválida');
  });

  it('should detect token reuse and revoke family', async () => {
    const session = makeSession({ status: 'ROTATED' }); // Already rotated

    mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
      const tx = {
        accountant_sessions: {
          findFirst: vi.fn().mockResolvedValue(session),
          update: vi.fn(),
          updateMany: vi.fn(),
          create: vi.fn(),
        },
        $executeRaw: vi.fn(),
      };
      return fn(tx);
    });

    await expect(refreshSession('valid-refresh-token', ip, userAgent))
      .rejects.toThrow('Reutilização de token detectada');
  });

  it('should reject if session is expired', async () => {
    const session = makeSession({ expires_at: new Date(Date.now() - 1000) });

    mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
      const tx = {
        accountant_sessions: {
          findFirst: vi.fn().mockResolvedValue(session),
          update: vi.fn().mockResolvedValue(session),
          updateMany: vi.fn(),
          create: vi.fn(),
        },
        $executeRaw: vi.fn(),
      };
      return fn(tx);
    });

    await expect(refreshSession('valid-refresh-token', ip, userAgent))
      .rejects.toThrow('Sessão expirada');
  });

  it('should reject if accountant is not ACTIVE', async () => {
    const session = makeSession({
      accountant: { id: 'acc-1', email: 'test@test.com', nome_completo: 'Test', status: 'SUSPENDED' },
    });

    mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
      const tx = {
        accountant_sessions: {
          findFirst: vi.fn().mockResolvedValue(session),
          update: vi.fn(),
          updateMany: vi.fn(),
          create: vi.fn(),
        },
        $executeRaw: vi.fn(),
      };
      return fn(tx);
    });

    await expect(refreshSession('valid-refresh-token', ip, userAgent))
      .rejects.toThrow('Conta não está ativa');
  });

  it('should increment generation on rotation', async () => {
    const session = makeSession({ generation: 3 });

    let createdData: any;
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
      const tx = {
        accountant_sessions: {
          findFirst: vi.fn().mockResolvedValue(session),
          update: vi.fn().mockResolvedValue(session),
          updateMany: vi.fn(),
          create: vi.fn().mockImplementation((args: any) => {
            createdData = args.data;
            return { id: 'session-new', ...args.data };
          }),
        },
        $executeRaw: vi.fn(),
      };
      return fn(tx);
    });

    await refreshSession('valid-refresh-token', ip, userAgent);

    expect(createdData.generation).toBe(4);
    expect(createdData.parent_session_id).toBe('session-1');
  });
});
