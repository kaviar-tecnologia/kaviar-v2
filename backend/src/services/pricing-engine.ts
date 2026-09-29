/**
 * Pricing Engine — ÚNICO writer da economia da corrida
 *
 * Responsabilidades:
 *   quote()   → calcula preço antes do dispatch
 *   refine()  → refina fee/earnings quando motorista aceita
 *   settle()  → fecha economia no complete
 *
 * Regras:
 *   - Nenhum outro módulo escreve campos econômicos em rides_v2 ou ride_settlements
 *   - ride_settlements = fonte de verdade
 *   - rides_v2 = cache operacional
 *   - Toda operação é idempotente por ride_id
 *   - Preço do passageiro (locked_price) NUNCA muda após quote
 */

import { pool } from '../db';
import { resolveTerritory, TerritoryResolution } from './territory-resolver.service';
import { getFloorForRoute } from './territory-floor.service';
import { getRouteDistance } from './google-directions.service';
import { PLATFORM_FEE_PERCENT } from './finance/territory/monetary';
import { CARE_UNAVAILABLE_CODE, isUnsupportedCareIntent } from './care/care-readiness-policy';
import { withCarePricingTransaction } from './care/care-pricing-transaction';

// --- Fee model flat 18% feature flag ---

let cachedFlatFeeFlag: { value: boolean; fetchedAt: number } | null = null;
let cachedFlatFeePercent: { id: string; percent: number; fetchedAt: number } | null = null;
const FLAG_CACHE_TTL = 60_000;

export async function isFlatFeeEnabled(queryRunner: Pick<typeof pool, 'query'> = pool): Promise<boolean> {
  if (cachedFlatFeeFlag && Date.now() - cachedFlatFeeFlag.fetchedAt < FLAG_CACHE_TTL) return cachedFlatFeeFlag.value;
  let enabled = false;
  try {
    // Under a pricing transaction, use the checked-out client. Querying the
    // shared pool while all clients are reserved can starve the pool.
    const r = await queryRunner.query(`SELECT enabled FROM feature_flags WHERE key = 'FEE_MODEL_FLAT_18' LIMIT 1`);
    enabled = r.rows[0]?.enabled === true;
  } catch {
    enabled = process.env.FEE_MODEL_FLAT_18 === 'true';
  }
  cachedFlatFeeFlag = { value: enabled, fetchedAt: Date.now() };
  return enabled;
}

/**
 * @deprecated Not called when FEE_MODEL_FLAT_18 is active.
 * Retained for potential future use if dynamic configuration is re-enabled.
 * In flat mode, PLATFORM_FEE_PERCENT from monetary.ts is the authoritative source.
 */
async function getFlatFeeConfig(): Promise<{ id: string; percent: number } | null> {
  if (cachedFlatFeePercent && Date.now() - cachedFlatFeePercent.fetchedAt < FLAG_CACHE_TTL) return cachedFlatFeePercent;
  const r = await pool.query(
    `SELECT id, platform_fee_percent FROM platform_fee_configs
     WHERE approval_status = 'approved' AND effective_from <= NOW()
       AND (effective_to IS NULL OR effective_to > NOW())
     ORDER BY effective_from DESC LIMIT 1`
  );
  if (!r.rows[0]) return null;
  cachedFlatFeePercent = { id: r.rows[0].id, percent: Number(r.rows[0].platform_fee_percent), fetchedAt: Date.now() };
  return cachedFlatFeePercent;
}

// --- Effective platform fee resolver ---

/**
 * Resolves the effective platform fee percentage for the current ride.
 *
 * When FEE_MODEL_FLAT_18 is active:
 *   - Returns PLATFORM_FEE_PERCENT (currently 18%)
 *   - This is the SAME constant used by fee-split and wallet-settlement
 *   - IGNORES pricing profile territorial rates and platform_fee_configs
 *   - Dynamic configuration (platform_fee_configs) is NOT supported in flat mode.
 *   - settle() validates the persisted snapshot against this value (fail-closed)
 *
 * When FEE_MODEL_FLAT_18 is inactive:
 *   - Returns the pricing profile territorial rate for the given territory
 *   - Used by quote() and refine() to persist fee_percent in ride_settlements
 *   - settle() uses the PERSISTED snapshot (not this function) to avoid
 *     retroactive changes if the pricing profile is updated after quote
 *
 * DYNAMIC_PLATFORM_FEE_CONFIGURATION_NOT_SUPPORTED_IN_FLAT_18_MODE
 */
export async function resolveEffectivePlatformFeePercent(
  profile: PricingProfile,
  territory: TerritoryType,
  homebound = false,
  queryRunner: Pick<typeof pool, 'query'> = pool,
): Promise<{ percent: number; source: 'flat_constant' | 'territorial' }> {
  const flatActive = await isFlatFeeEnabled(queryRunner);
  if (flatActive) {
    return { percent: PLATFORM_FEE_PERCENT, source: 'flat_constant' };
  }
  return { percent: feeForTerritory(profile, territory, homebound), source: 'territorial' };
}

// --- Types ---

export interface PricingProfile {
  id: string;
  slug: string;
  base_fare: number;
  per_km: number;
  per_minute: number;
  minimum_fare: number;
  fee_local: number;
  fee_adjacent: number;
  fee_external: number;
  fee_homebound: number | null;
  surcharge_external: number;
  credit_cost_local: number;
  credit_cost_external: number;
  max_dispatch_km: number;
  center_lat: number | null;
  center_lng: number | null;
  radius_km: number | null;
}

type TerritoryType = 'local' | 'adjacent' | 'external';

export interface QuoteResult {
  quoted_price: number;
  route_territory: TerritoryType;
  fee_percent: number;
  fee_amount: number;
  driver_earnings: number;
  distance_km: number;
  pricing_profile_slug: string;
}

export interface SettlementResult {
  final_price: number;
  fee_percent: number;
  fee_amount: number;
  driver_earnings: number;
  credit_cost: number;
  credit_match_type: string;
  settlement_territory: TerritoryType;
  /** Charge persisted at settlement, in cents; only set for wait-enabled completion. */
  wait_charge_cents?: number;
}

// --- Helpers ---

const EARTH_RADIUS_KM = 6371;

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function classifyRoute(
  originNeighborhoodId: string | null,
  destNeighborhoodId: string | null
): TerritoryType {
  if (!originNeighborhoodId || !destNeighborhoodId) return 'external';
  if (originNeighborhoodId === destNeighborhoodId) return 'local';
  return 'adjacent';
}

/** Public wrapper for classifyRoute */
export function classifyRouteFromIds(
  originNeighborhoodId: string | null,
  destNeighborhoodId: string | null
): TerritoryType {
  return classifyRoute(originNeighborhoodId, destNeighborhoodId);
}

export function classifyWithDriver(
  driverNeighborhoodId: string | null,
  originNeighborhoodId: string | null,
  destNeighborhoodId: string | null
): TerritoryType {
  if (!driverNeighborhoodId) return 'external';
  const originMatch = originNeighborhoodId === driverNeighborhoodId;
  const destMatch = destNeighborhoodId === driverNeighborhoodId;
  if (originMatch && destMatch) return 'local';
  if (originMatch || destMatch) return 'adjacent';
  return 'external';
}

export function feeForTerritory(profile: PricingProfile, territory: TerritoryType, homebound = false): number {
  if (homebound && (territory === 'local' || territory === 'adjacent') && profile.fee_homebound != null) {
    return profile.fee_homebound;
  }
  if (territory === 'local') return profile.fee_local;
  if (territory === 'adjacent') return profile.fee_adjacent;
  return profile.fee_external;
}

export function creditForTerritory(profile: PricingProfile, territory: TerritoryType): { cost: number; matchType: string } {
  if (territory === 'local' || territory === 'adjacent') {
    return { cost: profile.credit_cost_local, matchType: 'LOCAL' };
  }
  return { cost: profile.credit_cost_external, matchType: 'EXTERNAL' };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** CARE-04A last-line protection at every official economic write boundary. */
async function assertNotCarePricingRide(rideId: string): Promise<void> {
  // The caller's category is not proof of the persisted ride classification.
  // Also reject a structured CARE request hidden in CAR_NORMAL trip_details.
  const persistedRide = await pool.query(
    'SELECT ride_type, service_category, trip_details FROM rides_v2 WHERE id = $1',
    [rideId]
  );
  if (persistedRide.rows[0] && isUnsupportedCareIntent(persistedRide.rows[0])) {
    throw Object.assign(new Error(CARE_UNAVAILABLE_CODE), { code: CARE_UNAVAILABLE_CODE });
  }
}

// --- Profile resolution ---

export async function resolveProfile(lat: number, lng: number, serviceCategory: string = 'CAR_NORMAL'): Promise<PricingProfile> {
  // Derive vehicle_category from service_category
  const vehicleCategory = serviceCategory.startsWith('MOTO_') ? 'MOTORCYCLE' : 'CAR';

  // Try to find a regional profile by proximity
  const regional = await pool.query(
    `SELECT * FROM pricing_profiles
     WHERE is_active = true AND is_default = false
       AND vehicle_category = $3
       AND service_category = $4
       AND center_lat IS NOT NULL AND center_lng IS NOT NULL AND radius_km IS NOT NULL
     ORDER BY (
       6371 * acos(
         cos(radians($1)) * cos(radians(center_lat)) *
         cos(radians(center_lng) - radians($2)) +
         sin(radians($1)) * sin(radians(center_lat))
       )
     ) ASC
     LIMIT 1`,
    [lat, lng, vehicleCategory, serviceCategory]
  );

  if (regional.rows[0]) {
    const r = regional.rows[0];
    const dist = haversineKm(lat, lng, Number(r.center_lat), Number(r.center_lng));
    if (dist <= Number(r.radius_km)) {
      return toProfile(r);
    }
  }

  // Fallback to default for this vehicle+service category
  const def = await pool.query(
    `SELECT * FROM pricing_profiles WHERE is_default = true AND is_active = true AND vehicle_category = $1 AND service_category = $2 LIMIT 1`,
    [vehicleCategory, serviceCategory]
  );
  if (!def.rows[0]) {
    if (serviceCategory === 'MOTO_PASSENGER') {
      throw new Error('MOTO_PASSENGER_PRICING_NOT_CONFIGURED');
    }
    if (serviceCategory === 'MOTO_DELIVERY') {
      throw new Error('MOTO_PRICING_PROFILE_NOT_CONFIGURED');
    }
    throw new Error('[pricing-engine] No default pricing profile found');
  }
  return toProfile(def.rows[0]);
}

function toProfile(row: any): PricingProfile {
  return {
    id: row.id,
    slug: row.slug,
    base_fare: Number(row.base_fare),
    per_km: Number(row.per_km),
    per_minute: Number(row.per_minute),
    minimum_fare: Number(row.minimum_fare),
    fee_local: Number(row.fee_local),
    fee_adjacent: Number(row.fee_adjacent),
    fee_external: Number(row.fee_external),
    fee_homebound: row.fee_homebound != null ? Number(row.fee_homebound) : null,
    surcharge_external: Number(row.surcharge_external || 0),
    credit_cost_local: Number(row.credit_cost_local),
    credit_cost_external: Number(row.credit_cost_external),
    max_dispatch_km: Number(row.max_dispatch_km),
    center_lat: row.center_lat ? Number(row.center_lat) : null,
    center_lng: row.center_lng ? Number(row.center_lng) : null,
    radius_km: row.radius_km ? Number(row.radius_km) : null,
  };
}

// --- Public API ---

/**
 * quote() — Calcula preço antes do dispatch. Idempotente por ride_id.
 * V1: lock() é chamado automaticamente (confirmação implícita).
 */
export async function quote(rideId: string, originLat: number, originLng: number,
  destLat: number, destLng: number,
  originNeighborhoodId: string | null, destNeighborhoodId: string | null,
  postWaitDest?: { lat: number; lng: number } | null,
  serviceCategory: string = 'CAR_NORMAL'
): Promise<QuoteResult> {
  // CARE-04A is unconditional at the official economic writer too. A caller
  // may pass CAR_NORMAL for a persisted CARE ride; verify BOTH the supplied
  // category and the stored record BEFORE reading a reusable settlement.
  // CARE-06B positive quoting will require a separately reviewed same-transaction
  // integration, not a loose flag or a category alias.
  if (isUnsupportedCareIntent({ service_category: serviceCategory })) {
    throw Object.assign(new Error(CARE_UNAVAILABLE_CODE), { code: CARE_UNAVAILABLE_CODE });
  }
  await assertNotCarePricingRide(rideId);

  // Idempotência: se já existe settlement, retorna valores existentes
  const existing = await pool.query(
    'SELECT * FROM ride_settlements WHERE ride_id = $1', [rideId]
  );
  if (existing.rows[0]) {
    const s = existing.rows[0];
    return {
      quoted_price: Number(s.quoted_price),
      route_territory: s.route_territory,
      fee_percent: Number(s.fee_percent),
      fee_amount: Number(s.fee_amount),
      driver_earnings: Number(s.driver_earnings),
      distance_km: Number(s.distance_km),
      pricing_profile_slug: s.pricing_profile_slug,
    };
  }

  // Resolve profile
  // Preserve the existing CAR_NORMAL profile source and MOTO pricing behavior.
  // Never derive a CARE price from a missing service-specific profile by fallback.
  const profile = await resolveProfile(originLat, originLng, 'CAR_NORMAL');

  // Resolve territories
  const [originRes, destRes] = await Promise.all([
    resolveTerritory(originLng, originLat),
    resolveTerritory(destLng, destLat),
  ]);

  const resolvedOriginId = originNeighborhoodId || originRes.neighborhood?.id || null;
  const resolvedDestId = destNeighborhoodId || destRes.neighborhood?.id || null;

  // Calculate
  // Calculate distance: Google Directions (real route) with haversine fallback
  let distance_km: number;
  let duration_min = 0;
  let pricing_source: 'google_route' | 'fallback_haversine' = 'fallback_haversine';

  const route = await getRouteDistance(originLat, originLng, destLat, destLng);
  if (route) {
    distance_km = route.distance_km;
    duration_min = route.duration_min;
    pricing_source = 'google_route';
  } else {
    distance_km = round2(haversineKm(originLat, originLng, destLat, destLng));
  }

  // post_wait_destination: add extra leg and promote territory if needed
  let postWaitNeighborhoodId: string | null = null;
  if (postWaitDest) {
    const postRoute = await getRouteDistance(destLat, destLng, postWaitDest.lat, postWaitDest.lng);
    if (postRoute) {
      distance_km = round2(distance_km + postRoute.distance_km);
      duration_min += postRoute.duration_min;
    } else {
      distance_km = round2(distance_km + haversineKm(destLat, destLng, postWaitDest.lat, postWaitDest.lng));
    }
    const postRes = await resolveTerritory(postWaitDest.lng, postWaitDest.lat);
    postWaitNeighborhoodId = postRes.neighborhood?.id || null;
  }

  const MAX_BILLABLE_MINUTES = 15;
  const billable_minutes = Math.min(duration_min, MAX_BILLABLE_MINUTES);
  const raw = profile.base_fare + (distance_km * profile.per_km) + (billable_minutes * profile.per_minute);
  let quoted_price = round2(Math.max(raw, profile.minimum_fare));

  // Territory: promote to most external classification across all legs
  let route_territory = classifyRoute(resolvedOriginId, resolvedDestId);
  if (postWaitDest) {
    const postLeg = classifyRoute(resolvedDestId, postWaitNeighborhoodId);
    const rank: Record<TerritoryType, number> = { local: 0, adjacent: 1, external: 2 };
    if (rank[postLeg] > rank[route_territory]) route_territory = postLeg;
  }

  // Apply external surcharge (Área 2)
  if (route_territory === 'external' && profile.surcharge_external > 0) {
    quoted_price = round2(quoted_price + profile.surcharge_external);
  }

  // Apply territory price floor (piso territorial)
  // Regra: preço_final = MAX(preço_calculado, piso_territorial)
  let floor_applied = false;
  let floor_id: string | null = null;
  const floor = await getFloorForRoute(resolvedOriginId, resolvedDestId);
  if (floor && floor.total_floor > quoted_price) {
    console.log(`[PRICING_FLOOR] Applied: ride=${rideId} calculated=${quoted_price} floor=${floor.total_floor} route="${floor.origin_label}→${floor.dest_label}"`);
    quoted_price = floor.total_floor;
    floor_applied = true;
    floor_id = floor.id;
  }

  const pricing_profile_fee_percent = feeForTerritory(profile, route_territory);
  const { percent: fee_percent, source: fee_source } = await resolveEffectivePlatformFeePercent(profile, route_territory);

  // MOTO_PASSENGER: 70% of car price, minimum R$18
  if (serviceCategory === 'MOTO_PASSENGER') {
    quoted_price = round2(Math.max(quoted_price * 0.70, 18.00));
  }

  const fee_amount = round2(quoted_price * fee_percent / 100);
  const driver_earnings = round2(quoted_price - fee_amount);

  const now = new Date();

  // CARE-445: one checked-out connection for the actual official economic
  // records. External routing and tariff calculations above remain unchanged.
  // Recheck the persisted ride and its settlement under a row lock: a second
  // concurrent quote must return the committed first quote, not overwrite it.
  const concurrentSnapshot = await withCarePricingTransaction(pool, async (tx): Promise<QuoteResult | null> => {
    const lockedRide = await tx.query(
      'SELECT ride_type, service_category, trip_details FROM rides_v2 WHERE id = $1 FOR UPDATE',
      [rideId]
    );
    if (!lockedRide.rows[0]) throw new Error('PRICING_RIDE_NOT_FOUND');
    if (isUnsupportedCareIntent(lockedRide.rows[0])) {
      throw Object.assign(new Error(CARE_UNAVAILABLE_CODE), { code: CARE_UNAVAILABLE_CODE });
    }

    const alreadyQuoted = await tx.query(
      'SELECT * FROM ride_settlements WHERE ride_id = $1', [rideId]
    );
    if (alreadyQuoted.rows[0]) {
      const s = alreadyQuoted.rows[0];
      return {
        quoted_price: Number(s.quoted_price),
        route_territory: s.route_territory,
        fee_percent: Number(s.fee_percent),
        fee_amount: Number(s.fee_amount),
        driver_earnings: Number(s.driver_earnings),
        distance_km: Number(s.distance_km),
        pricing_profile_slug: s.pricing_profile_slug,
      };
    }

    await tx.query(
      `INSERT INTO ride_settlements (
        ride_id, pricing_profile_id, pricing_profile_slug,
        origin_neighborhood_id, origin_neighborhood,
        dest_neighborhood_id, dest_neighborhood,
        route_territory, distance_km,
        base_fare_used, per_km_used, per_minute_used, minimum_fare_used,
        quoted_price, locked_price,
        fee_percent, fee_amount, driver_earnings,
        quoted_at, locked_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        rideId, profile.id, profile.slug,
        resolvedOriginId, originRes.neighborhood?.name || null,
        resolvedDestId, destRes.neighborhood?.name || null,
        route_territory, distance_km,
        profile.base_fare, profile.per_km, profile.per_minute, profile.minimum_fare,
        quoted_price, quoted_price, // V1: locked = quoted
        fee_percent, fee_amount, driver_earnings, now, now,
      ]
    );

    const updated = await tx.query(
      `UPDATE rides_v2 SET
        pricing_profile_id = $2, quoted_price = $3, locked_price = $4,
        platform_fee = $5, driver_earnings = $6, territory_match = $7
       WHERE id = $1`,
      [rideId, profile.id, quoted_price, quoted_price, fee_amount, driver_earnings, route_territory]
    );
    if (updated.rowCount !== 1) throw new Error('PRICING_RIDE_CACHE_UPDATE_FAILED');
    return null;
  });
  if (concurrentSnapshot) return concurrentSnapshot;

  console.log(`[PRICING_QUOTE] ride=${rideId} profile=${profile.slug} dist=${distance_km}km dur=${duration_min.toFixed(1)}min price=${quoted_price} territory=${route_territory} effective_fee=${fee_percent}% profile_fee=${pricing_profile_fee_percent}% fee_source=${fee_source} source=${pricing_source}${floor_applied ? ` FLOOR_APPLIED(${floor_id})` : ''}`);

  return { quoted_price, route_territory, fee_percent, fee_amount, driver_earnings, distance_km, pricing_profile_slug: profile.slug };
}

/**
 * refine() — Refina fee/earnings quando motorista aceita. Idempotente.
 * Preço do passageiro (locked_price) NÃO muda.
 */
export async function refine(rideId: string, driverNeighborhoodId: string | null,
  driverNeighborhoodName: string | null
): Promise<void> {
  // A preliminary read is not a write authorization. Revalidate the persisted
  // ride and its settlement under locks on the decisive connection.
  await assertNotCarePricingRide(rideId);

  const result = await withCarePricingTransaction(pool, async (tx) => {
    const rideRow = await tx.query(
      'SELECT ride_type, service_category, trip_details, is_homebound, status, locked_price FROM rides_v2 WHERE id = $1 FOR UPDATE',
      [rideId]
    );
    const ride = rideRow.rows[0];
    if (!ride) throw new Error('PRICING_RIDE_NOT_FOUND');
    if (isUnsupportedCareIntent(ride)) {
      throw Object.assign(new Error(CARE_UNAVAILABLE_CODE), { code: CARE_UNAVAILABLE_CODE });
    }

    const row = await tx.query(
      'SELECT * FROM ride_settlements WHERE ride_id = $1 FOR UPDATE', [rideId]
    );
    const s = row.rows[0];
    if (!s) {
      console.error(`[PRICING_REFINE] No settlement for ride=${rideId}`);
      return null;
    }

    // Never re-rate an already refined/closed snapshot after the lock.
    if (s.refined_at || s.settled_at) return null;
    if (!['accepted', 'arrived', 'started', 'in_progress', 'completed'].includes(ride.status)) {
      throw new Error('PRICING_REFINE_RIDE_NOT_ACCEPTED');
    }

    const profile = await tx.query('SELECT * FROM pricing_profiles WHERE id = $1', [s.pricing_profile_id]);
    if (!profile.rows[0]) throw new Error('PRICING_PROFILE_NOT_FOUND');
    const p = toProfile(profile.rows[0]);
    const locked = Number(s.locked_price);
    if (!Number.isFinite(locked) || locked <= 0 ||
        !Number.isFinite(Number(ride.locked_price)) ||
        round2(Number(ride.locked_price)) !== round2(locked)) {
      throw new Error('PRICING_SETTLEMENT_SNAPSHOT_INCONSISTENT');
    }

    const isHomebound = ride.is_homebound === true;
    const driver_territory = classifyWithDriver(
      driverNeighborhoodId, s.origin_neighborhood_id, s.dest_neighborhood_id
    );
    const pricing_profile_fee_percent = feeForTerritory(p, driver_territory, isHomebound);
    const { percent: fee_percent, source: fee_source } =
      await resolveEffectivePlatformFeePercent(p, driver_territory, isHomebound, tx);
    const fee_amount = round2(locked * fee_percent / 100);
    const driver_earnings = round2(locked - fee_amount);

    const updated = await tx.query(
      `UPDATE ride_settlements SET
        driver_neighborhood_id = $2, driver_neighborhood = $3,
        driver_territory = $4, fee_percent = $5, fee_amount = $6,
        driver_earnings = $7, refined_at = $8
       WHERE ride_id = $1 AND refined_at IS NULL AND settled_at IS NULL`,
      [rideId, driverNeighborhoodId, driverNeighborhoodName,
       driver_territory, fee_percent, fee_amount, driver_earnings, new Date()]
    );
    if (updated.rowCount !== 1) throw new Error('PRICING_REFINE_UPDATE_FAILED');

    const cache = await tx.query(
      `UPDATE rides_v2 SET platform_fee = $2, driver_earnings = $3, territory_match = $4
       WHERE id = $1`,
      [rideId, fee_amount, driver_earnings, driver_territory]
    );
    if (cache.rowCount !== 1) throw new Error('PRICING_RIDE_CACHE_UPDATE_FAILED');
    return { driver_territory, fee_percent, fee_amount, driver_earnings,
      pricing_profile_fee_percent, fee_source, isHomebound };
  });

  if (result) {
    console.log(`[PRICING_REFINE] ride=${rideId} driver_territory=${result.driver_territory} effective_fee=${result.fee_percent}% profile_fee=${result.pricing_profile_fee_percent}% fee_source=${result.fee_source} earnings=${result.driver_earnings} homebound=${result.isHomebound}`);
  }
}
/**
 * settle() — Fecha economia no complete. Idempotente.
 * Retorna dados para consumo de crédito e notificações.
 */
export async function settle(
  rideId: string, options: { waitRatePerMinute?: number } = {},
): Promise<SettlementResult | null> {
  await assertNotCarePricingRide(rideId);

  // The official ride lock serializes quote, refine, and settle for this ride.
  // A second caller must observe the first caller's committed snapshot.
  const result = await withCarePricingTransaction(pool, async (tx): Promise<{
    settlement: SettlementResult | null; fee_source: string | null;
  }> => {
    const rideRow = await tx.query(
      'SELECT ride_type, service_category, trip_details, status, locked_price, wait_requested, wait_started_at, wait_ended_at FROM rides_v2 WHERE id = $1 FOR UPDATE',
      [rideId]
    );
    const ride = rideRow.rows[0];
    if (!ride) throw new Error('PRICING_RIDE_NOT_FOUND');
    if (isUnsupportedCareIntent(ride)) {
      throw Object.assign(new Error(CARE_UNAVAILABLE_CODE), { code: CARE_UNAVAILABLE_CODE });
    }

    const row = await tx.query(
      'SELECT * FROM ride_settlements WHERE ride_id = $1 FOR UPDATE', [rideId]
    );
    if (!row.rows[0]) {
      console.error(`[PRICING_SETTLE] No settlement for ride=${rideId}`);
      return { settlement: null, fee_source: null };
    }
    const s = row.rows[0];

    // Historical settlements are immutable, including their original fee
    // configuration. A repeated completion never charges twice.
    if (s.settled_at) {
      const historical: SettlementResult = {
        final_price: Number(s.final_price),
        fee_percent: Number(s.fee_percent),
        fee_amount: Number(s.fee_amount),
        driver_earnings: Number(s.driver_earnings),
        credit_cost: Number(s.credit_cost),
        credit_match_type: s.credit_match_type,
        settlement_territory: s.settlement_territory,
      };
      if (options.waitRatePerMinute !== undefined) {
        const deltaCents = Math.round((historical.final_price - Number(s.locked_price)) * 100);
        if (!Number.isSafeInteger(deltaCents) || deltaCents < 0) {
          throw new Error('PRICING_WAIT_SNAPSHOT_INVALID');
        }
        historical.wait_charge_cents = deltaCents;
      }
      return { settlement: historical, fee_source: 'persisted' };
    }
    if (ride.status !== 'completed') throw new Error('PRICING_SETTLE_RIDE_NOT_COMPLETED');

    const profile = await tx.query('SELECT * FROM pricing_profiles WHERE id = $1', [s.pricing_profile_id]);
    if (!profile.rows[0]) throw new Error('PRICING_PROFILE_NOT_FOUND');
    const p = toProfile(profile.rows[0]);
    const settlement_territory: TerritoryType = s.driver_territory || s.route_territory;
    const lockedPrice = Number(s.locked_price);
    const cacheLocked = Number(ride.locked_price);
    const snapshotFee = Number(s.fee_amount);
    const snapshotEarnings = Number(s.driver_earnings);
    // The pending adjustment flow must update its official and cache snapshots
    // atomically before settle. Never silently finalize mismatched amounts.
    if (![lockedPrice, cacheLocked, snapshotFee, snapshotEarnings].every(Number.isFinite) ||
        lockedPrice <= 0 || round2(lockedPrice) !== round2(cacheLocked) ||
        round2(snapshotFee + snapshotEarnings) !== round2(lockedPrice)) {
      throw new Error('PRICING_SETTLEMENT_SNAPSHOT_INCONSISTENT');
    }

    // Charge 100% of actual wait to the driver using persisted ride evidence.
    // This is part of the original settlement transaction, not a later writer.
    let waitChargeCents = 0;
    if (options.waitRatePerMinute !== undefined) {
      const rate = options.waitRatePerMinute;
      const start = ride.wait_started_at ? new Date(ride.wait_started_at).getTime() : Number.NaN;
      const end = ride.wait_ended_at ? new Date(ride.wait_ended_at).getTime() : Number.NaN;
      if (!ride.wait_requested || !Number.isFinite(rate) || rate < 0 ||
          !Number.isFinite(start) || !Number.isFinite(end) || end < start) {
        throw new Error('PRICING_WAIT_SNAPSHOT_INVALID');
      }
      const minutes = Math.floor((end - start) / 60000);
      waitChargeCents = Math.round(minutes * rate * 100);
      if (!Number.isSafeInteger(waitChargeCents) || waitChargeCents < 0) {
        throw new Error('PRICING_WAIT_SNAPSHOT_INVALID');
      }
    }
    const finalCents = Math.round(lockedPrice * 100) + waitChargeCents;
    if (!Number.isSafeInteger(finalCents) || finalCents <= 0 || finalCents > 99999999) {
      throw new Error('PRICING_WAIT_PRICE_OUT_OF_RANGE');
    }
    const final_price = finalCents / 100;

    const { percent: effective_fee_percent, source: fee_source } =
      await resolveEffectivePlatformFeePercent(p, settlement_territory, false, tx);
    let fee_percent: number, fee_amount: number, driver_earnings: number;
    let credit_cost: number, credit_match_type: string;

    if (fee_source === 'flat_constant') {
      // Preserve the existing flat 18% source and fail-closed mismatch rule.
      fee_percent = effective_fee_percent;
      const persistedFeePercent = Number(s.fee_percent);
      if (persistedFeePercent !== fee_percent && persistedFeePercent > 0) {
        throw Object.assign(
          new Error(
            `SETTLE_FEE_SNAPSHOT_MISMATCH: ride=${rideId} persisted_fee_percent=${persistedFeePercent} ` +
            `effective_fee_percent=${fee_percent} source=${fee_source}. ` +
            `The ride was quoted with a different rate than the current flat mode rate. ` +
            `This settlement is blocked to prevent inconsistent charges.`
          ), { code: 'SETTLE_FEE_SNAPSHOT_MISMATCH' }
        );
      }
      // Flat fee applies to locked base only; the wait is 100% driver revenue.
      fee_amount = round2(lockedPrice * fee_percent / 100);
      driver_earnings = round2(lockedPrice - fee_amount);
      credit_cost = 0;
      credit_match_type = 'FLAT_FEE';
    } else {
      // Never re-rate territorial rides using a newly configured profile.
      fee_percent = Number(s.fee_percent);
      fee_amount = snapshotFee;
      driver_earnings = snapshotEarnings;
      const cr = creditForTerritory(p, settlement_territory);
      credit_cost = cr.cost;
      credit_match_type = cr.matchType;
    }

    if (waitChargeCents > 0) {
      driver_earnings = round2(driver_earnings + waitChargeCents / 100);
      credit_cost *= 2; // Legacy composed-service credit rule, exactly once.
      if (!Number.isSafeInteger(credit_cost) || credit_cost < 0 ||
          credit_cost > 2147483647) throw new Error('PRICING_WAIT_CREDIT_OUT_OF_RANGE');
    }
    if (round2(fee_amount + driver_earnings) !== final_price) {
      throw new Error('PRICING_SETTLEMENT_SNAPSHOT_INCONSISTENT');
    }

    const updated = await tx.query(
      `UPDATE ride_settlements SET
        final_price = $2, settlement_territory = $3,
        credit_cost = $4, credit_match_type = $5, settled_at = $6,
        fee_percent = $7, fee_amount = $8, driver_earnings = $9
       WHERE ride_id = $1 AND settled_at IS NULL`,
      [rideId, final_price, settlement_territory, credit_cost, credit_match_type, new Date(),
       fee_percent, fee_amount, driver_earnings]
    );
    if (updated.rowCount !== 1) throw new Error('PRICING_SETTLEMENT_UPDATE_FAILED');

    const cache = await tx.query(
      `UPDATE rides_v2 SET final_price = $2, platform_fee = $3, driver_earnings = $4 WHERE id = $1`,
      [rideId, final_price, fee_amount, driver_earnings]
    );
    if (cache.rowCount !== 1) throw new Error('PRICING_RIDE_CACHE_UPDATE_FAILED');

    return { settlement: {
      final_price, fee_percent, fee_amount, driver_earnings,
      credit_cost, credit_match_type, settlement_territory,
      ...(options.waitRatePerMinute !== undefined ? { wait_charge_cents: waitChargeCents } : {}),
    }, fee_source };
  });

  if (result.settlement && result.fee_source !== 'persisted') {
    console.log(`[PRICING_SETTLE] ride=${rideId} final=${result.settlement.final_price} territory=${result.settlement.settlement_territory} effective_fee=${result.settlement.fee_percent}% fee_source=${result.fee_source} credit=${result.settlement.credit_cost}(${result.settlement.credit_match_type})`);
  }
  return result.settlement;
}
