/**
 * Annual Incentive Payout Engine Selection.
 *
 * ANNUAL_INCENTIVE_PAYOUT_ENGINE controls which payment path is used:
 *   "disabled" — no worker starts, no external submissions
 *   "legacy"   — uses annual_incentive_payout_outbox (old path)
 *   "outbound"  — uses financial_payout_outbox (generic path)
 *
 * Missing or invalid value → disabled (fail closed).
 * NEVER allow both engines to process the same request.
 */

export type PayoutEngine = 'disabled' | 'legacy' | 'outbound';

const VALID_ENGINES: readonly PayoutEngine[] = ['disabled', 'legacy', 'outbound'];

/**
 * Returns the configured payout engine for Annual Incentive.
 * Defaults to 'disabled' if not set or invalid.
 */
export function getAnnualIncentivePayoutEngine(): PayoutEngine {
  const value = process.env.ANNUAL_INCENTIVE_PAYOUT_ENGINE ?? '';
  if (VALID_ENGINES.includes(value as PayoutEngine)) {
    return value as PayoutEngine;
  }
  return 'disabled';
}

/**
 * Whether the legacy worker should start for annual incentive.
 */
export function shouldStartLegacyWorker(): boolean {
  return getAnnualIncentivePayoutEngine() === 'legacy';
}

/**
 * Whether the outbound engine handles annual incentive requests.
 */
export function shouldUseOutboundEngine(): boolean {
  return getAnnualIncentivePayoutEngine() === 'outbound';
}

/**
 * Whether annual incentive payout is entirely disabled.
 */
export function isAnnualIncentivePayoutDisabled(): boolean {
  return getAnnualIncentivePayoutEngine() === 'disabled';
}
