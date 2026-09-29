import type { Prisma } from '@prisma/client';
import { isUnsupportedCareIntent } from './care-readiness-policy';
import type { CareExternalEvidence } from './care-runtime-eligibility';

/**
 * CARE-05A: read-only snapshot from the EXISTING ride, driver and territory
 * records. Never a separate registry, dispatcher, policy table or endpoint.
 *
 * The current generic CAR municipal permission and APP insurance records do
 * NOT establish CARE-specific coverage for assisted/adapted transport. Those
 * two gates remain false until independently verified, mode-specific sources
 * are reviewed and integrated. A generic "allowed" must not be promoted.
 */
export type CareOperationalReadClient = Pick<
  Prisma.TransactionClient, 'rides_v2' | 'drivers' | 'neighborhoods'
>;

export type CareOperationalEvidenceReason =
  | 'CARE_ID_INVALID'
  | 'CARE_OPERATIONAL_LOOKUP_FAILED'
  | 'CARE_RIDE_OR_DRIVER_MISSING'
  | 'CARE_RIDE_IDENTITY_INVALID'
  | 'CARE_TERRITORY_UNRESOLVED'
  | 'CARE_TERRITORY_REVIEW_REQUIRED'
  | 'CARE_OUTSIDE_FALLBACK_NOT_AUTHORIZED'
  | 'CARE_TERRITORY_MISMATCH'
  | 'CARE_MUNICIPAL_SCOPE_NOT_VERIFIED'
  | 'CARE_INSURANCE_SCOPE_NOT_VERIFIED';

export interface CareOperationalEvidenceSnapshot {
  evidence: CareExternalEvidence;
  reasons: CareOperationalEvidenceReason[];
}

const denied = (
  ...reasons: CareOperationalEvidenceReason[]
): CareOperationalEvidenceSnapshot => ({
  evidence: {
    municipalAuthorized: false,
    territoryEligible: false,
    insuranceConfirmedForMode: false,
  },
  reasons: [...reasons, 'CARE_MUNICIPAL_SCOPE_NOT_VERIFIED', 'CARE_INSURANCE_SCOPE_NOT_VERIFIED'],
});

type ReadNeighborhood = {
  is_active: boolean;
  is_verified: boolean;
  verified_by: string | null;
  verified_at: Date | null;
  territory_id: string | null;
  territory: {
    is_active: boolean;
    status: string;
    coverage_status: string;
    coverage_reviewed_by: string | null;
    coverage_reviewed_at: Date | null;
  } | null;
} | null;

/** Existing coverage review, not a new or inferred CARE regulatory approval. */
function isReviewedActiveTerritory(value: ReadNeighborhood, now: Date): boolean {
  if (!value || value.is_active !== true || value.is_verified !== true ||
      !value.verified_by?.trim() ||
      !value.verified_at || value.verified_at.getTime() > now.getTime()) {
    return false;
  }
  const territory = value.territory;
  if (!value.territory_id || !territory ||
      territory.is_active !== true || territory.status !== 'active' ||
      territory.coverage_status !== 'COMPLETE' ||
      !territory.coverage_reviewed_by?.trim() ||
      !territory.coverage_reviewed_at ||
      territory.coverage_reviewed_at.getTime() > now.getTime()) {
    return false;
  }
  return true;
}

/**
 * Snapshot for a later explicit CARE review. This function cannot, by design,
 * return an operational authorization while specialized municipality/insurance
 * proofs are not represented in the verified backend sources.
 *
 * Call with the SAME transaction client as the existing offer/acceptance flow
 * when those sources are eventually integrated. No writing or external calls.
 */
export async function resolveCareOperationalEvidence(
  db: CareOperationalReadClient,
  rideId: string,
  driverId: string,
  now: Date = new Date(),
): Promise<CareOperationalEvidenceSnapshot> {
  if (!rideId?.trim() || !driverId?.trim() || !Number.isFinite(now.getTime())) {
    return denied('CARE_ID_INVALID');
  }

  try {
    const [ride, driver] = await Promise.all([
      db.rides_v2.findUnique({
        where: { id: rideId },
        select: {
          ride_type: true, service_category: true, trip_details: true,
          origin_neighborhood_id: true, origin_community_id: true,
          is_homebound: true, outside_fallback_allowed: true,
          outside_fallback_consented_at: true,
        },
      }),
      db.drivers.findUnique({
        where: { id: driverId },
        select: { neighborhood_id: true, community_id: true },
      }),
    ]);

    if (!ride || !driver) return denied('CARE_RIDE_OR_DRIVER_MISSING');
    if (ride.ride_type !== 'care' ||
        !['CARE_ASSISTED', 'CARE_FOLDING_WHEELCHAIR', 'CARE_ADAPTED_WHEELCHAIR']
          .includes(ride.service_category) ||
        !isUnsupportedCareIntent({
          service_category: ride.service_category,
          ride_type: ride.ride_type,
          trip_details: ride.trip_details,
        })) {
      return denied('CARE_RIDE_IDENTITY_INVALID');
    }

    // The ordinary homebound/outside fallback was never reviewed for CARE.
    // Never silently route a passenger needing assistance outside the
    // confirmed service territory, even when a normal-ride consent exists.
    if (ride.is_homebound || ride.outside_fallback_allowed ||
        ride.outside_fallback_consented_at) {
      return denied('CARE_OUTSIDE_FALLBACK_NOT_AUTHORIZED');
    }
    if (!ride.origin_neighborhood_id || !driver.neighborhood_id) {
      return denied('CARE_TERRITORY_UNRESOLVED');
    }

    const sameNeighborhood = ride.origin_neighborhood_id === driver.neighborhood_id;
    const sameCommunity = !!ride.origin_community_id &&
      ride.origin_community_id === driver.community_id;
    if (!sameNeighborhood && !sameCommunity) {
      return denied('CARE_TERRITORY_MISMATCH');
    }

    const select = {
      id: true, is_active: true, is_verified: true, verified_at: true,
      verified_by: true, territory_id: true,
      territory: {
        select: {
          is_active: true, status: true, coverage_status: true,
          coverage_reviewed_at: true, coverage_reviewed_by: true,
        },
      },
    } as const;

    const origin = await db.neighborhoods.findUnique({
      where: { id: ride.origin_neighborhood_id },
      select,
    });
    const driverHome = sameNeighborhood ? origin : await db.neighborhoods.findUnique({
      where: { id: driver.neighborhood_id },
      select,
    });

    if (!origin || !driverHome) return denied('CARE_TERRITORY_UNRESOLVED');
    if (!isReviewedActiveTerritory(origin, now) ||
        !isReviewedActiveTerritory(driverHome, now)) {
      return denied('CARE_TERRITORY_REVIEW_REQUIRED');
    }
    if (origin.territory_id !== driverHome.territory_id) {
      return denied('CARE_TERRITORY_MISMATCH');
    }

    // This is an existing-territory precondition only. It does NOT attest
    // that the municipality or insurer approved any CARE mode.
    return {
      evidence: {
        territoryEligible: true,
        municipalAuthorized: false,
        insuranceConfirmedForMode: false,
      },
      reasons: [
        'CARE_MUNICIPAL_SCOPE_NOT_VERIFIED',
        'CARE_INSURANCE_SCOPE_NOT_VERIFIED',
      ],
    };
  } catch {
    // Missing table, revoked access or transport failure must not produce
    // a true gate, leak secrets, or trigger a fallback to ordinary CAR.
    return denied('CARE_OPERATIONAL_LOOKUP_FAILED');
  }
}
