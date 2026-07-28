import { WalletService, LedgerEntry } from './wallet.service';
import { FeeSplitService } from './fee-split.service';
import { TerritoryLedgerService } from './territory-ledger.service';
import { PendingDebitService } from './pending-debit.service';

/** Interface for any service that can execute a fee debit (WalletService or ShadowService) */
export interface FeeDebitExecutor {
  debitFee(driverId: string, feeCents: bigint, reservedCents: bigint, rideId: string): Promise<LedgerEntry>;
}

export class WalletSettlementService {
  private feeDebitExecutor: FeeDebitExecutor;

  constructor(
    private wallet: WalletService,
    private feeSplit: FeeSplitService,
    private territoryLedger: TerritoryLedgerService,
    private pendingDebit: PendingDebitService,
    feeDebitExecutor: FeeDebitExecutor,
  ) {
    this.feeDebitExecutor = feeDebitExecutor;
  }

  async handleReserve(rideId: string, driverId: string, estimatedFeeCents: bigint): Promise<void> {
    await this.wallet.ensureWallet(driverId);
    await this.wallet.reserve(driverId, estimatedFeeCents, rideId);
  }

  async handleCancellation(rideId: string, driverId: string, reservedCents: bigint): Promise<void> {
    await this.wallet.releaseReserve(driverId, reservedCents, rideId);
  }

  async settleRide(params: { rideId: string; driverId: string; finalPriceCents: bigint; reservedCents: bigint; territoryId?: string; managerId?: string }): Promise<{ collected: boolean }> {
    const { rideId, driverId, finalPriceCents, reservedCents, territoryId, managerId } = params;
    const split = this.feeSplit.calculateSplit(finalPriceCents);

    const balance = await this.wallet.getBalance(driverId);
    const availableForFee = balance.balance_cents - balance.reserved_cents + reservedCents;
    const canCollectFull = availableForFee >= split.fee_amount_cents;

    if (canCollectFull) {
      // Full collection: debit fee via executor (shadow or direct)
      await this.feeDebitExecutor.debitFee(driverId, split.fee_amount_cents, reservedCents, rideId);
      await this.feeSplit.recordSplit({ rideId, driverId, finalPriceCents, territoryId, managerId, collected: true });
      if (territoryId) {
        const month = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        await this.territoryLedger.recordFeeShare(territoryId, managerId || null, split.manager_share_cents, rideId, month);
      }
      return { collected: true };
    } else {
      // Partial or no collection: debit what's available, pending the rest
      const collectableAmount = availableForFee > BigInt(0) ? availableForFee : BigInt(0);

      if (collectableAmount > BigInt(0)) {
        // Debit partial amount via executor (shadow or direct)
        await this.feeDebitExecutor.debitFee(driverId, collectableAmount, reservedCents, rideId);
      } else {
        // Nothing to debit — just release reserve
        await this.wallet.releaseReserve(driverId, reservedCents, rideId);
      }

      await this.pendingDebit.create({ rideId, driverId, finalPriceCents, feeAmountCents: split.fee_amount_cents, reservedCents: collectableAmount, feeCollectedCents: collectableAmount });
      await this.feeSplit.recordSplit({ rideId, driverId, finalPriceCents, territoryId, managerId, collected: false });
      return { collected: false };
    }
  }
}
