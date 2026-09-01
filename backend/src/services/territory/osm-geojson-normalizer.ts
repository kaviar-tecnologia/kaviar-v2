/**
 * Normalizador GENÉRICO de Overpass/OSM JSON → GeoJSON de bairros.
 *
 * Puro e testável (sem I/O, sem cidade hardcoded). Converte elementos OSM
 * (relations com members outer/inner; ways fechados) em Polygon/MultiPolygon,
 * valida WGS84 e bbox esperado, deduplica por nome, e devolve estatísticas +
 * IDs OSM para rastreabilidade.
 *
 * NÃO afirma verificação de fonte: quem consome marca isOfficial=false /
 * sourceVerified=false para OSM.
 */
import {
  computeBoundingBox,
  normalizeNeighborhoodName,
  type CityBoundingBox,
  type NeighborhoodFeature,
  type NeighborhoodFeatureCollection,
} from './city-preparation.core';

// ─── Tipos mínimos do Overpass JSON ──────────────────────────────────────────

export interface OverpassGeomPoint { lat: number; lon: number; }
export interface OverpassMember {
  type: 'way' | 'node' | 'relation';
  ref?: number;
  role?: string;
  geometry?: OverpassGeomPoint[];
}
export interface OverpassElement {
  type: 'relation' | 'way' | 'node';
  id: number;
  tags?: Record<string, string>;
  geometry?: OverpassGeomPoint[]; // ways
  members?: OverpassMember[]; // relations
}
export interface OverpassResponse {
  elements?: OverpassElement[];
}

export interface OsmNormalizeOptions {
  expectedCity: string;
  expectedUf?: string | null;
  /** bbox esperado; features fora entram na contagem outOfBBox e são descartadas. */
  bbox?: CityBoundingBox | null;
  /** area_type técnico do schema (default BAIRRO_OFICIAL). NÃO afirma verificação. */
  areaType?: string;
  /** casas decimais de arredondamento das coordenadas (default 7). */
  precision?: number;
}

export interface OsmNormalizeResult {
  featureCollection: NeighborhoodFeatureCollection;
  stats: { total: number; valid: number; invalid: number; duplicates: number; outOfBBox: number };
  osmIds: string[];
  computedBBox: CityBoundingBox | null;
}

// ─── Helpers de geometria (montagem de anéis a partir de ways) ────────────────

type Ring = number[][]; // [ [lon,lat], ... ]

function round(n: number, p: number): number {
  const f = 10 ** p;
  return Math.round(n * f) / f;
}

function closeRing(ring: Ring): Ring {
  if (ring.length === 0) return ring;
  const [f, l] = [ring[0], ring[ring.length - 1]];
  if (f[0] !== l[0] || f[1] !== l[1]) return [...ring, [f[0], f[1]]];
  return ring;
}

/** Une segmentos (ways) em anéis fechados. */
function assembleRings(ways: Ring[]): Ring[] {
  const segs: Ring[] = ways.filter((w) => Array.isArray(w) && w.length >= 2).map((w) => [...w]);
  const rings: Ring[] = [];
  const eq = (a: number[], b: number[]) => a[0] === b[0] && a[1] === b[1];

  while (segs.length) {
    let cur = segs.shift() as Ring;
    let changed = true;
    while (changed && !eq(cur[0], cur[cur.length - 1])) {
      changed = false;
      for (let i = 0; i < segs.length; i++) {
        const s = segs[i];
        if (eq(s[0], cur[cur.length - 1])) { cur = cur.concat(s.slice(1)); segs.splice(i, 1); changed = true; break; }
        if (eq(s[s.length - 1], cur[cur.length - 1])) { cur = cur.concat([...s].reverse().slice(1)); segs.splice(i, 1); changed = true; break; }
        if (eq(s[s.length - 1], cur[0])) { cur = s.slice(0, -1).concat(cur); segs.splice(i, 1); changed = true; break; }
        if (eq(s[0], cur[0])) { cur = [...s].reverse().slice(0, -1).concat(cur); segs.splice(i, 1); changed = true; break; }
      }
    }
    rings.push(closeRing(cur));
  }
  return rings;
}

function ptsFrom(geom: OverpassGeomPoint[] | undefined, precision: number): Ring | null {
  if (!Array.isArray(geom) || geom.length === 0) return null;
  return geom.map((p) => [round(p.lon, precision), round(p.lat, precision)]);
}

function geomFromRelation(rel: OverpassElement, precision: number): { type: 'Polygon' | 'MultiPolygon'; coordinates: any } | null {
  const outerWays: Ring[] = [];
  const innerWays: Ring[] = [];
  for (const m of rel.members ?? []) {
    if (m.type !== 'way') continue;
    const pts = ptsFrom(m.geometry, precision);
    if (!pts) continue;
    if (m.role === 'inner') innerWays.push(pts);
    else outerWays.push(pts);
  }
  const outers = assembleRings(outerWays).filter((r) => r.length >= 4);
  const inners = assembleRings(innerWays).filter((r) => r.length >= 4);
  if (outers.length === 0) return null;
  if (outers.length === 1) {
    const coordinates: Ring[] = [outers[0], ...inners];
    return { type: 'Polygon', coordinates };
  }
  // múltiplos outers → MultiPolygon (inners atribuídos ao primeiro por simplicidade)
  const polygons = outers.map((o, idx) => (idx === 0 ? [o, ...inners] : [o]));
  return { type: 'MultiPolygon', coordinates: polygons };
}

function geomFromWay(el: OverpassElement, precision: number): { type: 'Polygon'; coordinates: any } | null {
  const pts = ptsFrom(el.geometry, precision);
  if (!pts) return null;
  const ring = closeRing(pts);
  if (ring.length < 4) return null;
  return { type: 'Polygon', coordinates: [ring] };
}

// ─── Validação WGS84 / bbox ───────────────────────────────────────────────────

function ringWithinWgs84(ring: Ring): boolean {
  return ring.every(([lon, lat]) =>
    Number.isFinite(lon) && Number.isFinite(lat) &&
    lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90);
}

function geometryWgs84Valid(geom: { type: string; coordinates: any }): boolean {
  if (geom.type === 'Polygon') {
    return Array.isArray(geom.coordinates) && geom.coordinates.length > 0 &&
      geom.coordinates.every((r: Ring) => Array.isArray(r) && r.length >= 4 && ringWithinWgs84(r));
  }
  if (geom.type === 'MultiPolygon') {
    return Array.isArray(geom.coordinates) && geom.coordinates.length > 0 &&
      geom.coordinates.every((poly: Ring[]) => poly.length > 0 && poly.every((r) => r.length >= 4 && ringWithinWgs84(r)));
  }
  return false;
}

function firstPoint(geom: { type: string; coordinates: any }): number[] | null {
  if (geom.type === 'Polygon') return geom.coordinates?.[0]?.[0] ?? null;
  if (geom.type === 'MultiPolygon') return geom.coordinates?.[0]?.[0]?.[0] ?? null;
  return null;
}

function withinBBox(pt: number[] | null, bbox: CityBoundingBox): boolean {
  if (!pt) return false;
  const [lon, lat] = pt;
  return lon >= bbox.minLon && lon <= bbox.maxLon && lat >= bbox.minLat && lat <= bbox.maxLat;
}

function pickName(tags: Record<string, string> | undefined): string | null {
  const n = tags?.name ?? tags?.['name:pt'] ?? null;
  const t = (n ?? '').trim();
  return t.length > 0 ? t : null;
}

// ─── Normalização principal ───────────────────────────────────────────────────

export function normalizeOverpassToGeoJSON(
  response: OverpassResponse,
  opts: OsmNormalizeOptions,
): OsmNormalizeResult {
  const precision = opts.precision ?? 7;
  const areaType = opts.areaType ?? 'BAIRRO_OFICIAL';
  const elements = Array.isArray(response?.elements) ? response.elements : [];

  const features: NeighborhoodFeature[] = [];
  const osmIds: string[] = [];
  const seenNames = new Set<string>();
  let invalid = 0;
  let duplicates = 0;
  let outOfBBox = 0;

  for (const el of elements) {
    const name = pickName(el.tags);
    // Só bairros: place suburb/neighbourhood/quarter OU admin_level 10. Distritos (9) e nós ficam de fora.
    const place = el.tags?.place;
    const adminLevel = el.tags?.admin_level;
    const isBairro = place === 'suburb' || place === 'neighbourhood' || place === 'quarter' || adminLevel === '10';
    if (!name || !isBairro) { continue; }

    let geom: { type: 'Polygon' | 'MultiPolygon'; coordinates: any } | null = null;
    if (el.type === 'relation') geom = geomFromRelation(el, precision);
    else if (el.type === 'way') geom = geomFromWay(el, precision);

    if (!geom || !geometryWgs84Valid(geom)) { invalid++; continue; }

    const key = normalizeNeighborhoodName(name);
    if (seenNames.has(key)) { duplicates++; continue; }

    if (opts.bbox && !withinBBox(firstPoint(geom), opts.bbox)) { outOfBBox++; continue; }

    seenNames.add(key);
    osmIds.push(`${el.type}/${el.id}`);
    features.push({
      type: 'Feature',
      properties: {
        name,
        city: opts.expectedCity,
        uf: opts.expectedUf ?? null,
        area_type: areaType,
        osm_type: el.type,
        osm_id: el.id,
      },
      geometry: geom,
    });
  }

  const fc: NeighborhoodFeatureCollection = {
    type: 'FeatureCollection',
    name: `${opts.expectedCity}_bairros`,
    features,
  };

  return {
    featureCollection: fc,
    stats: {
      total: features.length + invalid + duplicates + outOfBBox,
      valid: features.length,
      invalid,
      duplicates,
      outOfBBox,
    },
    osmIds,
    computedBBox: computeBoundingBox(fc),
  };
}

/**
 * Monta a query Overpass genérica para bairros de uma cidade/UF.
 * Não é hardcoded por cidade — usa o nome recebido.
 */
export function buildOverpassQuery(city: string): string {
  const safe = city.replace(/"/g, '\\"');
  return [
    '[out:json][timeout:180];',
    `rel["name"="${safe}"]["admin_level"="8"]["boundary"="administrative"];`,
    'map_to_area->.c;',
    '(',
    '  way["place"~"suburb|neighbourhood|quarter"](area.c);',
    '  relation["place"~"suburb|neighbourhood|quarter"](area.c);',
    '  relation["boundary"="administrative"]["admin_level"~"9|10"](area.c);',
    ');',
    'out geom;',
  ].join('\n');
}
