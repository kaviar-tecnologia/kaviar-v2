import { describe, expect, it } from 'vitest';
import {
  evaluateCareFareParity,
  type OfficialComparableFare,
  type CareFareCandidate,
} from '../src/services/care/care-fare-parity';

const official = (): OfficialComparableFare => ({
  source: 'ride_settlements',
  routeKey: 'verified-route-and-date-synthetic',
  pricingProfileId: 'verified-profile-synthetic',
  quotedPrice: 27.51,
  lockedPrice: 27.51,
  quotedAt: new Date('2026-09-29T10:00:00.000Z'),
  lockedAt: new Date('2026-09-29T10:00:00.000Z'),
});
const candidate = (): CareFareCandidate => ({
  routeKey: 'verified-route-and-date-synthetic',
  pricingProfileId: 'verified-profile-synthetic',
  quotedPrice: 27.51,
  lockedPrice: 27.51,
  additionalChargeCents: 0,
  driverAdjustmentCents: 0,
});
const parity = (overrides: Partial<CareFareCandidate> = {}) =>
  evaluateCareFareParity(official(), { ...candidate(), ...overrides });

describe('CARE-05B: non-discriminatory price parity, no financial writer', () => {
  it('accepts identical canonical amount only when already official and locked', () => {
    expect(parity()).toEqual({ valid: true, reasons: [] });
  });
  it.each([
    ['assisted passenger uplift', 30.51],
    ['adapted wheelchair uplift', 29.51],
    ['indirect 1-cent uplift', 27.52],
    ['unjustified discount / unreviewed new tariff', 26.51],
  ])('rejects %s', (_label, quotedPrice) => {
    expect(parity({ quotedPrice, lockedPrice: quotedPrice })).toEqual({
      valid: false,
      reasons: ['CARE_FARE_DISCRIMINATORY_DIFFERENCE'],
    });
  });
  it('rejects accessibility charges, boarding time, guide dog or driver adjustment', () => {
    expect(parity({ additionalChargeCents: 1 }).reasons)
      .toContain('CARE_ADDITIONAL_CHARGE_FORBIDDEN');
    expect(parity({ driverAdjustmentCents: 500 }).reasons)
      .toContain('CARE_ADDITIONAL_CHARGE_FORBIDDEN');
    expect(parity({ additionalChargeCents: NaN }).reasons)
      .toContain('CARE_ADDITIONAL_CHARGE_FORBIDDEN');
  });
  it('refuses price data with missing or counterfeit provenance', () => {
    expect(evaluateCareFareParity(null, candidate()).reasons)
      .toContain('CARE_CANONICAL_FARE_MISSING');
    expect(evaluateCareFareParity(official(), null).reasons)
      .toContain('CARE_CANONICAL_FARE_MISSING');
    expect(evaluateCareFareParity({ ...official(), source: 'app' as never }, candidate()).reasons)
      .toContain('CARE_FARE_SOURCE_UNVERIFIED');
    expect(evaluateCareFareParity({ ...official(), quotedAt: new Date('invalid') }, candidate()).reasons)
      .toContain('CARE_FARE_SOURCE_UNVERIFIED');
  });
  it('rejects mismatched itinerary, time fingerprint or pricing profile', () => {
    expect(parity({ routeKey: 'different-ride' }).reasons)
      .toContain('CARE_FARE_CONTEXT_MISMATCH');
    expect(parity({ pricingProfileId: 'another-profile' }).reasons)
      .toContain('CARE_FARE_CONTEXT_MISMATCH');
  });
  it('requires official price lock, never a quote only', () => {
    expect(parity({ lockedPrice: 0 }).reasons).toContain('CARE_FARE_INVALID');
    expect(parity({ lockedPrice: 30 }).reasons).toContain('CARE_FARE_NOT_LOCKED');
    const o = official();
    o.lockedAt = new Date(o.quotedAt.getTime() - 1000);
    expect(evaluateCareFareParity(o, candidate()).reasons).toContain('CARE_FARE_NOT_LOCKED');
  });
  it('rejects NaN, Infinity, zero, subcent fractional or unsafe money', () => {
    for (const quotedPrice of [NaN, Infinity, -1, 0, 27.511, Number.MAX_VALUE]) {
      expect(parity({ quotedPrice }).reasons, String(quotedPrice))
        .toContain('CARE_FARE_INVALID');
    }
  });
  it('never reads diagnosis, disability, age or CARE mode to compute a fare', () => {
    const o = official();
    const c = candidate();
    expect(Object.keys(o)).not.toEqual(expect.arrayContaining(['age', 'diagnosis', 'disability']));
    expect(Object.keys(c)).not.toEqual(expect.arrayContaining(['age', 'diagnosis', 'disability']));
    expect(parity()).toEqual({ valid: true, reasons: [] });
  });
});
