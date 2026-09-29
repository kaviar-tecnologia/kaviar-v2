import type { Prisma } from '@prisma/client';

/**
 * CARE-05C — read-only audit of *generic* existing municipal/insurance records.
 * These rows are candidates for documentary review, NEVER proof of CARE scope.
 * The current official schema has no independently approved, structured
 * CARE-mode coverage for municipality + vehicle + territory + insurance.
 */
export type CareScopeAuditClient = Pick<
  Prisma.TransactionClient,
  'rides_v2' | 'care_trip_requirements' | 'drivers' | 'neighborhoods'
  | 'municipal_regulations' | 'municipal_authorizations'
  | 'operational_insurance_coverages' | 'driver_insurance_enrollments'
>;

export interface CareGenericEvidenceHints {
  carRegulationOnFile: boolean;
  driverCarAuthorizationOnFile: boolean;
  carInsuranceCoverageOnFile: boolean;
  providerEnrollmentOnFile: boolean;
}

export interface CareScopeAuditResult {
  /** Literal false: generic records cannot authorize CARE by implication. */
  municipalAuthorized: false;
  insuranceConfirmedForMode: false;
  genericRecords: CareGenericEvidenceHints;
  reasons: string[];
}

const emptyHints = (): CareGenericEvidenceHints => ({
  carRegulationOnFile: false,
  driverCarAuthorizationOnFile: false,
  carInsuranceCoverageOnFile: false,
  providerEnrollmentOnFile: false,
});

const blocked = (reason: string, hints: CareGenericEvidenceHints = emptyHints()): CareScopeAuditResult => ({
  municipalAuthorized: false,
  insuranceConfirmedForMode: false,
  genericRecords: hints,
  reasons: [
    reason,
    'CARE_MUNICIPAL_MODE_SCOPE_NOT_PROVEN',
    'CARE_INSURANCE_MODE_SCOPE_NOT_PROVEN',
  ],
});

const categoryByMode = {
  ASSISTED: 'CARE_ASSISTED',
  FOLDING_WHEELCHAIR: 'CARE_FOLDING_WHEELCHAIR',
  ADAPTED_WHEELCHAIR: 'CARE_ADAPTED_WHEELCHAIR',
} as const;

/**
 * Never calls a payment or insurer provider. Never grants a true gate,
 * irrespective of generic CAR/APP records or an unrestricted CAR permission.
 *
 * All inputs must be internal IDs from the trusted ride/offer service.
 * This function is NOT exposed as a public endpoint and is not wired to
 * dispatcher or accept until a documented CARE-specific evidence model
 * exists in the official regulatory/insurance modules.
 */
export async function auditCareGenericScopeRecords(
  db: CareScopeAuditClient,
  rideId: string,
  driverId: string,
  now: Date = new Date(),
): Promise<CareScopeAuditResult> {
  if (!rideId?.trim() || !driverId?.trim() || !Number.isFinite(now.getTime())) {
    return blocked('CARE_SCOPE_INPUT_INVALID');
  }
  try {
    const [ride, requirements, driver] = await Promise.all([
      db.rides_v2.findUnique({
        where: { id: rideId },
        select: { ride_type: true, service_category: true, origin_neighborhood_id: true },
      }),
      db.care_trip_requirements.findUnique({
        where: { ride_id: rideId },
        select: { mode: true },
      }),
      db.drivers.findUnique({
        where: { id: driverId },
        select: { vehicle_plate: true },
      }),
    ]);

    if (!ride || !requirements || !driver ||
        ride.ride_type !== 'care' ||
        ride.service_category !== categoryByMode[requirements.mode] ||
        !driver.vehicle_plate?.trim()) {
      return blocked('CARE_SCOPE_RIDE_OR_VEHICLE_INVALID');
    }
    if (!ride.origin_neighborhood_id) return blocked('CARE_SCOPE_MUNICIPALITY_UNRESOLVED');

    const origin = await db.neighborhoods.findUnique({
      where: { id: ride.origin_neighborhood_id },
      select: {
        city: true, territory_id: true,
        territory: { select: { uf: true } },
      },
    });
    if (!origin?.city?.trim() || !origin.territory?.uf?.trim() || !origin.territory_id) {
      return blocked('CARE_SCOPE_MUNICIPALITY_UNRESOLVED');
    }

    const city = origin.city.trim();
    const uf = origin.territory.uf.trim().toUpperCase();

    // A generic CAR regulation is merely an audit candidate, even when
    // no municipal approval is required by the normal CAR service.
    const [regulation, authorization, coverage, enrollment] = await Promise.all([
      db.municipal_regulations.findFirst({
        where: {
          city: { equals: city, mode: 'insensitive' },
          state: { equals: uf, mode: 'insensitive' },
          service_modality: 'CAR',
          is_active: true,
        },
        select: { id: true },
      }),
      db.municipal_authorizations.findFirst({
        where: {
          driver_id: driverId,
          city: { equals: city, mode: 'insensitive' },
          state: { equals: uf, mode: 'insensitive' },
          service_modality: 'CAR',
          status: 'APPROVED_BY_CITY_HALL',
          approved_by_admin_id: { not: null },
          OR: [
            { authorization_valid_until: null },
            { authorization_valid_until: { gte: now } },
          ],
        },
        select: { id: true },
      }),
      db.operational_insurance_coverages.findFirst({
        where: {
          modality: 'CAR_PASSENGER',
          status: 'ACTIVE',
          valid_from: { lte: now },
          valid_until: { gte: now },
          policy_number: { not: '' },
          document_url: { not: null },
          OR: [{ territory_id: origin.territory_id }, { territory_id: null }],
        },
        select: { id: true },
      }),
      db.driver_insurance_enrollments.findFirst({
        where: {
          driver_id: driverId,
          vehicle_plate: { equals: driver.vehicle_plate, mode: 'insensitive' },
          status: 'ACTIVE',
          valid_from: { lte: now },
          valid_until: { gte: now },
          cancelled_at: null,
          provider_reference: { not: null },
        },
        select: { id: true },
      }),
    ]);

    return blocked('CARE_SCOPE_MODE_SPECIFIC_REVIEW_REQUIRED', {
      carRegulationOnFile: !!regulation,
      driverCarAuthorizationOnFile: !!authorization,
      carInsuranceCoverageOnFile: !!coverage,
      providerEnrollmentOnFile: !!enrollment,
    });
  } catch {
    return blocked('CARE_SCOPE_LOOKUP_FAILED');
  }
}
