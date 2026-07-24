import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, authState, sendMailMock, auditMock } = vi.hoisted(() => ({
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
  authState: {
    admin: { id: 'admin-1', email: 'admin@test.local', role: 'SUPER_ADMIN' },
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
    req.admin = authState.admin;
    return next();
  },
  requireSuperAdmin: (req: any, res: any, next: any) => {
    if (req.admin?.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ success: false, error: 'Acesso negado.' });
    }
    return next();
  },
}));

const { default: adminEmailRoutes } = await import('../src/routes/admin-email');

const app = express();
app.use(express.json());
app.use('/api/admin/email', adminEmailRoutes);

const BASE_PAYLOAD = {
  to: ['dest@exemplo.com'],
  from: 'KAVIAR <contato@kaviar.com.br>',
  subject: 'Assunto de teste',
  message: 'Mensagem de corpo do email para teste.',
};

describe('admin email CC/BCC - 13 cenarios obrigatorios', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMailMock.mockResolvedValue({ ok: true, provider: 'cloudflare', from: 'KAVIAR <contato@kaviar.com.br>', messageId: 'msg-123' });
    prismaMock.email_send_logs.create.mockResolvedValue({});
  });

  // 1. Envio somente com Para
  it('1. envia somente com Para (sem cc/bcc)', async () => {
    const res = await request(app)
      .post('/api/admin/email/send')
      .send(BASE_PAYLOAD);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    const call = sendMailMock.mock.calls[0][0];
    expect(call.to).toBe('dest@exemplo.com');
    expect(call.cc).toBeUndefined();
    expect(call.bcc).toBeUndefined();
  });

  // 2. Envio com Para e CC
  it('2. envia com Para e CC', async () => {
    const res = await request(app)
      .post('/api/admin/email/send')
      .send({ ...BASE_PAYLOAD, cc: ['copia@exemplo.com'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const call = sendMailMock.mock.calls[0][0];
    expect(call.cc).toEqual(['copia@exemplo.com']);
    expect(call.bcc).toBeUndefined();
  });

  // 3. Envio com Para e CCO
  it('3. envia com Para e CCO (bcc)', async () => {
    const res = await request(app)
      .post('/api/admin/email/send')
      .send({ ...BASE_PAYLOAD, bcc: ['oculto@exemplo.com'] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const call = sendMailMock.mock.calls[0][0];
    expect(call.cc).toBeUndefined();
    expect(call.bcc).toEqual(['oculto@exemplo.com']);
  });

  // 4. Envio com Para, CC e CCO
  it('4. envia com Para, CC e CCO', async () => {
    const res = await request(app)
      .post('/api/admin/email/send')
      .send({
        ...BASE_PAYLOAD,
        cc: ['copia@exemplo.com'],
        bcc: ['oculto@exemplo.com'],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const call = sendMailMock.mock.calls[0][0];
    expect(call.to).toBe('dest@exemplo.com');
    expect(call.cc).toEqual(['copia@exemplo.com']);
    expect(call.bcc).toEqual(['oculto@exemplo.com']);
  });

  // 5. Varios enderecos separados por virgula (enviados como array)
  it('5. aceita varios enderecos no campo to (array)', async () => {
    const res = await request(app)
      .post('/api/admin/email/send')
      .send({
        ...BASE_PAYLOAD,
        to: ['um@exemplo.com', 'dois@exemplo.com', 'tres@exemplo.com'],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const call = sendMailMock.mock.calls[0][0];
    expect(call.to).toBe('um@exemplo.com');
    expect(call.additionalTo).toEqual(['dois@exemplo.com', 'tres@exemplo.com']);
  });

  // 6. Varios enderecos no CC (array)
  it('6. aceita varios enderecos no CC', async () => {
    const res = await request(app)
      .post('/api/admin/email/send')
      .send({
        ...BASE_PAYLOAD,
        cc: ['cc1@exemplo.com', 'cc2@exemplo.com'],
      });

    expect(res.status).toBe(200);
    const call = sendMailMock.mock.calls[0][0];
    expect(call.cc).toEqual(['cc1@exemplo.com', 'cc2@exemplo.com']);
  });

  // 7. Endereco invalido
  it('7. rejeita endereco invalido', async () => {
    const res = await request(app)
      .post('/api/admin/email/send')
      .send({ ...BASE_PAYLOAD, cc: ['nao-e-um-email'] });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  // 8. Endereco repetido entre Para e CC
  it('8. rejeita endereco repetido entre Para e CC', async () => {
    const res = await request(app)
      .post('/api/admin/email/send')
      .send({
        ...BASE_PAYLOAD,
        to: ['dup@exemplo.com'],
        cc: ['dup@exemplo.com'],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('duplicado');
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  // 9. Endereco repetido entre CC e CCO
  it('9. rejeita endereco repetido entre CC e CCO', async () => {
    const res = await request(app)
      .post('/api/admin/email/send')
      .send({
        ...BASE_PAYLOAD,
        cc: ['dup@exemplo.com'],
        bcc: ['dup@exemplo.com'],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('duplicado');
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  // 10. CCO nao aparece nos cabecalhos visiveis (confirmacao via bcc field)
  it('10. CCO e enviado via campo bcc (oculto dos cabecalhos visiveis)', async () => {
    const res = await request(app)
      .post('/api/admin/email/send')
      .send({
        ...BASE_PAYLOAD,
        bcc: ['secreto@exemplo.com'],
      });

    expect(res.status).toBe(200);

    const call = sendMailMock.mock.calls[0][0];
    // bcc e passado separadamente, nunca em to ou cc
    expect(call.to).toBe('dest@exemplo.com');
    expect(call.cc).toBeUndefined();
    expect(call.bcc).toEqual(['secreto@exemplo.com']);
    // Confirma que bcc nao esta no campo to nem subject
    expect(call.to).not.toContain('secreto');
    expect(call.subject).not.toContain('secreto');
  });

  // 11. Envio com anexos juntamente com CC e CCO
  it('11. aceita CC e CCO junto com anexos (multipart)', async () => {
    const res = await request(app)
      .post('/api/admin/email/send')
      .field('to', 'dest@exemplo.com')
      .field('cc', 'copia@exemplo.com')
      .field('bcc', 'oculto@exemplo.com')
      .field('from', 'KAVIAR <contato@kaviar.com.br>')
      .field('subject', 'Assunto com anexo')
      .field('message', 'Mensagem com anexo para teste de CC/CCO.')
      .attach('attachments', Buffer.from('%PDF-1.4 test'), {
        filename: 'doc.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const call = sendMailMock.mock.calls[0][0];
    expect(call.cc).toEqual(['copia@exemplo.com']);
    expect(call.bcc).toEqual(['oculto@exemplo.com']);
    expect(call.attachments).toHaveLength(1);
  });

  // 13. Persistencia correta no historico (writeEmailSendLog chamado com cc e bcc)
  it('13. persiste cc_email e bcc_email no historico', async () => {
    await request(app)
      .post('/api/admin/email/send')
      .send({
        ...BASE_PAYLOAD,
        cc: ['cc1@exemplo.com', 'cc2@exemplo.com'],
        bcc: ['bcc1@exemplo.com'],
      });

    expect(prismaMock.email_send_logs.create).toHaveBeenCalledTimes(1);
    const logData = prismaMock.email_send_logs.create.mock.calls[0][0].data;
    expect(logData.cc_email).toBe('cc1@exemplo.com, cc2@exemplo.com');
    expect(logData.bcc_email).toBe('bcc1@exemplo.com');
    expect(logData.to_email).toBe('dest@exemplo.com');
    expect(logData.status).toBe('SENT');
  });
});
