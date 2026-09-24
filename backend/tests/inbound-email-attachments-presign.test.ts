import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  prismaMock,
  putObjectInputState,
  s3ClientCtorState,
  headObjectState,
  getSignedUrlMock,
} = vi.hoisted(() => ({
  prismaMock: {
    inbound_email_messages: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    inbound_email_attachments: {
      aggregate: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
  putObjectInputState: { value: null as any },
  s3ClientCtorState: { value: null as any },
  headObjectState: {
    value: {
      ContentLength: 2048,
      ContentType: 'application/pdf',
      Metadata: { sha256: 'a'.repeat(64) },
    } as any,
  },
  getSignedUrlMock: vi.fn().mockResolvedValue('https://upload.test?X-Amz-SignedHeaders=host'),
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

vi.mock('@aws-sdk/client-s3', () => {
  class PutObjectCommand {
    input: any;
    constructor(input: any) {
      putObjectInputState.value = input;
      this.input = input;
    }
  }

  class DeleteObjectCommand {
    input: any;
    constructor(input: any) {
      this.input = input;
    }
  }

  class GetObjectCommand {
    input: any;
    constructor(input: any) {
      this.input = input;
    }
  }

  class HeadObjectCommand {
    input: any;
    constructor(input: any) {
      this.input = input;
    }
  }

  class S3Client {
    constructor(input: any) {
      s3ClientCtorState.value = input;
    }

    async send(command: any) {
      if (command instanceof HeadObjectCommand) {
        return headObjectState.value;
      }
      return {};
    }
  }

  return { PutObjectCommand, DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, S3Client };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: getSignedUrlMock,
}));

import {
  InboundAttachmentValidationError,
  InboundEmailAttachmentsService,
} from '../src/services/inbound-email-attachments.service';

describe('Inbound attachment presign contract', () => {
  let service: InboundEmailAttachmentsService;

  beforeEach(() => {
    vi.clearAllMocks();
    putObjectInputState.value = null;
    s3ClientCtorState.value = null;

    service = new InboundEmailAttachmentsService();

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
      content_type: 'application/pdf',
      size_bytes: 2048,
      sha256: 'a'.repeat(64),
      status: 'PENDING',
    });
    prismaMock.inbound_email_attachments.update.mockResolvedValue({
      id: 'attachment-1',
      inbound_email_id: 'email-1',
      status: 'AVAILABLE',
    });

    headObjectState.value = {
      ContentLength: 2048,
      ContentType: 'application/pdf',
      Metadata: { sha256: 'a'.repeat(64) },
    };
  });

  it('presign usa ContentType + Metadata.sha256 sem ContentLength/Body e cliente inbound usa WHEN_REQUIRED', async () => {
    const reserved = await service.reserveUpload({
      inboundEmailId: 'email-1',
      filename: 'guia.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      sha256: 'a'.repeat(64),
    });

    expect(putObjectInputState.value).toMatchObject({
      Bucket: expect.any(String),
      Key: expect.stringContaining('inbound-email-attachments/'),
      ContentType: 'application/pdf',
      Metadata: { sha256: 'a'.repeat(64) },
    });
    expect(s3ClientCtorState.value).toMatchObject({
      region: expect.any(String),
      requestChecksumCalculation: 'WHEN_REQUIRED',
    });
    expect(putObjectInputState.value.ContentLength).toBeUndefined();
    expect(putObjectInputState.value.Body).toBeUndefined();
    expect(getSignedUrlMock).toHaveBeenCalledOnce();
    expect(reserved.uploadHeaders).toEqual({
      'content-type': 'application/pdf',
    });
  });

  it('SignedHeaders=host ainda expõe content-type para preservar MIME no S3', async () => {
    getSignedUrlMock.mockResolvedValueOnce('https://upload.test?X-Amz-SignedHeaders=host&x-amz-meta-sha256=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');

    const reserved = await service.reserveUpload({
      inboundEmailId: 'email-1',
      filename: 'guia.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      sha256: 'a'.repeat(64),
    });

    expect(reserved.uploadHeaders).toEqual({
      'content-type': 'application/pdf',
    });
  });

  it('expõe x-amz-meta-sha256 apenas quando SignedHeaders exige metadata', async () => {
    getSignedUrlMock.mockResolvedValueOnce('https://upload.test?X-Amz-SignedHeaders=content-type%3Bhost%3Bx-amz-meta-sha256');

    const reserved = await service.reserveUpload({
      inboundEmailId: 'email-1',
      filename: 'guia.pdf',
      contentType: 'application/pdf',
      sizeBytes: 2048,
      sha256: 'a'.repeat(64),
    });

    expect(reserved.uploadHeaders).toEqual({
      'content-type': 'application/pdf',
      'x-amz-meta-sha256': 'a'.repeat(64),
    });
  });

  it('reserve continua validando sizeBytes', async () => {
    await expect(service.reserveUpload({
      inboundEmailId: 'email-1',
      filename: 'guia.pdf',
      contentType: 'application/pdf',
      sizeBytes: 16 * 1024 * 1024,
      sha256: 'a'.repeat(64),
    })).rejects.toMatchObject<Partial<InboundAttachmentValidationError>>({
      message: expect.stringContaining('limite individual'),
    });
  });

  it('finalize continua rejeitando tamanho remoto divergente', async () => {
    headObjectState.value = {
      ContentLength: 100,
      ContentType: 'application/pdf',
      Metadata: { sha256: 'a'.repeat(64) },
    };

    await expect(service.finalizeUpload({
      inboundEmailId: 'email-1',
      attachmentId: 'attachment-1',
    })).rejects.toMatchObject<Partial<InboundAttachmentValidationError>>({
      message: expect.stringContaining('tamanho divergente'),
      statusCode: 409,
    });
  });

  it('finalize continua rejeitando sha256 remoto divergente', async () => {
    headObjectState.value = {
      ContentLength: 2048,
      ContentType: 'application/pdf',
      Metadata: { sha256: 'b'.repeat(64) },
    };

    await expect(service.finalizeUpload({
      inboundEmailId: 'email-1',
      attachmentId: 'attachment-1',
    })).rejects.toMatchObject<Partial<InboundAttachmentValidationError>>({
      message: expect.stringContaining('sha256 divergente'),
      statusCode: 409,
    });
  });

  it('finalize continua rejeitando content-type remoto divergente', async () => {
    headObjectState.value = {
      ContentLength: 2048,
      ContentType: 'image/png',
      Metadata: { sha256: 'a'.repeat(64) },
    };

    await expect(service.finalizeUpload({
      inboundEmailId: 'email-1',
      attachmentId: 'attachment-1',
    })).rejects.toMatchObject<Partial<InboundAttachmentValidationError>>({
      message: expect.stringContaining('content-type divergente'),
      statusCode: 409,
    });
  });

  it('finalize rejeita explicitamente remote application/octet-stream quando reservado é application/pdf', async () => {
    headObjectState.value = {
      ContentLength: 2048,
      ContentType: 'application/octet-stream',
      Metadata: { sha256: 'a'.repeat(64) },
    };

    await expect(service.finalizeUpload({
      inboundEmailId: 'email-1',
      attachmentId: 'attachment-1',
    })).rejects.toMatchObject<Partial<InboundAttachmentValidationError>>({
      message: expect.stringContaining('content-type divergente'),
      statusCode: 409,
    });
  });
});
