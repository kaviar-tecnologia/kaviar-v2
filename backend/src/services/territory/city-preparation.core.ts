/**
 * City Preparation — NÚCLEO PURO (sem DB, sem I/O).
 *
 * Contém a validação de GeoJSON territorial e a construção do plano (dry-run)
 * de preparação de uma cidade. É reutilizado tanto pelo importador de linha de
 * comando quanto pelos endpoints administrativos "Preparar cidade".
 *
 * Nada aqui grava no banco. Todas as funções são determinísticas e testáveis
 * isoladamente (padrão dominante de testes do projeto = função pura).
 */

// ─── Tipos de GeoJSON aceitos ────────────────────────────────────────────────

export type GeoPosition = [number, number]; // [lon, lat] — WGS84 / EPSG:4326
export type PolygonCoords = GeoPosition[][];
export type MultiPolygonCoords = GeoPosition[][][];

export interface NeighborhoodGeometry {
  type: 'Polygon' | 'MultiPolygon';
  coordinates: PolygonCoords | MultiPolygonCoords;
}

export interface NeighborhoodFeature {
  type: 'Feature';
  properties: Record<string, any>;
  geometry: NeighborhoodGeometry | null;
}

export interface NeighborhoodFeatureCollection {
  type: 'FeatureCollection';
  features: NeighborhoodFeature[];
  name?: string;
  crs?: any;
}

// ─── Resultado da validação ──────────────────────────────────────────────────

export interface ParsedNeighborhood {
  name: string;
  city: string;
  uf: string | null;
  areaType: string;
  source: string | null;
  sourceUrl: string | null;
  centerLat: number | null;
  centerLng: number | null;
  /** GeoJSON coordinates (armazenado em neighborhood_geofences.coordinates) */
  coordinates: PolygonCoords | MultiPolygonCoords;
  geometryType: 'Polygon' | 'MultiPolygon';
}

export interface ValidationIssue {
  featureIndex: number;
  name: string | null;
  reason: string;
}

export interface GeoValidationResult {
  ok: boolean;
  valid: ParsedNeighborhood[];
  invalid: ValidationIssue[];
  /** Nomes que aparecem mais de uma vez (após normalização) */
  duplicates: string[];
}

export interface CityBoundingBox {
  minLon: number;
  maxLon: number;
  minLat: number;
  maxLat: number;
}

// Bounding box padrão de Cariacica/ES (com folga). Usado para checagem de
// compatibilidade geográfica; pode ser sobrescrito por cidade.
export const CARIACICA_BBOX: CityBoundingBox = {
  minLon: -40.75,
  maxLon: -40.25,
  minLat: -20.6,
  maxLat: -19.95,
};

/** Normaliza nome de bairro para deduplicação/lookup (trim + colapsa espaços + lower). */
export function normalizeNeighborhoodName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function isFinitePair(p: any): p is GeoPosition {
  return (
    Array.isArray(p) &&
    p.length >= 2 &&
    typeof p[0] === 'number' &&
    typeof p[1] === 'number' &&
    Number.isFinite(p[0]) &&
    Number.isFinite(p[1])
  );
}

function ringIsValid(
  ring: any,
  bbox: CityBoundingBox | null,
): string | null {
  if (!Array.isArray(ring) || ring.length < 4) return 'anel com menos de 4 pontos';
  const first = ring[0];
  const last = ring[ring.length - 1];
  for (const pt of ring) {
    if (!isFinitePair(pt)) return 'ponto inválido (não numérico)';
    const [lon, lat] = pt;
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) {
      return `coordenada fora de WGS84 (lon=${lon}, lat=${lat})`;
    }
    if (bbox && (lon < bbox.minLon || lon > bbox.maxLon || lat < bbox.minLat || lat > bbox.maxLat)) {
      return `coordenada fora da área da cidade (lon=${lon}, lat=${lat})`;
    }
  }
  if (!isFinitePair(first) || !isFinitePair(last)) return 'anel com extremidades inválidas';
  if (first[0] !== last[0] || first[1] !== last[1]) return 'anel não fechado';
  return null;
}

function validateGeometry(
  geometry: NeighborhoodGeometry | null,
  bbox: CityBoundingBox | null,
): string | null {
  if (!geometry) return 'geometria ausente';
  if (geometry.type === 'Polygon') {
    const rings = geometry.coordinates as PolygonCoords;
    if (!Array.isArray(rings) || rings.length === 0) return 'Polygon sem anéis';
    for (const ring of rings) {
      const err = ringIsValid(ring, bbox);
      if (err) return err;
    }
    return null;
  }
  if (geometry.type === 'MultiPolygon') {
    const polys = geometry.coordinates as MultiPolygonCoords;
    if (!Array.isArray(polys) || polys.length === 0) return 'MultiPolygon sem polígonos';
    for (const poly of polys) {
      if (!Array.isArray(poly) || poly.length === 0) return 'polígono sem anéis';
      for (const ring of poly) {
        const err = ringIsValid(ring, bbox);
        if (err) return err;
      }
    }
    return null;
  }
  return `tipo de geometria não suportado: ${(geometry as any).type}`;
}

function pickName(props: Record<string, any>): string | null {
  const n = props?.name ?? props?.nome ?? props?.NOME ?? props?.bairro;
  if (typeof n !== 'string') return null;
  const trimmed = n.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickNumber(v: any): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

export interface ValidateOptions {
  /** Cidade esperada. Se informada, valida propriedade `city` de cada feature. */
  expectedCity?: string;
  /** UF esperada. Usada como fallback quando a feature não trouxer `uf`. */
  expectedUf?: string | null;
  /** Bounding box para checagem de compatibilidade geográfica (null = pula). */
  bbox?: CityBoundingBox | null;
  /** area_type padrão quando ausente na feature. */
  defaultAreaType?: string;
}

/**
 * Valida uma FeatureCollection de bairros. Não grava nada.
 * Regras: nome presente, geometria Polygon/MultiPolygon válida (anéis fechados,
 * >=4 pontos, WGS84, dentro do bbox se fornecido), sem duplicidade de nome.
 */
export function validateNeighborhoodGeoJSON(
  fc: NeighborhoodFeatureCollection,
  opts: ValidateOptions = {},
): GeoValidationResult {
  const {
    expectedCity,
    expectedUf = null,
    bbox = null,
    defaultAreaType = 'BAIRRO_OFICIAL',
  } = opts;

  const valid: ParsedNeighborhood[] = [];
  const invalid: ValidationIssue[] = [];
  const nameCount = new Map<string, number>();

  if (!fc || fc.type !== 'FeatureCollection' || !Array.isArray(fc.features)) {
    return {
      ok: false,
      valid: [],
      invalid: [{ featureIndex: -1, name: null, reason: 'GeoJSON não é uma FeatureCollection válida' }],
      duplicates: [],
    };
  }

  fc.features.forEach((feature, index) => {
    const name = pickName(feature?.properties ?? {});
    if (!name) {
      invalid.push({ featureIndex: index, name: null, reason: 'feature sem nome' });
      return;
    }

    const geomErr = validateGeometry(feature.geometry, bbox);
    if (geomErr) {
      invalid.push({ featureIndex: index, name, reason: geomErr });
      return;
    }

    const city = feature.properties?.city ?? expectedCity;
    if (!city) {
      invalid.push({ featureIndex: index, name, reason: 'cidade ausente (feature e opção)' });
      return;
    }
    if (expectedCity && String(city) !== String(expectedCity)) {
      invalid.push({
        featureIndex: index,
        name,
        reason: `cidade divergente: feature="${city}" esperado="${expectedCity}"`,
      });
      return;
    }

    const key = normalizeNeighborhoodName(name);
    nameCount.set(key, (nameCount.get(key) ?? 0) + 1);

    valid.push({
      name,
      city: String(city),
      uf: feature.properties?.uf ?? expectedUf,
      areaType: feature.properties?.area_type ?? defaultAreaType,
      source: feature.properties?.source ?? null,
      sourceUrl: feature.properties?.source_url ?? null,
      centerLat: pickNumber(feature.properties?.center_lat),
      centerLng: pickNumber(feature.properties?.center_lng),
      coordinates: feature.geometry!.coordinates,
      geometryType: feature.geometry!.type,
    });
  });

  const duplicates = [...nameCount.entries()]
    .filter(([, count]) => count > 1)
    .map(([key]) => key);

  return {
    ok: invalid.length === 0 && duplicates.length === 0,
    valid,
    invalid,
    duplicates,
  };
}

// ─── Plano de preparação (dry-run) ───────────────────────────────────────────

export interface ExistingNeighborhood {
  id: string;
  name: string;
  territory_id: string | null;
  hasGeofence: boolean;
}

export interface TerritoryInfo {
  found: boolean;
  id: string | null;
  name: string | null;
  level: string | null;
  status: string | null;
  uf: string | null;
  cityName: string | null;
  regulatoryStatus: string | null;
  coverageStatus: string | null;
}

export interface ManagerInfo {
  found: boolean;
  count: number;
  names: string[];
}

export interface NeighborhoodPlanEntry {
  name: string;
  action: 'create' | 'update';
  willLinkTerritory: boolean;
  willWriteGeofence: boolean;
}

export interface CityPreparationPlan {
  city: string;
  uf: string | null;
  territory: TerritoryInfo;
  manager: ManagerInfo;
  totals: {
    featuresInFile: number;
    validNeighborhoods: number;
    withValidGeofence: number;
    invalidGeometries: number;
    duplicatesInFile: number;
    toCreate: number;
    toUpdate: number;
    toLinkTerritory: number;
  };
  toCreate: string[];
  toUpdate: string[];
  invalid: ValidationIssue[];
  duplicates: string[];
  risks: string[];
  /** true quando não há bloqueios impeditivos e o plano pode ser confirmado. */
  canProceed: boolean;
  /** Entradas detalhadas por bairro (útil para UI e execução). */
  entries: NeighborhoodPlanEntry[];
}

export interface BuildPlanInput {
  city: string;
  uf: string | null;
  validation: GeoValidationResult;
  territory: TerritoryInfo;
  manager: ManagerInfo;
  existing: ExistingNeighborhood[];
}

/**
 * Constrói o plano de dry-run a partir de:
 *  - resultado da validação do GeoJSON
 *  - informações do território (já existente ou não)
 *  - gestor territorial
 *  - bairros já existentes NA MESMA cidade (isolamento entre cidades garantido
 *    pelo chamador ao filtrar por city)
 *
 * Função pura: não grava e não decide sozinha; apenas descreve o que aconteceria.
 */
export function buildCityPreparationPlan(input: BuildPlanInput): CityPreparationPlan {
  const { city, uf, validation, territory, manager, existing } = input;

  const existingByName = new Map<string, ExistingNeighborhood>();
  for (const n of existing) {
    existingByName.set(normalizeNeighborhoodName(n.name), n);
  }

  const entries: NeighborhoodPlanEntry[] = [];
  const toCreate: string[] = [];
  const toUpdate: string[] = [];
  let toLinkTerritory = 0;
  let withValidGeofence = 0;

  for (const nb of validation.valid) {
    const key = normalizeNeighborhoodName(nb.name);
    const match = existingByName.get(key);
    const action: 'create' | 'update' = match ? 'update' : 'create';

    // Vamos vincular território quando existe território e o bairro ainda não
    // está vinculado a ELE (novo bairro sempre; existente só se difere).
    const willLinkTerritory =
      territory.found && territory.id != null &&
      (!match || match.territory_id !== territory.id);
    if (willLinkTerritory) toLinkTerritory++;

    // Geofence sempre será (re)escrita a partir do arquivo validado.
    const willWriteGeofence = true;
    withValidGeofence++;

    if (action === 'create') toCreate.push(nb.name);
    else toUpdate.push(nb.name);

    entries.push({ name: nb.name, action, willLinkTerritory, willWriteGeofence });
  }

  const risks: string[] = [];
  if (!territory.found) {
    risks.push(
      `Território operacional para "${city}" não foi encontrado. É necessário criar/identificar o território antes de vincular bairros.`,
    );
  } else {
    if (territory.status && territory.status !== 'planning') {
      risks.push(
        `Território está em status "${territory.status}". A preparação NÃO altera o status; a cidade permanece como está até aprovação administrativa/regulatória.`,
      );
    }
    if (territory.regulatoryStatus && !['approved'].includes(territory.regulatoryStatus)) {
      risks.push(
        `Pendência regulatória: status regulatório = "${territory.regulatoryStatus}". Modalidades bloqueadas por compliance municipal NÃO devem ser liberadas.`,
      );
    }
  }
  if (!manager.found) {
    risks.push('Nenhum gestor territorial ativo encontrado para esta cidade.');
  }
  if (validation.invalid.length > 0) {
    risks.push(`${validation.invalid.length} feature(s) com geometria/dados inválidos serão ignoradas.`);
  }
  if (validation.duplicates.length > 0) {
    risks.push(`${validation.duplicates.length} nome(s) de bairro duplicado(s) no arquivo.`);
  }

  // Só pode prosseguir se: território existe, há bairros válidos e não há
  // duplicidade impeditiva no arquivo.
  const canProceed =
    territory.found &&
    territory.id != null &&
    validation.valid.length > 0 &&
    validation.duplicates.length === 0;

  return {
    city,
    uf,
    territory,
    manager,
    totals: {
      featuresInFile: validation.valid.length + validation.invalid.length,
      validNeighborhoods: validation.valid.length,
      withValidGeofence,
      invalidGeometries: validation.invalid.length,
      duplicatesInFile: validation.duplicates.length,
      toCreate: toCreate.length,
      toUpdate: toUpdate.length,
      toLinkTerritory,
    },
    toCreate,
    toUpdate,
    invalid: validation.invalid,
    duplicates: validation.duplicates,
    risks,
    canProceed,
    entries,
  };
}
