/**
 * Integrated E2E: Finance V2 — Real PostgreSQL
 *
 * Prerequisites:
 * - PostgreSQL kaviar_test running on localhost:5432
 * - Backend running on port 3003 (started by playwright config or manually)
 * - Frontend running on port 5174
 * - Admin seed: admin@kaviar.com / admin123 (SUPER_ADMIN)
 *
 * Run: TZ=America/Sao_Paulo npx playwright test --config=playwright.integrated.config.ts
 */
import { test, expect, apiPost, apiPatch, apiGet, injectAuth, uniqueCode } from '../fixtures';

// ══════════════════════════════════════════════════════════════════════════════
// 1. AUTHENTICATION & PERMISSIONS
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Integrated — Authentication & Permissions', () => {
  test('POST /api/admin/auth/login with valid credentials returns token', async ({ authToken }) => {
    expect(authToken).toBeTruthy();
    expect(authToken.length).toBeGreaterThan(20);
  });

  test('POST /api/admin/auth/login with wrong password returns 401', async ({}) => {
    const res = await fetch('http://127.0.0.1:3003/api/admin/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@kaviar.com', password: 'wrongpassword' }),
    });
    expect(res.status).toBe(401);
  });

  test('API request without token returns 401', async ({}) => {
    const { status } = await apiGet('/api/admin/finance/categories?limit=1', '');
    // Without token, middleware returns 401 (or the request may fail differently)
    expect([401, 403]).toContain(status);
  });

  test('API request with invalid token returns 401', async ({}) => {
    const { status } = await apiGet('/api/admin/finance/categories?limit=1', 'invalid-token-xyz');
    expect(status).toBe(401);
  });

  test('SUPER_ADMIN can list categories', async ({ authToken }) => {
    const { status, body } = await apiGet('/api/admin/finance/categories?limit=5', authToken);
    expect(status).toBe(200);
    expect(body.success).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 2. CATEGORIES — CRUD WITH ACCOUNTING FIELDS
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Integrated — Categories CRUD', () => {
  let createdCategoryId = '';
  let createdCategoryUpdatedAt = '';
  const catCode = uniqueCode('E2E_CAT');

  test('create category with all 8 accounting fields', async ({ authToken }) => {
    const { status, body } = await apiPost('/api/admin/finance/categories', {
      code: catCode,
      name: `E2E Test Category ${catCode}`,
      kind: 'EXPENSE',
      default_direction: 'OUT',
      sort_order: 99999,
      accounting_code: '3.1.99.01',
      accounting_nature: 'DEBIT',
      dre_group: 'Custos E2E',
      balance_sheet_group: 'Ativo Circulante E2E',
      fiscal_classification: 'CFOP 5999',
      deductible: true,
      export_code: 'EXP-E2E',
      accountant_notes: 'Nota E2E integrado',
    }, authToken);

    expect(status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.code).toBe(catCode);
    expect(body.data.accounting_code).toBe('3.1.99.01');
    expect(body.data.accounting_nature).toBe('DEBIT');
    expect(body.data.dre_group).toBe('Custos E2E');
    expect(body.data.deductible).toBe(true);
    createdCategoryId = body.data.id;
    createdCategoryUpdatedAt = body.data.updated_at;
  });

  test('fetch created category — fields persisted', async ({ authToken }) => {
    if (!createdCategoryId) test.skip();
    const { status, body } = await apiGet(`/api/admin/finance/categories/${createdCategoryId}`, authToken);
    expect(status).toBe(200);
    const cat = body.data;
    expect(cat).toBeDefined();
    expect(cat.accounting_code).toBe('3.1.99.01');
    expect(cat.dre_group).toBe('Custos E2E');
    expect(cat.export_code).toBe('EXP-E2E');
    expect(cat.accountant_notes).toBe('Nota E2E integrado');
  });

  test('edit category — update accounting fields', async ({ authToken }) => {
    if (!createdCategoryId) test.skip();
    const { status, body } = await apiPatch(`/api/admin/finance/categories/${createdCategoryId}`, {
      expected_updated_at: createdCategoryUpdatedAt,
      accounting_code: '4.2.01.01',
      dre_group: 'Despesas Administrativas E2E',
      deductible: false,
      accountant_notes: null,
    }, authToken);

    expect(status).toBe(200);
    expect(body.data.accounting_code).toBe('4.2.01.01');
    expect(body.data.dre_group).toBe('Despesas Administrativas E2E');
    expect(body.data.deductible).toBe(false);
    expect(body.data.accountant_notes).toBeNull();
    createdCategoryUpdatedAt = body.data.updated_at;
  });

  test('clear optional fields with null', async ({ authToken }) => {
    if (!createdCategoryId) test.skip();
    const { status, body } = await apiPatch(`/api/admin/finance/categories/${createdCategoryId}`, {
      expected_updated_at: createdCategoryUpdatedAt,
      accounting_code: null,
      dre_group: null,
      balance_sheet_group: null,
      fiscal_classification: null,
      deductible: null,
      export_code: null,
    }, authToken);

    expect(status).toBe(200);
    expect(body.data.accounting_code).toBeNull();
    expect(body.data.dre_group).toBeNull();
    expect(body.data.deductible).toBeNull();
    expect(body.data.export_code).toBeNull();
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 3. TRANSACTIONS — LIFECYCLE
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Integrated — Manual Transactions', () => {
  let accountId = '';
  let categoryId = '';
  let txnId = '';
  let txnUpdatedAt = '';

  test('setup: get account and category for transaction', async ({ authToken }) => {
    const accRes = await apiGet('/api/admin/finance/accounts?limit=1&is_active=true', authToken);
    expect(accRes.status).toBe(200);
    if (accRes.body.data.length === 0) test.skip();
    accountId = accRes.body.data[0].id;

    const catRes = await apiGet('/api/admin/finance/categories?limit=100&is_active=true', authToken);
    expect(catRes.status).toBe(200);
    const postable = catRes.body.data.find((c: any) => c.is_postable && c.kind === 'EXPENSE');
    if (!postable) test.skip();
    categoryId = postable.id;
  });

  test('create transaction in DRAFT', async ({ authToken }) => {
    if (!accountId || !categoryId) test.skip();
    const { status, body } = await apiPost('/api/admin/finance/transactions', {
      account_id: accountId,
      category_id: categoryId,
      direction: 'OUT',
      transaction_type: 'EXPENSE',
      payment_method: 'PIX',
      competence_date: '2026-08-01',
      transaction_date: '2026-08-01',
      gross_amount_cents: '15000',
      net_amount_cents: '15000',
      description: 'E2E Integration Test — AWS agosto',
    }, authToken);

    expect(status).toBe(201);
    expect(body.data.status).toBe('DRAFT');
    expect(body.data.description).toBe('E2E Integration Test — AWS agosto');
    txnId = body.data.id;
    txnUpdatedAt = body.data.updated_at;
  });

  test('edit transaction with CAS', async ({ authToken }) => {
    if (!txnId) test.skip();
    const { status, body } = await apiPatch(`/api/admin/finance/transactions/${txnId}`, {
      expected_updated_at: txnUpdatedAt,
      description: 'E2E Integration Test — AWS agosto (editado)',
      gross_amount_cents: '20000',
      net_amount_cents: '20000',
    }, authToken);

    expect(status).toBe(200);
    expect(body.data.description).toBe('E2E Integration Test — AWS agosto (editado)');
    txnUpdatedAt = body.data.updated_at;
  });

  test('liquidate (post) transaction', async ({ authToken }) => {
    if (!txnId) test.skip();
    const { status, body } = await apiPost(`/api/admin/finance/transactions/${txnId}/post`, {
      expected_updated_at: txnUpdatedAt,
      settlement_date: '2026-08-05',
    }, authToken);

    expect(status).toBe(200);
    expect(body.data.status).toBe('POSTED');
    txnUpdatedAt = body.data.updated_at;
  });

  test('cannot cancel POSTED transaction directly', async ({ authToken }) => {
    if (!txnId) test.skip();
    const { status, body } = await apiPost(`/api/admin/finance/transactions/${txnId}/cancel`, {
      expected_updated_at: txnUpdatedAt,
      canceled_reason: 'Tentativa E2E',
    }, authToken);

    expect(status).toBe(400);
  });

  test('reverse POSTED transaction', async ({ authToken }) => {
    if (!txnId) test.skip();
    const { status, body } = await apiPost(`/api/admin/finance/transactions/${txnId}/reverse`, {
      expected_updated_at: txnUpdatedAt,
      reversal_date: '2026-08-10',
      reason: 'Estorno E2E integrado',
    }, authToken);

    expect(status).toBe(200);
    expect(body.data.original).toBeDefined();
    expect(body.data.reversal).toBeDefined();
    expect(body.data.original.status).toBe('REVERSED');
    expect(body.data.reversal.transaction_type).toBe('REVERSAL');
    expect(body.data.reversal.direction).toBe('IN');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 4. CAS — CONCURRENCY CONFLICT
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Integrated — CAS Conflict (HTTP 409)', () => {
  let accountId = '';
  let categoryId = '';
  let txnId = '';
  let txnUpdatedAt = '';

  test('setup: create transaction for conflict test', async ({ authToken }) => {
    const accRes = await apiGet('/api/admin/finance/accounts?limit=1&is_active=true', authToken);
    if (accRes.body.data.length === 0) test.skip();
    accountId = accRes.body.data[0].id;

    const catRes = await apiGet('/api/admin/finance/categories?limit=100&is_active=true', authToken);
    const postable = catRes.body.data.find((c: any) => c.is_postable && c.kind === 'EXPENSE');
    if (!postable) test.skip();
    categoryId = postable.id;

    const { status, body } = await apiPost('/api/admin/finance/transactions', {
      account_id: accountId,
      category_id: categoryId,
      direction: 'OUT',
      transaction_type: 'EXPENSE',
      payment_method: 'PIX',
      competence_date: '2026-08-01',
      transaction_date: '2026-08-01',
      gross_amount_cents: '5000',
      net_amount_cents: '5000',
      description: 'E2E CAS Conflict Test',
    }, authToken);

    expect(status).toBe(201);
    txnId = body.data.id;
    txnUpdatedAt = body.data.updated_at;
  });

  test('first update succeeds, second with stale version gets 409', async ({ authToken }) => {
    if (!txnId) test.skip();
    const staleUpdatedAt = txnUpdatedAt;

    // First update succeeds
    const first = await apiPatch(`/api/admin/finance/transactions/${txnId}`, {
      expected_updated_at: staleUpdatedAt,
      description: 'E2E CAS — First update wins',
    }, authToken);
    expect(first.status).toBe(200);
    expect(first.body.data.description).toBe('E2E CAS — First update wins');

    // Second update with stale version → 409
    const second = await apiPatch(`/api/admin/finance/transactions/${txnId}`, {
      expected_updated_at: staleUpdatedAt,
      description: 'E2E CAS — This should fail',
    }, authToken);
    expect(second.status).toBe(409);

    // Verify first update persisted
    const final = await apiGet(`/api/admin/finance/transactions/${txnId}`, authToken);
    expect(final.body.data.description).toBe('E2E CAS — First update wins');
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 5. DASHBOARD SUMMARY
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Integrated — Dashboard Summary', () => {
  test('returns summary with all required fields', async ({ authToken }) => {
    const { status, body } = await apiGet('/api/admin/finance/dashboard-summary', authToken);
    expect(status).toBe(200);
    expect(body.data.summary).toBeDefined();
    expect(typeof body.data.summary.realized_revenue_cents).toBe('string');
    expect(typeof body.data.summary.realized_expense_cents).toBe('string');
    expect(typeof body.data.summary.realized_result_cents).toBe('string');
    expect(typeof body.data.summary.forecast_revenue_cents).toBe('string');
    expect(typeof body.data.summary.overdue_total_cents).toBe('string');
    expect(typeof body.data.summary.transfer_total_cents).toBe('string');
    expect(typeof body.data.summary.total_transactions).toBe('number');
  });

  test('returns DRE groups array', async ({ authToken }) => {
    const { status, body } = await apiGet('/api/admin/finance/dashboard-summary', authToken);
    expect(status).toBe(200);
    expect(Array.isArray(body.data.dre_groups)).toBe(true);
    expect(Array.isArray(body.data.by_category)).toBe(true);
    expect(Array.isArray(body.data.by_account)).toBe(true);
  });

  test('accepts filter parameters', async ({ authToken }) => {
    const { status } = await apiGet('/api/admin/finance/dashboard-summary?status=POSTED&direction=OUT', authToken);
    expect(status).toBe(200);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// 6. CSV EXPORT
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Integrated — CSV Export', () => {
  test('export returns CSV with BOM and semicolons', async ({ authToken }) => {
    const res = await fetch('http://127.0.0.1:3003/api/admin/finance/transactions/export.csv', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment');

    // Check BOM via raw bytes (Node.js fetch text() strips BOM by design)
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf[0]).toBe(0xEF);
    expect(buf[1]).toBe(0xBB);
    expect(buf[2]).toBe(0xBF);
    // Decode after BOM for content assertions
    const text = buf.slice(3).toString('utf8');
    // Semicolons
    expect(text).toContain(';');
    // Header columns
    expect(text).toContain('Código contábil');
    expect(text).toContain('Grupo DRE');
  });

  test('export respects filters', async ({ authToken }) => {
    const res = await fetch('http://127.0.0.1:3003/api/admin/finance/transactions/export.csv?status=POSTED', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(res.status).toBe(200);
  });
});
