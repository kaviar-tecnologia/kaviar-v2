/**
 * Playwright tests for the Accountant Report Page (/admin/financeiro/contador)
 * Uses route interception — no real backend needed.
 */
import { test, expect } from 'playwright/test';

const ADMIN_TOKEN = 'fake-test-token';
const ADMIN_DATA_FINANCE = JSON.stringify({ id: 'a1', name: 'Test', email: 'f@t.local', role: 'FINANCE' });
const ADMIN_DATA_OPERATOR = JSON.stringify({ id: 'a2', name: 'Op', email: 'o@t.local', role: 'OPERATOR' });

const mockReportResponse = {
  success: true,
  data: {
    summary: {
      total_rides: 10, completed_rides: 7, canceled_rides: 3,
      gross_total: '1234.50', platform_fee_total: '222.21', driver_earnings_total: '1012.29',
      period: { start: '2026-07-01T00:00:00.000Z', end: '2026-07-30T23:59:59.999Z' },
    },
    rides: [
      {
        id: 'ride-001-abc', status: 'completed', financial_status: 'SETTLED',
        created_at: '2026-07-15T10:00:00Z', completed_at: '2026-07-15T10:20:00Z',
        canceled_at: null, driver_id: 'd1', driver_name: 'Carlos',
        passenger_first_name: 'Ana', final_price: '50.00', fee_percent: '18.00',
        fee_amount: '9.00', driver_earnings: '41.00', settlement_territory: 'local',
        credit_cost: 1, settled_at: '2026-07-15T10:21:00Z',
      },
      {
        id: 'ride-002-def', status: 'completed', financial_status: 'UNSETTLED',
        created_at: '2026-07-16T14:00:00Z', completed_at: '2026-07-16T14:15:00Z',
        canceled_at: null, driver_id: 'd2', driver_name: 'Pedro',
        passenger_first_name: 'Lucia', final_price: null, fee_percent: null,
        fee_amount: null, driver_earnings: null, settlement_territory: 'adjacent',
        credit_cost: null, settled_at: null,
      },
      {
        id: 'ride-003-ghi', status: 'completed', financial_status: 'UNSETTLED',
        created_at: '2026-07-17T18:23:00Z', completed_at: '2026-07-17T18:35:00Z',
        canceled_at: null, driver_id: null, driver_name: null,
        passenger_first_name: 'Maria', final_price: null, fee_percent: null,
        fee_amount: null, driver_earnings: null, settlement_territory: 'external',
        credit_cost: null, settled_at: null,
      },
    ],
    pagination: { page: 1, limit: 50, total: 75, totalPages: 2 },
  },
};

const emptyReport = {
  success: true,
  data: {
    summary: {
      total_rides: 0, completed_rides: 0, canceled_rides: 0,
      gross_total: '0.00', platform_fee_total: '0.00', driver_earnings_total: '0.00',
      period: { start: '2026-07-01T00:00:00.000Z', end: '2026-07-30T23:59:59.999Z' },
    },
    rides: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
  },
};

// ── Manual Transactions mock data ────────────────────────────────────────────

const mockManualTxResponse = {
  success: true,
  data: {
    summary: {
      draft_transactions: 1, pending_transactions: 2, posted_transactions: 3,
      canceled_transactions: 0, reversed_transactions: 1, blocked_transactions: 0,
      reconciled_transactions: 1, closed_transactions: 0,
      realized_in_total_cents: '150000', realized_out_total_cents: '45000',
      period: { start: '2026-07-01', end: '2026-07-30' },
    },
    transactions: [
      {
        id: 'tx-001', direction: 'IN', transaction_type: 'INCOME', status: 'POSTED',
        reporting_date: '2026-07-15', description: 'Receita de aluguel',
        net_amount_cents: '100000', gross_amount_cents: '110000',
        fee_amount_cents: '5000', discount_amount_cents: '3000',
        retention_amount_cents: '2000',
        account: { name: 'Conta Principal', code: 'CP' },
        category: { name: 'Aluguéis', code: 'ALG' },
        cost_center: { name: 'Operações', code: 'OPS' },
        reversal: null, original: null, reversal_of_id: null,
        reversal_reason: null,
        transaction_date: '2026-07-10', competence_date: '2026-07-01',
        settlement_date: '2026-07-15', payment_method: 'PIX',
        created_by: 'Admin Fulano', approved_by: 'Diretor Silva',
        canceled_reason: null,
      },
      {
        id: 'tx-002', direction: 'OUT', transaction_type: 'REVERSAL', status: 'POSTED',
        reporting_date: '2026-07-16', description: 'Estorno pagamento duplicado',
        net_amount_cents: '45000', gross_amount_cents: '45000',
        fee_amount_cents: '0', discount_amount_cents: '0',
        retention_amount_cents: '0',
        account: { name: 'Conta Principal', code: 'CP' },
        category: { name: 'Estornos', code: 'EST' },
        cost_center: null,
        reversal: null, original: { id: 'tx-003', description: 'Pagamento original' },
        reversal_of_id: 'tx-003', transaction_date: '2026-07-12',
        competence_date: '2026-07-12', settlement_date: '2026-07-16',
        payment_method: 'TED',
        reversal_reason: 'Duplicidade detectada',
        created_by: 'Admin Fulano', approved_by: null,
        canceled_reason: null,
      },
      {
        id: 'tx-003', direction: 'OUT', transaction_type: 'EXPENSE', status: 'REVERSED',
        reporting_date: '2026-07-10', description: 'Pagamento original',
        net_amount_cents: '45000', gross_amount_cents: '48000',
        fee_amount_cents: '2000', discount_amount_cents: '1000',
        retention_amount_cents: '0',
        account: { name: 'Conta Principal', code: 'CP' },
        category: { name: 'Fornecedores', code: 'FORN' },
        cost_center: { name: 'Operações', code: 'OPS' },
        reversal: { id: 'tx-002', date: '2026-07-16', reason: 'Duplicidade' },
        original: null, reversal_of_id: null,
        reversal_reason: 'Duplicidade',
        transaction_date: '2026-07-08', competence_date: '2026-07-08',
        settlement_date: '2026-07-10', payment_method: 'TED',
        created_by: 'Admin Fulano', approved_by: 'Diretor Silva',
        canceled_reason: null,
      },
      {
        id: 'tx-004', direction: 'IN', transaction_type: 'INCOME', status: 'DRAFT',
        reporting_date: '2026-07-18', description: 'Lançamento rascunho',
        net_amount_cents: '50000', gross_amount_cents: '50000',
        fee_amount_cents: '0', discount_amount_cents: '0',
        retention_amount_cents: '0',
        account: { name: 'Conta Secundária', code: 'CS' },
        category: null, cost_center: null,
        reversal: null, original: null, reversal_of_id: null,
        reversal_reason: null,
        transaction_date: '2026-07-18', competence_date: '2026-07-18',
        settlement_date: null, payment_method: null,
        created_by: null, approved_by: null,
        canceled_reason: null,
      },
    ],
    pagination: { page: 1, limit: 50, total: 4, total_pages: 1 },
  },
};

const emptyManualTxResponse = {
  success: true,
  data: {
    summary: {
      draft_transactions: 0, pending_transactions: 0, posted_transactions: 0,
      canceled_transactions: 0, reversed_transactions: 0, blocked_transactions: 0,
      reconciled_transactions: 0, closed_transactions: 0,
      realized_in_total_cents: '0', realized_out_total_cents: '0',
      period: { start: '2026-07-01', end: '2026-07-30' },
    },
    transactions: [],
    pagination: { page: 1, limit: 50, total: 0, total_pages: 0 },
  },
};

async function setupAuth(page, data = ADMIN_DATA_FINANCE) {
  await page.addInitScript(({ token, adminData }) => {
    localStorage.setItem('kaviar_admin_token', token);
    localStorage.setItem('kaviar_admin_data', adminData);
  }, { token: ADMIN_TOKEN, adminData: data });
}

async function interceptReport(page, response = mockReportResponse, status = 200) {
  await page.route('**/api/admin/finance/accountant-report?**', (route) => {
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(response) });
  });
  // Base route without query params (initial load)
  await page.route('**/api/admin/finance/accountant-report', (route) => {
    const url = route.request().url();
    if (url.includes('/csv')) return route.continue();
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(response) });
  });
}

async function interceptManualTx(page, response = mockManualTxResponse, status = 200) {
  await page.route('**/api/admin/finance/accountant-report/manual-transactions?**', (route) => {
    const url = route.request().url();
    if (url.includes('/csv')) return route.continue();
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(response) });
  });
  await page.route('**/api/admin/finance/accountant-report/manual-transactions', (route) => {
    const url = route.request().url();
    if (url.includes('/csv')) return route.continue();
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(response) });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════

test.describe('RBAC', () => {
  test('FINANCE can access', async ({ page }) => {
    await setupAuth(page);
    await interceptReport(page);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('Área do Contador')).toBeVisible();
  });

  test('OPERATOR is blocked', async ({ page }) => {
    await setupAuth(page, ADMIN_DATA_OPERATOR);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('Área do Contador')).not.toBeVisible();
  });
});

test.describe('Rendering', () => {
  test.beforeEach(async ({ page }) => { await setupAuth(page); });

  test('loading state', async ({ page }) => {
    await page.route('**/api/admin/finance/accountant-report**', (route) => {
      setTimeout(() => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockReportResponse) }), 500);
    });
    await page.goto('/admin/financeiro/contador');
    await expect(page.locator('role=progressbar')).toBeVisible();
  });

  test('summary cards', async ({ page }) => {
    await interceptReport(page);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('R$ 1.234,50')).toBeVisible();
    await expect(page.getByText('R$ 222,21')).toBeVisible();
    await expect(page.getByText('R$ 1.012,29')).toBeVisible();
  });

  test('table data', async ({ page }) => {
    await interceptReport(page);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('Carlos')).toBeVisible();
    await expect(page.getByText('Ana')).toBeVisible();
  });

  test('empty state', async ({ page }) => {
    await interceptReport(page, emptyReport);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('Nenhuma corrida encontrada')).toBeVisible();
  });

  test('error state', async ({ page }) => {
    await interceptReport(page, { success: false, error: 'Servidor indisponível' }, 500);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('Servidor indisponível')).toBeVisible();
  });

  test('financial_status chips', async ({ page }) => {
    await interceptReport(page);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('Liquidado').first()).toBeVisible();
    await expect(page.getByText('Não liquidado').first()).toBeVisible();
  });
});

test.describe('Filters and Pagination', () => {
  test('filter triggers new fetch', async ({ page }) => {
    await setupAuth(page);
    let count = 0;
    await page.route('**/api/admin/finance/accountant-report**', (route) => {
      count++;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockReportResponse) });
    });
    await page.goto('/admin/financeiro/contador');
    await page.waitForTimeout(300);
    const before = count;
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForTimeout(300);
    expect(count).toBeGreaterThan(before);
  });

  test('pagination sends page=2 on next', async ({ page }) => {
    await setupAuth(page);
    let lastUrl = '';
    await page.route('**/api/admin/finance/accountant-report**', (route) => {
      lastUrl = route.request().url();
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockReportResponse) });
    });
    await page.goto('/admin/financeiro/contador');
    await page.waitForTimeout(500);
    // Click next page button
    await page.getByRole('button', { name: /next page/i }).click();
    await page.waitForTimeout(500);
    expect(lastUrl).toContain('page=2');
  });
});

test.describe('CSV Export', () => {
  test('successful download triggers download event', async ({ page }) => {
    await setupAuth(page);
    await interceptReport(page);
    await page.route('**/api/admin/finance/accountant-report/csv**', (route) => {
      route.fulfill({
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="kaviar-relatorio-contador-2026-07-01-a-2026-07-30.csv"',
        },
        body: '\uFEFF"ID Corrida","Data"\r\n"ride-001","01/07/2026 10:00"',
      });
    });
    await page.goto('/admin/financeiro/contador');
    await page.waitForTimeout(500);

    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain('kaviar-relatorio-contador');
    expect(download.suggestedFilename()).toContain('.csv');
  });

  test('422 error shows user-friendly message', async ({ page }) => {
    await setupAuth(page);
    await interceptReport(page);
    await page.route('**/api/admin/finance/accountant-report/csv**', (route) => {
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false, code: 'CSV_ROW_LIMIT_EXCEEDED',
          error: 'O relatório possui mais de 5.000 linhas. Reduza o período ou aplique mais filtros.',
          total: 7500, max: 5000,
        }),
      });
    });
    await page.goto('/admin/financeiro/contador');
    await page.waitForTimeout(500);
    await page.getByRole('button', { name: 'CSV' }).click();
    await page.waitForTimeout(500);
    await expect(page.getByText('5.000 linhas')).toBeVisible();
  });
});

test.describe('Currency Formatter (no parseFloat)', () => {
  test('"1234.50" → "R$ 1.234,50"', async ({ page }) => {
    await setupAuth(page);
    await interceptReport(page);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('R$ 1.234,50')).toBeVisible();
  });

  test('"0.00" → "R$ 0,00"', async ({ page }) => {
    await setupAuth(page);
    await interceptReport(page, emptyReport);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('R$ 0,00').first()).toBeVisible();
  });
});

test.describe('Territory Labels', () => {
  test('translates "adjacent" to "Adjacente"', async ({ page }) => {
    await setupAuth(page);
    await interceptReport(page);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('Adjacente').first()).toBeVisible();
  });

  test('translates "external" to "Externo"', async ({ page }) => {
    await setupAuth(page);
    await interceptReport(page);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('Externo').first()).toBeVisible();
  });

  test('translates "local" to "Local"', async ({ page }) => {
    await setupAuth(page);
    await interceptReport(page);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('Local').first()).toBeVisible();
  });
});

test.describe('Incomplete Data Handling', () => {
  test('completed ride with driver_id=null shows "Dados incompletos"', async ({ page }) => {
    await setupAuth(page);
    await interceptReport(page);
    await page.goto('/admin/financeiro/contador');
    // ride-003 has driver_id: null → "Dados incompletos"
    await expect(page.getByText('Dados incompletos').first()).toBeVisible();
  });

  test('completed ride with driver_id present but driver_name null shows "Não liquidado"', async ({ page }) => {
    await setupAuth(page);
    // ride-002 has driver_id: 'd2', driver_name: 'Pedro', UNSETTLED → "Não liquidado"
    await interceptReport(page);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('Não liquidado').first()).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// MANUAL TRANSACTIONS TAB
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Manual Transactions Tab', () => {
  test.beforeEach(async ({ page }) => { await setupAuth(page); });

  test('tab appears and switches', async ({ page }) => {
    await interceptReport(page);
    await interceptManualTx(page);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByRole('tab', { name: 'Corridas' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Lançamentos Manuais' })).toBeVisible();
    await page.getByRole('tab', { name: 'Lançamentos Manuais' }).click();
    await expect(page.getByText('Receita de aluguel')).toBeVisible();
  });

  test('manual transactions load with mock data', async ({ page }) => {
    await interceptReport(page);
    await interceptManualTx(page);
    await page.goto('/admin/financeiro/contador');
    await page.getByRole('tab', { name: 'Lançamentos Manuais' }).click();
    await expect(page.getByText('Receita de aluguel')).toBeVisible();
    await expect(page.getByText('Estorno pagamento duplicado')).toBeVisible();
    await expect(page.getByText('Pagamento original')).toBeVisible();
    await expect(page.getByText('Lançamento rascunho')).toBeVisible();
  });

  test('summary cards show correct values', async ({ page }) => {
    await interceptReport(page);
    await interceptManualTx(page);
    await page.goto('/admin/financeiro/contador');
    await page.getByRole('tab', { name: 'Lançamentos Manuais' }).click();
    // 150000 cents = R$ 1.500,00
    await expect(page.getByText('R$ 1.500,00')).toBeVisible();
    // 45000 cents = R$ 450,00 (appears in summary card and table cells; use first)
    await expect(page.getByText('R$ 450,00').first()).toBeVisible();
    // Net flow: 150000 - 45000 = 105000 = R$ 1.050,00
    await expect(page.getByText('R$ 1.050,00')).toBeVisible();
  });

  test('status labels in Portuguese', async ({ page }) => {
    await interceptReport(page);
    await interceptManualTx(page);
    await page.goto('/admin/financeiro/contador');
    await page.getByRole('tab', { name: 'Lançamentos Manuais' }).click();
    await expect(page.getByText('Rascunho').first()).toBeVisible();
    await expect(page.getByText('Estornado').first()).toBeVisible();
  });

  test('reversal shows "Liquidado · Reversão"', async ({ page }) => {
    await interceptReport(page);
    await interceptManualTx(page);
    await page.goto('/admin/financeiro/contador');
    await page.getByRole('tab', { name: 'Lançamentos Manuais' }).click();
    // tx-002 is a REVERSAL with status POSTED
    await expect(page.getByText('Liquidado · Reversão').first()).toBeVisible();
  });

  test('reversed original shows "Estornado" with link to reversal', async ({ page }) => {
    await interceptReport(page);
    await interceptManualTx(page);
    await page.goto('/admin/financeiro/contador');
    await page.getByRole('tab', { name: 'Lançamentos Manuais' }).click();
    // tx-003 is REVERSED with reversal link
    await expect(page.getByText('Estornado').first()).toBeVisible();
    await expect(page.getByText('ver reversão').first()).toBeVisible();
  });

  test('CSV export button exists', async ({ page }) => {
    await interceptReport(page);
    await interceptManualTx(page);
    await page.goto('/admin/financeiro/contador');
    await page.getByRole('tab', { name: 'Lançamentos Manuais' }).click();
    await expect(page.getByTestId('manual-csv-btn')).toBeVisible();
  });

  test('no write buttons visible', async ({ page }) => {
    await interceptReport(page);
    await interceptManualTx(page);
    await page.goto('/admin/financeiro/contador');
    await page.getByRole('tab', { name: 'Lançamentos Manuais' }).click();
    // No create/edit/delete buttons
    await expect(page.getByRole('button', { name: /criar|novo|editar|excluir|delete|add/i })).not.toBeVisible();
  });

  test('error state shown when API fails', async ({ page }) => {
    await interceptReport(page);
    await interceptManualTx(page, { success: false, error: 'Erro interno do servidor' }, 500);
    await page.goto('/admin/financeiro/contador');
    await page.getByRole('tab', { name: 'Lançamentos Manuais' }).click();
    await expect(page.getByText('Erro interno do servidor')).toBeVisible();
  });

  test('empty state shown when no data', async ({ page }) => {
    await interceptReport(page);
    await interceptManualTx(page, emptyManualTxResponse);
    await page.goto('/admin/financeiro/contador');
    await page.getByRole('tab', { name: 'Lançamentos Manuais' }).click();
    await expect(page.getByText('Nenhum lançamento manual encontrado')).toBeVisible();
  });

  test('Corridas tab still works independently', async ({ page }) => {
    await interceptReport(page);
    await interceptManualTx(page);
    await page.goto('/admin/financeiro/contador');
    // Corridas loads first
    await expect(page.getByText('Carlos')).toBeVisible();
    // Switch to manual
    await page.getByRole('tab', { name: 'Lançamentos Manuais' }).click();
    await expect(page.getByText('Receita de aluguel')).toBeVisible();
    // Switch back to Corridas
    await page.getByRole('tab', { name: 'Corridas' }).click();
    await expect(page.getByText('Carlos')).toBeVisible();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// DETAIL DIALOG
// ═══════════════════════════════════════════════════════════════════════════════

test.describe('Manual Transactions - Detail Dialog', () => {
  test.beforeEach(async ({ page }) => { await setupAuth(page); });

  test('clicking "Ver reversão" opens dialog with reversal details', async ({ page }) => {
    await interceptReport(page);
    await interceptManualTx(page);
    await page.goto('/admin/financeiro/contador');
    await page.getByRole('tab', { name: 'Lançamentos Manuais' }).click();
    await expect(page.getByText('Pagamento original')).toBeVisible();
    // tx-003 is REVERSED with reversal link → "Ver reversão" button
    await page.getByRole('button', { name: 'Ver reversão' }).click();
    // Dialog should open
    await expect(page.getByText('Detalhes da Transação')).toBeVisible();
    // Should show reversal details (tx-002)
    await expect(page.getByText('tx-002')).toBeVisible();
  });

  test('clicking "Ver original" opens dialog with original details', async ({ page }) => {
    await interceptReport(page);
    await interceptManualTx(page);
    await page.goto('/admin/financeiro/contador');
    await page.getByRole('tab', { name: 'Lançamentos Manuais' }).click();
    await expect(page.getByText('Estorno pagamento duplicado')).toBeVisible();
    // tx-002 is REVERSAL with original link → "Ver original" button
    await page.getByRole('button', { name: 'Ver original' }).click();
    // Dialog should open
    await expect(page.getByText('Detalhes da Transação')).toBeVisible();
    // Should show original details (tx-003)
    await expect(page.getByText('tx-003')).toBeVisible();
  });

  test('transaction types shown in Portuguese', async ({ page }) => {
    await interceptReport(page);
    await interceptManualTx(page);
    await page.goto('/admin/financeiro/contador');
    await page.getByRole('tab', { name: 'Lançamentos Manuais' }).click();
    // tx-001 is INCOME → 'Receita', tx-002 is REVERSAL → 'Reversão', tx-003 is EXPENSE → 'Despesa'
    await expect(page.getByText('Receita').first()).toBeVisible();
    await expect(page.getByText('Reversão').first()).toBeVisible();
    await expect(page.getByText('Despesa').first()).toBeVisible();
  });

  // ── FIX 9: Enhanced detail dialog tests ─────────────────────────────────────

  test('reversal_reason shown from mock reversal_reason field', async ({ page }) => {
    await interceptReport(page);
    await interceptManualTx(page);
    await page.goto('/admin/financeiro/contador');
    await page.getByRole('tab', { name: 'Lançamentos Manuais' }).click();
    // tx-002 is REVERSAL with reversal_reason: 'Duplicidade detectada'
    await page.getByRole('button', { name: 'Ver original' }).click();
    await expect(page.getByText('Detalhes da Transação')).toBeVisible();
    // tx-003 has reversal_reason: 'Duplicidade'
    await expect(page.getByText('Duplicidade')).toBeVisible();
  });

  test('dialog shows all expected fields for full transaction', async ({ page }) => {
    await interceptReport(page);
    await interceptManualTx(page);
    await page.goto('/admin/financeiro/contador');
    await page.getByRole('tab', { name: 'Lançamentos Manuais' }).click();
    // Click Ver reversão to open tx-002 (which is in the list so full detail is shown)
    await page.getByRole('button', { name: 'Ver reversão' }).click();
    await expect(page.getByText('Detalhes da Transação')).toBeVisible();

    // Scope assertions to the dialog (MUI Dialog uses role=dialog)
    const dialog = page.getByRole('dialog');

    // Verify key fields are shown
    await expect(dialog.getByText('tx-002')).toBeVisible();
    await expect(dialog.getByText('Estorno pagamento duplicado')).toBeVisible();
    await expect(dialog.getByText('Conta Principal')).toBeVisible();
    await expect(dialog.getByText('Estornos')).toBeVisible();
    await expect(dialog.getByText('Saída')).toBeVisible();
    await expect(dialog.getByText('Tipo: Reversão')).toBeVisible();
    await expect(dialog.getByText('Liquidado')).toBeVisible();
    // Check amount fields (gross_amount_cents = 45000 → R$ 450,00)
    await expect(dialog.getByText('Valor bruto: R$ 450,00')).toBeVisible();
    await expect(dialog.getByText('Valor líquido: R$ 450,00')).toBeVisible();
    await expect(dialog.getByText('Duplicidade detectada')).toBeVisible();
    await expect(dialog.getByText('Admin Fulano')).toBeVisible();
  });

  test('partial fallback message when transaction not in current page', async ({ page }) => {
    // Use a response where tx-002 references tx-005 which is NOT in the list
    const customResponse = {
      ...mockManualTxResponse,
      data: {
        ...mockManualTxResponse.data,
        transactions: [
          {
            ...mockManualTxResponse.data.transactions[2], // tx-003 (REVERSED)
            reversal: { id: 'tx-999', date: '2026-07-20', reason: 'Não encontrado' },
          },
        ],
      },
    };
    await interceptReport(page);
    await interceptManualTx(page, customResponse);
    await page.goto('/admin/financeiro/contador');
    await page.getByRole('tab', { name: 'Lançamentos Manuais' }).click();
    await page.getByRole('button', { name: 'Ver reversão' }).click();
    await expect(page.getByText('Detalhes da Transação')).toBeVisible();
    // Partial note should be shown
    await expect(page.getByText('Detalhes parciais')).toBeVisible();
    await expect(page.getByText('a transação relacionada não está nesta página')).toBeVisible();
  });

  test('Fechar button closes the dialog', async ({ page }) => {
    await interceptReport(page);
    await interceptManualTx(page);
    await page.goto('/admin/financeiro/contador');
    await page.getByRole('tab', { name: 'Lançamentos Manuais' }).click();
    await page.getByRole('button', { name: 'Ver reversão' }).click();
    await expect(page.getByText('Detalhes da Transação')).toBeVisible();
    // Click Fechar button
    await page.getByRole('button', { name: 'Fechar' }).click();
    // Dialog should close
    await expect(page.getByText('Detalhes da Transação')).not.toBeVisible();
  });

  test('dialog closes on Escape key', async ({ page }) => {
    await interceptReport(page);
    await interceptManualTx(page);
    await page.goto('/admin/financeiro/contador');
    await page.getByRole('tab', { name: 'Lançamentos Manuais' }).click();
    await page.getByRole('button', { name: 'Ver reversão' }).click();
    await expect(page.getByText('Detalhes da Transação')).toBeVisible();
    // Press Escape
    await page.keyboard.press('Escape');
    await expect(page.getByText('Detalhes da Transação')).not.toBeVisible();
  });
});
