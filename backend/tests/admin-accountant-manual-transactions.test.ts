import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { poolMock, authState } = vi.hoisted(() => {
  const mockClient = {
    query: vi.fn(),
    release: vi.fn(),
  };
  return {
    poolMock: { query: vi.fn(), connect: vi.fn().mockResolvedValue(mockClient), _client: mockClient },
    authState: {
      admin: { id: 'admin-1', email: 'finance@test.local', role: 'FINANCE' } as any,
    },
  };
});

vi.mock('../src/db', () => ({ pool: poolMock }));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, res: any, next: any) => {
    if (!authState.admin) return res.status(401).json({ success: false, error: 'Não autenticado' });
    req.admin = authState.admin;
    next();
  },
  allowFinanceAccess: (req: any, res: any, next: any) => {
    if (!req.admin || !['SUPER_ADMIN', 'FINANCE'].includes(req.admin.role))
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    next();
  },
}));

const { default: routes } = await import('../src/routes/admin-accountant-report');

const app = express();
app.use(express.json());
app.use('/api/admin/finance/accountant-report', routes);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const client = poolMock._client;

function setupPreValidationsPass() {
  // pre-val 1: settlement_date missing → 0
  client.query.mockResolvedValueOnce({ rows: [{ count: 0 }] });
  // pre-val 2: duplicate reversals → empty
  client.query.mockResolvedValueOnce({ rows: [] });
  // pre-val 3: type inconsistency → 0
  client.query.mockResolvedValueOnce({ rows: [{ count: 0 }] });
}

const validSummary = {
  draft_transactions: 1, pending_transactions: 2, posted_transactions: 3,
  canceled_transactions: 0, reversed_transactions: 1, blocked_transactions: 0,
  reconciled_transactions: 1, closed_transactions: 0,
  realized_in_total_cents: '150000', realized_out_total_cents: '45000',
};

const validTransaction = {
  id: 'tx-001', external_reference: 'REF-001', direction: 'IN',
  transaction_type: 'INCOME', status: 'POSTED', payment_method: 'PIX',
  competence_date: '2026-07-01', transaction_date: '2026-07-10',
  due_date: '2026-07-15', settlement_date: '2026-07-15',
  reporting_date: '2026-07-15', description: 'Receita teste',
  memo: null, gross_amount_cents: '110000', fee_amount_cents: '5000',
  discount_amount_cents: '3000', retention_amount_cents: '2000',
  net_amount_cents: '100000', reversal_of_id: null, canceled_reason: null,
  canceled_at: null, created_at: new Date('2026-07-10T10:00:00Z'),
  account_name: 'Conta Principal', account_code: 'CP',
  category_name: 'Receitas', category_code: 'REC',
  cost_center_name: 'Operações', cost_center_code: 'OPS',
  created_by_name: 'Admin Fulano', approved_by_name: null,
  reversal_id: null, reversal_date: null, reversal_reason: null,
  original_id: null, original_description: null,
};

function setupFullSuccess(overrides: { summary?: any; count?: number; transactions?: any[] } = {}) {
  const summary = overrides.summary || validSummary;
  const count = overrides.count ?? 1;
  const transactions = overrides.transactions ?? [validTransaction];

  // BEGIN
  client.query.mockResolvedValueOnce({});
  // pre-validations (3 calls)
  setupPreValidationsPass();
  // summary
  client.query.mockResolvedValueOnce({ rows: [summary] });
  // count
  client.query.mockResolvedValueOnce({ rows: [{ total: count }] });
  // listing
  client.query.mockResolvedValueOnce({ rows: transactions });
  // COMMIT
  client.query.mockResolvedValueOnce({});
}

function setupPreValFail(valIndex: number, failData: any) {
  // BEGIN
  client.query.mockResolvedValueOnce({});
  // pre-val 1
  if (valIndex === 1) {
    client.query.mockResolvedValueOnce({ rows: [{ count: failData }] });
    // ROLLBACK after failure
    client.query.mockResolvedValueOnce({});
    return;
  }
  client.query.mockResolvedValueOnce({ rows: [{ count: 0 }] });
  // pre-val 2
  if (valIndex === 2) {
    client.query.mockResolvedValueOnce({ rows: failData });
    // ROLLBACK after failure
    client.query.mockResolvedValueOnce({});
    return;
  }
  client.query.mockResolvedValueOnce({ rows: [] });
  // pre-val 3
  if (valIndex === 3) {
    client.query.mockResolvedValueOnce({ rows: [{ count: failData }] });
    // ROLLBACK after failure
    client.query.mockResolvedValueOnce({});
    return;
  }
  client.query.mockResolvedValueOnce({ rows: [{ count: 0 }] });
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.admin = { id: 'admin-1', email: 'finance@test.local', role: 'FINANCE' };
  poolMock.connect.mockResolvedValue(client);
});

// ═══════════════════════════════════════════════════════════════════════════════
// RBAC
// ═══════════════════════════════════════════════════════════════════════════════

describe('Manual Transactions - RBAC', () => {
  it('401 for unauthenticated', async () => {
    authState.admin = null;
    const res = await request(app).get('/api/admin/finance/accountant-report/manual-transactions');
    expect(res.status).toBe(401);
  });

  it('403 for OPERATOR', async () => {
    authState.admin = { id: 'x', email: 'x', role: 'OPERATOR' };
    const res = await request(app).get('/api/admin/finance/accountant-report/manual-transactions');
    expect(res.status).toBe(403);
  });

  it('403 for ANGEL_VIEWER', async () => {
    authState.admin = { id: 'x', email: 'x', role: 'ANGEL_VIEWER' };
    const res = await request(app).get('/api/admin/finance/accountant-report/manual-transactions');
    expect(res.status).toBe(403);
  });

  it('403 for LEAD_AGENT', async () => {
    authState.admin = { id: 'x', email: 'x', role: 'LEAD_AGENT' };
    const res = await request(app).get('/api/admin/finance/accountant-report/manual-transactions');
    expect(res.status).toBe(403);
  });

  it('200 for FINANCE', async () => {
    setupFullSuccess();
    const res = await request(app).get('/api/admin/finance/accountant-report/manual-transactions');
    expect(res.status).toBe(200);
  });

  it('200 for SUPER_ADMIN', async () => {
    authState.admin = { id: 'x', email: 'x', role: 'SUPER_ADMIN' };
    setupFullSuccess();
    const res = await request(app).get('/api/admin/finance/accountant-report/manual-transactions');
    expect(res.status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-VALIDATIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Manual Transactions - Pre-validations', () => {
  it('blocks with 500 INTEGRITY_SETTLEMENT_DATE_MISSING when realized txs lack settlement_date', async () => {
    setupPreValFail(1, 3);
    const res = await request(app).get('/api/admin/finance/accountant-report/manual-transactions');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTEGRITY_SETTLEMENT_DATE_MISSING');
    expect(res.body.error).toContain('3 transação');
  });

  it('blocks with 500 INTEGRITY_DUPLICATE_REVERSALS', async () => {
    setupPreValFail(2, [{ reversal_of_id: 'tx-A', cnt: 2 }]);
    const res = await request(app).get('/api/admin/finance/accountant-report/manual-transactions');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTEGRITY_DUPLICATE_REVERSALS');
  });

  it('blocks with 500 INTEGRITY_TYPE_INCONSISTENCY', async () => {
    setupPreValFail(3, 5);
    const res = await request(app).get('/api/admin/finance/accountant-report/manual-transactions');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTEGRITY_TYPE_INCONSISTENCY');
    expect(res.body.error).toContain('5 transação');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FILTER VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Manual Transactions - Filter validation', () => {
  it('rejects invalid start_date', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ start_date: 'not-a-date' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('start_date');
  });

  it('rejects invalid end_date', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ end_date: '2026-13-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('end_date');
  });

  it('rejects end_date before start_date', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ start_date: '2026-08-01', end_date: '2026-07-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('posterior');
  });

  it('rejects period > 90 days', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ start_date: '2026-01-01', end_date: '2026-06-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('90 dias');
  });

  it('rejects invalid status enum', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ status: 'INVALID' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Status inválido');
  });

  it('rejects invalid direction enum', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ direction: 'SIDEWAYS' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Direção inválida');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUMMARY CALCULATIONS
// ═══════════════════════════════════════════════════════════════════════════════

describe('Manual Transactions - Summary', () => {
  it('returns summary with correct structure', async () => {
    setupFullSuccess();
    const res = await request(app).get('/api/admin/finance/accountant-report/manual-transactions');
    expect(res.status).toBe(200);
    const s = res.body.data.summary;
    expect(s.draft_transactions).toBe(1);
    expect(s.pending_transactions).toBe(2);
    expect(s.posted_transactions).toBe(3);
    expect(s.reversed_transactions).toBe(1);
    expect(s.reconciled_transactions).toBe(1);
    expect(s.realized_in_total_cents).toBe('150000');
    expect(s.realized_out_total_cents).toBe('45000');
  });

  it('returns period in summary', async () => {
    setupFullSuccess();
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ start_date: '2026-07-01', end_date: '2026-07-30' });
    expect(res.status).toBe(200);
    expect(res.body.data.summary.period.start).toBe('2026-07-01');
    expect(res.body.data.summary.period.end).toBe('2026-07-30');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// LISTING & PAGINATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Manual Transactions - Listing', () => {
  it('returns transactions with correct structure', async () => {
    setupFullSuccess();
    const res = await request(app).get('/api/admin/finance/accountant-report/manual-transactions');
    expect(res.status).toBe(200);
    const tx = res.body.data.transactions[0];
    expect(tx.id).toBe('tx-001');
    expect(tx.direction).toBe('IN');
    expect(tx.transaction_type).toBe('INCOME');
    expect(tx.status).toBe('POSTED');
    expect(tx.description).toBe('Receita teste');
    expect(tx.net_amount_cents).toBe('100000');
    expect(tx.account).toEqual({ name: 'Conta Principal', code: 'CP' });
    expect(tx.category).toEqual({ name: 'Receitas', code: 'REC' });
    expect(tx.cost_center).toEqual({ name: 'Operações', code: 'OPS' });
  });

  it('returns pagination metadata', async () => {
    setupFullSuccess({ count: 100 });
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ page: '2', limit: '25' });
    expect(res.status).toBe(200);
    expect(res.body.data.pagination.page).toBe(2);
    expect(res.body.data.pagination.limit).toBe(25);
    expect(res.body.data.pagination.total).toBe(100);
    expect(res.body.data.pagination.total_pages).toBe(4);
  });

  it('caps limit to 200', async () => {
    setupFullSuccess();
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ limit: '500' });
    expect(res.status).toBe(200);
    expect(res.body.data.pagination.limit).toBe(200);
  });

  it('defaults to page 1 and limit 50', async () => {
    setupFullSuccess();
    const res = await request(app).get('/api/admin/finance/accountant-report/manual-transactions');
    expect(res.status).toBe(200);
    expect(res.body.data.pagination.page).toBe(1);
    expect(res.body.data.pagination.limit).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// REVERSAL HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Manual Transactions - Reversals', () => {
  it('links reversal info for reversed originals', async () => {
    const reversedTx = {
      ...validTransaction,
      id: 'tx-010', status: 'REVERSED',
      reversal_id: 'tx-011', reversal_date: '2026-07-20', reversal_reason: 'Duplicidade',
    };
    setupFullSuccess({ transactions: [reversedTx] });
    const res = await request(app).get('/api/admin/finance/accountant-report/manual-transactions');
    expect(res.status).toBe(200);
    const tx = res.body.data.transactions[0];
    expect(tx.reversal).toEqual({ id: 'tx-011', date: '2026-07-20', reason: 'Duplicidade' });
  });

  it('links original info for reversal transactions', async () => {
    const reversalTx = {
      ...validTransaction,
      id: 'tx-011', transaction_type: 'REVERSAL', reversal_of_id: 'tx-010',
      original_id: 'tx-010', original_description: 'Pagamento duplicado',
      reversal_id: null,
    };
    setupFullSuccess({ transactions: [reversalTx] });
    const res = await request(app).get('/api/admin/finance/accountant-report/manual-transactions');
    expect(res.status).toBe(200);
    const tx = res.body.data.transactions[0];
    expect(tx.original).toEqual({ id: 'tx-010', description: 'Pagamento duplicado' });
    expect(tx.reversal_of_id).toBe('tx-010');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════════════════

describe('Manual Transactions - Error handling', () => {
  it('returns 500 INTERNAL_ERROR on unexpected DB error', async () => {
    // BEGIN
    client.query.mockResolvedValueOnce({});
    // pre-val 1 throws
    client.query.mockRejectedValueOnce(new Error('Connection lost'));
    // ROLLBACK
    client.query.mockResolvedValueOnce({});
    const res = await request(app).get('/api/admin/finance/accountant-report/manual-transactions');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTERNAL_ERROR');
  });

  it('releases client on error', async () => {
    client.query.mockResolvedValueOnce({});
    client.query.mockRejectedValueOnce(new Error('fail'));
    client.query.mockResolvedValueOnce({});
    await request(app).get('/api/admin/finance/accountant-report/manual-transactions');
    expect(client.release).toHaveBeenCalled();
  });

  it('releases client on success', async () => {
    setupFullSuccess();
    await request(app).get('/api/admin/finance/accountant-report/manual-transactions');
    expect(client.release).toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CSV ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════

describe('Manual Transactions CSV', () => {
  function setupCsvSuccess(rows: any[] = [validTransaction]) {
    // BEGIN
    client.query.mockResolvedValueOnce({});
    // pre-validations
    setupPreValidationsPass();
    // CSV query
    client.query.mockResolvedValueOnce({ rows });
    // COMMIT
    client.query.mockResolvedValueOnce({});
  }

  it('returns CSV content-type', async () => {
    setupCsvSuccess();
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-30' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('includes UTF-8 BOM', async () => {
    setupCsvSuccess();
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-30' });
    expect(res.text.charCodeAt(0)).toBe(0xFEFF);
  });

  it('422 when exceeding 5000 rows', async () => {
    const manyRows = Array.from({ length: 5001 }, (_, i) => ({ ...validTransaction, id: `tx-${i}` }));
    setupCsvSuccess(manyRows);
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-30' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CSV_ROW_LIMIT_EXCEEDED');
  });

  it('pre-validations block CSV too', async () => {
    setupPreValFail(1, 2);
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-30' });
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('INTEGRITY_SETTLEMENT_DATE_MISSING');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MEMO-BASED REVERSAL REASON
// ═══════════════════════════════════════════════════════════════════════════════

describe('Manual Transactions - Memo-based reversal reason', () => {
  it('reversal_reason comes from reversal memo, not canceled_reason', async () => {
    const reversedOriginal = {
      ...validTransaction,
      id: 'tx-020', status: 'REVERSED', canceled_reason: null,
      reversal_id: 'tx-021', reversal_date: '2026-07-20', reversal_reason: 'Motivo real do estorno',
    };
    setupFullSuccess({ transactions: [reversedOriginal] });
    const res = await request(app).get('/api/admin/finance/accountant-report/manual-transactions');
    expect(res.status).toBe(200);
    const tx = res.body.data.transactions[0];
    expect(tx.reversal.reason).toBe('Motivo real do estorno');
  });

  it('SQL uses memo field for reversal_reason, not canceled_reason', async () => {
    setupFullSuccess();
    await request(app).get('/api/admin/finance/accountant-report/manual-transactions');
    // The listSQL is the 7th call (BEGIN, preval1, preval2, preval3, summary, count, list)
    const listCall = client.query.mock.calls[6];
    const sql = listCall[0];
    // Verify memo-based logic is present
    expect(sql).toContain('memo');
    expect(sql).toContain("CASE WHEN t.transaction_type = 'REVERSAL' THEN t.memo ELSE rev.memo END AS reversal_reason");
    // Verify old pattern is NOT present
    expect(sql).not.toContain('rev.canceled_reason AS reversal_reason');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SEARCH LIMIT AND FILTER VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('Manual Transactions - Search limit and filter validation', () => {
  it('rejects search exceeding 100 characters', async () => {
    const longSearch = 'a'.repeat(101);
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ search: longSearch });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('100 caracteres');
  });

  it('allows search with exactly 100 characters', async () => {
    const search100 = 'a'.repeat(100);
    setupFullSuccess();
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ search: search100 });
    expect(res.status).toBe(200);
  });

  it('rejects empty-after-trim account_id', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ account_id: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('account_id');
  });

  it('rejects empty-after-trim category_id', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ category_id: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('category_id');
  });

  it('rejects empty-after-trim cost_center_id', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ cost_center_id: '   ' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('cost_center_id');
  });
});
