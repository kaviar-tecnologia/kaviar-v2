/**
 * OpenStreetMapProvider — provider REAL de dataset territorial via Overpass API.
 *
 * Fonte COMUNITÁRIA / NÃO OFICIAL (is_official=false; source_verified nunca é
 * marcado true pela aquisição). Somente LEITURA externa. Não grava no banco.
 *
 * Robustez:
 *  - mirrors Overpass em ALLOWLIST (nenhuma URL do usuário);
 *  - timeout por tentativa (AbortController) + retry com backoff;
 *  - fallback entre mirrors;
 *  - limite de tamanho de resposta e de nº de elementos;
 *  - valida HTTP status e Content-Type; rejeita JSON inválido;
 *  - não segue redirect para host arbitrário (redirect: 'manual').
 */
import {
  normalizeOverpassToGeoJSON,
  buildOverpassQuery,
  type OverpassResponse,
} from '../osm-geojson-normalizer';
import {
  type TerritorialDatasetProvider,
  type AcquiredDataset,
  type AcquisitionOptions,
  type CityRef,
} from './territorial-dataset-provider';
import type { CityBoundingBox } from '../city-preparation.core';

/** Mirrors Overpass confiáveis (ALLOWLIST). Nenhuma URL vem do usuário. */
export const OVERPASS_MIRRORS: readonly string[] = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const ALLOWED_HOSTS = new Set(OVERPASS_MIRRORS.map((u) => new URL(u).host));

export interface OpenStreetMapProviderConfig {
  mirrors?: readonly string[];
  timeoutMs?: number;          // por tentativa
  maxAttemptsPerMirror?: number;
  backoffBaseMs?: number;
  maxResponseBytes?: number;   // limite de tamanho da resposta
  maxElements?: number;        // limite de elementos no Overpass JSON
  /** bbox esperado para a checagem geográfica (envelope). Opcional. */
  bbox?: CityBoundingBox | null;
}

const DEFAULTS = {
  timeoutMs: 60_000,
  maxAttemptsPerMirror: 2,
  backoffBaseMs: 500,
  maxResponseBytes: 25 * 1024 * 1024, // 25 MB
  maxElements: 50_000,
};

export class OverpassAcquisitionError extends Error {
  constructor(message: string, readonly code: string, readonly details?: unknown) {
    super(message);
    this.name = 'OverpassAcquisitionError';
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class OpenStreetMapProvider implements TerritorialDatasetProvider {
  readonly id = 'osm-overpass';
  readonly isOfficial = false; // comunitário
  readonly priority = 100;     // menor prioridade que fontes oficiais

  constructor(private readonly config: OpenStreetMapProviderConfig = {}) {}

  supports(_ref: CityRef): boolean {
    // OSM é fallback universal: suporta qualquer cidade/UF (best-effort).
    return true;
  }

  async fetchDataset(ref: CityRef, opts: AcquisitionOptions = {}): Promise<AcquiredDataset> {
    const cfg = { ...DEFAULTS, ...this.config };
    const mirrors = (this.config.mirrors ?? OVERPASS_MIRRORS).filter((u) => ALLOWED_HOSTS.has(new URL(u).host));
    if (mirrors.length === 0) throw new OverpassAcquisitionError('Nenhum mirror Overpass permitido', 'NO_MIRRORS');

    const timeoutMs = opts.timeoutMs ?? cfg.timeoutMs;
    const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as typeof fetch);
    if (typeof fetchImpl !== 'function') throw new OverpassAcquisitionError('fetch indisponível', 'NO_FETCH');

    const query = buildOverpassQuery({ city: ref.city, uf: ref.uf });
    const collectedAt = new Date().toISOString();

    let lastError: unknown = null;
    let usedUrl: string | null = null;
    let raw: OverpassResponse | null = null;

    for (const url of mirrors) {
      for (let attempt = 1; attempt <= cfg.maxAttemptsPerMirror; attempt++) {
        try {
          raw = await this.requestOverpass(fetchImpl, url, query, timeoutMs, cfg, opts.signal);
          usedUrl = url;
          break;
        } catch (err) {
          lastError = err;
          // backoff antes de nova tentativa no mesmo mirror
          if (attempt < cfg.maxAttemptsPerMirror) {
            // eslint-disable-next-line no-await-in-loop
            await sleep(cfg.backoffBaseMs * attempt);
          }
        }
      }
      if (raw) break;
    }

    if (!raw || !usedUrl) {
      throw new OverpassAcquisitionError(
        'Falha ao obter dados de todos os mirrors Overpass',
        'ALL_MIRRORS_FAILED',
        lastError instanceof Error ? lastError.message : String(lastError),
      );
    }

    // Limite de elementos (defesa contra payload absurdo).
    const elementCount = Array.isArray(raw.elements) ? raw.elements.length : 0;
    if (elementCount > cfg.maxElements) {
      throw new OverpassAcquisitionError(
        `Resposta Overpass excede o limite de elementos (${elementCount} > ${cfg.maxElements})`,
        'TOO_MANY_ELEMENTS',
      );
    }

    const norm = normalizeOverpassToGeoJSON(raw, {
      expectedCity: ref.city,
      expectedUf: ref.uf,
      bbox: this.config.bbox ?? null,
      areaType: opts.areaType ?? 'BAIRRO_OFICIAL',
    });

    const acquired: AcquiredDataset = {
      rawSource: raw,
      featureCollection: norm.featureCollection,
      provenance: {
        providerId: this.id,
        source: 'OpenStreetMap (comunitário/não oficial)',
        sourceUrl: usedUrl,
        method: 'overpass-api',
        collectedAt,
        isOfficial: false,
        query,
        sourceIds: norm.osmIds,
        notes: 'Limites administrativos do OpenStreetMap. Fonte comunitária; requer revisão humana antes de uso operacional.',
      },
      stats: {
        total: norm.stats.total,
        valid: norm.stats.valid,
        invalid: norm.stats.invalid,
        duplicates: norm.stats.duplicates,
        outOfBBox: norm.stats.outOfBBox,
      },
    };
    return acquired;
  }

  private async requestOverpass(
    fetchImpl: typeof fetch,
    url: string,
    query: string,
    timeoutMs: number,
    cfg: typeof DEFAULTS,
    externalSignal?: AbortSignal,
  ): Promise<OverpassResponse> {
    if (!ALLOWED_HOSTS.has(new URL(url).host)) {
      throw new OverpassAcquisitionError(`Host não permitido: ${url}`, 'HOST_NOT_ALLOWED');
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    // Encadeia abort externo, se fornecido.
    const onExternalAbort = () => controller.abort();
    if (externalSignal) {
      if (externalSignal.aborted) controller.abort();
      else externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }

    try {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: `data=${encodeURIComponent(query)}`,
        signal: controller.signal,
        redirect: 'manual', // não segue redirect para host arbitrário
      } as any);

      // Redirect manual → rejeita (evita SSRF via Location arbitrário).
      const status = (res as any).status as number;
      const type = (res as any).type;
      if (type === 'opaqueredirect' || (status >= 300 && status < 400)) {
        throw new OverpassAcquisitionError(`Redirect não permitido (status ${status})`, 'REDIRECT_BLOCKED');
      }
      if (status < 200 || status >= 300) {
        throw new OverpassAcquisitionError(`HTTP ${status} do Overpass`, status >= 500 ? 'HTTP_5XX' : 'HTTP_4XX');
      }

      const contentType = ((res as any).headers?.get?.('content-type') || '').toLowerCase();
      if (!contentType.includes('application/json') && !contentType.includes('application/osm3s')) {
        throw new OverpassAcquisitionError(`Content-Type inesperado: ${contentType || '(vazio)'}`, 'BAD_CONTENT_TYPE');
      }

      // Limite de tamanho: usa Content-Length quando presente; senão, mede o texto.
      const declaredLen = Number((res as any).headers?.get?.('content-length') || 0);
      if (declaredLen && declaredLen > cfg.maxResponseBytes) {
        throw new OverpassAcquisitionError(`Resposta excede ${cfg.maxResponseBytes} bytes`, 'RESPONSE_TOO_LARGE');
      }
      const text = await (res as any).text();
      if (text.length > cfg.maxResponseBytes) {
        throw new OverpassAcquisitionError(`Resposta excede ${cfg.maxResponseBytes} bytes`, 'RESPONSE_TOO_LARGE');
      }

      let parsed: any;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new OverpassAcquisitionError('JSON inválido na resposta Overpass', 'INVALID_JSON');
      }
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.elements)) {
        throw new OverpassAcquisitionError('Estrutura Overpass inesperada (sem elements[])', 'INVALID_STRUCTURE');
      }
      return parsed as OverpassResponse;
    } finally {
      clearTimeout(timer);
      if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}
