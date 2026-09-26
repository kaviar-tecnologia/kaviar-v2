/**
 * Real PostgreSQL integration: prove CNPJ/account/provider scoping and that
 * a preview cannot mark or create financial transactions.
 * Selected only by test CI with a safe, disposable finance database.
 */
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { assertSafeFinanceDatabase } from '../src/lib/assert-safe-finance-db';
import { prisma } from '../src/lib/prisma';

vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, _res: any, next: any) => {
    req.admin = { id: 'finance-integration-actor', role: 'FINANCE' };
    next();
  },
  allowFinanceAccess: (_req: any, _res: any, next: any) => next(),
}));
const { default: router } = await import('../src/routes/admin-finance-reconciliation');
const app = express();
app.use(express.json());
app.use('/api/admin/finance/reconciliation', router);

const entity1 = randomUUID();
const entity2 = randomUUID();
const account1 = randomUUID();
const account2 = randomUUID();
const tx1 = randomUUID();
const tx2 = randomUUID();
const tx3 = randomUUID();
const idTag = randomUUID().slice(0, 8);
const cnpj1 = String(BigInt('0x' + randomUUID().replace(/-/g, '').slice(0, 14)) % 10_000_000_000_000n).padStart(14, '0');
const cnpj2 = String(BigInt('0x' + randomUUID().replace(/-/g, '').slice(0, 14)) % 10_000_000_000_000n).padStart(14, '0');
const ledgerIds = [tx1, tx2, tx3];
const endpoint = '/api/admin/finance/reconciliation/preview';
const statement = [
  'external_id,occurred_on,direction,amount_cents,currency,external_reference',
  'sumup_001,2026-09-26,IN,2500,BRL,reconciliation:shared',
].join('\n');

beforeAll(async () => {
  assertSafeFinanceDatabase();
  await prisma.legal_entities.createMany({ data: [
    { id: entity1, razao_social: 'Test Reconciliation A', cnpj: cnpj1, entity_type: 'MATRIZ' },
    { id: entity2, razao_social: 'Test Reconciliation B', cnpj: cnpj2, entity_type: 'MATRIZ' },
  ] });
  await prisma.financial_accounts.createMany({ data: [
    { id: account1, code: 'RECON-A-' + idTag, name: 'Test Settlement A', type: 'BANK',
      legal_entity_id: entity1, currency: 'BRL', is_active: true },
    { id: account2, code: 'RECON-B-' + idTag, name: 'Test Settlement B', type: 'BANK',
      legal_entity_id: entity2, currency: 'BRL', is_active: true },
  ] });
  const base = {
    source_type: 'MANUAL' as const, origin_type: 'MANUAL' as const,
    direction: 'IN' as const, transaction_type: 'INCOME' as const,
    status: 'POSTED' as const, competence_date: new Date('2026-09-26T00:00:00.000Z'),
    transaction_date: new Date('2026-09-26T00:00:00.000Z'),
    gross_amount_cents: 2500n, net_amount_cents: 2500n,
    external_reference: 'reconciliation:shared', description: 'Isolated test entry',
  };
  await prisma.financial_transactions.createMany({ data: [
    { ...base, id: tx1, account_id: account1, legal_entity_id: entity1, provider: 'SUMUP' },
    { ...base, id: tx2, account_id: account2, legal_entity_id: entity2, provider: 'SUMUP' },
    { ...base, id: tx3, account_id: account1, legal_entity_id: entity1, provider: 'ASAAS' },
  ] });
});

afterAll(async () => {
  await prisma.financial_transactions.deleteMany({ where: { id: { in: ledgerIds } } });
  await prisma.financial_accounts.deleteMany({ where: { id: { in: [account1, account2] } } });
  await prisma.legal_entities.deleteMany({ where: { id: { in: [entity1, entity2] } } });
  await prisma.$disconnect();
});

describe('Finance preview SQL/CNPJ isolation against real PostgreSQL', () => {
  it('selects the sole exact provider + account + legal entity candidate', async () => {
    const r = await request(app).post(endpoint).send({
      provider: 'SUMUP', account_id: account1, legal_entity_id: entity1, csv: statement,
    });
    expect(r.status).toBe(200);
    expect(r.body.data.rows).toMatchObject([
      { status: 'CANDIDATE_FOR_REVIEW', candidateTransactionId: tx1 },
    ]);
    expect(JSON.stringify(r.body)).not.toContain(tx2);
    expect(JSON.stringify(r.body)).not.toContain(tx3);
  });

  it('blocks cross-entity account selection even if both entities are active', async () => {
    const r = await request(app).post(endpoint).send({
      provider: 'SUMUP', account_id: account2, legal_entity_id: entity1, csv: statement,
    });
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('FINANCIAL_ACCOUNT_SCOPE_NOT_VERIFIED');
  });

  it('does not change posted status, balances or transaction count', async () => {
    const before = await prisma.financial_transactions.findMany({
      where: { id: { in: ledgerIds } },
      select: { id: true, status: true, net_amount_cents: true, updated_at: true },
      orderBy: { id: 'asc' },
    });
    const accountsBefore = await prisma.financial_accounts.findMany({
      where: { id: { in: [account1, account2] } },
      select: { id: true, opening_balance_cents: true, updated_at: true },
      orderBy: { id: 'asc' },
    });
    const r = await request(app).post(endpoint).send({
      provider: 'SUMUP', account_id: account1, legal_entity_id: entity1, csv: statement,
    });
    expect(r.status).toBe(200);
    const after = await prisma.financial_transactions.findMany({
      where: { id: { in: ledgerIds } },
      select: { id: true, status: true, net_amount_cents: true, updated_at: true },
      orderBy: { id: 'asc' },
    });
    const accountsAfter = await prisma.financial_accounts.findMany({
      where: { id: { in: [account1, account2] } },
      select: { id: true, opening_balance_cents: true, updated_at: true },
      orderBy: { id: 'asc' },
    });
    expect(after).toEqual(before);
    expect(accountsAfter).toEqual(accountsBefore);
    expect(after).toHaveLength(3);
    expect(after.every((t) => t.status === 'POSTED')).toBe(true);
  });
});
