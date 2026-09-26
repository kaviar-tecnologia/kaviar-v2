import { beforeEach, describe, expect, it, vi } from 'vitest';

type RechargeRow = {
  id: string;
  driver_id: string;
  amount_cents: number;
  status: 'pending' | 'confirmed' | 'expired';
  payment_provider: string;
  external_id: string | null;
  created_at: number;
};

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockGetSumUpCheckout = vi.fn();

let walletEnsureCalls = 0;
let walletCreditCalls = 0;
let walletCreditShouldThrow = false;

const state: {
  recharges: Record<string, RechargeRow>;
  familyReturnEnabled: boolean;
  familyReturnExists: boolean;
} = {
  recharges: {},
  familyReturnEnabled: false,
  familyReturnExists: false,
};

function seedRecharge(partial: Partial<RechargeRow> & Pick<RechargeRow, 'id'>) {
  state.recharges[partial.id] = {
    id: partial.id,
    driver_id: partial.driver_id || 'driver-1',
    amount_cents: partial.amount_cents ?? 2500,
    status: partial.status || 'pending',
    payment_provider: partial.payment_provider || 'sumup',
    external_id: partial.external_id ?? 'checkout-1',
    created_at: partial.created_at ?? Date.now(),
  };
}

function paidCheckout(checkoutId: string, rechargeId: string, amount = 25) {
  return {
    id: checkoutId,
    status: 'PAID',
    checkout_reference: `wallet_v2:${rechargeId}`,
    amount,
    currency: 'BRL',
    merchant_code: 'TEST_MERCHANT',
  };
}

function installDbMock() {
  mockQuery.mockImplementation(async (sql: string, params: any[] = []) => {
    if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') {
      return { rows: [] };
    }

    if (sql.includes('SELECT id, driver_id, amount_cents, status, payment_provider, external_id FROM wallet_recharges WHERE id = $1 FOR UPDATE')) {
      const rechargeId = params[0];
      const row = state.recharges[rechargeId];
      if (!row) return { rows: [] };
      return {
        rows: [{
          id: row.id,
          driver_id: row.driver_id,
          amount_cents: row.amount_cents,
          status: row.status,
          payment_provider: row.payment_provider,
          external_id: row.external_id,
        }],
      };
    }

    if (sql.includes('SELECT id, driver_id, amount_cents, status, payment_provider, external_id FROM wallet_recharges WHERE id = $1')) {
      const rechargeId = params[0];
      const expectedDriverId = params[1];
      const row = state.recharges[rechargeId];
      if (!row) return { rows: [] };
      if (expectedDriverId && row.driver_id !== expectedDriverId) return { rows: [] };
      return {
        rows: [{
          id: row.id,
          driver_id: row.driver_id,
          amount_cents: row.amount_cents,
          status: row.status,
          payment_provider: row.payment_provider,
          external_id: row.external_id,
        }],
      };
    }

    if (sql.includes("UPDATE wallet_recharges SET status = 'confirmed'")) {
      const rechargeId = params[0];
      const row = state.recharges[rechargeId];
      if (!row || row.status !== 'pending') return { rows: [] };
      row.status = 'confirmed';
      return {
        rows: [{
          id: row.id,
          driver_id: row.driver_id,
          amount_cents: row.amount_cents,
        }],
      };
    }

    if (sql.includes("UPDATE wallet_recharges SET status = 'expired'")) {
      const rechargeId = params[0];
      const row = state.recharges[rechargeId];
      if (row && row.status === 'pending') row.status = 'expired';
      return { rows: [] };
    }

    if (sql.includes('SELECT id FROM wallet_recharges WHERE external_id = $1')) {
      const externalId = params[0];
      const candidates = Object.values(state.recharges)
        .filter((row) => row.external_id === externalId && row.payment_provider === 'sumup')
        .sort((a, b) => b.created_at - a.created_at);
      if (!candidates[0]) return { rows: [] };
      return { rows: [{ id: candidates[0].id }] };
    }

    if (sql.includes("SELECT id FROM wallet_recharges WHERE payment_provider='sumup' AND status='pending'")) {
      const limit = Number(params[1] || 50);
      const pending = Object.values(state.recharges)
        .filter((row) => row.payment_provider === 'sumup' && row.status === 'pending' && row.external_id)
        .sort((a, b) => a.created_at - b.created_at)
        .slice(0, limit)
        .map((row) => ({ id: row.id }));
      return { rows: pending };
    }

    if (sql.includes("SELECT enabled FROM feature_flags WHERE key = 'FAMILY_RETURN_ENABLED'")) {
      return { rows: [{ enabled: state.familyReturnEnabled }] };
    }

    if (sql.includes('SELECT id FROM family_return_accruals WHERE idempotency_key = $1')) {
      return { rows: state.familyReturnExists ? [{ id: 'fr-1' }] : [] };
    }

    if (sql.includes('INSERT INTO family_return_accruals')) {
      state.familyReturnExists = true;
      return { rows: [] };
    }

    return { rows: [] };
  });
}

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
  SumUpError: class extends Error {
    constructor(readonly statusCode: number, readonly safeMessage: string) {
      super(safeMessage);
    }
  },
}));

vi.mock('../src/services/wallet-v2/wallet.service', () => ({
  WalletService: class {
    constructor(_pool: any) {}

    async ensureWallet(_driverId: string) {
      walletEnsureCalls += 1;
    }

    async creditRecharge(_driverId: string, _amount: bigint, _rechargeId: string) {
      walletCreditCalls += 1;
      if (walletCreditShouldThrow) {
        throw new Error('CREDIT_RECHARGE_FAILED');
      }
      return {
        id: BigInt(1),
        balance_after_cents: BigInt(0),
        reserved_after_cents: BigInt(0),
        already_processed: false,
      };
    }
  },
}));

vi.mock('../src/services/wallet-v2/fee-split.service', () => ({
  FeeSplitService: class {
    constructor(_pool: any) {}
  },
}));

vi.mock('../src/services/wallet-v2/territory-ledger.service', () => ({
  TerritoryLedgerService: class {
    constructor(_pool: any) {}
  },
}));

vi.mock('../src/services/wallet-v2/pending-debit.service', () => ({
  PendingDebitService: class {
    constructor(_pool: any) {}

    async resolveOnRecharge() {
      return 0;
    }
  },
}));

describe('sumup-recharge.service', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockRelease.mockReset();
    walletEnsureCalls = 0;
    walletCreditCalls = 0;
    walletCreditShouldThrow = false;
    state.recharges = {};
    state.familyReturnEnabled = false;
    state.familyReturnExists = false;
    installDbMock();
    process.env.FAMILY_RETURN_PERCENT = '0';
    process.env.SUMUP_MERCHANT_CODE = 'TEST_MERCHANT';
    await vi.resetModules();
  });

  it('1) PAID confirma e credita saldo uma única vez', async () => {
    seedRecharge({ id: 'rch-paid-1', status: 'pending', external_id: 'checkout-paid-1' });
    mockGetSumUpCheckout.mockResolvedValueOnce(paidCheckout('checkout-paid-1', 'rch-paid-1'));

    const { reconcileSumUpRechargeById } = await import('../src/services/wallet-v2/sumup-recharge.service');
    const result = await reconcileSumUpRechargeById('rch-paid-1');

    expect(result.final_status).toBe('confirmed');
    expect(result.credited).toBe(true);
    expect(state.recharges['rch-paid-1'].status).toBe('confirmed');
    expect(walletEnsureCalls).toBe(1);
    expect(walletCreditCalls).toBe(1);
  });

  it('2) PAID repetido é idempotente e não duplica crédito', async () => {
    seedRecharge({ id: 'rch-idem-1', status: 'pending', external_id: 'checkout-idem-1' });
    mockGetSumUpCheckout.mockResolvedValue(paidCheckout('checkout-idem-1', 'rch-idem-1'));

    const { reconcileSumUpRechargeById } = await import('../src/services/wallet-v2/sumup-recharge.service');

    const first = await reconcileSumUpRechargeById('rch-idem-1');
    const second = await reconcileSumUpRechargeById('rch-idem-1');

    expect(first.final_status).toBe('confirmed');
    expect(first.credited).toBe(true);
    expect(second.final_status).toBe('confirmed');
    expect(second.credited).toBe(false);
    expect(walletCreditCalls).toBe(1);
    expect(mockGetSumUpCheckout).toHaveBeenCalledTimes(1);
  });

  it('3) FAILED expira sem crédito financeiro', async () => {
    seedRecharge({ id: 'rch-failed-1', status: 'pending', external_id: 'checkout-failed-1' });
    mockGetSumUpCheckout.mockResolvedValueOnce({ id: 'checkout-failed-1', status: 'FAILED' });

    const { reconcileSumUpRechargeById } = await import('../src/services/wallet-v2/sumup-recharge.service');
    const result = await reconcileSumUpRechargeById('rch-failed-1');

    expect(result.final_status).toBe('expired');
    expect(result.credited).toBe(false);
    expect(state.recharges['rch-failed-1'].status).toBe('expired');
    expect(walletCreditCalls).toBe(0);
  });

  it('4) EXPIRED expira sem crédito financeiro', async () => {
    seedRecharge({ id: 'rch-expired-1', status: 'pending', external_id: 'checkout-expired-1' });
    mockGetSumUpCheckout.mockResolvedValueOnce({ id: 'checkout-expired-1', status: 'EXPIRED' });

    const { reconcileSumUpRechargeById } = await import('../src/services/wallet-v2/sumup-recharge.service');
    const result = await reconcileSumUpRechargeById('rch-expired-1');

    expect(result.final_status).toBe('expired');
    expect(result.credited).toBe(false);
    expect(state.recharges['rch-expired-1'].status).toBe('expired');
    expect(walletCreditCalls).toBe(0);
  });

  it('5) status não confirmado permanece pendente e não credita antes de PAID', async () => {
    seedRecharge({ id: 'rch-pending-1', status: 'pending', external_id: 'checkout-pending-1' });
    mockGetSumUpCheckout.mockResolvedValueOnce({ id: 'checkout-pending-1', status: 'PENDING' });

    const { reconcileSumUpRechargeById } = await import('../src/services/wallet-v2/sumup-recharge.service');
    const result = await reconcileSumUpRechargeById('rch-pending-1');

    expect(result.final_status).toBe('pending');
    expect(result.credited).toBe(false);
    expect(state.recharges['rch-pending-1'].status).toBe('pending');
    expect(walletCreditCalls).toBe(0);
  });

  it('6) reconcile por external_id respeita idempotência quando repetido', async () => {
    seedRecharge({ id: 'rch-ext-1', status: 'pending', external_id: 'checkout-ext-1' });
    mockGetSumUpCheckout.mockResolvedValue(paidCheckout('checkout-ext-1', 'rch-ext-1'));

    const { reconcileSumUpRechargeByExternalId } = await import('../src/services/wallet-v2/sumup-recharge.service');
    const first = await reconcileSumUpRechargeByExternalId('checkout-ext-1');
    const second = await reconcileSumUpRechargeByExternalId('checkout-ext-1');

    expect(first.credited).toBe(true);
    expect(second.credited).toBe(false);
    expect(walletCreditCalls).toBe(1);
  });

  it('7) erro durante crédito não deve deixar recarga falsamente concluída', async () => {
    seedRecharge({ id: 'rch-credit-error-1', status: 'pending', external_id: 'checkout-credit-error-1' });
    mockGetSumUpCheckout.mockResolvedValueOnce(paidCheckout('checkout-credit-error-1', 'rch-credit-error-1'));
    walletCreditShouldThrow = true;

    const { reconcileSumUpRechargeById } = await import('../src/services/wallet-v2/sumup-recharge.service');

    await expect(reconcileSumUpRechargeById('rch-credit-error-1')).rejects.toThrow('CREDIT_RECHARGE_FAILED');
    expect(state.recharges['rch-credit-error-1'].status).toBe('pending');
  });
  it.each([
    ['checkout desconhecido', { id: 'checkout-other' }],
    ['referência divergente', { checkout_reference: 'wallet_v2:another' }],
    ['valor diferente', { amount: 26 }],
    ['moeda diferente', { currency: 'USD' }],
    ['merchant diferente', { merchant_code: 'OTHER_MERCHANT' }],
    ['sem montante', { amount: undefined }],
    ['fração de centavo', { amount: 25.001 }],
  ])('8) PAID com %s é bloqueado sem crédito', async (_reason, mismatch) => {
    seedRecharge({ id: 'rch-mismatch-1', external_id: 'checkout-mismatch-1' });
    mockGetSumUpCheckout.mockResolvedValueOnce({
      ...paidCheckout('checkout-mismatch-1', 'rch-mismatch-1'),
      ...mismatch,
    });

    const { reconcileSumUpRechargeById } = await import('../src/services/wallet-v2/sumup-recharge.service');
    await expect(reconcileSumUpRechargeById('rch-mismatch-1')).rejects.toMatchObject({ statusCode: 502 });
    expect(walletCreditCalls).toBe(0);
    expect(state.recharges['rch-mismatch-1'].status).toBe('pending');
  });

  it('9) sem merchant configurado falha fechado', async () => {
    seedRecharge({ id: 'rch-no-merchant', external_id: 'checkout-no-merchant' });
    mockGetSumUpCheckout.mockResolvedValueOnce(paidCheckout('checkout-no-merchant', 'rch-no-merchant'));
    delete process.env.SUMUP_MERCHANT_CODE;
    const { reconcileSumUpRechargeById } = await import('../src/services/wallet-v2/sumup-recharge.service');
    await expect(reconcileSumUpRechargeById('rch-no-merchant')).rejects.toMatchObject({ statusCode: 502 });
    expect(walletCreditCalls).toBe(0);
  });

});