import { describe, it, expect, vi, beforeEach } from 'vitest';
import crypto from 'crypto';

// ─── Mock setup ──────────────────────────────────────────────────────────────
const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma: any = {
    $transaction: vi.fn(),
  };
  return { mockPrisma };
});

vi.mock('../src/lib/prisma', () => ({ prisma: mockPrisma }));

// Mock audit to avoid $executeRaw complications in unit tests
vi.mock('../src/services/accounting/accounting-audit', () => ({
  writeAccountingAuditTx: vi.fn().mockResolvedValue(undefined),
}));

import { refreshSession, AccountingAuthError } from '../src/services/accounting/accounting-auth.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function makeSessionRow(overrides: Record<string, any> = {}) {
  return {
    id: 'session-1',
    accountant_id: 'acc-1',
    token_family_id: 'family-1',
    refresh_token_hash: hashToken('valid-refresh-token'),
    generation: 1,
    status: 'ACTIVE',
    scope: 'WEB',
    device_name: 'Chrome',
    ip_address: '10.0.0.1',
    user_agent: 'Mozilla/5.0',
    created_ip: '10.0.0.1',
    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    created_at: new Date(),
    rotated_at: null,
    revoked_at: null,
    revocation_reason: null,
    reuse_detected_at: null,
    parent_session_id: null,
    replaced_by_id: null,
    last_activity_at: new Date(),
    ...overrides,
  };
}

function makeAccountant(overrides: Record<string, any> = {}) {
  return {
    id: 'acc-1',
    email: 'test@contabilidade.com',
    nome_completo: 'João Contador',
    cpf: '12345678901',
    status: 'ACTIVE',
    is_active: true,
    ...overrides,
  };
}

const NO_ACCOUNTANT = Symbol('NO_ACCOUNTANT');

interface TxMockConfig {
  /** First $queryRaw call: UPDATE...RETURNING * (consumed rows) */
  queryRawResults: any[][];
  /** accountants.findUnique result. Use NO_ACCOUNTANT symbol to explicitly return null. */
  accountantResult?: any | typeof NO_ACCOUNTANT;
  /** accountant_sessions.create result override */
  sessionCreateResult?: any;
  /** $executeRaw return value */
  executeRawResult?: number;
}

function setupTransactionMock(config: TxMockConfig) {
  let queryRawCallCount = 0;

  const resolvedAccountant = config.accountantResult === NO_ACCOUNTANT
    ? null
    : (config.accountantResult ?? makeAccountant());

  mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
    const tx: any = {
      $queryRaw: vi.fn().mockImplementation(() => {
        const result = config.queryRawResults[queryRawCallCount] || [];
        queryRawCallCount++;
        return Promise.resolve(result);
      }),
      $executeRaw: vi.fn().mockResolvedValue(config.executeRawResult ?? 1),
      accountants: {
        findUnique: vi.fn().mockResolvedValue(resolvedAccountant),
      },
      accountant_sessions: {
        create: vi.fn().mockImplementation((args: any) => {
          const base = {
            id: 'session-new',
            created_at: new Date(),
            rotated_at: null,
            revoked_at: null,
            revocation_reason: null,
            reuse_detected_at: null,
            replaced_by_id: null,
            last_activity_at: new Date(),
            ...args.data,
          };
          return Promise.resolve(config.sessionCreateResult ?? base);
        }),
      },
    };
    return fn(tx);
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Accounting Auth - Refresh Session (concurrency-safe)', () => {
  const ip = '192.168.1.1';
  const userAgent = 'Mozilla/5.0';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Case 1: Normal rotation ─────────────────────────────────────────────

  it('should atomically rotate session and return new tokens', async () => {
    const sessionRow = makeSessionRow();

    setupTransactionMock({
      queryRawResults: [[sessionRow]], // UPDATE...RETURNING * yields 1 row
      accountantResult: makeAccountant(),
    });

    const result = await refreshSession('valid-refresh-token', ip, userAgent);

    expect(result.accessToken).toBeDefined();
    expect(result.refreshTokenRaw).toBeDefined();
    expect(result.refreshTokenRaw).not.toBe('valid-refresh-token');
    expect(result.accountant.id).toBe('acc-1');
    expect(result.session.id).toBe('session-new');
  });

  // ─── Case 2: Token inexistente → INVALID_TOKEN ───────────────────────────

  it('should throw INVALID_TOKEN if token does not exist (no rows found)', async () => {
    setupTransactionMock({
      queryRawResults: [
        [], // UPDATE RETURNING * → 0 rows (not active)
        [], // SELECT → 0 rows (doesn't exist at all)
      ],
    });

    await expect(refreshSession('nonexistent-token', ip, userAgent))
      .rejects.toMatchObject({
        code: 'INVALID_TOKEN',
        statusCode: 401,
      });
  });

  // ─── Case 3: Token reuse → TOKEN_REUSE ───────────────────────────────────

  it('should detect token reuse when session is already ROTATED', async () => {
    const rotatedRow = makeSessionRow({ status: 'ROTATED' });

    setupTransactionMock({
      queryRawResults: [
        [], // UPDATE RETURNING * → 0 rows (already rotated)
        [rotatedRow], // SELECT → found with status ROTATED
      ],
    });

    await expect(refreshSession('valid-refresh-token', ip, userAgent))
      .rejects.toMatchObject({
        code: 'TOKEN_REUSE',
        statusCode: 401,
      });

    // Verify $executeRaw was called to compromise the family
    const txFn = mockPrisma.$transaction.mock.calls[0][0];
    // Re-execute to inspect tx calls
    let executedTx: any;
    await mockPrisma.$transaction.mockImplementationOnce(async (fn: Function) => {
      let qrCount = 0;
      executedTx = {
        $queryRaw: vi.fn().mockImplementation(() => {
          const results = [[], [rotatedRow]];
          return Promise.resolve(results[qrCount++] || []);
        }),
        $executeRaw: vi.fn().mockResolvedValue(3),
        accountants: { findUnique: vi.fn() },
        accountant_sessions: { create: vi.fn() },
      };
      try { await fn(executedTx); } catch (e) { /* expected */ }
    });
    try { await refreshSession('valid-refresh-token', ip, userAgent); } catch (e) { /* expected */ }

    expect(executedTx.$executeRaw).toHaveBeenCalled();
  });

  it('should detect token reuse when session is COMPROMISED', async () => {
    const compromisedRow = makeSessionRow({ status: 'COMPROMISED' });

    setupTransactionMock({
      queryRawResults: [
        [], // UPDATE RETURNING * → 0 rows
        [compromisedRow], // SELECT → found with status COMPROMISED
      ],
    });

    await expect(refreshSession('valid-refresh-token', ip, userAgent))
      .rejects.toMatchObject({
        code: 'TOKEN_REUSE',
        statusCode: 401,
      });
  });

  // ─── Case 4: Expired session ──────────────────────────────────────────────

  it('should throw INVALID_TOKEN for expired session (WHERE expires_at > NOW() filters it)', async () => {
    // When session is expired, the UPDATE WHERE...expires_at > NOW() won't match
    // and the SELECT won't find it with ROTATED/COMPROMISED status either
    const expiredRow = makeSessionRow({ status: 'EXPIRED' });

    setupTransactionMock({
      queryRawResults: [
        [], // UPDATE RETURNING * → 0 rows (expired, not matched)
        [expiredRow], // SELECT → found but status is EXPIRED (not ROTATED/COMPROMISED)
      ],
    });

    await expect(refreshSession('valid-refresh-token', ip, userAgent))
      .rejects.toMatchObject({
        code: 'INVALID_TOKEN',
        statusCode: 401,
      });
  });

  it('should throw INVALID_TOKEN when token exists but is REVOKED', async () => {
    const revokedRow = makeSessionRow({ status: 'REVOKED' });

    setupTransactionMock({
      queryRawResults: [
        [], // UPDATE → 0 rows
        [revokedRow], // SELECT → found with status REVOKED (not reuse)
      ],
    });

    await expect(refreshSession('valid-refresh-token', ip, userAgent))
      .rejects.toMatchObject({
        code: 'INVALID_TOKEN',
        statusCode: 401,
      });
  });

  // ─── Case 5: Accountant not ACTIVE → ACCOUNT_INACTIVE ────────────────────

  it('should throw ACCOUNT_INACTIVE if accountant is SUSPENDED', async () => {
    const sessionRow = makeSessionRow();

    setupTransactionMock({
      queryRawResults: [[sessionRow]], // Token consumed successfully
      accountantResult: makeAccountant({ status: 'SUSPENDED' }),
    });

    await expect(refreshSession('valid-refresh-token', ip, userAgent))
      .rejects.toMatchObject({
        code: 'ACCOUNT_INACTIVE',
        statusCode: 403,
      });
  });

  it('should throw ACCOUNT_INACTIVE if accountant not found', async () => {
    const sessionRow = makeSessionRow();

    setupTransactionMock({
      queryRawResults: [[sessionRow]],
      accountantResult: NO_ACCOUNTANT, // Accountant deleted
    });

    await expect(refreshSession('valid-refresh-token', ip, userAgent))
      .rejects.toMatchObject({
        code: 'ACCOUNT_INACTIVE',
        statusCode: 403,
      });
  });

  // ─── Case 6: Generation increments ───────────────────────────────────────

  it('should increment generation on rotation', async () => {
    const sessionRow = makeSessionRow({ generation: 5 });

    let createdData: any;
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
      const tx: any = {
        $queryRaw: vi.fn().mockResolvedValue([sessionRow]),
        $executeRaw: vi.fn().mockResolvedValue(1),
        accountants: {
          findUnique: vi.fn().mockResolvedValue(makeAccountant()),
        },
        accountant_sessions: {
          create: vi.fn().mockImplementation((args: any) => {
            createdData = args.data;
            return Promise.resolve({ id: 'session-gen6', ...args.data });
          }),
        },
      };
      return fn(tx);
    });

    const result = await refreshSession('valid-refresh-token', ip, userAgent);

    expect(createdData.generation).toBe(6);
    expect(createdData.parent_session_id).toBe('session-1');
    expect(createdData.token_family_id).toBe('family-1');
    expect(result.session.generation).toBe(6);
  });

  it('should preserve token family across rotations', async () => {
    const sessionRow = makeSessionRow({ generation: 3, token_family_id: 'family-abc' });

    let createdData: any;
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
      const tx: any = {
        $queryRaw: vi.fn().mockResolvedValue([sessionRow]),
        $executeRaw: vi.fn().mockResolvedValue(1),
        accountants: {
          findUnique: vi.fn().mockResolvedValue(makeAccountant()),
        },
        accountant_sessions: {
          create: vi.fn().mockImplementation((args: any) => {
            createdData = args.data;
            return Promise.resolve({ id: 'session-x', ...args.data });
          }),
        },
      };
      return fn(tx);
    });

    await refreshSession('valid-refresh-token', ip, userAgent);

    expect(createdData.token_family_id).toBe('family-abc');
    expect(createdData.generation).toBe(4);
  });

  // ─── Case 7: Empty token → error ─────────────────────────────────────────

  it('should throw INVALID_TOKEN for empty string token', async () => {
    await expect(refreshSession('', ip, userAgent))
      .rejects.toMatchObject({
        code: 'INVALID_TOKEN',
        statusCode: 401,
      });
  });

  it('should throw INVALID_TOKEN for whitespace-only token', async () => {
    // The service checks `!refreshTokenRaw`, whitespace is truthy
    // but hashing whitespace yields a non-matching hash → falls through to INVALID_TOKEN
    setupTransactionMock({
      queryRawResults: [[], []],
    });

    await expect(refreshSession('   ', ip, userAgent))
      .rejects.toMatchObject({
        code: 'INVALID_TOKEN',
        statusCode: 401,
      });
  });

  // ─── Additional edge cases ────────────────────────────────────────────────

  it('should set replaced_by_id on the rotated session via $executeRaw', async () => {
    const sessionRow = makeSessionRow();

    let executeRawCalled = false;
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
      const tx: any = {
        $queryRaw: vi.fn().mockResolvedValue([sessionRow]),
        $executeRaw: vi.fn().mockImplementation(() => {
          executeRawCalled = true;
          return Promise.resolve(1);
        }),
        accountants: {
          findUnique: vi.fn().mockResolvedValue(makeAccountant()),
        },
        accountant_sessions: {
          create: vi.fn().mockImplementation((args: any) => {
            return Promise.resolve({ id: 'session-new', ...args.data });
          }),
        },
      };
      return fn(tx);
    });

    await refreshSession('valid-refresh-token', ip, userAgent);

    expect(executeRawCalled).toBe(true);
  });

  it('should use correct scope from rotated session', async () => {
    const sessionRow = makeSessionRow({ scope: 'MOBILE' });

    let createdData: any;
    mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
      const tx: any = {
        $queryRaw: vi.fn().mockResolvedValue([sessionRow]),
        $executeRaw: vi.fn().mockResolvedValue(1),
        accountants: {
          findUnique: vi.fn().mockResolvedValue(makeAccountant()),
        },
        accountant_sessions: {
          create: vi.fn().mockImplementation((args: any) => {
            createdData = args.data;
            return Promise.resolve({ id: 'session-m', ...args.data });
          }),
        },
      };
      return fn(tx);
    });

    await refreshSession('valid-refresh-token', ip, userAgent);

    expect(createdData.scope).toBe('MOBILE');
  });
});
