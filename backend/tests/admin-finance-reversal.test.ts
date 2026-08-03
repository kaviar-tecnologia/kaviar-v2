import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, authState } = vi.hoisted(() => {
  const txMock = { financial_transactions: { findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() } };
  const prismaMock: any = {
    admins: { findUnique: vi.fn() },
    financial_accounts: { findUnique: vi.fn() },
    financial_categories: { findUnique: vi.fn() },
    financial_cost_centers: { findUnique: vi.fn() },
    financial_transactions: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    $transaction: vi.fn((fn: any) => fn(txMock)),
  };
  return { prismaMock, txMock, authState: { admin: { id: 'sa-1', email: 'sa@t.l', role: 'SUPER_ADMIN' } as any } };
});

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, res: any, next: any) => { if (!authState.admin) return res.status(401).json({ success: false }); req.admin = authState.admin; next(); },
  allowFinanceAccess: (req: any, res: any, next: any) => { if (!['SUPER_ADMIN', 'FINANCE'].includes(req.admin?.role)) return res.status(403).json({ success: false }); next(); },
}));

const { default: routes } = await import('../src/routes/admin-finance');
const app = express();
app.use(express.json());
app.use('/api/admin/finance', routes);

const postedTxn = {
  id: 'txn-posted', source_type: 'MANUAL', status: 'POSTED', direction: 'OUT',
  transaction_type: 'EXPENSE', account_id: 'acc-1', counterparty_account_id: null,
  category_id: 'cat-1', cost_center_id: null, payment_method: 'PIX',
  gross_amount_cents: BigInt(15000), fee_amount_cents: BigInt(0),
  discount_amount_cents: BigInt(0), retention_amount_cents: BigInt(0), net_amount_cents: BigInt(15000),
  description: 'AWS Agosto', memo: null, metadata: null,
  competence_date: new Date('2026-08-01'), transaction_date: new Date('2026-08-01'),
  due_date: null, settlement_date: new Date('2026-08-05'),
  updated_at: new Date('2026-08-05T10:00:00Z'),
  reversals: [],
};

const validBody = { expected_updated_at: '2026-08-05T10:00:00.000Z', reversal_date: '2026-08-10', reason: 'Pagamento duplicado' };

beforeEach(() => {
  vi.clearAllMocks();
  authState.admin = { id: 'sa-1', email: 'sa@t.l', role: 'SUPER_ADMIN' };
  const { txMock } = vi.hoisted(() => ({ txMock: null as any })); // access via prismaMock.$transaction
  prismaMock.$transaction.mockImplementation(async (fn: any) => {
    const tx = {
      financial_transactions: {
        findUnique: vi.fn().mockResolvedValue(postedTxn),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({ id: 'txn-reversal' }),
      },
    };
    return fn(tx);
  });
});

describe('POST /api/admin/finance/transactions/:id/reverse', () => {
  it('SUPER_ADMIN reverses POSTED → 200', async () => {
    const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('FINANCE → 403', async () => {
    authState.admin = { id: 'f1', email: 'f@t.l', role: 'FINANCE' };
    const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);
    expect(res.status).toBe(403);
  });

  it('missing reason → 400', async () => {
    const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send({ ...validBody, reason: '' });
    expect(res.status).toBe(400);
  });

  it('reason too short → 400', async () => {
    const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send({ ...validBody, reason: 'ab' });
    expect(res.status).toBe(400);
  });

  it('invalid date → 400', async () => {
    const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send({ ...validBody, reversal_date: '2026-02-30' });
    expect(res.status).toBe(400);
  });

  it('missing expected_updated_at → 400', async () => {
    const { expected_updated_at, ...body } = validBody;
    const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(body);
    expect(res.status).toBe(400);
  });

  it('reversal_date before transaction_date → 400', async () => {
    const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send({ ...validBody, reversal_date: '2026-07-01' });
    expect(res.status).toBe(400);
  });

  it('reversal_date before settlement_date → 400', async () => {
    const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send({ ...validBody, reversal_date: '2026-08-03' });
    expect(res.status).toBe(400);
  });

  it('DRAFT cannot be reversed → 400', async () => {
    prismaMock.$transaction.mockImplementation(async (fn: any) => {
      return fn({ financial_transactions: { findUnique: vi.fn().mockResolvedValue({ ...postedTxn, status: 'DRAFT' }), updateMany: vi.fn(), create: vi.fn() } });
    });
    const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);
    expect(res.status).toBe(400);
  });

  it('already reversed → 409', async () => {
    prismaMock.$transaction.mockImplementation(async (fn: any) => {
      return fn({ financial_transactions: { findUnique: vi.fn().mockResolvedValue({ ...postedTxn, reversals: [{ id: 'existing' }] }), updateMany: vi.fn(), create: vi.fn() } });
    });
    const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);
    expect(res.status).toBe(409);
  });

  it('CAS conflict → 409', async () => {
    prismaMock.$transaction.mockImplementation(async (fn: any) => {
      return fn({ financial_transactions: { findUnique: vi.fn().mockResolvedValue(postedTxn), updateMany: vi.fn().mockResolvedValue({ count: 0 }), create: vi.fn() } });
    });
    const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);
    expect(res.status).toBe(409);
  });

  it('non-MANUAL source → 403', async () => {
    prismaMock.$transaction.mockImplementation(async (fn: any) => {
      return fn({ financial_transactions: { findUnique: vi.fn().mockResolvedValue({ ...postedTxn, source_type: 'RIDE' }), updateMany: vi.fn(), create: vi.fn() } });
    });
    const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);
    expect(res.status).toBe(403);
  });
});
