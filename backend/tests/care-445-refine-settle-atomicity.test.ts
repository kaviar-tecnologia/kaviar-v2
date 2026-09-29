import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  query: vi.fn(), connect: vi.fn(), txQuery: vi.fn(), release: vi.fn(),
}));
vi.mock('../src/db', () => ({ pool: { query: mocks.query, connect: mocks.connect } }));

import { refine, settle } from '../src/services/pricing-engine';
import { CARE_UNAVAILABLE_CODE } from '../src/services/care/care-readiness-policy';

const id = 'ride-445-writer';
const normal = { id, ride_type: 'normal', service_category: 'CAR_NORMAL',
  trip_details: null, is_homebound: false, status: 'completed' };
const profile = {
  id: 'car-profile', slug: 'car', base_fare: '5', per_km: '1.5',
  per_minute: '0.3', minimum_fare: '12', fee_local: '12',
  fee_adjacent: '15', fee_external: '22', fee_homebound: null,
  surcharge_external: '0', credit_cost_local: 1, credit_cost_external: 2,
  max_dispatch_km: '12', center_lat: null, center_lng: null, radius_km: null,
};
const base = () => ({
  ride_id: id, pricing_profile_id: 'car-profile', quoted_price: '31.24',
  locked_price: '31.24', fee_percent: '18.00', fee_amount: '5.62',
  driver_earnings: '25.62', route_territory: 'adjacent',
  driver_territory: 'adjacent', origin_neighborhood_id: 'n-a',
  dest_neighborhood_id: 'n-b', refined_at: null, settled_at: null,
  credit_cost: null, credit_match_type: null, settlement_territory: null,
  final_price: null,
});
let snapshot: ReturnType<typeof base>;
let lockedRide: Record<string, any>;

const sqlLog = () => mocks.txQuery.mock.calls.map(([sql]) => String(sql));

beforeEach(() => {
  vi.clearAllMocks();
  snapshot = base();
  lockedRide = { ...normal, locked_price: '31.24' };
  mocks.connect.mockResolvedValue({ query: mocks.txQuery, release: mocks.release });
  mocks.query.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT ride_type, service_category, trip_details FROM rides_v2')) return { rows: [normal] };
    if (sql.includes('feature_flags')) return { rows: [{ enabled: true }] };
    if (sql.includes('ride_settlements')) return { rows: [snapshot], rowCount: 1 };
    if (sql.includes('feature_flags')) return { rows: [{ enabled: true }], rowCount: 1 };
    if (sql.includes('pricing_profiles')) return { rows: [profile], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
  mocks.txQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('FROM rides_v2') && sql.includes('FOR UPDATE')) return { rows: [lockedRide], rowCount: 1 };
    if (sql.includes('FROM ride_settlements') && sql.includes('FOR UPDATE')) return { rows: [snapshot], rowCount: 1 };
    if (sql.includes('feature_flags')) return { rows: [{ enabled: true }], rowCount: 1 };
    if (sql.includes('pricing_profiles')) return { rows: [profile], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  });
});

describe('CARE-445: refine/settle official writers are single-client transactions', () => {
  it('refine locks ride and settlement, updates both records, then commits one connection', async () => {
    await refine(id, 'n-a', 'Origin');
    const q = sqlLog();
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(q[0]).toBe('BEGIN');
    expect(q[1]).toContain('FROM rides_v2');
    expect(q[1]).toContain('FOR UPDATE');
    expect(q[2]).toContain('FROM ride_settlements');
    expect(q[2]).toContain('FOR UPDATE');
    expect(q).toContainEqual(expect.stringContaining('UPDATE ride_settlements'));
    expect(q).toContainEqual(expect.stringContaining('UPDATE rides_v2'));
    expect(q.at(-1)).toBe('COMMIT');
    expect(mocks.query.mock.calls.map(([sql]) => String(sql))).not.toContain('BEGIN');
    expect(mocks.release).toHaveBeenCalledWith(false);
  });

  it('refine rolls back both writes if operational cache fails', async () => {
    mocks.txQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM rides_v2') && sql.includes('FOR UPDATE')) return { rows: [lockedRide] };
      if (sql.includes('FROM ride_settlements') && sql.includes('FOR UPDATE')) return { rows: [snapshot] };
      if (sql.includes('pricing_profiles')) return { rows: [profile] };
      if (sql.includes('UPDATE rides_v2')) throw new Error('synthetic cache failure');
      return { rows: [], rowCount: 1 };
    });
    await expect(refine(id, 'n-a', 'Origin')).rejects.toThrow('synthetic cache failure');
    expect(sqlLog().at(-1)).toBe('ROLLBACK');
    expect(sqlLog()).not.toContain('COMMIT');
  });

  it('refine refuses mutation if a competing refine or settle already committed before the lock', async () => {
    snapshot.refined_at = new Date();
    await refine(id, 'n-a', 'Origin');
    expect(sqlLog().some(sql => sql.trimStart().startsWith('UPDATE '))).toBe(false);
    expect(sqlLog().at(-1)).toBe('COMMIT');
    snapshot.refined_at = null;
    snapshot.settled_at = new Date();
    mocks.txQuery.mockClear();
    await refine(id, 'n-a', 'Origin');
    expect(sqlLog().some(sql => sql.trimStart().startsWith('UPDATE '))).toBe(false);
  });

  it('refine rejects persisted CARE under the lock, not merely at preflight', async () => {
    lockedRide = { ...normal, ride_type: 'care', service_category: 'CARE_ASSISTED' };
    await expect(refine(id, 'n-a', 'Origin')).rejects.toMatchObject({ code: CARE_UNAVAILABLE_CODE });
    expect(sqlLog()).toEqual(['BEGIN', expect.stringContaining('FOR UPDATE'), 'ROLLBACK']);
  });

  it('settle locks the row, uses the persisted amount, updates settlement/cache once', async () => {
    snapshot.refined_at = new Date();
    const result = await settle(id);
    expect(result).toMatchObject({
      final_price: 31.24, fee_percent: 18, fee_amount: 5.62,
      driver_earnings: 25.62, credit_cost: 0, credit_match_type: 'FLAT_FEE',
    });
    const q = sqlLog();
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(q[0]).toBe('BEGIN');
    expect(q[1]).toContain('FROM rides_v2');
    expect(q[2]).toContain('FROM ride_settlements');
    expect(q).toContainEqual(expect.stringContaining('UPDATE ride_settlements'));
    expect(q).toContainEqual(expect.stringContaining('UPDATE rides_v2'));
    expect(q.at(-1)).toBe('COMMIT');
  });

  it('settle rolls back the official settlement when the cache write fails', async () => {
    mocks.txQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM rides_v2') && sql.includes('FOR UPDATE')) return { rows: [lockedRide] };
      if (sql.includes('FROM ride_settlements') && sql.includes('FOR UPDATE')) return { rows: [snapshot] };
      if (sql.includes('pricing_profiles')) return { rows: [profile] };
      if (sql.includes('UPDATE rides_v2')) throw new Error('synthetic final cache failure');
      return { rows: [], rowCount: 1 };
    });
    await expect(settle(id)).rejects.toThrow('synthetic final cache failure');
    expect(sqlLog().at(-1)).toBe('ROLLBACK');
  });

  it('settle honors already-settled historical snapshot without changing fee', async () => {
    snapshot.settled_at = new Date();
    snapshot.final_price = '31.24';
    snapshot.fee_percent = '15.00';
    snapshot.fee_amount = '4.69';
    snapshot.driver_earnings = '26.55';
    snapshot.credit_cost = 1;
    snapshot.credit_match_type = 'LOCAL';
    const result = await settle(id);
    expect(result).toMatchObject({ fee_percent: 15, fee_amount: 4.69, driver_earnings: 26.55 });
    expect(sqlLog().some(sql => sql.trimStart().startsWith('UPDATE '))).toBe(false);
  });

  it('refuses missing ride, zero-row economic update and inconsistent locked snapshot', async () => {
    lockedRide = null as any;
    await expect(settle(id)).rejects.toThrow('PRICING_RIDE_NOT_FOUND');
    expect(sqlLog().at(-1)).toBe('ROLLBACK');
    lockedRide = { ...normal, locked_price: '31.24' };
    mocks.txQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM rides_v2') && sql.includes('FOR UPDATE')) return { rows: [lockedRide] };
      if (sql.includes('FROM ride_settlements') && sql.includes('FOR UPDATE')) return { rows: [snapshot] };
      if (sql.includes('pricing_profiles')) return { rows: [profile] };
      if (sql.includes('UPDATE ride_settlements')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    });
    await expect(settle(id)).rejects.toThrow('PRICING_SETTLEMENT_UPDATE_FAILED');
    expect(sqlLog().at(-1)).toBe('ROLLBACK');
    snapshot.locked_price = '32.24';
    await expect(settle(id)).rejects.toThrow('PRICING_SETTLEMENT_SNAPSHOT_INCONSISTENT');
  });
  it('reads a cold flat-fee flag through the held client, not another pool checkout', async () => {
    vi.resetModules(); // New module instance has no cached fee flag.
    mocks.query.mockImplementation(async (sql: string) => {
      if (sql.includes('feature_flags')) throw new Error('shared pool must not be used under a held transaction');
      if (sql.includes('SELECT ride_type, service_category, trip_details FROM rides_v2')) return { rows: [normal] };
      return { rows: [] };
    });
    mocks.txQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM rides_v2') && sql.includes('FOR UPDATE')) return { rows: [lockedRide], rowCount: 1 };
      if (sql.includes('FROM ride_settlements') && sql.includes('FOR UPDATE')) return { rows: [snapshot], rowCount: 1 };
      if (sql.includes('feature_flags')) return { rows: [{ enabled: true }], rowCount: 1 };
      if (sql.includes('pricing_profiles')) return { rows: [profile], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const { refine: freshRefine } = await import('../src/services/pricing-engine');
    await freshRefine(id, 'n-a', 'Origin');
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes('feature_flags'))).toBe(false);
    expect(sqlLog().some(sql => sql.includes('feature_flags'))).toBe(true);
    expect(mocks.connect).toHaveBeenCalledTimes(1);
  });

  it('includes the persisted two-minute wait in the SAME official settle transaction', async () => {
    lockedRide = {
      ...lockedRide, wait_requested: true,
      wait_started_at: new Date('2026-09-29T12:00:00Z'),
      wait_ended_at: new Date('2026-09-29T12:02:30Z'),
    };
    const result = await settle(id, { waitRatePerMinute: 0.50 });
    expect(result).toMatchObject({
      final_price: 32.24, fee_amount: 5.62, driver_earnings: 26.62,
      credit_cost: 0, wait_charge_cents: 100,
    });
    const settlementWrite = mocks.txQuery.mock.calls.find(([sql]) =>
      String(sql).trimStart().startsWith('UPDATE ride_settlements'));
    const cacheWrite = mocks.txQuery.mock.calls.find(([sql]) =>
      String(sql).trimStart().startsWith('UPDATE rides_v2'));
    expect(settlementWrite?.[1]).toEqual([
      id, 32.24, 'adjacent', 0, 'FLAT_FEE',
      expect.any(Date), 18, 5.62, 26.62,
    ]);
    expect(cacheWrite?.[1]).toEqual([id, 32.24, 5.62, 26.62]);
    expect(sqlLog().at(-1)).toBe('COMMIT');
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    expect(mocks.query.mock.calls.map(([sql]) => String(sql))).not.toContain('BEGIN');
  });

  it('never calculates wait from untrusted request times if the locked ride no longer has valid wait evidence', async () => {
    lockedRide = {
      ...lockedRide, wait_requested: true,
      wait_started_at: new Date('2026-09-29T12:05:00Z'),
      wait_ended_at: new Date('2026-09-29T12:03:00Z'),
    };
    await expect(settle(id, { waitRatePerMinute: 0.50 }))
      .rejects.toThrow('PRICING_WAIT_SNAPSHOT_INVALID');
    expect(sqlLog().at(-1)).toBe('ROLLBACK');
    expect(sqlLog().some(sql => sql.trimStart().startsWith('UPDATE '))).toBe(false);
  });

  it('does not double charge or double credit on a repeated completed wait settlement', async () => {
    snapshot.settled_at = new Date();
    snapshot.final_price = '32.24';
    snapshot.driver_earnings = '26.62';
    snapshot.credit_cost = 0;
    snapshot.credit_match_type = 'FLAT_FEE';
    lockedRide = {
      ...lockedRide, wait_requested: true,
      wait_started_at: new Date('2026-09-29T12:00:00Z'),
      wait_ended_at: new Date('2026-09-29T12:02:30Z'),
    };
    const result = await settle(id, { waitRatePerMinute: 0.50 });
    expect(result).toMatchObject({
      final_price: 32.24, driver_earnings: 26.62, wait_charge_cents: 100,
    });
    expect(sqlLog().some(sql => sql.trimStart().startsWith('UPDATE '))).toBe(false);
  });

  it('blocks a forgotten wait rate instead of silently closing a started wait at base fare', async () => {
    lockedRide = {
      ...lockedRide, wait_requested: true,
      wait_started_at: new Date('2026-09-29T12:00:00Z'),
      wait_ended_at: null,
    };
    await expect(settle(id)).rejects.toThrow('PRICING_WAIT_RATE_REQUIRED');
    expect(sqlLog().at(-1)).toBe('ROLLBACK');
    expect(sqlLog().some(sql => sql.trimStart().startsWith('UPDATE '))).toBe(false);
  });

  it('a requested wait never started settles at the base fare with no doubled credit', async () => {
    lockedRide = {
      ...lockedRide, wait_requested: true, wait_started_at: null, wait_ended_at: null,
    };
    const result = await settle(id, { waitRatePerMinute: 0.50 });
    expect(result).toMatchObject({
      final_price: 31.24, fee_amount: 5.62, driver_earnings: 25.62,
      credit_cost: 0, wait_charge_cents: 0,
    });
  });

  it('no wait option keeps normal finalization unchanged for CAR/MOTO', async () => {
    lockedRide = {
      ...lockedRide, wait_requested: false, wait_started_at: null, wait_ended_at: null,
    };
    const result = await settle(id);
    expect(result).toMatchObject({
      final_price: 31.24, driver_earnings: 25.62, credit_cost: 0,
    });
    expect(result?.wait_charge_cents ?? 0).toBe(0);
  });

  it('doubles LOCAL territorial credit only once while preserving the historic fee rate', async () => {
    vi.resetModules();
    lockedRide = {
      ...lockedRide, wait_requested: true,
      wait_started_at: new Date('2026-09-29T12:00:00Z'),
      wait_ended_at: new Date('2026-09-29T12:02:00Z'),
    };
    mocks.txQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FROM rides_v2') && sql.includes('FOR UPDATE')) return { rows: [lockedRide], rowCount: 1 };
      if (sql.includes('FROM ride_settlements') && sql.includes('FOR UPDATE')) return { rows: [snapshot], rowCount: 1 };
      if (sql.includes('feature_flags')) return { rows: [{ enabled: false }], rowCount: 1 };
      if (sql.includes('pricing_profiles')) return { rows: [profile], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    });
    const { settle: uncachedSettle } = await import('../src/services/pricing-engine');
    const result = await uncachedSettle(id, { waitRatePerMinute: 0.50 });
    expect(result).toMatchObject({
      final_price: 32.24, fee_percent: 18, fee_amount: 5.62,
      driver_earnings: 26.62, credit_cost: 2, credit_match_type: 'LOCAL',
      wait_charge_cents: 100,
    });
    const updated = mocks.txQuery.mock.calls.find(([sql]) =>
      String(sql).trimStart().startsWith('UPDATE ride_settlements'));
    expect(updated?.[1]?.[3]).toBe(2);
    expect(mocks.query.mock.calls.some(([sql]) => String(sql).includes('feature_flags'))).toBe(false);
  });

});
