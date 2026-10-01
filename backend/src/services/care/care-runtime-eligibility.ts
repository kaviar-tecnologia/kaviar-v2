import type { Prisma } from '@prisma/client';
import {
  evaluateCareEligibility,
  type CareEligibilityResult,
  type CareRejectionCode,
} from './care-eligibility';
import {
  isVerifiedCareScopeEvidence,
  type VerifiedCareScopeEvidence,
} from './care-verified-scope-evidence';

/**
 * CARE-04C: read-only adapter for the existing rides_v2 lifecycle.
 *
 * This service is NOT an authorization endpoint or a dispatcher. It reads
 * current database evidence using a supplied Prisma transaction/client,
 * evaluates the existing CARE-03 policy, and fails closed. Operational gates
 * must be resolved by trusted backend services, NEVER request JSON.
 *
 * CARE-04A remains unconditional and blocks public booking/dispatch/acceptance.
 */
export type CareReadClient = Pick<
  Prisma.TransactionClient,
  'rides_v2' | 'care_trip_requirements' | 'care_driver_qualifications'
  | 'care_vehicle_capabilities' | 'drivers' | 'driver_status'
>;

/**
 * Positive operational gates are no longer accepted as loose booleans.
 * Only a scope bundle produced from the reviewed official municipal,
 * territorial and insurance sources can satisfy them.
 */
export type CareExternalEvidence = VerifiedCareScopeEvidence;

export type CareRuntimeRejectionCode = CareRejectionCode
  | 'CARE_EVIDENCE_UNAVAILABLE'
  | 'CARE_RIDE_NOT_FOUND'
  | 'CARE_RIDE_CATEGORY_MISMATCH'
  | 'CARE_RIDE_NOT_DISPATCHABLE'
  | 'CARE_PRICE_UNCONFIRMED'
  | 'CARE_SCOPE_EVIDENCE_MISMATCH';

export interface CareRuntimeEligibilityResult {
  eligible: boolean;
  reasons: CareRuntimeRejectionCode[];
}

const modeCategory: Readonly<Record<string, string>> = {
  ASSISTED: 'CARE_ASSISTED',
  FOLDING_WHEELCHAIR: 'CARE_FOLDING_WHEELCHAIR',
  ADAPTED_WHEELCHAIR: 'CARE_ADAPTED_WHEELCHAIR',
};

const validPositivePrice = (value: unknown) => {
  if (value == null) return false;
  // Prisma.Decimal implements toString; avoid JS truthiness and NaN fallthrough.
  const amount = Number(value);
  return Number.isFinite(amount) && amount > 0;
};

/**
 * Safe to call from candidate discovery and INSIDE acceptOfferInternal's
 * existing transaction once CARE is explicitly released. A decision based on
 * an earlier read does not authorize acceptance; re-check inside the same
 * transaction and lock/revalidate the offer/ride at the final write boundary.
 *
 * No write, seed, outbound provider call, dispatch or financial operation.
 */
export async function evaluateCareEligibilityFromDb(
  db: CareReadClient,
  rideId: string,
  driverId: string,
  externalEvidence: CareExternalEvidence | null | undefined,
  now: Date = new Date(),
): Promise<CareRuntimeEligibilityResult> {
  if (!rideId || !driverId || !Number.isFinite(now.getTime())) {
    return { eligible: false, reasons: ['CARE_EVIDENCE_UNAVAILABLE'] };
  }

  try {
    const [ride, requirements, qualification, vehicle, driver, liveStatus] = await Promise.all([
      db.rides_v2.findUnique({
        where: { id: rideId },
        select: {
          id: true, ride_type: true, service_category: true, status: true,
          quoted_price: true, locked_price: true,
        },
      }),
      db.care_trip_requirements.findUnique({ where: { ride_id: rideId } }),
      db.care_driver_qualifications.findUnique({ where: { driver_id: driverId } }),
      db.care_vehicle_capabilities.findUnique({ where: { driver_id: driverId } }),
      db.drivers.findUnique({
        where: { id: driverId },
        select: {
          id: true, status: true, deleted_at: true, banned_at: true,
          vehicle_plate: true, vehicle_type: true,
        },
      }),
      db.driver_status.findUnique({
        where: { driver_id: driverId },
        select: { availability: true },
      }),
    ]);

    const reasons: CareRuntimeRejectionCode[] = [];
    if (!ride) reasons.push('CARE_RIDE_NOT_FOUND');
    else {
      if (!requirements || ride.ride_type !== 'care' ||
          ride.service_category !== modeCategory[requirements.mode]) {
        reasons.push('CARE_RIDE_CATEGORY_MISMATCH');
      }
      if (ride.status !== 'requested' && ride.status !== 'offered') {
        reasons.push('CARE_RIDE_NOT_DISPATCHABLE');
      }
      // CARE drafts are deliberately unpriced. There is no official CARE
      // quote/lock source yet, therefore they cannot be offered or accepted.
      if (!validPositivePrice(ride.quoted_price) || !validPositivePrice(ride.locked_price)) {
        reasons.push('CARE_PRICE_UNCONFIRMED');
      }
    }

    const normalizedDriverStatus = String(driver?.status ?? '').toLowerCase();
    const driverOperational = !!driver &&
      ['approved', 'active'].includes(normalizedDriverStatus) &&
      driver.deleted_at == null && driver.banned_at == null;

    const normalizedPlate = (value: string | null | undefined) =>
      typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/g, '') : '';
    const expectedMode = requirements ? modeCategory[String(requirements.mode)] : undefined;
    const evidenceTime = externalEvidence?.verifiedAt instanceof Date
      ? externalEvidence.verifiedAt.getTime()
      : NaN;
    const scopeMatches = isVerifiedCareScopeEvidence(externalEvidence) &&
      !!ride && !!requirements && !!driver &&
      externalEvidence.rideId === rideId &&
      externalEvidence.driverId === driverId &&
      externalEvidence.mode === expectedMode &&
      externalEvidence.territoryId.trim().length > 0 &&
      normalizedPlate(externalEvidence.vehiclePlate) === normalizedPlate(driver.vehicle_plate) &&
      // A prior transaction's evidence cannot be replayed after revocation.
      // Resolve in the same decision/transaction with the very same clock.
      Number.isFinite(evidenceTime) && evidenceTime === now.getTime();

    if (externalEvidence && !scopeMatches) {
      reasons.push('CARE_SCOPE_EVIDENCE_MISMATCH');
    }

    const decision: CareEligibilityResult = evaluateCareEligibility({
      requirements,
      qualification,
      vehicle,
      registeredPlate: driver?.vehicle_plate,
      vehicleType: driver?.vehicle_type,
      trustedGates: {
        driverOperational,
        driverOnline: liveStatus?.availability === 'online',
        municipalAuthorized: scopeMatches,
        territoryEligible: scopeMatches,
        insuranceConfirmedForMode: scopeMatches,
      },
      now,
    });

    return {
      eligible: reasons.length === 0 && decision.eligible,
      reasons: [...new Set([...reasons, ...decision.reasons])],
    };
  } catch {
    // Including a missing CARE-02 table after a cancelled migration.
    // Do not leak SQL, medical data or credentials to callers or logs.
    return { eligible: false, reasons: ['CARE_EVIDENCE_UNAVAILABLE'] };
  }
}
