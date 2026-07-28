/**
 * Eligibility Check Service for Annual Incentive Payouts.
 *
 * Automatic eligibility — no human approval in the normal flow.
 * Checks all conditions required before queuing a payout.
 */

import { Pool } from 'pg';
import { projectBalance } from './balance-projection';
import { getActiveDestination, getDriverCpf } from './destination.service';
import { isWithinRequestWindow } from './request-window';
import { normalizeCpf, hmacPayoutValue } from './crypto';
import { EligibilityCheck, AnnualIncentiveRequest, PAYOUT_ERRORS } from './types';
import { AnnualIncentivePayoutProvider } from './types';

export interface EligibilityContext {
  pool: Pool;
  provider: AnnualIncentivePayoutProvider;
}

/**
 * Runs all eligibility checks for a reserved request.
 * Returns eligible=true only when ALL conditions pass.
 */
export async function checkEligibility(
  ctx: EligibilityContext,
  request: AnnualIncentiveRequest,
): Promise<EligibilityCheck> {
  const { pool, provider } = ctx;
  const { driverId } = request;

  // 1. Window check
  if (!isWithinRequestWindow()) {
    return {
      eligible: false,
      failureCode: PAYOUT_ERRORS.WINDOW_CLOSED,
      failureMessageSafe: 'Request window is closed',
      isDefinitive: true,
    };
  }

  // 2. Destination exists and is active
  const dest = await getActiveDestination(pool, driverId);
  if (!dest) {
    return {
      eligible: false,
      failureCode: PAYOUT_ERRORS.DESTINATION_NOT_FOUND,
      failureMessageSafe: 'No active payout destination',
      isDefinitive: true,
    };
  }

  // 3. CPF matches driver document
  const driverCpf = await getDriverCpf(pool, driverId);
  if (!driverCpf) {
    return {
      eligible: false,
      failureCode: PAYOUT_ERRORS.CPF_NOT_VERIFIED,
      failureMessageSafe: 'Driver CPF not registered',
      isDefinitive: true,
    };
  }

  const driverCpfHash = hmacPayoutValue(normalizeCpf(driverCpf));
  if (dest.ownerDocumentHash !== driverCpfHash) {
    return {
      eligible: false,
      failureCode: PAYOUT_ERRORS.CPF_MISMATCH,
      failureMessageSafe: 'Destination CPF does not match driver document',
      isDefinitive: true,
    };
  }

  // 4. Destination hash matches request snapshot
  if (dest.pixKeyHash !== request.destinationHash) {
    return {
      eligible: false,
      failureCode: PAYOUT_ERRORS.DESTINATION_INVALID,
      failureMessageSafe: 'Destination changed after request creation',
      isDefinitive: true,
    };
  }

  // 5. Balance check (re-verify within current state)
  const balance = await projectBalance(pool, driverId);
  if (balance.totalAvailableCents + request.requestedAmountCents < request.requestedAmountCents) {
    // This shouldn't happen if reservation was correct, but defensive check
    return {
      eligible: false,
      failureCode: PAYOUT_ERRORS.INSUFFICIENT_BALANCE,
      failureMessageSafe: 'Insufficient balance',
      isDefinitive: false,
    };
  }

  // 6. Provider availability
  const providerAvail = await provider.validateAvailability();
  if (!providerAvail.available) {
    return {
      eligible: false,
      failureCode: PAYOUT_ERRORS.PROVIDER_CAPABILITY_NOT_CONFIRMED,
      failureMessageSafe: providerAvail.reason ?? 'Provider not available',
      isDefinitive: false,
    };
  }

  // 7. Execution enabled
  if (process.env.ANNUAL_INCENTIVE_PAYOUT_ENABLED !== 'true') {
    return {
      eligible: false,
      failureCode: PAYOUT_ERRORS.PROVIDER_UNAVAILABLE,
      failureMessageSafe: 'Payout execution not enabled',
      isDefinitive: false,
    };
  }

  // 8. Not production (safety)
  if (process.env.NODE_ENV === 'production') {
    return {
      eligible: false,
      failureCode: PAYOUT_ERRORS.PRODUCTION_BLOCKED,
      failureMessageSafe: 'Production payouts blocked in this build',
      isDefinitive: false,
    };
  }

  return { eligible: true };
}
