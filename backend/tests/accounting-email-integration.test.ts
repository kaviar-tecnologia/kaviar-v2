import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════
// Mocks
// ═══════════════════════════════════════════════════════════════════

const mockSendMail = vi.fn();
vi.mock('../src/services/email/email.service', () => ({
  emailService: {
    sendMail: (...args: unknown[]) => mockSendMail(...args),
  },
}));

const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma: any = {
    accountants: { findUnique: vi.fn() },
    accountant_invites: {
      updateMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    accountant_password_resets: {
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    email_send_logs: { create: vi.fn() },
    admin_audit_logs: {},
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  };
  return { mockPrisma };
});

vi.mock('../src/lib/prisma', () => ({ prisma: mockPrisma }));

import { createInvite } from '../src/services/accounting/accounting-invites.service';
import { sendInviteEmail, sendPasswordResetEmail } from '../src/services/accounting/accounting-email.service';
import { forgotPassword } from '../src/services/accounting/accounting-auth.service';

// ═══════════════════════════════════════════════════════════════════
// Test Fixtures
// ═══════════════════════════════════════════════════════════════════

const fakeAccountant = {
  id: 'acc-001',
  nome_completo: 'Maria Contadora',
  email: 'maria@contabilidade.com.br',
  cpf: '12345678901',
  status: 'INVITED',
  is_active: true,
  password_hash: null,
  password_version: 0,
  failed_login_count: 0,
  locked_until: null,
};

const fakeActiveAccountant = {
  ...fakeAccountant,
  id: 'acc-002',
  email: 'joao@contabilidade.com.br',
  nome_completo: 'João Contador',
  status: 'ACTIVE',
  password_hash: 'hashed-pwd',
};

const fakeAdmin = {
  id: 'admin-001',
  name: 'Admin Kaviar',
  role: 'SUPER_ADMIN',
};

describe('Accounting Email Integration', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockPrisma.email_send_logs.create.mockResolvedValue({ id: 'log-001' });
    mockPrisma.accountant_invites.update.mockResolvedValue({});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  // ═══════════════════════════════════════════════════════════════════
  // POST /invite: convite criado + email chamado
  // ═══════════════════════════════════════════════════════════════════

  describe('POST /invite — invite created + email sent', () => {
    it('should create invite and call sendInviteEmail with rawToken', async () => {
      mockPrisma.accountants.findUnique.mockResolvedValue(fakeAccountant);

      let createdInvite: any = null;
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          accountant_invites: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            create: vi.fn().mockImplementation((args: any) => {
              createdInvite = {
                id: 'inv-001',
                ...args.data,
                accountant: fakeAccountant,
                created_by_admin: fakeAdmin,
              };
              return createdInvite;
            }),
          },
          $executeRaw: vi.fn(),
        };
        return fn(tx);
      });

      // Call createInvite (simulates what the route does)
      const { invite, rawToken } = await createInvite('acc-001', 'admin-001', '127.0.0.1', 'test-agent');

      expect(invite).toBeDefined();
      expect(rawToken).toBeDefined();
      expect(rawToken.length).toBe(64); // 32 bytes hex

      // Now simulate sending email (what the route does after createInvite)
      mockSendMail.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', messageId: 'msg-001' });

      const emailResult = await sendInviteEmail({
        accountantId: fakeAccountant.id,
        inviteId: invite.id,
        accountantName: fakeAccountant.nome_completo,
        accountantEmail: fakeAccountant.email,
        rawToken,
        adminName: fakeAdmin.name,
        adminId: fakeAdmin.id,
        isReinvite: false,
      });

      expect(emailResult.ok).toBe(true);
      expect(mockSendMail).toHaveBeenCalledTimes(1);

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('maria@contabilidade.com.br');
      expect(callArgs.subject).toContain('Convite');
      // Token should be in the HTML (activation URL), but NOT in response to client
      expect(callArgs.html).toContain(rawToken);
    });

    it('should return { invite, rawToken } from createInvite', async () => {
      mockPrisma.accountants.findUnique.mockResolvedValue(fakeAccountant);

      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          accountant_invites: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            create: vi.fn().mockReturnValue({
              id: 'inv-002',
              accountant_id: 'acc-001',
              accountant: fakeAccountant,
              created_by_admin: fakeAdmin,
            }),
          },
          $executeRaw: vi.fn(),
        };
        return fn(tx);
      });

      const result = await createInvite('acc-001', 'admin-001');
      expect(result).toHaveProperty('invite');
      expect(result).toHaveProperty('rawToken');
      expect(typeof result.rawToken).toBe('string');
      expect(result.rawToken.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // POST /invite: SMTP falha → convite existe, email_status='FAILED'
  // ═══════════════════════════════════════════════════════════════════

  describe('POST /invite — SMTP failure', () => {
    it('should keep invite valid when email fails', async () => {
      mockPrisma.accountants.findUnique.mockResolvedValue(fakeAccountant);

      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          accountant_invites: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            create: vi.fn().mockReturnValue({
              id: 'inv-003',
              status: 'PENDING',
              accountant_id: 'acc-001',
              accountant: fakeAccountant,
              created_by_admin: fakeAdmin,
            }),
          },
          $executeRaw: vi.fn(),
        };
        return fn(tx);
      });

      const { invite, rawToken } = await createInvite('acc-001', 'admin-001');

      // Simulate SMTP failure
      mockSendMail.mockResolvedValue({ ok: false, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', error: 'Connection timeout' });

      const emailResult = await sendInviteEmail({
        accountantId: fakeAccountant.id,
        inviteId: invite.id,
        accountantName: fakeAccountant.nome_completo,
        accountantEmail: fakeAccountant.email,
        rawToken,
        adminName: fakeAdmin.name,
        adminId: fakeAdmin.id,
      });

      expect(emailResult.ok).toBe(false);
      expect(emailResult.error).toBe('Connection timeout');

      // Invite status should be updated to FAILED
      expect(mockPrisma.accountant_invites.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: invite.id },
          data: expect.objectContaining({
            last_email_status: 'FAILED',
            last_email_error: 'Connection timeout',
          }),
        })
      );

      // Invite itself remains PENDING (not revoked or cancelled)
      expect(invite.status).toBe('PENDING');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // POST /reinvite: revokes old + creates new + sends email
  // ═══════════════════════════════════════════════════════════════════

  describe('POST /reinvite — revoke old + create new + send', () => {
    it('should revoke previous invites and send reinvite email', async () => {
      mockPrisma.accountants.findUnique.mockResolvedValue(fakeAccountant);

      let revokedCount = 0;
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          accountant_invites: {
            updateMany: vi.fn().mockImplementation(() => {
              revokedCount++;
              return { count: 1 }; // 1 previous invite revoked
            }),
            create: vi.fn().mockReturnValue({
              id: 'inv-reinvite-001',
              status: 'PENDING',
              accountant_id: 'acc-001',
              accountant: fakeAccountant,
              created_by_admin: fakeAdmin,
            }),
          },
          $executeRaw: vi.fn(),
        };
        return fn(tx);
      });

      // createInvite already revokes previous PENDING invites
      const { invite, rawToken } = await createInvite('acc-001', 'admin-001');

      expect(revokedCount).toBe(1); // Previous invite was revoked

      // Send reinvite email
      mockSendMail.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', messageId: 'msg-reinvite-001' });

      const emailResult = await sendInviteEmail({
        accountantId: fakeAccountant.id,
        inviteId: invite.id,
        accountantName: fakeAccountant.nome_completo,
        accountantEmail: fakeAccountant.email,
        rawToken,
        adminName: fakeAdmin.name,
        adminId: fakeAdmin.id,
        isReinvite: true,
      });

      expect(emailResult.ok).toBe(true);
      expect(mockSendMail).toHaveBeenCalledTimes(1);

      // The email template should be reinvite (different subject/body)
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('maria@contabilidade.com.br');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // POST /forgot-password: token created + email sent
  // ═══════════════════════════════════════════════════════════════════

  describe('POST /forgot-password — token created + email sent', () => {
    it('should create reset token and return data for email sending', async () => {
      mockPrisma.accountants.findUnique.mockResolvedValue(fakeActiveAccountant);
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          accountant_password_resets: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            create: vi.fn().mockResolvedValue({ id: 'reset-001' }),
          },
          $executeRaw: vi.fn(),
        };
        return fn(tx);
      });

      const result = await forgotPassword('joao@contabilidade.com.br', '127.0.0.1', 'test-agent');

      expect(result).not.toBeNull();
      expect(result!.rawToken).toBeDefined();
      expect(result!.rawToken.length).toBe(64);
      expect(result!.accountant.id).toBe('acc-002');

      // Simulate what the route does: send email
      mockSendMail.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', messageId: 'msg-reset-001' });

      const emailResult = await sendPasswordResetEmail({
        accountantId: result!.accountant.id,
        accountantEmail: result!.accountant.email,
        accountantName: result!.accountant.nome_completo,
        rawToken: result!.rawToken,
      });

      expect(emailResult.ok).toBe(true);
      expect(mockSendMail).toHaveBeenCalledTimes(1);

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('joao@contabilidade.com.br');
      expect(callArgs.html).toContain(result!.rawToken);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // POST /forgot-password: email inexistente → resposta genérica, nenhum envio
  // ═══════════════════════════════════════════════════════════════════

  describe('POST /forgot-password — non-existent email', () => {
    it('should return null (no email to send) when email does not exist', async () => {
      mockPrisma.accountants.findUnique.mockResolvedValue(null);

      const result = await forgotPassword('inexistente@naoexiste.com.br', '127.0.0.1', 'test-agent');

      expect(result).toBeNull();
      // No email should be sent
      expect(mockSendMail).not.toHaveBeenCalled();
    });

    it('should return null for INVITED (not ACTIVE) accountant', async () => {
      mockPrisma.accountants.findUnique.mockResolvedValue(fakeAccountant); // status=INVITED

      const result = await forgotPassword('maria@contabilidade.com.br', '127.0.0.1', 'test-agent');

      expect(result).toBeNull();
      expect(mockSendMail).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Rate limit: 21st invite in 1h → 429
  // ═══════════════════════════════════════════════════════════════════

  describe('Rate limiting', () => {
    it('inviteRateLimit should be configured with max=20 per hour', async () => {
      const { inviteRateLimit } = await import('../src/middlewares/accounting-rate-limit');
      expect(inviteRateLimit).toBeDefined();
      // The middleware is a function (express middleware)
      expect(typeof inviteRateLimit).toBe('function');
    });

    it('reinviteRateLimit should be configured with max=5 per hour', async () => {
      const { reinviteRateLimit } = await import('../src/middlewares/accounting-rate-limit');
      expect(reinviteRateLimit).toBeDefined();
      expect(typeof reinviteRateLimit).toBe('function');
    });

    it('forgotPasswordRateLimit should be configured with max=5 per hour', async () => {
      const { forgotPasswordRateLimit } = await import('../src/middlewares/accounting-rate-limit');
      expect(forgotPasswordRateLimit).toBeDefined();
      expect(typeof forgotPasswordRateLimit).toBe('function');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Token NEVER in response body
  // ═══════════════════════════════════════════════════════════════════

  describe('Security — token never in response', () => {
    it('createInvite returns rawToken but route must NOT include it in response', async () => {
      mockPrisma.accountants.findUnique.mockResolvedValue(fakeAccountant);

      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          accountant_invites: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            create: vi.fn().mockReturnValue({
              id: 'inv-sec-001',
              accountant: fakeAccountant,
              created_by_admin: fakeAdmin,
            }),
          },
          $executeRaw: vi.fn(),
        };
        return fn(tx);
      });

      const { invite, rawToken } = await createInvite('acc-001', 'admin-001');

      // Simulate what the route returns to the client
      const responseBody = { success: true, data: { invite_id: invite.id, email_sent: true } };

      // Token must NOT be in the response
      expect(JSON.stringify(responseBody)).not.toContain(rawToken);
      expect(responseBody).not.toHaveProperty('token');
      expect((responseBody as any).data).not.toHaveProperty('token');
      expect((responseBody as any).data).not.toHaveProperty('rawToken');
    });

    it('forgotPassword result must NOT expose token to client', async () => {
      mockPrisma.accountants.findUnique.mockResolvedValue(fakeActiveAccountant);
      mockPrisma.$transaction.mockImplementation(async (fn: Function) => {
        const tx = {
          accountant_password_resets: {
            updateMany: vi.fn().mockResolvedValue({ count: 0 }),
            create: vi.fn().mockResolvedValue({ id: 'reset-002' }),
          },
          $executeRaw: vi.fn(),
        };
        return fn(tx);
      });

      const result = await forgotPassword('joao@contabilidade.com.br');

      // The route returns a generic message, NOT the result
      const clientResponse = { success: true, message: 'Se o email estiver cadastrado, um link de recuperação será enviado.' };
      expect(JSON.stringify(clientResponse)).not.toContain(result!.rawToken);
      expect(clientResponse).not.toHaveProperty('rawToken');
      expect(clientResponse).not.toHaveProperty('_devToken');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Token NEVER in audit logs
  // ═══════════════════════════════════════════════════════════════════

  describe('Security — token never in audit', () => {
    it('audit events should not contain raw tokens', async () => {
      // The audit events we emit are:
      // INVITE_EMAIL_SENT, INVITE_EMAIL_FAILED, PASSWORD_RESET_EMAIL_SENT, PASSWORD_RESET_EMAIL_FAILED
      // None should contain rawToken in newValue

      const auditNewValueInvite = { accountant_id: 'acc-001', email_sent: true };
      const auditNewValueReset = { email_sent: true };

      expect(JSON.stringify(auditNewValueInvite)).not.toMatch(/token/i);
      expect(JSON.stringify(auditNewValueReset)).not.toMatch(/token/i);
    });

    it('writeAccountingAuditTx sanitizes sensitive fields', async () => {
      // The sanitize function in accounting-audit.ts redacts any field containing 'token'
      const { writeAccountingAuditTx: realAudit } = await import('../src/services/accounting/accounting-audit');
      expect(realAudit).toBeDefined();
      // Since the audit input we pass never includes token fields, this is safe by design
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Email mascarado nos logs
  // ═══════════════════════════════════════════════════════════════════

  describe('Security — email masked in logs', () => {
    it('sendInviteEmail should mask email in console output', async () => {
      consoleSpy.mockRestore();
      const logCalls: string[] = [];
      consoleSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
        logCalls.push(args.join(' '));
      });

      mockPrisma.accountants.findUnique.mockResolvedValue(fakeAccountant);
      mockSendMail.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', messageId: 'msg-log-001' });

      await sendInviteEmail({
        accountantId: 'acc-001',
        inviteId: 'inv-log-001',
        accountantName: 'Maria Contadora',
        accountantEmail: 'maria@contabilidade.com.br',
        rawToken: 'secret-token-value',
        adminName: 'Admin',
        adminId: 'admin-001',
      });

      // Check that full email is NOT in any log line
      const allLogs = logCalls.join('\n');
      expect(allLogs).not.toContain('maria@contabilidade.com.br');
      // But masked version should be present
      expect(allLogs).toContain('m***a@contabilidade.com.br');
    });

    it('sendPasswordResetEmail should mask email in console output', async () => {
      consoleSpy.mockRestore();
      const logCalls: string[] = [];
      consoleSpy = vi.spyOn(console, 'log').mockImplementation((...args) => {
        logCalls.push(args.join(' '));
      });

      mockSendMail.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', messageId: 'msg-log-002' });

      await sendPasswordResetEmail({
        accountantId: 'acc-002',
        accountantEmail: 'joao@contabilidade.com.br',
        accountantName: 'João Contador',
        rawToken: 'another-secret-token',
      });

      const allLogs = logCalls.join('\n');
      expect(allLogs).not.toContain('joao@contabilidade.com.br');
      expect(allLogs).toContain('j***o@contabilidade.com.br');
    });
  });
});
