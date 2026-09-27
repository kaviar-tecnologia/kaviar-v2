/**
 * PR #407 integration: disposable PostgreSQL only. No provider requests,
 * ledger updates, real receipts, payments, final closings or production writes.
 */
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { beforeAll, afterAll, describe, it, expect, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import { assertSafeFinanceDatabase } from '../src/lib/assert-safe-finance-db';

const auth = vi.hoisted(() => ({ role: 'FINANCE', id: 'synthetic-finance-admin' }));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, _res: any, next: any) => {
    req.admin = { id: auth.id, role: auth.role }; next();
  },
  allowFinanceAccess: (_req: any, _res: any, next: any) => next(),
}));
const { default: routes } = await import('../src/routes/admin-finance-monthly-close');
const app = express();
app.use(express.json());
app.use('/api/admin/finance/monthly-close', routes);
const id = () => randomUUID();
const entityA = id(), entityB = id(), accountA = id(), accountB = id();
const suffix = randomUUID().slice(0, 10);
const scope = (entity: string, month = 7) => ({ legal_entity_id: entity, year: 2026, month });
const base = '/api/admin/finance/monthly-close';
async function prepare(entity: string, month = 7, year = 2026) {
  return request(app).post(base + '/reviews/prepare').send({ legal_entity_id: entity, year, month });
}
async function versions(entity: string) {
  return request(app).get(base + '/reviews').query(scope(entity));
}
beforeAll(async () => {
  assertSafeFinanceDatabase();
  await prisma.legal_entities.createMany({ data: [
    { id: entityA, razao_social: 'SYNTHETIC MONTH CLOSE A', cnpj: '72' + suffix.padEnd(12, '0'),
      entity_type: 'MATRIZ' },
    { id: entityB, razao_social: 'SYNTHETIC MONTH CLOSE B', cnpj: '73' + suffix.padEnd(12, '0'),
      entity_type: 'MATRIZ' },
  ] });
  await prisma.financial_accounts.createMany({ data: [
    { id: accountA, code: 'SYN-407-A-' + suffix, name: 'SYNTHETIC A',
      type: 'BANK', legal_entity_id: entityA, opening_balance_cents: 90001n },
    { id: accountB, code: 'SYN-407-B-' + suffix, name: 'SYNTHETIC B',
      type: 'BANK', legal_entity_id: entityB, opening_balance_cents: 76543n },
  ] });
});
afterAll(async () => {
  assertSafeFinanceDatabase();
  await prisma.finance_monthly_close_reviews.deleteMany({
    where: { legal_entity_id: { in: [entityA, entityB] } },
  });
  await prisma.financial_accounts.deleteMany({ where: { id: { in: [accountA, accountB] } } });
  await prisma.legal_entities.deleteMany({ where: { id: { in: [entityA, entityB] } } });
  await prisma.$disconnect();
});
describe('versioned and audited internal review', () => {
  it('creates a synthetic zero-income review without certifying zero revenue', async () => {
    const before = await prisma.financial_accounts.findUnique({
      where: { id: accountA }, select: { opening_balance_cents: true, updated_at: true },
    });
    const p = await prepare(entityA);
    expect(p.status).toBe(201);
    expect(p.headers['cache-control']).toBe('no-store');
    expect(p.body.data).toMatchObject({
      legalEntityId: entityA, competence: '2026-07', version: 1, status: 'DRAFT',
      finalClosing: false, externalStatementsVerified: false, zeroRevenueVerified: false,
      snapshot: {
        mode: 'PREVIEW_ONLY', closingStatus: 'NOT_CLOSED',
        zeroRevenueVerified: false, readyForFinalClosing: false,
        ledgerEvidence: 'NO_POSTED_INCOME_IN_SCOPED_LEDGER',
      },
    });
    expect(p.body.data.reviewReasons).toContain('EXTERNAL_STATEMENT_AND_ACCOUNTANT_EVIDENCE_MISSING');
    expect(p.body.data.snapshot.ledger.postedIncomeEntries.netAmountCents).toBe('0');
    expect((await prepare(entityA)).status).toBe(409);
    const after = await prisma.financial_accounts.findUnique({
      where: { id: accountA }, select: { opening_balance_cents: true, updated_at: true },
    });
    expect(after).toEqual(before);
  });
  it('enforces role, state transitions, immutable prior version and reason', async () => {
    let rows = await versions(entityA);
    expect(rows.status).toBe(200);
    let v1 = rows.body.data[0];
    expect(v1.version).toBe(1);
    let s = await request(app).post(base + '/reviews/' + v1.id + '/submit');
    expect(s.status).toBe(200);
    expect(s.body.data.status).toBe('IN_REVIEW');
    expect((await request(app).post(base + '/reviews/' + v1.id + '/submit')).status).toBe(409);
    expect((await request(app).post(base + '/reviews/' + v1.id + '/approve-internal')).status).toBe(403);
    auth.role = 'SUPER_ADMIN';
    let a = await request(app).post(base + '/reviews/' + v1.id + '/approve-internal');
    expect(a.status).toBe(200);
    expect(a.body.data.status).toBe('INTERNAL_REVIEW_APPROVED');
    expect(a.body.data.finalClosing).toBe(false);
    expect((await request(app).post(base + '/reviews/' + v1.id + '/reopen').send({reason: 'tiny'})).status).toBe(400);
    let reopen = await request(app).post(base + '/reviews/' + v1.id + '/reopen')
      .send({ reason: 'Rever evidencias documentais pendentes' });
    expect(reopen.status).toBe(200);
    expect(reopen.body.data).toMatchObject({
      status: 'REOPENED', version: 1,
      reopenReason: 'Rever evidencias documentais pendentes',
    });
    auth.role = 'FINANCE';
    let p2 = await prepare(entityA);
    expect(p2.status).toBe(201);
    expect(p2.body.data.version).toBe(2);
    expect((await request(app).post(base + '/reviews/' + v1.id + '/submit')).status).toBe(409);
    rows = await versions(entityA);
    expect(rows.body.data.map((x: any) => x.version)).toEqual([2, 1]);
    expect(rows.body.data[1].status).toBe('REOPENED');
    expect(rows.body.data[1].snapshotHash).toBe(v1.snapshotHash);
    const audits = await prisma.$queryRaw<Array<{action: string}>>`
      SELECT action FROM admin_audit_logs
      WHERE entity_type = 'finance_monthly_close_reviews'
        AND entity_id = ${v1.id}
      ORDER BY id ASC`;
    expect(audits.map(x => x.action)).toEqual([
      'FINANCE_MONTHLY_REVIEW_PREPARE', 'FINANCE_MONTHLY_REVIEW_SUBMIT',
      'FINANCE_MONTHLY_INTERNAL_REVIEW_APPROVE', 'FINANCE_MONTHLY_INTERNAL_REVIEW_REOPEN',
    ]);
  });
  it('never shows one CNPJ review in another CNPJ scope', async () => {
    const b = await prepare(entityB);
    expect(b.status).toBe(201);
    const rows = await versions(entityB);
    expect(rows.status).toBe(200);
    expect(rows.body.data).toHaveLength(1);
    expect(rows.body.data[0].legalEntityId).toBe(entityB);
    expect(JSON.stringify(rows.body)).not.toContain(entityA);
  });
  it('rejects an open calendar month and documentary/internal mismatches for approval', async () => {
    const local = new Intl.DateTimeFormat('en-US', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric'}).formatToParts(new Date());
    const year = Number(local.find(x => x.type === 'year')?.value);
    const month = Number(local.find(x => x.type === 'month')?.value);
    const p = await prepare(entityB, month, year);
    expect(p.status).toBe(201);
    expect(p.body.data.snapshot.periodEnded).toBe(false);
    await request(app).post(base + '/reviews/' + p.body.data.id + '/submit');
    auth.role = 'SUPER_ADMIN';
    const blocked = await request(app).post(base + '/reviews/' + p.body.data.id + '/approve-internal');
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toBe('INTERNAL_REVIEW_PENDING_ITEMS');
    const returned = await request(app).post(base + '/reviews/' + p.body.data.id + '/reopen')
      .send({ reason: 'Competencia ainda aberta; retornar para conferencia' });
    expect(returned.status).toBe(200);
    expect(returned.body.data.status).toBe('REOPENED');
    const next = await prepare(entityB, month, year);
    expect(next.status).toBe(201);
    expect(next.body.data.version).toBe(2);
  });
});
