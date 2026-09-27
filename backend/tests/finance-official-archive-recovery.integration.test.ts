/** PR410: disposable PostgreSQL, fabricated metadata; no external S3, no real statements. */
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll,beforeAll,describe,expect,it,vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { assertSafeFinanceDatabase } from '../src/lib/assert-safe-finance-db';

const auth=vi.hoisted(()=>({role:'SUPER_ADMIN',id:'synthetic-recovery-admin'}));
vi.mock('../src/middlewares/auth',()=>({
  authenticateAdmin:(req:any,_res:any,next:any)=>{req.admin={id:auth.id,role:auth.role};next();},
  allowFinanceAccess:(_req:any,_res:any,next:any)=>next(),
}));
const {default:routes}=await import('../src/routes/admin-finance-monthly-close');
const app=express();app.use(express.json());app.use('/api/admin/finance/monthly-close',routes);
const endpoint='/api/admin/finance/monthly-close/evidence/official-archive/recovery';
const entityA=randomUUID(),entityB=randomUUID(),accountA=randomUUID(),accountB=randomUUID();
const ids=[randomUUID(),randomUUID(),randomUUID()];
const suffix=randomUUID().replace(/-/g,'').slice(0,10);
const query=(entity:string)=>({legal_entity_id:entity,year:2026,month:8});
let referenceNow:Date;
beforeAll(async()=>{
  assertSafeFinanceDatabase();
  vi.stubEnv('FINANCE_OFFICIAL_ARCHIVE_ENABLED','true');
  vi.stubEnv('FINANCE_EVIDENCE_BUCKET','kaviar-finance-evidence-recovery-test');
  vi.stubEnv('FINANCE_EVIDENCE_KMS_KEY_ARN',
    'arn:aws:kms:us-east-2:000000000000:key/00000000-0000-0000-0000-000000000001');
  await prisma.legal_entities.createMany({data:[
    {id:entityA,razao_social:'FICTITIOUS RECOVERY A',cnpj:('73'+suffix).padEnd(14,'0'),entity_type:'MATRIZ'},
    {id:entityB,razao_social:'FICTITIOUS RECOVERY B',cnpj:('74'+suffix).padEnd(14,'0'),entity_type:'MATRIZ'},
  ]});
  await prisma.financial_accounts.createMany({data:[
    {id:accountA,code:'REC410-A-'+suffix,name:'TEST ONLY',type:'BANK',legal_entity_id:entityA},
    {id:accountB,code:'REC410-B-'+suffix,name:'TEST ONLY',type:'BANK',legal_entity_id:entityB},
  ]});
  referenceNow=new Date();
  const row=(id:string,provider:string,status:string,ageMinutes:number,hashChar:string)=>({
    id,legal_entity_id:entityA,account_id:accountA,provider,year:2026,month:8,
    content_sha256:hashChar.repeat(64),byte_count:24,media_type:'text/csv',
    declared_source_channel:'PROVIDER_PORTAL_DECLARED',
    storage_bucket:'kaviar-finance-evidence-recovery-test',
    storage_key:'finance-evidence/test/'+id,status,source_verification:'UNVERIFIED',
    recorded_by_admin_id:'synthetic-recovery-admin',
    recorded_at:new Date(referenceNow.getTime()-ageMinutes*60_000),
    stored_at:status==='STORED_UNVERIFIED'?new Date(referenceNow.getTime()-40*60_000):null,
  });
  await prisma.finance_official_statement_archives.createMany({data:[
    row(ids[0],'SUMUP','RESERVED',40,'a'),
    row(ids[1],'ASAAS','RESERVED',2,'b'),
    row(ids[2],'SUMUP','STORED_UNVERIFIED',60,'c'),
  ]});
});
afterAll(async()=>{
  assertSafeFinanceDatabase();
  await prisma.finance_official_statement_archives.deleteMany({where:{id:{in:ids}}});
  await prisma.financial_accounts.deleteMany({where:{id:{in:[accountA,accountB]}}});
  await prisma.legal_entities.deleteMany({where:{id:{in:[entityA,entityB]}}});
  await prisma.$disconnect();
  vi.unstubAllEnvs();
});
describe('admin read-only recovery of unverified archive reservations',()=>{
  it('keeps feature gate off without entering database logic',async()=>{
    vi.stubEnv('FINANCE_OFFICIAL_ARCHIVE_ENABLED','false');
    try{
      const r=await request(app).get(endpoint).query(query(entityA));
      expect(r.status).toBe(404);
      expect(r.body.error).toBe('OFFICIAL_ARCHIVE_DISABLED');
    }finally{vi.stubEnv('FINANCE_OFFICIAL_ARCHIVE_ENABLED','true');}
  });
  it('blocks FINANCE role: SUPER_ADMIN only',async()=>{
    auth.role='FINANCE';
    try{
      const r=await request(app).get(endpoint).query(query(entityA));
      expect(r.status).toBe(403);
      expect(r.body.error).toBe('SUPER_ADMIN_REQUIRED');
    }finally{auth.role='SUPER_ADMIN';}
  });
  it('reports stale/fresh/stored separately, no S3 key and no writes',async()=>{
    const before=await prisma.finance_official_statement_archives.findMany({
      where:{id:{in:ids}},orderBy:{id:'asc'},
    });
    const r=await request(app).get(endpoint).query(query(entityA));
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.data.counts).toMatchObject({
      total:3,reserved:2,requiresManualObjectCheck:1,storedOriginUnverified:1,
    });
    expect(r.body.data.entries.map((x:any)=>x.action).sort()).toEqual([
      'CHECK_S3_OBJECT_AND_AUDIT_MANUALLY',
      'RESERVATION_RECENT_CHECK_LATER',
      'STORAGE_BYTES_CONFIRMED_ORIGIN_UNVERIFIED',
    ]);
    expect(r.body.data).toMatchObject({
      manualActionsOnly:true,automaticRetry:false,automaticDelete:false,
      s3InspectedByThisEndpoint:false,officialStatementsVerified:false,
      zeroRevenueVerified:false,readyForFinalClosing:false,finalClosing:false,
    });
    expect(JSON.stringify(r.body)).not.toContain('storage_bucket');
    expect(JSON.stringify(r.body)).not.toContain('storage_key');
    expect(JSON.stringify(r.body)).not.toContain('content_sha256');
    const after=await prisma.finance_official_statement_archives.findMany({
      where:{id:{in:ids}},orderBy:{id:'asc'},
    });
    expect(after).toEqual(before);
    expect(await prisma.financial_transactions.count({
      where:{legal_entity_id:entityA},
    })).toBe(0);
  });
  it('isolates other CNPJ and does not certify empty statement',async()=>{
    const r=await request(app).get(endpoint).query(query(entityB));
    expect(r.status).toBe(200);
    expect(r.body.data.entries).toEqual([]);
    expect(r.body.data.zeroRevenueVerified).toBe(false);
    expect(JSON.stringify(r.body)).not.toContain(entityA);
  });
  it('rejects malformed competence without leaking data',async()=>{
    const r=await request(app).get(endpoint).query({...query(entityA),month:13});
    expect(r.status).toBe(400);
  });
});
