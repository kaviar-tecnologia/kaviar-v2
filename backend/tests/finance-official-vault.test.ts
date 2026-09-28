/** Hermetic S3 protocol checks: fake SDK transport; no AWS calls. */
import { createHash } from 'node:crypto';
import {
  PutObjectCommand, HeadObjectCommand, GetObjectCommand, GetObjectTaggingCommand,
} from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import {
  S3FinanceEvidenceVault, type ArchiveWrite, type ArchiveScanInput,
} from '../src/services/finance/official-statement-vault.service';

const body=Buffer.from('%PDF-1.4\n%%EOF\n');
const contentSha256=createHash('sha256').update(body).digest('hex');
const payload:ArchiveWrite={
  bucket:'kaviar-finance-private-test',key:'finance-evidence/2026/07/fictional/source.pdf',
  content:body,contentSha256,contentType:'application/pdf',
  kmsKeyArn:'arn:aws:kms:us-east-2:000000000000:key/00000000-0000-0000-0000-000000000001',
};
const scan:ArchiveScanInput={
  bucket:payload.bucket,key:payload.key,versionId:'v1',contentSha256,
  byteCount:body.length,contentType:payload.contentType,kmsKeyArn:payload.kmsKeyArn,
};
function fake(params:{
  versionId?:string; headVersion?:string; metadataHash?:string; encrypted?:boolean;
  tag?:string; stored?:Buffer; readVersion?:string; changedTag?:string;
}={}) {
  const commands:string[]=[];
  let reads=0;
  const vault=new S3FinanceEvidenceVault('us-east-2') as any;
  vault.client={send:async(cmd:any)=>{
    if(cmd instanceof PutObjectCommand) {
      commands.push('PUT');
      expect(cmd.input).toMatchObject({
        Bucket:payload.bucket,Key:payload.key,ContentLength:body.length,
        ContentDisposition:'attachment',CacheControl:'private, no-store',
        ServerSideEncryption:'aws:kms',SSEKMSKeyId:payload.kmsKeyArn,IfNoneMatch:'*',
      });
      expect(cmd.input.ACL).toBeUndefined();
      expect(cmd.input.ChecksumSHA256).toBe(Buffer.from(contentSha256,'hex').toString('base64'));
      return {VersionId:params.versionId===undefined?'v1':params.versionId};
    }
    if(cmd instanceof HeadObjectCommand) {
      commands.push('HEAD');
      return {VersionId:params.headVersion??'v1',ContentLength:body.length,
        ContentType:'application/pdf',Metadata:{sha256:params.metadataHash??contentSha256},
        ServerSideEncryption:params.encrypted===false?'AES256':'aws:kms',
        SSEKMSKeyId:payload.kmsKeyArn};
    }
    if(cmd instanceof GetObjectTaggingCommand) {
      commands.push('TAG');
      expect(cmd.input).toMatchObject({Bucket:payload.bucket,Key:payload.key,VersionId:'v1'});
      reads++;
      const value=reads>=2&&params.changedTag!==undefined?params.changedTag:params.tag;
      return {TagSet:value===undefined?[]:[{Key:'GuardDutyMalwareScanStatus',Value:value}]};
    }
    if(cmd instanceof GetObjectCommand) {
      commands.push('GET');
      expect(cmd.input).toMatchObject({Bucket:payload.bucket,Key:payload.key,VersionId:'v1'});
      return {VersionId:params.readVersion??'v1',
        Body:{transformToByteArray:async()=>params.stored??body}};
    }
    throw new Error('UNEXPECTED_S3_CALL');
  }};
  return {vault:vault as S3FinanceEvidenceVault,commands};
}
describe('version-pinned GuardDuty gate: no real AWS',()=>{
  it('PUT then HEAD only; records the S3 version and never reads unscanned content',async()=>{
    const {vault,commands}=fake();
    expect(await vault.putAndInspect(payload)).toEqual({versionId:'v1'});
    expect(commands).toEqual(['PUT','HEAD']);
  });
  it('fails closed when bucket version ID is missing or metadata/version does not match',async()=>{
    await expect(fake({versionId:'null'}).vault.putAndInspect(payload))
      .rejects.toThrow('ARCHIVE_VERSION_ID_REQUIRED');
    for(const values of [{headVersion:'another'},{metadataHash:'0'.repeat(64)},{encrypted:false}])
      await expect(fake(values).vault.putAndInspect(payload))
        .rejects.toThrow('ARCHIVE_STORAGE_METADATA_MISMATCH');
  });
  it('rejects changed input hash before S3 operations',async()=>{
    const {vault,commands}=fake();
    await expect(vault.putAndInspect({...payload,contentSha256:'0'.repeat(64)}))
      .rejects.toThrow('ARCHIVE_INPUT_HASH_MISMATCH');
    expect(commands).toEqual([]);
  });
  it('does not GET bytes on pending, threat, skipped, failed or unknown tag',async()=>{
    for(const tag of [undefined,'THREATS_FOUND','UNSUPPORTED','ACCESS_DENIED','FAILED','UNKNOWN']) {
      const {vault,commands}=fake({tag});
      const out=await vault.verifyCleanVersion(scan);
      expect(out.integrityVerified).toBe(false);
      expect(out.scanStatus).toBe(tag&&tag!=='UNKNOWN'?tag:'PENDING');
      expect(commands).toEqual(['TAG']);
    }
  });
  it('reads only the clean exact version and verifies SHA-256 before returning clearance',async()=>{
    const {vault,commands}=fake({tag:'NO_THREATS_FOUND'});
    expect(await vault.verifyCleanVersion(scan))
      .toEqual({scanStatus:'NO_THREATS_FOUND',integrityVerified:true});
    expect(commands).toEqual(['TAG','HEAD','GET','TAG']);
  });
  it('blocks mismatched content, mismatched version and disappearing clean tag',async()=>{
    await expect(fake({tag:'NO_THREATS_FOUND',stored:Buffer.from('changed!')})
      .vault.verifyCleanVersion(scan)).rejects.toThrow('ARCHIVE_READBACK_HASH_MISMATCH');
    await expect(fake({tag:'NO_THREATS_FOUND',readVersion:'other'})
      .vault.verifyCleanVersion(scan)).rejects.toThrow('ARCHIVE_READBACK_VERSION_MISMATCH');
    await expect(fake({tag:'NO_THREATS_FOUND',changedTag:'THREATS_FOUND'})
      .vault.verifyCleanVersion(scan)).rejects.toThrow('ARCHIVE_SCAN_RESULT_CHANGED');
  });
});
