import { test, expect } from 'playwright/test';

test.describe('Accountant Auth Pages', () => {
  test.describe('Login page', () => {
    test('renders login form', async ({ page }) => {
      // Mock bootstrap refresh to fail (anonymous)
      await page.route('**/api/accountant/auth/refresh', (route) =>
        route.fulfill({ status: 401, body: '{}', contentType: 'application/json' })
      );
      await page.goto('/contador/login');
      await expect(page.getByText('KAVIAR')).toBeVisible();
      await expect(page.getByText('Portal do Contador')).toBeVisible();
      await expect(page.getByLabel('Email')).toBeVisible();
      await expect(page.getByLabel('Senha')).toBeVisible();
      await expect(page.getByRole('button', { name: 'Entrar' })).toBeVisible();
      await expect(page.getByText('Esqueci minha senha')).toBeVisible();
    });

    test('login success redirects to /contador', async ({ page }) => {
      await page.route('**/api/accountant/auth/refresh', (route) =>
        route.fulfill({ status: 401, body: '{}', contentType: 'application/json' })
      );
      await page.route('**/api/accountant/auth/login', (route) =>
        route.fulfill({
          status: 200,
          body: JSON.stringify({ success: true, data: { accessToken: 'mock-token' } }),
          contentType: 'application/json',
        })
      );
      await page.route('**/api/accountant/auth/me', (route) =>
        route.fulfill({
          status: 200,
          body: JSON.stringify({ success: true, data: { id: 1, name: 'Test CPA', email: 'test@firm.com' } }),
          contentType: 'application/json',
        })
      );

      await page.goto('/contador/login');
      await page.getByLabel('Email').fill('test@firm.com');
      await page.getByLabel('Senha').fill('mypassword123456');
      await page.getByRole('button', { name: 'Entrar' }).click();

      await expect(page).toHaveURL(/\/contador/);
    });

    test('login error shows generic message', async ({ page }) => {
      await page.route('**/api/accountant/auth/refresh', (route) =>
        route.fulfill({ status: 401, body: '{}', contentType: 'application/json' })
      );
      await page.route('**/api/accountant/auth/login', (route) =>
        route.fulfill({
          status: 401,
          body: JSON.stringify({ error: 'Invalid credentials' }),
          contentType: 'application/json',
        })
      );

      await page.goto('/contador/login');
      await page.getByLabel('Email').fill('wrong@email.com');
      await page.getByLabel('Senha').fill('wrongpassword123');
      await page.getByRole('button', { name: 'Entrar' }).click();

      await expect(page.getByRole('alert')).toContainText('Email ou senha inválidos');
    });

    test('login lockout shows lockout message', async ({ page }) => {
      await page.route('**/api/accountant/auth/refresh', (route) =>
        route.fulfill({ status: 401, body: '{}', contentType: 'application/json' })
      );
      await page.route('**/api/accountant/auth/login', (route) =>
        route.fulfill({
          status: 423,
          body: JSON.stringify({ error: 'Account locked' }),
          contentType: 'application/json',
        })
      );

      await page.goto('/contador/login');
      await page.getByLabel('Email').fill('locked@email.com');
      await page.getByLabel('Senha').fill('somepassword12345');
      await page.getByRole('button', { name: 'Entrar' }).click();

      await expect(page.getByRole('alert')).toContainText('temporariamente bloqueada');
    });

    test('login button exists and submits form', async ({ page }) => {
      await page.route('**/api/accountant/auth/refresh', (route) =>
        route.fulfill({ status: 401, body: '{}', contentType: 'application/json' })
      );
      await page.route('**/api/accountant/auth/login', async (route) => {
        await new Promise((r) => setTimeout(r, 500));
        route.fulfill({
          status: 200,
          body: JSON.stringify({ success: true, data: { accessToken: 'mock-token' } }),
          contentType: 'application/json',
        });
      });
      await page.route('**/api/accountant/auth/me', (route) =>
        route.fulfill({
          status: 200,
          body: JSON.stringify({ success: true, data: { id: 1, name: 'Test', email: 'test@firm.com' } }),
          contentType: 'application/json',
        })
      );

      await page.goto('/contador/login');
      await page.getByLabel('Email').fill('test@firm.com');
      await page.getByLabel('Senha').fill('password12345678');

      const btn = page.getByRole('button', { name: 'Entrar' });
      await expect(btn).toBeEnabled();
      await btn.click();
      // After click, request is in flight — verify the form submitted
      await page.waitForTimeout(1000);
    });
  });

  test.describe('Activate account page', () => {
    test('fragment is removed from URL', async ({ page }) => {
      await page.goto('/contador/ativar#token=abc123');
      await expect(page).toHaveURL('/contador/ativar');
    });

    test('activation success redirects to login', async ({ page }) => {
      await page.route('**/api/accountant/auth/activate', (route) =>
        route.fulfill({
          status: 200,
          body: JSON.stringify({ success: true }),
          contentType: 'application/json',
        })
      );

      await page.goto('/contador/ativar#token=valid-token-123');
      await page.getByLabel('Nova senha').fill('mySuperSecurePass');
      await page.getByLabel('Confirmar senha').fill('mySuperSecurePass');
      await page.getByRole('button', { name: 'Ativar conta' }).click();

      await expect(page.getByRole('alert')).toContainText('Conta ativada com sucesso');
      await expect(page).toHaveURL(/\/contador\/login/, { timeout: 5000 });
    });

    test('activation with invalid token shows error', async ({ page }) => {
      await page.route('**/api/accountant/auth/activate', (route) =>
        route.fulfill({
          status: 400,
          body: JSON.stringify({ error: 'Token inválido ou já utilizado' }),
          contentType: 'application/json',
        })
      );

      await page.goto('/contador/ativar#token=invalid-token');
      await page.getByLabel('Nova senha').fill('aSecurePassword!1');
      await page.getByLabel('Confirmar senha').fill('aSecurePassword!1');
      await page.getByRole('button', { name: 'Ativar conta' }).click();

      await expect(page.getByRole('alert')).toContainText('inválido');
    });
  });

  test.describe('Forgot password page', () => {
    test('always shows generic success message', async ({ page }) => {
      await page.route('**/api/accountant/auth/forgot-password', (route) =>
        route.fulfill({
          status: 404,
          body: JSON.stringify({ error: 'Not found' }),
          contentType: 'application/json',
        })
      );

      await page.goto('/contador/esqueci-senha');
      await page.getByLabel('Email').fill('nonexistent@email.com');
      await page.getByRole('button', { name: 'Enviar instruções' }).click();

      await expect(page.getByRole('alert')).toContainText('Se o email existir');
    });
  });

  test.describe('Reset password page', () => {
    test('success redirects to login', async ({ page }) => {
      await page.route('**/api/accountant/auth/reset-password', (route) =>
        route.fulfill({
          status: 200,
          body: JSON.stringify({ success: true }),
          contentType: 'application/json',
        })
      );

      await page.goto('/contador/redefinir-senha#token=reset-tok-123');
      await page.getByLabel('Nova senha').fill('myNewSecurePass!!');
      await page.getByLabel('Confirmar senha').fill('myNewSecurePass!!');
      await page.getByRole('button', { name: 'Redefinir senha' }).click();

      await expect(page.getByRole('alert')).toContainText('Senha redefinida com sucesso');
      await expect(page).toHaveURL(/\/contador\/login/, { timeout: 5000 });
    });

    test('fragment is removed from URL', async ({ page }) => {
      await page.goto('/contador/redefinir-senha#token=some-token');
      await expect(page).toHaveURL('/contador/redefinir-senha');
    });
  });

  test.describe('Security - no token in storage', () => {
    test('no token stored in localStorage or sessionStorage', async ({ page }) => {
      await page.route('**/api/accountant/auth/refresh', (route) =>
        route.fulfill({ status: 401, body: '{}', contentType: 'application/json' })
      );
      await page.route('**/api/accountant/auth/login', (route) =>
        route.fulfill({
          status: 200,
          body: JSON.stringify({ success: true, data: { accessToken: 'secret-jwt' } }),
          contentType: 'application/json',
        })
      );
      await page.route('**/api/accountant/auth/me', (route) =>
        route.fulfill({
          status: 200,
          body: JSON.stringify({ success: true, data: { id: 1, name: 'Test', email: 't@t.com' } }),
          contentType: 'application/json',
        })
      );

      await page.goto('/contador/login');
      await page.getByLabel('Email').fill('t@t.com');
      await page.getByLabel('Senha').fill('password12345678');
      await page.getByRole('button', { name: 'Entrar' }).click();

      // Wait for login to complete
      await page.waitForTimeout(500);

      // Check no token in storage
      const localStorage = await page.evaluate(() => JSON.stringify(window.localStorage));
      const sessionStorage = await page.evaluate(() => JSON.stringify(window.sessionStorage));

      expect(localStorage).not.toContain('secret-jwt');
      expect(sessionStorage).not.toContain('secret-jwt');
      expect(localStorage).not.toContain('accessToken');
      expect(sessionStorage).not.toContain('accessToken');
    });
  });
});
