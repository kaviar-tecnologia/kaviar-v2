import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  connect: vi.fn(),
  txQuery: vi.fn(),
  release: vi.fn(),
  route: vi.fn(),
  territory: vi.fn(),
  floor: vi.fn(),
}));
vi.mock('../src/db', () => ({
  pool: { query: mocks.poolQuery, connect: mocks.connect },
}));
vi.mock('../src/services/google-directions.service', () => ({
  getRouteDistance: mocks.route,
}));
vi.mock('../src/services/territory-resolver.service', () => ({
  resolveTerritory: mocks.territory,
}));
vi.mock('../src/services/territory-floor.service', () => ({
  getFloorForRoute: mocks.floor,
}));

import { quote } from '../src/services/pricing-engine';
import { CARE_UNAVAILABLE_CODE } from '../src/services/care/care-readiness-policy';

const profile = {
  id: 'car-profile', slug: 'car-official',
  base_fare: '5.00', per_km: '1.50', per_minute: '0.30', minimum_fare: '12',
  fee_local: '12', fee_adjacent: '15', fee_external: '22', fee_homebound: null,
  surcharge_external: '0', credit_cost_local: 1, credit_cost_external: 2,
  max_dispatch_km: '12', center_lat: null, center_lng: null, radius_km: null,
};
const normal = { ride_type: 'normal', service_category: 'CAR_NORMAL', trip_details: null };
const run = () => quote('ride-445', -22.97, -43.2, -22.95, -43.18, 'n', 'n', null, 'CAR_NORMAL');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.route.mockResolvedValue({ distance_km: 10, duration_min: 10 });
  mocks.territory.mockResolvedValue({ neighborhood: null });
  mocks.floor.mockResolvedValue(null);
  mocks.connect.mockResolvedValue({ query: mocks.txQuery, release: mocks.release });
  mocks.poolQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT ride_type, service_category, trip_details FROM rides_v2')) return { rows: [normal] };
    if (sql.includes('SELECT * FROM ride_settlements')) return { rows: [] };
    if (sql.includes('pricing_profiles') && sql.includes('is_default = false')) return { rows: [] };
    if (sql.includes('pricing_profiles') && sql.includes('is_default = true')) return { rows: [profile] };
    if (sql.includes('feature_flags')) return { rows: [{ enabled: true }] };
    return { rows: [], rowCount: 1 };
  });
  mocks.txQuery.mockImplementation(async (sql: string) => {
    if (sql.includes('FOR UPDATE') && sql.includes('FROM rides_v2')) return { rows: [normal], rowCount: 1 };
    if (sql.includes('SELECT * FROM ride_settlements')) return { rows: [] };
    return { rows: [], rowCount: 1 };
  });
});

describe('CARE-445 quote writer — test first, existing CAR formula unchanged', () => {
  it('uses a single acquired PoolClient for lock, insert, cache and commit', async () => {
    const result = await run();
    expect(result).toMatchObject({
      quoted_price: 23, fee_percent: 18, fee_amount: 4.14,
      driver_earnings: 18.86, pricing_profile_slug: 'car-official',
    });
    expect(mocks.connect).toHaveBeenCalledTimes(1);
    const sql = mocks.txQuery.mock.calls.map(([query]) => String(query));
    expect(sql[0]).toBe('BEGIN');
    expect(sql[1]).toContain('FOR UPDATE');
    expect(sql[2]).toContain('SELECT * FROM ride_settlements');
    expect(sql[3]).toContain('INSERT INTO ride_settlements');
    expect(sql[3]).toContain('route_territory, distance_km, duration_min');
    const insertCall = mocks.txQuery.mock.calls.find(
      ([query]) => String(query).includes('INSERT INTO ride_settlements'),
    );
    expect(insertCall?.[1]?.[9]).toBe(10);
    expect(sql[4]).toContain('UPDATE rides_v2 SET');
    expect(sql[5]).toBe('COMMIT');
    expect(mocks.release).toHaveBeenCalledWith(false);
    expect(mocks.poolQuery.mock.calls.map(([query]) => String(query))).not.toContain('BEGIN');
    expect(mocks.poolQuery.mock.calls.map(([query]) => String(query))).not.toContain('COMMIT');
  });

  it('rolls back BOTH economic records if the cache write fails', async () => {
    mocks.txQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [normal], rowCount: 1 };
      if (sql.includes('SELECT * FROM ride_settlements')) return { rows: [] };
      if (sql.includes('UPDATE rides_v2 SET')) throw new Error('synthetic cache write failure');
      return { rows: [], rowCount: 1 };
    });
    await expect(run()).rejects.toThrow('synthetic cache write failure');
    const sql = mocks.txQuery.mock.calls.map(([query]) => String(query));
    expect(sql).toContain('ROLLBACK');
    expect(sql).not.toContain('COMMIT');
    expect(mocks.release).toHaveBeenCalledWith(false);
  });

  it('reuses the persisted quote if a concurrent caller committed before the row lock', async () => {
    const settled = {
      ride_id: 'ride-445', quoted_price: '28.00', route_territory: 'adjacent',
      fee_percent: '18', fee_amount: '5.04', driver_earnings: '22.96',
      distance_km: '12', pricing_profile_slug: 'previous-quote',
    };
    mocks.txQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [normal], rowCount: 1 };
      if (sql.includes('SELECT * FROM ride_settlements')) return { rows: [settled] };
      return { rows: [], rowCount: 1 };
    });
    const result = await run();
    expect(result).toMatchObject({ quoted_price: 28, pricing_profile_slug: 'previous-quote' });
    expect(mocks.txQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO ride_settlements'))).toBe(false);
    expect(mocks.txQuery.mock.calls.some(([sql]) => String(sql).includes('UPDATE rides_v2 SET'))).toBe(false);
  });

  it('checks persisted CARE classification again under the write lock', async () => {
    mocks.txQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) {
        return { rows: [{ ride_type: 'care', service_category: 'CARE_ASSISTED', trip_details: null }] };
      }
      return { rows: [], rowCount: 1 };
    });
    await expect(run()).rejects.toMatchObject({ code: CARE_UNAVAILABLE_CODE });
    const sql = mocks.txQuery.mock.calls.map(([query]) => String(query));
    expect(sql).toEqual(['BEGIN', expect.stringContaining('FOR UPDATE'), 'ROLLBACK']);
  });

  it('rejects a missing persisted ride or a zero-row cache update and rolls back', async () => {
    mocks.txQuery.mockImplementationOnce(async () => ({ rows: [] }))
      .mockImplementationOnce(async () => ({ rows: [] }));
    await expect(run()).rejects.toThrow('PRICING_RIDE_NOT_FOUND');
    expect(mocks.txQuery.mock.calls.map(([query]) => String(query))).toContain('ROLLBACK');

    vi.clearAllMocks();
    mocks.connect.mockResolvedValue({ query: mocks.txQuery, release: mocks.release });
    mocks.poolQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT ride_type, service_category, trip_details FROM rides_v2')) return { rows: [normal] };
      if (sql.includes('SELECT * FROM ride_settlements')) return { rows: [] };
      if (sql.includes('pricing_profiles') && sql.includes('is_default = false')) return { rows: [] };
      if (sql.includes('pricing_profiles') && sql.includes('is_default = true')) return { rows: [profile] };
      if (sql.includes('feature_flags')) return { rows: [{ enabled: true }] };
      return { rows: [], rowCount: 1 };
    });
    mocks.txQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('FOR UPDATE')) return { rows: [normal], rowCount: 1 };
      if (sql.includes('SELECT * FROM ride_settlements')) return { rows: [] };
      if (sql.includes('UPDATE rides_v2 SET')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 1 };
    });
    await expect(run()).rejects.toThrow('PRICING_RIDE_CACHE_UPDATE_FAILED');
    expect(mocks.txQuery.mock.calls.map(([query]) => String(query))).toContain('ROLLBACK');
  });
});
