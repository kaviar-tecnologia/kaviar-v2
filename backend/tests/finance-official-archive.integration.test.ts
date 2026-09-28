/** PR409: disposable DB; all documents fictional; no real AWS network. */
import { createHash, randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { assertSafeFinanceDatabase } from '../src/lib/assert-safe-finance-db';
import { archiveUserDeclaredStatement, listOfficialArchives, checkOfficialArchiveMalware } from '../src/services/finance/official-statement-archive.service';
import type { ArchiveStorage, ArchiveWrite, ArchiveScanInput, ArchiveScanResult } from '../src/services/finance/official-statement-vault.service';

const auth=vi.hoisted(()=>({role:'SUPER_ADMIN',id:'test-archive-admin'}));
vi.mock('../src/middlewares/auth',()=>({
  authenticateAdmin:(req:any,_res:any,next:any)=>{req.admin={id:auth.id,role:auth.role};next();},
  allowFinanceAccess:(_req:any,_res:any,next:any)=>next(),
}));
const {default:routes}=await import('../src/routes/admin-finance-monthly-close');
const app=express();app.use(express.json());app.use('/api/admin/finance/monthly-close',routes);
const base='/api/admin/finance/monthly-close';
const entityA=randomUUID(),entityB=randomUUID(),accountA=randomUUID(),accountB=randomUUID();
const suffix=randomUUID().replace(/-/g,'').slice(0,10);
const pdf=Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const csv=Buffer.from('synthetic_reference,synthetic_value\nexample,0\n');
const record=(content:Buffer=pdf,filename='fictional.pdf')=>({
  legalEntityId:entityA,accountId:accountA,provider:'SUMUP' as const,
  year:2026,month:7,declaredSourceChannel:'PROVIDER_PORTAL_DECLARED' as const,
  filename,content,
});
const actor={role:'SUPER_ADMIN' as const,adminId:'test-archive-admin'};
const writes:ArchiveWrite[]=[];
const checks:ArchiveScanInput[]=[];
let scanResult:ArchiveScanResult={scanStatus:'NO_THREATS_FOUND',integrityVerified:true};
const fakeVault:ArchiveStorage={
  putAndInspect:async(input)=>{
    expect(createHash('sha256').update(input.content).digest('hex')).toBe(input.contentSha256);
    expect(input.kmsKeyArn).toContain('arn:aws:kms:');
    expect(input.key).toMatch(/^finance-evidence\/2026\/07\/[0-9a-f-]+\/source\.(pdf|csv)$/);
    expect(input.bucket).toBe('kaviar-finance-evidence-test-private');
    writes.push(input);
    return {versionId:'fictional-version-1'};
  },
  verifyCleanVersion:async(input)=>{
    expect(input.versionId).toBe('fictional-version-1');
    expect(input.bucket).toBe('kaviar-finance-evidence-test-private');
    checks.push(input);
    return scanResult;
  },
};
beforeAll(async()=>{
  assertSafeFinanceDatabase();
  vi.stubEnv('FINANCE_OFFICIAL_ARCHIVE_ENABLED','true');
  vi.stubEnv('FINANCE_EVIDENCE_BUCKET','kaviar-finance-evidence-test-private');
  vi.stubEnv('FINANCE_EVIDENCE_KMS_KEY_ARN',
    'arn:aws:kms:us-east-2:000000000000:key/00000000-0000-0000-0000-000000000001');
  await prisma.legal_entities.createMany({data:[
    {id:entityA,razao_social:'FICTITIOUS ARCHIVE A',cnpj:('91'+suffix).padEnd(14,'0'),entity_type:'MATRIZ'},
    {id:entityB,razao_social:'FICTITIOUS ARCHIVE B',cnpj:('92'+suffix).padEnd(14,'0'),entity_type:'MATRIZ'},
  ]});
  await prisma.financial_accounts.createMany({data:[
    {id:accountA,code:'A409-'+suffix,name:'TEST ONLY A',type:'BANK',legal_entity_id:entityA,opening_balance_cents:5678n},
    {id:accountB,code:'B409-'+suffix,name:'TEST ONLY B',type:'BANK',legal_entity_id:entityB,opening_balance_cents:8765n},
  ]});
});
afterAll(async()=>{
  assertSafeFinanceDatabase();
  await prisma.finance_official_statement_archives.deleteMany({where:{legal_entity_id:{in:[entityA,entityB]}}});
  await prisma.financial_accounts.deleteMany({where:{id:{in:[accountA,accountB]}}});
  await prisma.legal_entities.deleteMany({where:{id:{in:[entityA,entityB]}}});
  await prisma.$disconnect();
  vi.unstubAllEnvs();
});
describe('private archive foundation: storage integrity is not provider proof',()=>{
  it('defaults to disabled at HTTP boundary before processing multipart',async()=>{
    vi.stubEnv('FINANCE_OFFICIAL_ARCHIVE_ENABLED','false');
    try{
      const r=await request(app).post(base+'/evidence/official-archive')
        .set('Content-Type','application/octet-stream').send('not an archive');
      expect(r.status).toBe(404);
      expect(r.body.error).toBe('OFFICIAL_ARCHIVE_DISABLED');
      const q=await request(app).get(base+'/evidence/official-archive')
        .query({legal_entity_id:entityA,year:2026,month:7});
      expect(q.status).toBe(404);
    }finally{vi.stubEnv('FINANCE_OFFICIAL_ARCHIVE_ENABLED','true');}
  });
  it('requires SUPER_ADMIN before accepting a document',async()=>{
    auth.role='FINANCE';
    const r=await request(app).post(base+'/evidence/official-archive')
      .set('Content-Type','application/octet-stream').send('not an archive');
    expect(r.status).toBe(403);
    auth.role='SUPER_ADMIN';
  });
  it('stores only scoped metadata and two atomic audit stages',async()=>{
    const before=await prisma.financial_accounts.findUnique({
      where:{id:accountA},select:{opening_balance_cents:true,updated_at:true},
    });
    const saved=await archiveUserDeclaredStatement(record(),actor,fakeVault);
    expect(saved).toMatchObject({
      provider:'SUMUP',status:'STORED_PENDING_SCAN',storageIntegrityVerified:false,
      s3MetadataVerified:true,malwareScanStatus:'PENDING',malwareScanApproved:false,
      officialSourceVerified:false,reconciliationVerified:false,
      zeroRevenueVerified:false,readyForFinalClosing:false,finalClosing:false,
      rawContentExposed:false,
    });
    expect(saved.contentSha256).toBe(createHash('sha256').update(pdf).digest('hex'));
    expect(JSON.stringify(saved)).not.toContain('storage_key');
    expect(JSON.stringify(saved)).not.toContain('storage_bucket');
    expect(writes).toHaveLength(1);
    const db=await prisma.finance_official_statement_archives.findUnique({where:{id:saved.id}});
    expect(db?.source_verification).toBe('UNVERIFIED');
    expect(db?.status).toBe('STORED_PENDING_SCAN');
    expect(db?.storage_version_id).toBe('fictional-version-1');
    expect(db?.storage_key).toContain(saved.id);
    const audit=await prisma.$queryRawUnsafe<Array<{action:string}>>(
      "SELECT action FROM admin_audit_logs WHERE entity_type='finance_official_statement_archives' AND entity_id=$1 ORDER BY id",
      saved.id,
    );
    expect(audit.map(x=>x.action)).toEqual([
      'FINANCE_OFFICIAL_ARCHIVE_RESERVE',
      'FINANCE_OFFICIAL_ARCHIVE_S3_METADATA_CONFIRMED',
    ]);
    const clean=await checkOfficialArchiveMalware(saved.id,actor,fakeVault);
    expect(clean).toMatchObject({
      status:'STORED_UNVERIFIED',malwareScanStatus:'NO_THREATS_FOUND',
      malwareScanApproved:true,storageIntegrityVerified:true,
      officialSourceVerified:false,zeroRevenueVerified:false,finalClosing:false,
    });
    expect(checks).toHaveLength(1);
    const auditAfter=await prisma.$queryRawUnsafe<Array<{action:string}>>(
      "SELECT action FROM admin_audit_logs WHERE entity_type='finance_official_statement_archives' AND entity_id=$1 ORDER BY id",
      saved.id,
    );
    expect(auditAfter.map(x=>x.action)).toEqual([
      'FINANCE_OFFICIAL_ARCHIVE_RESERVE',
      'FINANCE_OFFICIAL_ARCHIVE_S3_METADATA_CONFIRMED',
      'FINANCE_OFFICIAL_ARCHIVE_GUARDDUTY_RESULT_RECORDED',
    ]);
    const after=await prisma.financial_accounts.findUnique({
      where:{id:accountA},select:{opening_balance_cents:true,updated_at:true},
    });
    expect(after).toEqual(before);
    expect(await prisma.financial_transactions.count({where:{legal_entity_id:entityA}})).toBe(0);
    await expect(archiveUserDeclaredStatement(record(),actor,fakeVault))
      .rejects.toMatchObject({code:'P2002'});
  });
  it('a failed vault leaves an audited reservation, not a confirmed object',async()=>{
    const failing:ArchiveStorage={
      putAndInspect:async()=>{throw new Error('FAKE_S3_UNAVAILABLE');},
      verifyCleanVersion:async()=>{throw new Error('SHOULD_NOT_SCAN');},
    };
    await expect(archiveUserDeclaredStatement(record(csv,'fictional.csv'),actor,failing))
      .rejects.toMatchObject({status:503,code:'ARCHIVE_STORAGE_UNCONFIRMED'});
    const pending=await prisma.finance_official_statement_archives.findFirst({
      where:{legal_entity_id:entityA,media_type:'text/csv'},
    });
    expect(pending?.status).toBe('RESERVED');
    expect(pending?.stored_at).toBeNull();
    expect(pending?.source_verification).toBe('UNVERIFIED');
    const audit=await prisma.$queryRawUnsafe<Array<{action:string}>>(
      "SELECT action FROM admin_audit_logs WHERE entity_type='finance_official_statement_archives' AND entity_id=$1",
      pending!.id,
    );
    expect(audit.map(x=>x.action)).toEqual(['FINANCE_OFFICIAL_ARCHIVE_RESERVE']);
  });
  it('rejects cross-CNPJ assignment without even reserving a row',async()=>{
    const before=await prisma.finance_official_statement_archives.count();
    await expect(archiveUserDeclaredStatement({...record(),legalEntityId:entityB},actor,fakeVault))
      .rejects.toMatchObject({status:404,code:'FINANCIAL_ACCOUNT_SCOPE_NOT_VERIFIED'});
    expect(await prisma.finance_official_statement_archives.count()).toBe(before);
  });
  it('lists only same-CNPJ metadata without unlocking closure',async()=>{
    const rows=await listOfficialArchives(entityA,2026,7);
    expect(rows).toHaveLength(2);
    expect(JSON.stringify(rows)).not.toContain(entityB);
    expect(rows.every(x=>x.officialSourceVerified===false&&x.finalClosing===false)).toBe(true);
    expect(await listOfficialArchives(entityB,2026,7)).toEqual([]);
  });
  it('keeps a pending scan blocked, and records a threat without reading or changing financial data',async()=>{
    const another=Buffer.from('synthetic_reference,synthetic_value\nblocked,0\n');
    const saved=await archiveUserDeclaredStatement({
      ...record(another,'blocked.csv'),provider:'ASAAS',
    },actor,fakeVault);
    scanResult={scanStatus:'PENDING',integrityVerified:false};
    expect(await checkOfficialArchiveMalware(saved.id,actor,fakeVault))
      .toMatchObject({status:'STORED_PENDING_SCAN',malwareScanApproved:false});
    scanResult={scanStatus:'THREATS_FOUND',integrityVerified:false};
    expect(await checkOfficialArchiveMalware(saved.id,actor,fakeVault))
      .toMatchObject({status:'STORED_PENDING_SCAN',malwareScanStatus:'THREATS_FOUND',
        malwareScanApproved:false,storageIntegrityVerified:false});
    const row=await prisma.finance_official_statement_archives.findUnique({where:{id:saved.id}});
    expect(row?.source_verification).toBe('UNVERIFIED');
    expect(row?.integrity_verified_at).toBeNull();
    expect(await prisma.financial_transactions.count({where:{legal_entity_id:entityA}})).toBe(0);
    scanResult={scanStatus:'NO_THREATS_FOUND',integrityVerified:true};
    expect(await checkOfficialArchiveMalware(saved.id,actor,fakeVault))
      .toMatchObject({malwareScanStatus:'THREATS_FOUND',malwareScanApproved:false});
  });
  it('fails before DB or storage when feature gate is off',async()=>{
    vi.stubEnv('FINANCE_OFFICIAL_ARCHIVE_ENABLED','false');
    const previous=writes.length;
    try{
      await expect(archiveUserDeclaredStatement(record(),actor,fakeVault))
        .rejects.toMatchObject({status:404,code:'OFFICIAL_ARCHIVE_DISABLED'});
      expect(writes).toHaveLength(previous);
    }finally{vi.stubEnv('FINANCE_OFFICIAL_ARCHIVE_ENABLED','true');}
  });
});
