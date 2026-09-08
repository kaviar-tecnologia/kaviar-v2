import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * TerritoryResolver - Single source of truth for territorial resolution
 * Anti-Frankenstein: Centralized, indexed, PostGIS-native
 * 
 * Resolution order:
 * 1. COMMUNITY (via community_geofences.geom)
 * 2. NEIGHBORHOOD (via neighborhood_geofences.geom)
 * 3. FALLBACK_800M (Haversine distance from neighborhood center)
 * 4. OUTSIDE (no match)
 */

export interface TerritoryResolution {
  resolved: boolean;
  community: { id: string; name: string } | null;
  neighborhood: { id: string; name: string } | null;
  method: 'community' | 'neighborhood' | 'fallback_800m' | 'outside';
  fallbackMeters?: number | null;
  srid: 4326;
}

const FALLBACK_RADIUS_M = 800;
const EARTH_RADIUS_M = 6371000;

/**
 * Calculate Haversine distance between two points
 */
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_M * c;
}

/**
 * Resolve community from coordinates using PostGIS ST_Covers
 */
async function resolveCommunity(
  lng: number,
  lat: number
): Promise<{ id: string; name: string } | null> {
  try {
    const result = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT c.id, c.name
      FROM communities c
      JOIN community_geofences cg ON c.id = cg.community_id
      WHERE cg.geom IS NOT NULL
        AND c.is_active = true
        AND ST_Covers(
          cg.geom,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
        )
      LIMIT 1
    `;
    return result[0] || null;
  } catch (error) {
    console.error('[TerritoryResolver] Community resolution error:', error);
    return null;
  }
}

/**
 * Resolve neighborhood from coordinates using PostGIS ST_Covers
 */
async function resolveNeighborhood(
  lng: number,
  lat: number
): Promise<{ id: string; name: string } | null> {
  try {
    const result = await prisma.$queryRaw<Array<{ id: string; name: string }>>`
      SELECT n.id, n.name
      FROM neighborhoods n
      JOIN neighborhood_geofences ng ON ng.neighborhood_id = n.id
      WHERE ng.geom IS NOT NULL
        AND n.is_active = true
        AND ST_Covers(
          ng.geom,
          ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)
        )
      LIMIT 1
    `;
    return result[0] || null;
  } catch (error) {
    console.error('[TerritoryResolver] Neighborhood resolution error:', error);
    return null;
  }
}

/**
 * Fallback: find nearest neighborhood within 800m
 */
async function resolveFallback(
  lng: number,
  lat: number
): Promise<{ id: string; name: string; distance: number } | null> {
  try {
    const neighborhoods = await prisma.neighborhoods.findMany({
      where: {
        is_active: true,
        center_lat: { not: null },
        center_lng: { not: null },
      },
      select: {
        id: true,
        name: true,
        center_lat: true,
        center_lng: true,
      },
    });

    const withDistance = neighborhoods
      .map((n) => ({
        id: n.id,
        name: n.name,
        distance: calculateDistance(
          lat,
          lng,
          Number(n.center_lat),
          Number(n.center_lng)
        ),
      }))
      .filter((n) => n.distance <= FALLBACK_RADIUS_M)
      .sort((a, b) => a.distance - b.distance);

    return withDistance[0] || null;
  } catch (error) {
    console.error('[TerritoryResolver] Fallback resolution error:', error);
    return null;
  }
}

/**
 * Main resolver: COMMUNITY → NEIGHBORHOOD → FALLBACK → OUTSIDE
 */
export async function resolveTerritory(
  lng: number,
  lat: number
): Promise<TerritoryResolution> {
  // Validate coordinates
  if (
    isNaN(lat) ||
    isNaN(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return {
      resolved: false,
      community: null,
      neighborhood: null,
      method: 'outside',
      srid: 4326,
    };
  }

  // 1. Try COMMUNITY first
  const community = await resolveCommunity(lng, lat);
  if (community) {
    // If community found, also resolve neighborhood (community is within neighborhood)
    const neighborhood = await resolveNeighborhood(lng, lat);
    console.log(`[TerritoryResolver] Resolved: community=${community.name}, neighborhood=${neighborhood?.name || 'none'}`);
    return {
      resolved: true,
      community,
      neighborhood,
      method: 'community',
      srid: 4326,
    };
  }

  // 2. Try NEIGHBORHOOD
  const neighborhood = await resolveNeighborhood(lng, lat);
  if (neighborhood) {
    console.log(`[TerritoryResolver] Resolved: neighborhood=${neighborhood.name}`);
    return {
      resolved: true,
      community: null,
      neighborhood,
      method: 'neighborhood',
      srid: 4326,
    };
  }

  // 3. Try FALLBACK (800m radius)
  const fallback = await resolveFallback(lng, lat);
  if (fallback) {
    console.log(`[TerritoryResolver] Resolved: fallback=${fallback.name} (${Math.round(fallback.distance)}m)`);
    return {
      resolved: true,
      community: null,
      neighborhood: { id: fallback.id, name: fallback.name },
      method: 'fallback_800m',
      fallbackMeters: Math.round(fallback.distance),
      srid: 4326,
    };
  }

  // 4. OUTSIDE service area
  console.log('[TerritoryResolver] Outside service area');
  return {
    resolved: false,
    community: null,
    neighborhood: null,
    method: 'outside',
    srid: 4326,
  };
}
