/**
 * Resolve um bounding box (bbox) MUNICIPAL confiável para um território,
 * de forma GENÉRICA (sem hardcode por cidade). Ordem de preferência:
 *
 *   1) Envelope dos geofences já existentes daquela cidade no sistema
 *      (neighborhood_geofences via PostGIS ST_Extent) — reuso de dado próprio;
 *   2) Envelope do LIMITE MUNICIPAL do OpenStreetMap (relação admin_level=8),
 *      buscado via Overpass — mesma origem/região, sem inventar bbox.
 *
 * Se nenhuma fonte confiável estiver disponível, retorna null (o chamador deve
 * então recusar a aquisição persistível com MUNICIPAL_BBOX_UNAVAILABLE).
 *
 * Somente LEITURA. Não grava nada.
 */
import type { CityBoundingBox } from './city-preparation.core';
import {
  OVERPASS_MIRRORS,
} from './providers/openstreetmap-provider';
import { UF_TO_STATE_NAME } from './osm-geojson-normalizer';

export type PrismaLike = any;

export interface MunicipalBBoxResult {
  bbox: CityBoundingBox | null;
  source: 'existing_geofences' | 'osm_municipality' | 'none';
  details?: string;
}

const ALLOWED_HOSTS = new Set(OVERPASS_MIRRORS.map((u) => new URL(u).host));

/** Aplica margem (graus) ao bbox para tolerância de borda. */
export function expand(bbox: CityBoundingBox, marginDeg: number): CityBoundingBox {
  return {
    minLon: bbox.minLon - marginDeg,
    maxLon: bbox.maxLon + marginDeg,
    minLat: bbox.minLat - marginDeg,
    maxLat: bbox.maxLat + marginDeg,
  };
}

/** 1) Envelope de geofences já existentes da cidade (se houver). */
export async function bboxFromExistingGeofences(
  prisma: PrismaLike,
  city: string,
): Promise<CityBoundingBox | null> {
  // ST_Extent sobre os geofences dos bairros daquela cidade.
  const rows: any[] = await prisma.$queryRaw`
    SELECT
      ST_XMin(ext) AS min_lon, ST_YMin(ext) AS min_lat,
      ST_XMax(ext) AS max_lon, ST_YMax(ext) AS max_lat
    FROM (
      SELECT ST_Extent(g.geom) AS ext
      FROM neighborhood_geofences g
      JOIN neighborhoods n ON n.id = g.neighborhood_id
      WHERE n.city = ${city} AND g.geom IS NOT NULL
    ) e
  `;
  const r = rows?.[0];
  if (!r || r.min_lon == null || r.min_lat == null || r.max_lon == null || r.max_lat == null) return null;
  const bbox: CityBoundingBox = {
    minLon: Number(r.min_lon), maxLon: Number(r.max_lon),
    minLat: Number(r.min_lat), maxLat: Number(r.max_lat),
  };
  if (![bbox.minLon, bbox.maxLon, bbox.minLat, bbox.maxLat].every(Number.isFinite)) return null;
  return bbox;
}

/** Query Overpass que retorna apenas os bounds da relação municipal (admin_level=8). */
export function buildMunicipalityBoundsQuery(city: string, uf?: string | null): string {
  const safeCity = city.replace(/"/g, '\\"');
  const stateName = uf ? UF_TO_STATE_NAME[String(uf).toUpperCase()] : null;
  const lines = ['[out:json][timeout:120];'];
  if (stateName) {
    const safeState = stateName.replace(/"/g, '\\"');
    lines.push(
      `rel["name"="${safeState}"]["admin_level"="4"]["boundary"="administrative"];`,
      'map_to_area->.st;',
      `rel["name"="${safeCity}"]["admin_level"="8"]["boundary"="administrative"](area.st);`,
    );
  } else {
    lines.push(`rel["name"="${safeCity}"]["admin_level"="8"]["boundary"="administrative"];`);
  }
  // `out bb;` retorna apenas os bounding boxes — payload minúsculo.
  lines.push('out bb;');
  return lines.join('\n');
}

/** 2) Envelope do limite municipal via OSM (admin_level=8). */
export async function bboxFromOsmMunicipality(
  city: string,
  uf: string | null,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; mirrors?: readonly string[] } = {},
): Promise<CityBoundingBox | null> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as typeof fetch);
  if (typeof fetchImpl !== 'function') return null;
  const mirrors = (opts.mirrors ?? OVERPASS_MIRRORS).filter((u) => ALLOWED_HOSTS.has(new URL(u).host));
  const query = buildMunicipalityBoundsQuery(city, uf);
  const timeoutMs = opts.timeoutMs ?? 30_000;

  for (const url of mirrors) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res: any = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
        redirect: 'manual',
      } as any);
      const status = res.status as number;
      if (res.type === 'opaqueredirect' || (status >= 300 && status < 400)) continue;
      if (status < 200 || status >= 300) continue;
      const ct = (res.headers?.get?.('content-type') || '').toLowerCase();
      if (!ct.includes('json') && !ct.includes('osm3s')) continue;
      const text = await res.text();
      let parsed: any;
      try { parsed = JSON.parse(text); } catch { continue; }
      const els = Array.isArray(parsed?.elements) ? parsed.elements : [];
      // Une os bounds de todos os elementos retornados.
      let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity, found = false;
      for (const el of els) {
        const b = el.bounds;
        if (b && Number.isFinite(b.minlon) && Number.isFinite(b.minlat) && Number.isFinite(b.maxlon) && Number.isFinite(b.maxlat)) {
          minLon = Math.min(minLon, b.minlon); maxLon = Math.max(maxLon, b.maxlon);
          minLat = Math.min(minLat, b.minlat); maxLat = Math.max(maxLat, b.maxlat);
          found = true;
        }
      }
      if (found) return { minLon, maxLon, minLat, maxLat };
    } catch {
      // tenta próximo mirror
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

/**
 * Resolve o bbox municipal (com margem) tentando dado próprio e depois OSM.
 * marginDeg default 0.05 (~5 km) apenas para tolerância de borda.
 */
export async function resolveMunicipalBBox(
  prisma: PrismaLike,
  city: string,
  uf: string | null,
  opts: { fetchImpl?: typeof fetch; timeoutMs?: number; mirrors?: readonly string[]; marginDeg?: number } = {},
): Promise<MunicipalBBoxResult> {
  const margin = opts.marginDeg ?? 0.05;

  // 1) Dado próprio (se a cidade já tem geofences).
  try {
    const existing = await bboxFromExistingGeofences(prisma, city);
    if (existing) return { bbox: expand(existing, margin), source: 'existing_geofences' };
  } catch (e) {
    // segue para OSM; não mascara — apenas tenta a próxima fonte.
  }

  // 2) Limite municipal via OSM.
  const osm = await bboxFromOsmMunicipality(city, uf, opts);
  if (osm) return { bbox: expand(osm, margin), source: 'osm_municipality' };

  return { bbox: null, source: 'none', details: 'Nenhuma fonte confiável de bbox municipal' };
}
