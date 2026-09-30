/**
 * Resolve um bounding box (bbox) MUNICIPAL confiável para um território,
 * de forma GENÉRICA (sem hardcode por cidade).
 *
 * PRIORIDADE (por segurança):
 *   1) LIMITE MUNICIPAL do OpenStreetMap (relação admin_level=8, cidade+UF) —
 *      proteção PRIMÁRIA. É o limite do município inteiro.
 *   2) Fallback: envelope dos geofences JÁ EXISTENTES daquele TERRITÓRIO
 *      (isolado por neighborhoods.territory_id). Isto representa apenas a
 *      COBERTURA EXISTENTE — não necessariamente o limite municipal — e serve
 *      só quando o limite municipal confiável não está disponível.
 *
 * Se nada confiável → bbox=null (chamador recusa com MUNICIPAL_BBOX_UNAVAILABLE).
 * Se a consulta municipal for AMBÍGUA (múltiplas relações plausíveis) →
 * code='MUNICIPAL_BBOX_AMBIGUOUS' (não une silenciosamente).
 *
 * Segurança da entrada externa (OSM): respeita AbortSignal, limita bytes e nº de
 * elementos, valida WGS84 e min<max, rejeita valores absurdos.
 * Somente LEITURA. Não grava nada.
 */
import type { CityBoundingBox } from './city-preparation.core';
import { OVERPASS_MIRRORS } from './providers/openstreetmap-provider';
import { UF_TO_STATE_NAME } from './osm-geojson-normalizer';

export type PrismaLike = any;

export type MunicipalBBoxCode =
  | 'OK'
  | 'MUNICIPAL_BBOX_UNAVAILABLE'
  | 'MUNICIPAL_BBOX_AMBIGUOUS';

export interface MunicipalBBoxResult {
  bbox: CityBoundingBox | null;
  source: 'osm_municipality' | 'existing_coverage' | 'none';
  code: MunicipalBBoxCode;
  details?: string;
  sourceUrl?: string;
}

const ALLOWED_HOSTS = new Set(OVERPASS_MIRRORS.map((u) => new URL(u).host));
const MAX_BOUNDS_BYTES = 2 * 1024 * 1024;   // 2 MB (resposta 'out bb;' é pequena)
const MAX_BOUNDS_ELEMENTS = 200;            // limite de elementos retornados
// Extensão máxima plausível de um município (graus). Rejeita bounds absurdos.
const MAX_SPAN_DEG = 3.0;
const BBOX_MIRROR_TIMEOUT_MS = 20_000;
const BBOX_MAX_ATTEMPTS_PER_MIRROR = 2;
const BBOX_RETRY_BACKOFF_MS = 500;

async function bboxRetrySleep(ms: number, signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return false;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      cleanup();
      resolve(true);
    }, ms);
    const onAbort = () => {
      cleanup();
      resolve(false);
    };
    const cleanup = () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    // Fecha a janela entre a checagem inicial e o registro do listener.
    if (signal?.aborted) onAbort();
  });
}

export function expand(bbox: CityBoundingBox, marginDeg: number): CityBoundingBox {
  return {
    minLon: bbox.minLon - marginDeg, maxLon: bbox.maxLon + marginDeg,
    minLat: bbox.minLat - marginDeg, maxLat: bbox.maxLat + marginDeg,
  };
}

function isValidBBox(b: CityBoundingBox): boolean {
  const vals = [b.minLon, b.maxLon, b.minLat, b.maxLat];
  if (!vals.every(Number.isFinite)) return false;
  if (b.minLon < -180 || b.maxLon > 180 || b.minLat < -90 || b.maxLat > 90) return false;
  if (!(b.minLon < b.maxLon) || !(b.minLat < b.maxLat)) return false; // min < max
  if ((b.maxLon - b.minLon) > MAX_SPAN_DEG || (b.maxLat - b.minLat) > MAX_SPAN_DEG) return false; // absurdo
  return true;
}

/** 2) Fallback: envelope dos geofences do TERRITÓRIO (isolado por territory_id). */
export async function bboxFromExistingCoverage(
  prisma: PrismaLike,
  territoryId: string,
): Promise<CityBoundingBox | null> {
  const rows: any[] = await prisma.$queryRaw`
    SELECT
      ST_XMin(ext) AS min_lon, ST_YMin(ext) AS min_lat,
      ST_XMax(ext) AS max_lon, ST_YMax(ext) AS max_lat
    FROM (
      SELECT ST_Extent(g.geom) AS ext
      FROM neighborhood_geofences g
      JOIN neighborhoods n ON n.id = g.neighborhood_id
      WHERE n.territory_id = ${territoryId} AND g.geom IS NOT NULL
    ) e
  `;
  const r = rows?.[0];
  if (!r || r.min_lon == null) return null;
  const bbox: CityBoundingBox = {
    minLon: Number(r.min_lon), maxLon: Number(r.max_lon),
    minLat: Number(r.min_lat), maxLat: Number(r.max_lat),
  };
  return isValidBBox(bbox) ? bbox : null;
}

/** Query Overpass que retorna os bounds das relações municipais (admin_level=8). */
export function buildMunicipalityBoundsQuery(city: string, uf?: string | null): string {
  const safeCity = city.replace(/"/g, '\\"');
  const stateName = uf ? UF_TO_STATE_NAME[String(uf).toUpperCase()] : null;
  const lines = ['[out:json][timeout:60];'];
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
  lines.push('out bb;'); // apenas bounding boxes
  return lines.join('\n');
}

/** 1) Limite municipal via OSM (admin_level=8), com endurecimento de segurança. */
export async function bboxFromOsmMunicipality(
  city: string,
  uf: string | null,
  opts: {
    fetchImpl?: typeof fetch;
    signal?: AbortSignal;
    mirrors?: readonly string[];
    mirrorTimeoutMs?: number;
    maxAttemptsPerMirror?: number;
    retryBackoffMs?: number;
  } = {},
): Promise<{ bbox: CityBoundingBox | null; ambiguous: boolean; sourceUrl?: string }> {
  const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as typeof fetch);
  if (typeof fetchImpl !== 'function') return { bbox: null, ambiguous: false };
  const mirrors = (opts.mirrors ?? OVERPASS_MIRRORS).filter((u) => ALLOWED_HOSTS.has(new URL(u).host));
  const query = buildMunicipalityBoundsQuery(city, uf);
  const mirrorTimeoutMs = opts.mirrorTimeoutMs ?? BBOX_MIRROR_TIMEOUT_MS;

  const maxAttempts = opts.maxAttemptsPerMirror ?? BBOX_MAX_ATTEMPTS_PER_MIRROR;
  const retryBackoffMs = opts.retryBackoffMs ?? BBOX_RETRY_BACKOFF_MS;

  for (const url of mirrors) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (opts.signal?.aborted) return { bbox: null, ambiguous: false };

      const local = new AbortController();
      const forwardAbort = () => local.abort();
      opts.signal?.addEventListener('abort', forwardAbort, { once: true });
      if (opts.signal?.aborted) local.abort();
      const timer = setTimeout(() => local.abort(), mirrorTimeoutMs);

      let retryTransient = false;

      try {
        const res: any = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
          body: `data=${encodeURIComponent(query)}`,
          signal: local.signal,
          redirect: 'manual',
        } as any);

        const status = res.status as number;

        if (res.type === 'opaqueredirect' || (status >= 300 && status < 400)) break;

        if (status < 200 || status >= 300) {
          retryTransient = status === 429 || status >= 500;
        } else {
          const ct = (res.headers?.get?.('content-type') || '').toLowerCase();
          if (!ct.includes('json') && !ct.includes('osm3s')) break;

          const declaredLen = Number(res.headers?.get?.('content-length') || 0);
          if (declaredLen && declaredLen > MAX_BOUNDS_BYTES) break;

          const text: string = await res.text();
          if (Buffer.byteLength(text, 'utf8') > MAX_BOUNDS_BYTES) break;

          let parsed: any;
          try { parsed = JSON.parse(text); } catch { break; }

          const els = Array.isArray(parsed?.elements) ? parsed.elements : [];
          if (els.length > MAX_BOUNDS_ELEMENTS) break;

          const valid: CityBoundingBox[] = [];
          for (const el of els) {
            const b = el.bounds;
            if (!b) continue;
            const cand: CityBoundingBox = {
              minLon: b.minlon, maxLon: b.maxlon,
              minLat: b.minlat, maxLat: b.maxlat,
            };
            if (isValidBBox(cand)) valid.push(cand);
          }

          if (valid.length === 0) break;
          if (valid.length > 1) return { bbox: null, ambiguous: true };

          return { bbox: valid[0], ambiguous: false, sourceUrl: url };
        }
      } catch {
        if (opts.signal?.aborted) return { bbox: null, ambiguous: false };
        // Timeout local / erro de rede: falha transitória.
        retryTransient = true;
      } finally {
        clearTimeout(timer);
        opts.signal?.removeEventListener('abort', forwardAbort);
      }

      if (!retryTransient || attempt >= maxAttempts) break;

      const proceed = await bboxRetrySleep(retryBackoffMs, opts.signal);
      if (!proceed) return { bbox: null, ambiguous: false };
    }
  }
  return { bbox: null, ambiguous: false };
}

export async function resolveMunicipalBBox(
  prisma: PrismaLike,
  city: string,
  uf: string | null,
  opts: { territoryId?: string; fetchImpl?: typeof fetch; signal?: AbortSignal; mirrors?: readonly string[]; marginDeg?: number } = {},
): Promise<MunicipalBBoxResult> {
  const margin = opts.marginDeg ?? 0.05;

  // 1) PRIMÁRIO: limite municipal OSM.
  const osm = await bboxFromOsmMunicipality(city, uf, opts);
  if (opts.signal?.aborted) return { bbox: null, source: 'none', code: 'MUNICIPAL_BBOX_UNAVAILABLE', details: 'cancelado' };
  if (osm.ambiguous) return { bbox: null, source: 'none', code: 'MUNICIPAL_BBOX_AMBIGUOUS' };
  if (osm.bbox) return { bbox: expand(osm.bbox, margin), source: 'osm_municipality', code: 'OK', sourceUrl: osm.sourceUrl };

  // 2) FALLBACK: cobertura existente (isolada por território).
  if (opts.territoryId) {
    try {
      const cov = await bboxFromExistingCoverage(prisma, opts.territoryId);
      if (cov) {
        // Cobertura existente NÃO é limite municipal; não expandimos além da margem.
        return { bbox: expand(cov, margin), source: 'existing_coverage', code: 'OK', details: 'cobertura existente (não é limite municipal)' };
      }
    } catch {
      // segue; sem mascarar — apenas indisponível.
    }
  }

  return { bbox: null, source: 'none', code: 'MUNICIPAL_BBOX_UNAVAILABLE' };
}
