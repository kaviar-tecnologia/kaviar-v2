import { describe, expect, it } from 'vitest';

import { acquireCityDataset } from '../src/services/territory/territorial-dataset-acquisition.service';

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

function response(body: unknown, status = 200) {
  return {
    status,
    type: 'default',
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type'
          ? 'application/json'
          : null,
    },
    text: async () =>
      typeof body === 'string'
        ? body
        : JSON.stringify(body),
  };
}

function diademaGeoJson() {
  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          objectid: 1,
          cod_bairro: 4,
          bairro: 'Centro',
        },
        geometry: polygon(),
      },
      {
        type: 'Feature',
        properties: {
          objectid: 2,
          cod_bairro: 5,
          bairro: 'Conceição',
        },
        geometry: polygon(-46.61, -23.70),
      },
    ],
  };
}

function prismaFor(territory: any) {
  const state: any = {
    created: null,
    bboxQueries: 0,
  };

  return {
    __state: state,

    operational_territories: {
      findUnique: async () => territory,
    },

    $queryRaw: async () => {
      state.bboxQueries++;
      throw new Error('bbox OSM não deveria ser consultado');
    },

    territorial_dataset_versions: {
      create: async ({ data }: any) => {
        state.created = data;
        return { id: 'dataset-1' };
      },
    },
  } as any;
}

describe('aquisição territorial — prioridade da fonte oficial', () => {
  it('Diadema/SP usa ArcGIS oficial sem consultar bbox OSM', async () => {
    const prisma = prismaFor({
      id: 't-diadema',
      name: 'Diadema',
      city_name: 'Diadema',
      uf: 'SP',
      level: 'city',
    });

    const calls: string[] = [];

    const fetchImpl = (async (url: string, init: any) => {
      calls.push(url);

      expect(init.method).toBe('GET');

      return response(diademaGeoJson());
    }) as unknown as typeof fetch;

    const result = await acquireCityDataset({
      territoryId: 't-diadema',
      prisma,
      acquisitionOptions: { fetchImpl },
      putObject: async () => {},
    });

    expect(result.ok).toBe(true);

    if (!result.ok) return;

    expect(result.provenance.providerId).toBe('official-arcgis');
    expect(result.provenance.isOfficial).toBe(true);
    expect(result.stats.valid).toBe(2);

    expect(prisma.__state.bboxQueries).toBe(0);
    expect(prisma.__state.created.provider_id).toBe('official-arcgis');
    expect(prisma.__state.created.is_official).toBe(true);

    // Verificação humana continua separada da natureza oficial da fonte.
    expect(prisma.__state.created.source_verified).toBe(false);

    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain('/MapServer/1/query');
  });

  it('falha da fonte oficial não faz downgrade silencioso para OSM', async () => {
    const prisma = prismaFor({
      id: 't-diadema',
      name: 'Diadema',
      city_name: 'Diadema',
      uf: 'SP',
      level: 'city',
    });

    let calls = 0;

    const fetchImpl = (async () => {
      calls++;
      return response({ error: 'indisponível' }, 503);
    }) as unknown as typeof fetch;

    const result = await acquireCityDataset({
      territoryId: 't-diadema',
      prisma,
      acquisitionOptions: { fetchImpl },
      putObject: async () => {},
    });

    expect(result.ok).toBe(false);

    if (result.ok) return;

    expect(result.code).toBe('OFFICIAL_HTTP_5XX');
    expect(calls).toBe(1);
    expect(prisma.__state.bboxQueries).toBe(0);
    expect(prisma.__state.created).toBeNull();
  });
});
