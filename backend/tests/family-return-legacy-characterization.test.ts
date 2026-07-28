/**
 * Additional Characterization Tests for Family Return / Retorno Familiar
 *
 * Documents current behavior that will change when replaced by Annual Incentive:
 * 1. fee_debit does NOT generate annual incentive (currently no mechanism)
 * 2. pending_resolve does NOT generate annual incentive (currently no mechanism)
 * 3. /api/v2/drivers/me/family-return reads from family_return_accruals
 * 4. /api/v2/drivers/me/retorno-familiar uses driver_credit_purchases
 * 5. Legacy system prevents two requests in the same year
 * 6. Legacy system does not accept partial/custom amounts from driver
 * 7. Legacy system rejects suspended/inactive drivers
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Hoisted mock state (shared by all describe blocks) ---
const { poolQueryMock, authState, sqlLog } = vi.hoisted(() => {
  return {
    poolQueryMock: vi.fn(),
    authState: { driverId: 'driver-test-1' },
    sqlLog: [] as string[],
  };
});

vi.mock('../src/db', () => ({
  pool: {
    query: (...args: any[]) => poolQueryMock(...args),
    connect: vi.fn(async () => ({
      query: (...args: any[]) => poolQueryMock(...args),
      release: vi.fn(),
    })),
  },
}));

vi.mock('../src/middlewares/auth', () => ({
  authenticateDriver: (req: any, _res: any, next: any) => {
    req.driverId = authState.driverId;
    next();
  },
}));

// --- fee_debit and pending_resolve characterization (REAL service calls) ---

describe('Characterization: fee_debit does NOT generate annual incentive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolQueryMock.mockReset();
    sqlLog.length = 0;

    // Install mock that tracks all SQL and simulates wallet operations
    poolQueryMock.mockImplementation(async (sql: string, params?: any[]) => {
      sqlLog.push(sql);

      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };

      // Idempotency check
      if (sql.includes('SELECT id, balance_after_cents, reserved_after_cents FROM wallet_ledger WHERE idempotency_key')) {
        return { rows: [] }; // Not yet processed
      }

      // Lock wallet
      if (sql.includes('SELECT balance_cents, reserved_cents FROM driver_wallets WHERE driver_id') && sql.includes('FOR UPDATE')) {
        return { rows: [{ balance_cents: '10000', reserved_cents: '540' }] };
      }

      // Update wallet balance
      if (sql.includes('UPDATE driver_wallets SET')) {
        return { rows: [] };
      }

      // Insert ledger entry
      if (sql.includes('INSERT INTO wallet_ledger')) {
        return { rows: [{ id: '1001' }] };
      }

      return { rows: [] };
    });
  });

  it('WalletService.debitFee creates fee_debit entry but NEVER touches family_return_accruals', async () => {
    const { pool } = await import('../src/db');
    const { WalletService } = await import('../src/services/wallet-v2/wallet.service');
    const walletService = new WalletService(pool as any);

    // Execute the real debitFee service method
    const result = await walletService.debitFee(
      'driver-fee-test-1',
      BigInt(540),    // feeCents (18% of R$30 ride)
      BigInt(540),    // reservedCents
      'ride-fee-001'  // rideId
    );

    // Confirm fee_debit was created
    expect(result.already_processed).toBe(false);
    expect(result.id).toBe(BigInt(1001));

    // Confirm wallet_ledger INSERT was executed with entry_type='fee_debit'
    const ledgerInsert = sqlLog.find((s) => s.includes('INSERT INTO wallet_ledger'));
    expect(ledgerInsert).toBeDefined();

    // CRITICAL: Confirm NO reference to family_return_accruals anywhere in the SQL log
    const familyReturnQueries = sqlLog.filter((s) => s.includes('family_return_accruals'));
    expect(familyReturnQueries).toHaveLength(0);

    // Confirm no feature flag check was performed (not part of this flow)
    const featureFlagQueries = sqlLog.filter((s) => s.includes('feature_flags'));
    expect(featureFlagQueries).toHaveLength(0);
  });
});

describe('Characterization: pending_resolve does NOT generate annual incentive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    poolQueryMock.mockReset();
    sqlLog.length = 0;

    poolQueryMock.mockImplementation(async (sql: string, params?: any[]) => {
      sqlLog.push(sql);

      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };

      // Idempotency check
      if (sql.includes('SELECT id, balance_after_cents, reserved_after_cents FROM wallet_ledger WHERE idempotency_key')) {
        return { rows: [] };
      }

      // Lock wallet (with sufficient balance)
      if (sql.includes('SELECT balance_cents, reserved_cents FROM driver_wallets WHERE driver_id') && sql.includes('FOR UPDATE')) {
        return { rows: [{ balance_cents: '5000', reserved_cents: '0' }] };
      }

      // Update wallet
      if (sql.includes('UPDATE driver_wallets SET')) {
        return { rows: [] };
      }

      // Insert ledger entry
      if (sql.includes('INSERT INTO wallet_ledger')) {
        return { rows: [{ id: '2001' }] };
      }

      return { rows: [] };
    });
  });

  it('WalletService.debitPending creates pending_resolve entry but NEVER touches family_return_accruals', async () => {
    const { pool } = await import('../src/db');
    const { WalletService } = await import('../src/services/wallet-v2/wallet.service');
    const walletService = new WalletService(pool as any);

    // Execute the real debitPending service method
    const result = await walletService.debitPending(
      'driver-pending-test-1',
      BigInt(360),          // feeCents (pending fee from earlier ride)
      'pending-debit-001'   // pendingDebitId
    );

    // Confirm pending_resolve was created
    expect(result.already_processed).toBe(false);
    expect(result.id).toBe(BigInt(2001));

    // Confirm wallet_ledger INSERT was executed
    const ledgerInsert = sqlLog.find((s) => s.includes('INSERT INTO wallet_ledger'));
    expect(ledgerInsert).toBeDefined();

    // CRITICAL: Confirm NO reference to family_return_accruals anywhere in the SQL log
    const familyReturnQueries = sqlLog.filter((s) => s.includes('family_return_accruals'));
    expect(familyReturnQueries).toHaveLength(0);

    // Confirm no feature flag check was performed
    const featureFlagQueries = sqlLog.filter((s) => s.includes('feature_flags'));
    expect(featureFlagQueries).toHaveLength(0);
  });

  it('PendingDebitService.resolveOnRecharge resolves pending via debitPending without touching family_return_accruals', async () => {
    const { pool } = await import('../src/db');
    const { WalletService } = await import('../src/services/wallet-v2/wallet.service');
    const { PendingDebitService } = await import('../src/services/wallet-v2/pending-debit.service');
    const walletService = new WalletService(pool as any);
    const pendingDebitService = new PendingDebitService(pool as any);

    // Mock: pool.query for PendingDebitService queries (outside transaction)
    let callCount = 0;
    poolQueryMock.mockImplementation(async (sql: string, params?: any[]) => {
      sqlLog.push(sql);

      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [] };

      // PendingDebitService: find pending debits
      if (sql.includes("SELECT id, ride_id, fee_pending_cents, driver_id FROM pending_debits")) {
        return { rows: [{ id: '77', ride_id: 'ride-resolve-1', fee_pending_cents: '270', driver_id: 'driver-resolve-1' }] };
      }

      // WalletService idempotency check
      if (sql.includes('SELECT id, balance_after_cents, reserved_after_cents FROM wallet_ledger WHERE idempotency_key')) {
        return { rows: [] };
      }

      // Lock wallet
      if (sql.includes('SELECT balance_cents, reserved_cents FROM driver_wallets WHERE driver_id') && sql.includes('FOR UPDATE')) {
        return { rows: [{ balance_cents: '8000', reserved_cents: '0' }] };
      }

      // Update wallet
      if (sql.includes('UPDATE driver_wallets SET')) {
        return { rows: [] };
      }

      // Insert ledger
      if (sql.includes('INSERT INTO wallet_ledger')) {
        return { rows: [{ id: '3001' }] };
      }

      // Update pending_debits resolved
      if (sql.includes("UPDATE pending_debits SET status = 'resolved'")) {
        return { rows: [] };
      }

      // Fee split: markCollected
      if (sql.includes('ride_fee_splits')) {
        return { rows: [] };
      }

      // Update pending_debits attempts
      if (sql.includes('UPDATE pending_debits SET attempts')) {
        return { rows: [] };
      }

      return { rows: [] };
    });

    // Mock feeSplitService and territoryLedgerService
    const feeSplitService = { markCollected: vi.fn() };
    const territoryLedgerService = { recordFeeShare: vi.fn() };

    // Execute the real resolveOnRecharge flow
    const resolved = await pendingDebitService.resolveOnRecharge(
      'driver-resolve-1',
      walletService,
      feeSplitService,
      territoryLedgerService
    );

    expect(resolved).toBe(1);

    // CRITICAL: Confirm NO reference to family_return_accruals
    const familyReturnQueries = sqlLog.filter((s) => s.includes('family_return_accruals'));
    expect(familyReturnQueries).toHaveLength(0);

    // Confirm no feature flag check
    const featureFlagQueries = sqlLog.filter((s) => s.includes('feature_flags'));
    expect(featureFlagQueries).toHaveLength(0);
  });
});

// --- Endpoint characterization tests ---

describe('Characterization: /api/v2/drivers/me/family-return reads from family_return_accruals', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    poolQueryMock.mockReset();
    sqlLog.length = 0;
    authState.driverId = 'driver-endpoint-test-1';
    process.env.FAMILY_RETURN_PERCENT = '10';
    process.env.FAMILY_RETURN_REQUEST_START = '2026-10-01';
    process.env.FAMILY_RETURN_REQUEST_END = '2026-12-31';

    app = express();
    app.use(express.json());
    const route = (await import('../src/routes/driver-family-return')).default;
    app.use('/api/v2/drivers/me/family-return', route);
  });

  it('returns accrued_cents from family_return_accruals when feature is enabled', async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ enabled: true }] });
    poolQueryMock.mockResolvedValueOnce({ rows: [{ total: BigInt(1500) }] });

    const res = await request(app).get('/api/v2/drivers/me/family-return');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.enabled).toBe(true);
    expect(res.body.data.accrued_cents).toBe(1500);
    expect(res.body.data.percent).toBe(10);

    const sumCall = poolQueryMock.mock.calls[1];
    expect(sumCall[0]).toContain('family_return_accruals');
    expect(sumCall[1]).toContain('driver-endpoint-test-1');
  });

  it('returns enabled:false when feature flag is disabled', async () => {
    poolQueryMock.mockResolvedValueOnce({ rows: [{ enabled: false }] });

    const res = await request(app).get('/api/v2/drivers/me/family-return');

    expect(res.status).toBe(200);
    expect(res.body.data.enabled).toBe(false);
    expect(res.body.data.accrued_cents).toBe(0);
  });
});

// --- Legacy retorno-familiar characterization ---

describe('Characterization: /api/v2/drivers/me/retorno-familiar legacy rules', () => {
  let app: express.Express;

  beforeEach(async () => {
    vi.clearAllMocks();
    poolQueryMock.mockReset();
    sqlLog.length = 0;
    authState.driverId = 'driver-legacy-test-1';

    app = express();
    app.use(express.json());
    const route = (await import('../src/routes/driver-retorno-familiar')).default;
    app.use('/api/v2/drivers/me/retorno-familiar', route);
  });

  it('uses driver_credit_purchases for benefit calculation (not wallet_ledger)', async () => {
    const year = new Date().getFullYear();

    poolQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'policy-1', year, percent_rate: '10.00',
        request_start: '2026-01-01', request_end: '2026-12-31',
        is_active: true, max_per_driver_cents: null,
      }],
    });
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ total_paid_cents: '50000', total_purchases: '5' }],
    });
    poolQueryMock.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).get('/api/v2/drivers/me/retorno-familiar');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.summary.total_paid_cents).toBe(50000);
    expect(res.body.data.summary.estimated_return_cents).toBe(5000);

    const purchaseCall = poolQueryMock.mock.calls[1];
    expect(purchaseCall[0]).toContain('driver_credit_purchases');
    expect(purchaseCall[0]).not.toContain('wallet_ledger');
  });

  it('prevents two requests in the same year (duplicate rejection)', async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'policy-1', year: new Date().getFullYear(), percent_rate: '10.00',
        request_start: '2026-01-01', request_end: '2026-12-31',
        is_active: true, max_per_driver_cents: null,
      }],
    });
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'driver-legacy-test-1', status: 'approved', banned_at: null, deleted_at: null }],
    });
    poolQueryMock.mockResolvedValueOnce({ rows: [{ id: 'req-existing-1' }] });

    const res = await request(app).post('/api/v2/drivers/me/retorno-familiar/request');

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('já');
  });

  it('does not accept partial/custom amount from driver (full calculated amount only)', async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'policy-1', year: new Date().getFullYear(), percent_rate: '10.00',
        request_start: '2026-01-01', request_end: '2026-12-31',
        is_active: true, max_per_driver_cents: null,
      }],
    });
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'driver-legacy-test-1', status: 'approved', banned_at: null, deleted_at: null }],
    });
    poolQueryMock.mockResolvedValueOnce({ rows: [] });
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ total_paid_cents: '30000', total_purchases: '3' }],
    });
    poolQueryMock.mockResolvedValueOnce({ rows: [{ id: 'req-new-1' }] });

    const res = await request(app)
      .post('/api/v2/drivers/me/retorno-familiar/request')
      .send({ amount_cents: 1000 });

    expect(res.status).toBe(201);
    expect(res.body.data.calculated_return_cents).toBe(3000);
  });

  it('rejects request from suspended driver', async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'policy-1', year: new Date().getFullYear(), percent_rate: '10.00',
        request_start: '2026-01-01', request_end: '2026-12-31',
        is_active: true, max_per_driver_cents: null,
      }],
    });
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'driver-legacy-test-1', status: 'suspended', banned_at: null, deleted_at: null }],
    });

    const res = await request(app).post('/api/v2/drivers/me/retorno-familiar/request');

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('não elegível');
  });

  it('rejects request from banned driver', async () => {
    poolQueryMock.mockResolvedValueOnce({
      rows: [{
        id: 'policy-1', year: new Date().getFullYear(), percent_rate: '10.00',
        request_start: '2026-01-01', request_end: '2026-12-31',
        is_active: true, max_per_driver_cents: null,
      }],
    });
    poolQueryMock.mockResolvedValueOnce({
      rows: [{ id: 'driver-legacy-test-1', status: 'approved', banned_at: '2026-01-15', deleted_at: null }],
    });

    const res = await request(app).post('/api/v2/drivers/me/retorno-familiar/request');

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('não elegível');
  });
});
