import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ route: vi.fn(), territory: vi.fn(), floor: vi.fn() }));
vi.mock('../src/services/google-directions.service', () => ({ getRouteDistance: mocks.route }));
vi.mock('../src/services/territory-resolver.service', () => ({ resolveTerritory: mocks.territory }));
vi.mock('../src/services/territory-floor.service', () => ({ getFloorForRoute: mocks.floor }));

import { pool } from '../src/db';
import { quote } from '../src/services/pricing-engine';

const disposable = (() => {
  try {
    if (process.env.GITHUB_ACTIONS !== 'true' || process.env.CARE_QUOTE_ATOMIC_INTEGRATION !== '1') return false;
    const uri = new URL(process.env.DATABASE_URL || '');
    return ['postgres:', 'postgresql:'].includes(uri.protocol) &&
      uri.hostname === '127.0.0.1' && uri.port === '5432' &&
      uri.username === 'ci' && uri.pathname === '/care06b_disposable';
  } catch { return false; }
})();
if (process.env.GITHUB_ACTIONS === 'true' && process.env.CARE_QUOTE_ATOMIC_INTEGRATION === '1' && !disposable) {
  throw new Error('CARE_445_TEST_DATABASE_NOT_DISPOSABLE');
}

const failureId = '00000000-0000-4000-8000-000000004445';

describe.skipIf(!disposable)('CARE-445 quote: official table names on disposable PostgreSQL', () => {
  beforeAll(async () => {
    const identity = await pool.query('SELECT current_database() AS db, current_user AS role');
    expect(identity.rows[0]).toMatchObject({ db: 'care06b_disposable', role: 'ci' });
    // Partial contract fixture using the exact official writer's columns, not a
    // substitute for full-schema end-to-end lifecycle testing before release.
    await pool.query(`
      CREATE TABLE feature_flags (key TEXT PRIMARY KEY, enabled BOOLEAN NOT NULL);
      CREATE TABLE pricing_profiles (
        id UUID PRIMARY KEY, slug TEXT NOT NULL, base_fare NUMERIC NOT NULL,
        per_km NUMERIC NOT NULL, per_minute NUMERIC NOT NULL, minimum_fare NUMERIC NOT NULL,
        fee_local NUMERIC NOT NULL, fee_adjacent NUMERIC NOT NULL, fee_external NUMERIC NOT NULL,
        fee_homebound NUMERIC, surcharge_external NUMERIC NOT NULL,
        credit_cost_local INT NOT NULL, credit_cost_external INT NOT NULL,
        max_dispatch_km NUMERIC NOT NULL, center_lat NUMERIC, center_lng NUMERIC,
        radius_km NUMERIC, vehicle_category TEXT NOT NULL,
        service_category TEXT NOT NULL, is_default BOOLEAN NOT NULL, is_active BOOLEAN NOT NULL
      );
      CREATE TABLE rides_v2 (
        id TEXT PRIMARY KEY, ride_type TEXT NOT NULL, service_category TEXT NOT NULL,
        trip_details JSONB, pricing_profile_id UUID, quoted_price NUMERIC,
        locked_price NUMERIC, platform_fee NUMERIC, driver_earnings NUMERIC, territory_match TEXT
      );
      CREATE TABLE ride_settlements (
        ride_id TEXT PRIMARY KEY, pricing_profile_id UUID NOT NULL, pricing_profile_slug TEXT NOT NULL,
        origin_neighborhood_id TEXT, origin_neighborhood TEXT, dest_neighborhood_id TEXT,
        dest_neighborhood TEXT, route_territory TEXT NOT NULL, distance_km NUMERIC NOT NULL,
        base_fare_used NUMERIC NOT NULL, per_km_used NUMERIC NOT NULL,
        per_minute_used NUMERIC NOT NULL, minimum_fare_used NUMERIC NOT NULL,
        quoted_price NUMERIC NOT NULL, locked_price NUMERIC NOT NULL,
        fee_percent NUMERIC NOT NULL, fee_amount NUMERIC NOT NULL,
        driver_earnings NUMERIC NOT NULL, quoted_at TIMESTAMPTZ NOT NULL, locked_at TIMESTAMPTZ NOT NULL
      );
      INSERT INTO feature_flags VALUES ('FEE_MODEL_FLAT_18', true);
      INSERT INTO pricing_profiles VALUES (
        '22222222-2222-4222-8222-222222222222', 'official-car', 5, 1.5, 0.3, 12, 12, 15, 22,
        NULL, 0, 1, 2, 12, NULL, NULL, NULL, 'CAR', 'CAR_NORMAL', true, true
      );
      CREATE FUNCTION care445_cache_failure() RETURNS trigger AS $$
      BEGIN
        IF NEW.id = '00000000-0000-4000-8000-000000004445' THEN RAISE EXCEPTION 'synthetic cache write rejected'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql;
      CREATE TRIGGER care445_fail_quote_cache BEFORE UPDATE ON rides_v2
      FOR EACH ROW EXECUTE FUNCTION care445_cache_failure();
    `);
    mocks.route.mockResolvedValue({ distance_km: 10, duration_min: 10 });
    mocks.territory.mockResolvedValue({ neighborhood: null });
    mocks.floor.mockResolvedValue(null);
  });

  afterAll(async () => {
    await pool.query(`
      DROP TABLE IF EXISTS ride_settlements;
      DROP TABLE IF EXISTS rides_v2;
      DROP TABLE IF EXISTS pricing_profiles;
      DROP TABLE IF EXISTS feature_flags;
      DROP FUNCTION IF EXISTS care445_cache_failure();
    `);
    await pool.end();
  });

  const ride = async (category = 'CAR_NORMAL', id = randomUUID()) => {
    await pool.query('INSERT INTO rides_v2 (id, ride_type, service_category) VALUES ($1,$2,$3)',
      [id, category.startsWith('CARE_') ? 'care' : 'normal', category]);
    return id;
  };
  const run = (id: string, category = 'CAR_NORMAL') =>
    quote(id, -22.97, -43.2, -22.95, -43.18, 'n', 'n', null, category);

  it('writes one coherent settlement and cache with the unchanged car formula', async () => {
    const id = await ride();
    expect(await run(id)).toMatchObject({ quoted_price: 23, fee_percent: 18,
      fee_amount: 4.14, driver_earnings: 18.86 });
    const { rows } = await pool.query(
      `SELECT s.quoted_price, s.locked_price, s.fee_amount, s.driver_earnings,
       r.quoted_price AS cache_quote, r.locked_price AS cache_lock,
       r.platform_fee AS cache_fee, r.driver_earnings AS cache_earnings
       FROM ride_settlements s JOIN rides_v2 r ON r.id=s.ride_id WHERE s.ride_id=$1`, [id]);
    expect(rows).toHaveLength(1);
    expect(Object.values(rows[0]).map(Number)).toEqual([23, 23, 4.14, 18.86, 23, 23, 4.14, 18.86]);
  });

  it('rolls back the settlement if the operational cache write fails', async () => {
    await ride('CAR_NORMAL', failureId);
    await expect(run(failureId)).rejects.toThrow('synthetic cache write rejected');
    expect((await pool.query('SELECT 1 FROM ride_settlements WHERE ride_id=$1', [failureId])).rowCount).toBe(0);
    expect((await pool.query('SELECT locked_price FROM rides_v2 WHERE id=$1', [failureId])).rows[0].locked_price).toBeNull();
  });

  it('two simultaneous requests generate a single official settlement', async () => {
    const id = await ride();
    const [first, second] = await Promise.all([run(id), run(id)]);
    expect(first).toMatchObject({ quoted_price: 23, fee_amount: 4.14 });
    expect(second).toMatchObject({ quoted_price: 23, fee_amount: 4.14 });
    const { rows } = await pool.query(
      'SELECT s.locked_price AS official, r.locked_price AS cache FROM ride_settlements s JOIN rides_v2 r ON r.id=s.ride_id WHERE s.ride_id=$1',
      [id]);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].official)).toBe(23);
    expect(Number(rows[0].cache)).toBe(23);
  });

  it('preserves MOTO_PASSENGER pricing and never disguises CARE as CAR_NORMAL', async () => {
    const moto = await ride('MOTO_PASSENGER');
    expect(await run(moto, 'MOTO_PASSENGER')).toMatchObject({
      quoted_price: 18, fee_amount: 3.24, driver_earnings: 14.76 });
    const care = await ride('CARE_ASSISTED');
    await expect(run(care, 'CAR_NORMAL')).rejects.toMatchObject({ code: 'CARE_SERVICE_NOT_AVAILABLE' });
    expect((await pool.query('SELECT 1 FROM ride_settlements WHERE ride_id=$1', [care])).rowCount).toBe(0);
  });
});
