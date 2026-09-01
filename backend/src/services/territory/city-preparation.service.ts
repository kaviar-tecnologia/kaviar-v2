/**
 * City Preparation — CAMADA DE SERVIÇO (com DB).
 *
 * Reutiliza estruturas existentes (neighborhoods, neighborhood_geofences,
 * operational_territories, territory_manager_assignments) para:
 *   1. montar o plano dry-run de preparação de uma cidade;
 *   2. executar a importação idempotente após confirmação do Super Admin.
 *
 * Design:
 *  - O cliente Prisma é injetado (default = singleton), permitindo testes com mock.
 *  - A lógica pura (validação/plano) vive em city-preparation.core.ts.
 *  - A execução é idempotente: usa unique (name, city) para bairros e
 *    unique (neighborhood_id) para geofences. Reexecutar não duplica.
 *  - ISOLAMENTO ENTRE CIDADES: todas as leituras/escritas de bairros são
 *    filtradas por `city`. Bairros/territórios de outras cidades nunca são
 *    lidos, alterados ou removidos.
 *  - NÃO ativa território nem perfis; NÃO altera status/modalidades.
 */
import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { prisma as defaultPrisma } from '../../lib/prisma';
import {
  validateNeighborhoodGeoJSON,
  buildCityPreparationPlan,
  normalizeNeighborhoodName,
  CARIACICA_BBOX,
  type CityBoundingBox,
  type CityPreparationPlan,
  type NeighborhoodFeatureCollection,
  type ParsedNeighborhood,
  type TerritoryInfo,
  type ManagerInfo,
  type ExistingNeighborhood,
} from './city-preparation.core';

export type PrismaLike = any;

export interface PrepareCityParams {
  /** Território alvo (já existente). Usado para resolver cidade/UF e vínculo. */
  territoryId: string;
  /** Caminho do arquivo GeoJSON. Alternativamente, forneça `geojson`. */
  geojsonPath?: string;
  /** GeoJSON já carregado (tem precedência sobre geojsonPath). */
  geojson?: NeighborhoodFeatureCollection;
  /** Cidade esperada. Default = territory.city_name || territory.name. */
  city?: string;
  /** Bounding box para checagem geográfica. Default = Cariacica. */
  bbox?: CityBoundingBox | null;
  prisma?: PrismaLike;
}

// ─── Leitura de contexto (território, gestor, bairros existentes) ────────────

export async function loadTerritory(prisma: PrismaLike, territoryId: string): Promise<TerritoryInfo> {
  const t = await prisma.operational_territories.findUnique({ where: { id: territoryId } });
  if (!t) {
    return {
      found: false, id: null, name: null, level: null, status: null,
      uf: null, cityName: null, regulatoryStatus: null, coverageStatus: null,
    };
  }
  return {
    found: true,
    id: t.id,
    name: t.name,
    level: t.level,
    status: t.status,
    uf: t.uf ?? null,
    cityName: t.city_name ?? null,
    regulatoryStatus: t.regulatory_status ?? null,
    coverageStatus: t.coverage_status ?? null,
  };
}

export async function loadManager(prisma: PrismaLike, territoryId: string): Promise<ManagerInfo> {
  const assignments = await prisma.territory_manager_assignments.findMany({
    where: { territory_id: territoryId, status: 'active' },
    include: { admin: { select: { name: true, is_active: true } } },
  });
  const activeNames: string[] = assignments
    .filter((a: any) => a.admin?.is_active)
    .map((a: any) => a.admin?.name)
    .filter(Boolean);
  return {
    found: activeNames.length > 0,
    count: activeNames.length,
    names: activeNames,
  };
}

export async function loadExistingNeighborhoods(
  prisma: PrismaLike,
  city: string,
): Promise<ExistingNeighborhood[]> {
  // Filtro por city garante isolamento entre cidades.
  const rows = await prisma.neighborhoods.findMany({
    where: { city },
    select: {
      id: true,
      name: true,
      territory_id: true,
      neighborhood_geofences: { select: { id: true } },
    },
  });
  return rows.map((r: any) => ({
    id: r.id,
    name: r.name,
    territory_id: r.territory_id ?? null,
    hasGeofence: r.neighborhood_geofences != null,
  }));
}

function resolveCity(params: PrepareCityParams, territory: TerritoryInfo): string {
  return params.city || territory.cityName || territory.name || '';
}

function loadGeoJSON(params: PrepareCityParams): NeighborhoodFeatureCollection {
  if (params.geojson) return params.geojson;
  if (!params.geojsonPath) {
    throw new Error('É necessário informar geojson ou geojsonPath');
  }
  if (!fs.existsSync(params.geojsonPath)) {
    throw new Error(`Arquivo GeoJSON não encontrado: ${params.geojsonPath}`);
  }
  return JSON.parse(fs.readFileSync(params.geojsonPath, 'utf-8'));
}

// ─── Dry-run ─────────────────────────────────────────────────────────────────

export interface DryRunResult {
  plan: CityPreparationPlan;
  /** Bairros válidos parseados (reusados na execução, evita reparse). */
  parsed: ParsedNeighborhood[];
}

export async function dryRunPrepareCity(params: PrepareCityParams): Promise<DryRunResult> {
  const prisma = params.prisma ?? defaultPrisma;
  const territory = await loadTerritory(prisma, params.territoryId);
  const city = resolveCity(params, territory);
  const uf = territory.uf ?? null;

  const fc = loadGeoJSON(params);
  const validation = validateNeighborhoodGeoJSON(fc, {
    expectedCity: city || undefined,
    expectedUf: uf,
    bbox: params.bbox === undefined ? CARIACICA_BBOX : params.bbox,
    defaultAreaType: 'BAIRRO_OFICIAL',
  });

  const manager = await loadManager(prisma, params.territoryId);
  const existing = city ? await loadExistingNeighborhoods(prisma, city) : [];

  const plan = buildCityPreparationPlan({ city, uf, validation, territory, manager, existing });
  return { plan, parsed: validation.valid };
}

// ─── Escrita idempotente de um bairro + geofence ─────────────────────────────

function geometryToGeoJSONString(nb: ParsedNeighborhood): string {
  return JSON.stringify({ type: nb.geometryType, coordinates: nb.coordinates });
}

/**
 * Upsert idempotente de um bairro e sua geofence.
 * - neighborhoods: unique (name, city). Cria ou atualiza; vincula territory_id.
 * - neighborhood_geofences: unique (neighborhood_id). Escreve coordinates(Json),
 *   geofence_type, source, source_url E geom (PostGIS via query PARAMETRIZADA).
 *
 * NÃO usa string interpolation em SQL (evita SQL injection do importador antigo).
 */
export async function upsertNeighborhoodWithGeofence(
  prisma: PrismaLike,
  nb: ParsedNeighborhood,
  territoryId: string | null,
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.neighborhoods.findFirst({
    where: { name: nb.name, city: nb.city },
    select: { id: true },
  });

  let neighborhoodId: string;
  let created = false;

  if (existing) {
    neighborhoodId = existing.id;
    await prisma.neighborhoods.update({
      where: { id: neighborhoodId },
      data: {
        area_type: nb.areaType,
        territory_id: territoryId ?? undefined,
        center_lat: nb.centerLat ?? undefined,
        center_lng: nb.centerLng ?? undefined,
        updated_at: new Date(),
      },
    });
  } else {
    neighborhoodId = randomUUID();
    created = true;
    await prisma.neighborhoods.create({
      data: {
        id: neighborhoodId,
        name: nb.name,
        city: nb.city,
        area_type: nb.areaType,
        territory_id: territoryId ?? undefined,
        center_lat: nb.centerLat ?? undefined,
        center_lng: nb.centerLng ?? undefined,
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    });
  }

  // Geofence — grava colunas NOT NULL (geofence_type, coordinates) + geom PostGIS.
  const geojsonStr = geometryToGeoJSONString(nb);
  const geofenceId = randomUUID();

  // $executeRaw com parâmetros posicionais (NÃO interpolação de string).
  // ST_GeomFromGeoJSON aceita a geometria; ST_SetSRID fixa SRID 4326.
  // ST_Multi normaliza para o tipo geometry(MultiPolygon)/geometry genérico.
  await prisma.$executeRaw`
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

  return { id: neighborhoodId, created };
}

// ─── Execução confirmada ──────────────────────────────────────────────────────

export interface ExecuteResult {
  city: string;
  territoryId: string;
  created: number;
  updated: number;
  geofencesWritten: number;
  linkedToTerritory: number;
  errors: Array<{ name: string; error: string }>;
}

/**
 * Executa a preparação após confirmação. Idempotente.
 * Requer que o plano possa prosseguir (território encontrado, bairros válidos,
 * sem duplicidade impeditiva). NÃO altera status do território nem modalidades.
 */
export async function executePrepareCity(params: PrepareCityParams): Promise<ExecuteResult> {
  const prisma = params.prisma ?? defaultPrisma;
  const { plan, parsed } = await dryRunPrepareCity(params);

  if (!plan.canProceed || !plan.territory.id) {
    throw new Error(
      `Preparação não pode prosseguir: ${plan.risks.join(' | ') || 'condições não atendidas'}`,
    );
  }

  const territoryId = plan.territory.id;
  const result: ExecuteResult = {
    city: plan.city,
    territoryId,
    created: 0,
    updated: 0,
    geofencesWritten: 0,
    linkedToTerritory: 0,
    errors: [],
  };

  const existing = await loadExistingNeighborhoods(prisma, plan.city);
  const existingByName = new Map<string, ExistingNeighborhood>();
  for (const n of existing) existingByName.set(normalizeNeighborhoodName(n.name), n);

  for (const nb of parsed) {
    try {
      const key = normalizeNeighborhoodName(nb.name);
      const before = existingByName.get(key);
      const wasLinked = before?.territory_id === territoryId;

      const { created } = await upsertNeighborhoodWithGeofence(prisma, nb, territoryId);
      if (created) result.created++;
      else result.updated++;
      result.geofencesWritten++;
      if (!wasLinked) result.linkedToTerritory++;
    } catch (err: any) {
      result.errors.push({ name: nb.name, error: err?.message ?? String(err) });
    }
  }

  return result;
}
