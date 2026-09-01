/**
 * Camada de persistência de datasets territoriais (Fase 0 — estrutura).
 *
 * Responsável por:
 *   - montar as chaves S3 (raw/normalizado) de forma determinística;
 *   - persistir os objetos no S3 e registrar metadados na tabela
 *     `territorial_dataset_versions` (versionamento/histórico/rastreabilidade).
 *
 * Design:
 *   - S3 client e Prisma são INJETÁVEIS (default: singletons), permitindo testes
 *     sem tocar em AWS/DB.
 *   - NADA é gravado automaticamente ao importar este módulo. As funções só
 *     executam quando explicitamente chamadas (fases posteriores, com autorização).
 *   - NÃO escreve em neighborhoods / neighborhood_geofences / operational_territories.
 */
import { createHash } from 'crypto';
import type { AcquiredDataset } from './providers/territorial-dataset-provider';

export type DatasetStatus = 'DRAFT' | 'PREVIEWED' | 'APPLIED' | 'REJECTED';

export const DATASET_BUCKET = process.env.TERRITORIAL_DATASET_BUCKET
  || process.env.AWS_S3_BUCKET
  || 'kaviar-uploads-847895361928';

export const DATASET_KEY_PREFIX = 'territorial-datasets';

/** Slug estável de cidade para uso em chaves S3 (sem acentos/espaços). */
export function citySlug(city: string): string {
  return String(city || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface DatasetKeys {
  raw: string;
  normalized: string;
  provenance: string;
}

/** Monta as chaves S3 para uma versão de dataset. */
export function buildDatasetKeys(uf: string, city: string, version: string): DatasetKeys {
  const base = `${DATASET_KEY_PREFIX}/${(uf || 'NA').toUpperCase()}/${citySlug(city)}/${version}`;
  return {
    raw: `${base}/raw.json`,
    normalized: `${base}/normalized.geojson`,
    provenance: `${base}/provenance.json`,
  };
}

/** Calcula checksum sha-256 do conteúdo normalizado. */
export function checksumOf(normalizedGeoJSON: unknown): string {
  return createHash('sha256').update(JSON.stringify(normalizedGeoJSON)).digest('hex');
}

// ─── Persistência (injetável; não roda no import) ────────────────────────────

export type S3Like = { send: (cmd: any) => Promise<any> };
export type PrismaLike = any;

export interface PersistDatasetInput {
  city: string;
  uf: string;
  acquired: AcquiredDataset;
  createdBy?: string | null;
  notes?: string | null;
  status?: DatasetStatus;
  /** versão (default: timestamp ISO compacto). */
  version?: string;
}

export interface PersistDatasetResult {
  id: string;
  version: string;
  keys: DatasetKeys;
  checksum: string;
}

/**
 * Persiste raw+normalizado no S3 e registra metadados na tabela.
 * NÃO é chamada nesta fase — apenas disponível para as próximas.
 */
export async function persistDatasetVersion(
  input: PersistDatasetInput,
  deps: {
    s3?: S3Like;
    prisma?: PrismaLike;
    putObject?: (bucket: string, key: string, body: string, contentType: string) => Promise<void>;
    deleteObject?: (bucket: string, key: string) => Promise<void>;
  } = {},
): Promise<PersistDatasetResult> {
  const version = input.version || new Date().toISOString().replace(/[:.]/g, '-');
  const keys = buildDatasetKeys(input.uf, input.city, version);
  const normalized = input.acquired.featureCollection;
  const checksum = checksumOf(normalized);

  const put = deps.putObject ?? defaultPutObject(deps.s3);
  const del = deps.deleteObject ?? defaultDeleteObject(deps.s3);

  // Rastreia keys efetivamente gravadas para cleanup compensável em caso de falha.
  const writtenKeys: string[] = [];

  // Cleanup best-effort: remove os objetos já gravados. NÃO mascara o erro
  // original; se um delete falhar, apenas registra/loga e segue.
  const cleanup = async () => {
    for (const key of writtenKeys) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await del(DATASET_BUCKET, key);
      } catch (cleanupErr) {
        console.error('[territorial-dataset-store] cleanup S3 falhou para key=' + key, cleanupErr);
      }
    }
  };

  try {
    // Gravação S3 (raw / normalized / provenance). Cada sucesso é rastreado.
    await put(DATASET_BUCKET, keys.raw, JSON.stringify(input.acquired.rawSource ?? null), 'application/json');
    writtenKeys.push(keys.raw);
    await put(DATASET_BUCKET, keys.normalized, JSON.stringify(normalized), 'application/geo+json');
    writtenKeys.push(keys.normalized);
    await put(DATASET_BUCKET, keys.provenance, JSON.stringify(input.acquired.provenance), 'application/json');
    writtenKeys.push(keys.provenance);

    const prisma = deps.prisma;
    if (!prisma) throw new Error('persistDatasetVersion requer prisma (client) para registrar metadados');

    const p = input.acquired.provenance;
    const s = input.acquired.stats;
    const row = await prisma.territorial_dataset_versions.create({
      data: {
        city: input.city,
        uf: input.uf.toUpperCase(),
        provider_id: p.providerId,
        source: p.source,
        source_url: p.sourceUrl ?? null,
        method: p.method,
        collected_at: new Date(p.collectedAt),
        is_official: p.isOfficial === true,
        // SEGURANÇA: aquisição automática NUNCA marca a fonte como verificada.
        source_verified: false,
        s3_raw_key: keys.raw,
        s3_normalized_key: keys.normalized,
        feature_count: s.valid,
        invalid_count: s.invalid,
        duplicate_count: s.duplicates,
        out_of_bbox_count: s.outOfBBox,
        status: input.status ?? 'DRAFT',
        created_by: input.createdBy ?? null,
        notes: input.notes ?? p.notes ?? null,
        checksum,
      },
      select: { id: true },
    });

    return { id: row.id, version, keys, checksum };
  } catch (err) {
    // Falha parcial (upload intermediário ou insert): compensa removendo os
    // objetos já criados e RE-LANÇA o erro original.
    await cleanup();
    throw err;
  }
}

function defaultPutObject(s3?: S3Like) {
  return async (bucket: string, key: string, body: string, contentType: string) => {
    // Import tardio para não exigir AWS SDK em contextos de teste puro.
    const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
    const client: S3Like = s3 ?? new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
  };
}

function defaultDeleteObject(s3?: S3Like) {
  return async (bucket: string, key: string) => {
    const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');
    const client: S3Like = s3 ?? new S3Client({ region: process.env.AWS_REGION || 'us-east-2' });
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  };
}
