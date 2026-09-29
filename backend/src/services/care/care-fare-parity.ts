/**
 * CARE-05B — passenger-fare non-discrimination contract.
 *
 * This module DOES NOT quote, price, bill, settle, dispatch or activate CARE.
 * The official pricing engine and ride_settlements remain the only writers.
 * Callers must load both snapshots from trusted backend sources for THE SAME
 * comparable itinerary and time; client-provided fare/provenance is forbidden.
 */
export type CareFareRejection =
  | 'CARE_CANONICAL_FARE_MISSING'
  | 'CARE_FARE_SOURCE_UNVERIFIED'
  | 'CARE_FARE_CONTEXT_MISMATCH'
  | 'CARE_FARE_INVALID'
  | 'CARE_FARE_NOT_LOCKED'
  | 'CARE_FARE_DISCRIMINATORY_DIFFERENCE'
  | 'CARE_ADDITIONAL_CHARGE_FORBIDDEN';

export type OfficialComparableFare = {
  /** Verified backend read of the ordinary-car pricing/settlement snapshot. */
  source: 'ride_settlements';
  routeKey: string;
  pricingProfileId: string;
  quotedPrice: number;
  lockedPrice: number;
  quotedAt: Date;
  lockedAt: Date;
};

export type CareFareCandidate = {
  /** Proposed fare; not permission to call quote(), lock() or settle(). */
  routeKey: string;
  pricingProfileId: string;
  quotedPrice: number;
  lockedPrice: number;
  additionalChargeCents: number;
  driverAdjustmentCents: number;
};

export type CareFareParityResult = {
  valid: boolean;
  reasons: CareFareRejection[];
};

/** Rejects non-cent values rather than silently rounding hidden surcharges. */
const inCents = (n: number): number | null => {
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return null;
  const cents = Math.round(n * 100);
  return Number.isSafeInteger(cents) && Math.abs(n * 100 - cents) < 1e-7
    ? cents
    : null;
};

/**
 * The same ordinary-car trip cannot cost more because of age, disability,
 * wheelchair mode, mobility aids, guide dog, boarding time or companion needs.
 * These fields are intentionally absent from the pricing inputs.
 *
 * A separate genuinely optional service requires independent legal review
 * and explicit customer choice; it is NOT implemented by this contract.
 */
export function evaluateCareFareParity(
  canonical: OfficialComparableFare | null | undefined,
  care: CareFareCandidate | null | undefined,
): CareFareParityResult {
  const reasons = new Set<CareFareRejection>();
  if (!canonical || !care) {
    return { valid: false, reasons: ['CARE_CANONICAL_FARE_MISSING'] };
  }

  if (canonical.source !== 'ride_settlements' ||
      !canonical.pricingProfileId?.trim() || !canonical.routeKey?.trim() ||
      !care.pricingProfileId?.trim() || !care.routeKey?.trim() ||
      !(canonical.quotedAt instanceof Date) ||
      !(canonical.lockedAt instanceof Date) ||
      !Number.isFinite(canonical.quotedAt.getTime()) ||
      !Number.isFinite(canonical.lockedAt.getTime())) {
    reasons.add('CARE_FARE_SOURCE_UNVERIFIED');
  }

  if (canonical.routeKey !== care.routeKey ||
      canonical.pricingProfileId !== care.pricingProfileId) {
    reasons.add('CARE_FARE_CONTEXT_MISMATCH');
  }

  const amounts = [
    canonical.quotedPrice, canonical.lockedPrice,
    care.quotedPrice, care.lockedPrice,
  ].map(inCents);
  if (amounts.some(n => n === null)) {
    reasons.add('CARE_FARE_INVALID');
  } else {
    const [baseQuoted, baseLocked, proposedQuoted, proposedLocked] = amounts as number[];
    if (baseQuoted !== baseLocked || proposedQuoted !== proposedLocked ||
        canonical.lockedAt.getTime() < canonical.quotedAt.getTime()) {
      reasons.add('CARE_FARE_NOT_LOCKED');
    }
    if (baseQuoted !== proposedQuoted || baseLocked !== proposedLocked) {
      reasons.add('CARE_FARE_DISCRIMINATORY_DIFFERENCE');
    }
  }

  if (!Number.isSafeInteger(care.additionalChargeCents) ||
      !Number.isSafeInteger(care.driverAdjustmentCents) ||
      care.additionalChargeCents !== 0 || care.driverAdjustmentCents !== 0) {
    reasons.add('CARE_ADDITIONAL_CHARGE_FORBIDDEN');
  }

  return { valid: reasons.size === 0, reasons: [...reasons] };
}
