/**
 * Serviço de REVISÃO/PREVIEW de datasets territoriais (Fase 2).
 *
 * Liga um dataset DRAFT (adquirido na Fase 1) à etapa de revisão, SEM efetivar
 * bairros/geofences. Reutiliza o motor de plano existente (dryRunPrepareCity),
 * que é READ-ONLY quanto a neighborhoods/geofences/territory.
 *
 * Regras (aprovadas):
 *  - preview transiciona DRAFT -> PREVIEWED SOMENTE após sucesso completo;
 *    qualquer falha (S3, checksum, JSON, validação, abort, deadline) mantém DRAFT;
 *  - PREVIEWED + novo preview: recomputa o plano e permanece PREVIEWED (sem erro);
 *  - REJECTED é terminal; APPLIED não sofre transição nesta fase;
 *  - isolamento: a versão precisa pertencer ao território (city+uf do território;
 *    territory_id seria a autoridade primária SE existisse na tabela — não existe
 *    sem migration, que está fora de escopo);
 *  - NÃO escreve em neighborhoods/geofences/territory/gestor/status/modalidade;
 *    a ÚNICA escrita permitida é a transição de status em territorial_dataset_versions.
 */
import { prisma as defaultPrisma } from '../../lib/prisma';
import {
  getDatasetVersion,
  listDatasetVersions,
  loadNormalizedFromS3,
  transitionStatus,
  MAX_NORMALIZED_BYTES,
  type DatasetVersionRow,
  type PrismaLike,
  type S3Like,
} from './territorial-dataset-store';
import { dryRunPrepareCity } from './city-preparation.service';
import type { CityPreparationPlan } from './city-preparation.core';

function normKey(s: string | null | undefined): string {
  return String(s ?? '').trim().toLowerCase();
}

/**
 * Isolamento: a versão pertence ao território?
 *  - Se a versão tem `territory_id` (Fase 3A), ele é a AUTORIDADE PRIMÁRIA:
 *    precisa ser igual ao id do território. city/uf viram validação secundária.
 *  - Se `territory_id` é NULL (versões legadas), usa a guarda por city+uf.
 */
export function datasetBelongsToTerritory(
  version: Pick<DatasetVersionRow, 'city' | 'uf'> & { territory_id?: string | null },
  territory: { id: string; name: string; city_name: string | null; uf: string | null },
): boolean {
  // Autoridade primária: territory_id explícito.
  if (version.territory_id != null) {
    return version.territory_id === territory.id;
  }
  // Legado (territory_id NULL): city+uf.
  const tCity = normKey(territory.city_name || territory.name);
  const tUf = normKey(territory.uf);
  const vCity = normKey(version.city);
  const vUf = normKey(version.uf);
  if (tUf && vUf && tUf !== vUf) return false;
  return vCity === tCity;
}

export interface TerritoryScope {
  territory: any;
  city: string;
  uf: string;
}
export type ScopeCode =
  | 'OK'
  | 'TERRITORY_NOT_FOUND'
  | 'CITY_UF_MISSING'
  | 'DATASET_TERRITORY_AMBIGUOUS';
export interface ScopeResult { code: ScopeCode; scope?: TerritoryScope; }

/**
 * Resolve o território e GARANTE que a associação por (city+uf) é INEQUÍVOCA.
 *
 * Como `territorial_dataset_versions` não possui `territory_id` (isolamento
 * temporário por city+uf, sem migration nesta fase), precisamos garantir que
 * NÃO exista mais de um território mapeando para a mesma combinação city+uf.
 * Se houver ambiguidade, NÃO assumimos pertencimento → DATASET_TERRITORY_AMBIGUOUS.
 *
 * Somente LEITURA. Deve ser chamada ANTES de qualquer acesso a S3/transição.
 */
export async function resolveTerritoryScope(prisma: PrismaLike, territoryId: string): Promise<ScopeResult> {
  const territory = await prisma.operational_territories.findUnique({ where: { id: territoryId } });
  if (!territory) return { code: 'TERRITORY_NOT_FOUND' };

  const city = (territory.city_name || territory.name || '').trim();
  const uf = (territory.uf || '').trim();
  if (!city || !uf) return { code: 'CITY_UF_MISSING' };

  const cityKey = normKey(city);
  const ufKey = normKey(uf);

  // Conta territórios que casam com a MESMA (city+uf) usada no fluxo.
  // Compara contra city_name OU name (mesma regra de datasetBelongsToTerritory),
  // com uf igual. Feito em memória para aplicar a normalização consistente.
  const candidates: any[] = await prisma.operational_territories.findMany({
    where: { uf: { in: [uf, uf.toUpperCase(), uf.toLowerCase()] } },
    select: { id: true, name: true, city_name: true, uf: true },
  });
  const matching = candidates.filter((t) =>
    normKey(t.uf) === ufKey && (normKey(t.city_name) === cityKey || normKey(t.name) === cityKey),
  );
  // O próprio território sempre casa; ambiguidade = >1 território distinto casando.
  const distinctIds = new Set(matching.map((t) => t.id));
  distinctIds.add(territory.id);
  if (distinctIds.size > 1) return { code: 'DATASET_TERRITORY_AMBIGUOUS' };

  return { code: 'OK', scope: { territory, city, uf } };
}

export type OwnershipCode =
  | 'OK'
  | 'TERRITORY_NOT_FOUND'
  | 'CITY_UF_MISSING'
  | 'DATASET_NOT_FOUND'
  | 'DATASET_TERRITORY_AMBIGUOUS'
  | 'DATASET_TERRITORY_MISMATCH';

export interface OwnershipResult {
  code: OwnershipCode;
  territory?: any;
  version?: DatasetVersionRow;
}

/**
 * Resolve o território e a versão, aplicando o isolamento correto:
 *  - se a versão tem `territory_id` (Fase 3A): AUTORIDADE PRIMÁRIA — compara
 *    diretamente com o território; a guarda de ambiguidade city+uf NÃO se aplica.
 *  - se `territory_id` é NULL (legado): aplica a guarda fail-closed por city+uf
 *    (DATASET_TERRITORY_AMBIGUOUS) + datasetBelongsToTerritory.
 * Somente LEITURA. Chamada ANTES de qualquer acesso a S3/transição.
 */
export async function resolveVersionOwnership(
  prisma: PrismaLike,
  territoryId: string,
  versionId: string,
): Promise<OwnershipResult> {
  const territory = await prisma.operational_territories.findUnique({ where: { id: territoryId } });
  if (!territory) return { code: 'TERRITORY_NOT_FOUND' };
  const city = (territory.city_name || territory.name || '').trim();
  const uf = (territory.uf || '').trim();
  if (!city || !uf) return { code: 'CITY_UF_MISSING' };

  const version = await getDatasetVersion(prisma, versionId);
  if (!version) return { code: 'DATASET_NOT_FOUND', territory };

  if (version.territory_id != null) {
    // Autoridade primária: territory_id. Sem depender de city+uf/ambiguidade.
    if (version.territory_id !== territory.id) return { code: 'DATASET_TERRITORY_MISMATCH', territory };
    return { code: 'OK', territory, version };
  }

  // Legado (territory_id NULL): guarda fail-closed por city+uf.
  const scope = await resolveTerritoryScope(prisma, territoryId);
  if (scope.code === 'DATASET_TERRITORY_AMBIGUOUS' || !scope.scope) {
    return { code: 'DATASET_TERRITORY_AMBIGUOUS', territory };
  }
  if (!datasetBelongsToTerritory(version, territory)) {
    return { code: 'DATASET_TERRITORY_MISMATCH', territory };
  }
  return { code: 'OK', territory, version };
}

export interface ReviewDeps {
  prisma?: PrismaLike;
  s3?: S3Like;
  getObject?: (bucket: string, key: string) => Promise<string>;
  /** limite de bytes do normalized.geojson. */
  maxNormalizedBytes?: number;
}

export interface PreviewParams extends ReviewDeps {
  territoryId: string;
  versionId: string;
  /** sinal externo (request fechado) — cancela sem transicionar. */
  signal?: AbortSignal;
  /** deadline total (ms) para a operação de preview. */
  totalDeadlineMs?: number;
  createdBy?: string | null;
}

export interface PreviewOk {
  ok: true;
  versionId: string;
  status: 'PREVIEWED';
  transitioned: boolean; // true se DRAFT->PREVIEWED nesta chamada
  plan: CityPreparationPlan;
  checksumMatches: boolean;
}
export interface PreviewFail {
  ok: false;
  code: string;
  reason: string;
  status?: string;
}
export type PreviewResult = PreviewOk | PreviewFail;

export const PREVIEW_TOTAL_DEADLINE_MS = 45_000; // < idle timeout do ALB (60s)

export async function previewDatasetVersion(params: PreviewParams): Promise<PreviewResult> {
  const prisma = params.prisma ?? defaultPrisma;

  // Deadline + abort combinados (mesma disciplina da Fase 1).
  const deadlineMs = params.totalDeadlineMs ?? PREVIEW_TOTAL_DEADLINE_MS;
  const controller = new AbortController();
  let deadlineHit = false;
  const timer = setTimeout(() => { deadlineHit = true; controller.abort(); }, deadlineMs);
  const external = params.signal;
  const onAbort = () => controller.abort();
  if (external) { if (external.aborted) controller.abort(); else external.addEventListener('abort', onAbort, { once: true }); }
  const signal = controller.signal;
  const abortFail = (): PreviewFail => ({
    ok: false,
    code: deadlineHit ? 'PREVIEW_DEADLINE_EXCEEDED' : 'PREVIEW_ABORTED',
    reason: deadlineHit ? `Deadline (${deadlineMs}ms) excedido no preview.` : 'Preview cancelado (abort externo).',
  });

  try {
    // 1) Resolve território + versão + ISOLAMENTO (territory_id primário; city+uf
    //    com guarda de ambiguidade apenas para versões legadas). Antes de S3.
    const own = await resolveVersionOwnership(prisma, params.territoryId, params.versionId);
    if (own.code === 'TERRITORY_NOT_FOUND') return { ok: false, code: 'TERRITORY_NOT_FOUND', reason: 'Território não encontrado' };
    if (own.code === 'CITY_UF_MISSING') return { ok: false, code: 'CITY_UF_MISSING', reason: 'Território sem cidade/UF definidos' };
    if (own.code === 'DATASET_NOT_FOUND') return { ok: false, code: 'DATASET_NOT_FOUND', reason: 'Versão de dataset não encontrada' };
    if (own.code === 'DATASET_TERRITORY_AMBIGUOUS') return { ok: false, code: 'DATASET_TERRITORY_AMBIGUOUS', reason: 'Mais de um território mapeia para a mesma city+UF; pertencimento não pode ser assumido.' };
    if (own.code === 'DATASET_TERRITORY_MISMATCH' || !own.version) return { ok: false, code: 'DATASET_TERRITORY_MISMATCH', reason: 'Dataset não pertence ao território.' };
    const version = own.version;
    const territory = own.territory;

    // 3) Estado: só DRAFT ou PREVIEWED podem ser previewados. REJECTED/APPLIED não.
    if (version.status !== 'DRAFT' && version.status !== 'PREVIEWED') {
      return { ok: false, code: 'INVALID_STATUS_TRANSITION', reason: `Status ${version.status} não permite preview.`, status: version.status };
    }
    if (!version.s3_normalized_key) {
      return { ok: false, code: 'NORMALIZED_KEY_MISSING', reason: 'Versão sem s3_normalized_key.' };
    }

    if (signal.aborted) return abortFail();

    // 4) Só AGORA acessa o S3 (isolamento já garantido).
    let loaded;
    try {
      loaded = await loadNormalizedFromS3(
        version.s3_normalized_key,
        { s3: params.s3, getObject: params.getObject },
        params.maxNormalizedBytes ?? MAX_NORMALIZED_BYTES,
      );
    } catch (err: any) {
      // Falha de S3/limite/JSON → permanece DRAFT (não transiciona).
      return { ok: false, code: err?.code || 'S3_LOAD_FAILED', reason: err?.message || 'Falha ao carregar normalized.geojson' };
    }

    if (signal.aborted) return abortFail();

    // Verifica integridade contra o checksum armazenado (quando presente).
    const checksumMatches = version.checksum ? version.checksum === loaded.checksum : true;
    if (version.checksum && !checksumMatches) {
      return { ok: false, code: 'CHECKSUM_MISMATCH', reason: 'Checksum do S3 diverge do registrado — permanece DRAFT.' };
    }

    if (signal.aborted) return abortFail();

    // Constrói o plano/preview (READ-ONLY quanto a bairros/geofences/território).
    let plan: CityPreparationPlan;
    try {
      const dry = await dryRunPrepareCity({
        territoryId: territory.id,
        geojson: loaded.featureCollection,
        prisma,
      });
      plan = dry.plan;
    } catch (err: any) {
      // Erro de validação/plano → permanece DRAFT.
      return { ok: false, code: 'PREVIEW_VALIDATION_FAILED', reason: err?.message || 'Falha ao construir o preview' };
    }

    if (signal.aborted) return abortFail();

    // SUCESSO. Transiciona DRAFT->PREVIEWED (compare-and-set). Se já PREVIEWED,
    // permanece PREVIEWED sem erro.
    let transitioned = false;
    if (version.status === 'DRAFT') {
      const t = await transitionStatus(prisma, version.id, ['DRAFT'], 'PREVIEWED');
      // Concorrência: se outra chamada já transicionou p/ PREVIEWED, tudo bem
      // (continua PREVIEWED). Só falha se foi para um estado terminal no meio.
      if (t.ok) {
        transitioned = true;
      } else {
        const fresh = await getDatasetVersion(prisma, version.id);
        if (fresh?.status !== 'PREVIEWED') {
          return { ok: false, code: 'INVALID_STATUS_TRANSITION', reason: `Estado mudou concorrentemente para ${fresh?.status}.`, status: fresh?.status };
        }
      }
    }

    return { ok: true, versionId: version.id, status: 'PREVIEWED', transitioned, plan, checksumMatches };
  } finally {
    clearTimeout(timer);
    if (external) external.removeEventListener('abort', onAbort);
  }
}

// ─── Reject ───────────────────────────────────────────────────────────────────

export interface RejectParams extends ReviewDeps {
  territoryId: string;
  versionId: string;
  reason?: string | null;
  createdBy?: string | null;
}
export interface RejectResult {
  ok: boolean;
  code: 'OK' | 'DATASET_NOT_FOUND' | 'TERRITORY_NOT_FOUND' | 'CITY_UF_MISSING' | 'DATASET_TERRITORY_AMBIGUOUS' | 'DATASET_TERRITORY_MISMATCH' | 'INVALID_STATUS_TRANSITION';
  status?: string;
}

export async function rejectDatasetVersion(params: RejectParams): Promise<RejectResult> {
  const prisma = params.prisma ?? defaultPrisma;

  // Isolamento (territory_id primário; city+uf/ambiguidade só p/ legado) antes da transição.
  const own = await resolveVersionOwnership(prisma, params.territoryId, params.versionId);
  if (own.code === 'TERRITORY_NOT_FOUND') return { ok: false, code: 'TERRITORY_NOT_FOUND' };
  if (own.code === 'CITY_UF_MISSING') return { ok: false, code: 'CITY_UF_MISSING' };
  if (own.code === 'DATASET_NOT_FOUND') return { ok: false, code: 'DATASET_NOT_FOUND' };
  if (own.code === 'DATASET_TERRITORY_AMBIGUOUS') return { ok: false, code: 'DATASET_TERRITORY_AMBIGUOUS' };
  if (own.code === 'DATASET_TERRITORY_MISMATCH' || !own.version) return { ok: false, code: 'DATASET_TERRITORY_MISMATCH' };
  const version = own.version;

  // Permitido: DRAFT|PREVIEWED -> REJECTED. REJECTED/APPLIED → inválido.
  const t = await transitionStatus(prisma, version.id, ['DRAFT', 'PREVIEWED'], 'REJECTED');
  if (!t.ok) {
    const fresh = await getDatasetVersion(prisma, version.id);
    return { ok: false, code: 'INVALID_STATUS_TRANSITION', status: fresh?.status };
  }
  return { ok: true, code: 'OK', status: 'REJECTED' };
}

// ─── Listagem ──────────────────────────────────────────────────────────────────

export async function listTerritoryDatasets(
  territoryId: string,
  deps: ReviewDeps = {},
): Promise<{ ok: boolean; code: string; datasets?: DatasetVersionRow[] }> {
  const prisma = deps.prisma ?? defaultPrisma;
  // Guarda de ambiguidade: não retorna versões se a associação for ambígua.
  const scope = await resolveTerritoryScope(prisma, territoryId);
  if (scope.code !== 'OK' || !scope.scope) return { ok: false, code: scope.code };
  const datasets = await listDatasetVersions(prisma, scope.scope.city, scope.scope.uf);
  return { ok: true, code: 'OK', datasets };
}
