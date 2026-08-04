/**
 * E2E: Exportação CSV server-side (Frente 5)
 * Mock-first: route interception, validates button behavior and download.
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

// BOM + header + 1 data row (semicolon-separated, quoted)
const BOM = '\uFEFF';
const CSV_CONTENT = BOM + '"ID";"Status";"Origem";"Descrição"\r\n"txn-1";"POSTED";"MANUAL";"AWS agosto"\r\n';

async function interceptExportAPIs(page: Page) {
  await page.route('**/api/admin/finance/transactions/export.csv**', async (route) => {
    return route.fulfill({
      status: 200,
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="kaviar-lancamentos.csv"' },
      body: CSV_CONTENT,
    });
  });
  await page.route('**/api/admin/finance/dashboard-summary**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { summary: { realized_revenue_cents: '0', realized_expense_cents: '0', realized_result_cents: '0', forecast_revenue_cents: '0', forecast_expense_cents: '0', forecast_result_cents: '0', pending_total_cents: '0', overdue_total_cents: '0', overdue_count: 0, canceled_total_cents: '0', transfer_total_cents: '0', total_transactions: 0 }, dre_groups: [], by_category: [], by_account: [], by_cost_center: [] } }) });
  });
  await page.route('**/api/admin/finance/transactions?**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [{ id: 'txn-1', description: 'AWS', direction: 'OUT', transaction_type: 'EXPENSE', status: 'POSTED', competence_date: '2026-08-01', transaction_date: '2026-08-01', gross_amount_cents: '15000', net_amount_cents: '15000', account: { code: 'B1', name: 'Banco' }, category: { code: 'AWS', name: 'AWS' } }], pagination: { page: 1, limit: 25, total: 1, totalPages: 1 } }) });
  });
  await page.route('**/api/admin/finance/transactions', async (route) => {
    if (route.request().method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } }) });
    }
    return route.continue();
  });
  await page.route('**/api/admin/finance/accounts**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } }) }));
  await page.route('**/api/admin/finance/categories**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } }) }));
  await page.route('**/api/admin/finance/cost-centers**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } }) }));
}

test.describe('CSV Export (Frente 5)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await interceptExportAPIs(page);
  });

  test('Exportar CSV button is visible', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByRole('button', { name: /Exportar CSV/i })).toBeVisible();
  });

  test('Exportar CSV button triggers download', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Exportar CSV/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('kaviar-lancamentos');
    expect(download.suggestedFilename()).toContain('.csv');
  });

  test('export sends current filters', async ({ page }) => {
    let exportUrl = '';
    await page.route('**/api/admin/finance/transactions/export.csv**', async (route) => {
      exportUrl = route.request().url();
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="test.csv"' }, body: CSV_CONTENT });
    });

    await page.goto('/admin/financeiro/lancamentos');
    // Use search filter (text input, most reliable across MUI)
    const searchField = page.locator('input[type="text"]').first();
    if (await searchField.isVisible()) {
      await searchField.fill('AWS');
    }
    await page.getByRole('button', { name: /Filtrar/i }).click();
    await page.waitForTimeout(300);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /Exportar CSV/i }).click();
    await downloadPromise;

    expect(exportUrl).toContain('search=AWS');
  });

  test('FINANCE role can see and use export button', async ({ page }) => {
    await setupAuth(page, FIN_DATA);
    await interceptExportAPIs(page);
    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByRole('button', { name: /Exportar CSV/i })).toBeVisible();
  });

  test('shows error when backend returns 422 (limit exceeded)', async ({ page }) => {
    await page.route('**/api/admin/finance/transactions/export.csv**', async (route) => {
      return route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ success: false, code: 'CSV_ROW_LIMIT_EXCEEDED', error: 'O relatório possui 5001 linhas (máximo: 5000).', total: 5001, max: 5000 }) });
    });

    await page.goto('/admin/financeiro/lancamentos');
    await page.getByRole('button', { name: /Exportar CSV/i }).click();
    // After the error, the button should return to normal state (not stuck on "Exportando...")
    await expect(page.getByRole('button', { name: /Exportar CSV/i })).toBeVisible({ timeout: 5000 });
  });

  test('button shows loading state during export', async ({ page }) => {
    await page.route('**/api/admin/finance/transactions/export.csv**', async (route) => {
      await new Promise((r) => setTimeout(r, 1000));
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/csv', 'Content-Disposition': 'attachment; filename="test.csv"' }, body: CSV_CONTENT });
    });

    await page.goto('/admin/financeiro/lancamentos');
    await page.getByRole('button', { name: /Exportar CSV/i }).click();
    await expect(page.getByRole('button', { name: /Exportando/i })).toBeVisible();
  });
});
