import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, deleteForMessageMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    inbound_email_messages: {
      findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), delete: vi.fn(),
    },
    email_send_logs: { create: vi.fn() },
  },
  deleteForMessageMock: vi.fn(),
  auditMock: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/services/email/email.service', () => ({ emailService: {} }));
vi.mock('../src/services/inbound-email-attachments.service', () => ({
  InboundAttachmentValidationError: class extends Error { constructor(message: string, public statusCode = 400) { super(message); } },
  inboundEmailAttachmentsService: { createDownloadUrlForMessage: vi.fn(), deleteForMessage: deleteForMessageMock },
}));
vi.mock('../src/utils/audit', () => ({
  audit: auditMock,
  auditCtx: () => ({ adminId: '11111111-1111-1111-1111-111111111111', adminEmail: 'admin@test.local', ip: '127.0.0.1', ua: 'vitest' }),
}));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, _res: any, next: any) => { req.admin = { id: '11111111-1111-1111-1111-111111111111', email: 'admin@test.local', role: 'SUPER_ADMIN' }; next(); },
  requireSuperAdmin: (_req: any, _res: any, next: any) => next(),
}));

const { default: routes } = await import('../src/routes/admin-inbound-emails');
const app = express();
app.use(express.json());
app.use('/api/admin/inbound-emails', routes);

function email(status = 'NEW', extra: Record<string, unknown> = {}) {
  return {
    id: 'email-1', received_at: new Date('2026-09-24T12:00:00Z'), from_email: 'a@test.local', from_name: 'A',
    to_email: 'contato@kaviar.com.br', subject: 'Assunto', text_body: 'Corpo de teste para preview', html_body: null,
    normalized_body: 'Corpo de teste para preview', message_id: '<m1@test>', in_reply_to: null, references_header: null,
    provider: 'CLOUDFLARE_EMAIL_WORKER', status, status_before_trash: null, trashed_at: null, trashed_by_admin_id: null,
    has_attachments: false, attachment_count: 0, attachments_metadata: null, raw_headers: null,
    created_at: new Date('2026-09-24T12:00:00Z'), updated_at: new Date('2026-09-24T12:00:00Z'), ...extra,
  };
}

describe('admin institutional inbox trash lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.inbound_email_messages.findMany.mockResolvedValue([]);
    prismaMock.inbound_email_messages.count.mockResolvedValue(0);
    prismaMock.inbound_email_messages.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.inbound_email_messages.delete.mockResolvedValue({});
    deleteForMessageMock.mockResolvedValue({ deletedObjects: 0 });
  });

  it('exclui TRASHED da caixa normal por padrao', async () => {
    const res = await request(app).get('/api/admin/inbound-emails');
    expect(res.status).toBe(200);
    expect(prismaMock.inbound_email_messages.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: { in: ['NEW', 'READ', 'ARCHIVED'] } }),
    }));
  });

  it('lista a lixeira quando status=TRASHED', async () => {
    const res = await request(app).get('/api/admin/inbound-emails?status=TRASHED');
    expect(res.status).toBe(200);
    expect(prismaMock.inbound_email_messages.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: 'TRASHED' }),
    }));
  });

  it('move para lixeira preservando o status anterior e auditoria', async () => {
    prismaMock.inbound_email_messages.findUnique.mockResolvedValueOnce(email('NEW'));
    prismaMock.inbound_email_messages.update.mockResolvedValueOnce(email('TRASHED', {
      status_before_trash: 'NEW', trashed_at: new Date(), trashed_by_admin_id: '11111111-1111-1111-1111-111111111111',
    }));
    const res = await request(app).post('/api/admin/inbound-emails/email-1/trash');
    expect(res.status).toBe(200);
    expect(prismaMock.inbound_email_messages.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'TRASHED', status_before_trash: 'NEW' }),
    }));
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'INBOUND_EMAIL_TRASHED' }));
  });

  it('restaura para o status original', async () => {
    prismaMock.inbound_email_messages.findUnique.mockResolvedValueOnce(email('TRASHED', { status_before_trash: 'ARCHIVED' }));
    prismaMock.inbound_email_messages.update.mockResolvedValueOnce(email('ARCHIVED'));
    const res = await request(app).post('/api/admin/inbound-emails/email-1/restore');
    expect(res.status).toBe(200);
    expect(prismaMock.inbound_email_messages.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'ARCHIVED', status_before_trash: null, trashed_at: null, trashed_by_admin_id: null }),
    }));
  });

  it('so exclui definitivamente depois da lixeira e limpa storage', async () => {
    prismaMock.inbound_email_messages.findUnique.mockResolvedValueOnce(email('TRASHED', { status_before_trash: 'READ' }));
    deleteForMessageMock.mockResolvedValueOnce({ deletedObjects: 2 });
    const res = await request(app).delete('/api/admin/inbound-emails/email-1');
    expect(res.status).toBe(200);
    expect(deleteForMessageMock).toHaveBeenCalledWith('email-1');
    expect(prismaMock.inbound_email_messages.delete).toHaveBeenCalledWith({ where: { id: 'email-1' } });
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'INBOUND_EMAIL_PERMANENTLY_DELETED' }));
  });

  it('exige confirmacao forte para esvaziar a lixeira', async () => {
    const denied = await request(app).delete('/api/admin/inbound-emails/trash').send({});
    expect(denied.status).toBe(400);
    prismaMock.inbound_email_messages.findMany.mockResolvedValueOnce([]);
    const ok = await request(app).delete('/api/admin/inbound-emails/trash').send({ confirmation: 'EMPTY_TRASH' });
    expect(ok.status).toBe(200);
    expect(ok.body.data.deleted).toBe(0);
  });
});
