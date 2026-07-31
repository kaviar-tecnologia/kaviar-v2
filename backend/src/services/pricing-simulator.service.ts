import { pool } from '../db';
import { getRouteDistance } from './google-directions.service';
import { resolveTerritory } from './territory-resolver.service';
import { getFloorForRoute } from './territory-floor.service';
import * as pricingEngine from './pricing-engine';
import { PLATFORM_FEE_PERCENT } from './finance/territory/monetary';

type PricingSource = 'google_route' | 'fallback_haversine';
type FeeModel = 'FLAT_FEE' | 'TERRITORIAL_CREDITS';
type TerritoryType = 'local' | 'adjacent' | 'external';

export interface SimulateRidePricingInput {
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  driver_neighborhood_id?: string | null;
}

export interface SimulateRidePricingResult {
  pricing_profile: string;
  route_territory: TerritoryType;
  driver_territory: TerritoryType;
  distance_km: number;
  duration_min: number;
  billable_minutes: number;
  pricing_source: PricingSource;
  raw_price: number;
  price: number;
  minimum_fare_applied: boolean;
  surcharge_applied: number;
  territory_floor_applied: boolean;
  territory_floor_value: number;
  fee_model: FeeModel;
  fee_percent: number;
  fee_amount: number;
  driver_earnings: number;
  credit_cost: number;
  credit_value: number;
  driver_net_after_credit: number;
  origin_neighborhood: string | null;
  dest_neighborhood: string | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * @deprecated Only used in TERRITORIAL_CREDITS fallback path (flat mode disabled).
 * In flat mode, PLATFORM_FEE_PERCENT from monetary.ts is the authoritative source.
 */
async function getActivePlatformFeePercent(): Promise<number> {
  const result = await pool.query(
    `SELECT platform_fee_percent
     FROM platform_fee_configs
     WHERE approval_status = 'approved'
       AND effective_from <= NOW()
       AND (effective_to IS NULL OR effective_to > NOW())
     ORDER BY effective_from DESC
     LIMIT 1`
  );
  const value = Number(result.rows[0]?.platform_fee_percent);
  if (!Number.isFinite(value)) return 18;
  return value;
}

export async function simulateRidePricing(input: SimulateRidePricingInput): Promise<SimulateRidePricingResult> {
  const {
    origin_lat,
    origin_lng,
    dest_lat,
    dest_lng,
    driver_neighborhood_id,
  } = input;

  const profile = await pricingEngine.resolveProfile(origin_lat, origin_lng, 'CAR_NORMAL');

  let distance_km = 0;
  let duration_min = 0;
  let pricing_source: PricingSource = 'fallback_haversine';

  const route = await getRouteDistance(origin_lat, origin_lng, dest_lat, dest_lng);
  if (route) {
    distance_km = round2(route.distance_km);
    duration_min = round2(route.duration_min);
    pricing_source = 'google_route';
  } else {
    distance_km = round2(pricingEngine.haversineKm(origin_lat, origin_lng, dest_lat, dest_lng));
  }

  const billable_minutes = round2(Math.min(duration_min, 15));
  const raw_price = round2(
    profile.base_fare + (distance_km * profile.per_km) + (billable_minutes * profile.per_minute)
  );

  let price = round2(Math.max(raw_price, profile.minimum_fare));
  const minimum_fare_applied = price > raw_price;

  const [originRes, destRes] = await Promise.all([
    resolveTerritory(origin_lng, origin_lat),
    resolveTerritory(dest_lng, dest_lat),
  ]);

  const originNeighborhoodId = originRes.neighborhood?.id || null;
  const destNeighborhoodId = destRes.neighborhood?.id || null;

  const route_territory = pricingEngine.classifyRouteFromIds(originNeighborhoodId, destNeighborhoodId) as TerritoryType;
  const driver_territory = driver_neighborhood_id
    ? pricingEngine.classifyWithDriver(driver_neighborhood_id, originNeighborhoodId, destNeighborhoodId) as TerritoryType
    : route_territory;

  const surcharge_applied = route_territory === 'external' && profile.surcharge_external > 0
    ? round2(profile.surcharge_external)
    : 0;

  if (surcharge_applied > 0) {
    price = round2(price + surcharge_applied);
  }

  const floor = await getFloorForRoute(originNeighborhoodId, destNeighborhoodId);
  const territory_floor_value = floor ? round2(floor.total_floor) : 0;
  const territory_floor_applied = territory_floor_value > 0 && territory_floor_value > price;
  if (territory_floor_applied) {
    price = territory_floor_value;
  }

  const flatFeeEnabled = await pricingEngine.isFlatFeeEnabled();

  let fee_model: FeeModel;
  let fee_percent: number;
  let fee_amount: number;
  let driver_earnings: number;
  let credit_cost: number;
  let credit_value: number;
  let driver_net_after_credit: number;

  if (flatFeeEnabled) {
    fee_model = 'FLAT_FEE';
    // Use the same constant as pricing-engine, fee-split, and wallet-settlement.
    // getActivePlatformFeePercent() (platform_fee_configs) is retained only for
    // the legacy path when flat mode is disabled in the future.
    fee_percent = PLATFORM_FEE_PERCENT;
    fee_amount = round2((price * fee_percent) / 100);
    driver_earnings = round2(price - fee_amount);
    credit_cost = 0;
    credit_value = 0;
    driver_net_after_credit = driver_earnings;
  } else {
    fee_model = 'TERRITORIAL_CREDITS';
    fee_percent = round2(pricingEngine.feeForTerritory(profile, driver_territory));
    fee_amount = round2((price * fee_percent) / 100);
    driver_earnings = round2(price - fee_amount);
    const credit = pricingEngine.creditForTerritory(profile, driver_territory);
    credit_cost = round2(credit.cost);
    credit_value = round2(credit_cost * 2);
    driver_net_after_credit = round2(driver_earnings - credit_value);
  }

  return {
    pricing_profile: profile.slug,
    route_territory,
    driver_territory,
    distance_km,
    duration_min,
    billable_minutes,
    pricing_source,
    raw_price,
    price,
    minimum_fare_applied,
    surcharge_applied,
    territory_floor_applied,
    territory_floor_value,
    fee_model,
    fee_percent,
    fee_amount,
    driver_earnings,
    credit_cost,
    credit_value,
    driver_net_after_credit,
    origin_neighborhood: originRes.neighborhood?.name || null,
    dest_neighborhood: destRes.neighborhood?.name || null,
  };
}
