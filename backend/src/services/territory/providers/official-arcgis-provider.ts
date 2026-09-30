import {
  normalizeNeighborhoodName,
  validateNeighborhoodGeoJSON,
  type NeighborhoodFeatureCollection,
} from '../city-preparation.core';
import {
  type AcquisitionOptions,
  type AcquiredDataset,
  type CityRef,
  type TerritorialDatasetProvider,
} from './territorial-dataset-provider';
import {
  OFFICIAL_ARCGIS_SOURCES,
  type ArcGisOfficialSource,
} from './official-territorial-sources';

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RESPONSE_BYTES = 25 * 1024 * 1024;

const TERRITORIAL_USER_AGENT =
  'KAVIAR/1.0 (https://kaviar.com.br; contato@kaviar.com.br)';

function norm(v: string | null | undefined): string {
  return String(v ?? '').trim().toLowerCase();
}

function findSource(
  sources: readonly ArcGisOfficialSource[],
  ref: CityRef,
): ArcGisOfficialSource | null {
  return sources.find(
    (s) => norm(s.city) === norm(ref.city) && norm(s.uf) === norm(ref.uf),
  ) ?? null;
}

export function buildArcGisQueryUrl(source: ArcGisOfficialSource): string {
  const url = new URL(`${source.layerUrl.replace(/\/+$/, '')}/query`);

  if (url.protocol !== 'https:') {
    throw new Error('Fonte ArcGIS oficial deve usar HTTPS');
  }

  url.searchParams.set('where', '1=1');
  url.searchParams.set(
    'outFields',
    source.outFields?.length ? source.outFields.join(',') : '*',
  );
  url.searchParams.set('returnGeometry', 'true');
  url.searchParams.set('outSR', '4326');
  url.searchParams.set('f', 'geojson');

  return url.toString();
}

export class OfficialArcGisAcquisitionError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = 'OfficialArcGisAcquisitionError';
  }
}

export class OfficialArcGisProvider implements TerritorialDatasetProvider {
  readonly id = 'official-arcgis';
  readonly isOfficial = true;
  readonly priority = 10;

  constructor(
    private readonly sources: readonly ArcGisOfficialSource[] =
      OFFICIAL_ARCGIS_SOURCES,
  ) {}

  supports(ref: CityRef): boolean {
    return findSource(this.sources, ref) !== null;
  }

  async fetchDataset(
    ref: CityRef,
    opts: AcquisitionOptions = {},
  ): Promise<AcquiredDataset> {
    const source = findSource(this.sources, ref);

    if (!source) {
      throw new OfficialArcGisAcquisitionError(
        `Nenhuma fonte ArcGIS oficial configurada para ${ref.city}/${ref.uf}`,
        'OFFICIAL_SOURCE_NOT_CONFIGURED',
      );
    }

    if (opts.signal?.aborted) {
      throw new OfficialArcGisAcquisitionError(
        'Aquisição cancelada',
        'ACQUISITION_ABORTED',
      );
    }

    const fetchImpl = opts.fetchImpl ?? (globalThis.fetch as typeof fetch);

    if (typeof fetchImpl !== 'function') {
      throw new OfficialArcGisAcquisitionError(
        'fetch indisponível',
        'NO_FETCH',
      );
    }

    const url = buildArcGisQueryUrl(source);
    const controller = new AbortController();
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

    const onExternalAbort = () => controller.abort();

    if (opts.signal) {
      if (opts.signal.aborted) controller.abort();
      else opts.signal.addEventListener('abort', onExternalAbort, { once: true });
    }

    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let res: any;

      try {
        res = await fetchImpl(url, {
          method: 'GET',
          headers: {
            Accept: 'application/geo+json, application/json',
            'User-Agent': TERRITORIAL_USER_AGENT,
          },
          signal: controller.signal,
          redirect: 'manual',
        } as any);
      } catch (err) {
        if (opts.signal?.aborted) {
          throw new OfficialArcGisAcquisitionError(
            'Aquisição cancelada',
            'ACQUISITION_ABORTED',
          );
        }

        if (controller.signal.aborted) {
          throw new OfficialArcGisAcquisitionError(
            `Timeout da fonte oficial após ${timeoutMs}ms`,
            'OFFICIAL_SOURCE_TIMEOUT',
          );
        }

        throw err;
      }

      const status = Number(res.status);

      if (
        res.type === 'opaqueredirect' ||
        (status >= 300 && status < 400)
      ) {
        throw new OfficialArcGisAcquisitionError(
          `Redirect não permitido (HTTP ${status})`,
          'REDIRECT_BLOCKED',
        );
      }

      if (status < 200 || status >= 300) {
        throw new OfficialArcGisAcquisitionError(
          `HTTP ${status} da fonte oficial`,
          status >= 500 ? 'OFFICIAL_HTTP_5XX' : 'OFFICIAL_HTTP_4XX',
        );
      }

      const contentType = String(
        res.headers?.get?.('content-type') ?? '',
      ).toLowerCase();

      if (!contentType.includes('json')) {
        throw new OfficialArcGisAcquisitionError(
          `Content-Type inesperado: ${contentType || '(vazio)'}`,
          'BAD_CONTENT_TYPE',
        );
      }

      const declaredLength = Number(
        res.headers?.get?.('content-length') ?? 0,
      );

      if (
        declaredLength &&
        declaredLength > DEFAULT_MAX_RESPONSE_BYTES
      ) {
        throw new OfficialArcGisAcquisitionError(
          'Resposta oficial excede o limite de tamanho',
          'RESPONSE_TOO_LARGE',
        );
      }

      const text = await res.text();

      if (
        Buffer.byteLength(text, 'utf8') >
        DEFAULT_MAX_RESPONSE_BYTES
      ) {
        throw new OfficialArcGisAcquisitionError(
          'Resposta oficial excede o limite de tamanho',
          'RESPONSE_TOO_LARGE',
        );
      }

      let raw: any;

      try {
        raw = JSON.parse(text);
      } catch {
        throw new OfficialArcGisAcquisitionError(
          'GeoJSON oficial inválido',
          'INVALID_JSON',
        );
      }

      if (
        raw?.type !== 'FeatureCollection' ||
        !Array.isArray(raw.features)
      ) {
        throw new OfficialArcGisAcquisitionError(
          'Resposta oficial não é FeatureCollection',
          'INVALID_STRUCTURE',
        );
      }

      const candidateFeatures = raw.features.map((feature: any) => {
        const props = feature?.properties ?? {};
        const name = props[source.nameField];

        return {
          type: 'Feature',
          properties: {
            ...props,
            name,
            city: ref.city,
            uf: ref.uf,
            area_type:
              opts.areaType ??
              source.areaType ??
              'BAIRRO_OFICIAL',
            source: source.source,
            source_url: source.layerUrl,
            source_code:
              source.codeField
                ? props[source.codeField] ?? null
                : null,
          },
          geometry: feature?.geometry ?? null,
        };
      });

      const candidates = {
        type: 'FeatureCollection',
        name: `${ref.city}_bairros_oficiais`,
        features: candidateFeatures,
      } as NeighborhoodFeatureCollection;

      const validation = validateNeighborhoodGeoJSON(candidates, {
        expectedCity: ref.city,
        expectedUf: ref.uf,
        bbox: opts.bbox ?? null,
        defaultAreaType:
          opts.areaType ??
          source.areaType ??
          'BAIRRO_OFICIAL',
      });

      const invalidIndexes = new Set(
        validation.invalid.map((i) => i.featureIndex),
      );

      const outOfBBoxIndexes = new Set(
        validation.invalid
          .filter((i) => i.reason.includes('fora da área da cidade'))
          .map((i) => i.featureIndex),
      );

      const seen = new Set<string>();
      const normalizedFeatures: any[] = [];
      let duplicates = 0;

      candidateFeatures.forEach((feature: any, index: number) => {
        if (invalidIndexes.has(index)) return;

        const name = String(feature.properties?.name ?? '').trim();
        const key = normalizeNeighborhoodName(name);

        if (seen.has(key)) {
          duplicates++;
          return;
        }

        seen.add(key);
        normalizedFeatures.push(feature);
      });

      const sourceIds = normalizedFeatures
        .map((feature: any) => {
          const props = feature.properties ?? {};

          if (
            source.objectIdField &&
            props[source.objectIdField] != null
          ) {
            return `${source.id}:objectid:${props[source.objectIdField]}`;
          }

          if (
            source.codeField &&
            props[source.codeField] != null
          ) {
            return `${source.id}:code:${props[source.codeField]}`;
          }

          return null;
        })
        .filter((v: string | null): v is string => v !== null);

      return {
        rawSource: raw,
        featureCollection: {
          type: 'FeatureCollection',
          name: `${ref.city}_bairros_oficiais`,
          features: normalizedFeatures,
        },
        provenance: {
          providerId: this.id,
          source: source.source,
          sourceUrl: source.layerUrl,
          method: 'arcgis-rest-geojson',
          collectedAt: new Date().toISOString(),
          isOfficial: true,
          query: url,
          sourceIds,
          notes: source.notes ?? null,
        },
        stats: {
          total: candidateFeatures.length,
          valid: normalizedFeatures.length,
          invalid:
            invalidIndexes.size - outOfBBoxIndexes.size,
          duplicates,
          outOfBBox: outOfBBoxIndexes.size,
        },
      };
    } finally {
      clearTimeout(timer);

      if (opts.signal) {
        opts.signal.removeEventListener(
          'abort',
          onExternalAbort,
        );
      }
    }
  }
}
