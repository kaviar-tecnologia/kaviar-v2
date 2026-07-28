/**
 * Annual Incentive Shadow Integration for fee_debit
 *
 * Composes wallet debit + annual incentive ACCRUAL in the same PostgreSQL transaction.
 * Active only when both ANNUAL_INCENTIVE_SHADOW_ENABLED and ANNUAL_INCENTIVE_WRITE_ENABLED
 * are set to "true".
 */

import { Pool, PoolClient } from 'pg';
import { WalletService, DebitFeeResult, DebitPendingResult, LedgerEntry } from '../wallet-v2/wallet.service';
import { AnnualIncentiveLedgerService } from './annual-incentive-ledger.service';
import { AppendEventResult } from './annual-incentive-ledger.types';
import { getProgramYearBrazil } from './annual-incentive-program-year';

const RATE_BASIS_POINTS = 1000n; // 10%
const BASIS_POINTS_DENOMINATOR = 10000n;
const POLICY_VERSION = 'ANNUAL-INCENTIVE-v1';

export type ShadowDebitFeeResult = {
  wallet: DebitFeeResult;
  incentive: AppendEventResult | null;
  skippedReason: string | null;
};

export const SHADOW_ERRORS = {
  CONFIGURATION_INVALID: 'ANNUAL_INCENTIVE_SHADOW_CONFIGURATION_INVALID',
} as const;

function isShadowEnabled(): boolean {
  return process.env.ANNUAL_INCENTIVE_SHADOW_ENABLED === 'true';
}

function isWriteEnabled(): boolean {
  return process.env.ANNUAL_INCENTIVE_WRITE_ENABLED === 'true';
}

/**
 * Validates shadow flag configuration.
 * Must be called BEFORE any transaction/connection.
 *
 * Invalid: SHADOW=true + WRITE=false (cannot shadow-write if writes are disabled)
 */
function assertShadowConfiguration(): void {
  if (isShadowEnabled() && !isWriteEnabled()) {
    throw new Error(
      `${SHADOW_ERRORS.CONFIGURATION_INVALID}: ANNUAL_INCENTIVE_SHADOW_ENABLED=true requires ANNUAL_INCENTIVE_WRITE_ENABLED=true`
    );
  }
}

export class AnnualIncentiveShadowService implements PendingDebitExecutor {
  constructor(
    private pool: Pool,
    private walletService: WalletService,
    private ledgerService: AnnualIncentiveLedgerService,
  ) {}

  /** PendingDebitExecutor interface implementation */
  async resolvePendingInClient(
    client: PoolClient,
    input: PendingDebitExecutionInput,
  ): Promise<PendingDebitExecutionResult> {
    return this.resolvePendingWithAnnualIncentiveInClient(client, input);
  }

  /**
   * Public wrapper for fee debit with optional annual incentive accrual.
   * Preserves the same return type as the original debitFee for callers.
   */
  async debitFee(driverId: string, feeCents: bigint, reservedCents: bigint, rideId: string): Promise<LedgerEntry> {
    // Validate configuration before acquiring connection
    assertShadowConfiguration();

    const shadowActive = isShadowEnabled() && isWriteEnabled();

    if (!shadowActive) {
      // Normal path: delegate to WalletService (manages its own transaction)
      return this.walletService.debitFee(driverId, feeCents, reservedCents, rideId);
    }

    // Shadow path: compose wallet debit + annual incentive in one transaction
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.debitFeeWithAnnualIncentiveInClient(
        client, driverId, feeCents, reservedCents, rideId
      );
      await client.query('COMMIT');
      return result.wallet;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Transactional composition: fee debit + annual incentive ACCRUAL.
   * Uses the caller's PoolClient — no BEGIN/COMMIT/ROLLBACK/release.
   */
  async debitFeeWithAnnualIncentiveInClient(
    client: PoolClient,
    driverId: string,
    feeCents: bigint,
    reservedCents: bigint,
    rideId: string,
  ): Promise<ShadowDebitFeeResult> {
    // 1. Execute the wallet debit
    const walletResult = await this.walletService.debitFeeInClient(
      client, driverId, feeCents, reservedCents, rideId
    );

    // 2. Calculate incentive amount using bigint arithmetic
    const baseAmountCents = walletResult.amountCents;
    const incentiveAmountCents = (baseAmountCents * RATE_BASIS_POINTS) / BASIS_POINTS_DENOMINATOR;

    // 3. Skip if incentive rounds to zero (fee < 10 centavos)
    if (incentiveAmountCents === 0n) {
      return {
        wallet: walletResult,
        incentive: null,
        skippedReason: 'SKIPPED_ZERO_AMOUNT',
      };
    }

    // 4. Determine program year from the wallet ledger created_at (Brazil timezone)
    const programYear = getProgramYearBrazil(walletResult.createdAt);

    // 5. Build the idempotency key from the immutable wallet_ledger entry ID
    const walletLedgerEntryId = walletResult.id.toString();
    const idempotencyKey = `annual_incentive:accrual:wallet_ledger:${walletLedgerEntryId}`;

    // 6. Append the ACCRUAL event
    const incentiveResult = await this.ledgerService.appendEventInClient(client, {
      driverId,
      programYear,
      eventType: 'ACCRUAL',
      amountCents: incentiveAmountCents,
      baseAmountCents,
      rateBasisPoints: Number(RATE_BASIS_POINTS),
      policyVersion: POLICY_VERSION,
      sourceType: 'FEE_DEBIT',
      sourceId: rideId,
      sourceEventId: walletLedgerEntryId,
      requestId: null,
      correlationId: `ride:${rideId}`,
      reversalOfId: null,
      idempotencyKey,
      metadata: {
        writeMode: 'SHADOW',
        walletLedgerEntryId,
        rideId,
      },
      occurredAt: walletResult.createdAt,
    });

    return {
      wallet: walletResult,
      incentive: incentiveResult,
      skippedReason: null,
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PENDING RESOLVE — Accumulated incentive calculation
  // Uses caller's PoolClient. No BEGIN/COMMIT/ROLLBACK/release.
  // ═══════════════════════════════════════════════════════════════════

  async resolvePendingWithAnnualIncentiveInClient(
    client: PoolClient,
    input: PendingDebitExecutionInput,
  ): Promise<PendingDebitExecutionResult> {
    // Validate shadow configuration before any financial operation
    assertShadowConfiguration();

    const shadowActive = isShadowEnabled() && isWriteEnabled();

    // 1. Execute the wallet debit (pending_resolve)
    const walletResult = await this.walletService.debitPendingInClient(
      client, input.driverId, input.feePendingCents, input.pendingDebitId
    );

    if (!shadowActive) {
      return { walletResult, incentiveResult: null, skippedReason: 'SHADOW_INACTIVE' };
    }

    // 2. Query accumulated base for this ride (fee_debit + pending_resolve in wallet_ledger)
    const totalCollectedFee = await this.queryTotalCollectedFee(client, input.rideId, input.pendingDebitId);

    // 3. Query already-accrued incentive for this ride
    const netAlreadyAccrued = await this.queryNetAccrued(client, input.rideId);

    // 4. Calculate incremental accrual
    const targetEntitlement = (totalCollectedFee * RATE_BASIS_POINTS) / BASIS_POINTS_DENOMINATOR;
    const incrementalAccrual = targetEntitlement - netAlreadyAccrued;

    // 5. Skip if zero or negative increment
    if (incrementalAccrual <= 0n) {
      return { walletResult, incentiveResult: null, skippedReason: 'SKIPPED_ZERO_INCREMENT' };
    }

    // 6. Determine program year from wallet ledger timestamp
    const programYear = getProgramYearBrazil(walletResult.createdAt);
    const walletLedgerEntryId = walletResult.id.toString();
    const idempotencyKey = `annual_incentive:accrual:wallet_ledger:${walletLedgerEntryId}`;

    // 7. Append the incremental ACCRUAL event
    const incentiveResult = await this.ledgerService.appendEventInClient(client, {
      driverId: input.driverId,
      programYear,
      eventType: 'ACCRUAL',
      amountCents: incrementalAccrual,
      baseAmountCents: walletResult.amountCents, // the pending_resolve amount that triggered recalculation
      rateBasisPoints: Number(RATE_BASIS_POINTS),
      policyVersion: POLICY_VERSION,
      sourceType: 'PENDING_RESOLVE',
      sourceId: input.rideId,
      sourceEventId: walletLedgerEntryId,
      requestId: null,
      correlationId: `ride:${input.rideId}`,
      reversalOfId: null,
      idempotencyKey,
      metadata: {
        writeMode: 'SHADOW',
        walletLedgerEntryId,
        pendingDebitId: input.pendingDebitId,
        rideId: input.rideId,
        cumulativeBaseAmountCents: totalCollectedFee.toString(),
        targetEntitlementCents: targetEntitlement.toString(),
      },
      occurredAt: walletResult.createdAt,
    });

    return { walletResult, incentiveResult, skippedReason: null };
  }

  // ═══════════════════════════════════════════════════════════════════
  // PRIVATE — Accumulated queries
  // ═══════════════════════════════════════════════════════════════════

  private async queryTotalCollectedFee(client: PoolClient, rideId: string, pendingDebitId: string): Promise<bigint> {
    const r = await client.query(
      `SELECT COALESCE(SUM(ABS(balance_delta_cents)), 0)::bigint AS total
       FROM wallet_ledger
       WHERE (
         (reference_type = 'ride' AND reference_id = $1 AND entry_type = 'fee_debit')
         OR
         (reference_type = 'pending_debit' AND reference_id = $2 AND entry_type = 'pending_resolve')
       )`,
      [rideId, pendingDebitId]
    );
    return BigInt(r.rows[0].total);
  }

  private async queryNetAccrued(client: PoolClient, rideId: string): Promise<bigint> {
    // Defensive: normalize direction regardless of how REVERSAL amount is stored
    const r = await client.query(
      `SELECT COALESCE(
        SUM(
          CASE
            WHEN event_type = 'ACCRUAL' THEN ABS(amount_cents)
            WHEN event_type = 'REVERSAL' THEN -ABS(amount_cents)
            ELSE 0
          END
        ),
        0
      )::bigint AS net
       FROM annual_incentive_ledger
       WHERE source_id = $1 AND event_type IN ('ACCRUAL', 'REVERSAL')`,
      [rideId]
    );
    return BigInt(r.rows[0].net);
  }
}

// ═══════════════════════════════════════════════════════════════════
// INTERFACES — PendingDebitExecutor
// ═══════════════════════════════════════════════════════════════════

export interface PendingDebitExecutionInput {
  driverId: string;
  pendingDebitId: string;
  rideId: string;
  feePendingCents: bigint;
}

export interface PendingDebitExecutionResult {
  walletResult: DebitPendingResult;
  incentiveResult: AppendEventResult | null;
  skippedReason: string | null;
}

export interface PendingDebitExecutor {
  resolvePendingInClient(
    client: PoolClient,
    input: PendingDebitExecutionInput,
  ): Promise<PendingDebitExecutionResult>;
}

/** Direct executor — resolves pending via WalletService without annual incentive */
export class DirectPendingDebitExecutor implements PendingDebitExecutor {
  constructor(private walletService: WalletService) {}

  async resolvePendingInClient(
    client: PoolClient,
    input: PendingDebitExecutionInput,
  ): Promise<PendingDebitExecutionResult> {
    const walletResult = await this.walletService.debitPendingInClient(
      client, input.driverId, input.feePendingCents, input.pendingDebitId
    );
    return { walletResult, incentiveResult: null, skippedReason: 'DIRECT_EXECUTOR' };
  }
}
