import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { prismaMock, authState, txMock } = vi.hoisted(() => {
  const financial_accounts = { findUnique: vi.fn() };
  const financial_categories = { findUnique: vi.fn() };
  const financial_cost_centers = { findUnique: vi.fn() };
  const financial_transactions = { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), count: vi.fn() };
  const executeRawMock = vi.fn().mockResolvedValue(1);
  const txMock: any = { financial_accounts, financial_categories, financial_cost_centers, financial_transactions, $executeRaw: executeRawMock };
  const prismaMock: any = {
    admins: { findUnique: vi.fn() },
    financial_accounts,
    financial_categories,
    financial_cost_centers,
    financial_transactions,
    $transaction: vi.fn((fn: any) => fn(txMock)),
    $executeRaw: executeRawMock,
  };
  return { prismaMock, txMock, authState: { admin: { id: 'admin-1', email: 'sa@test.local', role: 'SUPER_ADMIN' } as any } };
});

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, _res: any, next: any) => { if (!authState.admin) return _res.status(401).json({ success: false }); req.admin = authState.admin; next(); },
  allowFinanceAccess: (req: any, res: any, next: any) => { if (!['SUPER_ADMIN', 'FINANCE'].includes(req.admin?.role)) return res.status(403).json({ success: false }); next(); },
}));

const { default: adminFinanceRoutes } = await import('../src/routes/admin-finance');
const app = express();
app.use(express.json());
app.use('/api/admin/finance', adminFinanceRoutes);

const validCreateBody = {
  account_id: 'acc-1',
  category_id: 'cat-1',
  cost_center_id: 'cc-1',
  direction: 'OUT',
  transaction_type: 'EXPENSE',
  payment_method: 'PIX',
  competence_date: '2026-08-01',
  transaction_date: '2026-08-01',
  due_date: '2026-08-15',
  gross_amount_cents: '15000',
  net_amount_cents: '15000',
  description: 'AWS mensal - agosto 2026',
};

const mockTransaction = {
  id: 'txn-1', description: 'AWS mensal', direction: 'OUT', transaction_type: 'EXPENSE',
  status: 'DRAFT', source_type: 'MANUAL', origin_type: 'MANUAL', payment_method: 'PIX',
  competence_date: new Date('2026-08-01'), transaction_date: new Date('2026-08-01'),
  due_date: new Date('2026-08-15'), settlement_date: null,
  gross_amount_cents: 15000n, fee_amount_cents: 0n, discount_amount_cents: 0n,
  retention_amount_cents: 0n, net_amount_cents: 15000n, transfer_amount_cents: null,
  account: { id: 'acc-1', code: 'BANK-01', name: 'Conta', type: 'BANK' },
  category: { id: 'cat-1', code: 'TECH', name: 'Tecnologia', kind: 'EXPENSE' },
  cost_center: { id: 'cc-1', code: 'OPS', name: 'Operações', type: 'OPERATIONAL' },
  created_by_admin: { id: 'admin-1', name: 'Admin' },
  responsible_admin: { id: 'admin-1', name: 'Admin' },
  approved_by_admin: null, external_reference: null, memo: null, metadata: null,
  source_id: null, origin_id: null, provider: null, provider_event_id: null,
  idempotency_key: null, transfer_group_id: null, counterparty_account: null,
  reversal_of: null, reversals: [], allocations: [], outgoing_links: [], incoming_links: [],
  canceled_reason: null, canceled_at: null, created_at: new Date(), updated_at: new Date(),
  account_id: 'acc-1', counterparty_account_id: null, category_id: 'cat-1', cost_center_id: 'cc-1',
  created_by_admin_id: 'admin-1', approved_by_admin_id: null, responsible_admin_id: 'admin-1',
  reversal_of_id: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  authState.admin = { id: 'admin-1', email: 'sa@test.local', role: 'SUPER_ADMIN' };
  prismaMock.financial_accounts.findUnique.mockResolvedValue({ id: 'acc-1', is_active: true });
  prismaMock.financial_categories.findUnique.mockResolvedValue({ id: 'cat-1', is_active: true });
  prismaMock.financial_cost_centers.findUnique.mockResolvedValue({ id: 'cc-1', is_active: true });
  prismaMock.financial_transactions.create.mockResolvedValue({ id: 'txn-1' });
  prismaMock.financial_transactions.findUnique.mockResolvedValue(mockTransaction);
  prismaMock.financial_transactions.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.$transaction.mockImplementation((fn: any) => fn(txMock));
  txMock.$executeRaw.mockResolvedValue(1);
});

describe('POST /api/admin/finance/transactions', () => {
  it('FINANCE role → 403', async () => {
    authState.admin = { id: 'f1', email: 'f@t.l', role: 'FINANCE' };
    const res = await request(app).post('/api/admin/finance/transactions').send(validCreateBody);
    expect(res.status).toBe(403);
  });

  it('SUPER_ADMIN → 201', async () => {
    const res = await request(app).post('/api/admin/finance/transactions').send(validCreateBody);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it('missing description → 400', async () => {
    const { description, ...body } = validCreateBody;
    const res = await request(app).post('/api/admin/finance/transactions').send(body);
    expect(res.status).toBe(400);
  });

  it('inactive account → 400', async () => {
    prismaMock.financial_accounts.findUnique.mockResolvedValue({ id: 'acc-1', is_active: false });
    const res = await request(app).post('/api/admin/finance/transactions').send(validCreateBody);
    expect(res.status).toBe(400);
  });

  it('sets source_type=MANUAL', async () => {
    await request(app).post('/api/admin/finance/transactions').send(validCreateBody);
    expect(prismaMock.financial_transactions.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ source_type: 'MANUAL' }) })
    );
  });
});

describe('PATCH /api/admin/finance/transactions/:id', () => {
  it('FINANCE role → 403', async () => {
    authState.admin = { id: 'f1', email: 'f@t.l', role: 'FINANCE' };
    const res = await request(app).patch('/api/admin/finance/transactions/txn-1').send({ expected_updated_at: '2026-08-01T00:00:00.000Z', description: 'new' });
    expect(res.status).toBe(403);
  });

  it('CAS conflict → 409', async () => {
    prismaMock.financial_transactions.findUnique.mockResolvedValue({ ...mockTransaction, status: 'DRAFT', source_type: 'MANUAL' });
    prismaMock.financial_transactions.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).patch('/api/admin/finance/transactions/txn-1').send({ expected_updated_at: '2026-08-01T00:00:00.000Z', description: 'x' });
    expect(res.status).toBe(409);
  });

  it('non-MANUAL source via CAS → finds and returns 403', async () => {
    prismaMock.financial_transactions.findUnique.mockResolvedValue({ ...mockTransaction, status: 'DRAFT', source_type: 'RIDE' });
    const res = await request(app).patch('/api/admin/finance/transactions/txn-1').send({ expected_updated_at: '2026-08-01T00:00:00.000Z', description: 'x' });
    expect(res.status).toBe(403);
  });

  it('DRAFT + matching updated_at → editable', async () => {
    prismaMock.financial_transactions.findUnique.mockResolvedValue({ ...mockTransaction, status: 'DRAFT', source_type: 'MANUAL' });
    prismaMock.financial_transactions.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).patch('/api/admin/finance/transactions/txn-1').send({ expected_updated_at: '2026-08-01T00:00:00.000Z', description: 'updated' });
    expect(res.status).toBe(200);
  });

  it('empty body (only expected_updated_at) → 400', async () => {
    const res = await request(app).patch('/api/admin/finance/transactions/txn-1').send({ expected_updated_at: '2026-08-01T00:00:00.000Z' });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/admin/finance/transactions/:id/post', () => {
  it('liquidates DRAFT → POSTED', async () => {
    prismaMock.financial_transactions.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.financial_transactions.findUnique.mockResolvedValue({ ...mockTransaction, status: 'POSTED' });
    const res = await request(app).post('/api/admin/finance/transactions/txn-1/post').send({ expected_updated_at: '2026-08-01T00:00:00.000Z' });
    expect(res.status).toBe(200);
  });

  it('FINANCE → 403', async () => {
    authState.admin = { id: 'f1', email: 'f@t.l', role: 'FINANCE' };
    const res = await request(app).post('/api/admin/finance/transactions/txn-1/post').send({ expected_updated_at: '2026-08-01T00:00:00.000Z' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/admin/finance/transactions/:id/cancel', () => {
  it('cancels with reason', async () => {
    prismaMock.financial_transactions.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.financial_transactions.findUnique.mockResolvedValue({ ...mockTransaction, status: 'CANCELED' });
    const res = await request(app).post('/api/admin/finance/transactions/txn-1/cancel').send({ expected_updated_at: '2026-08-01T00:00:00.000Z', canceled_reason: 'Duplicado' });
    expect(res.status).toBe(200);
  });

  it('missing reason → 400', async () => {
    const res = await request(app).post('/api/admin/finance/transactions/txn-1/cancel').send({ expected_updated_at: '2026-08-01T00:00:00.000Z' });
    expect(res.status).toBe(400);
  });

  it('POSTED via CAS → 400 (exige estorno)', async () => {
    prismaMock.financial_transactions.updateMany.mockResolvedValue({ count: 0 });
    prismaMock.financial_transactions.findUnique.mockResolvedValue({ id: 'txn-1', status: 'POSTED', source_type: 'MANUAL' });
    const res = await request(app).post('/api/admin/finance/transactions/txn-1/cancel').send({ expected_updated_at: '2026-08-01T00:00:00.000Z', canceled_reason: 'test' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('estorno');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Additional validation tests
// ══════════════════════════════════════════════════════════════════════════════

describe('Validation: monetary and dates', () => {
  it('gross_amount_cents = "0" → 400 (must be > 0)', async () => {
    const res = await request(app).post('/api/admin/finance/transactions').send({ ...validCreateBody, gross_amount_cents: '0', net_amount_cents: '0' });
    expect(res.status).toBe(400);
  });

  it('negative gross → 400', async () => {
    const res = await request(app).post('/api/admin/finance/transactions').send({ ...validCreateBody, gross_amount_cents: '-100', net_amount_cents: '-100' });
    expect(res.status).toBe(400);
  });

  it('overflow bigint → 400', async () => {
    const res = await request(app).post('/api/admin/finance/transactions').send({ ...validCreateBody, gross_amount_cents: '99999999999999999999999', net_amount_cents: '99999999999999999999999' });
    expect(res.status).toBe(400);
  });

  it('non-numeric amount → 400', async () => {
    const res = await request(app).post('/api/admin/finance/transactions').send({ ...validCreateBody, gross_amount_cents: 'abc', net_amount_cents: 'abc' });
    expect(res.status).toBe(400);
  });

  it('invalid date Feb 30 → 400', async () => {
    const res = await request(app).post('/api/admin/finance/transactions').send({ ...validCreateBody, competence_date: '2026-02-30' });
    expect(res.status).toBe(400);
  });

  it('invalid date Apr 31 → 400', async () => {
    const res = await request(app).post('/api/admin/finance/transactions').send({ ...validCreateBody, transaction_date: '2026-04-31' });
    expect(res.status).toBe(400);
  });

  it('due_date before transaction_date → 400', async () => {
    const res = await request(app).post('/api/admin/finance/transactions').send({ ...validCreateBody, transaction_date: '2026-08-15', due_date: '2026-08-01' });
    expect(res.status).toBe(400);
  });

  it('net != gross in V1 → 400', async () => {
    const res = await request(app).post('/api/admin/finance/transactions').send({ ...validCreateBody, gross_amount_cents: '15000', net_amount_cents: '14000' });
    expect(res.status).toBe(400);
  });
});

describe('Validation: direction/type compatibility', () => {
  it('IN + EXPENSE → 400', async () => {
    const res = await request(app).post('/api/admin/finance/transactions').send({ ...validCreateBody, direction: 'IN', transaction_type: 'EXPENSE' });
    expect(res.status).toBe(400);
  });

  it('OUT + INCOME → 400', async () => {
    const res = await request(app).post('/api/admin/finance/transactions').send({ ...validCreateBody, direction: 'OUT', transaction_type: 'INCOME' });
    expect(res.status).toBe(400);
  });

  it('IN + INCOME → 201', async () => {
    const res = await request(app).post('/api/admin/finance/transactions').send({ ...validCreateBody, direction: 'IN', transaction_type: 'INCOME' });
    expect(res.status).toBe(201);
  });
});

describe('Validation: references and concurrency', () => {
  it('missing category_id → 400', async () => {
    const { category_id, ...body } = validCreateBody;
    const res = await request(app).post('/api/admin/finance/transactions').send(body);
    expect(res.status).toBe(400);
  });

  it('inactive category → 400', async () => {
    prismaMock.financial_categories.findUnique.mockResolvedValue({ id: 'cat-1', is_active: false });
    const res = await request(app).post('/api/admin/finance/transactions').send(validCreateBody);
    expect(res.status).toBe(400);
  });

  it('expected_updated_at missing on PATCH → 400', async () => {
    const res = await request(app).patch('/api/admin/finance/transactions/txn-1').send({ description: 'x' });
    expect(res.status).toBe(400);
  });

  it('metadata with unknown property → 400', async () => {
    const res = await request(app).post('/api/admin/finance/transactions').send({ ...validCreateBody, metadata: { unknown_field: 'x' } });
    expect(res.status).toBe(400);
  });

  it('FINANCE role POST → 403', async () => {
    authState.admin = { id: 'f1', email: 'f@t.l', role: 'FINANCE' };
    const res = await request(app).post('/api/admin/finance/transactions').send(validCreateBody);
    expect(res.status).toBe(403);
  });

  it('unauthenticated → 401', async () => {
    authState.admin = null;
    const res = await request(app).post('/api/admin/finance/transactions').send(validCreateBody);
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// Review fixes: dates, net=gross on PATCH, settlement_date
// ══════════════════════════════════════════════════════════════════════════════

describe('PATCH: due_date and transaction_date chronology', () => {
  it('PATCH due_date before transaction_date → 400', async () => {
    prismaMock.financial_transactions.findUnique.mockResolvedValue({ ...mockTransaction, status: 'DRAFT', source_type: 'MANUAL', transaction_date: new Date('2026-08-15') });
    const res = await request(app).patch('/api/admin/finance/transactions/txn-1').send({ expected_updated_at: '2026-08-01T00:00:00.000Z', due_date: '2026-08-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('due_date');
  });

  it('PATCH transaction_date after existing due_date → 400', async () => {
    prismaMock.financial_transactions.findUnique.mockResolvedValue({ ...mockTransaction, status: 'DRAFT', source_type: 'MANUAL', due_date: new Date('2026-08-10') });
    const res = await request(app).patch('/api/admin/finance/transactions/txn-1').send({ expected_updated_at: '2026-08-01T00:00:00.000Z', transaction_date: '2026-08-20' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('due_date');
  });

  it('PATCH due_date = null (clear) → 200', async () => {
    prismaMock.financial_transactions.findUnique.mockResolvedValue({ ...mockTransaction, status: 'DRAFT', source_type: 'MANUAL', due_date: new Date('2026-08-15') });
    prismaMock.financial_transactions.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).patch('/api/admin/finance/transactions/txn-1').send({ expected_updated_at: '2026-08-01T00:00:00.000Z', due_date: null });
    expect(res.status).toBe(200);
  });
});

describe('PATCH: net = gross enforcement', () => {
  it('PATCH only gross (breaks net = gross) → 400', async () => {
    prismaMock.financial_transactions.findUnique.mockResolvedValue({ ...mockTransaction, status: 'DRAFT', source_type: 'MANUAL', gross_amount_cents: BigInt(15000), net_amount_cents: BigInt(15000) });
    const res = await request(app).patch('/api/admin/finance/transactions/txn-1').send({ expected_updated_at: '2026-08-01T00:00:00.000Z', gross_amount_cents: '20000' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('net_amount_cents');
  });

  it('PATCH only net (breaks net = gross) → 400', async () => {
    prismaMock.financial_transactions.findUnique.mockResolvedValue({ ...mockTransaction, status: 'DRAFT', source_type: 'MANUAL', gross_amount_cents: BigInt(15000), net_amount_cents: BigInt(15000) });
    const res = await request(app).patch('/api/admin/finance/transactions/txn-1').send({ expected_updated_at: '2026-08-01T00:00:00.000Z', net_amount_cents: '20000' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('net_amount_cents');
  });

  it('PATCH gross and net equal → 200', async () => {
    prismaMock.financial_transactions.findUnique.mockResolvedValue({ ...mockTransaction, status: 'DRAFT', source_type: 'MANUAL', gross_amount_cents: BigInt(15000), net_amount_cents: BigInt(15000) });
    prismaMock.financial_transactions.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).patch('/api/admin/finance/transactions/txn-1').send({ expected_updated_at: '2026-08-01T00:00:00.000Z', gross_amount_cents: '20000', net_amount_cents: '20000' });
    expect(res.status).toBe(200);
  });
});

describe('POST /post: settlement_date validation', () => {
  it('settlement_date before transaction_date → 400', async () => {
    prismaMock.financial_transactions.findUnique.mockResolvedValue({ ...mockTransaction, status: 'DRAFT', source_type: 'MANUAL', transaction_date: new Date('2026-08-15') });
    const res = await request(app).post('/api/admin/finance/transactions/txn-1/post').send({ expected_updated_at: '2026-08-01T00:00:00.000Z', settlement_date: '2026-08-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('settlement_date');
  });

  it('settlement_date = transaction_date → 200', async () => {
    prismaMock.financial_transactions.findUnique.mockResolvedValue({ ...mockTransaction, status: 'DRAFT', source_type: 'MANUAL', transaction_date: new Date('2026-08-01') });
    prismaMock.financial_transactions.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post('/api/admin/finance/transactions/txn-1/post').send({ expected_updated_at: '2026-08-01T00:00:00.000Z', settlement_date: '2026-08-01' });
    expect(res.status).toBe(200);
  });

  it('settlement_date after transaction_date → 200', async () => {
    prismaMock.financial_transactions.findUnique.mockResolvedValue({ ...mockTransaction, status: 'DRAFT', source_type: 'MANUAL', transaction_date: new Date('2026-08-01') });
    prismaMock.financial_transactions.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).post('/api/admin/finance/transactions/txn-1/post').send({ expected_updated_at: '2026-08-01T00:00:00.000Z', settlement_date: '2026-08-15' });
    expect(res.status).toBe(200);
  });
});


describe('PATCH: metadata null clears metadata', () => {
  it('PATCH metadata: null sends null to Prisma', async () => {
    prismaMock.financial_transactions.findUnique.mockResolvedValue({ ...mockTransaction, status: 'DRAFT', source_type: 'MANUAL', gross_amount_cents: BigInt(15000), net_amount_cents: BigInt(15000) });
    prismaMock.financial_transactions.updateMany.mockResolvedValue({ count: 1 });
    const res = await request(app).patch('/api/admin/finance/transactions/txn-1').send({ expected_updated_at: '2026-08-01T00:00:00.000Z', description: 'updated', metadata: null });
    expect(res.status).toBe(200);
    const callData = prismaMock.financial_transactions.updateMany.mock.calls[0][0].data;
    expect(callData.metadata).toBeNull();
  });
});
