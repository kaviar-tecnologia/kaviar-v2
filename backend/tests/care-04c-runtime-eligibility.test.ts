import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  evaluateCareEligibilityFromDb,
  type CareReadClient,
  type CareExternalEvidence,
} from '../src/services/care/care-runtime-eligibility';
import {
  resolveVerifiedCareScopeEvidence,
  type CareScopeEvidenceClient,
} from '../src/services/care/care-verified-scope-evidence';

const now = new Date('2026-09-28T17:00:00.000Z');
const review = new Date('2026-09-27T17:00:00.000Z');
const validUntil = new Date('2026-10-28T17:00:00.000Z');

async function approvedEvidence(): Promise<CareExternalEvidence> {
  const scopeDb = {
    rides_v2: {
      findUnique: vi.fn().mockResolvedValue({
        ride_type: 'care',
        service_category: 'CARE_ASSISTED',
        origin_neighborhood_id: 'synthetic-neighborhood',
        origin_lat: -22.91,
        origin_lng: -43.22,
      }),
    },
    care_trip_requirements: {
      findUnique: vi.fn().mockResolvedValue({ mode: 'ASSISTED', status: 'READY' }),
    },
    drivers: {
      findUnique: vi.fn().mockResolvedValue({
        vehicle_plate: 'ABC-1D23',
        neighborhood_id: 'synthetic-neighborhood',
      }),
    },
    neighborhoods: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'synthetic-neighborhood',
        city: 'Synthetic City',
        is_active: true,
        is_verified: true,
        verified_at: review,
        verified_by: 'synthetic-territory-reviewer',
        territory_id: 'synthetic-territory',
        territory: {
          id: 'synthetic-territory',
          uf: 'RJ',
          is_active: true,
          status: 'active',
          coverage_status: 'COMPLETE',
          coverage_reviewed_at: review,
          coverage_reviewed_by: 'synthetic-territory-reviewer',
        },
      }),
    },
    municipal_regulations: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'synthetic-regulation',
        regulation_status: 'NOT_REGULATED',
        requires_city_approval: false,
        care_scope_verified: true,
        care_scope_verified_at: review,
        care_scope_verified_by_admin_id: 'synthetic-municipal-reviewer',
        care_scope_document_url: 'https://example.invalid/care-municipal.pdf',
      }),
    },
    municipal_authorizations: { findFirst: vi.fn() },
    operational_insurance_coverages: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'synthetic-coverage',
        provider_name: 'Synthetic Insurer',
        policy_number: 'POL-001',
        document_url: 'https://example.invalid/care-policy.pdf',
        valid_from: new Date('2026-09-01T00:00:00.000Z'),
        valid_until: validUntil,
        care_scope_verified_at: review,
        care_scope_verified_by_admin_id: 'synthetic-insurance-reviewer',
      }),
    },
    $queryRaw: vi.fn().mockResolvedValue([{ covered: true }]),
    driver_insurance_enrollments: {
      findFirst: vi.fn().mockResolvedValue({
        id: 'synthetic-enrollment',
        provider_reference: 'SYNTHETIC-REF',
        operational_coverage_linked_at: review,
        operational_coverage_linked_by_admin_id: 'synthetic-link-reviewer',
        valid_from: new Date('2026-09-01T00:00:00.000Z'),
        valid_until: validUntil,
      }),
    },
  } as unknown as CareScopeEvidenceClient;

  const result = await resolveVerifiedCareScopeEvidence(
    scopeDb,
    'synthetic-care-ride',
    'synthetic-driver',
    now,
  );
  if (!result.verified) throw new Error('synthetic verified scope fixture failed');
  return result.evidence;
}

const samples = () => ({
  ride: {
    id: 'synthetic-care-ride',
    ride_type: 'care',
    service_category: 'CARE_ASSISTED',
    status: 'requested',
    quoted_price: '25.00',
    locked_price: '25.00',
  },
  requirement: {
    ride_id: 'synthetic-care-ride',
    mode: 'ASSISTED',
    status: 'READY',
    reviewed_at: review,
    reviewed_by_admin_id: 'synthetic-reviewer',
    needs_extra_boarding_time: true,
    uses_walking_aid: false,
    folding_wheelchair: false,
    remain_in_wheelchair: false,
    can_self_transfer: null,
    needs_pickup_guidance: false,
    guide_dog: true,
    companion_seats: 1,
  },
  qualification: {
    driver_id: 'synthetic-driver',
    status: 'VERIFIED',
    assisted_training_verified: true,
    folding_training_verified: false,
    adapted_training_verified: false,
    verified_at: review,
    verified_by_admin_id: 'synthetic-reviewer',
    valid_until: validUntil,
  },
  vehicle: {
    driver_id: 'synthetic-driver',
    plate_snapshot: 'ABC1D23',
    status: 'VERIFIED',
    folding_storage_verified: true,
    ramp_or_lift_verified: false,
    wheelchair_restraint_verified: false,
    occupant_restraint_verified: false,
    adaptation_document_verified: false,
    wheelchair_capacity: 0,
    companion_seats: 2,
    inspection_valid_until: validUntil,
    verified_at: review,
    verified_by_admin_id: 'synthetic-reviewer',
  },
  driver: {
    id: 'synthetic-driver',
    status: 'approved',
    deleted_at: null,
    banned_at: null,
    vehicle_plate: 'ABC-1D23',
    vehicle_type: 'CAR',
  },
  online: { availability: 'online' },
});

function mockedClient(s: ReturnType<typeof samples>) {
  const calls = {
    ride: vi.fn().mockResolvedValue(s.ride),
    requirement: vi.fn().mockResolvedValue(s.requirement),
    qualification: vi.fn().mockResolvedValue(s.qualification),
    vehicle: vi.fn().mockResolvedValue(s.vehicle),
    driver: vi.fn().mockResolvedValue(s.driver),
    online: vi.fn().mockResolvedValue(s.online),
  };
  const db = {
    rides_v2: { findUnique: calls.ride },
    care_trip_requirements: { findUnique: calls.requirement },
    care_driver_qualifications: { findUnique: calls.qualification },
    care_vehicle_capabilities: { findUnique: calls.vehicle },
    drivers: { findUnique: calls.driver },
    driver_status: { findUnique: calls.online },
  } as unknown as CareReadClient;
  return { db, calls };
}

const decide = async (
  db: CareReadClient,
  evidence?: CareExternalEvidence | null,
) => evaluateCareEligibilityFromDb(
  db,
  'synthetic-care-ride',
  'synthetic-driver',
  evidence === undefined ? await approvedEvidence() : evidence,
  now,
);

describe('CARE-04C read-only evidence adapter (synthetic objects only)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads current ride, needs, driver, vehicle and availability using IDs', async () => {
    const { db, calls } = mockedClient(samples());
    expect(await decide(db)).toEqual({ eligible: true, reasons: [] });
    expect(calls.ride).toHaveBeenCalledWith({
      where: { id: 'synthetic-care-ride' },
      select: expect.objectContaining({ service_category: true, status: true }),
    });
    expect(calls.requirement).toHaveBeenCalledWith({ where: { ride_id: 'synthetic-care-ride' } });
    expect(calls.qualification).toHaveBeenCalledWith({ where: { driver_id: 'synthetic-driver' } });
    expect(calls.vehicle).toHaveBeenCalledWith({ where: { driver_id: 'synthetic-driver' } });
    expect(calls.driver).toHaveBeenCalledWith({
      where: { id: 'synthetic-driver' },
      select: expect.objectContaining({ vehicle_plate: true, deleted_at: true, banned_at: true }),
    });
    expect(calls.online).toHaveBeenCalledWith({
      where: { driver_id: 'synthetic-driver' },
      select: { availability: true },
    });
    for (const call of Object.values(calls)) expect(call).toHaveBeenCalledTimes(1);
  });

  it('fails closed without a verified insurer/municipality/territory source', async () => {
    const { db } = mockedClient(samples());
    const noScope = await decide(db, null);
    expect(noScope.eligible).toBe(false);
    expect(noScope.reasons).toEqual(expect.arrayContaining([
      'MUNICIPAL_AUTHORIZATION_MISSING', 'TERRITORY_NOT_ELIGIBLE', 'INSURANCE_NOT_CONFIRMED',
    ]));
    const mismatches: Array<[string, Partial<Record<string, unknown>>]> = [
      ['ride', { rideId: 'other-ride' }],
      ['driver', { driverId: 'other-driver' }],
      ['mode', { mode: 'CARE_ADAPTED_WHEELCHAIR' }],
      ['plate', { vehiclePlate: 'ZZZ9Z99' }],
      ['verification-time', { verifiedAt: new Date(now.getTime() + 1000) }],
      ['stale-verification', { verifiedAt: new Date(now.getTime() - 1000) }],
    ];
    const issued = await approvedEvidence();
    for (const [label, patch] of mismatches) {
      const scope = { ...issued, ...patch } as CareExternalEvidence;
      const decision = await decide(db, scope);
      expect(decision.eligible, label).toBe(false);
      expect(decision.reasons, label).toContain('CARE_SCOPE_EVIDENCE_MISMATCH');
    }

    const forgedPlainObject = {
      rideId: 'synthetic-care-ride',
      driverId: 'synthetic-driver',
      mode: 'CARE_ASSISTED',
      territoryId: 'synthetic-territory',
      city: 'Synthetic City',
      state: 'RJ',
      vehiclePlate: 'ABC1D23',
      verifiedAt: now,
    } as unknown as CareExternalEvidence;
    const forgedDecision = await decide(db, forgedPlainObject);
    expect(forgedDecision.eligible).toBe(false);
    expect(forgedDecision.reasons).toContain('CARE_SCOPE_EVIDENCE_MISMATCH');
  });

  it('rejects CARE draft, missing requirements, and unreviewed trip', async () => {
    const draft = samples();
    draft.requirement.status = 'DRAFT';
    const { db } = mockedClient(draft);
    const result = await decide(db);
    expect(result.eligible).toBe(false);
    expect(result.reasons).toContain('REQUIREMENT_NOT_READY');

    const { db: missing } = mockedClient(samples());
    (missing.care_trip_requirements.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const absent = await decide(missing);
    expect(absent.eligible).toBe(false);
    expect(absent.reasons).toContain('REQUIREMENT_MISSING');
  });

  it('rejects category mismatch, normal ride with child and non-dispatchable status', async () => {
    const s = samples();
    s.ride.service_category = 'CAR_NORMAL';
    s.ride.ride_type = 'normal';
    s.ride.status = 'accepted';
    const { db } = mockedClient(s);
    const r = await decide(db);
    expect(r.eligible).toBe(false);
    expect(r.reasons).toEqual(expect.arrayContaining([
      'CARE_RIDE_CATEGORY_MISMATCH', 'CARE_RIDE_NOT_DISPATCHABLE',
    ]));
  });

  it('never accepts an unpriced CARE draft or an invalid price as a live ride', async () => {
    const s = samples();
    s.ride.quoted_price = '';
    s.ride.locked_price = '0';
    const { db } = mockedClient(s);
    const decision = await decide(db);
    expect(decision.eligible).toBe(false);
    expect(decision.reasons).toContain('CARE_PRICE_UNCONFIRMED');
  });

  it('honors current driver approval, suspension, ban, deletion and online state', async () => {
    for (const field of ['suspended', 'rejected']) {
      const s = samples();
      s.driver.status = field;
      expect((await decide(mockedClient(s).db)).reasons).toContain('DRIVER_NOT_OPERATIONAL');
    }
    const banned = samples();
    banned.driver.banned_at = new Date() as never;
    expect((await decide(mockedClient(banned).db)).reasons).toContain('DRIVER_NOT_OPERATIONAL');
    const deleted = samples();
    deleted.driver.deleted_at = new Date() as never;
    expect((await decide(mockedClient(deleted).db)).reasons).toContain('DRIVER_NOT_OPERATIONAL');
    const offline = samples();
    offline.online.availability = 'offline';
    expect((await decide(mockedClient(offline).db)).reasons).toContain('DRIVER_NOT_ONLINE');
  });

  it('rechecks plate, training, validity and adapted equipment through CARE-03', async () => {
    const s = samples();
    s.driver.vehicle_plate = 'XYZ9Z99';
    s.qualification.assisted_training_verified = false;
    s.vehicle.inspection_valid_until = review;
    const decision = await decide(mockedClient(s).db);
    expect(decision.eligible).toBe(false);
    expect(decision.reasons).toEqual(expect.arrayContaining([
      'VEHICLE_PLATE_MISMATCH', 'TRAINING_INSUFFICIENT', 'VEHICLE_INSPECTION_EXPIRED',
    ]));
  });

  it('treats a missing CARE-02 table or DB failure as a denial, never permission', async () => {
    const { db, calls } = mockedClient(samples());
    calls.requirement.mockRejectedValue(new Error('relation care_trip_requirements does not exist'));
    expect(await decide(db)).toEqual({
      eligible: false,
      reasons: ['CARE_EVIDENCE_UNAVAILABLE'],
    });
  });

  it('rejects blank IDs or invalid clock before reading the DB', async () => {
    const { db, calls } = mockedClient(samples());
    const issued = await approvedEvidence();
    expect(await evaluateCareEligibilityFromDb(db, '', 'synthetic-driver', issued, now))
      .toEqual({ eligible: false, reasons: ['CARE_EVIDENCE_UNAVAILABLE'] });
    expect(await evaluateCareEligibilityFromDb(
      db, 'synthetic-care-ride', 'synthetic-driver', issued, new Date('invalid'),
    )).toEqual({ eligible: false, reasons: ['CARE_EVIDENCE_UNAVAILABLE'] });
    for (const call of Object.values(calls)) expect(call).not.toHaveBeenCalled();
  });

  it('does not replace unconditional CARE-04A containment or create new routes', async () => {
    const { readFileSync } = await import('node:fs');
    const route = readFileSync('src/routes/rides-v2.ts', 'utf8');
    const dispatch = readFileSync('src/services/dispatcher.service.ts', 'utf8');
    const acceptance = readFileSync('src/services/offer-acceptance.service.ts', 'utf8');
    expect(route).toContain('if (isUnsupportedCareIntent(req.body))');
    expect(dispatch).toContain('if (isUnsupportedCareIntent({');
    expect(acceptance).toContain('if (isUnsupportedCareIntent({');
    // CARE-04D stages the read-only adapter behind the unconditional gate
    // in the existing dispatch/acceptance services. No HTTP CARE route opens.
    expect(route).not.toContain('evaluateCareEligibilityFromDb');
    expect(dispatch).toContain('evaluateCareEligibilityFromDb');
    expect(acceptance).toContain('evaluateCareEligibilityFromDb');
    expect(dispatch.indexOf('if (isUnsupportedCareIntent({'))
      .toBeLessThan(dispatch.indexOf('evaluateCareEligibilityFromDb(\n          tx,'));
    expect(acceptance.indexOf('if (isUnsupportedCareIntent({'))
      .toBeLessThan(acceptance.indexOf('evaluateCareEligibilityFromDb(\n        tx,'));
  });
});
