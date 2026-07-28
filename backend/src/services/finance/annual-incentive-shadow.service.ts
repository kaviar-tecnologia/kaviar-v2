/**
 * Annual Incentive Shadow Integration for fee_debit
 *
 * Composes wallet debit + annual incentive ACCRUAL in the same PostgreSQL transaction.
 * Active only when both ANNUAL_INCENTIVE_SHADOW_ENABLED and ANNUAL_INCENTIVE_WRITE_ENABLED
 * are set to "true".
 */

import { Pool, PoolClient } from 'pg';
import { WalletService, DebitFeeResult, LedgerEntry } from '../wallet-v2/wallet.service';
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

export class AnnualIncentiveShadowService {
  constructor(
    private pool: Pool,
    private walletService: WalletService,
    private ledgerService: AnnualIncentiveLedgerService,
  ) {}

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
}
