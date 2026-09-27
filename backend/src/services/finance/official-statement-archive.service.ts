/**
 * PR #409. Origin declared by admin; storage-byte integrity verified by server.
 * Never marks provider origin, reconciliation, zero revenue or closing verified.
 * DB reservation is audited BEFORE S3. Failed S3 or final DB transaction
 * leaves the reservation visible for explicit operational reconciliation.
 */
import { createHash, randomUUID } from 'node:crypto';
import { TextDecoder } from 'node:util';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { assertSafeFinanceDatabase } from '../../lib/assert-safe-finance-db';
import { monthWindow } from './monthly-close-preview.service';
import { FinanceTransactionAuditContext, writeFinanceTransactionAuditTx } from './finance-transaction-audit';
import { ArchiveStorage, S3FinanceEvidenceVault } from './official-statement-vault.service';

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const UTF8 = new TextDecoder('utf-8', { fatal: true });
export type OfficialProvider = 'SUMUP' | 'ASAAS';
export type DeclaredSource = 'PROVIDER_PORTAL_DECLARED' | 'EMAIL_ATTACHMENT_DECLARED';
export class OfficialArchiveError extends Error {
  constructor(public readonly status: number, public readonly code: string) { super(code); }
}
export interface OfficialArchiveInput {
  legalEntityId: string; accountId: string; provider: OfficialProvider;
  year: number; month: number; declaredSourceChannel: DeclaredSource;
  filename: string; content: Buffer;
}
export interface OfficialArchiveActor extends FinanceTransactionAuditContext { role: 'SUPER_ADMIN'; }
export interface ArchiveConfig { bucket: string; kmsKeyArn: string; region: string; }

export function requireOfficialArchiveConfig(): ArchiveConfig {
  if (process.env.FINANCE_OFFICIAL_ARCHIVE_ENABLED !== 'true')
    throw new OfficialArchiveError(404, 'OFFICIAL_ARCHIVE_DISABLED');
  if (process.env.NODE_ENV === 'test') assertSafeFinanceDatabase();
  const bucket = process.env.FINANCE_EVIDENCE_BUCKET || '';
  const kmsKeyArn = process.env.FINANCE_EVIDENCE_KMS_KEY_ARN || '';
  const genericBucket = process.env.S3_UPLOADS_BUCKET || 'kaviar-uploads-847895361928';
  if (!/^[a-z0-9][a-z0-9.-]{2,62}$/.test(bucket) ||
      bucket === genericBucket ||
      !/^arn:aws:kms:[a-z0-9-]+:[0-9]{12}:key\/[a-zA-Z0-9-]+$/.test(kmsKeyArn))
    throw new OfficialArchiveError(503, 'OFFICIAL_ARCHIVE_PRIVATE_STORAGE_NOT_CONFIGURED');
  return { bucket, kmsKeyArn, region: process.env.AWS_REGION || 'us-east-2' };
}
export function inspectArchiveBytes(filename: string, content: Buffer) {
  if (!Buffer.isBuffer(content) || content.length < 6 || content.length > MAX_FILE_BYTES)
    throw new OfficialArchiveError(400, 'ARCHIVE_INVALID_SIZE');
  if (typeof filename !== 'string' || filename.length < 5 || filename.length > 120 ||
      filename.includes('/') || filename.includes('\\') ||
      /[\x00-\x1f\x7f]/.test(filename) || !/\.(pdf|csv)$/i.test(filename))
    throw new OfficialArchiveError(400, 'ARCHIVE_EXTENSION_NOT_ALLOWED');
  const extension = filename.toLowerCase().endsWith('.pdf') ? 'pdf' : 'csv';
  let contentType: 'application/pdf' | 'text/csv';
  if (extension === 'pdf') {
    if (content.subarray(0, 5).toString('ascii') !== '%PDF-' ||
        !content.subarray(Math.max(0, content.length - 1024)).toString('latin1').includes('%%EOF'))
      throw new OfficialArchiveError(400, 'ARCHIVE_INVALID_PDF');
    contentType = 'application/pdf';
  } else {
    let text: string;
    try { text = UTF8.decode(content); }
    catch { throw new OfficialArchiveError(400, 'ARCHIVE_UTF8_REQUIRED'); }
    if (text.includes('\0') || !text.includes(',') || !text.includes('\n'))
      throw new OfficialArchiveError(400, 'ARCHIVE_INVALID_CSV');
    contentType = 'text/csv';
  }
  return { extension, contentType, byteCount: content.length,
    sha256: createHash('sha256').update(content).digest('hex') } as const;
}
function view(row: any) {
  return {
    id: row.id, legalEntityId: row.legal_entity_id, accountId: row.account_id,
    provider: row.provider, competence: String(row.year)+'-'+String(row.month).padStart(2,'0'),
    contentSha256: row.content_sha256, byteCount: row.byte_count, mediaType: row.media_type,
    declaredSourceChannel: row.declared_source_channel, status: row.status,
    storedAt: row.stored_at, recordedAt: row.recorded_at,
    recordedByAdminId: row.recorded_by_admin_id,
    rawContentExposed: false, storageIntegrityVerified: row.status === 'STORED_UNVERIFIED',
    officialSourceVerified: false, reconciliationVerified: false,
    zeroRevenueVerified: false, readyForFinalClosing: false, finalClosing: false,
  };
}
export async function listOfficialArchives(entity: string, year: number, month: number) {
  monthWindow(year, month);
  const legal = await prisma.legal_entities.findFirst({
    where: { id: entity, is_active: true }, select: { id: true },
  });
  if (!legal) throw new OfficialArchiveError(404, 'LEGAL_ENTITY_NOT_FOUND');
  return (await prisma.finance_official_statement_archives.findMany({
    where: { legal_entity_id: entity, year, month }, orderBy: { recorded_at: 'desc' }, take: 100,
  })).map(view);
}
export async function archiveUserDeclaredStatement(
  input: OfficialArchiveInput, actor: OfficialArchiveActor, storage?: ArchiveStorage,
) {
  const config = requireOfficialArchiveConfig(); // BEFORE processing files or touching DB
  if (actor.role !== 'SUPER_ADMIN' || !actor.adminId)
    throw new OfficialArchiveError(403, 'SUPER_ADMIN_REQUIRED');
  monthWindow(input.year, input.month);
  if (input.provider !== 'SUMUP' && input.provider !== 'ASAAS')
    throw new OfficialArchiveError(400, 'UNSUPPORTED_PROVIDER');
  if (input.declaredSourceChannel !== 'PROVIDER_PORTAL_DECLARED' &&
      input.declaredSourceChannel !== 'EMAIL_ATTACHMENT_DECLARED')
    throw new OfficialArchiveError(400, 'INVALID_SOURCE_DECLARATION');
  const checked = inspectArchiveBytes(input.filename, input.content);
  const legal = await prisma.legal_entities.findFirst({
    where: { id: input.legalEntityId, is_active: true }, select: { id: true },
  });
  if (!legal) throw new OfficialArchiveError(404, 'LEGAL_ENTITY_NOT_FOUND');
  const account = await prisma.financial_accounts.findFirst({
    where: { id: input.accountId, legal_entity_id: input.legalEntityId, is_active: true,
      currency: 'BRL', type: { in: ['BANK','PIX_WALLET','CLEARING'] } },
    select: { id: true },
  });
  if (!account) throw new OfficialArchiveError(404,'FINANCIAL_ACCOUNT_SCOPE_NOT_VERIFIED');
  const id = randomUUID();
  const key = 'finance-evidence/' + input.year + '/' + String(input.month).padStart(2,'0') +
    '/' + id + '/source.' + checked.extension;
  const reserved = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const row = await tx.finance_official_statement_archives.create({ data: {
      id, legal_entity_id: input.legalEntityId, account_id: input.accountId,
      provider: input.provider, year: input.year, month: input.month,
      content_sha256: checked.sha256, byte_count: checked.byteCount,
      media_type: checked.contentType, declared_source_channel: input.declaredSourceChannel,
      storage_bucket: config.bucket, storage_key: key, status: 'RESERVED',
      source_verification: 'UNVERIFIED', recorded_by_admin_id: actor.adminId,
    }});
    await writeFinanceTransactionAuditTx(tx, actor, {
      action:'FINANCE_OFFICIAL_ARCHIVE_RESERVE',entityType:'finance_official_statement_archives',
      entityId:id,newValue:{
        legalEntityId: input.legalEntityId, accountId: input.accountId,
        provider:input.provider, year:input.year, month:input.month,
        hash:checked.sha256, bytes:checked.byteCount, declaredSource:input.declaredSourceChannel,
        status:'RESERVED', sourceVerification:'UNVERIFIED',
      },
    });
    return row;
  });
  const vault = storage || new S3FinanceEvidenceVault(config.region);
  try {
    await vault.putAndVerify({
      bucket:config.bucket,key,content:input.content,contentSha256:checked.sha256,
      contentType:checked.contentType,kmsKeyArn:config.kmsKeyArn,
    });
  } catch {
    throw new OfficialArchiveError(503,'ARCHIVE_STORAGE_UNCONFIRMED');
  }
  return prisma.$transaction(async tx => {
    const changed = await tx.finance_official_statement_archives.updateMany({
      where:{id:reserved.id,status:'RESERVED',content_sha256:checked.sha256},
      data:{status:'STORED_UNVERIFIED',stored_at:new Date()},
    });
    if (changed.count !== 1) throw new OfficialArchiveError(409,'ARCHIVE_RESERVATION_CONFLICT');
    const row = await tx.finance_official_statement_archives.findUniqueOrThrow({where:{id}});
    await writeFinanceTransactionAuditTx(tx,actor,{
      action:'FINANCE_OFFICIAL_ARCHIVE_STORAGE_INTEGRITY_CONFIRMED',
      entityType:'finance_official_statement_archives',entityId:id,
      oldValue:{status:'RESERVED'},newValue:{
        status:row.status,hash:row.content_sha256,bytes:row.byte_count,
        officialSourceVerified:false,zeroRevenueVerified:false,
      },
    });
    return view(row);
  });
}
