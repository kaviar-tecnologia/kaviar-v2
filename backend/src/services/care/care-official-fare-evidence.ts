import type { Prisma } from '@prisma/client';
import { PLATFORM_FEE_PERCENT } from '../finance/territory/monetary';

/**
 * CARE-06B, phase 1: read-only integrity check of the ONE official settlement.
 *
 * This is NOT a quote, a second CAR ride, a fabricated comparator, a payment
 * writer, or permission to dispatch. The positive CAR_NORMAL quote/lock path
 * and same-transaction offer/accept proof are follow-up work in #436.
 */
export type CareFareDb = Pick<Prisma.TransactionClient, 'rides_v2' | 'ride_settlements'>;

export type CareOfficialFareFailure =
  | 'CARE_FARE_OFFICIAL_RECORD_MISSING'
  | 'CARE_FARE_RIDE_CATEGORY_INVALID'
  | 'CARE_FARE_CAR_PROFILE_UNVERIFIED'
  | 'CARE_FARE_LOCK_INVALID'
  | 'CARE_FARE_CACHE_MISMATCH'
  | 'CARE_FARE_ADJUSTMENT_FORBIDDEN'
  | 'CARE_FARE_FINAL_MISMATCH'
  | 'CARE_FARE_FEE_SNAPSHOT_MISMATCH'
  | 'CARE_FARE_OFFICIAL_READ_FAILED';

export interface CareOfficialFareEvidence {
  source: 'ride_settlements';
  rideId: string;
  pricingProfileId: string;
  quotedCents: number;
  lockedCents: number;
  finalCents: number | null;
  quotedAt: Date;
  lockedAt: Date;
  settledAt: Date | null;
}

export type CareOfficialFareResult =
  | { valid: true; evidence: CareOfficialFareEvidence; reasons: [] }
  | { valid: false; evidence: null; reasons: CareOfficialFareFailure[] };

const modes = new Set([
  'CARE_ASSISTED',
  'CARE_FOLDING_WHEELCHAIR',
  'CARE_ADAPTED_WHEELCHAIR',
]);

const cents = (value: unknown, allowZero = false): number | null => {
  if (value === null || value === undefined || typeof value === 'boolean') return null;
  const decimal = Number(value);
  if (!Number.isFinite(decimal) || decimal < 0 || (!allowZero && decimal === 0)) return null;
  const integer = Math.round(decimal * 100);
  return Number.isSafeInteger(integer) && Math.abs(decimal * 100 - integer) < 1e-7
    ? integer : null;
};

const timestamp = (value: unknown): number =>
  value instanceof Date ? value.getTime() : Number.NaN;

/**
 * Load only persisted backend records for the same ride ID. Consumer-provided
 * price, clinical data, a declared "premium" tier or a loose approval flag
 * can never produce this evidence.
 *
 * Call this again from the decisive write transaction once CARE-04A receives
 * a separately reviewed release; an earlier read alone is not authorization.
 */
export async function readCareOfficialFareEvidence(
  db: CareFareDb,
  rideId: string,
  now = new Date(),
): Promise<CareOfficialFareResult> {
  const reject = (reason: CareOfficialFareFailure): CareOfficialFareResult => ({
    valid: false, evidence: null, reasons: [reason],
  });

  if (!rideId || !Number.isFinite(now.getTime())) {
    return reject('CARE_FARE_OFFICIAL_RECORD_MISSING');
  }

  try {
    const [ride, settlement] = await Promise.all([
      db.rides_v2.findUnique({
        where: { id: rideId },
        select: {
          id: true, ride_type: true, service_category: true,
          origin_neighborhood_id: true, dest_neighborhood_id: true,
          pricing_profile_id: true,
          quoted_price: true, locked_price: true, final_price: true,
          platform_fee: true, driver_earnings: true,
          driver_adjustment: true, adjusted_price: true,
        },
      }),
      db.ride_settlements.findUnique({
        where: { ride_id: rideId },
        include: {
          pricing_profile: {
            select: {
              id: true, slug: true, vehicle_category: true,
              service_category: true,
            },
          },
        },
      }),
    ]);

    if (!ride || !settlement || settlement.ride_id !== ride.id) {
      return reject('CARE_FARE_OFFICIAL_RECORD_MISSING');
    }
    if (ride.ride_type !== 'care' || !modes.has(ride.service_category)) {
      return reject('CARE_FARE_RIDE_CATEGORY_INVALID');
    }

    const profile = settlement.pricing_profile;
    if (!profile || profile.vehicle_category !== 'CAR' ||
        profile.service_category !== 'CAR_NORMAL' ||
        settlement.pricing_profile_id !== profile.id ||
        ride.pricing_profile_id !== profile.id ||
        settlement.pricing_profile_slug !== profile.slug ||
        settlement.origin_neighborhood_id !== ride.origin_neighborhood_id ||
        settlement.dest_neighborhood_id !== ride.dest_neighborhood_id) {
      return reject('CARE_FARE_CAR_PROFILE_UNVERIFIED');
    }

    const quotedAt = timestamp(settlement.quoted_at);
    const lockedAt = timestamp(settlement.locked_at);
    if (!Number.isFinite(quotedAt) || !Number.isFinite(lockedAt) ||
        quotedAt > now.getTime() || lockedAt > now.getTime() || lockedAt < quotedAt) {
      return reject('CARE_FARE_LOCK_INVALID');
    }
    const quoted = cents(settlement.quoted_price);
    const locked = cents(settlement.locked_price);
    if (quoted === null || locked === null || quoted !== locked) {
      return reject('CARE_FARE_LOCK_INVALID');
    }
    if (cents(ride.quoted_price) !== quoted || cents(ride.locked_price) !== locked) {
      return reject('CARE_FARE_CACHE_MISMATCH');
    }

    // Neither passenger characteristics nor extra boarding time can become a
    // premium, adjustment, hidden minimum or an additional charge.
    if ((ride.driver_adjustment != null && cents(ride.driver_adjustment, true) !== 0) ||
        (ride.adjusted_price != null && cents(ride.adjusted_price) !== locked)) {
      return reject('CARE_FARE_ADJUSTMENT_FORBIDDEN');
    }

    const final = settlement.final_price == null ? null : cents(settlement.final_price);
    const cacheFinal = ride.final_price == null ? null : cents(ride.final_price);
    const settledAt = settlement.settled_at;
    if (final === null && settlement.final_price != null ||
        final !== cacheFinal ||
        (final !== null && (final !== locked || !settledAt)) ||
        (settledAt !== null && final === null) ||
        (settledAt !== null && (!Number.isFinite(timestamp(settledAt)) ||
          timestamp(settledAt) < lockedAt || timestamp(settledAt) > now.getTime()))) {
      return reject('CARE_FARE_FINAL_MISMATCH');
    }

    const fee = cents(settlement.fee_amount, true);
    const earnings = cents(settlement.driver_earnings, true);
    const cachedFee = cents(ride.platform_fee, true);
    const cachedEarnings = cents(ride.driver_earnings, true);
    if (fee === null || earnings === null || fee !== cachedFee ||
        earnings !== cachedEarnings || fee + earnings !== locked ||
        Number(settlement.fee_percent) !== PLATFORM_FEE_PERCENT ||
        fee !== Math.round(locked * PLATFORM_FEE_PERCENT / 100)) {
      return reject('CARE_FARE_FEE_SNAPSHOT_MISMATCH');
    }

    return {
      valid: true,
      evidence: {
        source: 'ride_settlements',
        rideId: ride.id,
        pricingProfileId: profile.id,
        quotedCents: quoted,
        lockedCents: locked,
        finalCents: final,
        quotedAt: settlement.quoted_at,
        lockedAt: settlement.locked_at!,
        settledAt,
      },
      reasons: [],
    };
  } catch {
    return reject('CARE_FARE_OFFICIAL_READ_FAILED');
  }
}
