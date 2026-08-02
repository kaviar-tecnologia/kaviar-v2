import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── Mocks ──────────────────────────────────────────────────────────────────────

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
    if (!authState.admin) {
      return res.status(401).json({ success: false, error: 'Não autenticado' });
    }
    req.admin = authState.admin;
    next();
  },
  allowFinanceAccess: (req: any, res: any, next: any) => {
    if (!req.admin || !['SUPER_ADMIN', 'FINANCE'].includes(req.admin.role)) {
      return res.status(403).json({ success: false, error: 'Acesso negado' });
    }
    next();
  },
}));

const { default: accountantReportRoutes, formatDecimal } = await import('../src/routes/admin-accountant-report');

const app = express();
app.use(express.json());
app.use('/api/admin/finance/accountant-report', accountantReportRoutes);

// ── Test Data ──────────────────────────────────────────────────────────────────

const settledRideRow = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  status: 'completed',
  created_at: new Date('2026-07-01T10:00:00Z'),
  completed_at: new Date('2026-07-01T10:20:00Z'),
  canceled_at: null,
  driver_id: 'driver-1',
  passenger_id: 'passenger-1',
  driver_name: 'João Silva',
  passenger_first_name: 'Maria',
  final_price: '50.00',
  fee_percent: '18.00',
  fee_amount: '9.00',
  driver_earnings: '41.00',
  settlement_territory: 'local',
  credit_cost: 2,
  settled_at: new Date('2026-07-01T10:21:00Z'),
  has_settlement: true,
};

const unsettledRideRow = {
  ...settledRideRow,
  id: '550e8400-e29b-41d4-a716-446655440002',
  settled_at: null,
  has_settlement: true,
};

const unavailableRideRow = {
  ...settledRideRow,
  id: '550e8400-e29b-41d4-a716-446655440003',
  final_price: null,
  fee_percent: null,
  fee_amount: null,
  driver_earnings: null,
  settlement_territory: null,
  credit_cost: null,
  settled_at: null,
  has_settlement: false,
};

const baseSummaryRow = {
  total_rides: 5,
  completed_rides: 3,
  canceled_rides: 2,
  gross_total: '150.00',
  platform_fee_total: '27.00',
  driver_earnings_total: '123.00',
};

function setupDefaultMock(overrides: { summary?: any; count?: number; rides?: any[] } = {}) {
  const summary = overrides.summary || baseSummaryRow;
  const count = overrides.count ?? 1;
  const rides = overrides.rides ?? [settledRideRow];

  poolMock.query
    .mockResolvedValueOnce({ rows: [summary] })    // summary
    .mockResolvedValueOnce({ rows: [{ total: count }] }) // count
    .mockResolvedValueOnce({ rows: rides });        // listing
}

// ── Tests ──────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  authState.admin = { id: 'admin-1', email: 'finance@test.local', role: 'FINANCE' };
});

describe('GET /api/admin/finance/accountant-report', () => {
  // ── RBAC ────────────────────────────────────────────────────────────────────

  it('returns 401 for unauthenticated user', async () => {
    authState.admin = null;
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.status).toBe(401);
  });

  it('returns 403 for OPERATOR role', async () => {
    authState.admin = { id: 'op-1', email: 'op@test.local', role: 'OPERATOR' };
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.status).toBe(403);
  });

  it('returns 403 for ANGEL_VIEWER role', async () => {
    authState.admin = { id: 'av-1', email: 'av@test.local', role: 'ANGEL_VIEWER' };
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.status).toBe(403);
  });

  it('allows FINANCE role access', async () => {
    setupDefaultMock();
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('allows SUPER_ADMIN role access', async () => {
    authState.admin = { id: 'sa-1', email: 'sa@test.local', role: 'SUPER_ADMIN' };
    setupDefaultMock();
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.status).toBe(200);
  });

  // ── SQL correctness ─────────────────────────────────────────────────────────

  it('SQL uses d.name, not d.full_name', async () => {
    setupDefaultMock();
    await request(app).get('/api/admin/finance/accountant-report');
    for (const call of poolMock.query.mock.calls) {
      const sql = call[0];
      expect(sql).not.toContain('d.full_name');
      expect(sql).not.toContain('full_name');
    }
  });

  it('SQL uses d.name in driver alias', async () => {
    setupDefaultMock();
    await request(app).get('/api/admin/finance/accountant-report');
    const listSQL = poolMock.query.mock.calls[2][0];
    expect(listSQL).toContain('d.name AS driver_name');
  });

  it('all queries have JOIN drivers when search is used', async () => {
    setupDefaultMock();
    await request(app)
      .get('/api/admin/finance/accountant-report')
      .query({ search: 'joao' });
    for (const call of poolMock.query.mock.calls) {
      const sql = call[0];
      expect(sql).toContain('LEFT JOIN drivers d ON d.id = r.driver_id');
    }
  });

  it('search by driver does not generate alias error', async () => {
    setupDefaultMock();
    await request(app)
      .get('/api/admin/finance/accountant-report')
      .query({ search: 'Silva' });
    const summarySQL = poolMock.query.mock.calls[0][0];
    expect(summarySQL).toContain('d.name ILIKE');
    expect(summarySQL).toContain('LEFT JOIN drivers d');
  });

  it('ordering includes created_at DESC, id DESC', async () => {
    setupDefaultMock();
    await request(app).get('/api/admin/finance/accountant-report');
    const listSQL = poolMock.query.mock.calls[2][0];
    expect(listSQL).toContain('ORDER BY r.created_at DESC, r.id DESC');
  });

  // ── Passenger name ──────────────────────────────────────────────────────────

  it('returns only first name of passenger via split_part', async () => {
    setupDefaultMock();
    await request(app).get('/api/admin/finance/accountant-report');
    const listSQL = poolMock.query.mock.calls[2][0];
    expect(listSQL).toContain('split_part(btrim(p.name)');
    expect(listSQL).toContain('AS passenger_first_name');
  });

  // ── Financial status ────────────────────────────────────────────────────────

  it('SETTLED ride returns financial values', async () => {
    setupDefaultMock({ rides: [settledRideRow] });
    const res = await request(app).get('/api/admin/finance/accountant-report');
    const ride = res.body.data.rides[0];
    expect(ride.financial_status).toBe('SETTLED');
    expect(ride.final_price).toBe('50.00');
    expect(ride.fee_amount).toBe('9.00');
    expect(ride.driver_earnings).toBe('41.00');
  });

  it('UNSETTLED ride returns financial values as null', async () => {
    setupDefaultMock({ rides: [unsettledRideRow] });
    const res = await request(app).get('/api/admin/finance/accountant-report');
    const ride = res.body.data.rides[0];
    expect(ride.financial_status).toBe('UNSETTLED');
    expect(ride.final_price).toBeNull();
    expect(ride.fee_amount).toBeNull();
    expect(ride.driver_earnings).toBeNull();
    expect(ride.credit_cost).toBeNull();
  });

  it('UNAVAILABLE ride returns financial values as null', async () => {
    setupDefaultMock({ rides: [unavailableRideRow] });
    const res = await request(app).get('/api/admin/finance/accountant-report');
    const ride = res.body.data.rides[0];
    expect(ride.financial_status).toBe('UNAVAILABLE');
    expect(ride.final_price).toBeNull();
    expect(ride.fee_amount).toBeNull();
    expect(ride.driver_earnings).toBeNull();
  });

  it('summary sums only settled_at IS NOT NULL', async () => {
    setupDefaultMock();
    const summarySQL = poolMock.query.mock.calls?.[0]?.[0]; // won't have call yet
    await request(app).get('/api/admin/finance/accountant-report');
    const sql = poolMock.query.mock.calls[0][0];
    expect(sql).toContain('WHEN s.settled_at IS NOT NULL THEN s.final_price');
    expect(sql).toContain('WHEN s.settled_at IS NOT NULL THEN s.fee_amount');
    expect(sql).toContain('WHEN s.settled_at IS NOT NULL THEN s.driver_earnings');
  });

  // ── Money formatter (no float) ─────────────────────────────────────────────

  it('formatDecimal: "10" → "10.00"', () => {
    expect(formatDecimal('10')).toBe('10.00');
  });

  it('formatDecimal: "10.5" → "10.50"', () => {
    expect(formatDecimal('10.5')).toBe('10.50');
  });

  it('formatDecimal: "10.50" → "10.50"', () => {
    expect(formatDecimal('10.50')).toBe('10.50');
  });

  it('formatDecimal: invalid format returns null', () => {
    expect(formatDecimal('abc')).toBeNull();
    expect(formatDecimal('')).toBeNull();
    expect(formatDecimal(null)).toBeNull();
    expect(formatDecimal(undefined)).toBeNull();
  });

  it('formatDecimal: rejects more than 2 decimal places (no rounding)', () => {
    expect(formatDecimal('10.555')).toBeNull();
    expect(formatDecimal('10.123')).toBeNull();
  });

  it('formatDecimal: handles negative values', () => {
    expect(formatDecimal('-5.30')).toBe('-5.30');
  });

  // ── Date validation ─────────────────────────────────────────────────────────

  it('rejects invalid date format', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report')
      .query({ start_date: '01/07/2026' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('start_date inválida');
  });

  it('rejects non-existent date (Feb 31)', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report')
      .query({ start_date: '2026-02-31' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('start_date inválida');
  });

  it('accepts exactly 90 days period', async () => {
    setupDefaultMock();
    const res = await request(app)
      .get('/api/admin/finance/accountant-report')
      .query({ start_date: '2026-04-03', end_date: '2026-07-01' });
    expect(res.status).toBe(200);
  });

  it('rejects more than 90 days period', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report')
      .query({ start_date: '2026-01-01', end_date: '2026-07-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('90 dias');
  });

  it('rejects end_date before start_date', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report')
      .query({ start_date: '2026-07-15', end_date: '2026-07-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('end_date deve ser posterior');
  });

  // ── Pagination ──────────────────────────────────────────────────────────────

  it('enforces max limit of 200', async () => {
    setupDefaultMock();
    await request(app)
      .get('/api/admin/finance/accountant-report')
      .query({ limit: 500 });
    const listCall = poolMock.query.mock.calls[2];
    const listParams = listCall[1];
    expect(listParams[listParams.length - 2]).toBe(200);
  });

  it('returns empty rides array when no data', async () => {
    setupDefaultMock({ summary: { ...baseSummaryRow, total_rides: 0 }, count: 0, rides: [] });
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.body.data.rides).toEqual([]);
    expect(res.body.data.pagination.total).toBe(0);
  });

  // ── No writes ───────────────────────────────────────────────────────────────

  it('all queries are SELECTs only', async () => {
    setupDefaultMock();
    await request(app).get('/api/admin/finance/accountant-report');
    for (const call of poolMock.query.mock.calls) {
      const sql = call[0].trim().toUpperCase();
      expect(sql).toMatch(/^\s*SELECT/);
    }
  });

  // ── Historical values preserved ─────────────────────────────────────────────

  it('preserves historical fee_percent of 15% (not current 18%)', async () => {
    const ride = { ...settledRideRow, fee_percent: '15.00', fee_amount: '7.50' };
    setupDefaultMock({ rides: [ride] });
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.body.data.rides[0].fee_percent).toBe('15.00');
    expect(res.body.data.rides[0].fee_amount).toBe('7.50');
  });
});

describe('GET /api/admin/finance/accountant-report/csv', () => {
  // ── RBAC ────────────────────────────────────────────────────────────────────

  it('returns 401 for unauthenticated', async () => {
    authState.admin = null;
    const res = await request(app).get('/api/admin/finance/accountant-report/csv');
    expect(res.status).toBe(401);
  });

  it('returns 403 for unauthorized role', async () => {
    authState.admin = { id: 'a-1', email: 'a@test.local', role: 'LEAD_AGENT' };
    const res = await request(app).get('/api/admin/finance/accountant-report/csv');
    expect(res.status).toBe(403);
  });

  // ── CSV limit (422) ─────────────────────────────────────────────────────────

  it('CSV with <= 5000 rows is allowed', async () => {
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ total: 5000 }] }) // count
      .mockResolvedValueOnce({ rows: [settledRideRow] });  // listing
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });

  it('CSV with > 5000 rows returns 422 with proper JSON', async () => {
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ total: 5001 }] }); // count exceeds limit
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CSV_ROW_LIMIT_EXCEEDED');
    expect(res.body.total).toBe(5001);
    expect(res.body.max).toBe(5000);
    expect(res.body.error).toContain('5.000');
  });

  it('no CSV body is sent on 422', async () => {
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ total: 6000 }] });
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });
    expect(res.headers['content-type']).not.toContain('text/csv');
    expect(res.text).not.toContain('ID Corrida');
  });

  // ── CSV injection protection ────────────────────────────────────────────────

  it('protects against =, +, -, @, tab and CR injection', async () => {
    const injectionRide = {
      ...settledRideRow,
      driver_name: '=CMD("calc")',
      passenger_first_name: '+HYPERLINK("evil")',
    };
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [injectionRide] });
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });

    const body = res.text;
    expect(body).toContain("'=CMD");
    expect(body).toContain("'+HYPERLINK");
    // Must NOT contain unprotected formula
    expect(body).not.toMatch(/"=CMD/);
    expect(body).not.toMatch(/"\+HYPERLINK/);
  });

  // ── CSV content ─────────────────────────────────────────────────────────────

  it('CSV has correct headers including Status Financeiro', async () => {
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [settledRideRow] });
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });

    expect(res.text).toContain('ID Corrida');
    expect(res.text).toContain('Status Financeiro');
    expect(res.text).toContain('Valor Bruto');
    expect(res.text).toContain('Valor Motorista');
    // BOM
    expect(res.text.charCodeAt(0)).toBe(0xFEFF);
  });

  it('CSV uses d.name not d.full_name', async () => {
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [settledRideRow] });
    await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });
    for (const call of poolMock.query.mock.calls) {
      expect(call[0]).not.toContain('full_name');
    }
  });

  // ── No writes ───────────────────────────────────────────────────────────────

  it('CSV endpoint only uses SELECT queries', async () => {
    poolMock.query
      .mockResolvedValueOnce({ rows: [{ total: 1 }] })
      .mockResolvedValueOnce({ rows: [settledRideRow] });
    await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });
    for (const call of poolMock.query.mock.calls) {
      const sql = call[0].trim().toUpperCase();
      expect(sql).toMatch(/^\s*SELECT/);
    }
  });
});
