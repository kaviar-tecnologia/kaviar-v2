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
    mockQuery.mockResolvedValueOnce({ rows: [] }) // idempotency
      .mockResolvedValueOnce({ rows: [{ id: '1' }] }); // insert
    const r = await svc.create({ rideId: 'r1', driverId: 'd1', finalPriceCents: BigInt(3000), feeAmountCents: BigInt(540), reservedCents: BigInt(540) });
    expect(r.already_processed).toBe(false);
  });

  it('create idempotent', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1' }] });
    const r = await svc.create({ rideId: 'r1', driverId: 'd1', finalPriceCents: BigInt(3000), feeAmountCents: BigInt(540), reservedCents: BigInt(540) });
    expect(r.already_processed).toBe(true);
  });

  it('resolveOnRecharge resolves via executor', async () => {
    // Initial query to find pending debits (pool.query)
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1', ride_id: 'r1', fee_pending_cents: '540', driver_id: 'd1' }] })
      // BEGIN
      .mockResolvedValueOnce({ rows: [] })
      // SELECT FOR UPDATE (lock)
      .mockResolvedValueOnce({ rows: [{ id: '1', ride_id: 'r1', driver_id: 'd1', fee_pending_cents: '540', fee_collected_cents: '0', fee_amount_cents: '540', status: 'pending' }] })
      // UPDATE pending_debits
      .mockResolvedValueOnce({ rows: [] })
      // COMMIT
      .mockResolvedValueOnce({ rows: [] })
      // markCollected (post-commit)
      .mockResolvedValueOnce({ rows: [] })
      // territory query (post-commit)
      .mockResolvedValueOnce({ rows: [{ territory_id: 't1', manager_id: 'm1', manager_share_cents: '216', reference_month: '2026-06' }] });

    const mockExecutor = {
      resolvePendingInClient: vi.fn().mockResolvedValue({
        walletResult: { id: BigInt(99), already_processed: false, balance_after_cents: BigInt(0), reserved_after_cents: BigInt(0), createdAt: new Date() },
        incentiveResult: null,
        skippedReason: 'DIRECT_EXECUTOR',
      }),
    };
    const mockFeeSplit = { markCollected: vi.fn().mockResolvedValue({}) };
    const mockLedger = { recordFeeShare: vi.fn().mockResolvedValue({}) };

    const count = await svc.resolveOnRecharge('d1', mockExecutor, mockFeeSplit, mockLedger);
    expect(count).toBe(1);
    expect(mockExecutor.resolvePendingInClient).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ driverId: 'd1', pendingDebitId: '1', rideId: 'r1', feePendingCents: BigInt(540) })
    );
  });

  it('resolveOnRecharge stops on insufficient balance', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: '1', ride_id: 'r1', fee_pending_cents: '540', driver_id: 'd1' }] })
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: '1', ride_id: 'r1', driver_id: 'd1', fee_pending_cents: '540', fee_collected_cents: '0', fee_amount_cents: '540', status: 'pending' }] }) // lock
      .mockResolvedValueOnce({ rows: [] }) // ROLLBACK
      .mockResolvedValueOnce({ rows: [] }); // update attempts

    const mockExecutor = {
      resolvePendingInClient: vi.fn().mockRejectedValue(new Error('INSUFFICIENT_BALANCE_FOR_PENDING')),
    };

    const count = await svc.resolveOnRecharge('d1', mockExecutor, {} as any, {} as any);
    expect(count).toBe(0);
  });
});
