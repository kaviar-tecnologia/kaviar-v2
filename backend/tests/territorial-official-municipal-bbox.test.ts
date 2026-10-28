import { describe, expect, it } from 'vitest';
import { resolveMunicipalBBox } from '../src/services/territory/municipal-bbox-resolver';

function municipalityFeature(
  name = 'Saquarema',
  code = '3305505',
  uf = 'RJ',
) {
  return {
    type: 'Feature',
    properties: { CD_MUN: code, NM_MUN: name, SIGLA: uf },
    geometry: {
      type: 'MultiPolygon',
      coordinates: [[[
        [-42.60, -22.90],
        [-42.40, -22.90],
        [-42.40, -22.82],
        [-42.60, -22.82],
        [-42.60, -22.90],
      ]]],
    },
  };
}

function response(body: unknown, status = 200) {
  return {
    status,
    type: 'basic',
    headers: { get: (key: string) => key.toLowerCase() === 'content-type' ? 'application/geo+json' : null },
    text: async () => JSON.stringify(body),
  };
}

function collection(features: unknown[]) {
  return { type: 'FeatureCollection', crs: { type: 'name', properties: { name: 'EPSG:4326' } }, features };
}

const noCoveragePrisma = {
  $queryRaw: async () => { throw new Error('Cobertura existente não deveria ser consultada'); },
} as any;

describe('bbox municipal oficial GeoSaquá — Saquarema/RJ', () => {
  it('seleciona a camada municipal independente, confere código/nome/UF e dispensa OSM', async () => {
    const calls: Array<{ url: string; method: string }> = [];
    const fetchImpl = (async (url: string, init: any) => {
      calls.push({ url, method: init.method });
      return response(collection([municipalityFeature()]));
    }) as unknown as typeof fetch;

    const result = await resolveMunicipalBBox(noCoveragePrisma, 'Saquarema', 'RJ', {
      territoryId: 'saquarema',
      fetchImpl,
    });
    expect(result.code).toBe('OK');
    expect(result.source).toBe('official_municipality');
    expect(result.bbox?.minLon).toBeCloseTo(-42.65, 6);
    expect(result.bbox?.maxLon).toBeCloseTo(-42.35, 6);
    expect(result.bbox?.minLat).toBeCloseTo(-22.95, 6);
    expect(result.bbox?.maxLat).toBeCloseTo(-22.77, 6);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('GET');
    expect(calls[0].url).toContain('/Limite_Municipal/FeatureServer/0/query');
    expect(new URL(calls[0].url).searchParams.get('where')).toBe("CD_MUN='3305505'");
    expect(new URL(calls[0].url).searchParams.get('outSR')).toBe('4326');
  });

  it.each([
    ['município divergente', collection([municipalityFeature('Maricá')])],
    ['UF divergente', collection([municipalityFeature('Saquarema', '3305505', 'SP')])],
    ['código divergente', collection([municipalityFeature('Saquarema', '3304557')])],
    ['múltiplas feições', collection([municipalityFeature(), municipalityFeature()])],
    ['geometria vazia', collection([{ ...municipalityFeature(), geometry: { type: 'MultiPolygon', coordinates: [] } }])],
  ])('%s falha fechado sem tentar OSM', async (_caseName, body) => {
    let calls = 0;
    const fetchImpl = (async (_url: string, init: any) => {
      calls++;
      expect(init.method).toBe('GET');
      return response(body);
    }) as unknown as typeof fetch;
    const result = await resolveMunicipalBBox(noCoveragePrisma, 'Saquarema', 'RJ', { fetchImpl });
    expect(result.code).toBe('MUNICIPAL_BBOX_UNAVAILABLE');
    expect(result.bbox).toBeNull();
    expect(calls).toBe(1);
  });

  it('indisponibilidade HTTP oficial não causa downgrade silencioso para OSM', async () => {
    let calls = 0;
    const fetchImpl = (async (_url: string, init: any) => {
      calls++;
      expect(init.method).toBe('GET');
      return response({ error: 'unavailable' }, 503);
    }) as unknown as typeof fetch;
    const result = await resolveMunicipalBBox(noCoveragePrisma, 'Saquarema', 'RJ', { fetchImpl });
    expect(result.code).toBe('MUNICIPAL_BBOX_UNAVAILABLE');
    expect(calls).toBe(1);
  });

  it('município sem limite oficial configurado mantém consulta OSM', async () => {
    const calls: string[] = [];
    const fetchImpl = (async (_url: string, init: any) => {
      calls.push(init.method);
      return response({ elements: [{ bounds: { minlon: -46.65, maxlon: -46.58, minlat: -23.72, maxlat: -23.65 } }] });
    }) as unknown as typeof fetch;
    const result = await resolveMunicipalBBox(noCoveragePrisma, 'Diadema', 'SP', { fetchImpl });
    expect(result.code).toBe('OK');
    expect(result.source).toBe('osm_municipality');
    expect(calls).toEqual(['POST']);
  });
});
