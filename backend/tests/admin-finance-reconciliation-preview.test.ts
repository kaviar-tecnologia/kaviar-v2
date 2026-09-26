import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, auth } = vi.hoisted(() => ({
  db: {
    financial_accounts: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    financial_transactions: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    wallet_recharges: { update: vi.fn() },
    financial_payouts: { create: vi.fn() },
  },
  auth: { role: 'FINANCE' as string | null },
}));
vi.mock('../src/lib/prisma', () => ({ prisma: db }));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, res: any, next: any) => {
    if (!auth.role) return res.status(401).json({ success: false });
    req.admin = { id: 'finance-admin', role: auth.role };
    next();
  },
  allowFinanceAccess: (req: any, res: any, next: any) => {
    if (!['FINANCE', 'SUPER_ADMIN'].includes(req.admin?.role)) {
      return res.status(403).json({ success: false });
    }
    next();
  },
}));

const { default: routes } = await import('../src/routes/admin-finance-reconciliation');
const app = express();
app.use(express.json());
app.use('/api/admin/finance/reconciliation', routes);

const accountId = '11111111-1111-4111-8111-111111111111';
const entityId = '22222222-2222-4222-8222-222222222222';
const csv = [
  'external_id,occurred_on,direction,amount_cents,currency,external_reference',
  'sumup_001,2026-09-26,IN,2500,BRL,wallet_v2:001',
].join('\n');
const data = { provider: 'SUMUP', account_id: accountId, legal_entity_id: entityId, csv };
const endpoint = '/api/admin/finance/reconciliation/preview';

beforeEach(() => {
  vi.clearAllMocks();
  auth.role = 'FINANCE';
  db.financial_accounts.findFirst.mockResolvedValue({ id: accountId });
  db.financial_transactions.findMany.mockResolvedValue([{
    id: 'ledger-001', external_reference: 'wallet_v2:001',
    direction: 'IN', net_amount_cents: 2500n, status: 'POSTED',
  }]);
});

describe('POST /admin/finance/reconciliation/preview', () => {
  it('compares only by exact account + legal entity + provider + reference, without writes', async () => {
    const response = await request(app).post(endpoint).send(data);
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      mode: 'PREVIEW_ONLY', provider: 'SUMUP', account_id: accountId,
      legal_entity_id: entityId,
      rows: [{ status: 'CANDIDATE_FOR_REVIEW', candidateTransactionId: 'ledger-001' }],
    });
    expect(db.financial_accounts.findFirst).toHaveBeenCalledWith({
      where: {
        id: accountId, legal_entity_id: entityId, is_active: true, currency: 'BRL',
        type: { in: ['BANK', 'PIX_WALLET', 'CLEARING'] },
      }, select: { id: true },
    });
    expect(db.financial_transactions.findMany).toHaveBeenCalledWith({
      where: {
        account_id: accountId, legal_entity_id: entityId,
        provider: { equals: 'SUMUP', mode: 'insensitive' },
        external_reference: { in: ['wallet_v2:001'] },
        status: { in: ['POSTED', 'RECONCILED', 'CLOSED'] },
      },
      select: {
        id: true, external_reference: true, direction: true,
        net_amount_cents: true, status: true,
      },
    });
    expect(db.financial_accounts.create).not.toHaveBeenCalled();
    expect(db.financial_accounts.update).not.toHaveBeenCalled();
    expect(db.financial_transactions.create).not.toHaveBeenCalled();
    expect(db.financial_transactions.update).not.toHaveBeenCalled();
    expect(db.wallet_recharges.update).not.toHaveBeenCalled();
    expect(db.financial_payouts.create).not.toHaveBeenCalled();
  });

  it('returns 404 and performs no ledger lookup for an unassigned/mismatched account', async () => {
    db.financial_accounts.findFirst.mockResolvedValue(null);
    const response = await request(app).post(endpoint).send(data);
    expect(response.status).toBe(404);
    expect(response.body.error).toBe('FINANCIAL_ACCOUNT_SCOPE_NOT_VERIFIED');
    expect(db.financial_transactions.findMany).not.toHaveBeenCalled();
  });

  it('rejects unauthorized access before parsing or database access', async () => {
    auth.role = 'TERRITORIAL_OPERATOR';
    const response = await request(app).post(endpoint).send(data);
    expect(response.status).toBe(403);
    expect(db.financial_accounts.findFirst).not.toHaveBeenCalled();
  });

  it('rejects unknown provider, extra properties and unsafe CSV without database access', async () => {
    for (const payload of [
      { ...data, provider: 'FAKE' },
      { ...data, auto_settle: true },
      { ...data, csv: csv.replace('2500', '25.00') },
      { ...data, csv: csv.replace('sumup_001', '=SUM(1)') },
    ]) {
      const response = await request(app).post(endpoint).send(payload);
      expect(response.status).toBe(400);
    }
    expect(db.financial_accounts.findFirst).not.toHaveBeenCalled();
    expect(db.financial_transactions.findMany).not.toHaveBeenCalled();
  });

  it('returns a missing-reference review without scanning the entire ledger', async () => {
    const response = await request(app).post(endpoint).send({
      ...data, csv: csv.replace('wallet_v2:001', ''),
    });
    expect(response.status).toBe(200);
    expect(response.body.data.rows[0].status).toBe('MISSING_REFERENCE');
    expect(db.financial_transactions.findMany).not.toHaveBeenCalled();
  });

  it('does not expose CSV content or credential fields in the response', async () => {
    const response = await request(app).post(endpoint).send(data);
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain('external_id,occurred_on');
    expect(response.body.data.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
