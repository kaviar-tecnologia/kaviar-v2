/**
 * Private KMS vault: unscanned bytes are never read back. The S3 version must
 * carry GuardDuty's clean tag before a SHA-256 read-back is permitted.
 * Malware clearance is not evidence of provider origin.
 */
import { createHash } from 'node:crypto';
import {
  S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, GetObjectTaggingCommand,
} from '@aws-sdk/client-s3';

export interface ArchiveWrite {
  bucket: string; key: string; content: Buffer; contentSha256: string;
  contentType: 'application/pdf' | 'text/csv'; kmsKeyArn: string;
}
export interface ArchiveScanInput {
  bucket: string; key: string; versionId: string; contentSha256: string;
  byteCount: number; contentType: 'application/pdf' | 'text/csv'; kmsKeyArn: string;
}
export type MalwareScanStatus =
  'PENDING' | 'NO_THREATS_FOUND' | 'THREATS_FOUND' |
  'UNSUPPORTED' | 'ACCESS_DENIED' | 'FAILED';
export interface ArchiveScanResult { scanStatus: MalwareScanStatus; integrityVerified: boolean; }
export interface ArchiveStorage {
  putAndInspect(input: ArchiveWrite): Promise<{versionId:string}>;
  verifyCleanVersion(input: ArchiveScanInput): Promise<ArchiveScanResult>;
}
const digest = (b:Uint8Array) => createHash('sha256').update(b).digest('hex');
const knownStatuses = new Set(['NO_THREATS_FOUND','THREATS_FOUND','UNSUPPORTED','ACCESS_DENIED','FAILED']);
function requireVersion(versionId?:string) {
  if (!versionId || versionId === 'null') throw new Error('ARCHIVE_VERSION_ID_REQUIRED');
  return versionId;
}
function inspectHead(head:any, input:ArchiveScanInput) {
  if (head.VersionId !== input.versionId ||
      head.ContentLength !== input.byteCount ||
      head.ContentType !== input.contentType ||
      head.Metadata?.sha256 !== input.contentSha256 ||
      head.ServerSideEncryption !== 'aws:kms' ||
      head.SSEKMSKeyId !== input.kmsKeyArn)
    throw new Error('ARCHIVE_STORAGE_METADATA_MISMATCH');
}
export class S3FinanceEvidenceVault implements ArchiveStorage {
  private readonly client:S3Client;
  constructor(region:string) { this.client = new S3Client({region}); }
  async putAndInspect(input:ArchiveWrite):Promise<{versionId:string}> {
    if (digest(input.content) !== input.contentSha256)
      throw new Error('ARCHIVE_INPUT_HASH_MISMATCH');
    const put = await this.client.send(new PutObjectCommand({
      Bucket:input.bucket, Key:input.key, Body:input.content,
      ContentLength:input.content.length, ContentType:input.contentType,
      ContentDisposition:'attachment', CacheControl:'private, no-store',
      ServerSideEncryption:'aws:kms', SSEKMSKeyId:input.kmsKeyArn,
      ChecksumSHA256:Buffer.from(input.contentSha256,'hex').toString('base64'),
      IfNoneMatch:'*',
      Metadata:{sha256:input.contentSha256,classification:'finance-evidence-unverified'},
    }));
    const versionId = requireVersion(put.VersionId);
    // HEAD the current object and compare its version to the PUT result.
    const head = await this.client.send(new HeadObjectCommand({
      Bucket:input.bucket,Key:input.key,
    }));
    inspectHead(head,{
      bucket:input.bucket,key:input.key,versionId,contentSha256:input.contentSha256,
      byteCount:input.content.length,contentType:input.contentType,kmsKeyArn:input.kmsKeyArn,
    });
    return {versionId}; // No GetObject before the malware scan.
  }
  async verifyCleanVersion(input:ArchiveScanInput):Promise<ArchiveScanResult> {
    requireVersion(input.versionId);
    const object = {Bucket:input.bucket,Key:input.key,VersionId:input.versionId};
    const scanTag = async () => {
      const response = await this.client.send(new GetObjectTaggingCommand(object));
      return response.TagSet?.find(t=>t.Key==='GuardDutyMalwareScanStatus')?.Value;
    };
    const status = await scanTag();
    const scanStatus:MalwareScanStatus = status && knownStatuses.has(status)
      ? status as MalwareScanStatus : 'PENDING';
    if (scanStatus !== 'NO_THREATS_FOUND')
      return {scanStatus,integrityVerified:false}; // No content read.
    inspectHead(await this.client.send(new HeadObjectCommand(object)),input);
    const stored = await this.client.send(new GetObjectCommand(object));
    if (stored.VersionId !== input.versionId || !stored.Body)
      throw new Error('ARCHIVE_READBACK_VERSION_MISMATCH');
    const bytes = await stored.Body.transformToByteArray();
    if (bytes.length !== input.byteCount || digest(bytes) !== input.contentSha256)
      throw new Error('ARCHIVE_READBACK_HASH_MISMATCH');
    // Re-read the exact version's tag before committing a clean result.
    if (await scanTag() !== 'NO_THREATS_FOUND')
      throw new Error('ARCHIVE_SCAN_RESULT_CHANGED');
    return {scanStatus:'NO_THREATS_FOUND',integrityVerified:true};
  }
}
