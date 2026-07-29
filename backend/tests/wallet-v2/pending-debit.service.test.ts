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

  it('resolveOnRecharge resolves via executor (atomic)', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: '1', ride_id: 'r1', fee_pending_cents: '540', driver_id: 'd1' }] }) // find pendings
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
      .mockResolvedValueOnce({ rows: [{ id: '1', ride_id: 'r1', driver_id: 'd1', fee_pending_cents: '540', fee_collected_cents: '0', fee_amount_cents: '540', status: 'pending' }] }) // SELECT FOR UPDATE
      // resolvePendingInClient — handled by mock executor
      .mockResolvedValueOnce({ rows: [] }) // UPDATE pending_debits
      .mockResolvedValueOnce({ rows: [{ territory_id: 't1', manager_id: 'm1', manager_assignment_id: 'asn1', fee_amount_cents: '540', fee_collected_cents: '0', manager_commission_rate_bps: 4000, reference_month: '2026-06' }] }) // load split snapshot
      .mockResolvedValueOnce({ rows: [] }) // markCollectedInClient
      // recordCollectedFeeInClient — uses INSERT with RETURNING
      .mockResolvedValueOnce({ rows: [{ id: '10', idempotency_key: 'territory_platform_fee:r1:resolve:1', entry_type: 'platform_fee', amount_cents: '540', territory_id: 't1', manager_id: 'm1', manager_assignment_id: 'asn1', reference_month: '2026-06', reference_id: 'r1' }, { id: '11', idempotency_key: 'territory_fee_share:r1:resolve:1', entry_type: 'fee_share', amount_cents: '216', territory_id: 't1', manager_id: 'm1', manager_assignment_id: 'asn1', reference_month: '2026-06', reference_id: 'r1' }] })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT

    const mockExecutor = {
      resolvePendingInClient: vi.fn().mockResolvedValue({
        walletResult: { id: BigInt(99), already_processed: false, balance_after_cents: BigInt(0), reserved_after_cents: BigInt(0), createdAt: new Date() },
        incentiveResult: null,
        skippedReason: 'DIRECT_EXECUTOR',
      }),
    };
    const mockFeeSplit = { markCollectedInClient: vi.fn().mockResolvedValue(undefined) };
    const mockLedger = { recordCollectedFeeInClient: vi.fn().mockResolvedValue({ platformEntryId: 10n, shareEntryId: 11n }) };

    const count = await svc.resolveOnRecharge('d1', mockExecutor, mockFeeSplit as any, mockLedger as any);
    expect(count).toBe(1);
    expect(mockExecutor.resolvePendingInClient).toHaveBeenCalled();
  });

  it('resolveOnRecharge stops on insufficient balance', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: '1', ride_id: 'r1', fee_pending_cents: '540', driver_id: 'd1' }] })
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // advisory lock
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
