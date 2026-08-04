/**
 * E2E: Accounting Portal — Accounting Firms (Escritórios)
 * CRUD operations, document formatting, status chips.
 */
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

const ADMIN_TOKEN = 'test-admin-token-mock';
const SA_DATA = JSON.stringify({ id: 'admin-1', name: 'Admin', email: 'admin@kaviar.com', role: 'SUPER_ADMIN' });

async function setupAuth(page: Page, data = SA_DATA) {
  await page.addInitScript(({ token, adminData }) => {
    localStorage.setItem('kaviar_admin_token', token);
    localStorage.setItem('kaviar_admin_data', adminData);
  }, { token: ADMIN_TOKEN, adminData: data });
}

const mockFirms = {
  success: true,
  data: [
    { id: 'firm-1', razao_social: 'Contabilidade Silva', nome_fantasia: 'Silva Contabil', document_type: 'CNPJ', document_number: '12345678000190', crc: '123456', crc_uf: 'RJ', email: 'contato@silva.com', telefone: '2199990000', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', _count: { accountants: 2 } },
  ],
  pagination: { total: 1, page: 1, limit: 25 },
};

const mockInactiveFirm = {
  success: true,
  data: [
    { id: 'firm-2', razao_social: 'Escritório Inativo', nome_fantasia: 'Inativo', document_type: 'CPF', document_number: '12345678901', crc: '654321', crc_uf: 'SP', email: 'inativo@test.com', telefone: '1199990000', is_active: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', _count: { accountants: 0 } },
  ],
  pagination: { total: 1, page: 1, limit: 25 },
};

async function interceptFirmsAPI(page: Page, responseData = mockFirms) {
  await page.route('**/api/admin/accounting/firms**', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(responseData),
      });
    }
    if (method === 'POST') {
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { id: 'firm-new', ...JSON.parse(route.request().postData() || '{}') } }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.route('**/api/admin/accounting/firms/*', async (route) => {
    const method = route.request().method();
    if (method === 'PATCH' || method === 'PUT') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { id: 'firm-1' } }),
      });
    }
    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockFirms.data[0] }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  // Mock other accounting endpoints
  await page.route('**/api/admin/accounting/entities**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
  });
  await page.route('**/api/admin/accounting/accountants**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
  });
  await page.route('**/api/admin/accounting/links**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
  });
}

test.describe('Accounting Portal — Firms (Escritórios)', () => {
  test('Table lists firms with formatted document', async ({ page }) => {
    await setupAuth(page);
    await interceptFirmsAPI(page);
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Escritórios/i }).click();

    await expect(page.getByText('Contabilidade Silva')).toBeVisible();
    // CNPJ 12345678000190 formatted as 12.345.678/0001-90
    await expect(page.getByText('12.345.678/0001-90')).toBeVisible();
  });

  test('Button "Novo Escritório" opens dialog', async ({ page }) => {
    await setupAuth(page);
    await interceptFirmsAPI(page);
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Escritórios/i }).click();

    await page.getByRole('button', { name: /Novo Escritório/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel(/Razão Social/i)).toBeVisible();
  });

  test('Dialog shows document_type field (CNPJ/CPF)', async ({ page }) => {
    await setupAuth(page);
    await interceptFirmsAPI(page);
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Escritórios/i }).click();

    await page.getByRole('button', { name: /Novo Escritório/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Should have document type selector
    await page.getByLabel(/Tipo.*Documento|Document.*Type/i).click();
    await expect(page.getByRole('option', { name: /CNPJ/i })).toBeVisible();
    await expect(page.getByRole('option', { name: /CPF/i })).toBeVisible();
  });

  test('Create sends correct POST', async ({ page }) => {
    await setupAuth(page);
    let postBody: Record<string, unknown> | null = null;
    await page.route('**/api/admin/accounting/firms**', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        postBody = JSON.parse(route.request().postData() || '{}');
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { id: 'firm-new', ...postBody } }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockFirms),
      });
    });
    await page.route('**/api/admin/accounting/firms/*', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: mockFirms.data[0] }) });
    });
    await page.route('**/api/admin/accounting/entities**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/accountants**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/links**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Escritórios/i }).click();

    await page.getByRole('button', { name: /Novo Escritório/i }).click();
    await page.getByLabel(/Razão Social/i).fill('Novo Escritório LTDA');
    await page.getByLabel(/Nome Fantasia/i).fill('Novo Contabil');
    await page.getByLabel(/Tipo.*Documento|Document.*Type/i).click();
    await page.getByRole('option', { name: /CNPJ/i }).click();
    await page.getByLabel(/Número.*Documento|Document.*Number|CNPJ\/CPF/i).fill('98765432000188');
    await page.getByLabel(/CRC/i).fill('789012');
    await page.getByLabel(/Email/i).fill('novo@contabil.com');
    await page.getByRole('button', { name: /Salvar|Criar|Confirmar/i }).click();

    await page.waitForTimeout(500);
    expect(postBody).not.toBeNull();
    expect((postBody as Record<string, unknown>).razao_social).toBe('Novo Escritório LTDA');
    expect((postBody as Record<string, unknown>).document_type).toBe('CNPJ');
  });

  test('Edit opens with pre-filled data', async ({ page }) => {
    await setupAuth(page);
    await interceptFirmsAPI(page);
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Escritórios/i }).click();

    const row = page.getByText('Contabilidade Silva').locator('..');
    await row.getByRole('button', { name: /Editar|Edit/i }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel(/Razão Social/i)).toHaveValue('Contabilidade Silva');
  });

  test('Status chip based on is_active', async ({ page }) => {
    await setupAuth(page);
    const mixedFirms = {
      success: true,
      data: [
        ...mockFirms.data,
        mockInactiveFirm.data[0],
      ],
      pagination: { total: 2, page: 1, limit: 25 },
    };
    await page.route('**/api/admin/accounting/firms**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mixedFirms) });
    });
    await page.route('**/api/admin/accounting/entities**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/accountants**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/links**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Escritórios/i }).click();

    await expect(page.getByText('Ativo')).toBeVisible();
    await expect(page.getByText('Inativo')).toBeVisible();
  });
});
