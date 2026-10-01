/**
 * CARE-445: read-only proof that a ride has an official, locked price.
 *
 * ride_settlements is the ONE economic source of truth. rides_v2 only caches
 * its amounts. This never calculates a fare, creates a second quote, or opens
 * a CARE service. Callers must load the relation from the database.
 */
export const officialQuoteSettlementSelect = {
  ride_id: true,
  pricing_profile_id: true,
  quoted_price: true,
  locked_price: true,
  fee_amount: true,
  driver_earnings: true,
  quoted_at: true,
  locked_at: true,
} as const;

type FareValue = { toString(): string } | string | number | null | undefined;

export interface OfficialQuoteSnapshot {
  id: string;
  pricing_profile_id?: string | null;
  quoted_price?: FareValue;
  locked_price?: FareValue;
  platform_fee?: FareValue;
  driver_earnings?: FareValue;
  settlement?: {
    ride_id: string;
    pricing_profile_id: string;
    quoted_price: FareValue;
    locked_price: FareValue;
    fee_amount: FareValue;
    driver_earnings: FareValue;
    quoted_at: Date;
    locked_at: Date | null;
  } | null;
}

function toCents(value: FareValue, allowZero = false): number | null {
  if (value == null || typeof value === 'boolean') return null;
  const amount = Number(value.toString());
  if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0)) return null;
  const cents = Math.round(amount * 100);
  return Number.isSafeInteger(cents) && Math.abs(amount * 100 - cents) < 1e-7
    ? cents : null;
}

export function hasOfficialLockedQuote(ride: OfficialQuoteSnapshot | null | undefined): boolean {
  if (!ride?.settlement || !ride.pricing_profile_id) return false;
  const s = ride.settlement;
  if (s.ride_id !== ride.id || s.pricing_profile_id !== ride.pricing_profile_id) return false;

  const quotedAt = s.quoted_at instanceof Date ? s.quoted_at.getTime() : Number.NaN;
  const lockedAt = s.locked_at instanceof Date ? s.locked_at.getTime() : Number.NaN;
  if (!Number.isFinite(quotedAt) || !Number.isFinite(lockedAt) || lockedAt < quotedAt) return false;

  const quoted = toCents(s.quoted_price);
  const locked = toCents(s.locked_price);
  const fee = toCents(s.fee_amount, true);
  const earnings = toCents(s.driver_earnings, true);
  return quoted !== null && locked !== null && fee !== null && earnings !== null &&
    quoted === toCents(ride.quoted_price) &&
    locked === toCents(ride.locked_price) &&
    fee === toCents(ride.platform_fee, true) &&
    earnings === toCents(ride.driver_earnings, true) &&
    fee + earnings === locked;
}
