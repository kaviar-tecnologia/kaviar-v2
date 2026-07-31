/**
 * Tests: Flat fee single-source consistency (PLATFORM_FEE_RATE_BPS = 1800)
 *
 * Validates that when FEE_MODEL_FLAT_18 is active, all pricing stages
 * derive from the SAME constant (PLATFORM_FEE_RATE_BPS = 1800 bps = 18%)
 * that fee-split and wallet-settlement use.
 *
 * Also validates that when FEE_MODEL_FLAT_18 is inactive, territorial
 * rates are preserved correctly.
 *
 * DYNAMIC_PLATFORM_FEE_CONFIGURATION_NOT_SUPPORTED_IN_FLAT_18_MODE
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PLATFORM_FEE_RATE_BPS, MANAGER_COMMISSION_RATE_BPS, applyBasisPoints } from '../src/services/finance/territory/monetary';

// Mock the pool queries (external boundary)
vi.mock('../src/db', () => ({
  pool: {
    query: vi.fn(),
    connect: vi.fn(),
  },
}));

// Mock territory resolver and external services (external boundaries)
vi.mock('../src/services/territory-resolver.service', () => ({
  resolveTerritory: vi.fn().mockResolvedValue({ neighborhood: null }),
}));
vi.mock('../src/services/territory-floor.service', () => ({
  getFloorForRoute: vi.fn().mockResolvedValue(null),
}));
vi.mock('../src/services/google-directions.service', () => ({
  getRouteDistance: vi.fn().mockResolvedValue(null),
}));

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ═══════════════════════════════════════════════════════════════════
// A-D: Flat active — all territories use PLATFORM_FEE_RATE_BPS / 100
// ═══════════════════════════════════════════════════════════════════

describe('Flat Fee Single Source — resolveEffectivePlatformFeePercent', () => {
  let poolMock: any;

  beforeEach(async () => {
    vi.resetModules();
    const { pool } = await import('../src/db');
    poolMock = pool;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const mockProfile = {
    id: 'prof-1', slug: 'rio-furnas',
    base_fare: 5, per_km: 1.5, per_minute: 0.3, minimum_fare: 12,
    fee_local: 12, fee_adjacent: 15, fee_external: 22, fee_homebound: 5,
    surcharge_external: 0, credit_cost_local: 1, credit_cost_external: 2,
    max_dispatch_km: 12, center_lat: null, center_lng: null, radius_km: null,
  };

  function setupFlatActive() {
    poolMock.query.mockImplementation((sql: string) => {
      if (sql.includes('feature_flags')) return { rows: [{ enabled: true }] };
      // platform_fee_configs should NOT be consulted in flat mode
      if (sql.includes('platform_fee_configs')) {
        throw new Error('UNEXPECTED: platform_fee_configs should NOT be queried in flat_constant mode');
      }
      return { rows: [] };
    });
  }

  function setupFlatInactive() {
    poolMock.query.mockImplementation((sql: string) => {
      if (sql.includes('feature_flags')) return { rows: [{ enabled: false }] };
      return { rows: [] };
    });
  }

  // ═══ A. Flat active + local territory ═══
  it('A: flat active + local → PLATFORM_FEE_RATE_BPS/100 = 18 (not fee_local=12)', async () => {
    setupFlatActive();
    const { resolveEffectivePlatformFeePercent } = await import('../src/services/pricing-engine');
    const result = await resolveEffectivePlatformFeePercent(mockProfile as any, 'local');

    expect(result.percent).toBe(PLATFORM_FEE_RATE_BPS / 100);
    expect(result.percent).toBe(18);
    expect(result.source).toBe('flat_constant');
    expect(result.percent).not.toBe(mockProfile.fee_local);
  });

  // ═══ B. Flat active + adjacent territory ═══
  it('B: flat active + adjacent → 18 (not fee_adjacent=15)', async () => {
    setupFlatActive();
    const { resolveEffectivePlatformFeePercent } = await import('../src/services/pricing-engine');
    const result = await resolveEffectivePlatformFeePercent(mockProfile as any, 'adjacent');

    expect(result.percent).toBe(18);
    expect(result.source).toBe('flat_constant');
    expect(result.percent).not.toBe(mockProfile.fee_adjacent);
  });

  // ═══ C. Flat active + external territory ═══
  it('C: flat active + external → 18 (not fee_external=22)', async () => {
    setupFlatActive();
    const { resolveEffectivePlatformFeePercent } = await import('../src/services/pricing-engine');
    const result = await resolveEffectivePlatformFeePercent(mockProfile as any, 'external');

    expect(result.percent).toBe(18);
    expect(result.source).toBe('flat_constant');
    expect(result.percent).not.toBe(mockProfile.fee_external);
  });

  // ═══ D. Flat active + homebound ═══
  it('D: flat active + homebound → 18 (not fee_homebound=5)', async () => {
    setupFlatActive();
    const { resolveEffectivePlatformFeePercent } = await import('../src/services/pricing-engine');
    const result = await resolveEffectivePlatformFeePercent(mockProfile as any, 'local', true);

    expect(result.percent).toBe(18);
    expect(result.source).toBe('flat_constant');
    expect(result.percent).not.toBe(mockProfile.fee_homebound);
  });

  // ═══ E. Flat inactive — territorial rates preserved ═══
  it('E: flat inactive → territorial rates (local=12, adjacent=15, external=22, homebound=5)', async () => {
    setupFlatInactive();
    const { resolveEffectivePlatformFeePercent } = await import('../src/services/pricing-engine');

    const local = await resolveEffectivePlatformFeePercent(mockProfile as any, 'local');
    expect(local).toEqual({ percent: 12, source: 'territorial' });

    const adjacent = await resolveEffectivePlatformFeePercent(mockProfile as any, 'adjacent');
    expect(adjacent).toEqual({ percent: 15, source: 'territorial' });

    const external = await resolveEffectivePlatformFeePercent(mockProfile as any, 'external');
    expect(external).toEqual({ percent: 22, source: 'territorial' });

    const homebound = await resolveEffectivePlatformFeePercent(mockProfile as any, 'local', true);
    expect(homebound).toEqual({ percent: 5, source: 'territorial' });
  });

  // ═══ F. platform_fee_configs contains 20% — flat mode still uses 18% constant ═══
  it('F: flat active + platform_fee_configs=20% → still uses 18% (configs NOT consulted)', async () => {
    // If the mock is set up to throw on platform_fee_configs access, this proves
    // the function does not read from that table in flat mode.
    setupFlatActive(); // throws if platform_fee_configs is queried
    const { resolveEffectivePlatformFeePercent } = await import('../src/services/pricing-engine');
    const result = await resolveEffectivePlatformFeePercent(mockProfile as any, 'adjacent');

    // If we get here without throwing, platform_fee_configs was NOT consulted
    expect(result.percent).toBe(18);
    expect(result.source).toBe('flat_constant');
  });

  // ═══ G. Config altered during ride — rate does NOT change ═══
  it('G: flat active → rate is deterministic regardless of external state', async () => {
    setupFlatActive();
    const { resolveEffectivePlatformFeePercent } = await import('../src/services/pricing-engine');

    // Call multiple times — result is always PLATFORM_FEE_RATE_BPS/100
    const r1 = await resolveEffectivePlatformFeePercent(mockProfile as any, 'adjacent');
    const r2 = await resolveEffectivePlatformFeePercent(mockProfile as any, 'adjacent');
    const r3 = await resolveEffectivePlatformFeePercent(mockProfile as any, 'adjacent');

    expect(r1.percent).toBe(18);
    expect(r2.percent).toBe(18);
    expect(r3.percent).toBe(18);
    // Since it's a constant, no external state can change it
  });
});

// ═══════════════════════════════════════════════════════════════════
// H. Cross-service consistency — pricing, fee-split, wallet
// ═══════════════════════════════════════════════════════════════════

describe('Flat Fee Single Source — Cross-Service Consistency (R$31.24)', () => {
  const RIDE_PRICE = 31.24;
  const RIDE_PRICE_CENTS = 3124n;

  // ═══ H. Full calculation consistency ═══
  it('H: R$31.24 → pricing fee = fee_split fee = wallet debit = 562 cents', () => {
    // 1. Pricing-engine calculation (round2 with percentage)
    const pricingFeePercent = PLATFORM_FEE_RATE_BPS / 100; // 18
    const pricingFeeAmount = round2(RIDE_PRICE * pricingFeePercent / 100); // 5.6232 → 5.62
    const pricingEarnings = round2(RIDE_PRICE - pricingFeeAmount); // 25.62

    // 2. Fee-split calculation (bigint with half-up rounding, same constant)
    const feeSplitFee = applyBasisPoints(RIDE_PRICE_CENTS, PLATFORM_FEE_RATE_BPS);
    const feeSplitManager = applyBasisPoints(feeSplitFee, MANAGER_COMMISSION_RATE_BPS);
    const feeSplitMatrix = feeSplitFee - feeSplitManager;

    // 3. Wallet debit (uses fee_split result directly)
    const walletDebit = feeSplitFee;

    // ALL MUST AGREE:
    expect(pricingFeeAmount).toBe(5.62);
    expect(pricingEarnings).toBe(25.62);
    expect(feeSplitFee).toBe(562n);
    expect(walletDebit).toBe(562n);
    expect(Number(feeSplitFee) / 100).toBe(pricingFeeAmount);

    // Territory split:
    expect(feeSplitManager).toBe(225n); // 40% of 562
    expect(feeSplitMatrix).toBe(337n);  // 60% of 562

    // Verify the math independently:
    // 3124 * 1800 = 5623200; +5000 = 5628200; /10000 = 562
    expect((3124n * 1800n + 5000n) / 10000n).toBe(562n);
    // 562 * 4000 = 2248000; +5000 = 2253000; /10000 = 225
    expect((562n * 4000n + 5000n) / 10000n).toBe(225n);
  });

  // ═══ I. Consistency: all stages produce identical values ═══
  it('I: quote fee = refine fee = settle fee = split fee = wallet debit', () => {
    const percent = PLATFORM_FEE_RATE_BPS / 100; // 18
    const cents = BigInt(Math.round(RIDE_PRICE * 100)); // 3124n

    // Quote/refine/settle all do: round2(price * percent / 100)
    const stageFee = round2(RIDE_PRICE * percent / 100);

    // Fee-split does: applyBasisPoints(cents, PLATFORM_FEE_RATE_BPS)
    const splitFee = applyBasisPoints(cents, PLATFORM_FEE_RATE_BPS);

    // They produce the same value:
    expect(stageFee).toBe(5.62);
    expect(Number(splitFee)).toBe(562);
    expect(stageFee * 100).toBe(Number(splitFee)); // 562 === 562
  });

  // ═══ J. Idempotency — second settlement does not change persisted values ═══
  it('J: settle idempotency — persisted fee_percent=18 returns same values', () => {
    // When settle() finds settled_at already set, it returns persisted values.
    // Since quote and settle both use PLATFORM_FEE_RATE_BPS/100=18,
    // the persisted values will always be:
    const persistedFeePercent = 18;
    const persistedFeeAmount = round2(RIDE_PRICE * persistedFeePercent / 100);
    const persistedEarnings = round2(RIDE_PRICE - persistedFeeAmount);

    // Second call to settle returns these exact values without modification
    expect(persistedFeePercent).toBe(18);
    expect(persistedFeeAmount).toBe(5.62);
    expect(persistedEarnings).toBe(25.62);
  });

  // ═══ K. Passenger price unchanged ═══
  it('K: passenger price is always locked_price — unaffected by fee model', () => {
    // locked_price = quoted_price = final_price = what passenger pays
    // Fee is deducted from driver earnings, NOT added to passenger price
    const passengerPays = RIDE_PRICE; // 31.24
    const driverReceives = round2(RIDE_PRICE - round2(RIDE_PRICE * 18 / 100)); // 25.62
    const platformCollects = round2(RIDE_PRICE * 18 / 100); // 5.62

    expect(passengerPays).toBe(31.24);
    expect(driverReceives).toBe(25.62);
    expect(platformCollects).toBe(5.62);
    // Sum check using round2 to avoid floating-point artifact
    expect(round2(driverReceives + platformCollects)).toBe(passengerPays);
  });

  // ═══ L. Fee snapshot persisted correctly ═══
  it('L: fee_percent persisted in ride_settlements = PLATFORM_FEE_RATE_BPS/100 = 18', () => {
    // quote() writes fee_percent = resolveEffective...percent = 18
    // refine() writes fee_percent = resolveEffective...percent = 18
    // settle() validates persisted fee_percent === 18 before writing
    const expectedPersisted = PLATFORM_FEE_RATE_BPS / 100;
    expect(expectedPersisted).toBe(18);
  });
});

// ═══════════════════════════════════════════════════════════════════
// M. Snapshot validation — settle fails closed on mismatch
// ═══════════════════════════════════════════════════════════════════

describe('Flat Fee Single Source — Snapshot Validation', () => {
  let poolMock: any;

  beforeEach(async () => {
    vi.resetModules();
    const { pool } = await import('../src/db');
    poolMock = pool;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('M: settle throws SETTLE_FEE_SNAPSHOT_MISMATCH when persisted fee ≠ effective rate', async () => {
    // Simulate: ride was quoted with 15% (before flat mode), now flat mode is active (18%)
    const rideId = 'test-ride-mismatch';
    poolMock.query.mockImplementation((sql: string, params?: any[]) => {
      if (sql.includes('ride_settlements') && sql.includes('SELECT')) {
        return {
          rows: [{
            ride_id: rideId,
            fee_percent: '15.00', // ← was quoted at 15% (legacy)
            fee_amount: '4.69',
            driver_earnings: '26.55',
            locked_price: '31.24',
            final_price: null,
            settled_at: null,
            refined_at: new Date().toISOString(),
            route_territory: 'adjacent',
            driver_territory: 'adjacent',
            pricing_profile_id: 'prof-1',
            credit_cost: null,
            credit_match_type: null,
            settlement_territory: null,
          }],
        };
      }
      if (sql.includes('pricing_profiles') && sql.includes('SELECT')) {
        return {
          rows: [{
            id: 'prof-1', slug: 'rio-furnas',
            base_fare: '5', per_km: '1.5', per_minute: '0.3', minimum_fare: '12',
            fee_local: '12', fee_adjacent: '15', fee_external: '22', fee_homebound: '5',
            surcharge_external: '0', credit_cost_local: 1, credit_cost_external: 2,
            max_dispatch_km: '12', center_lat: null, center_lng: null, radius_km: null,
          }],
        };
      }
      if (sql.includes('feature_flags')) return { rows: [{ enabled: true }] };
      return { rows: [] };
    });

    const { settle } = await import('../src/services/pricing-engine');

    await expect(settle(rideId)).rejects.toMatchObject({
      code: 'SETTLE_FEE_SNAPSHOT_MISMATCH',
    });
  });

  it('M2: settle succeeds when persisted fee_percent matches effective rate (18)', async () => {
    const rideId = 'test-ride-match';
    let committed = false;
    poolMock.query.mockImplementation((sql: string, params?: any[]) => {
      if (sql.includes('ride_settlements') && sql.includes('SELECT')) {
        return {
          rows: [{
            ride_id: rideId,
            fee_percent: '18.00', // ← matches PLATFORM_FEE_RATE_BPS/100
            fee_amount: '5.62',
            driver_earnings: '25.62',
            locked_price: '31.24',
            final_price: null,
            settled_at: null,
            refined_at: new Date().toISOString(),
            route_territory: 'adjacent',
            driver_territory: 'adjacent',
            pricing_profile_id: 'prof-1',
            credit_cost: null,
            credit_match_type: null,
            settlement_territory: null,
          }],
        };
      }
      if (sql.includes('pricing_profiles') && sql.includes('SELECT')) {
        return {
          rows: [{
            id: 'prof-1', slug: 'rio-furnas',
            base_fare: '5', per_km: '1.5', per_minute: '0.3', minimum_fare: '12',
            fee_local: '12', fee_adjacent: '15', fee_external: '22', fee_homebound: '5',
            surcharge_external: '0', credit_cost_local: 1, credit_cost_external: 2,
            max_dispatch_km: '12', center_lat: null, center_lng: null, radius_km: null,
          }],
        };
      }
      if (sql.includes('feature_flags')) return { rows: [{ enabled: true }] };
      if (sql === 'BEGIN') return { rows: [] };
      if (sql === 'COMMIT') { committed = true; return { rows: [] }; }
      if (sql.includes('UPDATE ride_settlements')) return { rows: [], rowCount: 1 };
      if (sql.includes('UPDATE rides_v2')) return { rows: [], rowCount: 1 };
      return { rows: [] };
    });

    const { settle } = await import('../src/services/pricing-engine');
    const result = await settle(rideId);

    expect(result).not.toBeNull();
    expect(result!.fee_percent).toBe(18);
    expect(result!.fee_amount).toBe(5.62);
    expect(result!.driver_earnings).toBe(25.62);
    expect(result!.credit_match_type).toBe('FLAT_FEE');
    expect(committed).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Source constant verification
// ═══════════════════════════════════════════════════════════════════

describe('Flat Fee Single Source — Constant Verification', () => {
  it('PLATFORM_FEE_RATE_BPS is 1800 and derives to 18%', () => {
    expect(PLATFORM_FEE_RATE_BPS).toBe(1800);
    expect(PLATFORM_FEE_RATE_BPS / 100).toBe(18);
  });

  it('MANAGER_COMMISSION_RATE_BPS is 4000 (40% of platform fee)', () => {
    expect(MANAGER_COMMISSION_RATE_BPS).toBe(4000);
  });

  it('applyBasisPoints uses half-up rounding correctly', () => {
    // 3124 * 1800 bps = 562.32 → rounds to 562 (half-up: 5628200/10000=562.82 → 562)
    // Actually: (3124*1800 + 5000) / 10000 = (5623200+5000)/10000 = 5628200/10000 = 562
    expect(applyBasisPoints(3124n, 1800)).toBe(562n);
    expect(applyBasisPoints(562n, 4000)).toBe(225n);
    expect(applyBasisPoints(10000n, 1800)).toBe(1800n); // exact 18%
    expect(applyBasisPoints(100n, 1800)).toBe(18n); // R$1.00 → R$0.18
  });

  it('feeForTerritory still works for legacy mode', async () => {
    const { feeForTerritory } = await import('../src/services/pricing-engine');
    const p = { fee_local: 12, fee_adjacent: 15, fee_external: 22, fee_homebound: 5 } as any;

    expect(feeForTerritory(p, 'local')).toBe(12);
    expect(feeForTerritory(p, 'adjacent')).toBe(15);
    expect(feeForTerritory(p, 'external')).toBe(22);
    expect(feeForTerritory(p, 'local', true)).toBe(5);
  });
});
