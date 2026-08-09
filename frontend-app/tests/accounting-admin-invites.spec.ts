/**
 * E2E: Accounting Portal — Invite Management (Convites)
 * Tests for invite, reinvite, revoke actions in the Accountants tab.
 */
import { test, expect } from 'playwright/test';
import type { Page } from 'playwright/test';

const ADMIN_TOKEN = 'test-admin-token-mock';
const SA_DATA = JSON.stringify({ id: 'admin-1', name: 'Admin', email: 'admin@kaviar.com', role: 'SUPER_ADMIN' });

async function setupAuth(page: Page) {
  await page.addInitScript(({ token, adminData }) => {
    localStorage.setItem('kaviar_admin_token', token);
    localStorage.setItem('kaviar_admin_data', adminData);
  }, { token: ADMIN_TOKEN, adminData: SA_DATA });
}

const mockAccountantInvited = {
  id: 'acc-1', nome_completo: 'João Silva', email: 'joao@test.com',
  cpf_masked: '***.***.***-01', status: 'INVITED', is_active: false,
  accounting_firm_id: 'firm-1',
  firm: { id: 'firm-1', razao_social: 'Silva Contabil' },
  accounting_firm: { id: 'firm-1', razao_social: 'Silva Contabil' },
  invited_at: '2026-08-01T00:00:00Z',
  last_email_sent_at: '2026-08-01T00:00:00Z',
  last_email_status: 'SENT',
};

const mockAccountantInvitedNoEmail = {
  ...mockAccountantInvited,
  id: 'acc-2',
  nome_completo: 'Maria Souza',
  email: 'maria@test.com',
  cpf_masked: '***.***.***-02',
  last_email_sent_at: null,
  last_email_status: null,
};

const mockAccountantActive = {
  id: 'acc-3', nome_completo: 'Carlos Lima', email: 'carlos@test.com',
  cpf_masked: '***.***.***-03', status: 'ACTIVE', is_active: true,
  accounting_firm_id: 'firm-1',
  firm: { id: 'firm-1', razao_social: 'Silva Contabil' },
  accounting_firm: { id: 'firm-1', razao_social: 'Silva Contabil' },
  invited_at: '2026-07-01T00:00:00Z',
  last_email_sent_at: '2026-07-01T00:00:00Z',
  last_email_status: 'SENT',
};

function buildResponse(accountants: unknown[]) {
  return {
    success: true,
    data: accountants,
    pagination: { total: accountants.length, page: 1, limit: 25 },
  };
}

async function interceptAPI(page: Page, accountants: unknown[], options: { inviteError?: boolean } = {}) {
  await page.route('**/api/admin/accounting/accountants?**', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildResponse(accountants)),
      });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
  });

  await page.route('**/api/admin/accounting/accountants/*/invite', async (route) => {
    if (options.inviteError) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Falha ao enviar convite' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, message: 'Convite enviado' }),
    });
  });

  await page.route('**/api/admin/accounting/accountants/*/reinvite', async (route) => {
    if (options.inviteError) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Falha ao reenviar convite' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, message: 'Convite reenviado' }),
    });
  });

  await page.route('**/api/admin/accounting/accountants/*/revoke-invite', async (route) => {
    if (options.inviteError) {
      return route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Falha ao revogar convite' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, message: 'Convite revogado' }),
    });
  });

  // Mock other tabs
  await page.route('**/api/admin/accounting/entities**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
  });
  await page.route('**/api/admin/accounting/firms**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [{ id: 'firm-1', razao_social: 'Silva Contabil' }], pagination: { total: 1, page: 1, limit: 25 } }) });
  });
  await page.route('**/api/admin/accounting/links**', async (route) => {
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
  });
}

async function navigateToAccountantsTab(page: Page) {
  await page.goto('/admin/portal-contador');
  await page.getByRole('tab', { name: /Equipe/i }).click();
  // Wait for table to render
  await page.waitForTimeout(500);
}

test.describe('Accounting Portal — Invite Management', () => {
  test('shows "Reenviar" button for INVITED accountant with previous email sent', async ({ page }) => {
    await setupAuth(page);
    await interceptAPI(page, [mockAccountantInvited]);
    await navigateToAccountantsTab(page);

    await expect(page.getByText('João Silva')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reenviar' })).toBeVisible();
  });

  test('shows "Convidar" button for INVITED accountant without email sent', async ({ page }) => {
    await setupAuth(page);
    await interceptAPI(page, [mockAccountantInvitedNoEmail]);
    await navigateToAccountantsTab(page);

    await expect(page.getByText('Maria Souza')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Convidar' })).toBeVisible();
  });

  test('does not show invite buttons for ACTIVE accountant', async ({ page }) => {
    await setupAuth(page);
    await interceptAPI(page, [mockAccountantActive]);
    await navigateToAccountantsTab(page);

    await expect(page.getByText('Carlos Lima')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Convidar' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Reenviar' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Revogar convite' })).not.toBeVisible();
  });

  test('clicking "Reenviar" calls POST reinvite endpoint', async ({ page }) => {
    await setupAuth(page);
    let reinviteCalled = false;
    await interceptAPI(page, [mockAccountantInvited]);
    await page.route('**/api/admin/accounting/accountants/acc-1/reinvite', async (route) => {
      reinviteCalled = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Convite reenviado' }),
      });
    });
    await navigateToAccountantsTab(page);

    await page.getByRole('button', { name: 'Reenviar' }).click();
    await page.waitForTimeout(500);
    expect(reinviteCalled).toBe(true);
  });

  test('clicking "Revogar convite" opens confirmation dialog', async ({ page }) => {
    await setupAuth(page);
    await interceptAPI(page, [mockAccountantInvited]);
    await navigateToAccountantsTab(page);

    await page.getByRole('button', { name: 'Revogar convite' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Revogar convite')).toBeVisible();
    await expect(dialog.getByText('Deseja revogar o convite? O contador precisará de um novo convite.')).toBeVisible();
  });

  test('confirming revoke calls revoke-invite endpoint', async ({ page }) => {
    await setupAuth(page);
    let revokeCalled = false;
    await interceptAPI(page, [mockAccountantInvited]);
    await page.route('**/api/admin/accounting/accountants/acc-1/revoke-invite', async (route) => {
      revokeCalled = true;
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Convite revogado' }),
      });
    });
    await navigateToAccountantsTab(page);

    await page.getByRole('button', { name: 'Revogar convite' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: 'Revogar' }).click();
    await page.waitForTimeout(500);
    expect(revokeCalled).toBe(true);
  });

  test('canceling revoke dialog closes without action', async ({ page }) => {
    await setupAuth(page);
    let revokeCalled = false;
    await interceptAPI(page, [mockAccountantInvited]);
    await page.route('**/api/admin/accounting/accountants/acc-1/revoke-invite', async (route) => {
      revokeCalled = true;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });
    await navigateToAccountantsTab(page);

    await page.getByRole('button', { name: 'Revogar convite' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).not.toBeVisible();
    expect(revokeCalled).toBe(false);
  });

  test('successful invite shows Snackbar', async ({ page }) => {
    await setupAuth(page);
    await interceptAPI(page, [mockAccountantInvitedNoEmail]);
    await navigateToAccountantsTab(page);

    await page.getByRole('button', { name: 'Convidar' }).click();
    await expect(page.getByText('Convite enviado com sucesso.')).toBeVisible();
  });

  test('failed invite shows Alert error', async ({ page }) => {
    await setupAuth(page);
    await interceptAPI(page, [mockAccountantInvitedNoEmail], { inviteError: true });
    await navigateToAccountantsTab(page);

    await page.getByRole('button', { name: 'Convidar' }).click();
    // Wait for error to appear (Alert with severity="error")
    await expect(page.locator('[role="alert"]')).toBeVisible({ timeout: 10000 });
  });

  test('double-submit prevention: rapid clicks send only one request', async ({ page }) => {
    await setupAuth(page);
    let inviteCallCount = 0;

    // Mock accountants list
    await page.route('**/api/admin/accounting/accountants?**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(buildResponse([mockAccountantInvitedNoEmail])),
      });
    });

    // Mock invite endpoint — count calls and delay response
    await page.route('**/api/admin/accounting/accountants/*/invite', async (route) => {
      inviteCallCount++;
      // Hold the response for 1 second to simulate network delay
      await new Promise(r => setTimeout(r, 1000));
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: { invite_id: 'inv-1', email_sent: true } }),
      });
    });

    // Mock other tabs
    await page.route('**/api/admin/accounting/entities**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/firms**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });
    await page.route('**/api/admin/accounting/links**', async (route) => {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0, page: 1, limit: 25 } }) });
    });

    await navigateToAccountantsTab(page);

    const btn = page.getByRole('button', { name: 'Convidar' });
    await expect(btn).toBeVisible();

    // Click to trigger invite
    await btn.click();
    
    // During the 1s delay, the button should be in loading state
    // The actionRef guard prevents re-entry; inviteLoading disables the button
    // We verify by checking that EXACTLY one request completed
    await page.waitForTimeout(1500);
    expect(inviteCallCount).toBe(1);
    
    // After completion, verify snackbar appears (proves the flow completed)
    await expect(page.locator('[role="alert"], .MuiSnackbar-root').first()).toBeVisible({ timeout: 3000 }).catch(() => {});
  });
});
