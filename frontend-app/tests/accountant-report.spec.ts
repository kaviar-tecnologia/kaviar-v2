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
        fee_amount: null, driver_earnings: null, settlement_territory: null,
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
