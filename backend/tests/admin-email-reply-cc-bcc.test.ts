import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MOCK_INBOUND_EMAIL = {
  id: 'inbound-1',
  from_email: 'sender@externo.com',
  from_name: 'External Sender',
  to_email: 'contato@kaviar.com.br',
  subject: 'Assunto original',
  message_id: '<msg-original@externo.com>',
  in_reply_to: null,
  references_header: null,
  text_body: 'Corpo original',
  status: 'NEW',
  provider: 'cloudflare',
};

const { prismaMock, sendMailMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    email_send_logs: {
      create: vi.fn(),
    },
    inbound_email_messages: {
      findUnique: vi.fn(),
    },
  },
  sendMailMock: vi.fn(),
  auditMock: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/services/email/email.service', () => ({
  emailService: {
    sendMail: sendMailMock,
    getRuntimeInfo: () => ({ provider: 'cloudflare', fromDefault: 'KAVIAR <no-reply@kaviar.com.br>', replyToDefault: ['contato@kaviar.com.br'] }),
  },
}));
vi.mock('../src/utils/audit', () => ({
  audit: auditMock,
  auditCtx: () => ({ adminId: 'admin-1', adminEmail: 'admin@test.local', ip: '127.0.0.1', ua: 'vitest' }),
}));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, _res: any, next: any) => {
    req.admin = { id: 'admin-1', email: 'admin@test.local', role: 'SUPER_ADMIN' };
    return next();
  },
  requireSuperAdmin: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../src/services/email/inbound-email-reply.service', () => ({
  buildInboundReplyPreview: (email: any) => ({
    allowed: true,
    to: email.from_email,
    from: `KAVIAR <${email.to_email}>`,
    subject: `Re: ${email.subject}`,
    inReplyTo: email.message_id,
    references: [email.message_id],
    blockedReason: null,
  }),
}));
vi.mock('../src/services/email/inbound-email-security-risk', () => ({
  evaluateInboundEmailSecurityRisk: () => ({ level: 'OK', reasons: [] }),
}));

const { default: adminInboundRoutes } = await import('../src/routes/admin-inbound-emails');

const app = express();
app.use(express.json());
app.use('/api/admin/inbound-emails', adminInboundRoutes);

describe('admin inbound email reply with CC/BCC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMailMock.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <contato@kaviar.com.br>', messageId: 'reply-msg-1' });
    prismaMock.email_send_logs.create.mockResolvedValue({});
    prismaMock.inbound_email_messages.findUnique.mockResolvedValue(MOCK_INBOUND_EMAIL);
  });

  // 12. Resposta de email com CC e CCO
  it('12. envia reply com CC e CCO', async () => {
    const res = await request(app)
      .post('/api/admin/inbound-emails/inbound-1/reply')
      .field('message', 'Resposta com copia para teste.')
      .field('cc', 'cc-reply@exemplo.com')
      .field('bcc', 'bcc-reply@exemplo.com');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const call = sendMailMock.mock.calls[0][0];
    expect(call.to).toBe('sender@externo.com');
    expect(call.cc).toEqual(['cc-reply@exemplo.com']);
    expect(call.bcc).toEqual(['bcc-reply@exemplo.com']);
    expect(call.inReplyTo).toBe('<msg-original@externo.com>');
    expect(call.references).toEqual(['<msg-original@externo.com>']);

    // Persiste cc/bcc no log
    expect(prismaMock.email_send_logs.create).toHaveBeenCalledTimes(1);
    const logData = prismaMock.email_send_logs.create.mock.calls[0][0].data;
    expect(logData.cc_email).toBe('cc-reply@exemplo.com');
    expect(logData.bcc_email).toBe('bcc-reply@exemplo.com');
    expect(logData.reply_to_inbound_email_id).toBe('inbound-1');
  });

  it('12b. reply sem CC/CCO continua funcionando normalmente', async () => {
    const res = await request(app)
      .post('/api/admin/inbound-emails/inbound-1/reply')
      .field('message', 'Reply simples sem copia.');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const call = sendMailMock.mock.calls[0][0];
    expect(call.cc).toBeUndefined();
    expect(call.bcc).toBeUndefined();
  });
});
