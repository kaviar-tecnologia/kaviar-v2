/**
 * E2E: Accounting Portal — Legal Entities (Empresas)
 * CRUD operations, filtering, CNPJ formatting, status chips.
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

const mockEntities = {
  success: true,
  data: [
    { id: 'ent-1', razao_social: 'KAVIAR TECNOLOGIA LTDA', cnpj: '67783601000199', entity_type: 'MATRIZ', parent_entity_id: null, uf: 'RJ', municipio: 'Rio de Janeiro', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
    { id: 'ent-2', razao_social: 'KAVIAR SP LTDA', cnpj: '67783601000280', entity_type: 'FILIAL', parent_entity_id: 'ent-1', uf: 'SP', municipio: 'São Paulo', is_active: true, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
  pagination: { total: 2, page: 1, limit: 25 },
};

const mockInactiveEntity = {
  success: true,
  data: [
    { id: 'ent-3', razao_social: 'EMPRESA INATIVA', cnpj: '11222333000144', entity_type: 'MATRIZ', parent_entity_id: null, uf: 'MG', municipio: 'Belo Horizonte', is_active: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
  ],
  pagination: { total: 1, page: 1, limit: 25 },
};

async function interceptEntitiesAPI(page: Page, responseData = mockEntities) {
  await page.route('**/api/admin/accounting/entities**', async (route) => {
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
        body: JSON.stringify({ success: true, data: { id: 'ent-new', ...JSON.parse(route.request().postData() || '{}') } }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  await page.route('**/api/admin/accounting/entities/*', async (route) => {
    const method = route.request().method();
    if (method === 'PATCH' || method === 'PUT') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { id: 'ent-1' } }),
      });
    }
    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockEntities.data[0] }),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });
  // Mock other accounting endpoints to avoid errors
  await page.route('**/api/admin/accounting/firms**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
  });
  await page.route('**/api/admin/accounting/accountants**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
  });
  await page.route('**/api/admin/accounting/links**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
  });
}

test.describe('Accounting Portal — Entities (Empresas)', () => {
  test('Table lists entities with formatted CNPJ', async ({ page }) => {
    await setupAuth(page);
    await interceptEntitiesAPI(page);
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Empresas/i }).click();

    await expect(page.getByText('KAVIAR TECNOLOGIA LTDA')).toBeVisible();
    await expect(page.getByText('KAVIAR SP LTDA')).toBeVisible();
    // CNPJ 67783601000199 formatted as 67.783.601/0001-99
    await expect(page.getByText('67.783.601/0001-99')).toBeVisible();
    await expect(page.getByText('67.783.601/0002-80')).toBeVisible();
  });

  test('Filter by type (MATRIZ/FILIAL) works', async ({ page }) => {
    await setupAuth(page);
    let filterValue = '';
    await page.route('**/api/admin/accounting/entities**', async (route) => {
      const url = new URL(route.request().url());
      filterValue = url.searchParams.get('entity_type') || '';
      const filtered = mockEntities.data.filter(e =>
        !filterValue || e.entity_type === filterValue
      );
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: filtered, pagination: { total: filtered.length, page: 1, limit: 25 } }),
      });
    });
    await page.route('**/api/admin/accounting/firms**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/accountants**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/links**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Empresas/i }).click();

    // Select MATRIZ filter
    await page.getByLabel(/Tipo/i).click();
    await page.getByRole('option', { name: /MATRIZ/i }).click();

    await expect(page.getByText('KAVIAR TECNOLOGIA LTDA')).toBeVisible();
  });

  test('Button "Nova Empresa" opens dialog', async ({ page }) => {
    await setupAuth(page);
    await interceptEntitiesAPI(page);
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Empresas/i }).click();

    await page.getByRole('button', { name: /Nova Empresa/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel(/Razão Social/i)).toBeVisible();
    await expect(page.getByLabel(/CNPJ/i)).toBeVisible();
  });

  test('Create dialog: FILIAL shows parent entity selector', async ({ page }) => {
    await setupAuth(page);
    await interceptEntitiesAPI(page);
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Empresas/i }).click();

    await page.getByRole('button', { name: /Nova Empresa/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Select FILIAL type
    await page.getByLabel(/Tipo/i).click();
    await page.getByRole('option', { name: /FILIAL/i }).click();

    // Parent entity selector should appear
    await expect(page.getByLabel(/Matriz/i)).toBeVisible();
  });

  test('Create dialog: CNPJ validation (14 digits)', async ({ page }) => {
    await setupAuth(page);
    await interceptEntitiesAPI(page);
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Empresas/i }).click();

    await page.getByRole('button', { name: /Nova Empresa/i }).click();

    // Fill with invalid CNPJ (less than 14 digits)
    await page.getByLabel(/CNPJ/i).fill('1234567');
    await page.getByLabel(/Razão Social/i).fill('Test Entity');
    await page.getByRole('button', { name: /Salvar|Criar|Confirmar/i }).click();

    // Expect validation error
    await expect(page.getByText(/CNPJ.*14|inválido|dígitos/i)).toBeVisible();
  });

  test('Create sends correct POST', async ({ page }) => {
    await setupAuth(page);
    let postBody: Record<string, unknown> | null = null;
    await page.route('**/api/admin/accounting/entities**', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        postBody = JSON.parse(route.request().postData() || '{}');
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { id: 'ent-new', ...postBody } }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockEntities),
      });
    });
    await page.route('**/api/admin/accounting/entities/*', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: mockEntities.data[0] }) });
    });
    await page.route('**/api/admin/accounting/firms**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/accountants**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/links**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Empresas/i }).click();

    await page.getByRole('button', { name: /Nova Empresa/i }).click();
    await page.getByLabel(/Razão Social/i).fill('Nova Empresa LTDA');
    await page.getByLabel(/CNPJ/i).fill('12345678000195');
    await page.getByLabel(/UF/i).fill('RJ');
    await page.getByLabel(/Município/i).fill('Rio de Janeiro');
    await page.getByRole('button', { name: /Salvar|Criar|Confirmar/i }).click();

    // Wait for POST to be captured
    await page.waitForTimeout(500);
    expect(postBody).not.toBeNull();
    expect((postBody as Record<string, unknown>).razao_social).toBe('Nova Empresa LTDA');
    expect((postBody as Record<string, unknown>).cnpj).toContain('12345678000195');
  });

  test('Edit opens dialog with pre-filled data', async ({ page }) => {
    await setupAuth(page);
    await interceptEntitiesAPI(page);
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Empresas/i }).click();

    // Click edit on first entity
    const firstRow = page.getByText('KAVIAR TECNOLOGIA LTDA').locator('..');
    await firstRow.getByRole('button', { name: /Editar|Edit/i }).click();

    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel(/Razão Social/i)).toHaveValue('KAVIAR TECNOLOGIA LTDA');
  });

  test('Deactivation sends PATCH is_active=false', async ({ page }) => {
    await setupAuth(page);
    let patchBody: Record<string, unknown> | null = null;
    await page.route('**/api/admin/accounting/entities**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockEntities),
      });
    });
    await page.route('**/api/admin/accounting/entities/*', async (route) => {
      const method = route.request().method();
      if (method === 'PATCH') {
        patchBody = JSON.parse(route.request().postData() || '{}');
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, data: { ...mockEntities.data[0], is_active: false } }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: mockEntities.data[0] }) });
    });
    await page.route('**/api/admin/accounting/firms**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/accountants**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/links**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Empresas/i }).click();

    // Click deactivate button
    const firstRow = page.getByText('KAVIAR TECNOLOGIA LTDA').locator('..');
    await firstRow.getByRole('button', { name: /Desativar|Inativar/i }).click();

    // Confirm dialog if present
    const confirmBtn = page.getByRole('button', { name: /Confirmar|Sim/i });
    if (await confirmBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await confirmBtn.click();
    }

    await page.waitForTimeout(500);
    expect(patchBody).not.toBeNull();
    expect((patchBody as Record<string, unknown>).is_active).toBe(false);
  });

  test('Status chip shows "Ativo"/"Inativo" based on is_active', async ({ page }) => {
    await setupAuth(page);
    const mixedEntities = {
      success: true,
      data: [
        ...mockEntities.data,
        { id: 'ent-3', razao_social: 'EMPRESA INATIVA', cnpj: '11222333000144', entity_type: 'MATRIZ', parent_entity_id: null, uf: 'MG', municipio: 'Belo Horizonte', is_active: false, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      ],
      pagination: { total: 3, page: 1, limit: 25 },
    };
    await page.route('**/api/admin/accounting/entities**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mixedEntities) });
    });
    await page.route('**/api/admin/accounting/firms**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/accountants**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/links**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.goto('/admin/portal-contador');
    await page.getByRole('tab', { name: /Empresas/i }).click();

    await expect(page.getByText('Ativo')).toBeVisible();
    await expect(page.getByText('Inativo')).toBeVisible();
  });
});
