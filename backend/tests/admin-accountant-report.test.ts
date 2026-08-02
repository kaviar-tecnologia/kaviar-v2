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

const { default: accountantReportRoutes } = await import('../src/routes/admin-accountant-report');

const app = express();
app.use(express.json());
app.use('/api/admin/finance/accountant-report', accountantReportRoutes);

// ── Test Data ──────────────────────────────────────────────────────────────────

const baseSummaryRow = {
  total_rides: 5,
  completed_rides: 3,
  canceled_rides: 2,
  gross_total: '150.00',
  platform_fee_total: '27.00',
  driver_earnings_total: '123.00',
};

const baseRideRow = {
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
};

function setupDefaultPoolMock(overrides: { summary?: any; count?: number; rides?: any[] } = {}) {
  const summary = overrides.summary || baseSummaryRow;
  const count = overrides.count ?? 1;
  const rides = overrides.rides ?? [baseRideRow];

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
  it('returns 401 for unauthenticated user', async () => {
    authState.admin = null;
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.status).toBe(401);
  });

  it('returns 403 for user without FINANCE or SUPER_ADMIN role', async () => {
    authState.admin = { id: 'op-1', email: 'op@test.local', role: 'OPERATOR' };
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.status).toBe(403);
  });

  it('allows FINANCE role access', async () => {
    setupDefaultPoolMock();
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('allows SUPER_ADMIN role access', async () => {
    authState.admin = { id: 'sa-1', email: 'sa@test.local', role: 'SUPER_ADMIN' };
    setupDefaultPoolMock();
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('returns correct summary structure', async () => {
    setupDefaultPoolMock();
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.body.data.summary).toMatchObject({
      total_rides: 5,
      completed_rides: 3,
      canceled_rides: 2,
      gross_total: '150.00',
      platform_fee_total: '27.00',
      driver_earnings_total: '123.00',
    });
    expect(res.body.data.summary.period).toBeDefined();
    expect(res.body.data.summary.period.start).toBeDefined();
    expect(res.body.data.summary.period.end).toBeDefined();
  });

  it('returns correct pagination structure', async () => {
    setupDefaultPoolMock({ count: 100 });
    const res = await request(app)
      .get('/api/admin/finance/accountant-report')
      .query({ page: 2, limit: 25 });
    expect(res.body.data.pagination).toMatchObject({
      page: 2,
      limit: 25,
      total: 100,
      totalPages: 4,
    });
  });

  it('applies date filters', async () => {
    setupDefaultPoolMock();
    await request(app)
      .get('/api/admin/finance/accountant-report')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });

    const firstCall = poolMock.query.mock.calls[0];
    expect(firstCall[1][0]).toBeInstanceOf(Date); // startDate param
    expect(firstCall[1][1]).toBeInstanceOf(Date); // endDate param
  });

  it('applies status filter', async () => {
    setupDefaultPoolMock();
    await request(app)
      .get('/api/admin/finance/accountant-report')
      .query({ status: 'completed' });

    const firstCall = poolMock.query.mock.calls[0];
    const sql = firstCall[0];
    expect(sql).toContain('r.status = $');
    expect(firstCall[1]).toContain('completed');
  });

  it('rejects period longer than 90 days', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report')
      .query({ start_date: '2026-01-01', end_date: '2026-07-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('90 dias');
  });

  it('rejects invalid start_date', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report')
      .query({ start_date: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('start_date inválida');
  });

  it('rejects end_date before start_date', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report')
      .query({ start_date: '2026-07-15', end_date: '2026-07-01' });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('end_date deve ser posterior');
  });

  it('returns empty rides array when no data', async () => {
    setupDefaultPoolMock({ summary: { ...baseSummaryRow, total_rides: 0 }, count: 0, rides: [] });
    const res = await request(app).get('/api/admin/finance/accountant-report');
    expect(res.body.data.rides).toEqual([]);
    expect(res.body.data.pagination.total).toBe(0);
  });

  it('preserves historical values without recalculation', async () => {
    const rideWithHistoric = {
      ...baseRideRow,
      fee_percent: '15.00', // Historic 15% (not current 18%)
      fee_amount: '7.50',
      driver_earnings: '42.50',
      final_price: '50.00',
    };
    setupDefaultPoolMock({ rides: [rideWithHistoric] });
    const res = await request(app).get('/api/admin/finance/accountant-report');
    const ride = res.body.data.rides[0];
    expect(ride.fee_percent).toBe('15.00');
    expect(ride.fee_amount).toBe('7.50');
    expect(ride.driver_earnings).toBe('42.50');
  });

  it('handles null financial fields gracefully', async () => {
    const rideWithNulls = {
      ...baseRideRow,
      final_price: null,
      fee_percent: null,
      fee_amount: null,
      driver_earnings: null,
      settlement_territory: null,
      credit_cost: null,
      settled_at: null,
    };
    setupDefaultPoolMock({ rides: [rideWithNulls] });
    const res = await request(app).get('/api/admin/finance/accountant-report');
    const ride = res.body.data.rides[0];
    expect(ride.final_price).toBeNull();
    expect(ride.fee_amount).toBeNull();
    expect(ride.driver_earnings).toBeNull();
    expect(ride.settlement_territory).toBeNull();
  });

  it('enforces max limit of 200', async () => {
    setupDefaultPoolMock();
    await request(app)
      .get('/api/admin/finance/accountant-report')
      .query({ limit: 500 });

    // Check that the listing query received limit=200
    const listingCall = poolMock.query.mock.calls[2]; // 3rd call = listing
    const listingParams = listingCall[1];
    expect(listingParams[listingParams.length - 2]).toBe(200); // limit param
  });

  it('does not perform any write operations', async () => {
    setupDefaultPoolMock();
    await request(app).get('/api/admin/finance/accountant-report');
    // All pool.query calls should be SELECTs
    for (const call of poolMock.query.mock.calls) {
      const sql = call[0].trim().toUpperCase();
      expect(sql).toMatch(/^SELECT/);
    }
  });
});

describe('GET /api/admin/finance/accountant-report/csv', () => {
  it('returns 401 for unauthenticated user', async () => {
    authState.admin = null;
    const res = await request(app).get('/api/admin/finance/accountant-report/csv');
    expect(res.status).toBe(401);
  });

  it('returns 403 for unauthorized role', async () => {
    authState.admin = { id: 'angel-1', email: 'angel@test.local', role: 'ANGEL_VIEWER' };
    const res = await request(app).get('/api/admin/finance/accountant-report/csv');
    expect(res.status).toBe(403);
  });

  it('returns CSV content with correct headers', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [baseRideRow] });
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('kaviar-relatorio-contador');
    expect(res.headers['content-disposition']).toContain('.csv');

    const body = res.text;
    // BOM check (UTF-8 BOM)
    expect(body.charCodeAt(0)).toBe(0xFEFF);
    // Header row
    expect(body).toContain('ID Corrida');
    expect(body).toContain('Valor Bruto');
    expect(body).toContain('Taxa Plataforma');
    expect(body).toContain('Valor Motorista');
  });

  it('protects against CSV injection', async () => {
    const injectionRide = {
      ...baseRideRow,
      driver_name: '=CMD("calc")',
      passenger_first_name: '+HYPERLINK("evil")',
    };
    poolMock.query.mockResolvedValueOnce({ rows: [injectionRide] });
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });

    const body = res.text;
    // Values starting with = or + should be prefixed with apostrophe
    expect(body).toContain("'=CMD");
    expect(body).toContain("'+HYPERLINK");
    expect(body).not.toMatch(/"=CMD/);
    expect(body).not.toMatch(/"\+HYPERLINK/);
  });

  it('limits CSV to 5000 rows', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [] });
    await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });

    const queryCall = poolMock.query.mock.calls[0];
    const params = queryCall[1];
    expect(params[params.length - 1]).toBe(5000);
  });

  it('rejects invalid period', async () => {
    const res = await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-01-01', end_date: '2026-07-01' });
    expect(res.status).toBe(400);
  });

  it('does not perform any write operations', async () => {
    poolMock.query.mockResolvedValueOnce({ rows: [baseRideRow] });
    await request(app)
      .get('/api/admin/finance/accountant-report/csv')
      .query({ start_date: '2026-07-01', end_date: '2026-07-15' });

    for (const call of poolMock.query.mock.calls) {
      const sql = call[0].trim().toUpperCase();
      expect(sql).toMatch(/^SELECT/);
    }
  });
});
