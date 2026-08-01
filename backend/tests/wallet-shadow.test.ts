import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQuery } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  return { mockQuery };
});

vi.mock('../src/db', () => ({ pool: { query: mockQuery } }));

import { shadowCalculate, _resetCache } from '../src/services/wallet-shadow.service';

beforeEach(() => {
  vi.clearAllMocks();
  _resetCache();
  process.env.WALLET_SHADOW_MODE = 'true';
});

function setupMocks(opts: {
  feeConfig?: { id: string; pct: number } | null;
  ctx?: { territory_id: string | null; assignment_id: string | null; assignment_status: string | null; matrix_share_percent: number | null; regional_share_percent: number | null };
} = {}) {
  const {
    feeConfig = { id: 'cfg-1', pct: 18 },
    ctx = { territory_id: 'terr-1', assignment_id: 'asgn-1', assignment_status: 'active', matrix_share_percent: 60, regional_share_percent: 40 }
  } = opts;

  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('feature_flags')) return { rows: [{ enabled: true }] };
    if (sql.includes('platform_fee_configs'))
      return { rows: feeConfig ? [{ id: feeConfig.id, platform_fee_percent: feeConfig.pct }] : [] };
    if (sql.includes('rides_v2 r'))
      return { rows: [ctx] };
    if (sql.includes('INSERT INTO wallet_shadow_results'))
      return { rows: [] };
    return { rows: [] };
  });
}

describe('shadowCalculate', () => {
  it('calculates 18% fee on finalPriceCents (includes wait)', async () => {
    setupMocks();
    await shadowCalculate({ rideId: 'r1', driverId: 'd1', finalPriceCents: 2150, waitChargeCents: 150, legacyCreditCost: 1 });
    const insert = mockQuery.mock.calls.find((c: any) => c[0].includes('INSERT INTO wallet_shadow'));
    expect(insert).toBeDefined();
    const p = insert![1] as any[];
    // p[0]=rideId, p[1]=driverId, p[2]=finalPriceCents, p[3]=waitChargeCents,
    // p[4]=feeConfigId, p[5]=feePercent, p[6]=feeAmountCents
    // p[7]=matrixPct, p[8]=matrixShareCents, p[9]=managerPct, p[10]=managerShareCents
    // p[11]=driverEarningsCents, p[12]=territoryId, p[13]=assignmentId, p[14]=assignmentStatus
    // p[15]=allocationReason, p[16]=legacyCreditCost, p[17]=legacyNominalCents
    // p[18]=divergenceCents, p[19]=refMonth
    expect(p[2]).toBe(2150);           // final_price_cents
    expect(p[3]).toBe(150);            // wait_charge_cents
    expect(p[6]).toBe(387);            // fee = round(2150 * 18 / 100)
    expect(p[8]).toBe(232);            // matrix = round(387 * 60 / 100)
    expect(p[10]).toBe(155);           // manager = 387 - 232
    expect(p[11]).toBe(2150 - 387);    // driver_earnings
    expect(p[8]! + p[10]!).toBe(p[6]);// shares sum = fee
  });

  it('manager_suspended → splits normally but marks reason', async () => {
    setupMocks({ ctx: { territory_id: 'terr-1', assignment_id: 'asgn-2', assignment_status: 'suspended', matrix_share_percent: 60, regional_share_percent: 40 } });
    await shadowCalculate({ rideId: 'r2', driverId: 'd1', finalPriceCents: 2000, waitChargeCents: 0, legacyCreditCost: 1 });
    const p = mockQuery.mock.calls.find((c: any) => c[0].includes('INSERT INTO wallet_shadow'))![1] as any[];
    expect(p[14]).toBe('suspended');
    expect(p[15]).toBe('manager_suspended');
    expect(p[8]).toBe(216);  // matrix 60% of 360
    expect(p[10]).toBe(144); // manager 40%
  });

  it('no territory → 100% matrix, no_manager', async () => {
    setupMocks({ ctx: { territory_id: null, assignment_id: null, assignment_status: null, matrix_share_percent: null, regional_share_percent: null } });
    await shadowCalculate({ rideId: 'r3', driverId: 'd1', finalPriceCents: 2000, waitChargeCents: 0, legacyCreditCost: 1 });
    const p = mockQuery.mock.calls.find((c: any) => c[0].includes('INSERT INTO wallet_shadow'))![1] as any[];
    expect(p[15]).toBe('no_manager');
    expect(p[8]).toBe(360);  // matrix = 100% of fee
    expect(p[10]).toBe(0);   // manager = 0
  });

  it('uses PLATFORM_FEE_RATE_BPS constant (no platform_fee_configs query)', async () => {
    // After centralization, shadow no longer queries platform_fee_configs.
    // It uses PLATFORM_FEE_RATE_BPS / 100 = 18 directly.
    setupMocks();
    await shadowCalculate({ rideId: 'r4', driverId: 'd1', finalPriceCents: 2000, waitChargeCents: 0, legacyCreditCost: 1 });
    // Verify no platform_fee_configs query was made
    const feeQueries = mockQuery.mock.calls.filter((c: any) => c[0].includes('platform_fee_configs'));
    expect(feeQueries.length).toBe(0);
    // Verify result still uses 18%: fee = round(2000 * 18 / 100) = 360
    const insert = mockQuery.mock.calls.find((c: any) => c[0].includes('INSERT INTO wallet_shadow'));
    expect(insert).toBeDefined();
    const p = insert![1] as any[];
    expect(p[4]).toBe(null); // fee_config_id = NULL (constant-derived, no dynamic config)
    expect(p[5]).toBe(18); // fee percent
    expect(p[6]).toBe(360); // fee amount cents
  });

  it('calculates divergence: new fee minus legacy nominal value', async () => {
    setupMocks();
    await shadowCalculate({ rideId: 'r5', driverId: 'd1', finalPriceCents: 1200, waitChargeCents: 0, legacyCreditCost: 2 });
    const p = mockQuery.mock.calls.find((c: any) => c[0].includes('INSERT INTO wallet_shadow'))![1] as any[];
    // fee = round(1200 * 18/100) = 216
    // legacy_nominal = 2 * 200 = 400
    // divergence = 216 - 400 = -184
    expect(p[6]).toBe(216);
    expect(p[17]).toBe(400);
    expect(p[18]).toBe(-184);
  });

  it('does not execute when shadow disabled', async () => {
    process.env.WALLET_SHADOW_MODE = 'false';
    _resetCache();
    mockQuery.mockResolvedValue({ rows: [{ enabled: false }] });
    await shadowCalculate({ rideId: 'r6', driverId: 'd1', finalPriceCents: 2000, waitChargeCents: 0, legacyCreditCost: 1 });
    const insert = mockQuery.mock.calls.find((c: any) => c[0].includes('wallet_shadow_results'));
    expect(insert).toBeUndefined();
  });

  it('ON CONFLICT updates existing row (recalculation)', async () => {
    setupMocks();
    await shadowCalculate({ rideId: 'r7', driverId: 'd1', finalPriceCents: 2000, waitChargeCents: 0, legacyCreditCost: 1 });
    const insert = mockQuery.mock.calls.find((c: any) => c[0].includes('ON CONFLICT'));
    expect(insert![0]).toContain('DO UPDATE SET');
  });

  it('fee amount is deterministic (derived from constant, not external state)', async () => {
    // With PLATFORM_FEE_RATE_BPS as source, multiple calls produce identical results
    // regardless of any platform_fee_configs changes
    setupMocks();
    await shadowCalculate({ rideId: 'r8a', driverId: 'd1', finalPriceCents: 3124, waitChargeCents: 0, legacyCreditCost: 1 });
    _resetCache();
    await shadowCalculate({ rideId: 'r8b', driverId: 'd1', finalPriceCents: 3124, waitChargeCents: 0, legacyCreditCost: 1 });
    const inserts = mockQuery.mock.calls.filter((c: any) => c[0].includes('INSERT INTO wallet_shadow'));
    const fees = inserts.map((c: any) => c[1][6]);
    // Both should compute: round(3124 * 18 / 100) = 562
    expect(fees[0]).toBe(562);
    expect(fees[1]).toBe(562);
  });

  it('handles DB error gracefully — persists error row', async () => {
    let callCount = 0;
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('feature_flags')) return { rows: [{ enabled: true }] };
      // territory/ride query throws
      if (sql.includes('rides_v2 r')) {
        callCount++;
        if (callCount === 1) throw new Error('DB timeout');
      }
      if (sql.includes('INSERT INTO wallet_shadow_results')) return { rows: [] };
      return { rows: [] };
    });
    // Should not throw
    await shadowCalculate({ rideId: 'r9', driverId: 'd1', finalPriceCents: 2000, waitChargeCents: 0, legacyCreditCost: 1 });
    const errInsert = mockQuery.mock.calls.find((c: any) => c[0].includes('INSERT INTO wallet_shadow') && c[1]?.[6] === 'CALCULATION_EXCEPTION');
    expect(errInsert).toBeDefined();
  });

  it('flag not in DB → uses env var fallback', async () => {
    process.env.WALLET_SHADOW_MODE = 'true';
    _resetCache();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('feature_flags')) throw new Error('column does not exist');
      if (sql.includes('platform_fee_configs')) return { rows: [{ id: 'cfg-1', platform_fee_percent: 18 }] };
      if (sql.includes('rides_v2 r')) return { rows: [{ territory_id: null, assignment_id: null, assignment_status: null, matrix_share_percent: null, regional_share_percent: null }] };
      if (sql.includes('INSERT INTO wallet_shadow')) return { rows: [] };
      return { rows: [] };
    });
    await shadowCalculate({ rideId: 'r10', driverId: 'd1', finalPriceCents: 2000, waitChargeCents: 0, legacyCreditCost: 1 });
    const insert = mockQuery.mock.calls.find((c: any) => c[0].includes('INSERT INTO wallet_shadow'));
    expect(insert).toBeDefined();
  });

  it('flag row missing → disabled', async () => {
    process.env.WALLET_SHADOW_MODE = 'false';
    _resetCache();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('feature_flags')) return { rows: [] };
      return { rows: [] };
    });
    await shadowCalculate({ rideId: 'r11', driverId: 'd1', finalPriceCents: 2000, waitChargeCents: 0, legacyCreditCost: 1 });
    const insert = mockQuery.mock.calls.find((c: any) => c[0].includes('wallet_shadow_results'));
    expect(insert).toBeUndefined();
  });

  it('flag enabled=true in DB → shadow runs', async () => {
    _resetCache();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('feature_flags')) return { rows: [{ enabled: true }] };
      if (sql.includes('platform_fee_configs')) return { rows: [{ id: 'cfg-1', platform_fee_percent: 18 }] };
      if (sql.includes('rides_v2 r')) return { rows: [{ territory_id: 'terr-1', assignment_id: 'a1', assignment_status: 'active', matrix_share_percent: 60, regional_share_percent: 40 }] };
      if (sql.includes('INSERT INTO wallet_shadow')) return { rows: [] };
      return { rows: [] };
    });
    await shadowCalculate({ rideId: 'r12', driverId: 'd1', finalPriceCents: 2000, waitChargeCents: 0, legacyCreditCost: 1 });
    const insert = mockQuery.mock.calls.find((c: any) => c[0].includes('INSERT INTO wallet_shadow'));
    expect(insert).toBeDefined();
  });
});
