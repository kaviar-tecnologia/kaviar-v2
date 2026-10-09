import { Pool, PoolClient } from 'pg';
import { WalletService, LedgerEntry, DebitFeeResult, WalletBalance } from './wallet.service';
import { FeeSplitService, FeeSplitSnapshot } from './fee-split.service';
import { TerritoryLedgerService } from './territory-ledger.service';
import { PendingDebitService } from './pending-debit.service';
import { assertSettlementActive } from './settlement-gate';
import { applyBasisPoints, PLATFORM_FEE_RATE_BPS, MANAGER_COMMISSION_RATE_BPS } from '../finance/territory/monetary';
import { referenceMonthFromDate, COMPETENCE_TIMEZONE } from './fee-split.service';
import { evaluateTerritorialManagerFinancialProfile } from '../contracts/territorial-manager-financial-eligibility';
import { PromoWalletService } from './promo-wallet.service';
import { allocatePromoFee } from './promo-fee-allocation';

/** Interface for any service that can execute a fee debit */
export interface FeeDebitExecutor {
  debitFee(driverId: string, feeCents: bigint, reservedCents: bigint, rideId: string): Promise<LedgerEntry>;
  debitFeeInClient(client: PoolClient, driverId: string, feeCents: bigint, reservedCents: bigint, rideId: string): Promise<DebitFeeResult>;
}

export interface SettlementParams {
  rideId: string;
  driverId: string;
  finalPriceCents: bigint; // total including the confirmed wait charge
  feeBaseCents?: bigint; // optional locked fare; defaults to total for legacy no-wait callers
  reservedCents: bigint;
  territoryId?: string;
  promoOfferId?: string;
}

export class WalletSettlementService {
  private feeDebitExecutor: FeeDebitExecutor;

  constructor(
    private pool: Pool,
    private wallet: WalletService,
    private feeSplit: FeeSplitService,
    private territoryLedger: TerritoryLedgerService,
    private pendingDebit: PendingDebitService,
    feeDebitExecutor: FeeDebitExecutor,
    private readonly promoWallet?: PromoWalletService,
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

  /**
   * Atomic settlement: single PostgreSQL transaction for all financial writes.
   *
   * Flow:
   * 1. BEGIN + advisory lock per ride
   * 2. Check existing split (idempotency)
   * 3. Obtain recognized_at from DB clock
   * 4. Resolve territory manager assignment (FOR SHARE)
   * 5. Lock wallet + decide collection strategy
   * 6. Execute debit + split + territory ledger
   * 7. COMMIT
   */
  async settleRide(params: SettlementParams): Promise<{ collected: boolean }> {
    assertSettlementActive();

    const feeBaseCents = params.feeBaseCents ?? params.finalPriceCents;
    if (feeBaseCents <= 0n || feeBaseCents > params.finalPriceCents) {
      throw Object.assign(new Error('WALLET_FEE_BASE_INVALID'), { code: 'WALLET_FEE_BASE_INVALID' });
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // ═══ ADVISORY LOCK PER RIDE ═══
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`wallet-settlement:${params.rideId}`]
      );

      // ═══ IDEMPOTENCY: check existing split ═══
      const existingSnapshot = await this.feeSplit.getExistingSnapshot(client, params.rideId);
      if (existingSnapshot) {
        // Validate caller identity against persisted snapshot
        if (
          existingSnapshot.driverId !== params.driverId ||
          existingSnapshot.finalPriceCents !== params.finalPriceCents ||
          (existingSnapshot.territoryId ?? undefined) !== (params.territoryId ?? undefined) ||
          (params.feeBaseCents !== undefined &&
            existingSnapshot.feeAmountCents !== applyBasisPoints(feeBaseCents, PLATFORM_FEE_RATE_BPS))
        ) {
          await client.query('ROLLBACK');
          throw Object.assign(
            new Error('Attempt to settle ride with different parameters than persisted'),
            { code: 'FEE_SPLIT_IDEMPOTENCY_MISMATCH' }
          );
        }
        await client.query('COMMIT');
        return { collected: existingSnapshot.collectionStatus === 'collected' };
      }

      // ═══ RECOGNIZED_AT via DB clock ═══
      const { rows: [{ ts: recognizedAt }] } = await client.query(
        `SELECT clock_timestamp() AS ts`
      );
      const referenceMonth = referenceMonthFromDate(recognizedAt);

      // ═══ RESOLVE MANAGER ASSIGNMENT inside tx ═══
      let managerId: string | null = null;
      let managerAssignmentId: string | null = null;

      if (params.territoryId) {
        const { rows: assignments } = await client.query(
          `SELECT
             tma.id,
             tma.admin_id,
             tma.operator_profile_id,
             a.is_active AS admin_is_active,
             a.role AS admin_role,
             op.id AS profile_id,
             op.relationship_type,
             op.is_active,
             op.document_status,
             op.contract_status,
             op.terms_version,
             op.contract_url,
             op.pix_key,
             op.responsibility_terms_accepted_at,
             op.confidentiality_terms_accepted_at
           FROM territory_manager_assignments tma
           JOIN admins a ON a.id = tma.admin_id
           LEFT JOIN operator_profiles op
             ON op.admin_id = tma.admin_id
            AND op.territory_id = tma.territory_id
           WHERE tma.territory_id = $1
             AND tma.status = 'active'
             AND tma.started_at <= $2
             AND (tma.ended_at IS NULL OR tma.ended_at > $2)
           FOR SHARE OF tma`,
          [params.territoryId, recognizedAt]
        );

        if (assignments.length > 1) {
          await client.query('ROLLBACK');
          throw Object.assign(
            new Error('Multiple active assignments for territory at recognition time'),
            { code: 'TERRITORY_MANAGER_ASSIGNMENT_AMBIGUOUS' }
          );
        }

        if (assignments.length === 1) {
          const candidate = assignments[0];
          const profileEligibility = evaluateTerritorialManagerFinancialProfile(candidate);
          const adminEligible = candidate.admin_is_active === true && candidate.admin_role === 'TERRITORIAL_MANAGER';
          const profileBindingMatches =
            !candidate.operator_profile_id ||
            candidate.operator_profile_id === candidate.profile_id;

          if (adminEligible && profileBindingMatches && profileEligibility.eligible) {
            managerId = candidate.admin_id;
            managerAssignmentId = candidate.id;
          }
        }
      }

      // ═══ CALCULATE SPLIT ═══
      // Territory without a fully eligible Gestor Territorial is an Área de Sombra KAVIAR.
      // An active assignment alone is NOT enough: the profile must also be active,
      // verified and backed by a formal v1.2 contract + financial onboarding gates.
      // Otherwise 100% of the platform fee stays with KAVIAR and no manager obligation is created.
      const effectiveManagerCommissionRateBps = managerId ? MANAGER_COMMISSION_RATE_BPS : 0;
      const split = this.feeSplit.calculateSplit(
        feeBaseCents,
        PLATFORM_FEE_RATE_BPS,
        effectiveManagerCommissionRateBps,
      );


      // ═══ PROMOTIONAL SETTLEMENT — OPT-IN BY OFFER ═══
      // No caller currently passes promoOfferId.
      // Legacy settlement remains unchanged.
      if (params.promoOfferId !== undefined) {
        const offerId = params.promoOfferId;

        if (!offerId.trim() || !this.promoWallet) {
          throw new Error('PROMO_SETTLEMENT_CONFIGURATION_INVALID');
        }

        // Synchronize settlement with dual-wallet reserve/release.
        await client.query(
          'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
          [`dual-wallet-reserve:${params.rideId}`]
        );

        const { rows: promoRows } = await client.query(
          `SELECT driver_id, reference_id, reference_type,
                  entry_type, amount_cents
           FROM driver_promo_ledger
           WHERE idempotency_key = $1`,
          [`promo_reserve:${offerId}`]
        );

        const { rows: cashRows } = await client.query(
          `SELECT driver_id, reference_id, reference_type,
                  entry_type, reserved_delta_cents
           FROM wallet_ledger
           WHERE idempotency_key = $1`,
          [`reserve:ride:${offerId}`]
        );

        const promoReservation = promoRows[0];
        const cashReservation = cashRows[0];

        if (!promoReservation && !cashReservation) {
          throw new Error('PROMO_SETTLEMENT_RESERVATION_MISSING');
        }

        for (const reservation of [
          promoReservation,
          cashReservation,
        ]) {
          if (!reservation) continue;

          if (
            reservation.driver_id !== params.driverId ||
            reservation.reference_id !== params.rideId ||
            reservation.reference_type !== 'ride' ||
            reservation.entry_type !== 'reserve'
          ) {
            throw new Error('PROMO_SETTLEMENT_RESERVATION_MISMATCH');
          }
        }

        const promoReserved = promoReservation
          ? BigInt(promoReservation.amount_cents)
          : 0n;

        const cashReserved = cashReservation
          ? BigInt(cashReservation.reserved_delta_cents)
          : 0n;

        if (
          promoReserved < 0n ||
          cashReserved < 0n ||
          promoReserved + cashReserved <= 0n
        ) {
          throw new Error('PROMO_SETTLEMENT_INVALID_RESERVATION');
        }

        // Reject released or previously consumed offers.
        const { rows: promoTerminal } = await client.query(
          `SELECT 1 FROM driver_promo_ledger
           WHERE idempotency_key IN ($1, $2)
           LIMIT 1`,
          [
            `promo_release:${offerId}`,
            `promo_consume:${offerId}`,
          ]
        );

        const { rows: cashTerminal } = await client.query(
          `SELECT 1 FROM wallet_ledger
           WHERE idempotency_key IN ($1, $2)
           LIMIT 1`,
          [
            `cancel_release:ride:${offerId}`,
            `fee:ride:${params.rideId}`,
          ]
        );

        if (
          promoTerminal.length > 0 ||
          cashTerminal.length > 0
        ) {
          throw new Error('PROMO_SETTLEMENT_OFFER_FINALIZED');
        }

        const allocation = allocatePromoFee(
          split.fee_amount_cents,
          promoReserved
        );

        // Consumes the actual subsidy and releases the entire
        // promotional reservation, including unused credits.
        if (promoReserved > 0n) {
          await this.promoWallet.consumeInClient(
            client,
            params.driverId,
            params.rideId,
            allocation.promoCents,
            offerId
          );
        }

        let cashCollected = 0n;

        if (allocation.cashCents > 0n || cashReserved > 0n) {
          // A fully promotional offer may not have created
          // a cash wallet yet. Create an empty one if needed.
          await client.query(
            `INSERT INTO driver_wallets
               (driver_id, balance_cents, reserved_cents, updated_at)
             VALUES ($1, 0, 0, NOW())
             ON CONFLICT (driver_id) DO NOTHING`,
            [params.driverId]
          );

          const lockedCash = await this.wallet.getLockedBalance(
            client,
            params.driverId
          );

          if (
            lockedCash.balance_cents < lockedCash.reserved_cents ||
            cashReserved > lockedCash.reserved_cents
          ) {
            throw new Error('PROMO_SETTLEMENT_CASH_RESERVE_MISMATCH');
          }

          const availableCash =
            lockedCash.balance_cents -
            lockedCash.reserved_cents +
            cashReserved;

          cashCollected = availableCash < allocation.cashCents
            ? availableCash
            : allocation.cashCents;

          if (cashCollected > 0n) {
            // Preserve annual incentive behavior:
            // accrual is based on CASH actually debited.
            await this.feeDebitExecutor.debitFeeInClient(
              client,
              params.driverId,
              cashCollected,
              cashReserved,
              params.rideId
            );
          } else if (cashReserved > 0n) {
            await this.wallet.releaseOfferReserveInClient(
              client,
              params.driverId,
              params.rideId,
              offerId
            );
          }
        }

        const pendingCents =
          allocation.cashCents - cashCollected;

        if (pendingCents < 0n) {
          throw new Error('PROMO_SETTLEMENT_NEGATIVE_PENDING');
        }

        if (pendingCents > 0n) {
          await this.pendingDebit.createInClient(client, {
            rideId: params.rideId,
            driverId: params.driverId,
            finalPriceCents: params.finalPriceCents,
            feeAmountCents: split.fee_amount_cents,
            feeCollectedCents: cashCollected,
            feeSubsidizedCents: allocation.promoCents,
            reservedCents: cashReserved,
          });
        }

        const recorded = await this.feeSplit.recordSplitInClient(
          client,
          {
            rideId: params.rideId,
            driverId: params.driverId,
            finalPriceCents: params.finalPriceCents,
            feeBaseCents,
            territoryId: params.territoryId || null,
            managerId,
            managerAssignmentId,
            recognizedAt,
            referenceMonth,
            platformFeeRateBps: PLATFORM_FEE_RATE_BPS,
            managerCommissionRateBps:
              effectiveManagerCommissionRateBps,
            feeCollectedCents: cashCollected,
            feeSubsidizedCents: allocation.promoCents,
            feePendingCents: pendingCents,
            collectionStatus:
              pendingCents === 0n
                ? 'collected'
                : cashCollected > 0n
                  ? 'partial'
                  : 'pending',
          }
        );

        if (recorded.territoryId) {
          // Contractual share includes KAVIAR-funded subsidy.
          // Platform collection includes CASH only.
          const coveredCents =
            recorded.feeAmountCents - pendingCents;

          const managerRecognized =
            applyBasisPoints(
              coveredCents,
              recorded.managerCommissionRateBps
            );

          await this.territoryLedger.recordCollectedFeeInClient(
            client,
            recorded.territoryId,
            recorded.managerId,
            recorded.managerAssignmentId,
            cashCollected,
            managerRecognized,
            params.rideId,
            recorded.referenceMonth
          );
        }

        await client.query('COMMIT');

        return { collected: pendingCents === 0n };
      }

      // ═══ LOCK WALLET AND DECIDE ═══
      const locked = await this.wallet.getLockedBalance(client, params.driverId);
      const available = locked.balance_cents - locked.reserved_cents + params.reservedCents;
      const canCollectFull = available >= split.fee_amount_cents;

      if (canCollectFull) {
        // ─── FULL COLLECTION ───
        await this.feeDebitExecutor.debitFeeInClient(
          client, params.driverId, split.fee_amount_cents, params.reservedCents, params.rideId
        );

        const recorded = await this.feeSplit.recordSplitInClient(client, {
          rideId: params.rideId,
          driverId: params.driverId,
          finalPriceCents: params.finalPriceCents,
          feeBaseCents,
          territoryId: params.territoryId || null,
          managerId,
          managerAssignmentId,
          recognizedAt,
          referenceMonth,
          platformFeeRateBps: PLATFORM_FEE_RATE_BPS,
          managerCommissionRateBps: effectiveManagerCommissionRateBps,
          feeCollectedCents: split.fee_amount_cents,
          feePendingCents: 0n,
          collectionStatus: 'collected',
        });

        if (recorded.territoryId) {
          await this.territoryLedger.recordCollectedFeeInClient(
            client,
            recorded.territoryId,
            recorded.managerId,
            recorded.managerAssignmentId,
            recorded.feeAmountCents,
            recorded.managerShareCents,
            params.rideId,
            recorded.referenceMonth,
          );
        }

        await client.query('COMMIT');
        return { collected: true };

      } else {
        // ─── PARTIAL / NO COLLECTION ───
        const collectableAmount = available > 0n ? available : 0n;

        if (collectableAmount > 0n) {
          await this.feeDebitExecutor.debitFeeInClient(
            client, params.driverId, collectableAmount, params.reservedCents, params.rideId
          );
        } else {
          await this.wallet.releaseReserveInClient(
            client, params.driverId, params.reservedCents, params.rideId
          );
        }

        await this.pendingDebit.createInClient(client, {
          rideId: params.rideId,
          driverId: params.driverId,
          finalPriceCents: params.finalPriceCents,
          feeAmountCents: split.fee_amount_cents,
          reservedCents: collectableAmount,
          feeCollectedCents: collectableAmount,
        });

        const recorded = await this.feeSplit.recordSplitInClient(client, {
          rideId: params.rideId,
          driverId: params.driverId,
          finalPriceCents: params.finalPriceCents,
          feeBaseCents,
          territoryId: params.territoryId || null,
          managerId,
          managerAssignmentId,
          recognizedAt,
          referenceMonth,
          platformFeeRateBps: PLATFORM_FEE_RATE_BPS,
          managerCommissionRateBps: effectiveManagerCommissionRateBps,
          feeCollectedCents: collectableAmount,
          feePendingCents: split.fee_amount_cents - collectableAmount,
          collectionStatus: collectableAmount > 0n ? 'partial' : 'pending',
        });

        // Proportional territorial recognition for partial amount
        if (recorded.territoryId && collectableAmount > 0n) {
          const partialManagerShare = applyBasisPoints(collectableAmount, recorded.managerCommissionRateBps);
          await this.territoryLedger.recordCollectedFeeInClient(
            client,
            recorded.territoryId,
            recorded.managerId,
            recorded.managerAssignmentId,
            collectableAmount,
            partialManagerShare,
            params.rideId,
            recorded.referenceMonth,
          );
        }

        await client.query('COMMIT');
        return { collected: false };
      }
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }
  }
}
