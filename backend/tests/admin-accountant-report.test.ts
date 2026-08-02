import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { poolMock, authState } = vi.hoisted(() => {
  return {
    poolMock: { query: vi.fn() },
    authState: {
      admin: { id: 'admin-1', email: 'finance@test.local', role: 'FINANCE' } as any,
    },
  };
});

vi.mock('../src/db', () => ({ pool: poolMock }));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, res: any, next: any) => {
    if (!authState.admin) return res.status(401).json({ success: false, error: 'Não autenticado' });
    req.admin = authState.admin;
    next();
  },
  allowFinanceAccess: (req: any, res: any, next: any) => {
    if (!req.admin || !['SUPER_ADMIN', 'FINANCE'].includes(req.admin.role))
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    next();
  },
}));

const { default: routes, formatDecimal, requireFinancialDecimal, FinancialDataIntegrityError } =
  await import('../src/routes/admin-accountant-report');

const app = express();
app.use(express.json());
app.use('/api/admin/finance/accountant-report', routes);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const settledRow = {
  id: 'ride-001', status: 'completed',
  created_at: new Date('2026-07-01T10:00:00Z'), completed_at: new Date('2026-07-01T10:20:00Z'),
  canceled_at: null, driver_id: 'd1', passenger_id: 'p1',
  driver_name: 'João', passenger_first_name: 'Ana',
  final_price: '50.00', fee_percent: '18.00', fee_amount: '9.00', driver_earnings: '41.00',
  settlement_territory: 'local', credit_cost: 2,
  settled_at: new Date('2026-07-01T10:21:00Z'), has_settlement: true,
};

const unsettledRow = { ...settledRow, id: 'ride-002', settled_at: null, has_settlement: true };
const unavailableRow = {
  ...settledRow, id: 'ride-003', final_price: null, fee_percent: null,
  fee_amount: null, driver_earnings: null, settlement_territory: null,
  credit_cost: null, settled_at: null, has_settlement: false,
};

const validSummary = {
  total_rides: 3, completed_rides: 2, canceled_rides: 1,
  gross_total: '100.00', platform_fee_total: '18.00', driver_earnings_total: '82.00',
};

function setupListingMock(overrides: { summary?: any; count?: number; rides?: any[] } = {}) {
  const summary = overrides.summary || validSummary;
  const count = overrides.count ?? 1;
  const rides = overrides.rides ?? [settledRow];
  poolMock.query
    .mockResolvedValueOnce({ rows: [summary] })
    .mockResolvedValueOnce({ rows: [{ total: count }] })
    .mockResolvedValueOnce({ rows: rides });
}

beforeEach(() => {
  vi.clearAllMocks();
  authState.admin = { id: 'admin-1', email: 'finance@test.local', role: 'FINANCE' };
});

// ═══════════════════════════════════════════════════════════════════════════════
// RBAC
// ═══════════════════════════════════════════════════════════════════════════════

describe('RBAC', () => {
  it('401 for unauthenticated', async () => {
    authState.admin = null;
    expect((await request(app).get('/api/admin/finance/accountant-report')).status).toBe(401);
  });
  it('403 for OPERATOR', async () => {
    authState.admin = { id: 'x', email: 'x', role: 'OPERATOR' };
    expect((await request(app).get('/api/admin/finance/accountant-report')).status).toBe(403);
  });
  it('403 for ANGEL_VIEWER', async () => {
    authState.admin = { id: 'x', email: 'x', role: 'ANGEL_VIEWER' };
    expect((await request(app).get('/api/admin/finance/accountant-report')).status).toBe(403);
  });
  it('200 for FINANCE', async () => {
    setupListingMock();
    expect((await request(app).get('/api/admin/finance/accountant-report')).status).toBe(200);
  });
  it('200 for SUPER_ADMIN', async () => {
    authState.admin = { id: 'x', email: 'x', role: 'SUPER_ADMIN' };
    setupListingMock();
    expect((await request(app).get('/api/admin/finance/accountant-report')).status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// FAIL-CLOSED DECIMAL VALIDATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('requireFinancialDecimal fail-closed', () => {
  it('SETTLED with invalid final_price → 500', async () => {
    const badRow = { ...settledRow, final_price: 'abc' };
    setupListingMock({ rides: [badRow] });
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('FINANCIAL_DATA_INVALID');
  });

  it('SETTLED with null fee_amount → 500', async () => {
    const badRow = { ...settledRow, fee_amount: null };
    setupListingMock({ rides: [badRow] });
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('FINANCIAL_DATA_INVALID');
  });

  it('SETTLED with 3 decimal places in driver_earnings → 500', async () => {
    const badRow = { ...settledRow, driver_earnings: '41.123' };
    setupListingMock({ rides: [badRow] });
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('FINANCIAL_DATA_INVALID');
  });

  it('summary with invalid decimal → 500, never 0.00', async () => {
    const badSummary = { ...validSummary, gross_total: 'NaN' };
    setupListingMock({ summary: badSummary });
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.status).toBe(500);
    expect(res.body.code).toBe('FINANCIAL_DATA_INVALID');
    // Never returns 0.00 for invalid
    expect(res.body).not.toHaveProperty('data');
  });

  it('summary with valid zero → "0.00"', async () => {
    const zeroSummary = { ...validSummary, gross_total: '0', platform_fee_total: '0', driver_earnings_total: '0' };
    setupListingMock({ summary: zeroSummary, rides: [] });
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.status).toBe(200);
    expect(res.body.data.summary.gross_total).toBe('0.00');
    expect(res.body.data.summary.platform_fee_total).toBe('0.00');
    expect(res.body.data.summary.driver_earnings_total).toBe('0.00');
  });

  it('UNSETTLED with absent values → 200 with null', async () => {
    setupListingMock({ rides: [unsettledRow] });
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.status).toBe(200);
    const ride = res.body.data.rides[0];
    expect(ride.financial_status).toBe('UNSETTLED');
    expect(ride.final_price).toBeNull();
    expect(ride.fee_amount).toBeNull();
  });

  it('UNAVAILABLE → 200 with null', async () => {
    setupListingMock({ rides: [unavailableRow] });
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.status).toBe(200);
    const ride = res.body.data.rides[0];
    expect(ride.financial_status).toBe('UNAVAILABLE');
    expect(ride.final_price).toBeNull();
  });

  it('error does not expose the invalid financial value', async () => {
    const badRow = { ...settledRow, final_price: 'SECRETVALUE123' };
    setupListingMock({ rides: [badRow] });
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain('SECRETVALUE123');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CSV SINGLE QUERY
// ═══════════════════════════════════════════════════════════════════════════════

describe('CSV single query (CTE)', () => {
  it('uses exactly one pool.query call', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ ...settledRow, total_filtered: 1 }] });
    await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });
    expect(poolMock.query).toHaveBeenCalledTimes(1);
  });

  it('SQL contains COUNT(*) OVER()', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ ...settledRow, total_filtered: 1 }] });
    await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });
    const sql = poolMock.query.mock.calls[0][0];
    expect(sql).toContain('COUNT(*) OVER()');
  });

  it('SQL contains LIMIT 5001', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ ...settledRow, total_filtered: 1 }] });
    await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });
    const sql = poolMock.query.mock.calls[0][0];
    expect(sql).toContain('5001');
  });

  it('SQL has ORDER BY created_at DESC, id DESC', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ ...settledRow, total_filtered: 1 }] });
    await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });
    const sql = poolMock.query.mock.calls[0][0];
    expect(sql).toContain('ORDER BY created_at DESC, id DESC');
  });

  it('CSV with total_filtered=5000 exports all', async () => {
    const rows = Array.from({ length: 5000 }, (_, i) => ({
      ...settledRow, id: `ride-${i}`, total_filtered: 5000,
    }));
    poolMock.query.mockResolvedValueOnce({ rows });
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('CSV with total_filtered=5001 returns 422', async () => {
    const rows = Array.from({ length: 5001 }, (_, i) => ({
      ...settledRow, id: `ride-${i}`, total_filtered: 5001,
    }));
    poolMock.query.mockResolvedValueOnce({ rows });
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CSV_ROW_LIMIT_EXCEEDED');
    expect(res.body.total).toBe(5001);
  });

  it('422 does not send CSV content', async () => {
    const rows = Array.from({ length: 5001 }, (_, i) => ({
      ...settledRow, id: `ride-${i}`, total_filtered: 5001,
    }));
    poolMock.query.mockResolvedValueOnce({ rows });
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });
    expect(res.headers['content-type']).not.toContain('text/csv');
    expect(res.text).not.toContain('ID Corrida');
  });

  it('CSV only uses SELECT queries', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [{ ...settledRow, total_filtered: 1 }] });
    await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });
    for (const call of poolMock.query.mock.calls) {
      expect(call[0].trim().toUpperCase()).toMatch(/^\s*WITH|^\s*SELECT/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// formatDecimal unit tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('formatDecimal', () => {
  it('"10" → "10.00"', () => expect(formatDecimal('10')).toBe('10.00'));
  it('"10.5" → "10.50"', () => expect(formatDecimal('10.5')).toBe('10.50'));
  it('"10.50" → "10.50"', () => expect(formatDecimal('10.50')).toBe('10.50'));
  it('"0" → "0.00"', () => expect(formatDecimal('0')).toBe('0.00'));
  it('"-5.30" → "-5.30"', () => expect(formatDecimal('-5.30')).toBe('-5.30'));
  it('"abc" → null', () => expect(formatDecimal('abc')).toBeNull());
  it('"10.555" → null (>2 decimals)', () => expect(formatDecimal('10.555')).toBeNull());
  it('null → null', () => expect(formatDecimal(null)).toBeNull());
  it('"" → null', () => expect(formatDecimal('')).toBeNull());
});

describe('requireFinancialDecimal', () => {
  it('valid → normalized string', () => {
    expect(requireFinancialDecimal('10', 'x')).toBe('10.00');
    expect(requireFinancialDecimal('10.5', 'x')).toBe('10.50');
  });
  it('null → throws FinancialDataIntegrityError', () => {
    expect(() => requireFinancialDecimal(null, 'field')).toThrow(FinancialDataIntegrityError);
  });
  it('invalid → throws FinancialDataIntegrityError', () => {
    expect(() => requireFinancialDecimal('abc', 'field')).toThrow(FinancialDataIntegrityError);
  });
  it('>2 decimals → throws', () => {
    expect(() => requireFinancialDecimal('10.123', 'field')).toThrow(FinancialDataIntegrityError);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Date validation
// ═══════════════════════════════════════════════════════════════════════════════

describe('Date validation', () => {
  it('rejects invalid format', async () => {
    const res = await request(app).get('/api/admin/finance/accountant-report').query({ start_date: '2026/07/01' });
    expect(res.status).toBe(400);
  });
  it('rejects non-existent Feb 31', async () => {
    const res = await request(app).get('/api/admin/finance/accountant-report').query({ start_date: '2026-02-31' });
    expect(res.status).toBe(400);
  });
  it('accepts exactly 90 days', async () => {
    setupListingMock();
    const res = await request(app).get('/api/admin/finance/accountant-report').query({ start_date: '2026-04-03', end_date: '2026-07-01' });
    expect(res.status).toBe(200);
  });
  it('rejects > 90 days', async () => {
    const res = await request(app).get('/api/admin/finance/accountant-report').query({ start_date: '2026-01-01', end_date: '2026-07-01' });
    expect(res.status).toBe(400);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// CSV injection
// ═══════════════════════════════════════════════════════════════════════════════

describe('CSV injection protection', () => {
  it('protects =, +, -, @, tab, CR', async () => {
    const injRow = {
      ...settledRow, driver_name: '=CMD()', passenger_first_name: '+X',
      total_filtered: 1,
    };
    poolMock.query.mockResolvedValueOnce({ rows: [injRow] });
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });
    expect(res.text).toContain("'=CMD");
    expect(res.text).toContain("'+X");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Only SELECTs in listing
// ═══════════════════════════════════════════════════════════════════════════════

describe('No writes', () => {
  it('listing uses only SELECTs', async () => {
    setupListingMock();
    await request(app).get('/api/admin/finance/accountant-report');
    for (const call of poolMock.query.mock.calls) {
      expect(call[0].trim().toUpperCase()).toMatch(/^\s*SELECT/);
    }
  });
});
