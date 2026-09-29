import type { Prisma } from '@prisma/client';

const careScopeEvidenceBrand: unique symbol = Symbol('careScopeEvidenceBrand');

export type CareVerifiedMode =
  | 'CARE_ASSISTED'
  | 'CARE_FOLDING_WHEELCHAIR'
  | 'CARE_ADAPTED_WHEELCHAIR';

export type CareScopeEvidenceRejection =
  | 'CARE_SCOPE_INPUT_INVALID'
  | 'CARE_SCOPE_RIDE_INVALID'
  | 'CARE_SCOPE_DRIVER_INVALID'
  | 'CARE_SCOPE_TERRITORY_UNVERIFIED'
  | 'CARE_SCOPE_PICKUP_GEOFENCE_UNVERIFIED'
  | 'CARE_SCOPE_DRIVER_OUTSIDE_TERRITORY'
  | 'CARE_SCOPE_MUNICIPAL_RECORD_MISSING'
  | 'CARE_SCOPE_MUNICIPAL_REVIEW_INVALID'
  | 'CARE_SCOPE_MUNICIPAL_AUTHORIZATION_MISSING'
  | 'CARE_SCOPE_INSURANCE_COVERAGE_MISSING'
  | 'CARE_SCOPE_INSURANCE_REVIEW_INVALID'
  | 'CARE_SCOPE_DRIVER_ENROLLMENT_MISSING'
  | 'CARE_SCOPE_LOOKUP_FAILED';

export type CareScopeEvidenceClient = Pick<
  Prisma.TransactionClient,
  | 'rides_v2'
  | 'care_trip_requirements'
  | 'drivers'
  | 'neighborhoods'
  | 'municipal_regulations'
  | 'municipal_authorizations'
  | 'operational_insurance_coverages'
  | 'driver_insurance_enrollments'
  | '$queryRaw'
>;

export interface VerifiedCareScopeEvidence {
  readonly [careScopeEvidenceBrand]: true;
  readonly rideId: string;
  readonly driverId: string;
  readonly mode: CareVerifiedMode;
  readonly territoryId: string;
  readonly city: string;
  readonly state: string;
  readonly vehiclePlate: string;
  readonly verifiedAt: Date;
  readonly territory: {
    source: 'operational_territories';
    territoryId: string;
    originNeighborhoodId: string;
    coverageReviewedAt: Date;
    coverageReviewedBy: string;
  };
  readonly municipal: {
    source: 'municipal_regulations';
    regulationId: string;
    regulationStatus: 'REGULATED' | 'NOT_REGULATED';
    scopeDocumentUrl: string;
    scopeVerifiedAt: Date;
    scopeVerifiedByAdminId: string;
    requiresCityApproval: boolean;
    authorizationId: string | null;
    authorizationDocumentUrl: string | null;
    authorizationValidUntil: Date | null;
    authorizationApprovedByAdminId: string | null;
  };
  readonly insurance: {
    source: 'operational_insurance_coverages';
    coverageId: string;
    enrollmentId: string;
    providerName: string;
    policyNumber: string;
    providerReference: string;
    coverageLinkedAt: Date;
    coverageLinkedByAdminId: string;
    documentUrl: string;
    validFrom: Date;
    validUntil: Date;
    scopeVerifiedAt: Date;
    scopeVerifiedByAdminId: string;
  };
}

export type CareScopeEvidenceResult =
  | { verified: true; evidence: VerifiedCareScopeEvidence; reasons: [] }
  | { verified: false; evidence: null; reasons: CareScopeEvidenceRejection[] };

/**
 * Runtime provenance check. The brand symbol is module-private, so a request
 * JSON or a hand-built plain object cannot satisfy this gate by setting loose
 * booleans/strings. Only evidence issued by this resolver carries the brand.
 */
export function isVerifiedCareScopeEvidence(value: unknown): value is VerifiedCareScopeEvidence {
  return !!value &&
    typeof value === 'object' &&
    (value as Record<PropertyKey, unknown>)[careScopeEvidenceBrand] === true;
}

const MODE_BY_REQUIREMENT: Readonly<Record<string, CareVerifiedMode>> = {
  ASSISTED: 'CARE_ASSISTED',
  FOLDING_WHEELCHAIR: 'CARE_FOLDING_WHEELCHAIR',
  ADAPTED_WHEELCHAIR: 'CARE_ADAPTED_WHEELCHAIR',
};

const fail = (...reasons: CareScopeEvidenceRejection[]): CareScopeEvidenceResult => ({
  verified: false,
  evidence: null,
  reasons: [...new Set(reasons)],
});

const normalizedPlate = (value: string | null | undefined): string =>
  typeof value === 'string' ? value.toUpperCase().replace(/[\s-]/g, '') : '';

const startOfUtcDay = (value: Date): Date =>
  new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

const validOnCivilDay = (value: Date | null | undefined, today: Date): value is Date =>
  value instanceof Date && Number.isFinite(value.getTime()) && value.getTime() >= today.getTime();

const pastOrNow = (value: Date | null | undefined, now: Date): value is Date =>
  value instanceof Date && Number.isFinite(value.getTime()) && value.getTime() <= now.getTime();

/**
 * Reads only the EXISTING official regulation/insurance/territory sources.
 * It performs no write and no provider call. Positive evidence can only exist
 * after exact CARE-mode records were reviewed and persisted in those sources.
 *
 * Future dispatcher/acceptance integration MUST call this with the SAME Prisma
 * transaction client used for the final offer/accept write, then immediately
 * pass the returned branded evidence to evaluateCareEligibilityFromDb.
 */
export async function resolveVerifiedCareScopeEvidence(
  db: CareScopeEvidenceClient,
  rideId: string,
  driverId: string,
  now: Date = new Date(),
): Promise<CareScopeEvidenceResult> {
  if (!rideId?.trim() || !driverId?.trim() || !Number.isFinite(now.getTime())) {
    return fail('CARE_SCOPE_INPUT_INVALID');
  }

  try {
    const today = startOfUtcDay(now);
    const [ride, requirement, driver] = await Promise.all([
      db.rides_v2.findUnique({
        where: { id: rideId },
        select: {
          ride_type: true,
          service_category: true,
          origin_neighborhood_id: true,
          origin_lat: true,
          origin_lng: true,
        },
      }),
      db.care_trip_requirements.findUnique({
        where: { ride_id: rideId },
        select: { mode: true, status: true },
      }),
      db.drivers.findUnique({
        where: { id: driverId },
        select: { vehicle_plate: true, neighborhood_id: true },
      }),
    ]);

    const mode = requirement ? MODE_BY_REQUIREMENT[String(requirement.mode)] : undefined;
    if (!ride || !requirement || requirement.status !== 'READY' || !mode ||
        ride.ride_type !== 'care' || ride.service_category !== mode ||
        !ride.origin_neighborhood_id) {
      return fail('CARE_SCOPE_RIDE_INVALID');
    }

    const vehiclePlate = normalizedPlate(driver?.vehicle_plate);
    if (!driver || !vehiclePlate || !driver.neighborhood_id) {
      return fail('CARE_SCOPE_DRIVER_INVALID');
    }

    const neighborhoodSelect = {
      id: true,
      city: true,
      is_active: true,
      is_verified: true,
      verified_at: true,
      verified_by: true,
      territory_id: true,
      territory: {
        select: {
          id: true,
          uf: true,
          is_active: true,
          status: true,
          coverage_status: true,
          coverage_reviewed_at: true,
          coverage_reviewed_by: true,
        },
      },
    } as const;

    const origin = await db.neighborhoods.findUnique({
      where: { id: ride.origin_neighborhood_id },
      select: neighborhoodSelect,
    });
    const driverHome = driver.neighborhood_id === ride.origin_neighborhood_id
      ? origin
      : await db.neighborhoods.findUnique({
          where: { id: driver.neighborhood_id },
          select: neighborhoodSelect,
        });

    const territory = origin?.territory;
    const territoryReviewed =
      !!origin && !!territory &&
      origin.is_active === true &&
      origin.is_verified === true &&
      !!origin.verified_by?.trim() &&
      pastOrNow(origin.verified_at, now) &&
      !!origin.territory_id &&
      territory.is_active === true &&
      territory.status === 'active' &&
      territory.coverage_status === 'COMPLETE' &&
      !!territory.coverage_reviewed_by?.trim() &&
      pastOrNow(territory.coverage_reviewed_at, now) &&
      !!origin.city?.trim() &&
      !!territory.uf?.trim();

    if (!territoryReviewed || !origin || !territory || !origin.territory_id) {
      return fail('CARE_SCOPE_TERRITORY_UNVERIFIED');
    }
    if (!driverHome || driverHome.territory_id !== origin.territory_id ||
        driverHome.is_active !== true || driverHome.is_verified !== true ||
        !driverHome.verified_by?.trim() || !pastOrNow(driverHome.verified_at, now) ||
        driverHome.territory?.is_active !== true || driverHome.territory.status !== 'active' ||
        driverHome.territory.coverage_status !== 'COMPLETE' ||
        !driverHome.territory.coverage_reviewed_by?.trim() ||
        !pastOrNow(driverHome.territory.coverage_reviewed_at, now)) {
      return fail('CARE_SCOPE_DRIVER_OUTSIDE_TERRITORY');
    }

    // Exact stored pickup coordinate; no neighborhood center or 800m fallback.
    // Resolve through the SAME Prisma client/transaction as the evidence.
    const lat = Number(ride.origin_lat);
    const lng = Number(ride.origin_lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90 ||
        !Number.isFinite(lng) || lng < -180 || lng > 180) {
      return fail('CARE_SCOPE_PICKUP_GEOFENCE_UNVERIFIED');
    }
    const pickupCoverage = await db.$queryRaw<Array<{ covered: boolean }>>`
      SELECT ST_Covers(
        ng.geom,
        ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
      ) AS covered
      FROM neighborhood_geofences ng
      WHERE ng.neighborhood_id = ${ride.origin_neighborhood_id}
        AND ng.geom IS NOT NULL
        AND ST_SRID(ng.geom) = 4326
        AND ST_IsValid(ng.geom)
      LIMIT 1
    `;
    if (pickupCoverage.length !== 1 || pickupCoverage[0]?.covered !== true) {
      return fail('CARE_SCOPE_PICKUP_GEOFENCE_UNVERIFIED');
    }

    const city = origin.city.trim();
    const state = territory.uf!.trim().toUpperCase();

    const regulation = await db.municipal_regulations.findFirst({
      where: {
        city: { equals: city, mode: 'insensitive' },
        state: { equals: state, mode: 'insensitive' },
        service_modality: mode,
        is_active: true,
      },
      select: {
        id: true,
        regulation_status: true,
        requires_city_approval: true,
        care_scope_verified: true,
        care_scope_verified_at: true,
        care_scope_verified_by_admin_id: true,
        care_scope_document_url: true,
      },
    });

    if (!regulation) return fail('CARE_SCOPE_MUNICIPAL_RECORD_MISSING');
    const municipalReviewValid =
      regulation.care_scope_verified === true &&
      pastOrNow(regulation.care_scope_verified_at, now) &&
      !!regulation.care_scope_verified_by_admin_id?.trim() &&
      !!regulation.care_scope_document_url?.trim() &&
      (regulation.regulation_status === 'REGULATED' ||
       regulation.regulation_status === 'NOT_REGULATED');

    if (!municipalReviewValid) return fail('CARE_SCOPE_MUNICIPAL_REVIEW_INVALID');

    let authorization: {
      id: string;
      authorization_document_url: string | null;
      authorization_valid_until: Date | null;
      approved_by_admin_id: string | null;
    } | null = null;

    if (regulation.requires_city_approval) {
      authorization = await db.municipal_authorizations.findFirst({
        where: {
          driver_id: driverId,
          regulation_id: regulation.id,
          city: { equals: city, mode: 'insensitive' },
          state: { equals: state, mode: 'insensitive' },
          service_modality: mode,
          status: 'APPROVED_BY_CITY_HALL',
          approved_by_admin_id: { not: null },
          authorization_document_url: { not: null },
          authorization_valid_until: { gte: today },
        },
        select: {
          id: true,
          authorization_document_url: true,
          authorization_valid_until: true,
          approved_by_admin_id: true,
        },
      });
      if (!authorization ||
          !authorization.authorization_document_url?.trim() ||
          !authorization.approved_by_admin_id?.trim() ||
          !validOnCivilDay(authorization.authorization_valid_until, today)) {
        return fail('CARE_SCOPE_MUNICIPAL_AUTHORIZATION_MISSING');
      }
    }

    const coverage = await db.operational_insurance_coverages.findFirst({
      where: {
        territory_id: origin.territory_id,
        modality: mode,
        status: 'ACTIVE',
        valid_from: { lte: today },
        valid_until: { gte: today },
        document_url: { not: null },
        care_scope_verified: true,
        care_scope_verified_at: { lte: now },
        care_scope_verified_by_admin_id: { not: null },
      },
      select: {
        id: true,
        provider_name: true,
        policy_number: true,
        document_url: true,
        valid_from: true,
        valid_until: true,
        care_scope_verified_at: true,
        care_scope_verified_by_admin_id: true,
      },
    });

    if (!coverage) return fail('CARE_SCOPE_INSURANCE_COVERAGE_MISSING');
    if (!coverage.provider_name.trim() || !coverage.policy_number.trim() ||
        !coverage.document_url?.trim() ||
        !pastOrNow(coverage.care_scope_verified_at, now) ||
        !coverage.care_scope_verified_by_admin_id?.trim() ||
        !validOnCivilDay(coverage.valid_until, today) ||
        coverage.valid_from.getTime() > today.getTime()) {
      return fail('CARE_SCOPE_INSURANCE_REVIEW_INVALID');
    }

    const enrollment = await db.driver_insurance_enrollments.findFirst({
      where: {
        driver_id: driverId,
        operational_coverage_id: coverage.id,
        vehicle_plate: { equals: driver.vehicle_plate!, mode: 'insensitive' },
        status: 'ACTIVE',
        valid_from: { lte: today },
        valid_until: { gte: today },
        cancelled_at: null,
        provider_reference: { not: null },
        operational_coverage_linked_at: { not: null },
        operational_coverage_linked_by_admin_id: { not: null },
      },
      select: {
        id: true,
        provider_reference: true,
        operational_coverage_linked_at: true,
        operational_coverage_linked_by_admin_id: true,
        valid_from: true,
        valid_until: true,
      },
    });

    if (!enrollment || !enrollment.provider_reference?.trim() ||
        !pastOrNow(enrollment.operational_coverage_linked_at, now) ||
        !enrollment.operational_coverage_linked_by_admin_id?.trim() ||
        enrollment.valid_from.getTime() < coverage.valid_from.getTime() ||
        enrollment.valid_until.getTime() > coverage.valid_until.getTime() ||
        !validOnCivilDay(enrollment.valid_until, today)) {
      return fail('CARE_SCOPE_DRIVER_ENROLLMENT_MISSING');
    }

    const evidence = {
      [careScopeEvidenceBrand]: true as const,
      rideId,
      driverId,
      mode,
      territoryId: origin.territory_id,
      city,
      state,
      vehiclePlate,
      verifiedAt: now,
      territory: {
        source: 'operational_territories' as const,
        territoryId: origin.territory_id,
        originNeighborhoodId: origin.id,
        coverageReviewedAt: territory.coverage_reviewed_at!,
        coverageReviewedBy: territory.coverage_reviewed_by!,
      },
      municipal: {
        source: 'municipal_regulations' as const,
        regulationId: regulation.id,
        regulationStatus: regulation.regulation_status as 'REGULATED' | 'NOT_REGULATED',
        scopeDocumentUrl: regulation.care_scope_document_url!,
        scopeVerifiedAt: regulation.care_scope_verified_at!,
        scopeVerifiedByAdminId: regulation.care_scope_verified_by_admin_id!,
        requiresCityApproval: regulation.requires_city_approval,
        authorizationId: authorization?.id ?? null,
        authorizationDocumentUrl: authorization?.authorization_document_url ?? null,
        authorizationValidUntil: authorization?.authorization_valid_until ?? null,
        authorizationApprovedByAdminId: authorization?.approved_by_admin_id ?? null,
      },
      insurance: {
        source: 'operational_insurance_coverages' as const,
        coverageId: coverage.id,
        enrollmentId: enrollment.id,
        providerName: coverage.provider_name,
        policyNumber: coverage.policy_number,
        providerReference: enrollment.provider_reference,
        coverageLinkedAt: enrollment.operational_coverage_linked_at!,
        coverageLinkedByAdminId: enrollment.operational_coverage_linked_by_admin_id!,
        documentUrl: coverage.document_url!,
        validFrom: enrollment.valid_from,
        validUntil: enrollment.valid_until,
        scopeVerifiedAt: coverage.care_scope_verified_at!,
        scopeVerifiedByAdminId: coverage.care_scope_verified_by_admin_id!,
      },
    } satisfies VerifiedCareScopeEvidence;

    return { verified: true, evidence, reasons: [] };
  } catch {
    return fail('CARE_SCOPE_LOOKUP_FAILED');
  }
}
