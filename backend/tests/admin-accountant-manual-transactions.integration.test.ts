/**
 * Integration tests for Accountant Manual Transactions endpoints.
 * OPT-IN: Only runs when RUN_ACCOUNTANT_MANUAL_INTEGRATION=1
 * Requires: local PostgreSQL test DB (not production).
 * Run: npm run test:accountant-manual:integration
 *
 * Tests prove:
 * 1. GET /manual-transactions returns correct data structure with real DB
 * 2. Summary counts and realized totals are correct
 * 3. Reversal linking (is_reversed_original, reversal_of_id)
 * 4. reversal_reason comes from memo
 * 5. Search by account/category/cost_center name
 * 6. CSV export with UTF-8 BOM
 * 7. Pre-validation blocks (settlement_date NULL, duplicate reversals, type inconsistency)
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { randomUUID } from 'crypto';

const SKIP = !process.env.RUN_ACCOUNTANT_MANUAL_INTEGRATION;

function validateSafeUrl() {
  const url = process.env.DATABASE_URL || '';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Unsafe DATABASE_URL for integration: cannot parse`);
  }
  if (!['localhost', '127.0.0.1'].includes(parsed.hostname)) {
    throw new Error(`Unsafe DATABASE_URL hostname: ${parsed.hostname}`);
  }
  if (!parsed.pathname.toLowerCase().includes('test')) {
    throw new Error(`DATABASE_URL path must contain "test": ${parsed.pathname}`);
  }
}

// Mock only auth (allow FINANCE access)
const authState = { admin: { id: 'test-admin', email: 'test@test.local', role: 'FINANCE' } as any };
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

describe.skipIf(SKIP)('Accountant Manual Transactions Integration — Real PostgreSQL', () => {
  let app: express.Express;
  let pool: any;

  const uid = randomUUID().slice(0, 8);
  const adminId = `admin-intg-${uid}`;
  const adminEmail = `admin-intg-${uid}@test.local`;
  let accountId: string;
  let categoryId: string;
  let costCenterId: string;
  let originalTxId: string;
  let reversalTxId: string;

  const accountName = `Conta Integração ${uid}`;
  const categoryName = `Categoria Integração ${uid}`;
  const costCenterName = `Centro Custo Integração ${uid}`;
  const todayStr = new Date().toISOString().slice(0, 10);

  beforeAll(async () => {
    validateSafeUrl();

    const { default: routes } = await import('../src/routes/admin-accountant-report');
    const { pool: realPool } = await import('../src/db');
    pool = realPool;

    app = express();
    app.use(express.json());
    app.use('/api/admin/finance/accountant-report', routes);

    // Create admin fixture
    await pool.query(`
      INSERT INTO admins (id, email, name, role, password, is_active, updated_at)
      VALUES ($1, $2, $3, 'SUPER_ADMIN', 'x', true, NOW())
      ON CONFLICT (id) DO NOTHING
    `, [adminId, adminEmail, `Test Integration ${uid}`]);

    // Create account fixture
    accountId = randomUUID();
    await pool.query(`
      INSERT INTO financial_accounts (id, code, name, type, is_active, is_cash_equivalent, allows_negative_balance, created_by_admin_id, updated_at)
      VALUES ($1, $2, $3, 'BANK', true, false, false, $4, NOW())
    `, [accountId, `ACCT-${uid}`, accountName, adminId]);

    // Create category fixture
    categoryId = randomUUID();
    await pool.query(`
      INSERT INTO financial_categories (id, code, name, kind, is_active, is_postable, created_by_admin_id, updated_at)
      VALUES ($1, $2, $3, 'EXPENSE', true, true, $4, NOW())
    `, [categoryId, `CAT-${uid}`, categoryName, adminId]);

    // Create cost center fixture
    costCenterId = randomUUID();
    await pool.query(`
      INSERT INTO financial_cost_centers (id, code, name, type, is_active, created_by_admin_id, updated_at)
      VALUES ($1, $2, $3, 'DEPARTMENT', true, $4, NOW())
    `, [costCenterId, `CC-${uid}`, costCenterName, adminId]);

    // Create original transaction: OUT, REVERSED, settlement_date = today
    originalTxId = randomUUID();
    await pool.query(`
      INSERT INTO financial_transactions (
        id, source_type, origin_type, direction, transaction_type, status,
        payment_method, competence_date, transaction_date, settlement_date,
        gross_amount_cents, fee_amount_cents, discount_amount_cents, retention_amount_cents, net_amount_cents,
        description, account_id, category_id, cost_center_id,
        created_by_admin_id, responsible_admin_id, updated_at
      ) VALUES (
        $1, 'MANUAL', 'MANUAL', 'OUT', 'EXPENSE', 'REVERSED',
        'PIX', $2::date, $2::date, $2::date,
        50000, 0, 0, 0, 50000,
        'Despesa teste integração', $3, $4, $5,
        $6, $6, NOW()
      )
    `, [originalTxId, todayStr, accountId, categoryId, costCenterId, adminId]);

    // Create reversal transaction: IN, POSTED, REVERSAL, reversal_of_id = original, memo = reason
    reversalTxId = randomUUID();
    await pool.query(`
      INSERT INTO financial_transactions (
        id, source_type, origin_type, direction, transaction_type, status,
        payment_method, competence_date, transaction_date, settlement_date,
        gross_amount_cents, fee_amount_cents, discount_amount_cents, retention_amount_cents, net_amount_cents,
        description, memo, reversal_of_id, account_id, category_id, cost_center_id,
        created_by_admin_id, responsible_admin_id, updated_at
      ) VALUES (
        $1, 'MANUAL', 'MANUAL', 'IN', 'REVERSAL', 'POSTED',
        'INTERNAL', $2::date, $2::date, $2::date,
        50000, 0, 0, 0, 50000,
        'Estorno: Despesa teste integração', 'Motivo teste integração', $3, $4, $5, $6,
        $7, $7, NOW()
      )
    `, [reversalTxId, todayStr, originalTxId, accountId, categoryId, costCenterId, adminId]);
  });

  afterAll(async () => {
    if (!pool) return;
    // Clean up in order
    await pool.query('DELETE FROM financial_transactions WHERE created_by_admin_id = $1', [adminId]);
    await pool.query('DELETE FROM financial_cost_centers WHERE created_by_admin_id = $1', [adminId]);
    await pool.query('DELETE FROM financial_categories WHERE created_by_admin_id = $1', [adminId]);
    await pool.query('DELETE FROM financial_accounts WHERE created_by_admin_id = $1', [adminId]);
    await pool.query('DELETE FROM admins WHERE id = $1', [adminId]);
    await pool.end();
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 1: GET /manual-transactions returns 200 with 2 transactions
  // ═══════════════════════════════════════════════════════════════════════════════

  it('GET /manual-transactions returns 200 with 2 transactions', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ start_date: todayStr, end_date: todayStr });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Filter to our test transactions (other tests may have data)
    const txs = res.body.data.transactions.filter((t: any) =>
      t.id === originalTxId || t.id === reversalTxId
    );
    expect(txs.length).toBe(2);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 2: Summary — realized_in and realized_out
  // ═══════════════════════════════════════════════════════════════════════════════

  it('summary includes realized_in and realized_out for our fixtures', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ start_date: todayStr, end_date: todayStr, account_id: accountId });
    expect(res.status).toBe(200);
    const s = res.body.data.summary;
    // original (REVERSED, OUT) contributes to realized_out
    // reversal (POSTED, IN) contributes to realized_in
    expect(Number(s.realized_in_total_cents)).toBeGreaterThanOrEqual(50000);
    expect(Number(s.realized_out_total_cents)).toBeGreaterThanOrEqual(50000);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 3: Original has reversal info
  // ═══════════════════════════════════════════════════════════════════════════════

  it('original transaction has reversal linked', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ start_date: todayStr, end_date: todayStr, account_id: accountId });
    expect(res.status).toBe(200);
    const original = res.body.data.transactions.find((t: any) => t.id === originalTxId);
    expect(original).toBeDefined();
    expect(original.status).toBe('REVERSED');
    expect(original.reversal).toBeDefined();
    expect(original.reversal.id).toBe(reversalTxId);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 4: Reversal has original info
  // ═══════════════════════════════════════════════════════════════════════════════

  it('reversal transaction has original linked', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ start_date: todayStr, end_date: todayStr, account_id: accountId });
    expect(res.status).toBe(200);
    const reversal = res.body.data.transactions.find((t: any) => t.id === reversalTxId);
    expect(reversal).toBeDefined();
    expect(reversal.transaction_type).toBe('REVERSAL');
    expect(reversal.reversal_of_id).toBe(originalTxId);
    expect(reversal.original).toBeDefined();
    expect(reversal.original.id).toBe(originalTxId);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 5: reversal_reason comes from memo
  // ═══════════════════════════════════════════════════════════════════════════════

  it('reversal_reason comes from memo field', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ start_date: todayStr, end_date: todayStr, account_id: accountId });
    expect(res.status).toBe(200);

    // For the original: reversal_reason comes from rev.memo
    const original = res.body.data.transactions.find((t: any) => t.id === originalTxId);
    expect(original.reversal.reason).toBe('Motivo teste integração');

    // For the reversal itself: reversal_reason comes from its own memo (since type=REVERSAL)
    const reversal = res.body.data.transactions.find((t: any) => t.id === reversalTxId);
    expect(reversal.reversal_reason).toBe('Motivo teste integração');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 6: Dates are YYYY-MM-DD strings
  // ═══════════════════════════════════════════════════════════════════════════════

  it('dates are YYYY-MM-DD format', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ start_date: todayStr, end_date: todayStr, account_id: accountId });
    expect(res.status).toBe(200);
    const tx = res.body.data.transactions.find((t: any) => t.id === originalTxId);
    expect(tx.competence_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(tx.transaction_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(tx.settlement_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(tx.reporting_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 7: Values are string cents
  // ═══════════════════════════════════════════════════════════════════════════════

  it('amounts are string cents', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ start_date: todayStr, end_date: todayStr, account_id: accountId });
    expect(res.status).toBe(200);
    const tx = res.body.data.transactions.find((t: any) => t.id === originalTxId);
    expect(tx.gross_amount_cents).toBe('50000');
    expect(tx.net_amount_cents).toBe('50000');
    expect(typeof tx.gross_amount_cents).toBe('string');
    expect(typeof tx.net_amount_cents).toBe('string');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 8: Search by account name
  // ═══════════════════════════════════════════════════════════════════════════════

  it('search by account name finds transactions', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ start_date: todayStr, end_date: todayStr, search: accountName.slice(0, 20) });
    expect(res.status).toBe(200);
    const txs = res.body.data.transactions.filter((t: any) =>
      t.id === originalTxId || t.id === reversalTxId
    );
    expect(txs.length).toBe(2);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 9: Search by category name
  // ═══════════════════════════════════════════════════════════════════════════════

  it('search by category name finds transactions', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ start_date: todayStr, end_date: todayStr, search: categoryName.slice(0, 20) });
    expect(res.status).toBe(200);
    const txs = res.body.data.transactions.filter((t: any) =>
      t.id === originalTxId || t.id === reversalTxId
    );
    expect(txs.length).toBe(2);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 10: Search by cost center name
  // ═══════════════════════════════════════════════════════════════════════════════

  it('search by cost center name finds transactions', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions')
      .query({ start_date: todayStr, end_date: todayStr, search: costCenterName.slice(0, 20) });
    expect(res.status).toBe(200);
    const txs = res.body.data.transactions.filter((t: any) =>
      t.id === originalTxId || t.id === reversalTxId
    );
    expect(txs.length).toBe(2);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 11: CSV returns 200 with UTF-8 BOM and 2 data rows
  // ═══════════════════════════════════════════════════════════════════════════════

  it('CSV returns 200 with UTF-8 BOM and data rows', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions/csv')
      .query({ start_date: todayStr, end_date: todayStr, account_id: accountId });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    // UTF-8 BOM
    expect(res.text.charCodeAt(0)).toBe(0xFEFF);
    // Parse CSV lines
    const lines = res.text.split('\r\n').filter(l => l.length > 0);
    // header + at least 2 data rows
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 12: CSV contains reversal reason from memo
  // ═══════════════════════════════════════════════════════════════════════════════

  it('CSV contains reversal reason from memo', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/manual-transactions/csv')
      .query({ start_date: todayStr, end_date: todayStr, account_id: accountId });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Motivo teste integração');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 13: POSTED with settlement_date NULL → 500
  // ═══════════════════════════════════════════════════════════════════════════════

  it('POSTED with settlement_date NULL triggers INTEGRITY_SETTLEMENT_DATE_MISSING', async () => {
    // Insert a bad transaction
    const badId = randomUUID();
    await pool.query(`
      INSERT INTO financial_transactions (
        id, source_type, origin_type, direction, transaction_type, status,
        payment_method, competence_date, transaction_date, settlement_date,
        gross_amount_cents, fee_amount_cents, discount_amount_cents, retention_amount_cents, net_amount_cents,
        description, account_id, category_id, cost_center_id,
        created_by_admin_id, responsible_admin_id, updated_at
      ) VALUES (
        $1, 'MANUAL', 'MANUAL', 'IN', 'INCOME', 'POSTED',
        'PIX', $2::date, $2::date, NULL,
        10000, 0, 0, 0, 10000,
        'Sem settlement_date', $3, $4, $5,
        $6, $6, NOW()
      )
    `, [badId, todayStr, accountId, categoryId, costCenterId, adminId]);

    try {
      const res = await request(app)
        .get('/api/admin/finance/accountant-report/manual-transactions')
        .query({ start_date: todayStr, end_date: todayStr });
      expect(res.status).toBe(500);
      expect(res.body.code).toBe('INTEGRITY_SETTLEMENT_DATE_MISSING');
    } finally {
      await pool.query('DELETE FROM financial_transactions WHERE id = $1', [badId]);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 14: Duplicate reversals → 500
  // ═══════════════════════════════════════════════════════════════════════════════

  it('duplicate reversals trigger INTEGRITY_DUPLICATE_REVERSALS', async () => {
    // Insert a second reversal pointing to the same original
    const dupId = randomUUID();
    await pool.query(`
      INSERT INTO financial_transactions (
        id, source_type, origin_type, direction, transaction_type, status,
        payment_method, competence_date, transaction_date, settlement_date,
        gross_amount_cents, fee_amount_cents, discount_amount_cents, retention_amount_cents, net_amount_cents,
        description, memo, reversal_of_id, account_id, category_id, cost_center_id,
        created_by_admin_id, responsible_admin_id, updated_at
      ) VALUES (
        $1, 'MANUAL', 'MANUAL', 'IN', 'REVERSAL', 'POSTED',
        'INTERNAL', $2::date, $2::date, $2::date,
        50000, 0, 0, 0, 50000,
        'Estorno duplicado', 'Duplicado', $3, $4, $5, $6,
        $7, $7, NOW()
      )
    `, [dupId, todayStr, originalTxId, accountId, categoryId, costCenterId, adminId]);

    try {
      const res = await request(app)
        .get('/api/admin/finance/accountant-report/manual-transactions')
        .query({ start_date: todayStr, end_date: todayStr });
      expect(res.status).toBe(500);
      expect(res.body.code).toBe('INTEGRITY_DUPLICATE_REVERSALS');
    } finally {
      await pool.query('DELETE FROM financial_transactions WHERE id = $1', [dupId]);
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEST 15: REVERSAL without reversal_of_id → 500
  // ═══════════════════════════════════════════════════════════════════════════════

  it('REVERSAL without reversal_of_id triggers INTEGRITY_TYPE_INCONSISTENCY', async () => {
    // Insert a REVERSAL-type transaction without reversal_of_id
    const badId = randomUUID();
    await pool.query(`
      INSERT INTO financial_transactions (
        id, source_type, origin_type, direction, transaction_type, status,
        payment_method, competence_date, transaction_date, settlement_date,
        gross_amount_cents, fee_amount_cents, discount_amount_cents, retention_amount_cents, net_amount_cents,
        description, reversal_of_id, account_id, category_id, cost_center_id,
        created_by_admin_id, responsible_admin_id, updated_at
      ) VALUES (
        $1, 'MANUAL', 'MANUAL', 'IN', 'REVERSAL', 'POSTED',
        'INTERNAL', $2::date, $2::date, $2::date,
        10000, 0, 0, 0, 10000,
        'Reversal sem original', NULL, $3, $4, $5,
        $6, $6, NOW()
      )
    `, [badId, todayStr, accountId, categoryId, costCenterId, adminId]);

    try {
      const res = await request(app)
        .get('/api/admin/finance/accountant-report/manual-transactions')
        .query({ start_date: todayStr, end_date: todayStr });
      expect(res.status).toBe(500);
      expect(res.body.code).toBe('INTEGRITY_TYPE_INCONSISTENCY');
    } finally {
      await pool.query('DELETE FROM financial_transactions WHERE id = $1', [badId]);
    }
  });
});
