import { describe, expect, it, vi } from 'vitest';
import { readCareOfficialFareEvidence } from '../src/services/care/care-official-fare-evidence';

const now = new Date('2026-09-29T15:00:00.000Z');
const at = new Date('2026-09-29T14:00:00.000Z');
const profileId = '22222222-2222-4222-8222-222222222222';
const id = '11111111-1111-4111-8111-111111111111';

const ride = (override: Record<string, unknown> = {}) => ({
  id, ride_type: 'care', service_category: 'CARE_ASSISTED',
  origin_neighborhood_id: 'origin', dest_neighborhood_id: 'destination',
  pricing_profile_id: profileId,
  quoted_price: 27.51, locked_price: 27.51, final_price: null,
  platform_fee: 4.95, driver_earnings: 22.56,
  driver_adjustment: null, adjusted_price: null,
  ...override,
});

const settlement = (override: Record<string, unknown> = {}) => ({
  ride_id: id, pricing_profile_id: profileId, pricing_profile_slug: 'car-official',
  origin_neighborhood_id: 'origin', dest_neighborhood_id: 'destination',
  quoted_price: 27.51, locked_price: 27.51, final_price: null,
  fee_percent: 18, fee_amount: 4.95, driver_earnings: 22.56,
  quoted_at: at, locked_at: at, settled_at: null,
  pricing_profile: {
    id: profileId, slug: 'car-official',
    vehicle_category: 'CAR', service_category: 'CAR_NORMAL',
  },
  ...override,
});

const db = (r: any = ride(), s: any = settlement()) => ({
  rides_v2: { findUnique: vi.fn().mockResolvedValue(r) },
  ride_settlements: { findUnique: vi.fn().mockResolvedValue(s) },
  // A read-only verifier must never call any writer.
  $executeRaw: vi.fn(), $transaction: vi.fn(),
  create: vi.fn(), update: vi.fn(), delete: vi.fn(),
}) as any;

describe('CARE-06B official price provenance (read-only preflight)', () => {
  it.each([
    'CARE_ASSISTED', 'CARE_FOLDING_WHEELCHAIR', 'CARE_ADAPTED_WHEELCHAIR',
  ])('uses the same official CAR_NORMAL snapshot for %s, not a premium tariff', async (mode) => {
    const client = db(ride({ service_category: mode }));
    const response = await readCareOfficialFareEvidence(client, id, now);
    expect(response).toMatchObject({
      valid: true, reasons: [],
      evidence: { source: 'ride_settlements', rideId: id, pricingProfileId: profileId,
        quotedCents: 2751, lockedCents: 2751, finalCents: null },
    });
    expect(client.rides_v2.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id } }));
    expect(client.ride_settlements.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { ride_id: id } }));
    expect(client.$executeRaw).not.toHaveBeenCalled();
    expect(client.$transaction).not.toHaveBeenCalled();
    expect(client.create).not.toHaveBeenCalled();
    expect(client.update).not.toHaveBeenCalled();
  });

  it('rejects absent or another-ride settlement rather than invent a comparable quote', async () => {
    expect((await readCareOfficialFareEvidence(db(ride(), null), id, now)).reasons)
      .toContain('CARE_FARE_OFFICIAL_RECORD_MISSING');
    expect((await readCareOfficialFareEvidence(db(ride(), settlement({ ride_id: 'another' })), id, now)).reasons)
      .toContain('CARE_FARE_OFFICIAL_RECORD_MISSING');
  });

  it('requires CAR_NORMAL official profile, matching IDs, slug and route identity', async () => {
    for (const changed of [
      { pricing_profile: { id: profileId, slug: 'car-official', vehicle_category: 'CAR', service_category: 'CARE_ASSISTED' } },
      { pricing_profile_id: 'wrong-id' },
      { pricing_profile_slug: 'wrong-slug' },
      { origin_neighborhood_id: 'another-origin' },
    ]) {
      const result = await readCareOfficialFareEvidence(db(ride(), settlement(changed)), id, now);
      expect(result.reasons, JSON.stringify(changed)).toContain('CARE_FARE_CAR_PROFILE_UNVERIFIED');
    }
  });

  it('rejects 1-cent changes in quote, lock or operational cache', async () => {
    expect((await readCareOfficialFareEvidence(db(ride(), settlement({ locked_price: 27.52 })), id, now)).reasons)
      .toContain('CARE_FARE_LOCK_INVALID');
    expect((await readCareOfficialFareEvidence(db(ride({ locked_price: 27.52 })), id, now)).reasons)
      .toContain('CARE_FARE_CACHE_MISMATCH');
    expect((await readCareOfficialFareEvidence(db(ride(), settlement({ quoted_price: 27.511 })), id, now)).reasons)
      .toContain('CARE_FARE_LOCK_INVALID');
  });

  it('rejects premium/assistance additions and driver negotiation even if the locked price was unchanged', async () => {
    for (const altered of [
      { driver_adjustment: 0.01 }, { driver_adjustment: -0.01 },
      { adjusted_price: 32.51 }, { adjusted_price: Number.NaN },
    ]) {
      const result = await readCareOfficialFareEvidence(db(ride(altered)), id, now);
      expect(result.reasons, JSON.stringify(altered)).toContain('CARE_FARE_ADJUSTMENT_FORBIDDEN');
    }
  });

  it('rejects final price changes and inconsistent settlement/cache at completion', async () => {
    const settled = settlement({ final_price: 27.51, settled_at: at });
    expect((await readCareOfficialFareEvidence(db(ride({ final_price: 27.51 }), settled), id, now)).valid)
      .toBe(true);
    expect((await readCareOfficialFareEvidence(
      db(ride({ final_price: 27.51 }), settlement({ final_price: 27.52, settled_at: at })), id, now,
    )).reasons).toContain('CARE_FARE_FINAL_MISMATCH');
    expect((await readCareOfficialFareEvidence(
      db(ride({ final_price: 27.51 }), settlement({ final_price: 27.51, settled_at: null })), id, now,
    )).reasons).toContain('CARE_FARE_FINAL_MISMATCH');
  });

  it('requires the unchanged 18% snapshot and actual 82% balance with no phantom fee', async () => {
    for (const changed of [
      { fee_percent: 19 },
      { fee_amount: 4.96 },
      { driver_earnings: 22.55 },
    ]) {
      const result = await readCareOfficialFareEvidence(db(ride(), settlement(changed)), id, now);
      expect(result.reasons, JSON.stringify(changed)).toContain('CARE_FARE_FEE_SNAPSHOT_MISMATCH');
    }
  });

  it('fails closed for future timestamps, unsupported mode and a failed DB read', async () => {
    expect((await readCareOfficialFareEvidence(
      db(ride(), settlement({ locked_at: new Date('2026-09-30T00:00:00Z') })), id, now,
    )).reasons).toContain('CARE_FARE_LOCK_INVALID');
    expect((await readCareOfficialFareEvidence(
      db(ride({ service_category: 'CAR_NORMAL' })), id, now,
    )).reasons).toContain('CARE_FARE_RIDE_CATEGORY_INVALID');
    const client = db();
    client.ride_settlements.findUnique.mockRejectedValueOnce(new Error('DB down'));
    expect((await readCareOfficialFareEvidence(client, id, now)).reasons)
      .toContain('CARE_FARE_OFFICIAL_READ_FAILED');
  });
});
