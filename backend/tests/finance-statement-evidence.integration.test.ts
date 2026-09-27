/** PR #408: SYNTHETIC ONLY. Disposable PostgreSQL; no real money or statements. */
import { randomUUID, createHash } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { assertSafeFinanceDatabase } from '../src/lib/assert-safe-finance-db';
import { recordSyntheticEvidence } from '../src/services/finance/statement-evidence.service';
const auth = vi.hoisted(() => ({ role: 'FINANCE', id: 'synthetic-evidence-admin' }));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, _res: any, next: any) => {
    req.admin = { id: auth.id, role: auth.role }; next();
  },
  allowFinanceAccess: (_req: any, _res: any, next: any) => next(),
}));
const { default: routes } = await import('../src/routes/admin-finance-monthly-close');
const app = express(); app.use(express.json({ limit: '200kb' }));
const base = '/api/admin/finance/monthly-close';
app.use(base, routes);
const entityA = randomUUID(), entityB = randomUUID(), accA = randomUUID(), accB = randomUUID();
const suffix = randomUUID().replace(/-/g,'').slice(0, 10);
const cnpj = (prefix: string) => (prefix + suffix).padEnd(14,'0');
const header = 'event_id,occurred_on,event_type,direction,amount_cents,currency,external_reference';
const csv = [header,
  'synth_income_001,2026-07-20,CREDIT,IN,10000,BRL,synth:income:001',
  'synth_fee_001,2026-07-20,FEE,OUT,123,BRL,synth:fee:001',
].join('\n');
const empty = header + '\n';
const body = (entity: string, account: string, provider: 'SUMUP' | 'ASAAS',
  content: string, year = 2026, month = 7) => ({
  legal_entity_id: entity, account_id: account, provider, year, month,
  content_base64: Buffer.from(content, 'utf8').toString('base64'),
});
const query = (entity: string) => ({ legal_entity_id: entity, year: 2026, month: 7 });
const post = (data: ReturnType<typeof body>) => request(app).post(base + '/evidence/synthetic').send(data);
const actor = { role: 'FINANCE' as const, adminId: 'synthetic-evidence-admin' };
beforeAll(async () => {
  assertSafeFinanceDatabase();
  await prisma.legal_entities.createMany({ data: [
    { id: entityA, razao_social:'SYNTHETIC EVIDENCE A', cnpj:cnpj('81'), entity_type:'MATRIZ' },
    { id: entityB, razao_social:'SYNTHETIC EVIDENCE B', cnpj:cnpj('82'), entity_type:'MATRIZ' },
  ] });
  await prisma.financial_accounts.createMany({ data: [
    { id: accA, code:'EV408-A-'+suffix, name:'SYNTHETIC ONLY A', type:'BANK',
      legal_entity_id:entityA, opening_balance_cents:3000n },
    { id: accB, code:'EV408-B-'+suffix, name:'SYNTHETIC ONLY B', type:'BANK',
      legal_entity_id:entityB, opening_balance_cents:4000n },
  ] });
});
afterAll(async () => {
  assertSafeFinanceDatabase();
  await prisma.finance_statement_evidence.deleteMany({
    where: { legal_entity_id: { in:[entityA,entityB] } },
  });
  await prisma.financial_accounts.deleteMany({ where:{ id:{in:[accA,accB]} } });
  await prisma.legal_entities.deleteMany({ where:{id:{in:[entityA,entityB]}} });
  await prisma.$disconnect();
});
describe('synthetic manifest without pretending to verify provider statements', () => {
  it('keeps missing official SumUp, Asaas and accountant evidence explicit', async () => {
    const r = await request(app).get(base + '/evidence/requirements').query(query(entityA));
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      providerStatementsVerified:false, accountantEvidenceVerified:false,
      zeroRevenueVerified:false, readyForFinalClosing:false, finalClosing:false,
      sources:[{provider:'SUMUP',syntheticManifestCount:0,officialStatementStatus:'NOT_VERIFIED'},
        {provider:'ASAAS',syntheticManifestCount:0,officialStatementStatus:'NOT_VERIFIED'}],
    });
    expect(r.body.data.reviewReasons).toHaveLength(3);
  });
  it('records server hash and preview without storing raw bytes or moving money', async () => {
    const before = await prisma.financial_accounts.findUnique({
      where:{id:accA},select:{opening_balance_cents:true,updated_at:true},
    });
    const r = await post(body(entityA,accA,'SUMUP',csv));
    expect(r.status).toBe(201);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body.data).toMatchObject({
      mode:'SYNTHETIC_EVIDENCE_MANIFEST_ONLY',provider:'SUMUP',
      eventCount:2,rawContentRetained:false,officialSourceVerified:false,
      realStatementVerified:false,zeroRevenueVerified:false,finalClosing:false,
      status:'SYNTHETIC_RECORDED_UNVERIFIED',
      previewSummary:{total:2,candidateCount:0,reviewRequired:2,emptyMonth:false,
        counts:{UNMATCHED:2}},
    });
    expect(r.body.data.contentSha256)
      .toBe(createHash('sha256').update(csv,'utf8').digest('hex'));
    const saved = await prisma.finance_statement_evidence.findUnique({
      where: {id:r.body.data.id},
    });
    expect(saved?.content_sha256).toBe(r.body.data.contentSha256);
    expect(JSON.stringify(saved)).not.toContain('synth_income_001');
    const audit = await prisma.$queryRaw<Array<{action:string}>>`
      SELECT action FROM admin_audit_logs
      WHERE entity_type='finance_statement_evidence' AND entity_id=${r.body.data.id}`;
    expect(audit.map(row=>row.action)).toEqual(['FINANCE_SYNTHETIC_STATEMENT_MANIFEST_REGISTER']);
    const after = await prisma.financial_accounts.findUnique({
      where:{id:accA},select:{opening_balance_cents:true,updated_at:true},
    });
    expect(after).toEqual(before);
    expect(await prisma.financial_transactions.count({
      where:{legal_entity_id:entityA},
    })).toBe(0);
    expect((await post(body(entityA,accA,'SUMUP',csv))).status).toBe(409);
  });
  it('keeps an empty-month manifest distinguishable from real zero turnover', async () => {
    const r=await post(body(entityA,accA,'ASAAS',empty));
    expect(r.status).toBe(201);
    expect(r.body.data).toMatchObject({
      eventCount:0,zeroRevenueVerified:false,realStatementVerified:false,
      previewSummary:{total:0,emptyMonth:true},
    });
    const requirements=await request(app).get(base+'/evidence/requirements').query(query(entityA));
    expect(requirements.body.data.sources.map((x:any)=>x.syntheticManifestCount)).toEqual([1,1]);
    expect(requirements.body.data.readyForFinalClosing).toBe(false);
  });
  it('rejects wrong account/CNPJ, period and provider without metadata insert', async () => {
    const before=await prisma.finance_statement_evidence.count();
    expect((await post(body(entityB,accA,'SUMUP',csv))).status).toBe(404);
    expect((await post(body(entityA,accA,'SUMUP',csv,2026,8))).status).toBe(400);
    expect((await post({...body(entityA,accA,'SUMUP',csv),provider:'PIX'})).status).toBe(400);
    expect(await prisma.finance_statement_evidence.count()).toBe(before);
  });
  it('separates CNPJs while never marking either verified', async () => {
    const r=await post(body(entityB,accB,'SUMUP',csv));
    expect(r.status).toBe(201);
    const a=await request(app).get(base+'/evidence').query(query(entityA));
    const b=await request(app).get(base+'/evidence').query(query(entityB));
    expect(a.body.data).toHaveLength(2);
    expect(b.body.data).toHaveLength(1);
    expect(JSON.stringify(b.body)).not.toContain(entityA);
    expect(b.body.data[0].officialSourceVerified).toBe(false);
  });
  it('rolls back metadata if audit cannot be completed', async () => {
    const input=body(entityA,accA,'SUMUP',header+'\n'+
      'rollback_001,2026-07-22,FEE,OUT,432,BRL,synth:rollback:001');
    const before=await prisma.finance_statement_evidence.count();
    await expect(recordSyntheticEvidence({
      legalEntityId:entityA,accountId:accA,provider:'SUMUP',year:2026,month:7,
      contentBase64:input.content_base64,
    },actor,{injectFailureAfterInsertForTest:true}))
      .rejects.toThrow('TEST_INJECTED_EVIDENCE_AUDIT_FAILURE');
    expect(await prisma.finance_statement_evidence.count()).toBe(before);
  });
  it('never permits synthetic ingestion in production mode', async () => {
    const before=await prisma.finance_statement_evidence.count();
    vi.stubEnv('NODE_ENV','production');
    try {
      const r=await post(body(entityA,accA,'SUMUP',csv));
      expect(r.status).toBe(404);
      expect(r.body.error).toBe('SYNTHETIC_ONLY');
      await expect(recordSyntheticEvidence({
        legalEntityId:entityA,accountId:accA,provider:'SUMUP',year:2026,month:7,
        contentBase64:body(entityA,accA,'SUMUP',csv).content_base64,
      },actor)).rejects.toMatchObject({status:404,code:'SYNTHETIC_ONLY'});
    } finally {vi.unstubAllEnvs();}
    expect(await prisma.finance_statement_evidence.count()).toBe(before);
  });
});
