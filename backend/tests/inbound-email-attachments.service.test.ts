import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    inbound_email_messages: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    inbound_email_attachments: {
      aggregate: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

import {
  InboundAttachmentValidationError,
  InboundEmailAttachmentsService,
  sanitizeAttachmentFilename,
} from '../src/services/inbound-email-attachments.service';

describe('InboundEmailAttachmentsService', () => {
  const storage = {
    createPresignedPut: vi.fn(),
    createPresignedGet: vi.fn(),
    headObject: vi.fn(),
    deleteObject: vi.fn(),
  };

  let service: InboundEmailAttachmentsService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new InboundEmailAttachmentsService(storage);
    prismaMock.inbound_email_messages.findUnique.mockResolvedValue({ id: 'email-1' });
    prismaMock.inbound_email_messages.update.mockResolvedValue({ id: 'email-1' });
    prismaMock.inbound_email_attachments.aggregate.mockResolvedValue({ _sum: { size_bytes: 1024 } });
    prismaMock.inbound_email_attachments.count.mockResolvedValue(1);
    prismaMock.inbound_email_attachments.create.mockResolvedValue({ id: 'attachment-1' });
    prismaMock.inbound_email_attachments.findFirst.mockResolvedValue(null);
    prismaMock.inbound_email_attachments.findMany.mockResolvedValue([]);
    prismaMock.inbound_email_attachments.findUnique.mockResolvedValue({
      id: 'attachment-1',
      inbound_email_id: 'email-1',
      storage_key: 'inbound-email-attachments/2026/07/email-1/attachment-1.pdf',
      size_bytes: 2048,
      sha256: 'a'.repeat(64),
      status: 'PENDING',
      filename: 'documento.pdf',
      content_type: 'application/pdf',
    });
    prismaMock.inbound_email_attachments.update.mockResolvedValue({
      id: 'attachment-1',
      inbound_email_id: 'email-1',
      status: 'AVAILABLE',
    });
    storage.createPresignedPut.mockResolvedValue('https://upload.test');
    storage.createPresignedGet.mockResolvedValue('https://download.test');
    storage.headObject.mockResolvedValue({
      contentLength: 2048,
      contentType: 'application/pdf',
      metadata: { sha256: 'a'.repeat(64) },
    });
  });

  it('sanitiza filename para apresentação', () => {
    expect(sanitizeAttachmentFilename('../prefeitura/ guia final .pdf')).toBe('..-prefeitura- guia final .pdf');
  });

  it('primeiro reserve cria PENDING', async () => {
    const result = await service.reserveUpload({
      inboundEmailId: 'email-1',
      filename: 'guia.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      sha256: 'a'.repeat(64),
    });

    expect(prismaMock.inbound_email_attachments.create).toHaveBeenCalledOnce();
    expect(result.status).toBe('PENDING');
    expect(result.reused).toBe(false);
    expect(result.alreadyAvailable).toBe(false);
    expect(result.uploadHeaders).toEqual({
      'content-type': 'application/pdf',
    });
  });

  it('replay idêntico PENDING retorna mesmo attachment_id e storage_key sem criar novo', async () => {
    prismaMock.inbound_email_attachments.findFirst.mockResolvedValue({
      id: 'attachment-existing',
      storage_key: 'inbound-email-attachments/existing.pdf',
      status: 'PENDING',
      content_type: 'application/pdf',
      size_bytes: 2048,
      sha256: 'a'.repeat(64),
    });

    const result = await service.reserveUpload({
      inboundEmailId: 'email-1',
      filename: 'guia.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      sha256: 'a'.repeat(64),
    });

    expect(result.attachmentId).toBe('attachment-existing');
    expect(result.storageKey).toBe('inbound-email-attachments/existing.pdf');
    expect(result.status).toBe('PENDING');
    expect(result.reused).toBe(true);
    expect(result.alreadyAvailable).toBe(false);
    expect(result.uploadUrl).toBe('https://upload.test');
    expect(result.uploadHeaders).toEqual({
      'content-type': 'application/pdf',
    });
    expect(prismaMock.inbound_email_attachments.create).not.toHaveBeenCalled();
    expect(prismaMock.inbound_email_messages.update).not.toHaveBeenCalled();
    expect(prismaMock.inbound_email_attachments.aggregate).not.toHaveBeenCalled();
  });

  it('replay PENDING renova URL de upload', async () => {
    prismaMock.inbound_email_attachments.findFirst.mockResolvedValue({
      id: 'attachment-existing',
      storage_key: 'inbound-email-attachments/existing.pdf',
      status: 'PENDING',
      content_type: 'application/pdf',
      size_bytes: 2048,
      sha256: 'a'.repeat(64),
    });

    storage.createPresignedPut
      .mockResolvedValueOnce('https://upload.test?first=1')
      .mockResolvedValueOnce('https://upload.test?second=1');

    const first = await service.reserveUpload({
      inboundEmailId: 'email-1',
      filename: 'guia.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      sha256: 'a'.repeat(64),
    });

    const second = await service.reserveUpload({
      inboundEmailId: 'email-1',
      filename: 'guia.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      sha256: 'a'.repeat(64),
    });

    expect(first.uploadUrl).toBe('https://upload.test?first=1');
    expect(second.uploadUrl).toBe('https://upload.test?second=1');
    expect(first.uploadHeaders).toEqual({
      'content-type': 'application/pdf',
    });
    expect(second.uploadHeaders).toEqual({
      'content-type': 'application/pdf',
    });
  });

  it('AVAILABLE reutilizado retorna mesmo attachment_id, upload_url null e não exige finalize', async () => {
    prismaMock.inbound_email_attachments.findFirst.mockResolvedValue({
      id: 'attachment-available',
      storage_key: 'inbound-email-attachments/available.pdf',
      status: 'AVAILABLE',
      content_type: 'application/pdf',
      size_bytes: 2048,
      sha256: 'a'.repeat(64),
    });

    const result = await service.reserveUpload({
      inboundEmailId: 'email-1',
      filename: 'guia.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      sha256: 'a'.repeat(64),
    });

    expect(result.attachmentId).toBe('attachment-available');
    expect(result.status).toBe('AVAILABLE');
    expect(result.reused).toBe(true);
    expect(result.alreadyAvailable).toBe(true);
    expect(result.uploadUrl).toBeNull();
    expect(result.uploadHeaders).toBeNull();
    expect(result.expiresIn).toBeNull();
    expect(storage.createPresignedPut).not.toHaveBeenCalled();
  });

  it('tratamento de corrida com unique usa concorrência real e retorna mesmo attachment_id/storage_key', async () => {
    const key = `email-1|${'a'.repeat(64)}|..-guia final.pdf`;
    const records = new Map<string, {
      id: string;
      storage_key: string;
      status: string;
      content_type: string;
      size_bytes: number;
      sha256: string;
      filename: string;
    }>();

    prismaMock.inbound_email_attachments.findFirst.mockImplementation(async ({ where }) => {
      const lookupKey = `${where.inbound_email_id}|${where.sha256}|${where.filename}`;
      return records.get(lookupKey) ?? null;
    });

    prismaMock.inbound_email_attachments.create.mockImplementation(async ({ data }) => {
      const lookupKey = `${data.inbound_email_id}|${data.sha256}|${data.filename}`;
      await Promise.resolve();
      if (records.has(lookupKey)) {
        const error: any = new Error('unique violation');
        error.code = 'P2002';
        throw error;
      }
      records.set(lookupKey, {
        id: data.id,
        storage_key: data.storage_key,
        status: data.status,
        content_type: data.content_type,
        size_bytes: data.size_bytes,
        sha256: data.sha256,
        filename: data.filename,
      });
      return { id: data.id };
    });

    const input = {
      inboundEmailId: 'email-1',
      filename: '../guia final.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      sha256: 'a'.repeat(64),
    };

    const [first, second] = await Promise.all([
      service.reserveUpload(input),
      service.reserveUpload(input),
    ]);

    expect(records.size).toBe(1);
    expect(records.has(key)).toBe(true);
    expect(first.attachmentId).toBe(second.attachmentId);
    expect(first.storageKey).toBe(second.storageKey);
    expect(first.status).toBe('PENDING');
    expect(second.status).toBe('PENDING');
  });

  it('attachments diferentes continuam distintos', async () => {
    prismaMock.inbound_email_attachments.findFirst.mockResolvedValue(null);

    await service.reserveUpload({
      inboundEmailId: 'email-1',
      filename: 'guia-a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1024,
      sha256: 'a'.repeat(64),
    });

    await service.reserveUpload({
      inboundEmailId: 'email-1',
      filename: 'guia-b.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1024,
      sha256: 'b'.repeat(64),
    });

    expect(prismaMock.inbound_email_attachments.create).toHaveBeenCalledTimes(2);
  });

  it('mesmo SHA com filename diferente continua distinto', async () => {
    prismaMock.inbound_email_attachments.findFirst.mockResolvedValue(null);

    await service.reserveUpload({
      inboundEmailId: 'email-1',
      filename: 'guia-a.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1024,
      sha256: 'a'.repeat(64),
    });

    await service.reserveUpload({
      inboundEmailId: 'email-1',
      filename: 'guia-b.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1024,
      sha256: 'a'.repeat(64),
    });

    expect(prismaMock.inbound_email_attachments.create).toHaveBeenCalledTimes(2);
  });

  it('limite total não é consumido novamente por replay', async () => {
    prismaMock.inbound_email_attachments.findFirst.mockResolvedValue({
      id: 'attachment-existing',
      storage_key: 'inbound-email-attachments/existing.pdf',
      status: 'PENDING',
      content_type: 'application/pdf',
      size_bytes: 2048,
      sha256: 'a'.repeat(64),
    });

    await service.reserveUpload({
      inboundEmailId: 'email-1',
      filename: 'guia.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      sha256: 'a'.repeat(64),
    });

    expect(prismaMock.inbound_email_attachments.aggregate).not.toHaveBeenCalled();
  });

  it('rejeita extensão bloqueada', async () => {
    await expect(service.reserveUpload({
      inboundEmailId: 'email-1',
      filename: 'script.js',
      contentType: 'application/javascript',
      sizeBytes: 200,
      sha256: 'a'.repeat(64),
    })).rejects.toMatchObject<Partial<InboundAttachmentValidationError>>({ message: 'Extensao de arquivo bloqueada para a primeira versao.' });
  });

  it('rejeita tamanho acima do limite individual', async () => {
    await expect(service.reserveUpload({
      inboundEmailId: 'email-1',
      filename: 'guia.pdf',
      contentType: 'application/pdf',
      sizeBytes: 16 * 1024 * 1024,
      sha256: 'a'.repeat(64),
    })).rejects.toMatchObject<Partial<InboundAttachmentValidationError>>({ message: expect.stringContaining('limite individual') });
  });

  it('rejeita quando email excede 10 anexos', async () => {
    prismaMock.inbound_email_attachments.findFirst.mockResolvedValue(null);
    prismaMock.inbound_email_attachments.count.mockResolvedValue(10);

    await expect(service.reserveUpload({
      inboundEmailId: 'email-1',
      filename: 'guia.pdf',
      contentType: 'application/pdf',
      sizeBytes: 1024,
      sha256: 'a'.repeat(64),
    })).rejects.toMatchObject<Partial<InboundAttachmentValidationError>>({ message: expect.stringContaining('limite de 10 anexos') });
  });

  it('faz transição PENDING para AVAILABLE no finalize', async () => {
    const result = await service.finalizeUpload({ inboundEmailId: 'email-1', attachmentId: 'attachment-1' });
    expect(storage.headObject).toHaveBeenCalledWith('inbound-email-attachments/2026/07/email-1/attachment-1.pdf');
    expect(prismaMock.inbound_email_attachments.update).toHaveBeenCalledOnce();
    expect(result.status).toBe('AVAILABLE');
  });

  it('finalize permite image/png quando reservado e remoto coincidem', async () => {
    prismaMock.inbound_email_attachments.findUnique.mockResolvedValueOnce({
      id: 'attachment-png',
      inbound_email_id: 'email-1',
      storage_key: 'inbound-email-attachments/2026/07/email-1/attachment-png.png',
      size_bytes: 1024,
      sha256: 'b'.repeat(64),
      status: 'PENDING',
      filename: 'imagem.png',
      content_type: 'image/png',
    });
    storage.headObject.mockResolvedValueOnce({
      contentLength: 1024,
      contentType: 'image/png',
      metadata: { sha256: 'b'.repeat(64) },
    });

    const result = await service.finalizeUpload({ inboundEmailId: 'email-1', attachmentId: 'attachment-png' });
    expect(result.status).toBe('AVAILABLE');
  });

  it('finalize rejeita application/octet-stream quando reservado é application/pdf', async () => {
    storage.headObject.mockResolvedValueOnce({
      contentLength: 2048,
      contentType: 'application/octet-stream',
      metadata: { sha256: 'a'.repeat(64) },
    });

    await expect(service.finalizeUpload({ inboundEmailId: 'email-1', attachmentId: 'attachment-1' })).rejects
      .toMatchObject<Partial<InboundAttachmentValidationError>>({
        statusCode: 409,
        message: expect.stringContaining('content-type divergente'),
      });
  });

  it('remove do storage todos os anexos antes da exclusao definitiva da mensagem', async () => {
    prismaMock.inbound_email_attachments.findMany.mockResolvedValueOnce([
      { id: 'attachment-a', storage_key: 'inbound-email-attachments/a.pdf' },
      { id: 'attachment-b', storage_key: 'inbound-email-attachments/b.png' },
    ]);
    const result = await service.deleteForMessage('email-1');
    expect(storage.deleteObject).toHaveBeenNthCalledWith(1, 'inbound-email-attachments/a.pdf');
    expect(storage.deleteObject).toHaveBeenNthCalledWith(2, 'inbound-email-attachments/b.png');
    expect(result.deletedObjects).toBe(2);
  });

  it('não gera download para attachment PENDING', async () => {
    prismaMock.inbound_email_attachments.findUnique.mockResolvedValueOnce({
      id: 'attachment-1',
      filename: 'documento.pdf',
      content_type: 'application/pdf',
      storage_key: 'inbound-email-attachments/key',
      status: 'PENDING',
    });

    await expect(service.createDownloadUrl('attachment-1')).rejects.toMatchObject<Partial<InboundAttachmentValidationError>>({ statusCode: 404 });
  });

  it('gera download apenas quando attachment pertence à mensagem informada', async () => {
    prismaMock.inbound_email_attachments.findUnique.mockResolvedValueOnce({
      id: 'attachment-1',
      inbound_email_id: 'email-1',
      filename: 'documento.pdf',
      content_type: 'application/pdf',
      storage_key: 'inbound-email-attachments/key',
      status: 'AVAILABLE',
    });

    const result = await service.createDownloadUrlForMessage('email-1', 'attachment-1');
    expect(result.url).toBe('https://download.test');

    await expect(service.createDownloadUrlForMessage('email-2', 'attachment-1')).rejects.toMatchObject<Partial<InboundAttachmentValidationError>>({ statusCode: 404 });
  });
});
