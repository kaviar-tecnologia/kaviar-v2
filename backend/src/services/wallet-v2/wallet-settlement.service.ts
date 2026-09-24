import { Pool, PoolClient } from 'pg';
import { WalletService, LedgerEntry, DebitFeeResult, WalletBalance } from './wallet.service';
import { FeeSplitService, FeeSplitSnapshot } from './fee-split.service';
import { TerritoryLedgerService } from './territory-ledger.service';
import { PendingDebitService } from './pending-debit.service';
import { assertSettlementActive } from './settlement-gate';
import { applyBasisPoints, PLATFORM_FEE_RATE_BPS, MANAGER_COMMISSION_RATE_BPS } from '../finance/territory/monetary';
import { referenceMonthFromDate, COMPETENCE_TIMEZONE } from './fee-split.service';
import { TERRITORIAL_MANAGER_CONTRACT_VERSION } from '../contracts/territorial-manager-contract-v1_2';

/** Interface for any service that can execute a fee debit */
export interface FeeDebitExecutor {
  debitFee(driverId: string, feeCents: bigint, reservedCents: bigint, rideId: string): Promise<LedgerEntry>;
  debitFeeInClient(client: PoolClient, driverId: string, feeCents: bigint, reservedCents: bigint, rideId: string): Promise<DebitFeeResult>;
}

export interface SettlementParams {
  rideId: string;
  driverId: string;
  finalPriceCents: bigint;
  reservedCents: bigint;
  territoryId?: string;
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
          (existingSnapshot.territoryId ?? undefined) !== (params.territoryId ?? undefined)
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
          `SELECT tma.id, tma.admin_id
           FROM territory_manager_assignments tma
           JOIN admins a ON a.id = tma.admin_id
           JOIN operator_profiles op
             ON op.admin_id = tma.admin_id
            AND op.territory_id = tma.territory_id
           WHERE tma.territory_id = $1
             AND tma.status = 'active'
             AND a.is_active = true
             AND a.role = 'TERRITORIAL_MANAGER'
             AND tma.started_at <= $2
             AND (tma.ended_at IS NULL OR tma.ended_at > $2)
             AND op.relationship_type = 'territorial_manager'
             AND op.is_active = true
             AND op.document_status = 'verified'
             AND op.contract_status = 'signed'
             AND op.terms_version = $3
             AND NULLIF(BTRIM(op.contract_url), '') IS NOT NULL
             AND NULLIF(BTRIM(op.pix_key), '') IS NOT NULL
             AND op.responsibility_terms_accepted_at IS NOT NULL
             AND op.confidentiality_terms_accepted_at IS NOT NULL
             AND (tma.operator_profile_id IS NULL OR tma.operator_profile_id = op.id)
           FOR SHARE OF tma`,
          [params.territoryId, recognizedAt, TERRITORIAL_MANAGER_CONTRACT_VERSION]
        );

        if (assignments.length > 1) {
          await client.query('ROLLBACK');
          throw Object.assign(
            new Error('Multiple active assignments for territory at recognition time'),
            { code: 'TERRITORY_MANAGER_ASSIGNMENT_AMBIGUOUS' }
          );
        }

        if (assignments.length === 1) {
          managerId = assignments[0].admin_id;
          managerAssignmentId = assignments[0].id;
        }
      }

      // ═══ CALCULATE SPLIT ═══
      // Territory without a fully eligible Gestor Territorial is an Área de Sombra KAVIAR.
      // An active assignment alone is NOT enough: the profile must also be active,
      // verified and backed by a formal v1.2 contract + financial onboarding gates.
      // Otherwise 100% of the platform fee stays with KAVIAR and no manager obligation is created.
      const effectiveManagerCommissionRateBps = managerId ? MANAGER_COMMISSION_RATE_BPS : 0;
      const split = this.feeSplit.calculateSplit(
        params.finalPriceCents,
        PLATFORM_FEE_RATE_BPS,
        effectiveManagerCommissionRateBps,
      );

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
