import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma: any = {
    accountants: { findUnique: vi.fn(), update: vi.fn() },
    accountant_sessions: { create: vi.fn() },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  };
  return { mockPrisma };
});

vi.mock('../src/lib/prisma', () => ({ prisma: mockPrisma }));

import { login, AccountingAuthError } from '../src/services/accounting/accounting-auth.service';

describe('Accounting Auth - Login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validPassword = 'SuperSecurePass!2024x';
  const ip = '192.168.1.1';
  const userAgent = 'Mozilla/5.0';

  async function makeAccountant(overrides = {}) {
    const hash = await bcrypt.hash(validPassword, 4); // Low rounds for test speed
    return {
      id: 'acc-1',
      email: 'contador@test.com',
      cpf: '12345678901',
      nome_completo: 'Test Accountant',
      status: 'ACTIVE',
      is_active: true,
      password_hash: hash,
      password_version: 1,
      failed_login_count: 0,
      locked_until: null,
      ...overrides,
    };
  }

  it('should login with valid credentials', async () => {
    const accountant = await makeAccountant();
    mockPrisma.accountants.findUnique.mockResolvedValue(accountant);

    mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
      const tx = {
        accountants: { update: vi.fn().mockResolvedValue(accountant) },
        accountant_sessions: {
          create: vi.fn().mockImplementation((args: any) => ({
            id: 'session-1',
            ...args.data,
          })),
        },
        $executeRaw: vi.fn(),
      };
      return fn(tx);
    });

    const result = await login('contador@test.com', validPassword, ip, userAgent);

    expect(result.accessToken).toBeDefined();
    expect(result.refreshTokenRaw).toBeDefined();
    expect(result.accountant.id).toBe('acc-1');
  });

  it('should reject if email not found', async () => {
    mockPrisma.accountants.findUnique.mockResolvedValue(null);

    await expect(login('notfound@test.com', validPassword, ip, userAgent))
      .rejects.toThrow('Email ou senha inválidos');
  });

  it('should reject if password is wrong', async () => {
    const accountant = await makeAccountant();
    mockPrisma.accountants.findUnique.mockResolvedValue(accountant);
    mockPrisma.accountants.update.mockResolvedValue(accountant);

    await expect(login('contador@test.com', 'wrong-password-here!', ip, userAgent))
      .rejects.toThrow('Email ou senha inválidos');
  });

  it('should increment failed_login_count on wrong password', async () => {
    const accountant = await makeAccountant({ failed_login_count: 2 });
    mockPrisma.accountants.findUnique.mockResolvedValue(accountant);
    mockPrisma.accountants.update.mockResolvedValue(accountant);

    try {
      await login('contador@test.com', 'wrong-password-here!', ip, userAgent);
    } catch {}

    expect(mockPrisma.accountants.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failed_login_count: 3 }),
      })
    );
  });

  it('should lock account after max failed attempts', async () => {
    const accountant = await makeAccountant({ failed_login_count: 4 }); // Will become 5
    mockPrisma.accountants.findUnique.mockResolvedValue(accountant);
    mockPrisma.accountants.update.mockResolvedValue(accountant);

    try {
      await login('contador@test.com', 'wrong-password-here!', ip, userAgent);
    } catch {}

    expect(mockPrisma.accountants.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failed_login_count: 5,
          locked_until: expect.any(Date),
        }),
      })
    );
  });

  it('should reject if account is locked', async () => {
    const accountant = await makeAccountant({
      locked_until: new Date(Date.now() + 30 * 60 * 1000),
    });
    mockPrisma.accountants.findUnique.mockResolvedValue(accountant);

    await expect(login('contador@test.com', validPassword, ip, userAgent))
      .rejects.toThrow('Conta bloqueada temporariamente');
  });

  it('should reject if account status is not ACTIVE', async () => {
    const accountant = await makeAccountant({ status: 'SUSPENDED' });
    mockPrisma.accountants.findUnique.mockResolvedValue(accountant);

    await expect(login('contador@test.com', validPassword, ip, userAgent))
      .rejects.toThrow('Conta não está ativa');
  });

  it('should reject if no password hash (not activated)', async () => {
    const accountant = await makeAccountant({ password_hash: null });
    mockPrisma.accountants.findUnique.mockResolvedValue(accountant);

    await expect(login('contador@test.com', validPassword, ip, userAgent))
      .rejects.toThrow('Email ou senha inválidos');
  });

  it('should reject with empty email or password', async () => {
    await expect(login('', validPassword, ip, userAgent))
      .rejects.toThrow('Email e senha são obrigatórios');
    await expect(login('test@test.com', '', ip, userAgent))
      .rejects.toThrow('Email e senha são obrigatórios');
  });

  it('should reset failed_login_count on successful login', async () => {
    const accountant = await makeAccountant({ failed_login_count: 3 });
    mockPrisma.accountants.findUnique.mockResolvedValue(accountant);

    let updateData: any;
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
      const tx = {
        accountants: {
          update: vi.fn().mockImplementation((args: any) => {
            updateData = args.data;
            return accountant;
          }),
        },
        accountant_sessions: {
          create: vi.fn().mockImplementation((args: any) => ({
            id: 'session-1',
            ...args.data,
          })),
        },
        $executeRaw: vi.fn(),
      };
      return fn(tx);
    });

    await login('contador@test.com', validPassword, ip, userAgent);

    expect(updateData.failed_login_count).toBe(0);
    expect(updateData.locked_until).toBeNull();
  });
});
