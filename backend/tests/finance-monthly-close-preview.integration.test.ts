/**
 * PR #406: integration against disposable local test PostgreSQL.
 * All inserted records are synthetic and removed. No production closing,
 * ledger mutation, accountant approval, payout or external API call.
 */
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { assertSafeFinanceDatabase } from '../src/lib/assert-safe-finance-db';
import { prisma } from '../src/lib/prisma';
import { loadMonthlyClosePreview } from '../src/services/finance/monthly-close-preview.service';

const auth = vi.hoisted(() => ({ role: 'FINANCE' as string | null }));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, res: any, next: any) => {
    if (!auth.role) return res.status(401).json({ success: false });
    req.admin = { id: 'synthetic-monthly-close-admin', role: auth.role };
    next();
  },
  allowFinanceAccess: (req: any, res: any, next: any) => {
    if (!['FINANCE', 'SUPER_ADMIN', 'EXECUTIVE_ADMIN'].includes(req.admin?.role)) {
      return res.status(403).json({ success: false });
    }
    next();
  },
}));
const { default: monthlyCloseRoutes } = await import('../src/routes/admin-finance-monthly-close');

const app = express();
app.use(express.json());
app.use('/api/admin/finance/monthly-close', monthlyCloseRoutes);

const id = () => randomUUID();
const entityA = id(), entityB = id();
const accountA = id(), accountB = id(), payee = id();
const txIds = [id(), id(), id(), id()];
const financeObligationId = id(), accountingObligationId = id();
const suffix = randomUUID().slice(0, 8);
const cnpj = () => String(BigInt('0x' + randomUUID().replace(/-/g, '').slice(0, 12))
  % 10_000_000_000_000n).padStart(14, '0');
const day = (value: string) => new Date(value + 'T00:00:00.000Z');
const url = (entity: string, year: number, month: number) =>
  '/api/admin/finance/monthly-close/preview?legal_entity_id=' + entity +
  '&year=' + year + '&month=' + month;

beforeAll(async () => {
  assertSafeFinanceDatabase();
  await prisma.legal_entities.createMany({ data: [
    { id: entityA, razao_social: 'SYNTHETIC MONTHLY A', cnpj: cnpj(), entity_type: 'MATRIZ' },
    { id: entityB, razao_social: 'SYNTHETIC MONTHLY B', cnpj: cnpj(), entity_type: 'FILIAL' },
  ] });
  await prisma.financial_accounts.createMany({ data: [
    { id: accountA, code: 'CLOSE-A-' + suffix, name: 'Test only A',
      type: 'BANK', legal_entity_id: entityA, currency: 'BRL',
      opening_balance_cents: 123456n, is_active: true },
    { id: accountB, code: 'CLOSE-B-' + suffix, name: 'Test only B',
      type: 'BANK', legal_entity_id: entityB, currency: 'BRL', is_active: true },
  ] });
  await prisma.financial_payees.create({
    data: { id: payee, payee_type: 'COMPANY', legal_name_encrypted: 'synthetic',
      cpf_cnpj_encrypted: 'synthetic', cpf_cnpj_hmac: 'synthetic-' + suffix,
      cpf_cnpj_masked: '***', document_type: 'CNPJ' },
  });
  await prisma.financial_obligations.create({
    data: {
      id: financeObligationId, payee_id: payee, purpose: 'SYNTHETIC',
      source_type: 'TEST', legal_entity_id: entityA,
      description_safe: 'SYNTHETIC ONLY — no real payment',
      gross_amount_cents: 8000n, net_amount_cents: 8000n,
      competence_date: day('2026-08-01'), due_date: day('2026-08-10'),
      status: 'PENDING', idempotency_key: 'synthetic-close-' + suffix,
    },
  });
  await prisma.accounting_payment_obligations.create({
    data: {
      id: accountingObligationId, legal_entity_id: entityA,
      obligation_type: 'HONORARIOS', status: 'SENT_TO_COMPANY',
      action_owner: 'COMPANY', description: 'SYNTHETIC ONLY',
      competence_year: 2026, competence_month: 8,
      amount_cents: 8000, due_date: day('2026-08-10'),
    },
  });
  const base = {
    source_type: 'MANUAL' as const, origin_type: 'MANUAL' as const,
    transaction_type: 'INCOME' as const, direction: 'IN' as const,
    competence_date: day('2026-07-01'), transaction_date: day('2026-07-01'),
    gross_amount_cents: 5000n, net_amount_cents: 5000n,
    description: 'SYNTHETIC TEST; NOT REAL KAVIAR REVENUE',
  };
  await prisma.financial_transactions.createMany({ data: [
    { ...base, id: txIds[0], account_id: accountA, legal_entity_id: entityA, status: 'POSTED' },
    { ...base, id: txIds[1], account_id: accountA, legal_entity_id: entityA, status: 'DRAFT' },
    { ...base, id: txIds[2], account_id: accountA, legal_entity_id: null, status: 'POSTED' },
    { ...base, id: txIds[3], account_id: accountB, legal_entity_id: entityA, status: 'POSTED' },
  ] });
});

afterAll(async () => {
  await prisma.financial_transactions.deleteMany({ where: { id: { in: txIds } } });
  await prisma.accounting_payment_obligations.deleteMany({ where: { id: accountingObligationId } });
  await prisma.financial_obligations.deleteMany({ where: { id: financeObligationId } });
  await prisma.financial_payees.deleteMany({ where: { id: payee } });
  await prisma.financial_accounts.deleteMany({ where: { id: { in: [accountA, accountB] } } });
  await prisma.legal_entities.deleteMany({ where: { id: { in: [entityA, entityB] } } });
  await prisma.$disconnect();
});

describe('Monthly close read-only preview (actual test PostgreSQL)', () => {
  it('does not mistake a no-income month for certified zero revenue', async () => {
    const before = await prisma.financial_accounts.findUnique({
      where: { id: accountA }, select: { opening_balance_cents: true, updated_at: true },
    });
    const response = await request(app).get(url(entityA, 2026, 8));
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.body.data).toMatchObject({
      mode: 'PREVIEW_ONLY', closingStatus: 'NOT_CLOSED',
      competence: '2026-08', periodEnded: true, financialAccountCount: 1,
      zeroRevenueVerified: false, readyForFinalClosing: false,
      ledgerEvidence: 'NO_POSTED_INCOME_IN_SCOPED_LEDGER',
      ledger: {
        transactionCount: 0,
        postedIncomeEntries: { count: 0, netAmountCents: '0' },
      },
      obligations: {
        finance: { openCount: 1, byStatus: [
          { status: 'PENDING', count: 1, netAmountCents: '8000' },
        ] },
        accountantPortal: { openCount: 1, byStatus: [
          { status: 'SENT_TO_COMPANY', count: 1, netAmountCents: '8000' },
        ] },
        sourcesMayOverlap: true,
      },
    });
    expect(response.body.data.reviewReasons).toContain('EXTERNAL_STATEMENT_AND_ACCOUNTANT_EVIDENCE_MISSING');
    expect(response.body.data.reviewReasons).toContain('FINANCIAL_OBLIGATIONS_REQUIRE_REVIEW');
    expect(response.body.data.reviewReasons).toContain('ACCOUNTANT_OBLIGATIONS_REQUIRE_REVIEW');
    expect(JSON.stringify(response.body)).not.toContain('combinedObligationTotal');
    const after = await prisma.financial_accounts.findUnique({
      where: { id: accountA }, select: { opening_balance_cents: true, updated_at: true },
    });
    expect(after).toEqual(before);
  });

  it('counts posted income only for exact company and month, and signals orphan/mismatch', async () => {
    const response = await request(app).get(url(entityA, 2026, 7));
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      competence: '2026-07',
      ledgerEvidence: 'POSTED_INCOME_IN_SCOPED_LEDGER',
      ledger: {
        transactionCount: 3, nonFinalTransactionCount: 1,
        postedIncomeEntries: { count: 2, netAmountCents: '10000' },
        unassignedTransactionCount: 1,
        mismatchedAccountTransactionCount: 1,
        unallocatedBusinessUnitCount: 3,
      },
    });
    for (const item of ['NON_FINAL_TRANSACTIONS',
      'UNASSIGNED_LEGAL_ENTITY_TRANSACTIONS',
      'MISMATCHED_ACCOUNT_ENTITY', 'UNALLOCATED_BUSINESS_UNIT']) {
      expect(response.body.data.reviewReasons).toContain(item);
    }
    expect(response.body.data.readyForFinalClosing).toBe(false);
    const first = await prisma.financial_transactions.findUnique({
      where: { id: txIds[0] }, select: { status: true },
    });
    expect(first?.status).toBe('POSTED');
  });

  it('keeps separate companies from leaking into each other', async () => {
    const r = await request(app).get(url(entityB, 2026, 8));
    expect(r.status).toBe(200);
    expect(r.body.data).toMatchObject({
      legalEntityId: entityB, financialAccountCount: 1,
      ledger: { transactionCount: 0 },
      obligations: {
        finance: { byStatus: [] }, accountantPortal: { byStatus: [] },
      },
    });
    expect(JSON.stringify(r.body)).not.toContain(accountA);
    expect(JSON.stringify(r.body)).not.toContain(financeObligationId);
  });

  it('marks a month still open in calendar as not closable', async () => {
    const r = await loadMonthlyClosePreview(
      entityA, 2026, 9, new Date('2026-09-26T00:00:00.000Z'));
    expect(r?.periodEnded).toBe(false);
    expect(r?.reviewReasons).toContain('PERIOD_NOT_ENDED');
    expect(r?.closingStatus).toBe('NOT_CLOSED');
  });

  it('validates role and input without querying the ledger', async () => {
    auth.role = 'TERRITORIAL_OPERATOR';
    const forbidden = await request(app).get(url(entityA, 2026, 8));
    expect(forbidden.status).toBe(403);
    auth.role = 'FINANCE';
    const invalid = await request(app).get(url(entityA, 2026, 13));
    expect(invalid.status).toBe(400);
    const bad = await request(app).get(
      '/api/admin/finance/monthly-close/preview?legal_entity_id=not-a-uuid&year=2026&month=8');
    expect(bad.status).toBe(400);
    const missing = await request(app).get(url(id(), 2026, 8));
    expect(missing.status).toBe(404);
  });
});
