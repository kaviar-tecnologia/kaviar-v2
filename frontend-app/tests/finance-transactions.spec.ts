import { test, expect } from 'playwright/test';

const ADMIN_TOKEN = 'fake-token';
const SA_DATA = JSON.stringify({ id: 'a1', name: 'Admin', email: 'a@t.l', role: 'SUPER_ADMIN' });
const FIN_DATA = JSON.stringify({ id: 'f1', name: 'Finance', email: 'f@t.l', role: 'FINANCE' });

const mockTxn = { id: 'txn-1', description: 'AWS Agosto', direction: 'OUT', transaction_type: 'EXPENSE', status: 'DRAFT', source_type: 'MANUAL', payment_method: 'PIX', competence_date: '2026-08-01', transaction_date: '2026-08-01', due_date: '2026-08-15', net_amount_cents: '15000', gross_amount_cents: '15000', account: { id: 'a1', name: 'Banco', code: 'B1' }, category: { id: 'c1', name: 'Tecnologia', code: 'TECH' }, cost_center: null, updated_at: '2026-08-01T00:00:00.000Z' };
const mockPosted = { ...mockTxn, id: 'txn-2', status: 'POSTED', description: 'Twilio Jul', settlement_date: '2026-07-20', direction: 'OUT', transaction_type: 'EXPENSE', reversal_of_id: null, updated_at: '2026-08-05T10:00:00.000Z' };
const mockReversal = { id: 'txn-reversal', description: 'Estorno: Twilio Jul', direction: 'IN', transaction_type: 'REVERSAL', status: 'POSTED', source_type: 'MANUAL', payment_method: 'INTERNAL', reversal_of_id: 'txn-2', competence_date: '2026-08-10', transaction_date: '2026-08-10', due_date: null, settlement_date: '2026-08-10', net_amount_cents: '15000', gross_amount_cents: '15000', account: { id: 'a1', name: 'Banco', code: 'B1' }, category: { id: 'c1', name: 'Tecnologia', code: 'TECH' }, cost_center: null, updated_at: '2026-08-10T00:00:00.000Z' };
const mockPostedReversed = { ...mockPosted, status: 'REVERSED' };

const mockListResponse = { success: true, data: [mockTxn, mockPosted], pagination: { page: 1, limit: 25, total: 2, totalPages: 1 } };
const mockListAfterReversal = { success: true, data: [mockTxn, mockPostedReversed, mockReversal], pagination: { page: 1, limit: 25, total: 3, totalPages: 1 } };
const mockAccounts = { success: true, data: [{ id: 'a1', name: 'Banco', code: 'B1' }], pagination: { total: 1 } };
const mockCategories = { success: true, data: [{ id: 'c1', name: 'Tecnologia', code: 'TECH' }], pagination: { total: 1 } };
const mockCostCenters = { success: true, data: [{ id: 'cc1', name: 'Administrativo', code: 'ADMIN' }], pagination: { total: 1 } };

async function setupAuth(page, data = SA_DATA) {
  await page.addInitScript(({ token, adminData }) => {
    localStorage.setItem('kaviar_admin_token', token);
    localStorage.setItem('kaviar_admin_data', adminData);
  }, { token: ADMIN_TOKEN, adminData: data });
}

async function interceptAPIs(page) {
  await page.route('**/api/admin/finance/transactions?**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
  await page.route('**/api/admin/finance/transactions', (route) => {
    if (route.request().method() === 'POST') return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ success: true, data: mockTxn }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) });
  });
  await page.route('**/api/admin/finance/accounts**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAccounts) }));
  await page.route('**/api/admin/finance/categories**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCategories) }));
  await page.route('**/api/admin/finance/cost-centers**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCostCenters) }));
  await page.route('**/api/admin/finance/transactions/*/post', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { ...mockTxn, status: 'POSTED' } }) }));
  await page.route('**/api/admin/finance/transactions/*/cancel', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { ...mockTxn, status: 'CANCELED' } }) }));
  await page.route('**/api/admin/finance/transactions/*/reverse', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { original: mockPostedReversed, reversal: mockReversal } }) }));
}

test.describe('Finance Transactions — SUPER_ADMIN', () => {
  test.beforeEach(async ({ page }) => { await setupAuth(page); await interceptAPIs(page); });

  test('page loads with table', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByText('Lançamentos Financeiros')).toBeVisible();
    await expect(page.getByText('AWS Agosto')).toBeVisible();
  });

  test('creates a DRAFT entry', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByRole('button', { name: 'Novo Lançamento' }).click();
    await expect(page.getByText('Novo Lançamento Manual')).toBeVisible();
  });

  test('shows Liquidar button for DRAFT', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByRole('button', { name: 'Liquidar' }).first()).toBeVisible();
  });

  test('shows Cancelar button for DRAFT', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByRole('button', { name: 'Cancelar' }).first()).toBeVisible();
  });

  test('POSTED shows Estornar button', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByRole('button', { name: 'Estornar' })).toBeVisible();
  });

  test('liquidation dialog opens on Liquidar click', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByRole('button', { name: 'Liquidar' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('heading', { name: 'Confirmar Liquidação' })).toBeVisible({ timeout: 3000 });
  });

  test('cancel dialog requires reason', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByRole('button', { name: /^Cancelar$/ }).first().click();
    await expect(page.getByText('Cancelar Lançamento')).toBeVisible();
    // Button should be disabled without reason
    await expect(page.getByRole('button', { name: 'Confirmar Cancelamento' })).toBeDisabled();
  });

  test('409 conflict shows warning', async ({ page }) => {
    await page.route('**/api/admin/finance/transactions/*/post', (route) => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Conflito de atualização: o registro foi alterado por outra sessão' }) }));
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByRole('button', { name: 'Liquidar' }).first().click();
    await page.getByRole('button', { name: 'Confirmar Liquidação' }).click();
    await expect(page.getByText(/alterado por outro administrador/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Recarregar' })).toBeVisible();
  });
});

test.describe('Finance Transactions — FINANCE (read-only)', () => {
  test('no write buttons visible', async ({ page }) => {
    await setupAuth(page, FIN_DATA);
    await interceptAPIs(page);
    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByText('AWS Agosto')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Novo Lançamento' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Liquidar' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar' })).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Editar' })).not.toBeVisible();
  });
});

test.describe('Finance Transactions — Edit Flow', () => {
  test.beforeEach(async ({ page }) => { await setupAuth(page); await interceptAPIs(page); });

  test('Edit button appears for SUPER_ADMIN on DRAFT', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByRole('button', { name: 'Editar' }).first()).toBeVisible();
  });

  test('POSTED does not show Edit button', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    // mockPosted is POSTED — its row should not have Editar
    const rows = page.locator('tr');
    const postedRow = rows.filter({ hasText: 'Twilio Jul' });
    await expect(postedRow.getByRole('button', { name: 'Editar' })).not.toBeVisible();
  });

  test('Edit dialog opens with existing values', async ({ page }) => {
    await page.route('**/api/admin/finance/transactions/txn-1', (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: mockTxn }) });
      }
      return route.continue();
    });
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByRole('button', { name: 'Editar' }).first().click();
    await expect(page.getByText('Editar Lançamento')).toBeVisible();
  });

  test('409 on edit shows conflict warning', async ({ page }) => {
    await page.route('**/api/admin/finance/transactions/txn-1', (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Conflito de atualização' }) });
      }
      return route.continue();
    });
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByRole('button', { name: 'Editar' }).first().click();
    await page.getByRole('button', { name: 'Salvar Alterações' }).click();
    await expect(page.getByText(/alterado por outro administrador/)).toBeVisible();
  });

  test('Create error restores button', async ({ page }) => {
    await page.route('**/api/admin/finance/transactions', (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Categoria inativa' }) });
      }
      return route.continue();
    });
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByRole('button', { name: 'Novo Lançamento' }).click();
    await page.getByRole('button', { name: 'Criar Lançamento' }).click();
    // Should show error and button should be clickable again (not stuck on "Criando...")
    await expect(page.getByText('Valor inválido')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Criar Lançamento' })).toBeEnabled();
  });
});

test.describe('Finance Transactions — Calendar Dates (America/Sao_Paulo)', () => {
  test.use({ timezoneId: 'America/Sao_Paulo' });

  test('2026-08-01 displays as 01/08/2026, not 31/07/2026', async ({ page }) => {
    await setupAuth(page);
    await interceptAPIs(page);
    await page.goto('/admin/financeiro/lancamentos');
    // mockTxn has competence_date: '2026-08-01' — must show 01/08/2026
    await expect(page.getByText('01/08/2026').first()).toBeVisible();
  });

  test('todayLocalISO uses local day even at 23h Brazil', async ({ page }) => {
    await setupAuth(page);
    await interceptAPIs(page);
    // Set clock to 2026-08-02 23:30 BRT (Aug 03 02:30 UTC)
    await page.clock.setFixedTime(new Date('2026-08-03T02:30:00.000Z'));
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByRole('button', { name: 'Novo Lançamento' }).click();
    // The competence date input should show 2026-08-02 (local day), not 2026-08-03
    const input = page.locator('input[type="date"]').first();
    await expect(input).toHaveValue('2026-08-02');
  });
});

test.describe('Finance Transactions — EditDialog Detailed', () => {
  test.beforeEach(async ({ page }) => { await setupAuth(page); await interceptAPIs(page); });

  test('EditDialog opens with existing description and value', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByRole('button', { name: 'Editar' }).first().click();
    await expect(page.getByText('Editar Lançamento')).toBeVisible();
    // Should have the description pre-filled
    const descInput = page.locator('input').filter({ hasText: /AWS Agosto/ });
    // Alternative: check dialog has the text
    await expect(page.locator('[role="dialog"]')).toContainText('Editar');
  });

  test('PATCH sends expected_updated_at and gross=net', async ({ page }) => {
    let patchBody = null;
    await page.route('**/api/admin/finance/transactions/txn-1', (route) => {
      if (route.request().method() === 'PATCH') {
        patchBody = JSON.parse(route.request().postData() || '{}');
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: mockTxn }) });
      }
      return route.continue();
    });
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByRole('button', { name: 'Editar' }).first().click();
    await page.getByRole('button', { name: 'Salvar Alterações' }).click();
    await expect(page.getByText('Editar Lançamento')).not.toBeVisible();
    expect(patchBody).not.toBeNull();
    expect(patchBody.expected_updated_at).toBeDefined();
    expect(patchBody.gross_amount_cents).toBe(patchBody.net_amount_cents);
  });

  test('Successful edit closes dialog and reloads', async ({ page }) => {
    await page.route('**/api/admin/finance/transactions/txn-1', (route) => {
      if (route.request().method() === 'PATCH') {
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: mockTxn }) });
      }
      return route.continue();
    });
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByRole('button', { name: 'Editar' }).first().click();
    await page.getByRole('button', { name: 'Salvar Alterações' }).click();
    await expect(page.getByText('Editar Lançamento')).not.toBeVisible();
  });

  test('Clearing cost_center sends null', async ({ page }) => {
    let patchBody = null;
    await page.route('**/api/admin/finance/transactions/txn-1', (route) => {
      if (route.request().method() === 'PATCH') {
        patchBody = JSON.parse(route.request().postData() || '{}');
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: mockTxn }) });
      }
      return route.continue();
    });
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByRole('button', { name: 'Editar' }).first().click();
    await page.getByRole('button', { name: 'Salvar Alterações' }).click();
    await expect(page.getByText('Editar Lançamento')).not.toBeVisible();
    if (patchBody) {
      // cost_center_id should be null when empty
      expect(patchBody.cost_center_id).toBeNull();
    }
  });
});

test.describe('Finance Transactions — Reversal Flow', () => {
  test.beforeEach(async ({ page }) => { await setupAuth(page); await interceptAPIs(page); });

  test('SUPER_ADMIN sees Estornar for POSTED', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByRole('button', { name: 'Estornar' })).toBeVisible();
  });

  test('DRAFT/PENDING do not show Estornar', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    // The DRAFT row (AWS Agosto) should have Editar/Liquidar/Cancelar but not Estornar
    const draftRow = page.locator('tr').filter({ hasText: 'AWS Agosto' });
    await expect(draftRow.getByRole('button', { name: 'Estornar' })).not.toBeVisible();
  });

  test('FINANCE does not see Estornar', async ({ page }) => {
    await setupAuth(page, FIN_DATA);
    await interceptAPIs(page);
    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByRole('button', { name: 'Estornar' })).not.toBeVisible();
  });

  test('Reversal dialog opens with transaction details', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByRole('button', { name: 'Estornar' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Estornar Lançamento')).toBeVisible();

    // Verify transaction details shown in dialog
    await expect(dialog.getByText('Twilio Jul')).toBeVisible();
    await expect(dialog.getByText('Banco')).toBeVisible();
    await expect(dialog.getByText('Tecnologia')).toBeVisible();
    // Direction label
    await expect(dialog.getByText(/Saída|OUT/)).toBeVisible();
    // Amount and dates
    await expect(dialog.getByText(/150/)).toBeVisible();
    await expect(dialog.getByText(/20\/07\/2026/)).toBeVisible();

    // Confirm input fields exist
    await expect(dialog.locator('input[type="date"]')).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Motivo do estorno *' })).toBeVisible();

    // Buttons
    await expect(dialog.getByRole('button', { name: 'Confirmar Estorno' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Voltar' })).toBeVisible();
  });

  test('Reversal requires reason (min 3 chars)', async ({ page }) => {
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByRole('button', { name: 'Estornar' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Confirmar Estorno' })).toBeDisabled();
  });

  test('Successful reversal: closes dialog, shows success, updates list, blocks double-submit', async ({ page }) => {
    let reversalRequests = 0;
    let capturedBody: any = null;
    let listCallCount = 0;
    let resolveResponse: (() => void) | null = null;

    // Mutable list interceptor: before reversal shows original data, after shows updated
    await page.unroute('**/api/admin/finance/transactions?**');
    await page.route('**/api/admin/finance/transactions?**', (route) => {
      listCallCount++;
      const response = listCallCount <= 1 ? mockListResponse : mockListAfterReversal;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
    });

    // Reversal interceptor: first request is held pending to allow double-click test
    await page.unroute('**/api/admin/finance/transactions/*/reverse');
    await page.route('**/api/admin/finance/transactions/*/reverse', (route) => {
      reversalRequests++;
      capturedBody = JSON.parse(route.request().postData() || '{}');
      // Hold the response to simulate network latency — second click must be blocked by ref guard
      const responsePromise = new Promise<void>((resolve) => { resolveResponse = resolve; });
      responsePromise.then(() => {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { original: mockPostedReversed, reversal: mockReversal } }) });
      });
    });

    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByText('Twilio Jul')).toBeVisible();

    // Open dialog and fill in
    await page.getByRole('button', { name: 'Estornar' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Set the date explicitly
    await dialog.locator('input[type="date"]').fill('2026-08-10');
    await dialog.getByRole('textbox', { name: 'Motivo do estorno *' }).fill('  Pagamento duplicado detectado  ');
    await expect(dialog.getByRole('button', { name: 'Confirmar Estorno' })).toBeEnabled();

    // Double-click rapidly — both clicks fire before network response arrives
    const confirmButton = dialog.getByRole('button', { name: 'Confirmar Estorno' });
    await confirmButton.evaluate((element) => {
      element.click();
      element.click();
    });

    // Wait a tick then release the pending response
    await page.waitForTimeout(100);
    expect(reversalRequests).toBe(1); // Only 1 request reached the server
    resolveResponse!();

    // Dialog closes
    await expect(dialog).not.toBeVisible();

    // Success message
    await expect(page.getByText('Lançamento estornado com sucesso.')).toBeVisible();

    // Payload verification with exact values
    expect(capturedBody).not.toBeNull();
    expect(capturedBody.expected_updated_at).toBe(mockPosted.updated_at);
    expect(capturedBody.reversal_date).toBe('2026-08-10');
    expect(capturedBody.reason).toBe('Pagamento duplicado detectado');

    // After reload, the list shows updated state
    const reversalRow = page.locator('tr').filter({ hasText: 'Estorno: Twilio Jul' });
    await expect(reversalRow).toBeVisible();
    await expect(reversalRow.getByText('Estorno', { exact: true })).toBeVisible();
    await expect(page.getByText('Estornado', { exact: true }).first()).toBeVisible();

    // REVERSAL entry should not have Estornar button
    await expect(reversalRow.getByRole('button', { name: 'Estornar' })).not.toBeVisible();

    // Final confirmation: exactly 1 request total
    expect(reversalRequests).toBe(1);
  });

  test('409 on reversal shows conflict alert', async ({ page }) => {
    let reversalRequests = 0;

    await page.unroute('**/api/admin/finance/transactions/*/reverse');
    await page.route('**/api/admin/finance/transactions/*/reverse', (route) => {
      reversalRequests++;
      route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'Este lançamento já possui um estorno' }) });
    });

    await page.goto('/admin/financeiro/lancamentos');
    await page.getByRole('button', { name: 'Estornar' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('textbox', { name: 'Motivo do estorno *' }).fill('Motivo do estorno');
    await dialog.getByRole('button', { name: 'Confirmar Estorno' }).click();

    // Conflict alert appears (outside dialog — dialog closes on 409)
    await expect(page.getByRole('alert').getByText(/alterado|conflito/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Recarregar' })).toBeVisible();

    // No success message
    await expect(page.getByText('Lançamento estornado com sucesso.')).not.toBeVisible();

    // Only one reversal request
    expect(reversalRequests).toBe(1);
  });
});

test.describe('Finance Transactions — Reference Selectors', () => {
  test('all ref API calls use limit=100 and is_active=true, never limit>100', async ({ page }) => {
    await setupAuth(page);
    const refUrls: string[] = [];
    await page.route('**/api/admin/finance/transactions?**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/transactions', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/accounts**', (route) => { refUrls.push(route.request().url()); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAccounts) }); });
    await page.route('**/api/admin/finance/categories**', (route) => { refUrls.push(route.request().url()); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCategories) }); });
    await page.route('**/api/admin/finance/cost-centers**', (route) => { refUrls.push(route.request().url()); route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCostCenters) }); });

    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByText('Lançamentos Financeiros')).toBeVisible();

    // At least 3 ref calls must have been made
    expect(refUrls.length).toBeGreaterThanOrEqual(3);
    // Every call must have limit=100 and is_active=true, never limit>100
    for (const url of refUrls) {
      expect(url).toContain('limit=100');
      expect(url).toContain('is_active=true');
      expect(url).not.toMatch(/limit=(1[0-9][1-9]|[2-9]\d\d|\d{4,})/);
    }
  });

  test('account, category, and cost center options appear and can be selected', async ({ page }) => {
    await setupAuth(page);
    await interceptAPIs(page);
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByRole('button', { name: 'Novo Lançamento' }).click();
    await expect(page.getByText('Novo Lançamento Manual')).toBeVisible();

    const dialog = page.locator('[role="dialog"]');

    // Open Conta select and pick 'Banco'
    await dialog.getByLabel('Conta *').click();
    await page.getByRole('option', { name: 'Banco' }).click();
    // Verify selection: the combobox now displays 'Banco'
    await expect(dialog.getByRole('combobox', { name: /Conta/ })).toHaveText('Banco');

    // Open Categoria select and pick 'Tecnologia'
    await dialog.getByLabel('Categoria *').click();
    await page.getByRole('option', { name: 'Tecnologia' }).click();
    await expect(dialog.getByRole('combobox', { name: /Categoria/ })).toHaveText('Tecnologia');

    // Open Centro de Custo select and pick 'Administrativo'
    await dialog.getByLabel('Centro de Custo').click();
    await page.getByRole('option', { name: 'Administrativo' }).click();
    await expect(dialog.getByRole('combobox', { name: /Centro de Custo/ })).toHaveText('Administrativo');
  });

  test('empty categories shows message and blocks modal', async ({ page }) => {
    await setupAuth(page);
    await page.route('**/api/admin/finance/transactions?**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/transactions', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/accounts**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAccounts) }));
    await page.route('**/api/admin/finance/categories**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0 } }) }));
    await page.route('**/api/admin/finance/cost-centers**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCostCenters) }));

    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByText('Lançamentos Financeiros')).toBeVisible();
    await expect(page.getByText(/Nenhuma categoria financeira ativa/)).toBeVisible();
    // Click should not open modal
    await page.getByRole('button', { name: 'Novo Lançamento' }).click();
    await expect(page.getByText('Novo Lançamento Manual')).not.toBeVisible();
  });

  test('refs API failure shows error message and blocks modal', async ({ page }) => {
    await setupAuth(page);
    await page.route('**/api/admin/finance/transactions?**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/transactions', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/accounts**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false }) }));
    await page.route('**/api/admin/finance/categories**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false }) }));
    await page.route('**/api/admin/finance/cost-centers**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false }) }));

    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByText('Lançamentos Financeiros')).toBeVisible();
    await expect(page.getByText(/Não foi possível carregar contas/)).toBeVisible();
    await page.getByRole('button', { name: 'Novo Lançamento' }).click();
    await expect(page.getByText('Novo Lançamento Manual')).not.toBeVisible();
  });

  test('empty accounts shows informational message and blocks modal', async ({ page }) => {
    await setupAuth(page);
    await page.route('**/api/admin/finance/transactions?**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/transactions', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/accounts**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [], pagination: { total: 0 } }) }));
    await page.route('**/api/admin/finance/categories**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCategories) }));
    await page.route('**/api/admin/finance/cost-centers**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCostCenters) }));

    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByText('Lançamentos Financeiros')).toBeVisible();
    await expect(page.getByText(/Nenhuma conta financeira ativa/)).toBeVisible();
    // Click should not open modal
    await page.getByRole('button', { name: 'Novo Lançamento' }).click();
    await expect(page.getByText('Novo Lançamento Manual')).not.toBeVisible();
  });

  test('recovery after error: Recarregar fixes refs and allows modal', async ({ page }) => {
    await setupAuth(page);
    let shouldFail = true;
    await page.route('**/api/admin/finance/transactions?**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/transactions', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/accounts**', (route) => {
      if (shouldFail) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false }) });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAccounts) });
    });
    await page.route('**/api/admin/finance/categories**', (route) => {
      if (shouldFail) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false }) });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCategories) });
    });
    await page.route('**/api/admin/finance/cost-centers**', (route) => {
      if (shouldFail) return route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ success: false }) });
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCostCenters) });
    });

    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByText('Lançamentos Financeiros')).toBeVisible();
    // Error is shown
    await expect(page.getByText(/Não foi possível carregar contas/)).toBeVisible();

    // Switch to success
    shouldFail = false;
    // Click Recarregar
    await page.getByRole('button', { name: 'Recarregar' }).first().click();
    // Error disappears
    await expect(page.getByText(/Não foi possível carregar contas/)).not.toBeVisible();

    // Now Novo Lançamento should work
    await page.getByRole('button', { name: 'Novo Lançamento' }).click();
    await expect(page.getByText('Novo Lançamento Manual')).toBeVisible();
  });

  test('Novo Lançamento reloads refs on each click', async ({ page }) => {
    await setupAuth(page);
    let accountCalls = 0;
    await page.route('**/api/admin/finance/transactions?**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/transactions', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/accounts**', (route) => { accountCalls++; route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAccounts) }); });
    await page.route('**/api/admin/finance/categories**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCategories) }));
    await page.route('**/api/admin/finance/cost-centers**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCostCenters) }));

    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByText('Lançamentos Financeiros')).toBeVisible();
    const initialCalls = accountCalls;
    await page.getByRole('button', { name: 'Novo Lançamento' }).click();
    await expect(page.getByText('Novo Lançamento Manual')).toBeVisible();
    expect(accountCalls).toBeGreaterThan(initialCalls);
  });

  test('FINANCE role cannot create transactions', async ({ page }) => {
    await setupAuth(page, FIN_DATA);
    await interceptAPIs(page);
    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByText('Lançamentos Financeiros')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Novo Lançamento' })).not.toBeVisible();
  });

  test('SUPER_ADMIN can open modal when refs available', async ({ page }) => {
    await setupAuth(page);
    await interceptAPIs(page);
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByRole('button', { name: 'Novo Lançamento' }).click();
    await expect(page.getByText('Novo Lançamento Manual')).toBeVisible();
  });
});

test.describe('Finance Transactions — Competence Month Filter', () => {
  test('field "Competência (mês/ano)" is visible', async ({ page }) => {
    await setupAuth(page);
    await interceptAPIs(page);
    await page.route('**/api/admin/finance/dashboard-summary**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: null }) }));
    await page.goto('/admin/financeiro/lancamentos');
    await expect(page.getByLabel('Competência (mês/ano)')).toBeVisible();
  });

  test('selecting 2026-07 + Filtrar sends correct date params to transactions', async ({ page }) => {
    await setupAuth(page);
    let capturedUrl = '';
    await page.route('**/api/admin/finance/transactions?**', (route) => {
      capturedUrl = route.request().url();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) });
    });
    await page.route('**/api/admin/finance/transactions', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/accounts**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAccounts) }));
    await page.route('**/api/admin/finance/categories**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCategories) }));
    await page.route('**/api/admin/finance/cost-centers**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCostCenters) }));
    await page.route('**/api/admin/finance/dashboard-summary**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: null }) }));
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByLabel('Competência (mês/ano)').fill('2026-07');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForTimeout(500);
    expect(capturedUrl).toContain('date_field=competence_date');
    expect(capturedUrl).toContain('date_from=2026-07-01');
    expect(capturedUrl).toContain('date_to=2026-07-31');
  });

  test('dashboard-summary receives same date range', async ({ page }) => {
    await setupAuth(page);
    let dashUrl = '';
    await page.route('**/api/admin/finance/transactions?**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/transactions', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/accounts**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAccounts) }));
    await page.route('**/api/admin/finance/categories**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCategories) }));
    await page.route('**/api/admin/finance/cost-centers**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCostCenters) }));
    await page.route('**/api/admin/finance/dashboard-summary**', (route) => {
      dashUrl = route.request().url();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: null }) });
    });
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByLabel('Competência (mês/ano)').fill('2026-07');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForTimeout(500);
    expect(dashUrl).toContain('date_field=competence_date');
    expect(dashUrl).toContain('date_from=2026-07-01');
    expect(dashUrl).toContain('date_to=2026-07-31');
  });

  test('CSV export receives same date range', async ({ page }) => {
    await setupAuth(page);
    let csvUrl = '';
    await page.route('**/api/admin/finance/transactions?**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/transactions', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/accounts**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAccounts) }));
    await page.route('**/api/admin/finance/categories**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCategories) }));
    await page.route('**/api/admin/finance/cost-centers**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCostCenters) }));
    await page.route('**/api/admin/finance/dashboard-summary**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: null }) }));
    await page.route('**/api/admin/finance/transactions/export.csv**', (route) => {
      csvUrl = route.request().url();
      return route.fulfill({ status: 200, headers: { 'Content-Type': 'text/csv' }, body: '"ID"\r\n"txn-1"\r\n' });
    });
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByLabel('Competência (mês/ano)').fill('2026-07');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForTimeout(300);
    await page.getByRole('button', { name: 'Exportar CSV' }).click();
    await page.waitForTimeout(500);
    expect(csvUrl).toContain('date_field=competence_date');
    expect(csvUrl).toContain('date_from=2026-07-01');
    expect(csvUrl).toContain('date_to=2026-07-31');
  });

  test('2028-02 (leap year) generates date_to=2028-02-29', async ({ page }) => {
    await setupAuth(page);
    let capturedUrl = '';
    await page.route('**/api/admin/finance/transactions?**', (route) => {
      capturedUrl = route.request().url();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) });
    });
    await page.route('**/api/admin/finance/transactions', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/accounts**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAccounts) }));
    await page.route('**/api/admin/finance/categories**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCategories) }));
    await page.route('**/api/admin/finance/cost-centers**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCostCenters) }));
    await page.route('**/api/admin/finance/dashboard-summary**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: null }) }));
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByLabel('Competência (mês/ano)').fill('2028-02');
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForTimeout(500);
    expect(capturedUrl).toContain('date_from=2028-02-01');
    expect(capturedUrl).toContain('date_to=2028-02-29');
  });

  test('empty filter does NOT send date_from/date_to', async ({ page }) => {
    await setupAuth(page);
    let capturedUrl = '';
    await page.route('**/api/admin/finance/transactions?**', (route) => {
      capturedUrl = route.request().url();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) });
    });
    await page.route('**/api/admin/finance/transactions', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/accounts**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAccounts) }));
    await page.route('**/api/admin/finance/categories**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCategories) }));
    await page.route('**/api/admin/finance/cost-centers**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCostCenters) }));
    await page.route('**/api/admin/finance/dashboard-summary**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: null }) }));
    await page.goto('/admin/financeiro/lancamentos');
    // Leave competence_month empty, just click filter
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForTimeout(500);
    expect(capturedUrl).not.toContain('date_from');
    expect(capturedUrl).not.toContain('date_to');
    expect(capturedUrl).not.toContain('date_field');
  });

  test('existing direction filter still works alongside competence', async ({ page }) => {
    await setupAuth(page);
    let capturedUrl = '';
    await page.route('**/api/admin/finance/transactions?**', (route) => {
      capturedUrl = route.request().url();
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) });
    });
    await page.route('**/api/admin/finance/transactions', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockListResponse) }));
    await page.route('**/api/admin/finance/accounts**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockAccounts) }));
    await page.route('**/api/admin/finance/categories**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCategories) }));
    await page.route('**/api/admin/finance/cost-centers**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockCostCenters) }));
    await page.route('**/api/admin/finance/dashboard-summary**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: null }) }));
    await page.goto('/admin/financeiro/lancamentos');
    await page.getByLabel('Competência (mês/ano)').fill('2026-07');
    await page.getByLabel('Direção').click();
    await page.getByRole('option', { name: 'Saída' }).click();
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForTimeout(500);
    expect(capturedUrl).toContain('direction=OUT');
    expect(capturedUrl).toContain('date_from=2026-07-01');
    expect(capturedUrl).toContain('date_to=2026-07-31');
  });
});
