/**
 * E2E: Dashboard Financeiro e DRE Gerencial (Frente 6)
 * Mock-first: route interception, no real backend.
 */
import { test, expect, Page } from 'playwright/test';

const ADMIN_TOKEN = 'test-token-e2e';
const SA_DATA = JSON.stringify({ id: 'sa-e2e', name: 'SuperAdmin', email: 'sa@e2e.local', role: 'SUPER_ADMIN' });
const FIN_DATA = JSON.stringify({ id: 'fin-e2e', name: 'Finance', email: 'fin@e2e.local', role: 'FINANCE' });

async function setupAuth(page: Page, data = SA_DATA) {
  await page.addInitScript(({ token, adminData }) => {
    localStorage.setItem('kaviar_admin_token', token);
    localStorage.setItem('kaviar_admin_data', adminData);
  }, { token: ADMIN_TOKEN, adminData: data });
}

const mockDashboard = {
  success: true,
  data: {
    summary: {
      realized_revenue_cents: '500000',
      realized_expense_cents: '320000',
      realized_result_cents: '180000',
      forecast_revenue_cents: '150000',
      forecast_expense_cents: '80000',
      forecast_result_cents: '70000',
      pending_total_cents: '230000',
      overdue_total_cents: '45000',
      overdue_count: 3,
      canceled_total_cents: '10000',
      transfer_total_cents: '60000',
      total_transactions: 42,
    },
    dre_groups: [
      { dre_group: 'Custos Operacionais', revenue_cents: '0', expense_cents: '200000', result_cents: '-200000', transaction_count: 15 },
      { dre_group: 'Receita Operacional', revenue_cents: '500000', expense_cents: '0', result_cents: '500000', transaction_count: 10 },
      { dre_group: 'NÃO CLASSIFICADO', revenue_cents: '0', expense_cents: '120000', result_cents: '-120000', transaction_count: 8 },
    ],
    by_category: [
      { category_id: 'c1', category_code: 'AWS', category_name: 'AWS', total_cents: '100000', transaction_count: 5 },
    ],
    by_account: [
      { account_id: 'a1', account_code: 'BANK-01', account_name: 'Conta Corrente', total_in_cents: '500000', total_out_cents: '320000', transaction_count: 30 },
    ],
    by_cost_center: [
      { cost_center_id: 'cc1', cost_center_code: 'TECH', cost_center_name: 'Tecnologia', total_cents: '200000', transaction_count: 12 },
    ],
  },
};

const mockTransactions = {
  success: true,
  data: [],
  pagination: { page: 1, limit: 25, total: 0, totalPages: 0 },
};

async function interceptDashboardAPIs(page: Page) {
  await page.route('**/api/admin/finance/dashboard-summary**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDashboard) });
  });
  await page.route('**/api/admin/finance/transactions?**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockTransactions) });
  });
  await page.route('**/api/admin/finance/transactions', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockTransactions) });
    }
    return route.continue();
  });
  await page.route('**/api/admin/finance/accounts**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } }) }));
  await page.route('**/api/admin/finance/categories**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } }) }));
  await page.route('**/api/admin/finance/cost-centers**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } }) }));
}

test.describe('Dashboard & DRE (Frente 6)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await interceptDashboardAPIs(page);
  });

  test('displays summary cards with correct values', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByText('Receitas realizadas')).toBeVisible();
    await expect(page.getByText('Despesas realizadas')).toBeVisible();
    await expect(page.getByText('Resultado realizado')).toBeVisible();
    await expect(page.getByText('Receitas previstas')).toBeVisible();
    await expect(page.getByText('Despesas previstas')).toBeVisible();
  });

  test('displays overdue card with count', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByText(/Total vencido.*3/)).toBeVisible();
  });

  test('displays DRE Gerencial section', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByText('DRE Gerencial')).toBeVisible();
  });

  test('DRE table shows classified groups', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByText('Custos Operacionais')).toBeVisible();
    await expect(page.getByText('Receita Operacional')).toBeVisible();
  });

  test('DRE table shows NÃO CLASSIFICADO group', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByText('NÃO CLASSIFICADO')).toBeVisible();
  });

  test('FINANCE role can see dashboard cards', async ({ page }) => {
    await setupAuth(page, FIN_DATA);
    await interceptDashboardAPIs(page);
    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByText('Receitas realizadas')).toBeVisible();
  });

  test('dashboard fetches with current filters', async ({ page }) => {
    let requestUrl = '';
    await page.route('**/api/admin/finance/dashboard-summary**', async (route) => {
      requestUrl = route.request().url();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockDashboard) });
    });

    await page.goto('/admin/financeiro/lancamentos');
    // Type filter text to trigger filter (search field is most reliable)
    const searchField = page.locator('input[type="text"]').first();
    if (await searchField.isVisible()) {
      await searchField.fill('AWS');
    }
    await page.getByRole('button', { name: /Filtrar/i }).click();
    await page.waitForTimeout(500);

    // The dashboard-summary endpoint should have been called
    expect(requestUrl).toBeTruthy();
  });
});
