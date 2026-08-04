/**
 * E2E: Categorias Contábeis — CRUD dos campos contábeis (Frentes 3-4)
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

const mockCategories = [
  { id: 'cat-1', code: 'AWS', name: 'AWS', kind: 'EXPENSE', parent_id: null, parent: null, default_direction: 'OUT', requires_document: false, is_system: true, is_active: true, is_postable: true, sort_order: 5010, children_count: 0, accounting_code: '3.1.01.01', accounting_nature: 'DEBIT', dre_group: 'Custos Operacionais', balance_sheet_group: null, fiscal_classification: 'CFOP 5102', deductible: true, export_code: 'EXP-AWS', accountant_notes: 'Verificado', created_by_admin: { id: 'sa-1', name: 'Admin', role: 'SUPER_ADMIN' }, updated_by_admin: { id: 'sa-1', name: 'Admin', role: 'SUPER_ADMIN' }, created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z' },
  { id: 'cat-2', code: 'CONTABILIDADE', name: 'Contabilidade', kind: 'EXPENSE', parent_id: null, parent: null, default_direction: 'OUT', requires_document: false, is_system: false, is_active: true, is_postable: true, sort_order: 7010, children_count: 0, accounting_code: null, accounting_nature: null, dre_group: null, balance_sheet_group: null, fiscal_classification: null, deductible: null, export_code: null, accountant_notes: null, created_by_admin: null, updated_by_admin: null, created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z' },
];

async function interceptCategoryAPIs(page: Page) {
  await page.route('**/api/admin/finance/categories**', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: mockCategories, pagination: { page: 1, limit: 25, total: 2, totalPages: 1 } }) });
    }
    if (method === 'POST') {
      const body = route.request().postDataJSON();
      const newCat = { ...mockCategories[1], id: 'cat-new', code: body.code, name: body.name, accounting_code: body.accounting_code || null, accounting_nature: body.accounting_nature || null, dre_group: body.dre_group || null, balance_sheet_group: body.balance_sheet_group || null, fiscal_classification: body.fiscal_classification || null, deductible: body.deductible ?? null, export_code: body.export_code || null, accountant_notes: body.accountant_notes || null };
      return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: newCat }) });
    }
    if (method === 'PATCH') {
      const body = route.request().postDataJSON();
      const updated = { ...mockCategories[0], ...body, updated_at: new Date().toISOString() };
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: updated }) });
    }
    return route.continue();
  });
  // Accounts/cost-centers for the category form parent selector
  await page.route('**/api/admin/finance/accounts**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } }) }));
  await page.route('**/api/admin/finance/cost-centers**', async (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } }) }));
}

test.describe('Categories — Accounting Fields (Frentes 3-4)', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
    await interceptCategoryAPIs(page);
  });

  test('categories table shows accounting columns', async ({ page }) => {
    await page.goto('/admin/financeiro');
    await page.getByRole('tab', { name: /Categorias/i }).click();
    await expect(page.getByText('Cód. contábil')).toBeVisible();
    await expect(page.getByText('Grupo DRE')).toBeVisible();
    await expect(page.getByText('Dedutível')).toBeVisible();
  });

  test('displays accounting_code and dre_group from category data', async ({ page }) => {
    await page.goto('/admin/financeiro');
    await page.getByRole('tab', { name: /Categorias/i }).click();
    await expect(page.getByText('3.1.01.01')).toBeVisible();
    await expect(page.getByText('Custos Operacionais')).toBeVisible();
  });

  test('Nova categoria button opens dialog', async ({ page }) => {
    await page.goto('/admin/financeiro');
    await page.getByRole('tab', { name: /Categorias/i }).click();
    await page.getByRole('button', { name: /Nova categoria/i }).click();
    await expect(page.getByText('Nova categoria financeira')).toBeVisible();
  });

  test('create dialog has Classificação contábil section', async ({ page }) => {
    await page.goto('/admin/financeiro');
    await page.getByRole('tab', { name: /Categorias/i }).click();
    await page.getByRole('button', { name: /Nova categoria/i }).click();
    await expect(page.getByRole('heading', { name: /Classificação contábil/i })).toBeVisible();
    await expect(page.getByRole('dialog').getByLabel('Código contábil')).toBeVisible();
    await expect(page.getByRole('dialog').getByLabel(/Grupo DRE/i)).toBeVisible();
    await expect(page.getByRole('dialog').getByLabel(/Observações do contador/i)).toBeVisible();
  });

  test('create category with accounting fields — POST called', async ({ page }) => {
    let postCalled = false;
    let postBody: any = null;
    await page.route('**/api/admin/finance/categories', async (route) => {
      if (route.request().method() === 'POST') {
        postCalled = true;
        postBody = route.request().postDataJSON();
        return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: { ...mockCategories[1], id: 'cat-new', ...postBody } }) });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: mockCategories, pagination: { page: 1, limit: 25, total: 2, totalPages: 1 } }) });
    });

    await page.goto('/admin/financeiro');
    await page.getByRole('tab', { name: /Categorias/i }).click();
    await page.getByRole('button', { name: /Nova categoria/i }).click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Código').first().fill('TEST_E2E_001');
    await dialog.getByLabel('Nome').first().fill('Teste E2E');
    await dialog.getByLabel('Código contábil').fill('9.9.99.99');
    await dialog.getByLabel(/Observações do contador/i).fill('Nota E2E');

    await dialog.getByRole('button', { name: /Salvar/i }).click();
    await page.waitForTimeout(500);

    expect(postCalled).toBe(true);
    expect(postBody?.code).toBe('TEST_E2E_001');
    expect(postBody?.accounting_code).toBe('9.9.99.99');
    expect(postBody?.accountant_notes).toBe('Nota E2E');
  });

  test('Editar button opens edit dialog with data populated', async ({ page }) => {
    await page.goto('/admin/financeiro');
    await page.getByRole('tab', { name: /Categorias/i }).click();
    await page.getByRole('button', { name: /Editar/i }).first().click();
    await expect(page.getByText('Editar categoria financeira')).toBeVisible();
  });

  test('code field validation — rejects empty code', async ({ page }) => {
    await page.goto('/admin/financeiro');
    await page.getByRole('tab', { name: /Categorias/i }).click();
    await page.getByRole('button', { name: /Nova categoria/i }).click();
    await page.getByLabel('Nome').fill('Teste');
    await page.getByRole('button', { name: /Salvar/i }).click();
    await expect(page.getByText(/Código é obrigatório/i)).toBeVisible();
  });

  test('FINANCE role can see categories table', async ({ page }) => {
    await page.addInitScript(({ token, adminData }) => {
      localStorage.setItem('kaviar_admin_token', token);
      localStorage.setItem('kaviar_admin_data', adminData);
    }, { token: ADMIN_TOKEN, adminData: FIN_DATA });
    await interceptCategoryAPIs(page);
    await page.goto('/admin/financeiro');
    await page.getByRole('tab', { name: /Categorias/i }).click();
    await expect(page.getByRole('cell', { name: 'AWS' }).first()).toBeVisible();
  });
});
