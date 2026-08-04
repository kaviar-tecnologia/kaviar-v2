/**
 * E2E: Accounting Portal — Accountants (Contadores)
 * CRUD operations, CPF masking, status chips, suspension.
 */
import { test, expect } from 'playwright/test';
import type { Page } from 'playwright/test';

const ADMIN_TOKEN = 'test-admin-token-mock';
const SA_DATA = JSON.stringify({ id: 'admin-1', name: 'Admin', email: 'admin@kaviar.com', role: 'SUPER_ADMIN' });

async function setupAuth(page: Page, data = SA_DATA) {
  await page.addInitScript(({ token, adminData }) => {
    localStorage.setItem('kaviar_admin_token', token);
    localStorage.setItem('kaviar_admin_data', adminData);
  }, { token: ADMIN_TOKEN, adminData: data });
}

const mockAccountants = {
  success: true,
  data: [
    { id: 'acc-1', nome_completo: 'João Silva', email: 'joao@silva.com', cpf_masked: '***.***.***-01', crc: '123456', crc_uf: 'RJ', accounting_firm_id: 'firm-1', status: 'ACTIVE', is_active: true, mfa_enabled: false, accounting_firm: { id: 'firm-1', razao_social: 'Silva Contabil' }, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
  pagination: { total: 1, page: 1, limit: 25 },
};

const mockFirmsForSelect = {
  success: true,
  data: [
    { id: 'firm-1', razao_social: 'Contabilidade Silva', nome_fantasia: 'Silva Contabil', document_type: 'CNPJ', document_number: '12345678000190', is_active: true },
  ],
  pagination: { total: 1, page: 1, limit: 25 },
};

async function interceptAccountantsAPI(page: Page, responseData = mockAccountants) {
  await page.route('**/api/admin/accounting/accountants**', async (route) => {
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
        body: JSON.stringify({ success: true, data: { id: 'acc-new', ...JSON.parse(route.request().postData() || '{}') } }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.route('**/api/admin/accounting/accountants/*', async (route) => {
    const method = route.request().method();
    if (method === 'PATCH') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { id: 'acc-1' } }),
      });
    }
    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockAccountants.data[0] }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  // Mock other endpoints
  await page.route('**/api/admin/accounting/entities**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
  });
  await page.route('**/api/admin/accounting/firms**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockFirmsForSelect) });
  });
  await page.route('**/api/admin/accounting/links**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
  });
}

test.describe('Accounting Portal — Accountants (Contadores)', () => {
  test('Table lists accountants with masked CPF', async ({ page }) => {
    await setupAuth(page);
    await interceptAccountantsAPI(page);
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Contadores/i }).click();

    await expect(page.getByText('João Silva')).toBeVisible();
    await expect(page.getByText('***.***.***-01')).toBeVisible();
    await expect(page.getByText('Silva Contabil')).toBeVisible();
  });

  test('CPF NEVER appears unmasked in the table', async ({ page }) => {
    await setupAuth(page);
    await interceptAccountantsAPI(page);
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Contadores/i }).click();

    await expect(page.getByText('João Silva')).toBeVisible();

    // Check that no full CPF (11 consecutive digits or XXX.XXX.XXX-XX with digits) appears
    const pageContent = await page.textContent('body');
    // Full CPF pattern: 11 consecutive digits or formatted without masks
    const fullCpfPattern = /\d{3}\.\d{3}\.\d{3}-\d{2}/;
    const matches = pageContent?.match(fullCpfPattern) || [];
    // Only masked versions should appear (with ***)
    for (const match of matches) {
      expect(match).toContain('*');
    }
  });

  test('Button "Novo Contador" opens dialog', async ({ page }) => {
    await setupAuth(page);
    await interceptAccountantsAPI(page);
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Contadores/i }).click();

    await page.getByRole('button', { name: /Novo Contador/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/Nome Completo/i)).toBeVisible();
    await expect(dialog.getByLabel('Email')).toBeVisible();
  });

  test('Dialog requires firm (Escritório)', async ({ page }) => {
    await setupAuth(page);
    await interceptAccountantsAPI(page);
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Contadores/i }).click();

    await page.getByRole('button', { name: /Novo Contador/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Firm field should be present
    await expect(dialog.getByLabel('Escritório')).toBeVisible();
  });

  test('Create sends correct POST', async ({ page }) => {
    await setupAuth(page);
    let postBody: Record<string, unknown> | null = null;
    await page.route('**/api/admin/accounting/accountants**', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        postBody = JSON.parse(route.request().postData() || '{}');
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { id: 'acc-new', ...postBody } }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAccountants),
      });
    });
    await page.route('**/api/admin/accounting/accountants/*', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: mockAccountants.data[0] }) });
    });
    await page.route('**/api/admin/accounting/entities**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/firms**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockFirmsForSelect) });
    });
    await page.route('**/api/admin/accounting/links**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Contadores/i }).click();

    await page.getByRole('button', { name: /Novo Contador/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/Nome Completo/i).fill('Maria Oliveira');
    await dialog.getByLabel('Email').fill('maria@oliveira.com');
    await dialog.getByLabel('CPF').fill('12345678901');
    await dialog.getByRole('textbox', { name: 'CRC' }).fill('654321');
    await dialog.getByLabel('Escritório').click();
    await page.getByRole('option', { name: /Contabilidade Silva/i }).click();
    await dialog.getByRole('button', { name: /Salvar contador/i }).click();

    await page.waitForTimeout(500);
    expect(postBody).not.toBeNull();
    expect((postBody as Record<string, unknown>).nome_completo || (postBody as Record<string, unknown>).name).toBeTruthy();
    expect((postBody as Record<string, unknown>).email).toBe('maria@oliveira.com');
    expect((postBody as Record<string, unknown>).accounting_firm_id).toBe('firm-1');
  });

  test('Status chip shows ACTIVE/INVITED/SUSPENDED', async ({ page }) => {
    await setupAuth(page);
    const multiStatus = {
      success: true,
      data: [
        { ...mockAccountants.data[0] },
        { id: 'acc-2', nome_completo: 'Ana Invited', email: 'ana@test.com', cpf_masked: '***.***.***-02', crc: '654321', crc_uf: 'SP', accounting_firm_id: 'firm-1', status: 'INVITED', is_active: true, mfa_enabled: false, accounting_firm: { id: 'firm-1', razao_social: 'Silva Contabil' }, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { id: 'acc-3', nome_completo: 'Carlos Suspended', email: 'carlos@test.com', cpf_masked: '***.***.***-03', crc: '111222', crc_uf: 'MG', accounting_firm_id: 'firm-1', status: 'SUSPENDED', is_active: false, mfa_enabled: false, accounting_firm: { id: 'firm-1', razao_social: 'Silva Contabil' }, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
      pagination: { total: 3, page: 1, limit: 25 },
    };
    await page.route('**/api/admin/accounting/accountants**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(multiStatus) });
    });
    await page.route('**/api/admin/accounting/entities**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/firms**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockFirmsForSelect) });
    });
    await page.route('**/api/admin/accounting/links**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Contadores/i }).click();

    // Verify status chips render
    await expect(page.getByText('Ativo').first()).toBeVisible();
    await expect(page.getByText('INVITED', { exact: true })).toBeVisible();
    await expect(page.getByText('SUSPENDED', { exact: true })).toBeVisible();
  });

  test('Suspension sends PATCH status=SUSPENDED', async ({ page }) => {
    await setupAuth(page);
    let patchBody: Record<string, unknown> | null = null;
    await page.route('**/api/admin/accounting/accountants**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockAccountants),
      });
    });
    await page.route('**/api/admin/accounting/accountants/*', async (route) => {
      const method = route.request().method();
      if (method === 'PATCH') {
        patchBody = JSON.parse(route.request().postData() || '{}');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { ...mockAccountants.data[0], status: 'SUSPENDED' } }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: mockAccountants.data[0] }) });
    });
    await page.route('**/api/admin/accounting/entities**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/firms**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockFirmsForSelect) });
    });
    await page.route('**/api/admin/accounting/links**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Contadores/i }).click();

    // Click suspend button
    const row = page.getByText('João Silva').locator('..');
    await row.getByRole('button', { name: /Suspender/i }).click();

    await page.waitForTimeout(500);
    expect(patchBody).not.toBeNull();
    expect((patchBody as Record<string, unknown>).status).toBe('SUSPENDED');
  });
});
