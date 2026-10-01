import { describe, expect, it, vi } from 'vitest';
import {
  resolveCareOperationalEvidence,
  type CareOperationalReadClient,
} from '../src/services/care/care-operational-evidence';

const NOW = new Date('2026-09-29T10:00:00.000Z');
const REVIEWED = new Date('2026-09-28T10:00:00.000Z');

function fixture() {
  return {
    ride: {
      ride_type: 'care',
      service_category: 'CARE_ASSISTED',
      trip_details: null,
      origin_neighborhood_id: 'origin-bairro',
      origin_community_id: null as string | null,
      is_homebound: false,
      outside_fallback_allowed: false,
      outside_fallback_consented_at: null as Date | null,
    },
    driver: {
      neighborhood_id: 'origin-bairro',
      community_id: null as string | null,
    },
    neighborhood: {
      id: 'origin-bairro',
      is_active: true,
      is_verified: true,
      verified_at: REVIEWED,
      verified_by: 'verified-admin',
      territory_id: 'reviewed-territory',
      territory: {
        is_active: true,
        status: 'active',
        coverage_status: 'COMPLETE',
        coverage_reviewed_at: REVIEWED,
        coverage_reviewed_by: 'reviewed-admin',
      },
    },
  };
}

function mockDb(s = fixture()) {
  const calls = {
    ride: vi.fn().mockResolvedValue(s.ride),
    driver: vi.fn().mockResolvedValue(s.driver),
    neighborhood: vi.fn().mockResolvedValue(s.neighborhood),
  };
  const db = {
    rides_v2: { findUnique: calls.ride },
    drivers: { findUnique: calls.driver },
    neighborhoods: { findUnique: calls.neighborhood },
  } as unknown as CareOperationalReadClient;
  return { db, calls };
}

const evaluate = (db: CareOperationalReadClient) =>
  resolveCareOperationalEvidence(db, 'synthetic-ride', 'synthetic-driver', NOW);

describe('CARE-05A: verified existing territory is necessary, never sufficient', () => {
  it('reads only trusted ride, driver and neighborhood records, never writes', async () => {
    const { db, calls } = mockDb();
    const decision = await evaluate(db);
    expect(calls.ride).toHaveBeenCalledWith({
      where: { id: 'synthetic-ride' },
      select: expect.objectContaining({ origin_neighborhood_id: true, origin_community_id: true }),
    });
    expect(calls.driver).toHaveBeenCalledWith({
      where: { id: 'synthetic-driver' },
      select: { neighborhood_id: true, community_id: true },
    });
    expect(calls.neighborhood).toHaveBeenCalledTimes(1);
    expect(decision.territoryRegistryReviewed).toBe(true);
    expect(decision.evidence).toBeNull();
    expect(decision.reasons).toEqual([
      'CARE_TERRITORY_SCOPE_NOT_VERIFIED',
      'CARE_MUNICIPAL_SCOPE_NOT_VERIFIED', 'CARE_INSURANCE_SCOPE_NOT_VERIFIED',
    ]);
  });

  it('rejects non-CARE identity including CAR_NORMAL and missing ride/driver', async () => {
    const s = fixture();
    s.ride.ride_type = 'normal';
    s.ride.service_category = 'CAR_NORMAL';
    const ordinary = await evaluate(mockDb(s).db);
    expect(ordinary.evidence).toBeNull();
    expect(ordinary.reasons).toContain('CARE_RIDE_IDENTITY_INVALID');

    const orphan = fixture();
    orphan.ride.ride_type = 'care';
    orphan.ride.service_category = 'CAR_NORMAL';
    expect((await evaluate(mockDb(orphan).db)).reasons)
      .toContain('CARE_RIDE_IDENTITY_INVALID');

    const { db, calls } = mockDb();
    calls.driver.mockResolvedValue(null);
    expect((await evaluate(db)).reasons).toContain('CARE_RIDE_OR_DRIVER_MISSING');
    calls.driver.mockResolvedValue(fixture().driver);
    calls.ride.mockResolvedValue(null);
    expect((await evaluate(db)).reasons).toContain('CARE_RIDE_OR_DRIVER_MISSING');
  });

  it('blocks ordinary homebound and outside-fallback even with prior passenger consent', async () => {
    for (const field of ['is_homebound', 'outside_fallback_allowed'] as const) {
      const s = fixture();
      s.ride[field] = true;
      const r = await evaluate(mockDb(s).db);
      expect(r.evidence).toBeNull();
      expect(r.reasons).toContain('CARE_OUTSIDE_FALLBACK_NOT_AUTHORIZED');
    }
    const consent = fixture();
    consent.ride.outside_fallback_consented_at = REVIEWED;
    const r = await evaluate(mockDb(consent).db);
    expect(r.reasons).toContain('CARE_OUTSIDE_FALLBACK_NOT_AUTHORIZED');
  });

  it('fails closed with no origin or driver neighborhood identifier', async () => {
    for (const field of ['origin_neighborhood_id', 'neighborhood_id'] as const) {
      const s = fixture();
      if (field === 'origin_neighborhood_id') s.ride.origin_neighborhood_id = null as never;
      else s.driver.neighborhood_id = null as never;
      const { db, calls } = mockDb(s);
      const result = await evaluate(db);
      expect(result.reasons).toContain('CARE_TERRITORY_UNRESOLVED');
      expect(calls.neighborhood).not.toHaveBeenCalled();
    }
  });

  it('requires same neighborhood or explicitly matching community, never outside match', async () => {
    const s = fixture();
    s.driver.neighborhood_id = 'another-neighborhood';
    const { db, calls } = mockDb(s);
    const r = await evaluate(db);
    expect(r.evidence).toBeNull();
    expect(r.reasons).toContain('CARE_TERRITORY_MISMATCH');
    expect(calls.neighborhood).not.toHaveBeenCalled();
  });

  it('requires active verified neighborhood and approved coverage metadata', async () => {
    for (const variant of [
      (s: ReturnType<typeof fixture>) => { s.neighborhood.is_active = false; },
      (s: ReturnType<typeof fixture>) => { s.neighborhood.is_verified = false; },
      (s: ReturnType<typeof fixture>) => { s.neighborhood.verified_by = null as never; },
      (s: ReturnType<typeof fixture>) => { s.neighborhood.verified_at = new Date(NOW.getTime() + 1000); },
      (s: ReturnType<typeof fixture>) => { s.neighborhood.territory.is_active = false; },
      (s: ReturnType<typeof fixture>) => { s.neighborhood.territory.status = 'planning'; },
      (s: ReturnType<typeof fixture>) => { s.neighborhood.territory.coverage_status = 'AWAITING_REVIEW'; },
      (s: ReturnType<typeof fixture>) => { s.neighborhood.territory.coverage_reviewed_by = null as never; },
      (s: ReturnType<typeof fixture>) => { s.neighborhood.territory.coverage_reviewed_at = new Date(NOW.getTime() + 1000); },
    ]) {
      const s = fixture();
      variant(s);
      const r = await evaluate(mockDb(s).db);
      expect(r.evidence).toBeNull();
      expect(r.reasons).toContain('CARE_TERRITORY_REVIEW_REQUIRED');
    }
  });

  it('requires verified same territory for same-community cross-neighborhood candidates', async () => {
    const s = fixture();
    s.ride.origin_community_id = 'shared-community';
    s.driver.community_id = 'shared-community';
    s.driver.neighborhood_id = 'driver-home-bairro';
    const { db, calls } = mockDb(s);
    calls.neighborhood.mockResolvedValueOnce(s.neighborhood).mockResolvedValueOnce({
      ...s.neighborhood,
      id: 'driver-home-bairro',
      territory_id: 'another-territory',
    });
    const result = await evaluate(db);
    expect(result.reasons).toContain('CARE_TERRITORY_MISMATCH');
    expect(calls.neighborhood).toHaveBeenCalledTimes(2);
  });

  it('recognizes same-community cross-neighborhood as territory prerequisite only', async () => {
    const s = fixture();
    s.ride.origin_community_id = 'shared-community';
    s.driver.community_id = 'shared-community';
    s.driver.neighborhood_id = 'driver-home-bairro';
    const { db, calls } = mockDb(s);
    calls.neighborhood.mockResolvedValueOnce(s.neighborhood).mockResolvedValueOnce({
      ...s.neighborhood,
      id: 'driver-home-bairro',
    });
    const result = await evaluate(db);
    expect(result.territoryRegistryReviewed).toBe(true);
    expect(result.evidence).toBeNull();
    expect(result.reasons).toContain('CARE_TERRITORY_SCOPE_NOT_VERIFIED');
    expect(result.evidence).toBeNull();
  });

  it('keeps generic APP or CAR permission from authorizing CARE', async () => {
    const { db } = mockDb();
    const result = await evaluate(db);
    expect(result.territoryRegistryReviewed).toBe(true);
    expect(result.evidence).toBeNull();
    expect(result.evidence).toBeNull();
    expect(result.reasons).toContain('CARE_TERRITORY_SCOPE_NOT_VERIFIED');
    expect(result.reasons).toContain('CARE_MUNICIPAL_SCOPE_NOT_VERIFIED');
    expect(result.reasons).toContain('CARE_INSURANCE_SCOPE_NOT_VERIFIED');
  });

  it('fails closed for DB errors, invalid identifiers, invalid clock or absent territory', async () => {
    const { db, calls } = mockDb();
    calls.ride.mockRejectedValue(new Error('simulated database error'));
    expect(await evaluate(db)).toEqual({
      territoryRegistryReviewed: false,
      evidence: null,
      reasons: [
        'CARE_OPERATIONAL_LOOKUP_FAILED',
        'CARE_TERRITORY_SCOPE_NOT_VERIFIED',
        'CARE_MUNICIPAL_SCOPE_NOT_VERIFIED',
        'CARE_INSURANCE_SCOPE_NOT_VERIFIED',
      ],
    });

    const clean = mockDb();
    const invalid = await resolveCareOperationalEvidence(clean.db, '', 'synthetic-driver', NOW);
    expect(invalid.reasons).toContain('CARE_ID_INVALID');
    const invalidTime = await resolveCareOperationalEvidence(
      clean.db, 'synthetic-ride', 'synthetic-driver', new Date('invalid'),
    );
    expect(invalidTime.reasons).toContain('CARE_ID_INVALID');
    expect(clean.calls.ride).not.toHaveBeenCalled();

    clean.calls.neighborhood.mockResolvedValue(null);
    expect((await evaluate(clean.db)).reasons).toContain('CARE_TERRITORY_UNRESOLVED');
  });
});
