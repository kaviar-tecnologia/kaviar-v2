import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeeSplitService } from '../src/services/wallet-v2/fee-split.service';
import { WalletSettlementService } from '../src/services/wallet-v2/wallet-settlement.service';

vi.mock('../src/services/wallet-v2/settlement-gate', () => ({
  assertSettlementActive: vi.fn(),
}));

const ride = { rideId: 'ride-wait-445', driverId: 'driver-445', finalPriceCents: 2150n, feeBaseCents: 2000n, reservedCents: 360n };
const row = {
  id: '1', ride_id: ride.rideId, driver_id: ride.driverId, final_price_cents: '2150',
  fee_amount_cents: '360', matrix_share_cents: '360', manager_share_cents: '0',
  reference_month: '2026-09', territory_id: null, manager_id: null, manager_assignment_id: null,
  recognized_at: new Date('2026-09-29T12:00:00Z'), platform_fee_rate_bps: 1800,
  manager_commission_rate_bps: 0, fee_collected_cents: '360', fee_pending_cents: '0',
  collection_status: 'collected',
};

function makeService(availableCents = 1000n) {
  const client = {
    query: vi.fn(async (sql: string) => sql.includes('clock_timestamp')
      ? { rows: [{ ts: new Date('2026-09-29T12:00:00Z') }] }
      : { rows: [], rowCount: 1 }),
    release: vi.fn(),
  };
  const pool = { connect: vi.fn(async () => client) };
  const feeSplit = {
    getExistingSnapshot: vi.fn(async () => null as any),
    calculateSplit: (amount: bigint, platform: number, manager: number) =>
      new FeeSplitService(pool as any).calculateSplit(amount, platform, manager),
    recordSplitInClient: vi.fn(async () => ({ territoryId: null })),
  };
  const wallet = {
    getLockedBalance: vi.fn(async () => ({ balance_cents: availableCents, reserved_cents: ride.reservedCents })),
    releaseReserveInClient: vi.fn(),
  };
  const debit = { debitFeeInClient: vi.fn() };
  const pending = { createInClient: vi.fn() };
  const territory = { recordCollectedFeeInClient: vi.fn() };
  const service = new WalletSettlementService(pool as any, wallet as any, feeSplit as any, territory as any, pending as any, debit as any);
  return { service, client, feeSplit, wallet, debit, pending, territory };
}

describe('CARE-445 — Wallet V2 fee base is locked fare, not total including wait', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps total R$21.50 but debits only R$3.60 (18% of locked R$20)', async () => {
    const s = makeService();
    await s.service.settleRide(ride);
    expect(s.debit.debitFeeInClient).toHaveBeenCalledWith(
      s.client, ride.driverId, 360n, ride.reservedCents, ride.rideId,
    );
    expect(s.feeSplit.recordSplitInClient).toHaveBeenCalledWith(s.client, expect.objectContaining({
      finalPriceCents: 2150n, feeBaseCents: 2000n, feeCollectedCents: 360n, feePendingCents: 0n,
    }));
    expect(s.client.query).toHaveBeenCalledWith('COMMIT');
  });

  it('keeps total amount and base fee in partial and pending records', async () => {
    const s = makeService(100n);
    await s.service.settleRide(ride);
    expect(s.pending.createInClient).toHaveBeenCalledWith(s.client, expect.objectContaining({
      finalPriceCents: 2150n, feeAmountCents: 360n, feeCollectedCents: 100n,
    }));
    expect(s.feeSplit.recordSplitInClient).toHaveBeenCalledWith(s.client, expect.objectContaining({
      finalPriceCents: 2150n, feeBaseCents: 2000n, feeCollectedCents: 100n, feePendingCents: 260n,
    }));
  });

  it('does not alter the no-wait default fee calculation for existing callers', async () => {
    const s = makeService();
    await s.service.settleRide({ rideId: ride.rideId, driverId: ride.driverId, finalPriceCents: 2150n, reservedCents: 387n });
    expect(s.debit.debitFeeInClient).toHaveBeenCalledWith(s.client, ride.driverId, 387n, 387n, ride.rideId);
  });

  it('checks the persisted fee on retry, refusing same final price but different fee base', async () => {
    const s = makeService();
    s.feeSplit.getExistingSnapshot.mockResolvedValueOnce({
      driverId: ride.driverId, finalPriceCents: 2150n, feeAmountCents: 387n,
      territoryId: null, collectionStatus: 'collected',
    });
    await expect(s.service.settleRide(ride)).rejects.toMatchObject({ code: 'FEE_SPLIT_IDEMPOTENCY_MISMATCH' });
    expect(s.debit.debitFeeInClient).not.toHaveBeenCalled();
    expect(s.client.query).toHaveBeenCalledWith('ROLLBACK');
  });

  it('rejects impossible fee bases before touching a wallet or ledger', async () => {
    const s = makeService();
    await expect(s.service.settleRide({ ...ride, feeBaseCents: 2200n }))
      .rejects.toMatchObject({ code: 'WALLET_FEE_BASE_INVALID' });
    expect(s.debit.debitFeeInClient).not.toHaveBeenCalled();
  });

  it('records a total-price snapshot while calculating fee from base in one split', async () => {
    const feeSplit = new FeeSplitService({} as any);
    const client = { query: vi.fn(async () => ({ rows: [row] })) };
    await feeSplit.recordSplitInClient(client as any, {
      rideId: ride.rideId, driverId: ride.driverId, finalPriceCents: 2150n, feeBaseCents: 2000n,
      territoryId: null, managerId: null, managerAssignmentId: null,
      recognizedAt: new Date('2026-09-29T12:00:00Z'), referenceMonth: '2026-09',
      platformFeeRateBps: 1800, managerCommissionRateBps: 0,
      feeCollectedCents: 360n, feePendingCents: 0n, collectionStatus: 'collected',
    });
    const values = client.query.mock.calls[0][1] as string[];
    expect(values[2]).toBe('2150'); // total still recorded
    expect(values[3]).toBe('360'); // base-only fee
  });
});
