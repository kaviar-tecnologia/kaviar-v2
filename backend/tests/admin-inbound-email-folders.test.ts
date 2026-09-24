import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, auditMock } = vi.hoisted(() => ({
  prismaMock: {
    inbound_email_folders: {
      findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn(),
    },
    inbound_email_messages: {
      findMany: vi.fn(), count: vi.fn(), findUnique: vi.fn(), update: vi.fn(),
    },
    email_send_logs: { create: vi.fn() },
  },
  auditMock: vi.fn(),
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/services/email/email.service', () => ({ emailService: {} }));
vi.mock('../src/services/inbound-email-attachments.service', () => ({
  InboundAttachmentValidationError: class extends Error { constructor(message: string, public statusCode = 400) { super(message); } },
  inboundEmailAttachmentsService: { createDownloadUrlForMessage: vi.fn(), deleteForMessage: vi.fn() },
}));
vi.mock('../src/utils/audit', () => ({
  audit: auditMock,
  auditCtx: () => ({ adminId: 'admin-1', adminEmail: 'admin@test.local', ip: '127.0.0.1', ua: 'vitest' }),
}));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, _res: any, next: any) => { req.admin = { id: 'admin-1', email: 'admin@test.local', role: 'SUPER_ADMIN' }; next(); },
  requireSuperAdmin: (_req: any, _res: any, next: any) => next(),
}));

const { default: routes } = await import('../src/routes/admin-inbound-emails');
const app = express();
app.use(express.json());
app.use('/api/admin/inbound-emails', routes);

function email(extra: Record<string, unknown> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    received_at: new Date('2026-09-24T12:00:00Z'),
    from_email: 'a@test.local', from_name: 'A', to_email: 'contato@kaviar.com.br', subject: 'Assunto',
    text_body: 'Corpo', html_body: null, normalized_body: 'Corpo', message_id: '<m@test>', in_reply_to: null,
    references_header: null, provider: 'CLOUDFLARE_EMAIL_WORKER', status: 'READ', status_before_trash: null,
    trashed_at: null, trashed_by_admin_id: null, custom_folder_id: null, custom_folder: null,
    has_attachments: false, attachment_count: 0, attachments_metadata: null, raw_headers: null,
    created_at: new Date('2026-09-24T12:00:00Z'), updated_at: new Date('2026-09-24T12:00:00Z'), ...extra,
  };
}

describe('admin institutional inbox custom folders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.inbound_email_folders.findMany.mockResolvedValue([]);
    prismaMock.inbound_email_messages.findMany.mockResolvedValue([]);
    prismaMock.inbound_email_messages.count.mockResolvedValue(0);
  });

  it('Recebidos mostra somente emails sem pasta personalizada', async () => {
    const res = await request(app).get('/api/admin/inbound-emails');
    expect(res.status).toBe(200);
    expect(prismaMock.inbound_email_messages.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        custom_folder_id: null,
        status: { in: ['NEW', 'READ'] },
      }),
    }));
  });

  it('filtra uma pasta personalizada sem incluir lixeira', async () => {
    const folderId = '22222222-2222-2222-2222-222222222222';
    const res = await request(app).get(`/api/admin/inbound-emails?folder_id=${folderId}`);
    expect(res.status).toBe(200);
    expect(prismaMock.inbound_email_messages.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        custom_folder_id: folderId,
        status: { notIn: ['TRASHED', 'DELETING'] },
      }),
    }));
  });

  it('cria pasta com nome validado e auditoria', async () => {
    prismaMock.inbound_email_folders.findFirst.mockResolvedValueOnce(null);
    prismaMock.inbound_email_folders.create.mockResolvedValueOnce({
      id: '22222222-2222-2222-2222-222222222222', name: 'AgeRio', created_by_admin_id: 'admin-1',
      created_at: new Date(), updated_at: new Date(),
    });
    const res = await request(app).post('/api/admin/inbound-emails/folders').send({ name: '  AgeRio  ' });
    expect(res.status).toBe(201);
    expect(prismaMock.inbound_email_folders.create).toHaveBeenCalledWith(expect.objectContaining({
      data: { name: 'AgeRio', created_by_admin_id: 'admin-1' },
    }));
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'INBOUND_EMAIL_FOLDER_CREATED' }));
  });

  it('reserva nomes das caixas do sistema', async () => {
    const res = await request(app).post('/api/admin/inbound-emails/folders').send({ name: 'Lixeira' });
    expect(res.status).toBe(400);
    expect(prismaMock.inbound_email_folders.create).not.toHaveBeenCalled();
  });

  it('impede pasta duplicada ignorando maiusculas/minusculas', async () => {
    prismaMock.inbound_email_folders.findFirst.mockResolvedValueOnce({ id: 'existing' });
    const res = await request(app).post('/api/admin/inbound-emails/folders').send({ name: 'agerio' });
    expect(res.status).toBe(409);
  });

  it('move email para uma pasta existente', async () => {
    const folderId = '22222222-2222-2222-2222-222222222222';
    prismaMock.inbound_email_messages.findUnique.mockResolvedValueOnce(email());
    prismaMock.inbound_email_folders.findUnique.mockResolvedValueOnce({ id: folderId, name: 'AgeRio' });
    prismaMock.inbound_email_messages.update.mockResolvedValueOnce(email({
      custom_folder_id: folderId, custom_folder: { id: folderId, name: 'AgeRio' },
    }));

    const res = await request(app)
      .patch('/api/admin/inbound-emails/11111111-1111-1111-1111-111111111111/folder')
      .send({ folder_id: folderId });

    expect(res.status).toBe(200);
    expect(prismaMock.inbound_email_messages.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { custom_folder_id: folderId },
    }));
    expect(res.body.data.custom_folder.name).toBe('AgeRio');
    expect(auditMock).toHaveBeenCalledWith(expect.objectContaining({ action: 'INBOUND_EMAIL_FOLDER_CHANGED' }));
  });

  it('excluir pasta nao exclui emails e libera o vinculo via FK SET NULL', async () => {
    const folderId = '22222222-2222-2222-2222-222222222222';
    prismaMock.inbound_email_folders.findUnique.mockResolvedValueOnce({ id: folderId, name: 'AgeRio' });
    prismaMock.inbound_email_messages.count.mockResolvedValueOnce(3);
    prismaMock.inbound_email_folders.delete.mockResolvedValueOnce({ id: folderId });

    const res = await request(app).delete(`/api/admin/inbound-emails/folders/${folderId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.released_messages).toBe(3);
    expect(prismaMock.inbound_email_folders.delete).toHaveBeenCalledWith({ where: { id: folderId } });
  });
});
