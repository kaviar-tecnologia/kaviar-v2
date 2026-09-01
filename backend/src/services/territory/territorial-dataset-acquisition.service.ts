/**
 * Serviço de aquisição de dataset territorial (Fase 1).
 *
 * Orquestra: (território → city/uf) → provider (OSM/Overpass) → rawSource →
 * normalização/validação → persistência DRAFT (S3 + territorial_dataset_versions).
 *
 * ESCRITAS PERMITIDAS: somente objetos no S3 e UMA linha DRAFT em
 * territorial_dataset_versions. NADA além disso (não cria neighborhoods,
 * geofences, nem altera operational_territories/gestor/status).
 *
 * Se a aquisição retornar ZERO features válidas, NÃO persiste; retorna resultado
 * de qualidade insuficiente com diagnóstico.
 */
import { prisma as defaultPrisma } from '../../lib/prisma';
import { OpenStreetMapProvider } from './providers/openstreetmap-provider';
import {
  type TerritorialDatasetProvider,
  type AcquisitionOptions,
} from './providers/territorial-dataset-provider';
import { persistDatasetVersion, type PrismaLike, type S3Like } from './territorial-dataset-store';
import { resolveMunicipalBBox } from './municipal-bbox-resolver';
import type { CityBoundingBox } from './city-preparation.core';

export interface AcquireParams {
  territoryId: string;
  /** Provider a usar (default: OpenStreetMapProvider). Injeção facilita testes. */
  provider?: TerritorialDatasetProvider;
  /** Opções repassadas ao provider (timeout, fetchImpl, signal, areaType). */
  acquisitionOptions?: AcquisitionOptions;
  /** bbox esperado (passado ao provider OSM). */
  bbox?: CityBoundingBox | null;
  createdBy?: string | null;
  prisma?: PrismaLike;
  s3?: S3Like;
  /** função de gravação S3 injetável (testes). */
  putObject?: (bucket: string, key: string, body: string, contentType: string) => Promise<void>;
  deleteObject?: (bucket: string, key: string) => Promise<void>;
}

export interface AcquireOk {
  ok: true;
  datasetVersionId: string;
  city: string;
  uf: string;
  provenance: any;
  stats: { total: number; valid: number; invalid: number; duplicates: number; outOfBBox: number };
  s3: { raw: string; normalized: string; provenance: string };
  checksum: string;
}
export interface AcquireFail {
  ok: false;
  reason: string;
  code: string;
  city?: string;
  uf?: string;
  stats?: { total: number; valid: number; invalid: number; duplicates: number; outOfBBox: number };
}
export type AcquireResult = AcquireOk | AcquireFail;

export async function acquireCityDataset(params: AcquireParams): Promise<AcquireResult> {
  const prisma = params.prisma ?? defaultPrisma;

  const territory = await prisma.operational_territories.findUnique({
    where: { id: params.territoryId },
    select: { id: true, name: true, city_name: true, uf: true, level: true },
  });
  if (!territory) return { ok: false, reason: 'Território não encontrado', code: 'TERRITORY_NOT_FOUND' };

  const city = (territory.city_name || territory.name || '').trim();
  const uf = (territory.uf || '').trim();
  if (!city || !uf) {
    return { ok: false, reason: 'Território sem cidade/UF definidos', code: 'CITY_UF_MISSING', city, uf };
  }

  // Resolve um bbox MUNICIPAL confiável (dado próprio ou limite OSM). Genérico.
  // Se não houver bbox confiável, NÃO adquire dataset persistível silenciosamente.
  let bbox = params.bbox ?? null;
  let bboxSource = 'injected';
  if (!bbox) {
    const resolved = await resolveMunicipalBBox(prisma, city, uf, {
      fetchImpl: params.acquisitionOptions?.fetchImpl,
      timeoutMs: params.acquisitionOptions?.timeoutMs,
    });
    bbox = resolved.bbox;
    bboxSource = resolved.source;
    if (!bbox) {
      return {
        ok: false,
        reason: 'BBox municipal confiável indisponível — aquisição recusada para evitar dataset da região errada.',
        code: 'MUNICIPAL_BBOX_UNAVAILABLE',
        city, uf,
      };
    }
  }

  const provider = params.provider ?? new OpenStreetMapProvider({ bbox });

  let acquired;
  try {
    // bbox por chamada tem precedência — garante a checagem regional no caminho real.
    acquired = await provider.fetchDataset({ city, uf }, { ...(params.acquisitionOptions ?? {}), bbox });
  } catch (err: any) {
    return {
      ok: false,
      reason: `Falha na aquisição externa: ${err?.message ?? String(err)}`,
      code: err?.code || 'ACQUISITION_FAILED',
      city, uf,
    };
  }

  // Qualidade insuficiente: zero features válidas → NÃO persiste.
  if (!acquired.featureCollection.features.length || acquired.stats.valid === 0) {
    return {
      ok: false,
      reason: 'Nenhuma feature válida encontrada — qualidade insuficiente; dataset não persistido.',
      code: 'NO_VALID_FEATURES',
      city, uf,
      stats: acquired.stats,
    };
  }

  // Persiste DRAFT (S3 + metadados). source_verified é FORÇADO false no store.
  const persisted = await persistDatasetVersion(
    { city, uf, acquired, createdBy: params.createdBy ?? null, status: 'DRAFT' },
    { prisma, s3: params.s3, putObject: params.putObject, deleteObject: params.deleteObject },
  );

  return {
    ok: true,
    datasetVersionId: persisted.id,
    city, uf,
    provenance: acquired.provenance,
    stats: acquired.stats,
    s3: persisted.keys,
    checksum: persisted.checksum,
  };
}
