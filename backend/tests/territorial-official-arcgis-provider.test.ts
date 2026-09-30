import { describe, expect, it } from 'vitest';

import {
  OfficialArcGisProvider,
  buildArcGisQueryUrl,
} from '../src/services/territory/providers/official-arcgis-provider';
import {
  OFFICIAL_ARCGIS_SOURCES,
} from '../src/services/territory/providers/official-territorial-sources';

function polygon(x = -46.62, y = -23.69) {
  return {
    type: 'Polygon',
    coordinates: [[
      [x, y],
      [x + 0.001, y],
      [x + 0.001, y + 0.001],
      [x, y + 0.001],
      [x, y],
    ]],
  };
}

function response(body: unknown) {
  return Promise.resolve({
    status: 200,
    type: 'default',
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type'
          ? 'application/geo+json'
          : null,
    },
    text: async () => JSON.stringify(body),
  });
}

describe('OfficialArcGisProvider', () => {
  it('suporta apenas cidade/UF configuradas', () => {
    const provider = new OfficialArcGisProvider();

    expect(
      provider.supports({ city: 'Diadema', uf: 'SP' }),
    ).toBe(true);

    expect(
      provider.supports({ city: 'Cariacica', uf: 'ES' }),
    ).toBe(false);
  });

  it('monta query ArcGIS GeoJSON somente leitura', () => {
    const url = new URL(
      buildArcGisQueryUrl(OFFICIAL_ARCGIS_SOURCES[0]),
    );

    expect(url.protocol).toBe('https:');
    expect(url.pathname.endsWith('/1/query')).toBe(true);
    expect(url.searchParams.get('where')).toBe('1=1');
    expect(url.searchParams.get('returnGeometry')).toBe('true');
    expect(url.searchParams.get('outSR')).toBe('4326');
    expect(url.searchParams.get('f')).toBe('geojson');
    expect(url.searchParams.get('outFields')).toContain('bairro');
  });

  it('normaliza GeoJSON oficial e preserva proveniência', async () => {
    let calledUrl = '';
    let seenHeaders: any = null;

    const fetchImpl = (async (url: string, init: any) => {
      calledUrl = url;
      seenHeaders = init.headers;

      return response({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              objectid: 1,
              cod_bairro: 6,
              bairro: 'Eldorado',
            },
            geometry: polygon(),
          },
          {
            type: 'Feature',
            properties: {
              objectid: 2,
              cod_bairro: 4,
              bairro: 'Centro',
            },
            geometry: polygon(-46.61, -23.68),
          },
        ],
      });
    }) as unknown as typeof fetch;

    const provider = new OfficialArcGisProvider();

    const result = await provider.fetchDataset(
      { city: 'Diadema', uf: 'SP' },
      { fetchImpl },
    );

    expect(calledUrl).toContain('/MapServer/1/query');
    expect(seenHeaders['User-Agent']).toContain('KAVIAR/1.0');

    expect(result.stats).toEqual({
      total: 2,
      valid: 2,
      invalid: 0,
      duplicates: 0,
      outOfBBox: 0,
    });

    expect(result.provenance.isOfficial).toBe(true);
    expect(result.provenance.providerId).toBe('official-arcgis');
    expect(result.provenance.method).toBe('arcgis-rest-geojson');

    expect(
      result.featureCollection.features.map(
        (f: any) => f.properties.name,
      ),
    ).toEqual(['Eldorado', 'Centro']);

    expect(
      result.featureCollection.features[0].properties.source_code,
    ).toBe(6);
  });

  it('remove duplicidade e rejeita geometria inválida', async () => {
    const fetchImpl = (async () =>
      response({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: {
              objectid: 1,
              cod_bairro: 1,
              bairro: 'Canhema',
            },
            geometry: polygon(),
          },
          {
            type: 'Feature',
            properties: {
              objectid: 2,
              cod_bairro: 1,
              bairro: 'Canhema',
            },
            geometry: polygon(-46.61, -23.68),
          },
          {
            type: 'Feature',
            properties: {
              objectid: 3,
              cod_bairro: 9,
              bairro: 'Serraria',
            },
            geometry: {
              type: 'Polygon',
              coordinates: [[
                [-46.62, -23.69],
                [-46.61, -23.69],
                [-46.61, -23.68],
              ]],
            },
          },
        ],
      })) as unknown as typeof fetch;

    const provider = new OfficialArcGisProvider();

    const result = await provider.fetchDataset(
      { city: 'Diadema', uf: 'SP' },
      { fetchImpl },
    );

    expect(result.stats.total).toBe(3);
    expect(result.stats.valid).toBe(1);
    expect(result.stats.duplicates).toBe(1);
    expect(result.stats.invalid).toBe(1);
    expect(result.stats.outOfBBox).toBe(0);
  });
});
