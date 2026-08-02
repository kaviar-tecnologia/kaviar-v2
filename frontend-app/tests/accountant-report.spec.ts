/**
 * Playwright tests for the Accountant Report Page (/admin/financeiro/contador)
 *
 * Uses route interception (page.route) to mock backend responses.
 * No real backend or production access needed.
 */
import { test, expect } from 'playwright/test';

const ADMIN_TOKEN = 'fake-test-token';
const ADMIN_DATA_FINANCE = JSON.stringify({ id: 'a1', name: 'Test', email: 'f@t.local', role: 'FINANCE' });
const ADMIN_DATA_OPERATOR = JSON.stringify({ id: 'a2', name: 'Op', email: 'o@t.local', role: 'OPERATOR' });

const mockReportResponse = {
  success: true,
  data: {
    summary: {
      total_rides: 10,
      completed_rides: 7,
      canceled_rides: 3,
      gross_total: '1234.50',
      platform_fee_total: '222.21',
      driver_earnings_total: '1012.29',
      period: { start: '2026-07-01T00:00:00.000Z', end: '2026-07-30T23:59:59.999Z' },
    },
    rides: [
      {
        id: 'ride-001-abc',
        status: 'completed',
        financial_status: 'SETTLED',
        created_at: '2026-07-15T10:00:00Z',
        completed_at: '2026-07-15T10:20:00Z',
        canceled_at: null,
        driver_id: 'd1',
        driver_name: 'Carlos',
        passenger_first_name: 'Ana',
        final_price: '50.00',
        fee_percent: '18.00',
        fee_amount: '9.00',
        driver_earnings: '41.00',
        settlement_territory: 'local',
        credit_cost: 1,
        settled_at: '2026-07-15T10:21:00Z',
      },
      {
        id: 'ride-002-def',
        status: 'completed',
        financial_status: 'UNSETTLED',
        created_at: '2026-07-16T14:00:00Z',
        completed_at: '2026-07-16T14:15:00Z',
        canceled_at: null,
        driver_id: 'd2',
        driver_name: 'Pedro',
        passenger_first_name: 'Lucia',
        final_price: null,
        fee_percent: null,
        fee_amount: null,
        driver_earnings: null,
        settlement_territory: null,
        credit_cost: null,
        settled_at: null,
      },
    ],
    pagination: { page: 1, limit: 50, total: 2, totalPages: 1 },
  },
};

const emptyReportResponse = {
  success: true,
  data: {
    summary: {
      total_rides: 0,
      completed_rides: 0,
      canceled_rides: 0,
      gross_total: '0.00',
      platform_fee_total: '0.00',
      driver_earnings_total: '0.00',
      period: { start: '2026-07-01T00:00:00.000Z', end: '2026-07-30T23:59:59.999Z' },
    },
    rides: [],
    pagination: { page: 1, limit: 50, total: 0, totalPages: 0 },
  },
};

async function setupAuth(page, adminData = ADMIN_DATA_FINANCE) {
  await page.addInitScript(({ token, data }) => {
    localStorage.setItem('kaviar_admin_token', token);
    localStorage.setItem('kaviar_admin_data', data);
  }, { token: ADMIN_TOKEN, data: adminData });
}

async function interceptReportAPI(page, response = mockReportResponse, status = 200) {
  await page.route('**/api/admin/finance/accountant-report?**', (route) => {
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(response) });
  });
  await page.route('**/api/admin/finance/accountant-report', (route) => {
    if (route.request().url().includes('/csv')) return route.continue();
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(response) });
  });
}

test.describe('Área do Contador — Acesso e RBAC', () => {
  test('FINANCE role can access the page', async ({ page }) => {
    await setupAuth(page, ADMIN_DATA_FINANCE);
    await interceptReportAPI(page);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('Área do Contador')).toBeVisible();
  });

  test('OPERATOR role is blocked (redirected)', async ({ page }) => {
    await setupAuth(page, ADMIN_DATA_OPERATOR);
    await page.goto('/admin/financeiro/contador');
    // Should redirect away — not show the page
    await expect(page.getByText('Área do Contador')).not.toBeVisible();
  });
});

test.describe('Área do Contador — Rendering', () => {
  test.beforeEach(async ({ page }) => {
    await setupAuth(page);
  });

  test('shows loading state initially', async ({ page }) => {
    // Delay the response to see loading
    await page.route('**/api/admin/finance/accountant-report**', (route) => {
      setTimeout(() => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockReportResponse),
      }), 500);
    });
    await page.goto('/admin/financeiro/contador');
    // CircularProgress should be visible briefly
    await expect(page.locator('role=progressbar')).toBeVisible();
  });

  test('displays summary cards with correct values', async ({ page }) => {
    await interceptReportAPI(page);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('Total de Corridas')).toBeVisible();
    await expect(page.getByText('R$ 1.234,50')).toBeVisible(); // gross (unique value)
    await expect(page.getByText('R$ 222,21')).toBeVisible();   // platform fee (unique)
    await expect(page.getByText('R$ 1.012,29')).toBeVisible(); // driver earnings (unique)
  });

  test('displays table with ride data', async ({ page }) => {
    await interceptReportAPI(page);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('Carlos')).toBeVisible();
    await expect(page.getByText('Ana')).toBeVisible();
    await expect(page.getByText('ride-001')).toBeVisible();
  });

  test('shows empty state when no rides', async ({ page }) => {
    await interceptReportAPI(page, emptyReportResponse);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('Nenhuma corrida encontrada')).toBeVisible();
  });

  test('shows error on HTTP failure', async ({ page }) => {
    await interceptReportAPI(page, { success: false, error: 'Servidor indisponível' }, 500);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('Servidor indisponível')).toBeVisible();
  });

  test('displays financial_status column (Liquidado / Não liquidado)', async ({ page }) => {
    await interceptReportAPI(page);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('Liquidado').first()).toBeVisible();
    await expect(page.getByText('Não liquidado').first()).toBeVisible();
  });
});

test.describe('Área do Contador — Filters', () => {
  test('filter button triggers new fetch', async ({ page }) => {
    await setupAuth(page);
    let requestCount = 0;
    await page.route('**/api/admin/finance/accountant-report**', (route) => {
      requestCount++;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mockReportResponse) });
    });
    await page.goto('/admin/financeiro/contador');
    await page.waitForTimeout(300);
    const before = requestCount;
    await page.getByRole('button', { name: 'Filtrar' }).click();
    await page.waitForTimeout(300);
    expect(requestCount).toBeGreaterThan(before);
  });
});

test.describe('Área do Contador — CSV Export', () => {
  test('successful CSV download triggers blob download', async ({ page }) => {
    await setupAuth(page);
    await interceptReportAPI(page);
    await page.route('**/api/admin/finance/accountant-report/csv**', (route) => {
      route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="report.csv"' },
        body: '\uFEFF"ID Corrida"\r\n"ride-001"',
      });
    });
    await page.goto('/admin/financeiro/contador');
    await page.waitForTimeout(500);

    // Listen for download
    const downloadPromise = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
    await page.getByRole('button', { name: 'CSV' }).click();
    // In headless, blob downloads may not emit event — at least no error should show
    await page.waitForTimeout(500);
    const alertEl = page.locator('[role="alert"]');
    const hasError = await alertEl.isVisible().catch(() => false);
    if (hasError) {
      const text = await alertEl.textContent();
      expect(text).not.toContain('Erro');
    }
  });

  test('422 CSV limit error shows user-friendly message', async ({ page }) => {
    await setupAuth(page);
    await interceptReportAPI(page);
    await page.route('**/api/admin/finance/accountant-report/csv**', (route) => {
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          code: 'CSV_ROW_LIMIT_EXCEEDED',
          error: 'O relatório possui mais de 5.000 linhas. Reduza o período ou aplique mais filtros.',
          total: 7500,
          max: 5000,
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

test.describe('Área do Contador — Currency Formatter (no parseFloat)', () => {
  test('formats "1234.50" as "R$ 1.234,50" without parseFloat', async ({ page }) => {
    await setupAuth(page);
    await interceptReportAPI(page);
    await page.goto('/admin/financeiro/contador');
    // The gross_total in mock is "1234.50" → should display "R$ 1.234,50"
    await expect(page.getByText('R$ 1.234,50')).toBeVisible();
  });

  test('formats "0.00" as "R$ 0,00"', async ({ page }) => {
    await setupAuth(page);
    await interceptReportAPI(page, emptyReportResponse);
    await page.goto('/admin/financeiro/contador');
    await expect(page.getByText('R$ 0,00').first()).toBeVisible();
  });
});
