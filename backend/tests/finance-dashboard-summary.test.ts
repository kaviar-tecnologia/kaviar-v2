/**
 * Tests for Frente 6/9 — Finance Dashboard Summary
 *
 * Covers: indicators, DRE, transfers, reversals, overdue, BigInt, permissions.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Unit tests for todayCivilDate ────────────────────────────────────────────

const { todayCivilDate } = await import('../src/services/finance/finance-dashboard.service');

describe('todayCivilDate', () => {
  it('returns a Date object at midnight UTC', () => {
    const d = todayCivilDate();
    expect(d).toBeInstanceOf(Date);
    expect(d.getUTCHours()).toBe(0);
    expect(d.getUTCMinutes()).toBe(0);
  });
});

// ── HTTP Route Tests ─────────────────────────────────────────────────────────

const { prismaMock, authState } = vi.hoisted(() => {
  const prismaMock: any = {
    financial_transactions: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn((fn: any) => fn(prismaMock)),
  };
  return { prismaMock, authState: { admin: { id: 'sa-1', email: 'sa@t.l', role: 'SUPER_ADMIN' } as any } };
});

vi.mock('../src/utils/audit', () => ({
  audit: vi.fn(),
  auditCtx: () => ({ adminId: 'sa-1', adminEmail: 'sa@t.l', ip: '127.0.0.1', ua: 'test' }),
}));

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, _res: any, next: any) => { req.admin = authState.admin; next(); },
  allowFinanceAccess: (req: any, res: any, next: any) => {
    if (!['SUPER_ADMIN', 'FINANCE'].includes(req.admin?.role)) return res.status(403).json({ success: false });
    next();
  },
}));

const { default: routes } = await import('../src/routes/admin-finance');
const app = express();
app.use(express.json());
app.use('/api/admin/finance', routes);

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeTxn(overrides: any = {}) {
  return {
    id: 'txn-' + Math.random().toString(36).slice(2, 8),
    direction: 'OUT',
    transaction_type: 'EXPENSE',
    status: 'POSTED',
    net_amount_cents: BigInt(10000),
    gross_amount_cents: BigInt(10000),
    due_date: null,
    account_id: 'acc-1',
    category_id: 'cat-1',
    cost_center_id: 'cc-1',
    account: { id: 'acc-1', code: 'BANK-01', name: 'Conta Corrente' },
    category: { id: 'cat-1', code: 'AWS', name: 'AWS', dre_group: 'Custos Operacionais' },
    cost_center: { id: 'cc-1', code: 'TECH', name: 'Tecnologia' },
    ...overrides,
  };
}

// ══════════════════════════════════════════════════════════════════════════════

describe('GET /api/admin/finance/dashboard-summary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.admin = { id: 'sa-1', email: 'sa@t.l', role: 'SUPER_ADMIN' };
    prismaMock.financial_transactions.findMany.mockResolvedValue([]);
  });

  it('returns 200 with summary structure on empty set', async () => {
    const res = await request(app).get('/api/admin/finance/dashboard-summary');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary).toBeDefined();
    expect(res.body.data.summary.realized_revenue_cents).toBe('0');
    expect(res.body.data.summary.realized_expense_cents).toBe('0');
    expect(res.body.data.summary.total_transactions).toBe(0);
    expect(res.body.data.dre_groups).toEqual([]);
    expect(res.body.data.by_category).toEqual([]);
    expect(res.body.data.by_account).toEqual([]);
    expect(res.body.data.by_cost_center).toEqual([]);
  });

  it('returns 403 for unauthorized role', async () => {
    authState.admin = { id: 'op-1', email: 'op@t.l', role: 'OPERATOR' };
    const res = await request(app).get('/api/admin/finance/dashboard-summary');
    expect(res.status).toBe(403);
  });

  it('FINANCE role can access', async () => {
    authState.admin = { id: 'fin-1', email: 'fin@t.l', role: 'FINANCE' };
    const res = await request(app).get('/api/admin/finance/dashboard-summary');
    expect(res.status).toBe(200);
  });

  it('calculates realized revenue from POSTED IN transactions', async () => {
    prismaMock.financial_transactions.findMany.mockResolvedValue([
      makeTxn({ direction: 'IN', transaction_type: 'INCOME', status: 'POSTED', net_amount_cents: BigInt(50000) }),
      makeTxn({ direction: 'IN', transaction_type: 'INCOME', status: 'POSTED', net_amount_cents: BigInt(30000) }),
    ]);
    const res = await request(app).get('/api/admin/finance/dashboard-summary');
    expect(res.body.data.summary.realized_revenue_cents).toBe('80000');
  });

  it('calculates realized expense from POSTED OUT transactions', async () => {
    prismaMock.financial_transactions.findMany.mockResolvedValue([
      makeTxn({ direction: 'OUT', transaction_type: 'EXPENSE', status: 'POSTED', net_amount_cents: BigInt(25000) }),
    ]);
    const res = await request(app).get('/api/admin/finance/dashboard-summary');
    expect(res.body.data.summary.realized_expense_cents).toBe('25000');
  });

  it('result = revenue - expense', async () => {
    prismaMock.financial_transactions.findMany.mockResolvedValue([
      makeTxn({ direction: 'IN', transaction_type: 'INCOME', status: 'POSTED', net_amount_cents: BigInt(100000) }),
      makeTxn({ direction: 'OUT', transaction_type: 'EXPENSE', status: 'POSTED', net_amount_cents: BigInt(40000) }),
    ]);
    const res = await request(app).get('/api/admin/finance/dashboard-summary');
    expect(res.body.data.summary.realized_result_cents).toBe('60000');
  });

  it('TRANSFER transactions do not count as revenue or expense', async () => {
    prismaMock.financial_transactions.findMany.mockResolvedValue([
      makeTxn({ direction: 'OUT', transaction_type: 'TRANSFER', status: 'POSTED', net_amount_cents: BigInt(50000) }),
      makeTxn({ direction: 'IN', transaction_type: 'TRANSFER', status: 'POSTED', net_amount_cents: BigInt(50000) }),
    ]);
    const res = await request(app).get('/api/admin/finance/dashboard-summary');
    expect(res.body.data.summary.realized_revenue_cents).toBe('0');
    expect(res.body.data.summary.realized_expense_cents).toBe('0');
    expect(res.body.data.summary.transfer_total_cents).toBe('100000');
  });

  it('REVERSAL transactions do not count as revenue or expense', async () => {
    prismaMock.financial_transactions.findMany.mockResolvedValue([
      makeTxn({ direction: 'IN', transaction_type: 'REVERSAL', status: 'POSTED', net_amount_cents: BigInt(20000) }),
    ]);
    const res = await request(app).get('/api/admin/finance/dashboard-summary');
    expect(res.body.data.summary.realized_revenue_cents).toBe('0');
    expect(res.body.data.summary.realized_expense_cents).toBe('0');
  });

  it('forecast values come from DRAFT/PENDING statuses', async () => {
    prismaMock.financial_transactions.findMany.mockResolvedValue([
      makeTxn({ direction: 'IN', transaction_type: 'INCOME', status: 'DRAFT', net_amount_cents: BigInt(15000) }),
      makeTxn({ direction: 'OUT', transaction_type: 'EXPENSE', status: 'PENDING', net_amount_cents: BigInt(8000) }),
    ]);
    const res = await request(app).get('/api/admin/finance/dashboard-summary');
    expect(res.body.data.summary.forecast_revenue_cents).toBe('15000');
    expect(res.body.data.summary.forecast_expense_cents).toBe('8000');
  });

  it('overdue: PENDING with due_date in past', async () => {
    const pastDate = new Date('2020-01-01T00:00:00.000Z');
    prismaMock.financial_transactions.findMany.mockResolvedValue([
      makeTxn({ status: 'PENDING', due_date: pastDate, net_amount_cents: BigInt(5000) }),
      makeTxn({ status: 'PENDING', due_date: null, net_amount_cents: BigInt(3000) }),
    ]);
    const res = await request(app).get('/api/admin/finance/dashboard-summary');
    expect(res.body.data.summary.overdue_count).toBe(1);
    expect(res.body.data.summary.overdue_total_cents).toBe('5000');
  });

  it('canceled transactions count in canceled_total', async () => {
    prismaMock.financial_transactions.findMany.mockResolvedValue([
      makeTxn({ status: 'CANCELED', net_amount_cents: BigInt(7000) }),
    ]);
    const res = await request(app).get('/api/admin/finance/dashboard-summary');
    expect(res.body.data.summary.canceled_total_cents).toBe('7000');
  });

  it('DRE groups are populated from category.dre_group', async () => {
    prismaMock.financial_transactions.findMany.mockResolvedValue([
      makeTxn({ direction: 'OUT', status: 'POSTED', category: { id: 'c1', code: 'A', name: 'A', dre_group: 'Custos Operacionais' } }),
      makeTxn({ direction: 'IN', status: 'POSTED', category: { id: 'c2', code: 'B', name: 'B', dre_group: 'Receita Operacional' } }),
    ]);
    const res = await request(app).get('/api/admin/finance/dashboard-summary');
    expect(res.body.data.dre_groups).toHaveLength(2);
    const custos = res.body.data.dre_groups.find((g: any) => g.dre_group === 'Custos Operacionais');
    expect(custos).toBeDefined();
    expect(custos.expense_cents).toBe('10000');
  });

  it('categories without dre_group appear as NÃO CLASSIFICADO', async () => {
    prismaMock.financial_transactions.findMany.mockResolvedValue([
      makeTxn({ direction: 'OUT', status: 'POSTED', category: { id: 'c3', code: 'C', name: 'C', dre_group: null } }),
    ]);
    const res = await request(app).get('/api/admin/finance/dashboard-summary');
    const nc = res.body.data.dre_groups.find((g: any) => g.dre_group === 'NÃO CLASSIFICADO');
    expect(nc).toBeDefined();
    expect(nc.expense_cents).toBe('10000');
  });

  it('by_category returns top categories', async () => {
    prismaMock.financial_transactions.findMany.mockResolvedValue([
      makeTxn({ direction: 'OUT', status: 'POSTED', category_id: 'c1', category: { id: 'c1', code: 'AWS', name: 'AWS', dre_group: null } }),
    ]);
    const res = await request(app).get('/api/admin/finance/dashboard-summary');
    expect(res.body.data.by_category.length).toBeGreaterThan(0);
    expect(res.body.data.by_category[0].category_name).toBe('AWS');
  });

  it('by_account returns accounts with in/out totals', async () => {
    prismaMock.financial_transactions.findMany.mockResolvedValue([
      makeTxn({ direction: 'IN', status: 'POSTED', account_id: 'acc-1', account: { id: 'acc-1', code: 'B1', name: 'Banco' } }),
    ]);
    const res = await request(app).get('/api/admin/finance/dashboard-summary');
    expect(res.body.data.by_account.length).toBeGreaterThan(0);
    expect(res.body.data.by_account[0].account_name).toBe('Banco');
    expect(res.body.data.by_account[0].total_in_cents).toBe('10000');
  });

  it('handles BigInt above MAX_SAFE_INTEGER', async () => {
    const huge = BigInt('9007199254740993');
    prismaMock.financial_transactions.findMany.mockResolvedValue([
      makeTxn({ direction: 'IN', status: 'POSTED', net_amount_cents: huge }),
    ]);
    const res = await request(app).get('/api/admin/finance/dashboard-summary');
    expect(res.body.data.summary.realized_revenue_cents).toBe('9007199254740993');
  });

  it('accepts filters via query params', async () => {
    const res = await request(app)
      .get('/api/admin/finance/dashboard-summary')
      .query({ status: 'POSTED', direction: 'OUT' });
    expect(res.status).toBe(200);
    expect(prismaMock.financial_transactions.findMany).toHaveBeenCalled();
  });

  it('all monetary values are strings (not numbers)', async () => {
    prismaMock.financial_transactions.findMany.mockResolvedValue([
      makeTxn({ direction: 'IN', status: 'POSTED', net_amount_cents: BigInt(100) }),
    ]);
    const res = await request(app).get('/api/admin/finance/dashboard-summary');
    const s = res.body.data.summary;
    expect(typeof s.realized_revenue_cents).toBe('string');
    expect(typeof s.realized_expense_cents).toBe('string');
    expect(typeof s.realized_result_cents).toBe('string');
    expect(typeof s.forecast_revenue_cents).toBe('string');
    expect(typeof s.pending_total_cents).toBe('string');
    expect(typeof s.overdue_total_cents).toBe('string');
    expect(typeof s.canceled_total_cents).toBe('string');
    expect(typeof s.transfer_total_cents).toBe('string');
  });

  it('total_transactions reflects row count', async () => {
    prismaMock.financial_transactions.findMany.mockResolvedValue([
      makeTxn({}), makeTxn({}), makeTxn({}),
    ]);
    const res = await request(app).get('/api/admin/finance/dashboard-summary');
    expect(res.body.data.summary.total_transactions).toBe(3);
  });
});
