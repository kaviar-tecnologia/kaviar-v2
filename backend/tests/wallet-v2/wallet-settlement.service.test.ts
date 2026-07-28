import { describe, it, expect, beforeEach, vi } from "vitest";
import { WalletSettlementService } from '../../src/services/wallet-v2/wallet-settlement.service';

describe('WalletSettlementService', () => {
  const mockWallet = { ensureWallet: vi.fn(), reserve: vi.fn(), releaseReserve: vi.fn(), debitFee: vi.fn(), getBalance: vi.fn() };
  const mockFeeSplit = { calculateSplit: vi.fn(), recordSplit: vi.fn() };
  const mockLedger = { recordFeeShare: vi.fn() };
  const mockPending = { create: vi.fn() };

  const svc = new WalletSettlementService(mockWallet as any, mockFeeSplit as any, mockLedger as any, mockPending as any, mockWallet as any);

  beforeEach(() => { Object.values(mockWallet).forEach(m => m.mockReset()); Object.values(mockFeeSplit).forEach(m => m.mockReset()); mockLedger.recordFeeShare.mockReset(); mockPending.create.mockReset(); });

  it('handleReserve ensures wallet and reserves', async () => {
    mockWallet.ensureWallet.mockResolvedValue(undefined);
    mockWallet.reserve.mockResolvedValue({});
    await svc.handleReserve('r1', 'd1', BigInt(540));
    expect(mockWallet.ensureWallet).toHaveBeenCalledWith('d1');
    expect(mockWallet.reserve).toHaveBeenCalledWith('d1', BigInt(540), 'r1');
  });

  it('handleCancellation releases reserve', async () => {
    mockWallet.releaseReserve.mockResolvedValue({});
    await svc.handleCancellation('r1', 'd1', BigInt(540));
    expect(mockWallet.releaseReserve).toHaveBeenCalledWith('d1', BigInt(540), 'r1');
  });

  it('settleRide collected when balance sufficient', async () => {
    mockFeeSplit.calculateSplit.mockReturnValue({ fee_amount_cents: BigInt(540), matrix_share_cents: BigInt(324), manager_share_cents: BigInt(216) });
    mockWallet.getBalance.mockResolvedValue({ balance_cents: BigInt(5000), reserved_cents: BigInt(540), available_cents: BigInt(4460) });
    mockWallet.debitFee.mockResolvedValue({});
    mockFeeSplit.recordSplit.mockResolvedValue({});
    mockLedger.recordFeeShare.mockResolvedValue(undefined);

    const r = await svc.settleRide({ rideId: 'r1', driverId: 'd1', finalPriceCents: BigInt(3000), reservedCents: BigInt(540), territoryId: 't1', managerId: 'm1' });
    expect(r.collected).toBe(true);
    expect(mockWallet.debitFee).toHaveBeenCalled();
    expect(mockFeeSplit.recordSplit).toHaveBeenCalledWith(expect.objectContaining({ collected: true }));
    expect(mockLedger.recordFeeShare).toHaveBeenCalledWith('t1', 'm1', BigInt(216), 'r1', expect.any(String));
  });

  it('settleRide pending when balance insufficient', async () => {
    mockFeeSplit.calculateSplit.mockReturnValue({ fee_amount_cents: BigInt(540), matrix_share_cents: BigInt(324), manager_share_cents: BigInt(216) });
    mockWallet.getBalance.mockResolvedValue({ balance_cents: BigInt(200), reserved_cents: BigInt(200), available_cents: BigInt(0) });
    mockWallet.debitFee.mockResolvedValue({});
    mockPending.create.mockResolvedValue({});
    mockFeeSplit.recordSplit.mockResolvedValue({});

    const r = await svc.settleRide({ rideId: 'r2', driverId: 'd1', finalPriceCents: BigInt(3000), reservedCents: BigInt(200), territoryId: 't1' });
    expect(r.collected).toBe(false);
    expect(mockWallet.debitFee).toHaveBeenCalledWith('d1', BigInt(200), BigInt(200), 'r2'); // partial debit
    expect(mockPending.create).toHaveBeenCalled();
    expect(mockFeeSplit.recordSplit).toHaveBeenCalledWith(expect.objectContaining({ collected: false }));
    expect(mockLedger.recordFeeShare).not.toHaveBeenCalled();
  });

  it('settleRide does not credit territory ledger when no territory', async () => {
    mockFeeSplit.calculateSplit.mockReturnValue({ fee_amount_cents: BigInt(360), matrix_share_cents: BigInt(216), manager_share_cents: BigInt(144) });
    mockWallet.getBalance.mockResolvedValue({ balance_cents: BigInt(5000), reserved_cents: BigInt(360), available_cents: BigInt(4640) });
    mockWallet.debitFee.mockResolvedValue({});
    mockFeeSplit.recordSplit.mockResolvedValue({});

    await svc.settleRide({ rideId: 'r3', driverId: 'd1', finalPriceCents: BigInt(2000), reservedCents: BigInt(360) });
    expect(mockLedger.recordFeeShare).not.toHaveBeenCalled();
  });
});
