import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma: any = {
    accountants: { findUnique: vi.fn(), update: vi.fn() },
    accountant_invites: {
      findFirst: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    accountant_sessions: { create: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  };
  return { mockPrisma };
});

vi.mock('../src/lib/prisma', () => ({ prisma: mockPrisma }));

import { activateAccount, AccountingAuthError } from '../src/services/accounting/accounting-auth.service';

describe('Accounting Auth - Activate Account', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validPassword = 'SuperSecurePass!2024x';
  const ip = '192.168.1.1';
  const userAgent = 'Mozilla/5.0 test';

  function makeAccountant(overrides = {}) {
    return {
      id: 'acc-1',
      email: 'contador@email.com',
      cpf: '12345678901',
      nome_completo: 'Test Accountant',
      status: 'INVITED',
      password_hash: null,
      password_version: 1,
      failed_login_count: 0,
      ...overrides,
    };
  }

  function makeInvite(accountant: any, overrides = {}) {
    return {
      id: 'inv-1',
      accountant_id: accountant.id,
      token_hash: crypto.createHash('sha256').update('valid-token').digest('hex'),
      status: 'PENDING',
      expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000),
      accountant,
      ...overrides,
    };
  }

  it('should activate account with valid token and password', async () => {
    const accountant = makeAccountant();
    const invite = makeInvite(accountant);

    mockPrisma.accountant_invites.findFirst.mockResolvedValue(invite);

    let sessionCreated: any = null;
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
      const tx = {
        accountant_invites: { update: vi.fn().mockResolvedValue(invite) },
        accountants: { update: vi.fn().mockResolvedValue({ ...accountant, status: 'ACTIVE' }) },
        accountant_sessions: {
          create: vi.fn().mockImplementation((args: any) => {
            sessionCreated = { id: 'session-1', ...args.data };
            return sessionCreated;
          }),
        },
        $executeRaw: vi.fn(),
      };
      return fn(tx);
    });

    const result = await activateAccount('valid-token', validPassword, validPassword, ip, userAgent);

    expect(result.accessToken).toBeDefined();
    expect(result.refreshTokenRaw).toBeDefined();
    expect(result.refreshTokenRaw.length).toBe(64);
    expect(result.accountant.status).toBe('ACTIVE');
  });

  it('should reject if token is missing', async () => {
    await expect(activateAccount('', validPassword, validPassword, ip, userAgent))
      .rejects.toThrow(AccountingAuthError);
  });

  it('should reject if passwords do not match', async () => {
    await expect(activateAccount('some-token', validPassword, 'differentPassword!!', ip, userAgent))
      .rejects.toThrow('Senhas não conferem');
  });

  it('should reject if invite not found', async () => {
    mockPrisma.accountant_invites.findFirst.mockResolvedValue(null);

    await expect(activateAccount('invalid-token', validPassword, validPassword, ip, userAgent))
      .rejects.toThrow('Convite inválido ou expirado');
  });

  it('should reject if invite is expired', async () => {
    const accountant = makeAccountant();
    const invite = makeInvite(accountant, { expires_at: new Date(Date.now() - 1000) });

    mockPrisma.accountant_invites.findFirst.mockResolvedValue(invite);
    mockPrisma.accountant_invites.update.mockResolvedValue(invite);

    await expect(activateAccount('valid-token', validPassword, validPassword, ip, userAgent))
      .rejects.toThrow('Convite expirado');
  });

  it('should reject weak passwords (too short)', async () => {
    const accountant = makeAccountant();
    const invite = makeInvite(accountant);

    mockPrisma.accountant_invites.findFirst.mockResolvedValue(invite);

    await expect(activateAccount('valid-token', 'short', 'short', ip, userAgent))
      .rejects.toThrow('mínimo');
  });

  it('should reject password equal to email', async () => {
    const accountant = makeAccountant({ email: 'test@example.com' });
    const invite = makeInvite(accountant);

    mockPrisma.accountant_invites.findFirst.mockResolvedValue(invite);

    await expect(activateAccount('valid-token', 'test@example.com', 'test@example.com', ip, userAgent))
      .rejects.toThrow('email');
  });

  it('should store hashed refresh token, not raw', async () => {
    const accountant = makeAccountant();
    const invite = makeInvite(accountant);

    mockPrisma.accountant_invites.findFirst.mockResolvedValue(invite);

    let storedHash: string = '';
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
      const tx = {
        accountant_invites: { update: vi.fn().mockResolvedValue(invite) },
        accountants: { update: vi.fn().mockResolvedValue({ ...accountant, status: 'ACTIVE' }) },
        accountant_sessions: {
          create: vi.fn().mockImplementation((args: any) => {
            storedHash = args.data.refresh_token_hash;
            return { id: 'session-1', ...args.data };
          }),
        },
        $executeRaw: vi.fn(),
      };
      return fn(tx);
    });

    const result = await activateAccount('valid-token', validPassword, validPassword, ip, userAgent);

    // Verify that stored hash matches SHA-256 of the raw token
    const expectedHash = crypto.createHash('sha256').update(result.refreshTokenRaw).digest('hex');
    expect(storedHash).toBe(expectedHash);
    expect(storedHash).not.toBe(result.refreshTokenRaw);
  });
});
