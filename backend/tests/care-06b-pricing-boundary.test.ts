import { beforeEach, describe, expect, it, vi } from 'vitest';

const { queryMock, directionsMock, floorMock, territoryMock } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  directionsMock: vi.fn(),
  floorMock: vi.fn(),
  territoryMock: vi.fn(),
}));
vi.mock('../src/db', () => ({ pool: { query: queryMock } }));
vi.mock('../src/services/google-directions.service', () => ({ getRouteDistance: directionsMock }));
vi.mock('../src/services/territory-floor.service', () => ({ getFloorForRoute: floorMock }));
vi.mock('../src/services/territory-resolver.service', () => ({ resolveTerritory: territoryMock }));

import { quote } from '../src/services/pricing-engine';
import { CARE_UNAVAILABLE_CODE } from '../src/services/care/care-readiness-policy';

const profile = {
  id: 'car-normal-profile', slug: 'official-car',
  base_fare: '5.00', per_km: '1.50', per_minute: '0.30', minimum_fare: '12.00',
  fee_local: '12.00', fee_adjacent: '15.00', fee_external: '22.00', fee_homebound: null,
  surcharge_external: '0.00', credit_cost_local: 1, credit_cost_external: 2,
  max_dispatch_km: '12', center_lat: null, center_lng: null, radius_km: null,
};

const callQuote = (category = 'CAR_NORMAL') => quote(
  'ride-1', -22.97, -43.2, -22.95, -43.18,
  'origin', 'origin', null, category,
);

beforeEach(() => {
  vi.clearAllMocks();
  directionsMock.mockResolvedValue({ distance_km: 10, duration_min: 10 });
  floorMock.mockResolvedValue(null);
  territoryMock.mockResolvedValue({ neighborhood: null });
  queryMock.mockImplementation(async (sql: string) => {
    if (sql.includes('SELECT ride_type, service_category, trip_details FROM rides_v2')) {
      return { rows: [{ ride_type: 'normal', service_category: 'CAR_NORMAL', trip_details: null }] };
    }
    if (sql.includes('SELECT * FROM ride_settlements')) return { rows: [] };
    if (sql.includes('pricing_profiles') && sql.includes('is_default = false')) return { rows: [] };
    if (sql.includes('pricing_profiles') && sql.includes('is_default = true')) return { rows: [profile] };
    if (sql.includes('feature_flags')) return { rows: [{ enabled: true }] };
    return { rows: [], rowCount: 1 };
  });
});

describe('CARE-06B: official pricing writer containment without CAR/MOTO regression', () => {
  it.each(['CARE_ASSISTED', 'CARE_FOLDING_WHEELCHAIR', 'CARE_ADAPTED_WHEELCHAIR'])(
    'rejects %s before an economic read or write', async (mode) => {
      await expect(callQuote(mode)).rejects.toMatchObject({ code: CARE_UNAVAILABLE_CODE });
      expect(queryMock).not.toHaveBeenCalled();
    },
  );

  it('rejects forged CAR_NORMAL category when stored ride is CARE, before idempotent settlement', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT ride_type, service_category, trip_details FROM rides_v2')) {
        return { rows: [{
          ride_type: 'care', service_category: 'CARE_ASSISTED', trip_details: null,
        }] };
      }
      throw new Error('Unexpected economic read or write before CARE containment');
    });
    await expect(callQuote('CAR_NORMAL')).rejects.toMatchObject({ code: CARE_UNAVAILABLE_CODE });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('rejects nested CARE intent hidden under an ordinary persisted category', async () => {
    queryMock.mockImplementation(async (sql: string) => {
      if (sql.includes('SELECT ride_type, service_category, trip_details FROM rides_v2')) {
        return { rows: [{
          ride_type: 'normal', service_category: 'CAR_NORMAL',
          trip_details: { care_mode: 'ASSISTED' },
        }] };
      }
      throw new Error('Unexpected economic read or write');
    });
    await expect(callQuote()).rejects.toMatchObject({ code: CARE_UNAVAILABLE_CODE });
    expect(queryMock).toHaveBeenCalledTimes(1);
  });

  it('preserves standard CAR_NORMAL quote and uses official CAR_NORMAL profile', async () => {
    const result = await callQuote();
    expect(result).toMatchObject({
      quoted_price: 23, fee_percent: 18, fee_amount: 4.14,
      driver_earnings: 18.86, pricing_profile_slug: 'official-car',
    });
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('service_category = $2'), ['CAR', 'CAR_NORMAL'],
    );
    expect(queryMock.mock.calls.some(([sql]) => sql.includes('INSERT INTO ride_settlements'))).toBe(true);
    expect(queryMock.mock.calls.some(([sql]) => sql.includes('UPDATE rides_v2 SET'))).toBe(true);
  });

  it('preserves existing MOTO_PASSENGER price behavior with no CARE tariff premium', async () => {
    const result = await callQuote('MOTO_PASSENGER');
    // Existing legacy pricing uses CAR_NORMAL base, then 70% with R$18 minimum.
    expect(result).toMatchObject({
      quoted_price: 18, fee_percent: 18, fee_amount: 3.24,
      driver_earnings: 14.76,
    });
    expect(queryMock).toHaveBeenCalledWith(
      expect.stringContaining('service_category = $2'), ['CAR', 'CAR_NORMAL'],
    );
  });

  it('rejects failed persisted-ride read instead of inventing an ordinary category', async () => {
    queryMock.mockRejectedValueOnce(new Error('read unavailable'));
    await expect(callQuote()).rejects.toThrow('read unavailable');
    expect(queryMock).toHaveBeenCalledTimes(1);
  });
});
