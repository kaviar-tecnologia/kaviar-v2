/**
 * Fase 3B — APPLY transacional e idempotente de uma dataset version.
 *
 * Fluxo: PREVIEWED → APPLYING → (escreve neighborhoods/geofences) → APPLIED.
 *
 * Garantias:
 *  - Ownership territorial validado ANTES de qualquer escrita (Fase 3A:
 *    `resolveVersionOwnership` — territory_id primário; legado fail-closed).
 *  - Nenhuma confiança em dados do frontend: o GeoJSON é RELIDO do S3 e
 *    REVALIDADO (estrutura + WGS84 + bbox) a cada apply.
 *  - Concorrência: a transição PREVIEWED→APPLYING é um COMPARE-AND-SET feito
 *    DENTRO da transação. Se outra operação já venceu a corrida, `count !== 1`
 *    e abortamos SEM escrever nada. Dois applies simultâneos: só um vence.
 *  - Transação única: CAS→APPLYING, escrita de bairros/geofences, CAS→APPLIED +
 *    applied_at, tudo na mesma tx. Qualquer falha => ROLLBACK integral (a
 *    própria transição APPLYING é revertida — sem compensação externa). A versão
 *    nunca fica APPLIED nem presa em APPLYING; nenhum bairro/geofence parcial
 *    permanece.
 *  - Idempotência: identidade por (name, city) para bairro e (neighborhood_id)
 *    para geofence. Reexecutar não duplica. NÃO apaga bairros existentes; NÃO
 *    faz destructive sync.
 *  - Geometria: só Polygon/MultiPolygon já validados; PostGIS SRID 4326;
 *    ST_IsValid obrigatório; rejeita inválida/vazia; NÃO usa ST_MakeValid.
 *  - Segurança territorial: nunca escreve em outro territory_id. NÃO altera
 *    gestores, status regulatório, ativação de território nem modalidades.
 */
import { randomUUID } from 'crypto';
import { prisma as defaultPrisma } from '../../lib/prisma';
import {
  getDatasetVersion,
  loadNormalizedFromS3,
  type PrismaLike,
  type S3Like,
  type DatasetVersionRow,
} from './territorial-dataset-store';
import { resolveVersionOwnership } from './territorial-dataset-review.service';
import { resolveMunicipalBBox } from './municipal-bbox-resolver';
import {
  validateNeighborhoodGeoJSON,
  normalizeNeighborhoodName,
  type ParsedNeighborhood,
  type NeighborhoodFeatureCollection,
  type CityBoundingBox,
} from './city-preparation.core';

export type ApplyCode =
  | 'OK'
  | 'TERRITORY_NOT_FOUND'
  | 'CITY_UF_MISSING'
  | 'DATASET_NOT_FOUND'
  | 'DATASET_TERRITORY_AMBIGUOUS'
  | 'DATASET_TERRITORY_MISMATCH'
  | 'INVALID_STATUS_TRANSITION'
  | 'NORMALIZED_KEY_MISSING'
  | 'CHECKSUM_MISMATCH'
  | 'INVALID_GEOJSON'
  | 'INVALID_GEOMETRY'
  | 'MUNICIPAL_BBOX_UNAVAILABLE'
  | 'MUNICIPAL_BBOX_AMBIGUOUS'
  | 'NEIGHBORHOOD_IDENTITY_CONFLICT'
  | 'APPLY_CONFLICT'
  | 'S3_LOAD_FAILED';

export interface ApplyCounters {
  created: number;
  updated: number;
  unchanged: number;
  conflicts: number;
  skipped: number;
  geofencesWritten: number;
}

export interface ApplyResult {
  ok: boolean;
  code: ApplyCode;
  reason?: string;
  versionId?: string;
  territoryId?: string;
  from?: string;
  to?: string;
  counters?: ApplyCounters;
  conflicts?: Array<{ name: string; reason: string }>;
}

export interface ApplyParams {
  territoryId: string;
  versionId: string;
  prisma?: PrismaLike;
  s3?: S3Like;
  /** Injeção para testes: substitui o carregamento do S3. */
  getObject?: (bucket: string, key: string) => Promise<string>;
  /** Limite de bytes ao reler o normalized.geojson. */
  maxNormalizedBytes?: number;
  createdBy?: string | null;
  /**
   * Injeção para testes: resolvedor de bbox municipal. Default = resolveMunicipalBBox
   * (Fase 1). Recebe (prisma, city, uf, {territoryId, signal, fetchImpl}).
   */
  resolveBBox?: typeof resolveMunicipalBBox;
  /** fetch injetável repassado ao resolvedor de bbox municipal (OSM/Overpass). */
  fetchImpl?: typeof fetch;
}

function emptyCounters(): ApplyCounters {
  return { created: 0, updated: 0, unchanged: 0, conflicts: 0, skipped: 0, geofencesWritten: 0 };
}

/** Geometria da feature para os campos coordinates/geom. */
function geometryToGeoJSONString(nb: ParsedNeighborhood): string {
  return JSON.stringify({ type: nb.geometryType, coordinates: nb.coordinates });
}

/**
 * Representação canônica de uma geometria GeoJSON {type,coordinates} para
 * comparação de idempotência. Estável quanto à ordem de chaves. Aceita tanto o
 * objeto completo {type,coordinates} (formato histórico da coluna coordinates)
 * quanto — defensivamente — apenas o array de coordinates. NÃO altera o formato
 * armazenado; só normaliza para comparar.
 */
function canonicalGeo(value: any): string {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'coordinates' in value) {
    return JSON.stringify({ type: value.type ?? null, coordinates: value.coordinates });
  }
  // Valor legado que porventura só tenha o array de coordinates.
  return JSON.stringify({ type: null, coordinates: value });
}

/**
 * Valida a geometria no nível PostGIS DENTRO da transação:
 *  - parse via ST_GeomFromGeoJSON (rejeita malformada);
 *  - SRID fixado em 4326;
 *  - ST_IsValid obrigatório (NÃO corrige com ST_MakeValid nesta fase);
 *  - não vazia (ST_IsEmpty=false);
 *  - dentro do bbox validado do território (envelope), quando fornecido.
 * Lança erro com .code='INVALID_GEOMETRY' se qualquer checagem falhar.
 */
async function assertGeometryValid(
  tx: PrismaLike,
  geojsonStr: string,
  bbox: CityBoundingBox | null,
): Promise<void> {
  // Uma única query retorna as flags. Parâmetro posicional (sem interpolação).
  const rows: any[] = await tx.$queryRaw`
    WITH g AS (
      SELECT ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326) AS geom
    )
    SELECT
      ST_IsValid(geom)                                   AS is_valid,
      ST_IsEmpty(geom)                                   AS is_empty,
      ST_SRID(geom)                                      AS srid,
      GeometryType(geom)                                 AS gtype,
      ST_XMin(geom) AS xmin, ST_XMax(geom) AS xmax,
      ST_YMin(geom) AS ymin, ST_YMax(geom) AS ymax
    FROM g
  `;
  const r = rows?.[0];
  if (!r) {
    const e: any = new Error('Geometria não pôde ser avaliada'); e.code = 'INVALID_GEOMETRY'; throw e;
  }
  if (r.srid !== 4326) {
    const e: any = new Error(`SRID inesperado: ${r.srid}`); e.code = 'INVALID_GEOMETRY'; throw e;
  }
  if (r.is_empty === true) {
    const e: any = new Error('Geometria vazia não é permitida'); e.code = 'INVALID_GEOMETRY'; throw e;
  }
  if (r.is_valid !== true) {
    const e: any = new Error('Geometria inválida (ST_IsValid=false); não será corrigida nesta fase'); e.code = 'INVALID_GEOMETRY'; throw e;
  }
  const gt = String(r.gtype || '').toUpperCase();
  if (gt !== 'POLYGON' && gt !== 'MULTIPOLYGON') {
    const e: any = new Error(`Tipo de geometria não suportado: ${r.gtype}`); e.code = 'INVALID_GEOMETRY'; throw e;
  }
  if (bbox) {
    const within =
      Number(r.xmin) >= bbox.minLon && Number(r.xmax) <= bbox.maxLon &&
      Number(r.ymin) >= bbox.minLat && Number(r.ymax) <= bbox.maxLat;
    if (!within) {
      const e: any = new Error('Geometria fora do bbox validado do território'); e.code = 'INVALID_GEOMETRY'; throw e;
    }
  }
}

/**
 * Upsert idempotente de um bairro + geofence, classificando o resultado.
 * - neighborhoods: unique (name, city). Cria (created) ou atualiza (updated).
 *   Se já existe idêntico (mesmo territory_id, mesma geofence coordinates),
 *   conta como `unchanged`.
 * - CONFLITO: bairro existente pertence a OUTRO territory_id (não-nulo e != alvo).
 *   NÃO sobrescreve o vínculo, NÃO apaga: conta como `conflicts` e pula a escrita.
 * - geofence: unique (neighborhood_id); grava geom PostGIS (SRID 4326) já
 *   validada. NÃO apaga nada.
 * Toda escrita ocorre na tx recebida.
 */
async function applyOneNeighborhood(
  tx: PrismaLike,
  nb: ParsedNeighborhood,
  territoryId: string,
  bbox: CityBoundingBox | null,
  counters: ApplyCounters,
  conflicts: Array<{ name: string; reason: string }>,
): Promise<void> {
  const geojsonStr = geometryToGeoJSONString(nb);

  // Validação PostGIS (lança INVALID_GEOMETRY => rollback integral).
  await assertGeometryValid(tx, geojsonStr, bbox);

  // ── Identidade por NOME NORMALIZADO (não comparação exata). ────────────────
  //  Busca bairros da cidade alvo e compara pelo nome normalizado
  //  (trim + colapsa espaços + lower). Exatamente 1 match → reutiliza;
  //  0 → cria; >1 já existentes no banco → fail-closed (NÃO escolhe
  //  arbitrariamente, NÃO faz dedupe destrutivo).
  const targetKey = normalizeNeighborhoodName(nb.name);
  const cityRows: any[] = await tx.neighborhoods.findMany({
    where: { city: nb.city },
    select: {
      id: true,
      name: true,
      territory_id: true,
      area_type: true,
      neighborhood_geofences: { select: { coordinates: true } },
    },
  });
  const matches = cityRows.filter((r) => normalizeNeighborhoodName(r.name) === targetKey);
  if (matches.length > 1) {
    const e: any = new Error(
      `Identidade ambígua: ${matches.length} bairros existentes normalizam para "${targetKey}" em ${nb.city}`,
    );
    e.code = 'NEIGHBORHOOD_IDENTITY_CONFLICT';
    throw e; // rollback integral — não dedupe automático
  }
  const existing = matches[0] ?? null;

  // CONFLITO: bairro pertence a outro território (não sobrescreve/apaga).
  if (existing && existing.territory_id != null && existing.territory_id !== territoryId) {
    counters.conflicts++;
    conflicts.push({ name: nb.name, reason: `bairro pertence a outro território (${existing.territory_id})` });
    counters.skipped++;
    return;
  }

  let neighborhoodId: string;

  if (existing) {
    neighborhoodId = existing.id;
    // Detecta "unchanged": mesmo território e mesma geometria já gravada.
    // A coluna coordinates guarda o GeoJSON COMPLETO {type,coordinates}
    // (mesmo formato que geometryToGeoJSONString). Comparação canônica.
    const sameTerritory = existing.territory_id === territoryId;
    const currentGeo = existing.neighborhood_geofences?.coordinates != null
      ? canonicalGeo(existing.neighborhood_geofences.coordinates)
      : null;
    const nextGeo = canonicalGeo(JSON.parse(geojsonStr));
    const sameGeo = currentGeo != null && currentGeo === nextGeo;

    if (sameTerritory && sameGeo) {
      counters.unchanged++;
      return; // idempotente: nada a fazer (sem update de bairro, sem geofence)
    }

    await tx.neighborhoods.update({
      where: { id: neighborhoodId },
      data: {
        area_type: nb.areaType,
        territory_id: territoryId,
        center_lat: nb.centerLat ?? undefined,
        center_lng: nb.centerLng ?? undefined,
        updated_at: new Date(),
      },
    });
    counters.updated++;
  } else {
    neighborhoodId = randomUUID();
    await tx.neighborhoods.create({
      data: {
        id: neighborhoodId,
        name: nb.name,
        city: nb.city,
        area_type: nb.areaType,
        territory_id: territoryId,
        center_lat: nb.centerLat ?? undefined,
        center_lng: nb.centerLng ?? undefined,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
    counters.created++;
  }

  // Geofence idempotente (unique neighborhood_id). geom = SRID 4326 já validada.
  const geofenceId = randomUUID();
  await tx.$executeRaw`
    INSERT INTO neighborhood_geofences
      (id, neighborhood_id, geofence_type, coordinates, source, source_url, geom, created_at, updated_at)
    VALUES (
      ${geofenceId},
      ${neighborhoodId},
      ${nb.geometryType},
      ${geojsonStr}::jsonb,
      ${nb.source},
      ${nb.sourceUrl},
      ST_SetSRID(ST_GeomFromGeoJSON(${geojsonStr}), 4326),
      NOW(),
      NOW()
    )
    ON CONFLICT (neighborhood_id) DO UPDATE SET
      geofence_type = EXCLUDED.geofence_type,
      coordinates   = EXCLUDED.coordinates,
      source        = EXCLUDED.source,
      source_url    = EXCLUDED.source_url,
      geom          = EXCLUDED.geom,
      updated_at    = NOW()
  `;
  counters.geofencesWritten++;
}

/**
 * Aplica uma dataset version PREVIEWED, escrevendo bairros/geofences de forma
 * transacional e idempotente. Ver cabeçalho do arquivo para garantias.
 */
export async function applyDatasetVersion(params: ApplyParams): Promise<ApplyResult> {
  const prisma = params.prisma ?? defaultPrisma;

  // ── 1) Ownership territorial ANTES de qualquer escrita (Fase 3A). ──────────
  const own = await resolveVersionOwnership(prisma, params.territoryId, params.versionId);
  if (own.code === 'TERRITORY_NOT_FOUND') return { ok: false, code: 'TERRITORY_NOT_FOUND', reason: 'Território não encontrado' };
  if (own.code === 'CITY_UF_MISSING') return { ok: false, code: 'CITY_UF_MISSING', reason: 'Território sem cidade/UF definidos' };
  if (own.code === 'DATASET_NOT_FOUND') return { ok: false, code: 'DATASET_NOT_FOUND', reason: 'Versão de dataset não encontrada' };
  if (own.code === 'DATASET_TERRITORY_AMBIGUOUS') return { ok: false, code: 'DATASET_TERRITORY_AMBIGUOUS', reason: 'Pertencimento territorial ambíguo (city+UF)' };
  if (own.code === 'DATASET_TERRITORY_MISMATCH' || !own.version || !own.territory) return { ok: false, code: 'DATASET_TERRITORY_MISMATCH', reason: 'Dataset não pertence ao território' };

  const version: DatasetVersionRow = own.version;
  const territory = own.territory;
  const territoryId: string = territory.id;

  // ── 2) Estado: só PREVIEWED pode ser aplicado. ─────────────────────────────
  if (version.status !== 'PREVIEWED') {
    return { ok: false, code: 'INVALID_STATUS_TRANSITION', reason: `Status ${version.status} não permite apply (requer PREVIEWED)`, from: version.status };
  }
  if (!version.s3_normalized_key) {
    return { ok: false, code: 'NORMALIZED_KEY_MISSING', reason: 'Versão sem s3_normalized_key' };
  }

  // ── 3) RELÊ e REVALIDA o normalized do S3 (não confia no frontend). ────────
  let loaded;
  try {
    loaded = await loadNormalizedFromS3(
      version.s3_normalized_key,
      { s3: params.s3, getObject: params.getObject },
      params.maxNormalizedBytes,
    );
  } catch (err: any) {
    return { ok: false, code: err?.code || 'S3_LOAD_FAILED', reason: err?.message || 'Falha ao reler normalized.geojson' };
  }

  // Integridade contra checksum registrado (quando presente).
  if (version.checksum && version.checksum !== loaded.checksum) {
    return { ok: false, code: 'CHECKSUM_MISMATCH', reason: 'Checksum do S3 diverge do registrado — apply bloqueado' };
  }

  const fc: NeighborhoodFeatureCollection = loaded.featureCollection;
  const city = (territory.city_name || territory.name || '').trim();
  const uf = (territory.uf || '').trim() || null;

  // ── 3b) BBOX MUNICIPAL CONFIÁVEL, resolvido ANTES da transação (read-only). ─
  //  NÃO usa o envelope do próprio normalized.geojson (validação circular não
  //  protege contra dataset da cidade errada). Reutiliza a infraestrutura da
  //  Fase 1 (municipal-bbox-resolver): limite OSM admin_level=8 (primário) →
  //  cobertura existente do território (fallback). Ambíguo/indisponível =>
  //  fail-closed, ANTES de qualquer escrita. O bbox fica CONGELADO e é passado
  //  à validação/transação (nenhuma chamada externa longa dentro da tx).
  const resolveBBox = params.resolveBBox ?? resolveMunicipalBBox;
  const bboxRes = await resolveBBox(prisma, city, uf, { territoryId, fetchImpl: params.fetchImpl });
  if (bboxRes.code === 'MUNICIPAL_BBOX_AMBIGUOUS') {
    return { ok: false, code: 'MUNICIPAL_BBOX_AMBIGUOUS', reason: 'Limite municipal ambíguo — apply bloqueado (fail-closed)', versionId: version.id, territoryId };
  }
  if (bboxRes.code !== 'OK' || !bboxRes.bbox) {
    return { ok: false, code: 'MUNICIPAL_BBOX_UNAVAILABLE', reason: 'Limite municipal confiável indisponível — apply bloqueado', versionId: version.id, territoryId };
  }
  const bbox: CityBoundingBox = bboxRes.bbox; // congelado

  // Revalidação estrutural + WGS84 + bbox MUNICIPAL confiável (não circular).
  const validation = validateNeighborhoodGeoJSON(fc, {
    expectedCity: city || undefined,
    expectedUf: uf,
    bbox,
    defaultAreaType: 'BAIRRO_OFICIAL',
  });
  if (!validation.ok || validation.valid.length === 0) {
    const reason = validation.duplicates.length > 0
      ? `GeoJSON com nomes duplicados: ${validation.duplicates.join(', ')}`
      : (validation.invalid[0]?.reason || 'GeoJSON sem bairros válidos');
    return { ok: false, code: 'INVALID_GEOJSON', reason };
  }

  const parsed = validation.valid;
  const counters = emptyCounters();
  const conflicts: Array<{ name: string; reason: string }> = [];

  // ── 4) TRANSAÇÃO: CAS→APPLYING, escrita, CAS→APPLIED. Falha => rollback. ───
  try {
    await prisma.$transaction(async (tx: PrismaLike) => {
      // CAS PREVIEWED→APPLYING DENTRO da tx. Se outra corrida venceu, count!=1
      // => lança APPLY_CONFLICT => rollback (nada escrito, status intocado).
      const toApplying = await tx.territorial_dataset_versions.updateMany({
        where: { id: version.id, status: 'PREVIEWED' },
        data: { status: 'APPLYING' },
      });
      if (toApplying.count !== 1) {
        const e: any = new Error('Concorrência: versão não está mais PREVIEWED'); e.code = 'APPLY_CONFLICT'; throw e;
      }

      // Escrita idempotente de bairros/geofences (todos na mesma tx).
      for (const nb of parsed) {
        // eslint-disable-next-line no-await-in-loop
        await applyOneNeighborhood(tx, nb, territoryId, bbox, counters, conflicts);
      }

      // CAS APPLYING→APPLIED + applied_at, ainda na tx.
      const toApplied = await tx.territorial_dataset_versions.updateMany({
        where: { id: version.id, status: 'APPLYING' },
        data: { status: 'APPLIED', applied_at: new Date() },
      });
      if (toApplied.count !== 1) {
        const e: any = new Error('Falha ao finalizar APPLIED'); e.code = 'APPLY_CONFLICT'; throw e;
      }
    });
  } catch (err: any) {
    const known: ApplyCode[] = ['APPLY_CONFLICT', 'INVALID_GEOMETRY', 'NEIGHBORHOOD_IDENTITY_CONFLICT'];
    const code: ApplyCode = known.includes(err?.code) ? err.code : 'APPLY_CONFLICT';
    const reason = err?.message || 'Falha no apply — rollback integral aplicado';
    return { ok: false, code, reason, versionId: version.id, territoryId, from: 'PREVIEWED' };
  }

  return {
    ok: true,
    code: 'OK',
    versionId: version.id,
    territoryId,
    from: 'PREVIEWED',
    to: 'APPLIED',
    counters,
    conflicts,
  };
}

