/**
 * E2E: Accounting Portal — Entity Links (Vínculos)
 * CRUD operations, permission checkboxes, scope, revocation.
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
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel(/Contador/i)).toBeVisible();
    await expect(page.getByLabel(/Empresa|Entidade/i)).toBeVisible();
  });

  test('Dialog shows permission checkboxes', async ({ page }) => {
    await setupAuth(page);
    await interceptLinksAPI(page);
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Vínculos/i }).click();

    await page.getByRole('button', { name: /Novo Vínculo/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Permission checkboxes
    await expect(page.getByRole('checkbox', { name: /Visualizar|can_view/i })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Upload|can_upload/i })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Download|can_download/i })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Correção|can_request_correction/i })).toBeVisible();
    await expect(page.getByRole('checkbox', { name: /Processar|can_mark_processed/i })).toBeVisible();
  });

  test('inherits_children only visible for MATRIZ entity', async ({ page }) => {
    await setupAuth(page);
    await interceptLinksAPI(page);
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Vínculos/i }).click();

    await page.getByRole('button', { name: /Novo Vínculo/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Select MATRIZ entity
    await page.getByLabel(/Empresa|Entidade/i).click();
    await page.getByRole('option', { name: /KAVIAR TECNOLOGIA/i }).click();

    // inherits_children checkbox should appear for MATRIZ
    await expect(page.getByRole('checkbox', { name: /Herdar.*filiais|inherits_children|Filiais/i })).toBeVisible();

    // Now select FILIAL entity - inherits_children should not be visible
    await page.getByLabel(/Empresa|Entidade/i).click();
    await page.getByRole('option', { name: /KAVIAR SP/i }).click();

    await expect(page.getByRole('checkbox', { name: /Herdar.*filiais|inherits_children|Filiais/i })).not.toBeVisible();
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

    // Select accountant
    await page.getByLabel(/Contador/i).click();
    await page.getByRole('option', { name: /João Silva/i }).click();

    // Select entity
    await page.getByLabel(/Empresa|Entidade/i).click();
    await page.getByRole('option', { name: /KAVIAR TECNOLOGIA/i }).click();

    // Set scope
    await page.getByLabel(/Escopo|Scope/i).click();
    await page.getByRole('option', { name: /COMPLETO/i }).click();

    // Check permissions
    await page.getByRole('checkbox', { name: /Visualizar|can_view/i }).check();
    await page.getByRole('checkbox', { name: /Upload|can_upload/i }).check();
    await page.getByRole('checkbox', { name: /Download|can_download/i }).check();

    await page.getByRole('button', { name: /Salvar|Criar|Confirmar/i }).click();

    await page.waitForTimeout(500);
    expect(postBody).not.toBeNull();
    expect((postBody as Record<string, unknown>).accountant_id).toBe('acc-1');
    expect((postBody as Record<string, unknown>).legal_entity_id).toBe('ent-1');
    expect((postBody as Record<string, unknown>).scope).toBe('COMPLETO');
    expect((postBody as Record<string, unknown>).can_view).toBe(true);
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

    await expect(page.getByText(/Active|Ativo/i).first()).toBeVisible();
    await expect(page.getByText(/Suspended|Suspenso/i)).toBeVisible();
    await expect(page.getByText(/Revoked|Revogado/i)).toBeVisible();
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
    await row.getByRole('button', { name: /Revogar|Revoke/i }).click();

    // Confirm if dialog appears
    const confirmBtn = page.getByRole('button', { name: /Confirmar|Sim/i });
    if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await page.waitForTimeout(500);
    expect(patchBody).not.toBeNull();
    expect((patchBody as Record<string, unknown>).status).toBe('REVOKED');
  });
});
