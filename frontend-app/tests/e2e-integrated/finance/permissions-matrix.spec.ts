/**
 * Integrated E2E: Real Permission Matrix
 *
 * Tests 3 roles against real backend:
 * - SUPER_ADMIN: full read + write
 * - FINANCE: read + export, no write
 * - OPERATOR: no finance access (403)
 *
 * Uses real JWT tokens from POST /api/admin/auth/login.
 */
import { test, expect, apiGet, apiPost, apiPatch } from '../fixtures';

const API = 'http://127.0.0.1:3003';

async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) return '';
  const json = await res.json();
  return json.data?.token || json.token || '';
}

// ── Credentials ──────────────────────────────────────────────────────────────

const E2E_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'e2e-fallback-test-only';

const CREDS = {
  SUPER_ADMIN: { email: 'e2e-superadmin@kaviar.test', password: E2E_PASSWORD },
  FINANCE: { email: 'e2e-finance@kaviar.test', password: E2E_PASSWORD },
  OPERATOR: { email: 'e2e-operator@kaviar.test', password: E2E_PASSWORD },
};

// ══════════════════════════════════════════════════════════════════════════════
// Authentication
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Permissions — Authentication', () => {
  test('SUPER_ADMIN login succeeds', async ({}) => {
    const token = await login(CREDS.SUPER_ADMIN.email, CREDS.SUPER_ADMIN.password);
    expect(token.length).toBeGreaterThan(20);
  });

  test('FINANCE login succeeds', async ({}) => {
    const token = await login(CREDS.FINANCE.email, CREDS.FINANCE.password);
    expect(token.length).toBeGreaterThan(20);
  });

  test('OPERATOR login succeeds', async ({}) => {
    const token = await login(CREDS.OPERATOR.email, CREDS.OPERATOR.password);
    expect(token.length).toBeGreaterThan(20);
  });

  test('wrong password returns 401', async ({}) => {
    const res = await fetch(`${API}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: CREDS.SUPER_ADMIN.email, password: 'wrong' }),
    });
    expect(res.status).toBe(401);
  });

  test('nonexistent user returns 401', async ({}) => {
    const res = await fetch(`${API}/api/admin/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nonexistent@kaviar.test', password: 'any' }),
    });
    expect(res.status).toBe(401);
  });

  test('no token returns 401', async ({}) => {
    const res = await fetch(`${API}/api/admin/finance/categories?limit=1`);
    expect(res.status).toBe(401);
  });

  test('invalid token returns 401', async ({}) => {
    const res = await fetch(`${API}/api/admin/finance/categories?limit=1`, {
      headers: { Authorization: 'Bearer totally-invalid-token' },
    });
    expect(res.status).toBe(401);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// SUPER_ADMIN — Full access
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Permissions — SUPER_ADMIN full access', () => {
  let token = '';

  test.beforeAll(async () => {
    token = await login(CREDS.SUPER_ADMIN.email, CREDS.SUPER_ADMIN.password);
  });

  test('can list categories', async ({}) => {
    const { status } = await apiGet('/api/admin/finance/categories?limit=1', token);
    expect(status).toBe(200);
  });

  test('can list transactions', async ({}) => {
    const { status } = await apiGet('/api/admin/finance/transactions?limit=1', token);
    expect(status).toBe(200);
  });

  test('can access dashboard-summary', async ({}) => {
    const { status } = await apiGet('/api/admin/finance/dashboard-summary', token);
    expect(status).toBe(200);
  });

  test('can export CSV', async ({}) => {
    const res = await fetch(`${API}/api/admin/finance/transactions/export.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
  });

  test('can create category', async ({}) => {
    const code = `E2E_PERM_${Date.now().toString(36).toUpperCase()}`;
    const { status } = await apiPost('/api/admin/finance/categories', {
      code, name: 'Perm test', kind: 'EXPENSE',
    }, token);
    expect(status).toBe(201);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// FINANCE — Read + export, no write
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Permissions — FINANCE read-only', () => {
  let token = '';

  test.beforeAll(async () => {
    token = await login(CREDS.FINANCE.email, CREDS.FINANCE.password);
  });

  test('can list categories', async ({}) => {
    const { status } = await apiGet('/api/admin/finance/categories?limit=1', token);
    expect(status).toBe(200);
  });

  test('can list transactions', async ({}) => {
    const { status } = await apiGet('/api/admin/finance/transactions?limit=1', token);
    expect(status).toBe(200);
  });

  test('can access dashboard-summary', async ({}) => {
    const { status } = await apiGet('/api/admin/finance/dashboard-summary', token);
    expect(status).toBe(200);
  });

  test('can export CSV', async ({}) => {
    const res = await fetch(`${API}/api/admin/finance/transactions/export.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  test('CANNOT create transaction (403)', async ({}) => {
    const { status } = await apiPost('/api/admin/finance/transactions', {
      account_id: 'any', category_id: 'any', direction: 'OUT',
      transaction_type: 'EXPENSE', competence_date: '2026-08-01',
      transaction_date: '2026-08-01', gross_amount_cents: '1000',
      net_amount_cents: '1000', description: 'Should fail',
    }, token);
    expect(status).toBe(403);
  });

  test('CANNOT liquidate transaction (403)', async ({}) => {
    const { status } = await apiPost('/api/admin/finance/transactions/fake-id/post', {
      expected_updated_at: '2026-08-01T00:00:00.000Z',
    }, token);
    expect(status).toBe(403);
  });

  test('CANNOT cancel transaction (403)', async ({}) => {
    const { status } = await apiPost('/api/admin/finance/transactions/fake-id/cancel', {
      expected_updated_at: '2026-08-01T00:00:00.000Z',
      canceled_reason: 'test',
    }, token);
    expect(status).toBe(403);
  });

  test('CANNOT reverse transaction (403)', async ({}) => {
    const { status } = await apiPost('/api/admin/finance/transactions/fake-id/reverse', {
      expected_updated_at: '2026-08-01T00:00:00.000Z',
      reversal_date: '2026-08-01',
      reason: 'test',
    }, token);
    expect(status).toBe(403);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// OPERATOR — No finance access
// ══════════════════════════════════════════════════════════════════════════════

test.describe('Permissions — OPERATOR no finance access', () => {
  let token = '';

  test.beforeAll(async () => {
    token = await login(CREDS.OPERATOR.email, CREDS.OPERATOR.password);
  });

  test('CANNOT list categories (403)', async ({}) => {
    const { status } = await apiGet('/api/admin/finance/categories?limit=1', token);
    expect(status).toBe(403);
  });

  test('CANNOT list transactions (403)', async ({}) => {
    const { status } = await apiGet('/api/admin/finance/transactions?limit=1', token);
    expect(status).toBe(403);
  });

  test('CANNOT access dashboard-summary (403)', async ({}) => {
    const { status } = await apiGet('/api/admin/finance/dashboard-summary', token);
    expect(status).toBe(403);
  });

  test('CANNOT export CSV (403)', async ({}) => {
    const res = await fetch(`${API}/api/admin/finance/transactions/export.csv`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });

  test('CANNOT create transaction (403)', async ({}) => {
    const { status } = await apiPost('/api/admin/finance/transactions', {
      account_id: 'any', category_id: 'any', direction: 'OUT',
      transaction_type: 'EXPENSE', competence_date: '2026-08-01',
      transaction_date: '2026-08-01', gross_amount_cents: '1000',
      net_amount_cents: '1000', description: 'Blocked',
    }, token);
    expect(status).toBe(403);
  });
});
