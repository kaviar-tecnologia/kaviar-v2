import { test, expect } from 'playwright/test';

test.describe('Accountant Session & Protected Route', () => {
  test('protected route without session redirects to login', async ({ page }) => {
    await page.route('**/api/accountant/auth/refresh', (route) =>
      route.fulfill({ status: 401, body: '{}', contentType: 'application/json' })
    );

    await page.goto('/contador');
    await expect(page).toHaveURL(/\/contador\/login/);
  });

  test('protected route with valid session shows portal', async ({ page }) => {
    await page.route('**/api/accountant/auth/refresh', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, data: { accessToken: 'mock-access-token' } }),
        contentType: 'application/json',
      })
    );
    await page.route('**/api/accountant/auth/me', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, data: { id: 1, name: 'Maria CPA', email: 'maria@firma.com' } }),
        contentType: 'application/json',
      })
    );

    await page.goto('/contador');
    await expect(page.getByText('Portal do Contador KAVIAR')).toBeVisible();
    await expect(page.getByText('Maria CPA')).toBeVisible();
    await expect(page.getByText('maria@firma.com')).toBeVisible();
  });

  test('logout clears session and redirects to login', async ({ page }) => {
    await page.route('**/api/accountant/auth/refresh', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, data: { accessToken: 'mock-access-token' } }),
        contentType: 'application/json',
      })
    );
    await page.route('**/api/accountant/auth/me', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, data: { id: 1, name: 'Maria CPA', email: 'maria@firma.com' } }),
        contentType: 'application/json',
      })
    );

    await page.goto('/contador');
    await expect(page.getByText('Portal do Contador KAVIAR')).toBeVisible();

    // Mock logout endpoint
    await page.route('**/api/accountant/auth/logout', (route) =>
      route.fulfill({ status: 200, body: JSON.stringify({ success: true }), contentType: 'application/json' })
    );

    // After logout, refresh should return 401
    await page.unroute('**/api/accountant/auth/refresh');
    await page.route('**/api/accountant/auth/refresh', (route) =>
      route.fulfill({ status: 401, body: '{}', contentType: 'application/json' })
    );

    await page.getByRole('button', { name: 'Sair' }).click();
    await expect(page).toHaveURL(/\/contador\/login/);
  });

  test('403 shows forbidden message', async ({ page }) => {
    await page.route('**/api/accountant/auth/refresh', (route) =>
      route.fulfill({
        status: 403,
        body: JSON.stringify({ error: 'Forbidden' }),
        contentType: 'application/json',
      })
    );

    await page.goto('/contador');
    await expect(page.getByText('Acesso indisponível')).toBeVisible();
  });

  test('423 shows locked message', async ({ page }) => {
    await page.route('**/api/accountant/auth/refresh', (route) =>
      route.fulfill({
        status: 423,
        body: JSON.stringify({ error: 'Account locked' }),
        contentType: 'application/json',
      })
    );

    await page.goto('/contador');
    await expect(page.getByText('Conta bloqueada')).toBeVisible();
  });

  test('no token in localStorage or sessionStorage after auth', async ({ page }) => {
    await page.route('**/api/accountant/auth/refresh', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, data: { accessToken: 'secret-jwt-token' } }),
        contentType: 'application/json',
      })
    );
    await page.route('**/api/accountant/auth/me', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, data: { id: 1, name: 'Test', email: 'test@test.com' } }),
        contentType: 'application/json',
      })
    );

    await page.goto('/contador');
    await expect(page.getByText('Portal do Contador KAVIAR')).toBeVisible();

    const localStorage = await page.evaluate(() => JSON.stringify(window.localStorage));
    const sessionStorage = await page.evaluate(() => JSON.stringify(window.sessionStorage));

    expect(localStorage).not.toContain('secret-jwt-token');
    expect(sessionStorage).not.toContain('secret-jwt-token');
    expect(localStorage).not.toContain('accessToken');
    expect(sessionStorage).not.toContain('accessToken');
  });

  test('page reload recovers session via cookie', async ({ page }) => {
    await page.route('**/api/accountant/auth/refresh', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, data: { accessToken: 'mock-access-token' } }),
        contentType: 'application/json',
      })
    );
    await page.route('**/api/accountant/auth/me', (route) =>
      route.fulfill({
        status: 200,
        body: JSON.stringify({ success: true, data: { id: 1, name: 'Maria CPA', email: 'maria@firma.com' } }),
        contentType: 'application/json',
      })
    );

    await page.goto('/contador');
    await expect(page.getByText('Portal do Contador KAVIAR')).toBeVisible();

    // Reload page — routes persist, session should recover via refresh cookie
    await page.reload();
    await expect(page.getByText('Portal do Contador KAVIAR')).toBeVisible();
  });

  test('admin token does not work for /contador', async ({ page }) => {
    // Set admin token in localStorage before navigating
    await page.goto('/');
    await page.evaluate(() => {
      window.localStorage.setItem('token', 'admin-jwt-token');
      window.localStorage.setItem('adminToken', 'admin-jwt-token');
    });

    // Accountant refresh returns 401 — admin token is useless for accountant auth
    await page.route('**/api/accountant/auth/refresh', (route) =>
      route.fulfill({ status: 401, body: '{}', contentType: 'application/json' })
    );

    await page.goto('/contador');
    await expect(page).toHaveURL(/\/contador\/login/);
  });
});
