/**
 * E2E: Accounting Portal — Entity Links (Vínculos)
 * CRUD operations, permission checkboxes, scope, revocation.
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

const mockLinks = {
  success: true,
  data: [
    { id: 'link-1', accountant_id: 'acc-1', legal_entity_id: 'ent-1', scope: 'COMPLETO', can_view: true, can_upload: true, can_download: true, can_request_correction: true, can_mark_processed: true, can_close_period: false, inherits_children: true, starts_at: '2026-01-01T00:00:00Z', ends_at: null, status: 'ACTIVE', accountant: { id: 'acc-1', nome_completo: 'João Silva' }, legal_entity: { id: 'ent-1', razao_social: 'KAVIAR TECNOLOGIA', entity_type: 'MATRIZ' }, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
  pagination: { total: 1, page: 1, limit: 25 },
};

const mockEntitiesForSelect = {
  success: true,
  data: [
    { id: 'ent-1', razao_social: 'KAVIAR TECNOLOGIA LTDA', cnpj: '67783601000199', entity_type: 'MATRIZ', is_active: true },
    { id: 'ent-2', razao_social: 'KAVIAR SP LTDA', cnpj: '67783601000280', entity_type: 'FILIAL', parent_entity_id: 'ent-1', is_active: true },
  ],
  pagination: { total: 2, page: 1, limit: 25 },
};

const mockAccountantsForSelect = {
  success: true,
  data: [
    { id: 'acc-1', nome_completo: 'João Silva', email: 'joao@silva.com', firm: { id: 'firm-1', razao_social: 'Silva Contabil' } },
  ],
  pagination: { total: 1, page: 1, limit: 25 },
};

async function interceptLinksAPI(page: Page, responseData = mockLinks) {
  await page.route('**/api/admin/accounting/links**', async (route) => {
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
        body: JSON.stringify({ success: true, data: { id: 'link-new', ...JSON.parse(route.request().postData() || '{}') } }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.route('**/api/admin/accounting/links/*', async (route) => {
    const method = route.request().method();
    if (method === 'PATCH') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { id: 'link-1' } }),
      });
    }
    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockLinks.data[0] }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  // Mock other endpoints
  await page.route('**/api/admin/accounting/entities**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockEntitiesForSelect) });
  });
  await page.route('**/api/admin/accounting/firms**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
  });
  await page.route('**/api/admin/accounting/accountants**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAccountantsForSelect) });
  });
}

test.describe('Accounting Portal — Links (Vínculos)', () => {
  test('Table lists links with scope and permissions', async ({ page }) => {
    await setupAuth(page);
    await interceptLinksAPI(page);
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Vínculos/i }).click();

    await expect(page.getByText('João Silva')).toBeVisible();
    await expect(page.getByText('KAVIAR TECNOLOGIA')).toBeVisible();
    await expect(page.getByText(/COMPLETO/i)).toBeVisible();
  });

  test('Button "Novo Vínculo" opens dialog', async ({ page }) => {
    await setupAuth(page);
    await interceptLinksAPI(page);
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Vínculos/i }).click();

    await page.getByRole('button', { name: /Novo Vínculo/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Membro da equipe')).toBeVisible();
    await expect(dialog.getByLabel('Empresa')).toBeVisible();
  });

  test('Dialog shows permission checkboxes', async ({ page }) => {
    await setupAuth(page);
    await interceptLinksAPI(page);
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Vínculos/i }).click();

    await page.getByRole('button', { name: /Novo Vínculo/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Permission checkboxes use the actual PT-BR labels
    await expect(dialog.getByLabel('Visualizar')).toBeVisible();
    await expect(dialog.getByLabel('Enviar documentos')).toBeVisible();
    await expect(dialog.getByLabel('Baixar documentos')).toBeVisible();
    await expect(dialog.getByLabel('Solicitar correção')).toBeVisible();
    await expect(dialog.getByLabel('Marcar processado')).toBeVisible();
    await expect(dialog.getByLabel('Concluir competência')).toBeVisible();
  });

  test('inherits_children checkbox is present in dialog', async ({ page }) => {
    await setupAuth(page);
    await interceptLinksAPI(page);
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Vínculos/i }).click();

    await page.getByRole('button', { name: /Novo Vínculo/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // inherits_children checkbox should be present
    await expect(dialog.getByLabel(/Herdar para filiais/i)).toBeVisible();
  });

  test('Create sends correct POST', async ({ page }) => {
    await setupAuth(page);
    let postBody: Record<string, unknown> | null = null;
    await page.route('**/api/admin/accounting/links**', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        postBody = JSON.parse(route.request().postData() || '{}');
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { id: 'link-new', ...postBody } }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockLinks),
      });
    });
    await page.route('**/api/admin/accounting/links/*', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: mockLinks.data[0] }) });
    });
    await page.route('**/api/admin/accounting/entities**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockEntitiesForSelect) });
    });
    await page.route('**/api/admin/accounting/firms**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/accountants**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAccountantsForSelect) });
    });
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Vínculos/i }).click();

    await page.getByRole('button', { name: /Novo Vínculo/i }).click();
    const dialog = page.getByRole('dialog');

    // Select accountant
    await dialog.getByLabel('Membro da equipe').click();
    await page.getByRole('option', { name: /João Silva/i }).click();

    // Select entity
    await dialog.getByLabel('Empresa').click();
    await page.getByRole('option', { name: /KAVIAR TECNOLOGIA/i }).click();

    // Set scope (default is COMPLETO, change to FISCAL)
    await dialog.getByLabel('Escopo').click();
    await page.getByRole('option', { name: 'FISCAL' }).click();

    // Toggle permissions — can_view is true by default, enable can_upload
    await dialog.getByLabel('Enviar documentos').check();

    await dialog.getByRole('button', { name: /Salvar vínculo/i }).click();

    await page.waitForTimeout(500);
    expect(postBody).not.toBeNull();
    expect((postBody as Record<string, unknown>).accountant_id).toBe('acc-1');
    expect((postBody as Record<string, unknown>).legal_entity_id).toBe('ent-1');
    expect((postBody as Record<string, unknown>).scope).toBe('FISCAL');
    expect((postBody as Record<string, unknown>).can_view).toBe(true);
    expect((postBody as Record<string, unknown>).can_upload).toBe(true);
  });

  test('Status chip shows ACTIVE/SUSPENDED/REVOKED', async ({ page }) => {
    await setupAuth(page);
    const multiStatusLinks = {
      success: true,
      data: [
        { ...mockLinks.data[0] },
        { id: 'link-2', accountant_id: 'acc-1', legal_entity_id: 'ent-2', scope: 'FISCAL', can_view: true, can_upload: false, can_download: true, can_request_correction: false, can_mark_processed: false, can_close_period: false, inherits_children: false, starts_at: '2026-01-01T00:00:00Z', ends_at: null, status: 'SUSPENDED', accountant: { id: 'acc-1', nome_completo: 'João Silva' }, legal_entity: { id: 'ent-2', razao_social: 'KAVIAR SP', entity_type: 'FILIAL' }, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
        { id: 'link-3', accountant_id: 'acc-1', legal_entity_id: 'ent-1', scope: 'CONTABIL', can_view: true, can_upload: false, can_download: false, can_request_correction: false, can_mark_processed: false, can_close_period: false, inherits_children: false, starts_at: '2025-01-01T00:00:00Z', ends_at: '2025-12-31T00:00:00Z', status: 'REVOKED', accountant: { id: 'acc-1', nome_completo: 'João Silva' }, legal_entity: { id: 'ent-1', razao_social: 'KAVIAR TECNOLOGIA', entity_type: 'MATRIZ' }, created_at: '2025-01-01T00:00:00Z', updated_at: '2025-12-31T00:00:00Z' },
      ],
      pagination: { total: 3, page: 1, limit: 25 },
    };
    await page.route('**/api/admin/accounting/links**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(multiStatusLinks) });
    });
    await page.route('**/api/admin/accounting/entities**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockEntitiesForSelect) });
    });
    await page.route('**/api/admin/accounting/firms**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/accountants**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAccountantsForSelect) });
    });
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Vínculos/i }).click();

    await expect(page.getByText('Ativo').first()).toBeVisible();
    await expect(page.getByText('SUSPENDED')).toBeVisible();
    await expect(page.getByText('REVOKED')).toBeVisible();
  });

  test('Revocation sends PATCH status=REVOKED', async ({ page }) => {
    await setupAuth(page);
    let patchBody: Record<string, unknown> | null = null;
    await page.route('**/api/admin/accounting/links**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockLinks),
      });
    });
    await page.route('**/api/admin/accounting/links/*', async (route) => {
      const method = route.request().method();
      if (method === 'PATCH') {
        patchBody = JSON.parse(route.request().postData() || '{}');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { ...mockLinks.data[0], status: 'REVOKED' } }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: mockLinks.data[0] }) });
    });
    await page.route('**/api/admin/accounting/entities**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockEntitiesForSelect) });
    });
    await page.route('**/api/admin/accounting/firms**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/accountants**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAccountantsForSelect) });
    });
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Vínculos/i }).click();

    // Click revoke button
    const row = page.getByText('João Silva').locator('..');
    await row.getByRole('button', { name: /Revogar/i }).click();

    await page.waitForTimeout(500);
    expect(patchBody).not.toBeNull();
    expect((patchBody as Record<string, unknown>).status).toBe('REVOKED');
  });
});
