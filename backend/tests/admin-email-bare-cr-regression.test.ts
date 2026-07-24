import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const MOCK_INBOUND_EMAIL = {
  id: 'inbound-bare-cr',
  from_email: 'sender@externo.com',
  from_name: 'External Sender',
  to_email: 'contato@kaviar.com.br',
  subject: 'Assunto original',
  message_id: '<msg-bare-cr@externo.com>',
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
      findMany: vi.fn(),
      count: vi.fn(),
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

const { default: adminEmailRoutes } = await import('../src/routes/admin-email');
const { default: adminInboundRoutes } = await import('../src/routes/admin-inbound-emails');

const app = express();
app.use(express.json());
app.use('/api/admin/email', adminEmailRoutes);
app.use('/api/admin/inbound-emails', adminInboundRoutes);

const BASE_PAYLOAD = {
  to: ['dest@exemplo.com'],
  from: 'KAVIAR <contato@kaviar.com.br>',
  subject: 'Assunto teste',
};

describe('bare CR regression — normalizeEmailBodyLineEndings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMailMock.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <contato@kaviar.com.br>', messageId: 'msg-ok' });
    prismaMock.email_send_logs.create.mockResolvedValue({});
    prismaMock.inbound_email_messages.findUnique.mockResolvedValue(MOCK_INBOUND_EMAIL);
  });

  // a) Envio oficial com CRLF
  it('a) remove CRLF — text e html sem \\r', async () => {
    const res = await request(app)
      .post('/api/admin/email/send')
      .send({
        ...BASE_PAYLOAD,
        message: 'Primeira linha\r\nSegunda linha',
      });

    expect(res.status).toBe(200);
    const call = sendMailMock.mock.calls[0][0];

    // text não contém \r
    expect(call.text).not.toContain('\r');
    expect(call.text).toBe('Primeira linha\nSegunda linha');

    // html não contém \r e tem <br/>
    expect(call.html).not.toContain('\r');
    expect(call.html).toContain('Primeira linha<br/>Segunda linha');
  });

  // b) Envio oficial com CR isolado
  it('b) remove CR isolado — text e html sem \\r', async () => {
    const res = await request(app)
      .post('/api/admin/email/send')
      .send({
        ...BASE_PAYLOAD,
        message: 'Primeira linha\rSegunda linha',
      });

    expect(res.status).toBe(200);
    const call = sendMailMock.mock.calls[0][0];

    expect(call.text).not.toContain('\r');
    expect(call.text).toBe('Primeira linha\nSegunda linha');

    expect(call.html).not.toContain('\r');
    expect(call.html).toContain('Primeira linha<br/>Segunda linha');
  });

  // c) Envio com Para, CC, CCO, anexo PNG e CRLF
  it('c) com CC, CCO, anexo e CRLF — text e html sem \\r', async () => {
    const res = await request(app)
      .post('/api/admin/email/send')
      .field('to', 'dest@exemplo.com')
      .field('cc', 'copia@exemplo.com')
      .field('bcc', 'oculto@exemplo.com')
      .field('from', 'KAVIAR <contato@kaviar.com.br>')
      .field('subject', 'Assunto com anexo')
      .field('message', 'Linha um\r\nLinha dois\rLinha tres')
      .attach('attachments', Buffer.from('\x89PNG\r\n\x1a\n fake png content'), {
        filename: 'teste.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    const call = sendMailMock.mock.calls[0][0];

    expect(call.text).not.toContain('\r');
    expect(call.text).toBe('Linha um\nLinha dois\nLinha tres');
    expect(call.html).not.toContain('\r');
    expect(call.html).toContain('Linha um<br/>Linha dois<br/>Linha tres');

    expect(call.cc).toEqual(['copia@exemplo.com']);
    expect(call.bcc).toEqual(['oculto@exemplo.com']);
    expect(call.attachments).toHaveLength(1);
  });

  // d) Resposta de email com CRLF
  it('d) reply com CRLF — text e html sem \\r', async () => {
    const res = await request(app)
      .post('/api/admin/inbound-emails/inbound-bare-cr/reply')
      .field('message', 'Resposta\r\ncom CRLF\re CR isolado');

    expect(res.status).toBe(200);
    const call = sendMailMock.mock.calls[0][0];

    expect(call.text).not.toContain('\r');
    expect(call.text).toBe('Resposta\ncom CRLF\ne CR isolado');

    expect(call.html).not.toContain('\r');
    expect(call.html).toContain('Resposta<br/>com CRLF<br/>e CR isolado');
  });

  // e) Preservação de Unicode (travessão "—")
  it('e) preserva Unicode — travessão e acentos', async () => {
    const res = await request(app)
      .post('/api/admin/email/send')
      .send({
        ...BASE_PAYLOAD,
        message: 'TESTE — KAVIAR\r\nAção rápida: não deletar',
      });

    expect(res.status).toBe(200);
    const call = sendMailMock.mock.calls[0][0];

    expect(call.text).not.toContain('\r');
    expect(call.text).toBe('TESTE — KAVIAR\nAção rápida: não deletar');
    expect(call.text).toContain('—');
    expect(call.text).toContain('Ação');
    expect(call.text).toContain('não');

    expect(call.html).not.toContain('\r');
    expect(call.html).toContain('TESTE — KAVIAR');
    expect(call.html).toContain('<br/>');
  });

  // Mistura: CRLF + CR isolado + LF puro
  it('mix: CRLF + CR + LF — tudo vira LF', async () => {
    const res = await request(app)
      .post('/api/admin/email/send')
      .send({
        ...BASE_PAYLOAD,
        message: 'Primeira linha\r\nSegunda linha\rTerceira linha\nQuarta linha',
      });

    expect(res.status).toBe(200);
    const call = sendMailMock.mock.calls[0][0];

    expect(call.text).not.toContain('\r');
    expect(call.text).toBe('Primeira linha\nSegunda linha\nTerceira linha\nQuarta linha');

    expect(call.html).not.toContain('\r');
    expect(call.html).toContain('Primeira linha<br/>Segunda linha<br/>Terceira linha<br/>Quarta linha');
  });
});
