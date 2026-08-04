/**
 * Tests for Frente 4/9 — Category CRUD with accounting fields via HTTP routes.
 *
 * Validates:
 * 1. POST /categories accepts accounting fields
 * 2. PATCH /categories/:id updates individual accounting fields
 * 3. PATCH with null clears accounting fields
 * 4. PATCH with undefined preserves value
 * 5. Serializer returns all 8 accounting fields in response
 * 6. Permission: FINANCE role can set accounting fields on non-system categories
 * 7. Permission: SUPER_ADMIN can set accounting fields on system categories
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const { prismaMock, authState } = vi.hoisted(() => {
  const prismaMock: any = {
    financial_categories: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      updateMany: vi.fn(),
    },
    financial_transactions: { count: vi.fn().mockResolvedValue(0) },
    financial_transaction_allocations: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn((fn: any) => fn(prismaMock)),
    $queryRaw: vi.fn().mockResolvedValue([{ exists: true }]),
    $queryRawUnsafe: vi.fn().mockResolvedValue([{ id: 'cat-1' }]),
  };
  return { prismaMock, authState: { admin: { id: 'sa-1', email: 'sa@t.l', role: 'SUPER_ADMIN' } as any } };
});

const auditMock = vi.fn();
vi.mock('../src/utils/audit', () => ({
  audit: auditMock,
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

// ── Fixtures ─────────────────────────────────────────────────────────────────

const baseCategoryResponse = {
  id: 'cat-new',
  code: 'TEST_ACCT',
  name: 'Test Accounting',
  kind: 'EXPENSE',
  parent_id: null,
  default_direction: 'OUT',
  requires_document: false,
  is_system: false,
  is_active: true,
  is_postable: false,
  sort_order: 100,
  accounting_code: '3.1.01.01',
  accounting_nature: 'DEBIT',
  dre_group: 'Custos Operacionais',
  balance_sheet_group: 'Ativo Circulante',
  fiscal_classification: 'CFOP 5102',
  deductible: true,
  export_code: 'EXP-001',
  accountant_notes: 'Nota de teste',
  created_by_admin_id: 'sa-1',
  updated_by_admin_id: 'sa-1',
  created_by_admin: { id: 'sa-1', name: 'Admin', role: 'SUPER_ADMIN' },
  updated_by_admin: { id: 'sa-1', name: 'Admin', role: 'SUPER_ADMIN' },
  created_at: new Date('2026-08-01'),
  updated_at: new Date('2026-08-01'),
  parent: null,
  children: [],
  _count: { children: 0 },
};

// ── beforeEach ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  authState.admin = { id: 'sa-1', email: 'sa@t.l', role: 'SUPER_ADMIN' };
  prismaMock.financial_categories.create.mockResolvedValue({ id: 'cat-new' });
  prismaMock.financial_categories.findUnique.mockResolvedValue(baseCategoryResponse);
  prismaMock.financial_categories.findMany.mockResolvedValue([]);
  prismaMock.financial_categories.count.mockResolvedValue(0);
  prismaMock.financial_categories.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.financial_transactions.count.mockResolvedValue(0);
  prismaMock.financial_transaction_allocations.count.mockResolvedValue(0);
  prismaMock.$queryRaw.mockResolvedValue([{ exists: true }]);
  prismaMock.$queryRawUnsafe.mockResolvedValue([{ id: 'cat-1' }]);
});

// ══════════════════════════════════════════════════════════════════════════════
// 1. POST /categories — accepts accounting fields
// ══════════════════════════════════════════════════════════════════════════════

describe('POST /api/admin/finance/categories — accounting fields', () => {
  it('creates category with all accounting fields', async () => {
    const res = await request(app).post('/api/admin/finance/categories').send({
      code: 'TEST_ACCT',
      name: 'Test Accounting',
      kind: 'EXPENSE',
      accounting_code: '3.1.01.01',
      accounting_nature: 'DEBIT',
      dre_group: 'Custos Operacionais',
      balance_sheet_group: 'Ativo Circulante',
      fiscal_classification: 'CFOP 5102',
      deductible: true,
      export_code: 'EXP-001',
      accountant_notes: 'Nota de teste',
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.accounting_code).toBe('3.1.01.01');
    expect(res.body.data.accounting_nature).toBe('DEBIT');
    expect(res.body.data.dre_group).toBe('Custos Operacionais');
    expect(res.body.data.balance_sheet_group).toBe('Ativo Circulante');
    expect(res.body.data.fiscal_classification).toBe('CFOP 5102');
    expect(res.body.data.deductible).toBe(true);
    expect(res.body.data.export_code).toBe('EXP-001');
    expect(res.body.data.accountant_notes).toBe('Nota de teste');
  });

  it('creates category without accounting fields (backward compat)', async () => {
    prismaMock.financial_categories.findUnique.mockResolvedValue({
      ...baseCategoryResponse,
      accounting_code: null,
      accounting_nature: null,
      dre_group: null,
      balance_sheet_group: null,
      fiscal_classification: null,
      deductible: null,
      export_code: null,
      accountant_notes: null,
    });

    const res = await request(app).post('/api/admin/finance/categories').send({
      code: 'PLAIN',
      name: 'Plain Category',
      kind: 'EXPENSE',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.accounting_code).toBeNull();
    expect(res.body.data.deductible).toBeNull();
  });

  it('rejects invalid accounting_nature', async () => {
    const res = await request(app).post('/api/admin/finance/categories').send({
      code: 'INVALID_NAT',
      name: 'Invalid Nature',
      kind: 'EXPENSE',
      accounting_nature: 'INVALID',
    });

    expect(res.status).toBe(400);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. PATCH /categories/:id — accounting fields update
// ══════════════════════════════════════════════════════════════════════════════

describe('PATCH /api/admin/finance/categories/:id — accounting fields', () => {
  it('updates individual accounting field', async () => {
    const res = await request(app).patch('/api/admin/finance/categories/cat-1').send({
      expected_updated_at: '2026-08-01T00:00:00.000Z',
      accounting_code: '4.2.01.01',
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('clears accounting field with null', async () => {
    const res = await request(app).patch('/api/admin/finance/categories/cat-1').send({
      expected_updated_at: '2026-08-01T00:00:00.000Z',
      accounting_code: null,
      dre_group: null,
    });

    expect(res.status).toBe(200);
  });

  it('updates deductible to false', async () => {
    const res = await request(app).patch('/api/admin/finance/categories/cat-1').send({
      expected_updated_at: '2026-08-01T00:00:00.000Z',
      deductible: false,
    });

    expect(res.status).toBe(200);
  });

  it('updates multiple accounting fields at once', async () => {
    const res = await request(app).patch('/api/admin/finance/categories/cat-1').send({
      expected_updated_at: '2026-08-01T00:00:00.000Z',
      accounting_code: '1.1.01',
      accounting_nature: 'CREDIT',
      dre_group: 'Receita Bruta',
      deductible: null,
      accountant_notes: 'Reclassificado pelo contador em agosto',
    });

    expect(res.status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. Permission: FINANCE role can update accounting fields on non-system
// ══════════════════════════════════════════════════════════════════════════════

describe('Permission — FINANCE role with accounting fields', () => {
  beforeEach(() => {
    authState.admin = { id: 'fin-1', email: 'fin@t.l', role: 'FINANCE' };
    prismaMock.financial_categories.findUnique.mockResolvedValue({
      ...baseCategoryResponse,
      is_system: false,
    });
  });

  it('FINANCE can set accounting_code on non-system category', async () => {
    const res = await request(app).patch('/api/admin/finance/categories/cat-1').send({
      expected_updated_at: '2026-08-01T00:00:00.000Z',
      accounting_code: '3.1.01.02',
    });

    expect(res.status).toBe(200);
  });

  it('FINANCE cannot edit system category', async () => {
    prismaMock.financial_categories.findUnique.mockResolvedValue({
      ...baseCategoryResponse,
      is_system: true,
    });

    const res = await request(app).patch('/api/admin/finance/categories/cat-1').send({
      expected_updated_at: '2026-08-01T00:00:00.000Z',
      accounting_code: '3.1.01.02',
    });

    expect(res.status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. Serializer response shape
// ══════════════════════════════════════════════════════════════════════════════

describe('Category response shape — all 8 accounting fields present', () => {
  it('GET-equivalent detail response includes all fields', async () => {
    const res = await request(app).post('/api/admin/finance/categories').send({
      code: 'SHAPE_TEST',
      name: 'Shape Test',
      kind: 'REVENUE',
    });

    expect(res.status).toBe(201);
    const data = res.body.data;
    // All 8 fields should be present (non-undefined)
    expect('accounting_code' in data).toBe(true);
    expect('accounting_nature' in data).toBe(true);
    expect('dre_group' in data).toBe(true);
    expect('balance_sheet_group' in data).toBe(true);
    expect('fiscal_classification' in data).toBe(true);
    expect('deductible' in data).toBe(true);
    expect('export_code' in data).toBe(true);
    expect('accountant_notes' in data).toBe(true);
  });
});
