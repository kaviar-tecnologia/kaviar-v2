import { describe, expect, it, vi } from 'vitest';
import {
  resolveVerifiedCareScopeEvidence,
  type CareScopeEvidenceClient,
} from '../src/services/care/care-verified-scope-evidence';

const NOW = new Date('2026-09-29T12:00:00.000Z');
const REVIEW = new Date('2026-09-28T12:00:00.000Z');
const FROM = new Date('2026-09-01T00:00:00.000Z');
const UNTIL = new Date('2026-10-31T00:00:00.000Z');

function fixture() {
  return {
    ride: {
      ride_type: 'care',
      service_category: 'CARE_ASSISTED',
      origin_neighborhood_id: 'origin-n',
      origin_community_id: 'shared-community',
      is_homebound: false,
      outside_fallback_allowed: false,
      outside_fallback_consented_at: null as Date | null,
      origin_lat: -22.91,
      origin_lng: -43.22,
    },
    requirement: { mode: 'ASSISTED', status: 'READY' },
    driver: { vehicle_plate: 'ABC-1D23', neighborhood_id: 'driver-n', community_id: 'shared-community' },
    origin: {
      id: 'origin-n',
      city: 'Cidade Exemplo',
      is_active: true,
      is_verified: true,
      verified_at: REVIEW,
      verified_by: 'admin-territory',
      territory_id: 'territory-1',
      territory: {
        id: 'territory-1',
        uf: 'RJ',
        city_name: 'Cidade Exemplo',
        is_active: true,
        status: 'active',
        coverage_status: 'COMPLETE',
        coverage_reviewed_at: REVIEW,
        coverage_reviewed_by: 'admin-coverage',
      },
    },
    driverHome: {
      id: 'driver-n',
      city: 'Cidade Exemplo',
      is_active: true,
      is_verified: true,
      verified_at: REVIEW,
      verified_by: 'admin-territory',
      territory_id: 'territory-1',
      territory: {
        id: 'territory-1',
        uf: 'RJ',
        city_name: 'Cidade Exemplo',
        is_active: true,
        status: 'active',
        coverage_status: 'COMPLETE',
        coverage_reviewed_at: REVIEW,
        coverage_reviewed_by: 'admin-coverage',
      },
    },
    regulation: {
      id: 'reg-care',
      regulation_status: 'REGULATED',
      requires_city_approval: true,
      care_scope_verified: true,
      care_scope_verified_at: REVIEW,
      care_scope_verified_by_admin_id: 'admin-municipal',
      care_scope_document_url: 's3://private/municipal-care.pdf',
    },
    authorization: {
      id: 'auth-care',
      authorization_document_url: 's3://private/city-hall-care.pdf',
      authorization_valid_until: UNTIL,
      approved_by_admin_id: 'admin-municipal',
    },
    coverage: {
      id: 'coverage-care',
      provider_name: 'Seguradora Exemplo',
      policy_number: 'POL-C-001',
      document_url: 's3://private/policy-care.pdf',
      valid_from: FROM,
      valid_until: UNTIL,
      care_scope_verified_at: REVIEW,
      care_scope_verified_by_admin_id: 'admin-insurance',
    },
    enrollment: {
      id: 'enrollment-care',
      provider_reference: 'POL-C-001',
      operational_coverage_linked_at: REVIEW,
      operational_coverage_linked_by_admin_id: 'admin-insurance-link',
      valid_from: FROM,
      valid_until: UNTIL,
    },
  };
}

function mockDb(s = fixture()) {
  const neighborhood = vi.fn()
    .mockResolvedValueOnce(s.origin)
    .mockResolvedValueOnce(s.driverHome);
  const calls = {
    ride: vi.fn().mockResolvedValue(s.ride),
    requirement: vi.fn().mockResolvedValue(s.requirement),
    driver: vi.fn().mockResolvedValue(s.driver),
    neighborhood,
    regulation: vi.fn().mockResolvedValue(s.regulation),
    authorization: vi.fn().mockResolvedValue(s.authorization),
    coverage: vi.fn().mockResolvedValue(s.coverage),
    enrollment: vi.fn().mockResolvedValue(s.enrollment),
    geofence: vi.fn().mockResolvedValue([{ covered: true }]),
  };
  const db = {
    rides_v2: { findUnique: calls.ride },
    care_trip_requirements: { findUnique: calls.requirement },
    drivers: { findUnique: calls.driver },
    neighborhoods: { findUnique: calls.neighborhood },
    municipal_regulations: { findFirst: calls.regulation },
    municipal_authorizations: { findFirst: calls.authorization },
    operational_insurance_coverages: { findFirst: calls.coverage },
    driver_insurance_enrollments: { findFirst: calls.enrollment },
    $queryRaw: calls.geofence,
  } as unknown as CareScopeEvidenceClient;
  return { db, calls };
}

const resolve = (db: CareScopeEvidenceClient) =>
  resolveVerifiedCareScopeEvidence(db, 'ride-care', 'driver-care', NOW);

describe('CARE-06A — exact structured provenance from official sources', () => {
  it('returns one verified bundle only when mode, territory, municipality, plate and policy all match', async () => {
    const { db, calls } = mockDb();
    const result = await resolve(db);
    expect(result.verified).toBe(true);
    if (!result.verified) throw new Error('expected verified evidence');
    expect(result.evidence).toMatchObject({
      rideId: 'ride-care',
      driverId: 'driver-care',
      mode: 'CARE_ASSISTED',
      territoryId: 'territory-1',
      vehiclePlate: 'ABC1D23',
      municipal: {
        source: 'municipal_regulations',
        regulationId: 'reg-care',
        authorizationId: 'auth-care',
      },
      insurance: {
        source: 'operational_insurance_coverages',
        coverageId: 'coverage-care',
        enrollmentId: 'enrollment-care',
        policyNumber: 'POL-C-001',
        coverageLinkedByAdminId: 'admin-insurance-link',
      },
    });
    expect(calls.regulation).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ service_modality: 'CARE_ASSISTED' }),
    }));
    expect(calls.coverage).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        modality: 'CARE_ASSISTED',
        territory_id: 'territory-1',
        care_scope_verified: true,
      }),
    }));
    expect(calls.enrollment).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        driver_id: 'driver-care',
        operational_coverage_id: 'coverage-care',
      }),
    }));
    expect(calls.geofence).toHaveBeenCalledTimes(1);
    const geofenceSql = (calls.geofence.mock.calls[0][0] as TemplateStringsArray).join(' ');
    expect(geofenceSql).toContain('ST_Covers(');
    expect(geofenceSql).toContain('neighborhood_geofences');
    expect(geofenceSql).not.toContain('ST_DWithin');
  });

  it('does not treat a generic CAR record as CARE evidence', async () => {
    const { db, calls } = mockDb();
    calls.regulation.mockResolvedValue(null);
    const result = await resolve(db);
    expect(result).toEqual({
      verified: false,
      evidence: null,
      reasons: ['CARE_SCOPE_MUNICIPAL_RECORD_MISSING'],
    });
    expect(calls.coverage).not.toHaveBeenCalled();
  });

  it('requires explicit municipal review and, when applicable, valid city-hall authorization', async () => {
    const first = mockDb();
    first.calls.regulation.mockResolvedValue({
      ...fixture().regulation,
      care_scope_verified: false,
    });
    expect((await resolve(first.db)).reasons).toContain('CARE_SCOPE_MUNICIPAL_REVIEW_INVALID');

    const second = mockDb();
    second.calls.authorization.mockResolvedValue(null);
    expect((await resolve(second.db)).reasons).toContain('CARE_SCOPE_MUNICIPAL_AUTHORIZATION_MISSING');
  });

  it('allows a reviewed NOT_REGULATED CARE position without inventing a driver authorization', async () => {
    const { db, calls } = mockDb();
    calls.regulation.mockResolvedValue({
      ...fixture().regulation,
      regulation_status: 'NOT_REGULATED',
      requires_city_approval: false,
    });
    const result = await resolve(db);
    expect(result.verified).toBe(true);
    expect(calls.authorization).not.toHaveBeenCalled();
    if (result.verified) {
      expect(result.evidence.municipal.authorizationId).toBeNull();
      expect(result.evidence.municipal.regulationStatus).toBe('NOT_REGULATED');
    }
  });

  it('requires an exact reviewed CARE policy and a driver enrollment explicitly linked to it', async () => {
    const noCoverage = mockDb();
    noCoverage.calls.coverage.mockResolvedValue(null);
    expect((await resolve(noCoverage.db)).reasons).toContain('CARE_SCOPE_INSURANCE_COVERAGE_MISSING');

    const noEnrollment = mockDb();
    noEnrollment.calls.enrollment.mockResolvedValue(null);
    expect((await resolve(noEnrollment.db)).reasons).toContain('CARE_SCOPE_DRIVER_ENROLLMENT_MISSING');
  });

  it('rejects enrollment whose insurance reference belongs to a different policy', async () => {
    const { db, calls } = mockDb();
    calls.enrollment.mockResolvedValue({
      ...fixture().enrollment,
      provider_reference: 'OTHER-POLICY',
    });
    const r = await resolve(db);
    expect(r.verified).toBe(false);
    expect(r.reasons).toContain('CARE_SCOPE_POLICY_REFERENCE_MISMATCH');
  });

    it('rejects enrollment not explicitly linked/reviewed by an admin', async () => {
    const { db, calls } = mockDb();
    calls.enrollment.mockResolvedValue({
      ...fixture().enrollment,
      operational_coverage_linked_at: null,
      operational_coverage_linked_by_admin_id: null,
    });
    expect((await resolve(db)).reasons).toContain('CARE_SCOPE_DRIVER_ENROLLMENT_MISSING');
  });

  it('does not issue scope evidence for legacy homebound/outside fallback', async () => {
    for (const field of ['is_homebound', 'outside_fallback_allowed'] as const) {
      const s = fixture();
      s.ride[field] = true;
      const { db, calls } = mockDb(s);
      expect((await resolve(db)).reasons).toContain('CARE_SCOPE_OUTSIDE_FALLBACK_UNSUPPORTED');
      expect(calls.geofence).not.toHaveBeenCalled();
      expect(calls.regulation).not.toHaveBeenCalled();
    }

    const s = fixture();
    s.ride.outside_fallback_consented_at = REVIEW;
    const { db, calls } = mockDb(s);
    expect((await resolve(db)).reasons).toContain('CARE_SCOPE_OUTSIDE_FALLBACK_UNSUPPORTED');
    expect(calls.geofence).not.toHaveBeenCalled();
  });

  it('preserves same-neighborhood or explicitly matching-community restriction', async () => {
    const s = fixture();
    s.driver.community_id = 'another-community';
    const mismatch = mockDb(s);
    expect((await resolve(mismatch.db)).reasons).toContain('CARE_SCOPE_DRIVER_NEIGHBORHOOD_MISMATCH');
    expect(mismatch.calls.geofence).not.toHaveBeenCalled();

    const sameNeighborhood = fixture();
    sameNeighborhood.driver.neighborhood_id = 'origin-n';
    sameNeighborhood.driver.community_id = 'another-community';
    const matched = mockDb(sameNeighborhood);
    expect((await resolve(matched.db)).verified).toBe(true);
  });

  it('requires consistent municipality in official origin, territory and driver-home records', async () => {
    const mismatch = fixture();
    mismatch.origin.territory.city_name = 'Outro Município';
    const a = mockDb(mismatch);
    expect((await resolve(a.db)).reasons).toContain('CARE_SCOPE_TERRITORY_UNVERIFIED');
    expect(a.calls.regulation).not.toHaveBeenCalled();

    const missingCity = fixture();
    missingCity.origin.territory.city_name = null as never;
    expect((await resolve(mockDb(missingCity).db)).reasons)
      .toContain('CARE_SCOPE_TERRITORY_UNVERIFIED');

    const differentDriverCity = fixture();
    differentDriverCity.driverHome.city = 'Outro Município';
    const b = mockDb(differentDriverCity);
    expect((await resolve(b.db)).reasons).toContain('CARE_SCOPE_DRIVER_OUTSIDE_TERRITORY');
    expect(b.calls.regulation).not.toHaveBeenCalled();
  });

  it('fails closed when pickup is outside, geom missing or PostGIS read fails', async () => {
    const outside = mockDb();
    outside.calls.geofence.mockResolvedValue([{ covered: false }]);
    expect((await resolve(outside.db)).reasons)
      .toContain('CARE_SCOPE_PICKUP_GEOFENCE_UNVERIFIED');
    expect(outside.calls.regulation).not.toHaveBeenCalled();

    const missing = mockDb();
    missing.calls.geofence.mockResolvedValue([]);
    expect((await resolve(missing.db)).reasons)
      .toContain('CARE_SCOPE_PICKUP_GEOFENCE_UNVERIFIED');

    const invalidCoord = mockDb();
    invalidCoord.calls.ride.mockResolvedValue({ ...fixture().ride, origin_lat: NaN });
    expect((await resolve(invalidCoord.db)).reasons)
      .toContain('CARE_SCOPE_PICKUP_GEOFENCE_UNVERIFIED');
    expect(invalidCoord.calls.geofence).not.toHaveBeenCalled();

    const dbFailed = mockDb();
    dbFailed.calls.geofence.mockRejectedValue(new Error('synthetic PostGIS failure'));
    expect((await resolve(dbFailed.db)).reasons)
      .toContain('CARE_SCOPE_LOOKUP_FAILED');
  });

  it('rejects a driver home with unreviewed territory even if territory ID matches', async () => {
    const s = fixture();
    s.driverHome.is_verified = false;
    expect((await resolve(mockDb(s).db)).reasons)
      .toContain('CARE_SCOPE_DRIVER_OUTSIDE_TERRITORY');
  });

  it('rejects a driver registered in another operational territory', async () => {
    const s = fixture();
    s.driverHome.territory_id = 'territory-2';
    s.driverHome.territory.id = 'territory-2';
    const result = await resolve(mockDb(s).db);
    expect(result.reasons).toContain('CARE_SCOPE_DRIVER_OUTSIDE_TERRITORY');
  });

  it('fails closed on stale review, expired evidence, malformed identity and DB errors', async () => {
    const stale = mockDb();
    stale.calls.coverage.mockResolvedValue({
      ...fixture().coverage,
      care_scope_verified_at: new Date(NOW.getTime() + 1000),
    });
    expect((await resolve(stale.db)).reasons).toContain('CARE_SCOPE_INSURANCE_REVIEW_INVALID');

    const expired = mockDb();
    expired.calls.authorization.mockResolvedValue({
      ...fixture().authorization,
      authorization_valid_until: new Date('2026-09-28T00:00:00.000Z'),
    });
    expect((await resolve(expired.db)).reasons).toContain('CARE_SCOPE_MUNICIPAL_AUTHORIZATION_MISSING');

    const invalid = mockDb();
    invalid.calls.ride.mockResolvedValue({
      ...fixture().ride,
      service_category: 'CAR_NORMAL',
    });
    expect((await resolve(invalid.db)).reasons).toContain('CARE_SCOPE_RIDE_INVALID');

    const errored = mockDb();
    errored.calls.ride.mockRejectedValue(new Error('synthetic db failure'));
    expect((await resolve(errored.db)).reasons).toEqual(['CARE_SCOPE_LOOKUP_FAILED']);
  });
});
