/**
 * Characterization Test: Confirmed recharge generates family_return_accruals
 *
 * Documents the current behavior of the family return system:
 * - A confirmed recharge with FAMILY_RETURN_ENABLED + FAMILY_RETURN_PERCENT=10
 *   generates exactly one accrual record (10% of recharge amount).
 * - Re-processing the same recharge does NOT create a duplicate (idempotency).
 *
 * This test exists to prove the current behavior before it is replaced by the
 * Annual Incentive (Gratificação Anual) system.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- In-memory state simulating the database ---
type RechargeRow = {
  id: string;
  driver_id: string;
  amount_cents: number;
  status: 'pending' | 'confirmed' | 'expired';
  payment_provider: string;
  external_id: string | null;
};

type FamilyReturnAccrualRow = {
  id: string;
  driver_id: string;
  recharge_id: string;
  source_amount_cents: number;
  accrued_amount_cents: number;
  percent: number;
  status: string;
  idempotency_key: string;
};

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockGetSumUpCheckout = vi.fn();

const state = {
  recharges: {} as Record<string, RechargeRow>,
  familyReturnEnabled: true,
  accruals: [] as FamilyReturnAccrualRow[],
  nextAccrualId: 1,
};

function seedRecharge(partial: Partial<RechargeRow> & Pick<RechargeRow, 'id'>) {
  state.recharges[partial.id] = {
    id: partial.id,
    driver_id: partial.driver_id || 'driver-test-1',
    amount_cents: partial.amount_cents ?? 2000,
    status: partial.status || 'pending',
    payment_provider: partial.payment_provider || 'sumup',
    external_id: partial.external_id ?? 'checkout-fr-1',
  };
}

function installDbMock() {
  mockQuery.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [] };
    }

    // wallet_recharges SELECT FOR UPDATE (inside transaction)
    if (sql.includes('SELECT id, driver_id, amount_cents, status, payment_provider, external_id FROM wallet_recharges WHERE id = $1 FOR UPDATE')) {
      const row = state.recharges[params[0]];
      if (!row) return { rows: [] };
      return { rows: [{ ...row }] };
    }

    // wallet_recharges SELECT (initial lookup)
    if (sql.includes('SELECT id, driver_id, amount_cents, status, payment_provider, external_id FROM wallet_recharges WHERE id = $1')) {
      const row = state.recharges[params[0]];
      if (!row) return { rows: [] };
      if (params[1] && row.driver_id !== params[1]) return { rows: [] };
      return { rows: [{ ...row }] };
    }

    // Confirm recharge
    if (sql.includes("UPDATE wallet_recharges SET status = 'confirmed'")) {
      const row = state.recharges[params[0]];
      if (row && row.status === 'pending') row.status = 'confirmed';
      return { rows: [] };
    }

    // Feature flag check
    if (sql.includes("SELECT enabled FROM feature_flags WHERE key = 'FAMILY_RETURN_ENABLED'")) {
      return { rows: [{ enabled: state.familyReturnEnabled }] };
    }

    // Idempotency check for family_return_accruals
    if (sql.includes('SELECT id FROM family_return_accruals WHERE idempotency_key = $1')) {
      const existing = state.accruals.find((a) => a.idempotency_key === params[0]);
      return { rows: existing ? [{ id: existing.id }] : [] };
    }

    // INSERT into family_return_accruals
    if (sql.includes('INSERT INTO family_return_accruals')) {
      const accrual: FamilyReturnAccrualRow = {
        id: `fra-${state.nextAccrualId++}`,
        driver_id: params[0],
        recharge_id: params[1],
        source_amount_cents: Number(params[2]),
        accrued_amount_cents: Number(params[3]),
        percent: Number(params[4]),
        status: 'accrued',
        idempotency_key: params[5],
      };
      state.accruals.push(accrual);
      return { rows: [] };
    }

    // Expire recharge
    if (sql.includes("UPDATE wallet_recharges SET status = 'expired'")) {
      const row = state.recharges[params[0]];
      if (row && row.status === 'pending') row.status = 'expired';
      return { rows: [] };
    }

    return { rows: [] };
  });
}

// --- Module mocks ---
vi.mock('../src/db', () => ({
  pool: {
    query: (...args: any[]) => mockQuery(...args),
    connect: vi.fn(async () => ({
      query: (...args: any[]) => mockQuery(...args),
      release: () => mockRelease(),
    })),
  },
}));

vi.mock('../src/services/sumup-service', () => ({
  getSumUpCheckout: (...args: any[]) => mockGetSumUpCheckout(...args),
}));

vi.mock('../src/services/wallet-v2/wallet.service', () => ({
  WalletService: class {
    async ensureWallet() {}
    async creditRecharge() {
      return { id: BigInt(1), balance_after_cents: BigInt(0), reserved_after_cents: BigInt(0), already_processed: false };
    }
  },
}));

vi.mock('../src/services/wallet-v2/fee-split.service', () => ({
  FeeSplitService: class {},
}));

vi.mock('../src/services/wallet-v2/territory-ledger.service', () => ({
  TerritoryLedgerService: class {},
}));

vi.mock('../src/services/wallet-v2/pending-debit.service', () => ({
  PendingDebitService: class {
    async resolveOnRecharge() { return 0; }
  },
}));

// --- Tests ---
describe('Characterization: confirmed recharge generates family_return_accruals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRelease.mockReset();
    state.recharges = {};
    state.familyReturnEnabled = true;
    state.accruals = [];
    state.nextAccrualId = 1;
    process.env.FAMILY_RETURN_PERCENT = '10';
    installDbMock();
  });

  it('creates exactly one family_return_accrual record on confirmed R$20 recharge', async () => {
    // 1. Create a test recharge for R$20.00 (2000 cents)
    seedRecharge({
      id: 'rch-fr-test-1',
      driver_id: 'driver-fr-test-1',
      amount_cents: 2000,
      external_id: 'checkout-fr-test-1',
      status: 'pending',
    });

    // 2. SumUp returns PAID
    mockGetSumUpCheckout.mockResolvedValueOnce({ id: 'checkout-fr-test-1', status: 'PAID' });

    // 3. Execute the real post-confirmation flow
    const { reconcileSumUpRechargeById } = await import('../src/services/wallet-v2/sumup-recharge.service');
    const result = await reconcileSumUpRechargeById('rch-fr-test-1');

    // Confirm recharge was processed
    expect(result.final_status).toBe('confirmed');
    expect(result.credited).toBe(true);

    // 4. Verify exactly one family_return_accruals record
    expect(state.accruals).toHaveLength(1);

    // 5. Verify all fields
    const accrual = state.accruals[0];
    expect(accrual.source_amount_cents).toBe(2000);
    expect(accrual.accrued_amount_cents).toBe(200); // 10% of 2000
    expect(accrual.percent).toBe(10);
    expect(accrual.status).toBe('accrued');
    expect(accrual.driver_id).toBe('driver-fr-test-1');
    expect(accrual.recharge_id).toBe('rch-fr-test-1');
    expect(accrual.idempotency_key).toBe('family_return_accrual:rch-fr-test-1');
  });

  it('does NOT create a duplicate accrual when recharge is processed again (idempotency)', async () => {
    // Setup
    seedRecharge({
      id: 'rch-fr-idem-1',
      driver_id: 'driver-fr-idem-1',
      amount_cents: 2000,
      external_id: 'checkout-fr-idem-1',
      status: 'pending',
    });
    mockGetSumUpCheckout.mockResolvedValue({ id: 'checkout-fr-idem-1', status: 'PAID' });

    const { reconcileSumUpRechargeById } = await import('../src/services/wallet-v2/sumup-recharge.service');

    // First call: recharge confirmed, accrual created
    const first = await reconcileSumUpRechargeById('rch-fr-idem-1');
    expect(first.final_status).toBe('confirmed');
    expect(state.accruals).toHaveLength(1);

    // Second call: recharge already confirmed, applyRechargePostConfirmation is NOT called again
    // because reconcileSumUpRechargeById short-circuits when status != 'pending'
    const second = await reconcileSumUpRechargeById('rch-fr-idem-1');
    expect(second.final_status).toBe('confirmed');
    expect(second.credited).toBe(false);

    // Confirm still only 1 accrual
    expect(state.accruals).toHaveLength(1);
  });

  it('idempotency works even if applyRechargePostConfirmation is called directly twice', async () => {
    // This tests the idempotency_key check inside applyRechargePostConfirmation itself.
    // We simulate the scenario where the function is called twice for the same recharge
    // (e.g., retry after crash before state update).
    seedRecharge({
      id: 'rch-fr-retry-1',
      driver_id: 'driver-fr-retry-1',
      amount_cents: 2000,
      external_id: 'checkout-fr-retry-1',
      status: 'pending',
    });
    mockGetSumUpCheckout.mockResolvedValue({ id: 'checkout-fr-retry-1', status: 'PAID' });

    const { reconcileSumUpRechargeById } = await import('../src/services/wallet-v2/sumup-recharge.service');

    // First reconcile: creates accrual
    await reconcileSumUpRechargeById('rch-fr-retry-1');
    expect(state.accruals).toHaveLength(1);

    // Reset recharge to pending (simulating a crash recovery scenario)
    state.recharges['rch-fr-retry-1'].status = 'pending';

    // Second reconcile: should not create duplicate accrual
    await reconcileSumUpRechargeById('rch-fr-retry-1');
    expect(state.accruals).toHaveLength(1); // Still only 1 accrual
  });

  it('no accrual is created when FAMILY_RETURN_ENABLED is false', async () => {
    state.familyReturnEnabled = false;

    seedRecharge({
      id: 'rch-fr-disabled-1',
      driver_id: 'driver-fr-disabled-1',
      amount_cents: 2000,
      external_id: 'checkout-fr-disabled-1',
      status: 'pending',
    });
    mockGetSumUpCheckout.mockResolvedValueOnce({ id: 'checkout-fr-disabled-1', status: 'PAID' });

    const { reconcileSumUpRechargeById } = await import('../src/services/wallet-v2/sumup-recharge.service');
    const result = await reconcileSumUpRechargeById('rch-fr-disabled-1');

    expect(result.final_status).toBe('confirmed');
    expect(result.credited).toBe(true);
    expect(state.accruals).toHaveLength(0); // No accrual
  });

  it('no accrual is created when FAMILY_RETURN_PERCENT is 0', async () => {
    process.env.FAMILY_RETURN_PERCENT = '0';

    seedRecharge({
      id: 'rch-fr-zero-1',
      driver_id: 'driver-fr-zero-1',
      amount_cents: 2000,
      external_id: 'checkout-fr-zero-1',
      status: 'pending',
    });
    mockGetSumUpCheckout.mockResolvedValueOnce({ id: 'checkout-fr-zero-1', status: 'PAID' });

    const { reconcileSumUpRechargeById } = await import('../src/services/wallet-v2/sumup-recharge.service');
    const result = await reconcileSumUpRechargeById('rch-fr-zero-1');

    expect(result.final_status).toBe('confirmed');
    expect(state.accruals).toHaveLength(0); // No accrual when percent is 0
  });

  it('accrual amount uses Math.floor for fractional cents', async () => {
    // R$15.00 → 10% = 150 exactly (no rounding needed here)
    // R$33.33 → 10% = 333.3 → Math.floor → 333
    seedRecharge({
      id: 'rch-fr-floor-1',
      driver_id: 'driver-fr-floor-1',
      amount_cents: 3333,
      external_id: 'checkout-fr-floor-1',
      status: 'pending',
    });
    mockGetSumUpCheckout.mockResolvedValueOnce({ id: 'checkout-fr-floor-1', status: 'PAID' });

    const { reconcileSumUpRechargeById } = await import('../src/services/wallet-v2/sumup-recharge.service');
    await reconcileSumUpRechargeById('rch-fr-floor-1');

    expect(state.accruals).toHaveLength(1);
    expect(state.accruals[0].accrued_amount_cents).toBe(333); // Math.floor(3333 * 10 / 100)
  });
});
