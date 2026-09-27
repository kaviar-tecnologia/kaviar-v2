/**
 * PR #409: private KMS-protected S3 archive. Never returns a URL or raw bytes.
 * Read-back SHA-256 confirms storage integrity, NOT the document's origin.
 */
import { createHash } from 'node:crypto';
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

export interface ArchiveWrite {
  bucket: string; key: string; content: Buffer; contentSha256: string;
  contentType: 'application/pdf' | 'text/csv'; kmsKeyArn: string;
}
export interface ArchiveStorage { putAndVerify(input: ArchiveWrite): Promise<void>; }
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export class S3FinanceEvidenceVault implements ArchiveStorage {
  private readonly client: S3Client;
  constructor(region: string) { this.client = new S3Client({ region }); }
  async putAndVerify(input: ArchiveWrite): Promise<void> {
    if (digest(input.content) !== input.contentSha256) throw new Error('ARCHIVE_INPUT_HASH_MISMATCH');
    await this.client.send(new PutObjectCommand({
      Bucket: input.bucket, Key: input.key, Body: input.content,
      ContentLength: input.content.length, ContentType: input.contentType,
      ContentDisposition: 'attachment', CacheControl: 'private, no-store',
      ServerSideEncryption: 'aws:kms', SSEKMSKeyId: input.kmsKeyArn,
      ChecksumSHA256: Buffer.from(input.contentSha256, 'hex').toString('base64'),
      IfNoneMatch: '*',
      Metadata: { sha256: input.contentSha256, classification: 'finance-evidence-unverified' },
    }));
    const head = await this.client.send(new HeadObjectCommand({
      Bucket: input.bucket, Key: input.key,
    }));
    if (head.ContentLength !== input.content.length ||
        head.ContentType !== input.contentType ||
        head.Metadata?.sha256 !== input.contentSha256 ||
        head.ServerSideEncryption !== 'aws:kms' ||
        head.SSEKMSKeyId !== input.kmsKeyArn) throw new Error('ARCHIVE_STORAGE_METADATA_MISMATCH');
    const stored = await this.client.send(new GetObjectCommand({
      Bucket: input.bucket, Key: input.key,
    }));
    if (!stored.Body) throw new Error('ARCHIVE_READBACK_MISSING');
    const bytes = await stored.Body.transformToByteArray();
    if (bytes.length !== input.content.length ||
        digest(bytes) !== input.contentSha256) throw new Error('ARCHIVE_READBACK_HASH_MISMATCH');
  }
}
