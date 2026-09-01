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

/**
 * Une segmentos (ways) por extremidades coincidentes. NÃO fecha artificialmente:
 * um anel só é aceito quando o primeiro e o último ponto REALMENTE coincidem
 * após a união. Se sobrar um encadeamento que não fecha, `hadUnclosed=true`.
 */
function assembleRings(ways: Ring[]): { closed: Ring[]; hadUnclosed: boolean } {
  const segs: Ring[] = ways.filter((w) => Array.isArray(w) && w.length >= 2).map((w) => [...w]);
  const closed: Ring[] = [];
  let hadUnclosed = false;
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
    // Aceita SOMENTE se fechou pelas próprias extremidades. Nunca inventa fechamento.
    if (cur.length >= 4 && eq(cur[0], cur[cur.length - 1])) {
      closed.push(cur);
    } else {
      hadUnclosed = true;
    }
  }
  return { closed, hadUnclosed };
}

function ptsFrom(geom: OverpassGeomPoint[] | undefined, precision: number): Ring | null {
  if (!Array.isArray(geom) || geom.length === 0) return null;
  return geom.map((p) => [round(p.lon, precision), round(p.lat, precision)]);
}

/** Ray-casting: ponto [lon,lat] dentro do anel? */
function pointInRing(pt: number[], ring: Ring): boolean {
  const [x, y] = pt;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0], yi = ring[i][1];
    const xj = ring[j][0], yj = ring[j][1];
    const intersect = (yi > y) !== (yj > y) &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-15) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Área assinada (shoelace) — magnitude para escolher o menor outer que contém. */
function ringAbsArea(ring: Ring): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a / 2);
}

/** Ponto representativo do anel (primeiro vértice). */
function repPoint(ring: Ring): number[] {
  return ring[0];
}

/** Atribui cada inner ao outer que o contém (menor área em caso de aninhamento).
 *  Retorna null se algum inner não estiver contido em nenhum outer. */
function assignInnersToOuters(outers: Ring[], inners: Ring[]): Ring[][] | null {
  const polygons: Ring[][] = outers.map((o) => [o]);
  for (const inner of inners) {
    const p = repPoint(inner);
    let bestIdx = -1;
    let bestArea = Infinity;
    for (let i = 0; i < outers.length; i++) {
      if (pointInRing(p, outers[i])) {
        const area = ringAbsArea(outers[i]);
        if (area < bestArea) { bestArea = area; bestIdx = i; }
      }
    }
    if (bestIdx < 0) return null; // inner órfão → não suportado
    polygons[bestIdx].push(inner);
  }
  return polygons;
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
  const outerAsm = assembleRings(outerWays);
  const innerAsm = assembleRings(innerWays);
  // Segmentos que não fecharam por conta própria → relation incompleta → rejeita.
  if (outerAsm.hadUnclosed || innerAsm.hadUnclosed) return null;

  const outers = outerAsm.closed;
  const inners = innerAsm.closed;
  if (outers.length === 0) return null;

  // Associação inner→outer por CONTENÇÃO em TODOS os casos (inclui 1 outer).
  // Inner que não pertence a nenhum outer → geometria não suportada.
  const polygons = assignInnersToOuters(outers, inners);
  if (polygons === null) return null;

  if (polygons.length === 1) {
    return { type: 'Polygon', coordinates: polygons[0] };
  }
  return { type: 'MultiPolygon', coordinates: polygons };
}

function geomFromWay(el: OverpassElement, precision: number): { type: 'Polygon'; coordinates: any } | null {
  const pts = ptsFrom(el.geometry, precision);
  if (!pts || pts.length < 4) return null;
  // Aceita SOMENTE way já fechado (primeiro == último). Não fecha artificialmente.
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return null;
  return { type: 'Polygon', coordinates: [pts] };
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

function eachCoord(geom: { type: string; coordinates: any }, cb: (lon: number, lat: number) => void): void {
  if (geom.type === 'Polygon') {
    for (const ring of geom.coordinates as Ring[]) for (const [lon, lat] of ring) cb(lon, lat);
  } else if (geom.type === 'MultiPolygon') {
    for (const poly of geom.coordinates as Ring[][]) for (const ring of poly) for (const [lon, lat] of ring) cb(lon, lat);
  }
}

/** Envelope (bbox) da geometria inteira, calculado sobre TODOS os pontos. */
function geometryEnvelope(geom: { type: string; coordinates: any }): CityBoundingBox | null {
  let minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  let found = false;
  eachCoord(geom, (lon, lat) => {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
    found = true;
  });
  return found ? { minLon, maxLon, minLat, maxLat } : null;
}

/**
 * Regra de compatibilidade: o ENVELOPE INTEIRO da geometria deve estar dentro
 * do bbox esperado da cidade. Rejeita geometria cuja extensão sai da região,
 * mesmo que o primeiro vértice esteja dentro.
 */
function envelopeWithinBBox(env: CityBoundingBox | null, bbox: CityBoundingBox): boolean {
  if (!env) return false;
  return env.minLon >= bbox.minLon && env.maxLon <= bbox.maxLon &&
         env.minLat >= bbox.minLat && env.maxLat <= bbox.maxLat;
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

    if (opts.bbox && !envelopeWithinBBox(geometryEnvelope(geom), opts.bbox)) { outOfBBox++; continue; }

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

/** Nome oficial do estado por UF (genérico; não é hardcode de cidade). */
export const UF_TO_STATE_NAME: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia',
  CE: 'Ceará', DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás',
  MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí',
  RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul',
  RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
};

/**
 * Monta a query Overpass genérica para bairros de uma cidade, opcionalmente
 * restringindo ao ESTADO (UF) correspondente para reduzir ambiguidade de
 * municípios homônimos. Sem hardcode por cidade.
 *
 * Aceita CityRef { city, uf } ou (city, uf).
 */
export function buildOverpassQuery(ref: { city: string; uf?: string | null } | string, uf?: string | null): string {
  const city = typeof ref === 'string' ? ref : ref.city;
  const ufCode = (typeof ref === 'string' ? uf : ref.uf) ?? null;
  const safeCity = city.replace(/"/g, '\\"');
  const stateName = ufCode ? UF_TO_STATE_NAME[String(ufCode).toUpperCase()] : null;

  const lines: string[] = ['[out:json][timeout:180];'];

  if (stateName) {
    const safeState = stateName.replace(/"/g, '\\"');
    // Resolve o município DENTRO da área do estado (admin_level 4),
    // desambiguando homônimos de outras UFs.
    lines.push(
      `rel["name"="${safeState}"]["admin_level"="4"]["boundary"="administrative"];`,
      'map_to_area->.st;',
      `rel["name"="${safeCity}"]["admin_level"="8"]["boundary"="administrative"](area.st);`,
      'map_to_area->.c;',
    );
  } else {
    // Sem UF: resolve só pelo nome do município (pode haver ambiguidade).
    lines.push(
      `rel["name"="${safeCity}"]["admin_level"="8"]["boundary"="administrative"];`,
      'map_to_area->.c;',
    );
  }

  lines.push(
    '(',
    '  way["place"~"suburb|neighbourhood|quarter"](area.c);',
    '  relation["place"~"suburb|neighbourhood|quarter"](area.c);',
    '  relation["boundary"="administrative"]["admin_level"~"9|10"](area.c);',
    ');',
    'out geom;',
  );
  return lines.join('\n');
}
