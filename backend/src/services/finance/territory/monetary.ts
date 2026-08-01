/**
 * Monetary arithmetic — BigInt cents only.
 *
 * NEVER use Number, Math.round, or floating point for financial calculations.
 * All rates expressed in basis points (1 bp = 0.01%).
 *
 * Rounding: half-up (banker's rounding not used — half-up is simpler and deterministic).
 */

/**
 * Applies a rate in basis points to an amount in cents.
 * Uses integer division with half-up rounding.
 *
 * Formula: round_half_up(amountCents × rateBps / 10000)
 *
 * Example: applyBasisPoints(10000n, 1800) = 1800n (18% of R$100)
 */
export function applyBasisPoints(amountCents: bigint, rateBps: number): bigint {
  const rate = BigInt(rateBps);
  const numerator = amountCents * rate;
  // Half-up rounding: (numerator + 5000) / 10000
  // But for positive values: (numerator * 2 + 10000) / 20000 is equivalent
  // Simpler: add half the divisor before dividing
  const divisor = 10000n;
  const halfDivisor = 5000n;
  if (numerator >= 0n) {
    return (numerator + halfDivisor) / divisor;
  } else {
    return (numerator - halfDivisor) / divisor;
  }
}

/**
 * Platform fee rate: 18% = 1800 basis points
 */
export const PLATFORM_FEE_RATE_BPS = 1800;

/**
 * Platform fee as a percentage (e.g. 18).
 * Derived from PLATFORM_FEE_RATE_BPS. Use for persistence columns (fee_percent),
 * display, and Number-arithmetic paths (pricing-engine quote/refine/settle).
 */
export const PLATFORM_FEE_PERCENT = PLATFORM_FEE_RATE_BPS / 100;

/**
 * Manager commission rate: 40% of platform fee = 4000 basis points
 */
export const MANAGER_COMMISSION_RATE_BPS = 4000;

/**
 * Calculates platform fee from ride price.
 */
export function calculatePlatformFee(finalPriceCents: bigint): bigint {
  return applyBasisPoints(finalPriceCents, PLATFORM_FEE_RATE_BPS);
}

/**
 * Calculates manager commission from platform fee.
 * The commission is 40% of the platform fee, NOT 40% of the ride price.
 */
export function calculateManagerCommission(platformFeeCents: bigint): bigint {
  return applyBasisPoints(platformFeeCents, MANAGER_COMMISSION_RATE_BPS);
}
