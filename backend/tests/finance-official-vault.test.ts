/** Hermetic S3 protocol checks: fake SDK transport, absolutely no AWS calls. */
import { createHash } from 'node:crypto';
import { PutObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import { S3FinanceEvidenceVault, type ArchiveWrite } from '../src/services/finance/official-statement-vault.service';

const body=Buffer.from('%PDF-1.4\n%%EOF\n');
const contentSha256=createHash('sha256').update(body).digest('hex');
const payload:ArchiveWrite={
  bucket:'kaviar-finance-private-test',key:'finance-evidence/2026/07/fictional/source.pdf',
  content:body,contentSha256,contentType:'application/pdf',
  kmsKeyArn:'arn:aws:kms:us-east-2:000000000000:key/00000000-0000-0000-0000-000000000001',
};
function withFakeClient(params:{stored?:Buffer;metadataHash?:string;encrypted?:boolean}={}) {
  const commands:string[]=[];
  const vault=new S3FinanceEvidenceVault('us-east-2') as any;
  vault.client={
    send:async(command:any)=>{
      if(command instanceof PutObjectCommand) {
        commands.push('PUT');
        expect(command.input).toMatchObject({
          Bucket:payload.bucket,Key:payload.key,ContentType:payload.contentType,
          ContentLength:payload.content.length,ContentDisposition:'attachment',
          CacheControl:'private, no-store',ServerSideEncryption:'aws:kms',
          SSEKMSKeyId:payload.kmsKeyArn,IfNoneMatch:'*',
        });
        expect(command.input.ACL).toBeUndefined();
        expect(command.input.ChecksumSHA256).toBe(Buffer.from(contentSha256,'hex').toString('base64'));
        return {};
      }
      if(command instanceof HeadObjectCommand) {
        commands.push('HEAD');
        return {
          ContentLength:body.length,ContentType:'application/pdf',
          Metadata:{sha256:params.metadataHash??contentSha256},
          ServerSideEncryption:params.encrypted===false?'AES256':'aws:kms',
          SSEKMSKeyId:payload.kmsKeyArn,
        };
      }
      if(command instanceof GetObjectCommand) {
        commands.push('GET');
        return {Body:{transformToByteArray:async()=>params.stored??body}};
      }
      throw new Error('UNEXPECTED_S3_CALL');
    },
  };
  return {vault:vault as S3FinanceEvidenceVault,commands};
}
describe('PR409 storage protocol, NOT proof of provider origin',()=>{
  it('requires create-only KMS PUT, HEAD and full-byte readback in order',async()=>{
    const {vault,commands}=withFakeClient();
    await vault.putAndVerify(payload);
    expect(commands).toEqual(['PUT','HEAD','GET']);
  });
  it('rejects forged metadata even if bytes would otherwise match',async()=>{
    const {vault,commands}=withFakeClient({metadataHash:'0'.repeat(64)});
    await expect(vault.putAndVerify(payload)).rejects.toThrow('ARCHIVE_STORAGE_METADATA_MISMATCH');
    expect(commands).toEqual(['PUT','HEAD']);
  });
  it('rejects non-KMS encryption and any changed stored byte',async()=>{
    await expect(withFakeClient({encrypted:false}).vault.putAndVerify(payload))
      .rejects.toThrow('ARCHIVE_STORAGE_METADATA_MISMATCH');
    await expect(withFakeClient({stored:Buffer.from('%PDF-1.4\n%%BAD\n')}).vault.putAndVerify(payload))
      .rejects.toThrow('ARCHIVE_READBACK_HASH_MISMATCH');
  });
  it('refuses a mismatching local content hash before upload',async()=>{
    const {vault,commands}=withFakeClient();
    await expect(vault.putAndVerify({...payload,contentSha256:'0'.repeat(64)}))
      .rejects.toThrow('ARCHIVE_INPUT_HASH_MISMATCH');
    expect(commands).toEqual([]);
  });
});
