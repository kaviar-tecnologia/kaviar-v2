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
      provider.supports({ city: 'Saquarema', uf: 'RJ' }),
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

  it('Saquarema/RJ usa o campo Name e preserva o ID FID do GeoSaquá', async () => {
    let calledUrl = '';
    const fetchImpl = (async (url: string) => {
      calledUrl = url;
      return response({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            properties: { FID: 11, Name: 'Itaúna', dsdist: '1º Distrito' },
            geometry: polygon(-42.49, -22.93),
          },
          {
            type: 'Feature',
            properties: { FID: 12, Name: 'Jaconé', dsdist: '3º Distrito' },
            geometry: polygon(-42.61, -22.94),
          },
        ],
      });
    }) as unknown as typeof fetch;

    const result = await new OfficialArcGisProvider().fetchDataset(
      { city: 'Saquarema', uf: 'RJ' },
      { fetchImpl },
    );

    const url = new URL(calledUrl);
    expect(url.pathname).toContain('/Limites_de_Bairros___Saquarema_WFL1_view/FeatureServer/0/query');
    expect(url.searchParams.get('outFields')).toBe('FID,Name,dsdist');
    expect(url.searchParams.get('f')).toBe('geojson');
    expect(url.searchParams.get('outSR')).toBe('4326');
    expect(result.stats).toEqual({ total: 2, valid: 2, invalid: 0, duplicates: 0, outOfBBox: 0 });
    expect(result.featureCollection.features.map((f: any) => f.properties.name)).toEqual(['Itaúna', 'Jaconé']);
    expect(result.featureCollection.features.map((f: any) => f.properties.area_type)).toEqual([
      'BAIRRO_OFICIAL', 'BAIRRO_OFICIAL',
    ]);
    expect(result.provenance.sourceIds).toEqual([
      'geosaqua-bairros:objectid:11',
      'geosaqua-bairros:objectid:12',
    ]);
    expect(result.provenance.isOfficial).toBe(true);
    expect(result.provenance.sourceUrl).toContain('services8.arcgis.com');
  });

  it('Saquarema aplica somente cinco grafias legais e preserva os 46 polígonos e FIDs', async () => {
    const namesByDistrict: Record<string, string[]> = {
      Bacaxá: [
        'Água Branca', 'Alvorada', 'Asfalto Velho', 'Aterrado', 'Bacaxá',
        'Bairro de Fátima', 'Barreira', 'Bicuíba', 'Bonsucesso', "Caixa d' Água",
        'Comum', 'Condado de Bacaxá', 'Engenho Grande', 'Madressilva',
        'Morro dos Pregos', 'Palmital', 'Parque Marina', 'Porto da Roça II',
        'Raia', 'Retiro', "Rio d' Areia", 'Rio Seco', 'São Geraldo', 'Verde Vale',
      ],
      'Sampaio Correia': [
        'Basileia', 'Jaconé', 'Rio Mole', 'Sampaio Correia',
        'Serra de Mato Grosso', 'Tinguí',
      ],
      Saquarema: [
        'Areal', 'Barra Nova', 'Boqueirão', 'Centro', 'Coqueiral',
        'Gravatá', 'Guarani', 'Ipitangas', 'Itaúna', 'Jardim',
        'Jardim Ipitangas', 'Leigos', 'Mombaça', 'Porto da Roça I',
        'Porto Novo', 'Vilatur',
      ],
    };
    const overrides: Record<string, string> = {
      "Caixa d' Água": 'Caixa d’Água',
      "Rio d' Areia": 'Rio d’Areia',
      Basileia: 'Basiléa',
      'Serra de Mato Grosso': 'Serra do Mato Grosso',
      Tinguí: 'Tingui',
    };
    const sourceRows = Object.entries(namesByDistrict).flatMap(
      ([dsdist, names]) => names.map((Name) => ({ Name, dsdist })),
    );
    expect(sourceRows).toHaveLength(46);

    const raw = {
      type: 'FeatureCollection',
      features: sourceRows.map(({ Name, dsdist }, index) => ({
        type: 'Feature',
        properties: { FID: index + 1, Name, dsdist },
        geometry: polygon(-42.65 + index * 0.005, -22.92),
      })),
    };
    const fetchImpl = (async () => response(raw)) as unknown as typeof fetch;
    const result = await new OfficialArcGisProvider().fetchDataset(
      { city: 'Saquarema', uf: 'RJ' }, { fetchImpl },
    );

    expect(result.stats).toEqual({
      total: 46, valid: 46, invalid: 0, duplicates: 0, outOfBBox: 0,
    });
    expect(result.rawSource).toEqual(raw);
    expect(result.provenance.sourceIds).toHaveLength(46);
    expect(new Set(result.provenance.sourceIds).size).toBe(46);

    result.featureCollection.features.forEach((feature: any, index: number) => {
      const original = raw.features[index];
      expect(feature.properties.name).toBe(overrides[original.properties.Name] ?? original.properties.Name);
      expect(feature.properties.Name).toBe(original.properties.Name);
      expect(feature.properties.FID).toBe(original.properties.FID);
      expect(feature.properties.dsdist).toBe(original.properties.dsdist);
      expect(feature.geometry).toEqual(original.geometry);
    });
    expect(result.featureCollection.features.find(
      (feature: any) => feature.properties.Name === 'Barra Nova',
    )?.properties.name).toBe('Barra Nova');
    expect(new Set(result.featureCollection.features.map(
      (feature: any) => feature.properties.name,
    )).size).toBe(46);
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
