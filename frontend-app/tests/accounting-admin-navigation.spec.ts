/**
 * E2E: Accounting Portal — Navigation & Access Control
 * Validates menu visibility, route access by role, and tab structure.
 */
import { test, expect } from 'playwright/test';
import type { Page } from 'playwright/test';

const ADMIN_TOKEN = 'test-admin-token-mock';
const SA_DATA = JSON.stringify({ id: 'admin-1', name: 'Admin', email: 'admin@kaviar.com', role: 'SUPER_ADMIN' });
const FINANCE_DATA = JSON.stringify({ id: 'fin-1', name: 'Finance', email: 'fin@kaviar.com', role: 'FINANCE' });

async function setupAuth(page: Page, data = SA_DATA) {
  await page.addInitScript(({ token, adminData }) => {
    localStorage.setItem('kaviar_admin_token', token);
    localStorage.setItem('kaviar_admin_data', adminData);
  }, { token: ADMIN_TOKEN, adminData: data });
}

async function interceptAccountingAPIs(page: Page) {
  await page.route('**/api/admin/accounting/**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }),
    });
  });
  await page.route('**/api/admin/accounting/setup-progress**', async (route) => {
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: { percentage: 100, steps: { entity: true, firm: true, accountant: true, link: true, invite: true, activation: true }, nextStep: 'COMPLETE' },
      }),
    });
  });
}

test.describe('Accounting Portal — Navigation', () => {
  test('SUPER_ADMIN sees "Portal do Contador" link in menu', async ({ page }) => {
    await setupAuth(page, SA_DATA);
    await interceptAccountingAPIs(page);
    await page.goto('/admin');
    await expect(page.getByText('Portal do Contador')).toBeVisible();
  });

  test('FINANCE does NOT see "Portal do Contador" link in menu', async ({ page }) => {
    await setupAuth(page, FINANCE_DATA);
    await interceptAccountingAPIs(page);
    await page.route('**/api/admin/finance/**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }),
      });
    });
    await page.goto('/admin');
    await expect(page.getByText('Portal do Contador')).not.toBeVisible();
  });

  test('SUPER_ADMIN accesses /admin/portal-contador successfully', async ({ page }) => {
    await setupAuth(page, SA_DATA);
    await interceptAccountingAPIs(page);
    await page.goto('/admin/portal-contador');
    await expect(page).toHaveURL(/portal-contador/);
    await expect(page.getByRole('tab', { name: /Empresas/i })).toBeVisible();
  });

  test('FINANCE is redirected when trying /admin/portal-contador', async ({ page }) => {
    await setupAuth(page, FINANCE_DATA);
    await interceptAccountingAPIs(page);
    await page.route('**/api/admin/finance/**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }),
      });
    });
    await page.goto('/admin/portal-contador');
    await page.waitForURL(/\/admin(?!\/portal-contador)/);
    await expect(page).not.toHaveURL(/portal-contador/);
  });

  test('Page shows 4 tabs: Empresas, Escritórios, Equipe, Vínculos', async ({ page }) => {
    await setupAuth(page, SA_DATA);
    await interceptAccountingAPIs(page);
    await page.goto('/admin/portal-contador');
    await expect(page.getByRole('tab', { name: /Empresas/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Escritórios/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Equipe/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Vínculos/i })).toBeVisible();
  });

  test('Unauthenticated user is redirected to login', async ({ page }) => {
    await interceptAccountingAPIs(page);
    await page.goto('/admin/portal-contador');
    await page.waitForURL(/\/login|\/admin\/login/);
    await expect(page).toHaveURL(/login/);
  });
});
