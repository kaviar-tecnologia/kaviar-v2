import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ────────────────────────────────────────────────────────────────────

const { prismaMock, authState, txMock } = vi.hoisted(() => {
  const txMock = {
    financial_transactions: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  };
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

// ── Test Data ────────────────────────────────────────────────────────────────

const postedTxn = {
  id: 'txn-posted',
  source_type: 'MANUAL',
  status: 'POSTED',
  direction: 'OUT',
  transaction_type: 'EXPENSE',
  reversal_of_id: null,
  account_id: 'acc-1',
  counterparty_account_id: 'acc-2',
  category_id: 'cat-1',
  cost_center_id: 'cc-1',
  payment_method: 'PIX',
  gross_amount_cents: BigInt(15000),
  fee_amount_cents: BigInt(200),
  discount_amount_cents: BigInt(100),
  retention_amount_cents: BigInt(50),
  net_amount_cents: BigInt(14650),
  description: 'AWS Agosto',
  memo: null,
  metadata: { ref: 'inv-123' },
  competence_date: new Date('2026-08-01'),
  transaction_date: new Date('2026-08-01'),
  due_date: null,
  settlement_date: new Date('2026-08-05'),
  updated_at: new Date('2026-08-05T10:00:00Z'),
  reversals: [],
};

const validBody = {
  expected_updated_at: '2026-08-05T10:00:00.000Z',
  reversal_date: '2026-08-10',
  reason: 'Pagamento duplicado',
};

// ── Helper to setup transaction mock for success scenario ─────────────────────

function setupSuccessMock(original = postedTxn) {
  const findUniqueMock = vi.fn()
    .mockResolvedValueOnce(original)  // first call: load for validation
    .mockResolvedValue(original);     // subsequent calls: reload
  const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
  const createMock = vi.fn().mockResolvedValue({ id: 'txn-reversal' });

  prismaMock.$transaction.mockImplementation(async (fn: any) => {
    const tx = {
      financial_transactions: {
        findUnique: findUniqueMock,
        updateMany: updateManyMock,
        create: createMock,
      },
    };
    return fn(tx);
  });

  return { findUniqueMock, updateManyMock, createMock };
}

function setupRejectionMock(original: any) {
  const findUniqueMock = vi.fn().mockResolvedValue(original);
  const updateManyMock = vi.fn();
  const createMock = vi.fn();

  prismaMock.$transaction.mockImplementation(async (fn: any) => {
    const tx = {
      financial_transactions: {
        findUnique: findUniqueMock,
        updateMany: updateManyMock,
        create: createMock,
      },
    };
    return fn(tx);
  });

  return { findUniqueMock, updateManyMock, createMock };
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  authState.admin = { id: 'sa-1', email: 'sa@t.l', role: 'SUPER_ADMIN' };
});

describe('POST /api/admin/finance/transactions/:id/reverse', () => {
  describe('basic validation', () => {
    it('SUPER_ADMIN reverses POSTED → 200', async () => {
      setupSuccessMock();
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
      setupSuccessMock();
      const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send({ ...validBody, reversal_date: '2026-07-01' });
      expect(res.status).toBe(400);
    });

    it('reversal_date before settlement_date → 400', async () => {
      setupSuccessMock();
      const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send({ ...validBody, reversal_date: '2026-08-03' });
      expect(res.status).toBe(400);
    });
  });

  describe('write arguments verification — updateMany (CAS)', () => {
    it('updateMany receives correct where clause', async () => {
      const { updateManyMock } = setupSuccessMock();
      await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);

      expect(updateManyMock).toHaveBeenCalledTimes(1);
      const args = updateManyMock.mock.calls[0][0];
      expect(args.where.id).toBe(postedTxn.id);
      expect(args.where.source_type).toBe('MANUAL');
      expect(args.where.status).toBe('POSTED');
      expect(new Date(args.where.updated_at).toISOString()).toBe(new Date(validBody.expected_updated_at).toISOString());
    });

    it('updateMany sets status to REVERSED', async () => {
      const { updateManyMock } = setupSuccessMock();
      await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);

      const args = updateManyMock.mock.calls[0][0];
      expect(args.data.status).toBe('REVERSED');
    });
  });

  describe('write arguments verification — create (reversal entry)', () => {
    it('create receives all expected fields', async () => {
      const { createMock } = setupSuccessMock();
      await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);

      expect(createMock).toHaveBeenCalledTimes(1);
      const args = createMock.mock.calls[0][0];
      const data = args.data;

      // Source/origin
      expect(data.source_type).toBe('MANUAL');
      expect(data.origin_type).toBe('MANUAL');
      expect(data.source_id).toBe(postedTxn.id);
      expect(data.origin_id).toBe(postedTxn.id);
      expect(data.reversal_of_id).toBe(postedTxn.id);
      expect(data.idempotency_key).toBe(`finance-reversal:${postedTxn.id}`);

      // Preserved references
      expect(data.account_id).toBe(postedTxn.account_id);
      expect(data.counterparty_account_id).toBe(postedTxn.counterparty_account_id);
      expect(data.category_id).toBe(postedTxn.category_id);
      expect(data.cost_center_id).toBe(postedTxn.cost_center_id);

      // Direction inverted (original was OUT → reversal must be IN)
      expect(data.direction).toBe('IN');

      // Type and status
      expect(data.transaction_type).toBe('REVERSAL');
      expect(data.status).toBe('POSTED');
      expect(data.payment_method).toBe('INTERNAL');

      // Dates
      const reversalDate = new Date('2026-08-10');
      expect(new Date(data.competence_date).toISOString().slice(0, 10)).toBe('2026-08-10');
      expect(new Date(data.transaction_date).toISOString().slice(0, 10)).toBe('2026-08-10');
      expect(new Date(data.settlement_date).toISOString().slice(0, 10)).toBe('2026-08-10');
      expect(data.due_date).toBeNull();

      // Amounts preserved
      expect(data.gross_amount_cents).toBe(postedTxn.gross_amount_cents);
      expect(data.fee_amount_cents).toBe(postedTxn.fee_amount_cents);
      expect(data.discount_amount_cents).toBe(postedTxn.discount_amount_cents);
      expect(data.retention_amount_cents).toBe(postedTxn.retention_amount_cents);
      expect(data.net_amount_cents).toBe(postedTxn.net_amount_cents);

      // Description and memo
      expect(data.description).toMatch(/^Estorno:/);
      expect(data.memo).toBe('Pagamento duplicado');

      // Admin IDs
      expect(data.created_by_admin_id).toBe('sa-1');
      expect(data.approved_by_admin_id).toBe('sa-1');
      expect(data.responsible_admin_id).toBe('sa-1');
    });

    it('IN direction produces OUT reversal', async () => {
      const inTxn = { ...postedTxn, direction: 'IN' };
      const { createMock } = setupSuccessMock(inTxn);
      await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);

      const data = createMock.mock.calls[0][0].data;
      expect(data.direction).toBe('OUT');
    });

    it('reason is trimmed in memo', async () => {
      const { createMock } = setupSuccessMock();
      const body = { ...validBody, reason: '  spaces around  ' };
      await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(body);

      const data = createMock.mock.calls[0][0].data;
      expect(data.memo).toBe('spaces around');
    });
  });

  describe('no write when rejected — source_type not MANUAL', () => {
    it('source_type RIDE → 403, no updateMany, no create', async () => {
      const { updateManyMock, createMock } = setupRejectionMock({ ...postedTxn, source_type: 'RIDE' });
      const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);
      expect(res.status).toBe(403);
      expect(updateManyMock).not.toHaveBeenCalled();
      expect(createMock).not.toHaveBeenCalled();
    });
  });

  describe('no write when rejected — status REVERSED', () => {
    it('status REVERSED → 409, no updateMany, no create', async () => {
      const { updateManyMock, createMock } = setupRejectionMock({ ...postedTxn, status: 'REVERSED' });
      const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);
      expect(res.status).toBe(409);
      expect(updateManyMock).not.toHaveBeenCalled();
      expect(createMock).not.toHaveBeenCalled();
    });
  });

  describe('no write when rejected — transaction_type REVERSAL', () => {
    it('transaction_type REVERSAL → 409, no updateMany, no create', async () => {
      const { updateManyMock, createMock } = setupRejectionMock({ ...postedTxn, transaction_type: 'REVERSAL' });
      const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);
      expect(res.status).toBe(409);
      expect(updateManyMock).not.toHaveBeenCalled();
      expect(createMock).not.toHaveBeenCalled();
    });
  });

  describe('no write when rejected — reversal_of_id filled', () => {
    it('reversal_of_id present → 409, no updateMany, no create', async () => {
      const { updateManyMock, createMock } = setupRejectionMock({ ...postedTxn, reversal_of_id: 'other-txn' });
      const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);
      expect(res.status).toBe(409);
      expect(updateManyMock).not.toHaveBeenCalled();
      expect(createMock).not.toHaveBeenCalled();
    });
  });

  describe('no write when rejected — existing reversals', () => {
    it('reversals array not empty → 409, no updateMany, no create', async () => {
      const { updateManyMock, createMock } = setupRejectionMock({ ...postedTxn, reversals: [{ id: 'existing' }] });
      const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);
      expect(res.status).toBe(409);
      expect(updateManyMock).not.toHaveBeenCalled();
      expect(createMock).not.toHaveBeenCalled();
    });
  });

  describe('no write when CAS fails (count = 0)', () => {
    it('CAS count = 0 → 409, create not called', async () => {
      const findUniqueMock = vi.fn().mockResolvedValue(postedTxn);
      const updateManyMock = vi.fn().mockResolvedValue({ count: 0 });
      const createMock = vi.fn();

      prismaMock.$transaction.mockImplementation(async (fn: any) => {
        return fn({
          financial_transactions: { findUnique: findUniqueMock, updateMany: updateManyMock, create: createMock },
        });
      });

      const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);
      expect(res.status).toBe(409);
      expect(createMock).not.toHaveBeenCalled();
    });
  });

  describe('Prisma error handling', () => {
    it('P2002 with idempotency_key target → 409', async () => {
      const { Prisma: RealPrisma } = await import('@prisma/client');
      const p2002 = new RealPrisma.PrismaClientKnownRequestError(
        'Unique constraint failed',
        { code: 'P2002', clientVersion: '5.0.0', meta: { target: ['idempotency_key'] } },
      );

      prismaMock.$transaction.mockRejectedValue(p2002);
      const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);
      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/estorno/);
    });

    it('P2002 with other target → 500 (propagated)', async () => {
      const { Prisma: RealPrisma } = await import('@prisma/client');
      const p2002 = new RealPrisma.PrismaClientKnownRequestError(
        'Unique constraint failed on code',
        { code: 'P2002', clientVersion: '5.0.0', meta: { target: ['code'] } },
      );

      prismaMock.$transaction.mockRejectedValue(p2002);
      const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);
      expect(res.status).toBe(500);
    });

    it('different Prisma error → 500 (propagated)', async () => {
      const { Prisma: RealPrisma } = await import('@prisma/client');
      const otherError = new RealPrisma.PrismaClientKnownRequestError(
        'Record not found',
        { code: 'P2025', clientVersion: '5.0.0', meta: {} },
      );

      prismaMock.$transaction.mockRejectedValue(otherError);
      const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);
      expect(res.status).toBe(500);
    });

    it('non-Prisma error → 500 (propagated)', async () => {
      prismaMock.$transaction.mockRejectedValue(new Error('Unexpected DB timeout'));
      const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);
      expect(res.status).toBe(500);
    });
  });

  describe('DRAFT cannot be reversed', () => {
    it('DRAFT → 400, no writes', async () => {
      const { updateManyMock, createMock } = setupRejectionMock({ ...postedTxn, status: 'DRAFT' });
      const res = await request(app).post('/api/admin/finance/transactions/txn-posted/reverse').send(validBody);
      expect(res.status).toBe(400);
      expect(updateManyMock).not.toHaveBeenCalled();
      expect(createMock).not.toHaveBeenCalled();
    });
  });
});
