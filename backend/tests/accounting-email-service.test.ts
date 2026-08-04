import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock emailService before importing the module under test
const mockSendMail = vi.fn();
vi.mock('../src/services/email/email.service', () => ({
  emailService: {
    sendMail: (...args: unknown[]) => mockSendMail(...args),
  },
}));

// Mock prisma
const mockPrismaEmailSendLogsCreate = vi.fn();
const mockPrismaAccountantInvitesUpdate = vi.fn();
vi.mock('../src/lib/prisma', () => ({
  prisma: {
    email_send_logs: {
      create: (...args: unknown[]) => mockPrismaEmailSendLogsCreate(...args),
    },
    accountant_invites: {
      update: (...args: unknown[]) => mockPrismaAccountantInvitesUpdate(...args),
    },
  },
}));

import { sendInviteEmail, sendPasswordResetEmail } from '../src/services/accounting/accounting-email.service';

describe('accounting-email.service', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockPrismaEmailSendLogsCreate.mockResolvedValue({ id: 'log-uuid-123' });
    mockPrismaAccountantInvitesUpdate.mockResolvedValue({});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  const inviteParams = {
    accountantId: 'acc-001',
    inviteId: 'inv-001',
    accountantName: 'Maria Silva',
    accountantEmail: 'maria@contabilidade.com.br',
    rawToken: 'super-secret-token-abc123',
    adminName: 'João Admin',
    adminId: 'admin-001',
  };

  const resetParams = {
    accountantId: 'acc-001',
    accountantEmail: 'maria@contabilidade.com.br',
    accountantName: 'Maria Silva',
    rawToken: 'reset-secret-token-xyz789',
  };

  describe('sendInviteEmail', () => {
    it('should call sendMail with correct params', async () => {
      mockSendMail.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', messageId: 'msg-001' });

      await sendInviteEmail(inviteParams);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('maria@contabilidade.com.br');
      expect(callArgs.from).toBe('KAVIAR <no-reply@kaviar.com.br>');
      expect(callArgs.subject).toContain('Convite');
      expect(callArgs.html).toContain('Maria Silva');
      expect(callArgs.html).toContain('João Admin');
      expect(callArgs.text).toBeDefined();
    });

    it('should generate correct activation URL', async () => {
      mockSendMail.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', messageId: 'msg-001' });

      await sendInviteEmail(inviteParams);

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('https://admin.kaviar.com.br/contador/ativar#token=super-secret-token-abc123');
    });

    it('should update invite status to SENT on success', async () => {
      mockSendMail.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', messageId: 'msg-001' });

      await sendInviteEmail(inviteParams);

      expect(mockPrismaAccountantInvitesUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-001' },
          data: expect.objectContaining({
            last_email_status: 'SENT',
          }),
        })
      );
    });

    it('should update invite status to FAILED on provider failure', async () => {
      mockSendMail.mockResolvedValue({ ok: false, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', error: 'SMTP timeout' });

      const result = await sendInviteEmail(inviteParams);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('SMTP timeout');
      expect(mockPrismaAccountantInvitesUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'inv-001' },
          data: expect.objectContaining({
            last_email_status: 'FAILED',
            last_email_error: 'SMTP timeout',
          }),
        })
      );
    });

    it('should NOT log rawToken in any console output', async () => {
      mockSendMail.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', messageId: 'msg-001' });

      await sendInviteEmail(inviteParams);

      const allLogCalls = [...consoleSpy.mock.calls, ...consoleErrorSpy.mock.calls]
        .map((args) => args.join(' '))
        .join('\n');
      expect(allLogCalls).not.toContain('super-secret-token-abc123');
    });

    it('should mask email in logs', async () => {
      mockSendMail.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', messageId: 'msg-001' });

      await sendInviteEmail(inviteParams);

      const allLogCalls = [...consoleSpy.mock.calls, ...consoleErrorSpy.mock.calls]
        .map((args) => args.join(' '))
        .join('\n');
      // Full email should never be logged
      expect(allLogCalls).not.toContain('maria@contabilidade.com.br');
      // Masked version should be present
      expect(allLogCalls).toContain('m***a@contabilidade.com.br');
    });

    it('should return ok true with messageId on success', async () => {
      mockSendMail.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', messageId: 'msg-001' });

      const result = await sendInviteEmail(inviteParams);

      expect(result.ok).toBe(true);
      expect(result.messageId).toBe('msg-001');
    });

    it('should write to email_send_logs', async () => {
      mockSendMail.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', messageId: 'msg-001' });

      await sendInviteEmail(inviteParams);

      expect(mockPrismaEmailSendLogsCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            admin_id: 'admin-001',
            from_email: 'no-reply@kaviar.com.br',
            to_email: 'maria@contabilidade.com.br',
            status: 'SENT',
            provider: 'cloudflare',
            provider_message_id: 'msg-001',
          }),
        })
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should call sendMail with correct params', async () => {
      mockSendMail.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', messageId: 'msg-002' });

      await sendPasswordResetEmail(resetParams);

      expect(mockSendMail).toHaveBeenCalledTimes(1);
      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('maria@contabilidade.com.br');
      expect(callArgs.from).toBe('KAVIAR <no-reply@kaviar.com.br>');
      expect(callArgs.subject).toContain('Recuperação');
      expect(callArgs.html).toContain('Maria Silva');
    });

    it('should generate correct reset URL', async () => {
      mockSendMail.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', messageId: 'msg-002' });

      await sendPasswordResetEmail(resetParams);

      const callArgs = mockSendMail.mock.calls[0][0];
      expect(callArgs.html).toContain('https://admin.kaviar.com.br/contador/recuperar#token=reset-secret-token-xyz789');
    });

    it('should NOT log rawToken', async () => {
      mockSendMail.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', messageId: 'msg-002' });

      await sendPasswordResetEmail(resetParams);

      const allLogCalls = [...consoleSpy.mock.calls, ...consoleErrorSpy.mock.calls]
        .map((args) => args.join(' '))
        .join('\n');
      expect(allLogCalls).not.toContain('reset-secret-token-xyz789');
    });

    it('should mask email in logs', async () => {
      mockSendMail.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', messageId: 'msg-002' });

      await sendPasswordResetEmail(resetParams);

      const allLogCalls = [...consoleSpy.mock.calls, ...consoleErrorSpy.mock.calls]
        .map((args) => args.join(' '))
        .join('\n');
      expect(allLogCalls).not.toContain('maria@contabilidade.com.br');
    });

    it('should return ok true on success', async () => {
      mockSendMail.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', messageId: 'msg-002' });

      const result = await sendPasswordResetEmail(resetParams);

      expect(result.ok).toBe(true);
      expect(result.messageId).toBe('msg-002');
    });

    it('should return error on failure', async () => {
      mockSendMail.mockResolvedValue({ ok: false, provider: 'cloudflare', from: 'KAVIAR <no-reply@kaviar.com.br>', error: 'Connection refused' });

      const result = await sendPasswordResetEmail(resetParams);

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Connection refused');
    });
  });
});
