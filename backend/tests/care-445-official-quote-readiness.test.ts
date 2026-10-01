import { describe, expect, it } from 'vitest';
import { hasOfficialLockedQuote } from '../src/services/official-quote-readiness';

const base = () => ({
  id: 'ride-quoted-1',
  pricing_profile_id: 'car-profile',
  quoted_price: '23.00',
  locked_price: '23.00',
  platform_fee: '4.14',
  driver_earnings: '18.86',
  settlement: {
    ride_id: 'ride-quoted-1',
    pricing_profile_id: 'car-profile',
    quoted_price: '23.00',
    locked_price: '23.00',
    fee_amount: '4.14',
    driver_earnings: '18.86',
    quoted_at: new Date('2026-09-29T12:00:00Z'),
    locked_at: new Date('2026-09-29T12:00:00Z'),
  },
});

describe('CARE-445 official quote readiness — read-only single-source check', () => {
  it('accepts a consistent official quote, cache, fee and lock', () => {
    expect(hasOfficialLockedQuote(base())).toBe(true);
  });

  it.each([
    ['missing settlement', { settlement: null }],
    ['missing cache lock', { locked_price: null }],
    ['missing profile', { pricing_profile_id: null }],
    ['fake zero quote', { quoted_price: '0' }],
    ['negative quote', { locked_price: '-0.01' }],
    ['non-finite value', { locked_price: 'NaN' }],
    ['cache discrepancy', { locked_price: '24.00' }],
    ['fractional cent', { quoted_price: '23.001' }],
    ['fee/earnings discrepancy', { driver_earnings: '18.85' }],
  ] as const)('rejects %s', (_reason, patch) => {
    expect(hasOfficialLockedQuote({ ...base(), ...patch })).toBe(false);
  });

  it('rejects a settlement for another ride or profile and a broken timestamp', () => {
    const input = base();
    expect(hasOfficialLockedQuote({
      ...input, settlement: { ...input.settlement, ride_id: 'other-ride' },
    })).toBe(false);
    expect(hasOfficialLockedQuote({
      ...input, settlement: { ...input.settlement, pricing_profile_id: 'other-profile' },
    })).toBe(false);
    expect(hasOfficialLockedQuote({
      ...input, settlement: { ...input.settlement, locked_at: null },
    })).toBe(false);
  });

  it('allows an independently documented conventional fare adjustment if the full snapshot remains consistent', () => {
    const input = base();
    expect(hasOfficialLockedQuote({
      ...input,
      locked_price: '25.00', platform_fee: '4.50', driver_earnings: '20.50',
      settlement: {
        ...input.settlement,
        locked_price: '25.00', fee_amount: '4.50', driver_earnings: '20.50',
      },
    })).toBe(true);
  });
});
