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

/**
 * Deadline TOTAL padrão da aquisição (bbox + Overpass + retries/backoff).
 * A infraestrutura (ALB `kaviar-alb`) usa o idle timeout PADRÃO da AWS = 60s
 * (o provisionamento não altera `idle_timeout.timeout_seconds`). Portanto o
 * deadline total fica ABAIXO disso, com folga para parse/serialização/auditoria.
 */
export const ACQUISITION_TOTAL_DEADLINE_MS = 45_000;

export interface AcquireParams {
  territoryId: string;
  /** Provider a usar (default: OpenStreetMapProvider). Injeção facilita testes. */
  provider?: TerritorialDatasetProvider;
  /** Opções repassadas ao provider (timeout, fetchImpl, signal, areaType). */
  acquisitionOptions?: AcquisitionOptions;
  /** bbox esperado (passado ao provider OSM). */
  bbox?: CityBoundingBox | null;
  /** Deadline TOTAL (ms) da operação. Default ACQUISITION_TOTAL_DEADLINE_MS. */
  totalDeadlineMs?: number;
  /** Sinal externo (ex.: request fechado pelo cliente) que cancela tudo. */
  signal?: AbortSignal;
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

  // ── DEADLINE TOTAL + cancelamento propagado por TODO o pipeline ────────────
  // Um único AbortController governa: resolução de bbox + Overpass + retries +
  // backoff. Encadeia o sinal EXTERNO (ex.: request HTTP fechado) e um timer de
  // deadline total. Após cancelamento, jamais persiste S3/DRAFT.
  const deadlineMs = params.totalDeadlineMs ?? ACQUISITION_TOTAL_DEADLINE_MS;
  const controller = new AbortController();
  let deadlineHit = false;
  const deadlineTimer = setTimeout(() => { deadlineHit = true; controller.abort(); }, deadlineMs);
  const external = params.signal;
  const onExternalAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener('abort', onExternalAbort, { once: true });
  }
  const signal = controller.signal;

  // Helper: classifica o motivo do cancelamento.
  const abortResult = (): AcquireFail => ({
    ok: false,
    reason: deadlineHit
      ? `Deadline total (${deadlineMs}ms) excedido — aquisição cancelada; nada persistido.`
      : 'Aquisição cancelada (abort externo) — nada persistido.',
    code: deadlineHit ? 'ACQUISITION_DEADLINE_EXCEEDED' : 'ACQUISITION_ABORTED',
    city, uf,
  });

  try {
    // Resolve um bbox MUNICIPAL confiável (dado próprio/território ou limite OSM).
    // Se não houver bbox confiável, NÃO adquire dataset persistível silenciosamente.
    let bbox = params.bbox ?? null;
    if (!bbox) {
      const resolved = await resolveMunicipalBBox(prisma, city, uf, {
        territoryId: territory.id,
        fetchImpl: params.acquisitionOptions?.fetchImpl,
        signal,
      });
      if (signal.aborted) return abortResult();
      if (resolved.code === 'MUNICIPAL_BBOX_AMBIGUOUS') {
        return { ok: false, reason: 'Múltiplos limites municipais ambíguos para a cidade/UF.', code: 'MUNICIPAL_BBOX_AMBIGUOUS', city, uf };
      }
      bbox = resolved.bbox;
      if (!bbox) {
        return {
          ok: false,
          reason: 'BBox municipal confiável indisponível — aquisição recusada para evitar dataset da região errada.',
          code: 'MUNICIPAL_BBOX_UNAVAILABLE',
          city, uf,
        };
      }
    }

    if (signal.aborted) return abortResult();

    const provider = params.provider ?? new OpenStreetMapProvider({ bbox });

    let acquired;
    try {
      // bbox + signal por chamada (o deadline total governa mirrors/retries/backoff).
      acquired = await provider.fetchDataset({ city, uf }, { ...(params.acquisitionOptions ?? {}), bbox, signal });
    } catch (err: any) {
      if (signal.aborted || err?.code === 'ACQUISITION_ABORTED') return abortResult();
      return {
        ok: false,
        reason: `Falha na aquisição externa: ${err?.message ?? String(err)}`,
        code: err?.code || 'ACQUISITION_FAILED',
        city, uf,
      };
    }

    // Cancelado após o fetch? Não persiste.
    if (signal.aborted) return abortResult();

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

    // Guarda final antes de qualquer escrita.
    if (signal.aborted) return abortResult();

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
  } finally {
    clearTimeout(deadlineTimer);
    if (external) external.removeEventListener('abort', onExternalAbort);
  }
}
