import { describe, it, expect, beforeEach, vi } from "vitest";
import { PendingDebitService } from '../../src/services/wallet-v2/pending-debit.service';

const mockQuery = vi.fn();
const mockRelease = vi.fn();
const mockPool = {
  query: mockQuery,
  connect: vi.fn(() => ({ query: mockQuery, release: mockRelease })),
} as any;

beforeEach(() => { mockQuery.mockReset(); mockRelease.mockReset(); });

describe('PendingDebitService', () => {
  const svc = new PendingDebitService(mockPool);

  it('create registers pending with invariant', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: '1' }] });
    const r = await svc.create({ rideId: 'r1', driverId: 'd1', finalPriceCents: 3000n, feeAmountCents: 540n, reservedCents: 540n });
    expect(r.already_processed).toBe(false);
  });

  it('create idempotent', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1' }] });
    const r = await svc.create({ rideId: 'r1', driverId: 'd1', finalPriceCents: 3000n, feeAmountCents: 540n, reservedCents: 540n });
    expect(r.already_processed).toBe(true);
  });

  it('resolveOnRecharge validates split before debit', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: '1', ride_id: 'r1', fee_pending_cents: '540', driver_id: 'd1' }] }) // find pendings
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ id: '1', ride_id: 'r1', driver_id: 'd1', fee_pending_cents: '540', fee_collected_cents: '0', fee_amount_cents: '540', status: 'pending' }] }) // lock pending
      .mockResolvedValueOnce({ rows: [{ ride_id: 'r1', driver_id: 'd1', territory_id: 't1', manager_id: 'm1', manager_assignment_id: 'a1', fee_amount_cents: '540', fee_collected_cents: '0', fee_pending_cents: '540', manager_commission_rate_bps: 4000, reference_month: '2026-07', collection_status: 'pending' }] }) // lock split
      // After validation: executor, update pending, markCollected, load split for ledger, ledger insert, COMMIT
      .mockResolvedValueOnce({ rows: [] }) // UPDATE pending_debits
      .mockResolvedValueOnce({ rowCount: 1 }) // markCollectedInClient
      .mockResolvedValueOnce({ rows: [{ id: '10', idempotency_key: 'k1', entry_type: 'platform_fee', amount_cents: '540', territory_id: 't1', manager_id: 'm1', manager_assignment_id: 'a1', reference_month: '2026-07', reference_id: 'r1', reference_type: 'ride' }, { id: '11', idempotency_key: 'k2', entry_type: 'fee_share', amount_cents: '216', territory_id: 't1', manager_id: 'm1', manager_assignment_id: 'a1', reference_month: '2026-07', reference_id: 'r1', reference_type: 'ride' }] }) // ledger insert
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const mockExecutor = {
      resolvePendingInClient: vi.fn().mockResolvedValue({ walletResult: { id: 99n }, incentiveResult: null, skippedReason: null }),
    };
    const mockFeeSplit = { markCollectedInClient: vi.fn().mockResolvedValue(undefined) };
    const mockLedger = { recordCollectedFeeInClient: vi.fn().mockResolvedValue({ platformEntryId: 10n, shareEntryId: 11n }) };

    const count = await svc.resolveOnRecharge('d1', mockExecutor, mockFeeSplit as any, mockLedger as any);
    expect(count).toBe(1);
    expect(mockExecutor.resolvePendingInClient).toHaveBeenCalled();
    expect(mockFeeSplit.markCollectedInClient).toHaveBeenCalled();
    expect(mockLedger.recordCollectedFeeInClient).toHaveBeenCalled();
  });

  it('resolveOnRecharge throws PENDING_DEBIT_SPLIT_MISSING if no split', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: '1', ride_id: 'r1', fee_pending_cents: '540', driver_id: 'd1' }] })
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ id: '1', ride_id: 'r1', driver_id: 'd1', fee_pending_cents: '540', fee_collected_cents: '0', fee_amount_cents: '540', status: 'pending' }] }) // lock pending
      .mockResolvedValueOnce({ rows: [] }) // lock split — EMPTY
      .mockResolvedValueOnce({ rows: [] }); // ROLLBACK

    const mockExecutor = { resolvePendingInClient: vi.fn() };

    await expect(svc.resolveOnRecharge('d1', mockExecutor, {} as any, {} as any))
      .rejects.toMatchObject({ code: 'PENDING_DEBIT_SPLIT_MISSING' });
    expect(mockExecutor.resolvePendingInClient).not.toHaveBeenCalled();
  });

  it('resolveOnRecharge stops on insufficient balance', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: '1', ride_id: 'r1', fee_pending_cents: '540', driver_id: 'd1' }] })
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ id: '1', ride_id: 'r1', driver_id: 'd1', fee_pending_cents: '540', fee_collected_cents: '0', fee_amount_cents: '540', status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [{ ride_id: 'r1', driver_id: 'd1', territory_id: 't1', manager_id: 'm1', manager_assignment_id: 'a1', fee_amount_cents: '540', fee_collected_cents: '0', fee_pending_cents: '540', manager_commission_rate_bps: 4000, reference_month: '2026-07', collection_status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [] }) // ROLLBACK
      .mockResolvedValueOnce({ rows: [] }); // update attempts

    const mockExecutor = { resolvePendingInClient: vi.fn().mockRejectedValue(new Error('INSUFFICIENT_BALANCE_FOR_PENDING')) };

    const count = await svc.resolveOnRecharge('d1', mockExecutor, {} as any, {} as any);
    expect(count).toBe(0);
  });

  it('continues to next pending if first disappears during lock', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [
        { id: '1', ride_id: 'r1', fee_pending_cents: '540', driver_id: 'd1' },
        { id: '2', ride_id: 'r2', fee_pending_cents: '360', driver_id: 'd1' },
      ] })
      // First pending: disappears
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [] }) // lock pending — EMPTY (disappeared)
      .mockResolvedValueOnce({ rows: [] }) // ROLLBACK
      // Second pending: succeeds
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ id: '2', ride_id: 'r2', driver_id: 'd1', fee_pending_cents: '360', fee_collected_cents: '0', fee_amount_cents: '360', status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [{ ride_id: 'r2', driver_id: 'd1', territory_id: null, manager_id: null, manager_assignment_id: null, fee_amount_cents: '360', fee_collected_cents: '0', fee_pending_cents: '360', manager_commission_rate_bps: 4000, reference_month: '2026-07', collection_status: 'pending' }] })
      .mockResolvedValueOnce({ rows: [] }) // UPDATE pending
      .mockResolvedValueOnce({ rowCount: 1 }) // markCollected
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const mockExecutor = { resolvePendingInClient: vi.fn().mockResolvedValue({ walletResult: { id: 99n }, incentiveResult: null, skippedReason: null }) };
    const mockFeeSplit = { markCollectedInClient: vi.fn().mockResolvedValue(undefined) };
    const mockLedger = { recordCollectedFeeInClient: vi.fn() };

    const count = await svc.resolveOnRecharge('d1', mockExecutor, mockFeeSplit as any, mockLedger as any);
    expect(count).toBe(1); // Only second resolved
    expect(mockExecutor.resolvePendingInClient).toHaveBeenCalledTimes(1);
  });
});
