import { describe, it, expect, beforeEach } from 'vitest';
import {
  normalizeOverpassToGeoJSON,
  buildOverpassQuery,
  type OverpassResponse,
} from '../src/services/territory/osm-geojson-normalizer';
import {
  registerProvider,
  clearProviders,
  getProvidersByPriority,
  selectProvider,
  type TerritorialDatasetProvider,
} from '../src/services/territory/providers/territorial-dataset-provider';
import {
  citySlug,
  buildDatasetKeys,
  checksumOf,
  persistDatasetVersion,
} from '../src/services/territory/territorial-dataset-store';

// Região fictícia (lon ~ -40.4, lat ~ -20.3), NÃO hardcoded no core.
const BBOX = { minLon: -40.75, maxLon: -40.25, minLat: -20.6, maxLat: -19.95 };

// Helpers para montar geometria Overpass (ways com pontos {lat,lon}).
function wayGeom(lng: number, lat: number, d = 0.01) {
  return [
    { lon: lng - d, lat: lat - d },
    { lon: lng + d, lat: lat - d },
    { lon: lng + d, lat: lat + d },
    { lon: lng - d, lat: lat + d },
    { lon: lng - d, lat: lat - d },
  ];
}
// Relation com um único outer (fechado) → Polygon
function relationPolygon(id: number, name: string, lng: number, lat: number, extraTags = {}) {
  return {
    type: 'relation' as const,
    id,
    tags: { name, place: 'suburb', ...extraTags },
    members: [{ type: 'way' as const, ref: id * 10, role: 'outer', geometry: wayGeom(lng, lat) }],
  };
}
// Relation com dois outers → MultiPolygon
function relationMultiPolygon(id: number, name: string, lng: number, lat: number) {
  return {
    type: 'relation' as const,
    id,
    tags: { name, place: 'suburb' },
    members: [
      { type: 'way' as const, ref: id * 10, role: 'outer', geometry: wayGeom(lng, lat) },
      { type: 'way' as const, ref: id * 10 + 1, role: 'outer', geometry: wayGeom(lng + 0.05, lat + 0.05) },
    ],
  };
}
// Way fechado direto → Polygon
function wayPolygon(id: number, name: string, lng: number, lat: number) {
  return { type: 'way' as const, id, tags: { name, place: 'neighbourhood' }, geometry: wayGeom(lng, lat) };
}

describe('normalizeOverpassToGeoJSON', () => {
  const opts = { expectedCity: 'Cidade Teste', expectedUf: 'ZZ', bbox: BBOX };

  it('converte relation (Polygon) e way (Polygon)', () => {
    const resp: OverpassResponse = {
      elements: [
        relationPolygon(1, 'Bairro A', -40.42, -20.30),
        wayPolygon(2, 'Bairro B', -40.40, -20.31),
      ],
    };
    const r = normalizeOverpassToGeoJSON(resp, opts);
    expect(r.stats.valid).toBe(2);
    expect(r.featureCollection.features.map((f) => f.geometry.type)).toEqual(['Polygon', 'Polygon']);
    expect(r.osmIds).toEqual(['relation/1', 'way/2']);
    // properties técnicas
    expect(r.featureCollection.features[0].properties.area_type).toBe('BAIRRO_OFICIAL');
    expect(r.featureCollection.features[0].properties.city).toBe('Cidade Teste');
  });

  it('monta MultiPolygon quando há múltiplos outers', () => {
    const resp: OverpassResponse = { elements: [relationMultiPolygon(3, 'Bairro C', -40.41, -20.29)] };
    const r = normalizeOverpassToGeoJSON(resp, opts);
    expect(r.stats.valid).toBe(1);
    expect(r.featureCollection.features[0].geometry.type).toBe('MultiPolygon');
    expect((r.featureCollection.features[0].geometry.coordinates as any[]).length).toBe(2);
  });

  it('deduplica por nome (case-insensitive)', () => {
    const resp: OverpassResponse = {
      elements: [
        relationPolygon(4, 'Tiradentes', -40.42, -20.30),
        relationPolygon(5, 'tiradentes', -40.40, -20.31),
      ],
    };
    const r = normalizeOverpassToGeoJSON(resp, opts);
    expect(r.stats.valid).toBe(1);
    expect(r.stats.duplicates).toBe(1);
  });

  it('conta e descarta geometria inválida', () => {
    const resp: OverpassResponse = {
      elements: [
        { type: 'relation', id: 6, tags: { name: 'SemGeom', place: 'suburb' }, members: [] },
        relationPolygon(7, 'Bairro Ok', -40.42, -20.30),
      ],
    };
    const r = normalizeOverpassToGeoJSON(resp, opts);
    expect(r.stats.valid).toBe(1);
    expect(r.stats.invalid).toBe(1);
  });

  it('conta e descarta feature fora do bbox esperado', () => {
    const resp: OverpassResponse = {
      elements: [
        relationPolygon(8, 'Bairro Perto', -40.42, -20.30),
        relationPolygon(9, 'Bairro Longe', -43.20, -22.90), // Rio de Janeiro (fora do bbox)
      ],
    };
    const r = normalizeOverpassToGeoJSON(resp, opts);
    expect(r.stats.valid).toBe(1);
    expect(r.stats.outOfBBox).toBe(1);
  });

  it('sem bbox: não descarta por região (só WGS84)', () => {
    const resp: OverpassResponse = { elements: [relationPolygon(10, 'Qualquer', -43.20, -22.90)] };
    const r = normalizeOverpassToGeoJSON(resp, { expectedCity: 'X', expectedUf: 'YY', bbox: null });
    expect(r.stats.valid).toBe(1);
    expect(r.stats.outOfBBox).toBe(0);
  });

  it('ignora elementos que não são bairros (ex.: admin_level 9 / sem place)', () => {
    const resp: OverpassResponse = {
      elements: [
        { type: 'relation', id: 11, tags: { name: 'Distrito X', admin_level: '9', boundary: 'administrative' }, members: [{ type: 'way', ref: 111, role: 'outer', geometry: wayGeom(-40.42, -20.30) }] },
        relationPolygon(12, 'Bairro Real', -40.40, -20.31),
      ],
    };
    const r = normalizeOverpassToGeoJSON(resp, opts);
    expect(r.stats.valid).toBe(1);
    expect(r.featureCollection.features[0].properties.name).toBe('Bairro Real');
  });

  it('rejeita coordenada fora de WGS84', () => {
    const bad = { type: 'relation' as const, id: 13, tags: { name: 'Bug', place: 'suburb' },
      members: [{ type: 'way' as const, ref: 130, role: 'outer', geometry: [ { lon: -999, lat: -20.3 }, { lon: -40.4, lat: -20.3 }, { lon: -40.4, lat: -20.29 }, { lon: -999, lat: -20.3 } ] }] };
    const r = normalizeOverpassToGeoJSON({ elements: [bad] }, { expectedCity: 'X', expectedUf: 'YY', bbox: null });
    expect(r.stats.valid).toBe(0);
    expect(r.stats.invalid).toBe(1);
  });
});

describe('buildOverpassQuery', () => {
  it('sem UF: resolve só pelo nome do município', () => {
    const q = buildOverpassQuery('Cariacica');
    expect(q).toContain('rel["name"="Cariacica"]["admin_level"="8"]');
    expect(q).not.toContain('admin_level"="4"');
  });

  it('com UF: restringe ao estado (admin_level 4) para desambiguar homônimos', () => {
    const q = buildOverpassQuery({ city: 'Cariacica', uf: 'ES' });
    expect(q).toContain('rel["name"="Espírito Santo"]["admin_level"="4"]');
    expect(q).toContain('map_to_area->.st;');
    expect(q).toContain('(area.st)');
    expect(q).toContain('rel["name"="Cariacica"]["admin_level"="8"]');
  });

  it('aceita assinatura (city, uf) e escapa aspas', () => {
    const q = buildOverpassQuery('São "X"', 'SP');
    expect(q).toContain('São \\"X\\"');
    expect(q).toContain('São Paulo'); // nome do estado de SP
  });
});

describe('MultiPolygon com inner: associação ao outer correto', () => {
  const opts = { expectedCity: 'X', expectedUf: 'YY', bbox: null };

  // outer grande em A, outer grande em B distante, e um inner (buraco) dentro de B.
  function relTwoOutersInnerInSecond() {
    // Outer A ~ (0,0), Outer B ~ (10,10). Inner pequeno dentro de B.
    const bigA = [ { lon: -0.1, lat: -0.1 }, { lon: 0.1, lat: -0.1 }, { lon: 0.1, lat: 0.1 }, { lon: -0.1, lat: 0.1 }, { lon: -0.1, lat: -0.1 } ];
    const bigB = [ { lon: 9.9, lat: 9.9 }, { lon: 10.1, lat: 9.9 }, { lon: 10.1, lat: 10.1 }, { lon: 9.9, lat: 10.1 }, { lon: 9.9, lat: 9.9 } ];
    const innerB = [ { lon: 9.99, lat: 9.99 }, { lon: 10.01, lat: 9.99 }, { lon: 10.01, lat: 10.01 }, { lon: 9.99, lat: 10.01 }, { lon: 9.99, lat: 9.99 } ];
    return {
      type: 'relation' as const, id: 100, tags: { name: 'Multi', place: 'suburb' },
      members: [
        { type: 'way' as const, ref: 1, role: 'outer', geometry: bigA },
        { type: 'way' as const, ref: 2, role: 'outer', geometry: bigB },
        { type: 'way' as const, ref: 3, role: 'inner', geometry: innerB },
      ],
    };
  }

  it('atribui o inner ao segundo outer (que o contém), não ao primeiro', () => {
    const r = normalizeOverpassToGeoJSON({ elements: [relTwoOutersInnerInSecond()] }, opts);
    expect(r.stats.valid).toBe(1);
    const geom = r.featureCollection.features[0].geometry as any;
    expect(geom.type).toBe('MultiPolygon');
    // Polygon do outer A: só 1 anel (sem buraco). Polygon do outer B: 2 anéis (com o inner).
    const ringCounts = geom.coordinates.map((poly: any[]) => poly.length).sort();
    expect(ringCounts).toEqual([1, 2]);
    // O polígono com 2 anéis deve ser o que contém o ponto ~ (10,10)
    const withHole = geom.coordinates.find((poly: any[]) => poly.length === 2);
    expect(withHole[0][0][0]).toBeGreaterThan(5); // outer B fica em lon ~10
  });

  it('rejeita (não suportado) quando um inner não pertence a nenhum outer', () => {
    const bigA = [ { lon: -0.1, lat: -0.1 }, { lon: 0.1, lat: -0.1 }, { lon: 0.1, lat: 0.1 }, { lon: -0.1, lat: 0.1 }, { lon: -0.1, lat: -0.1 } ];
    const bigB = [ { lon: 10, lat: 10 }, { lon: 10.2, lat: 10 }, { lon: 10.2, lat: 10.2 }, { lon: 10, lat: 10.2 }, { lon: 10, lat: 10 } ];
    const orphanInner = [ { lon: 50, lat: 50 }, { lon: 50.1, lat: 50 }, { lon: 50.1, lat: 50.1 }, { lon: 50, lat: 50.1 }, { lon: 50, lat: 50 } ];
    const rel = { type: 'relation' as const, id: 101, tags: { name: 'Orfao', place: 'suburb' },
      members: [
        { type: 'way' as const, ref: 1, role: 'outer', geometry: bigA },
        { type: 'way' as const, ref: 2, role: 'outer', geometry: bigB },
        { type: 'way' as const, ref: 3, role: 'inner', geometry: orphanInner },
      ] };
    const r = normalizeOverpassToGeoJSON({ elements: [rel] }, opts);
    expect(r.stats.valid).toBe(0);
    expect(r.stats.invalid).toBe(1);
  });
});

describe('Polygon com único outer: inner deve estar contido', () => {
  const opts = { expectedCity: 'X', expectedUf: 'YY', bbox: null };
  const outer = [
    { lon: 0, lat: 0 }, { lon: 1, lat: 0 }, { lon: 1, lat: 1 }, { lon: 0, lat: 1 }, { lon: 0, lat: 0 },
  ];

  it('1 outer + inner DENTRO → Polygon válido com buraco', () => {
    const innerIn = [
      { lon: 0.4, lat: 0.4 }, { lon: 0.6, lat: 0.4 }, { lon: 0.6, lat: 0.6 }, { lon: 0.4, lat: 0.6 }, { lon: 0.4, lat: 0.4 },
    ];
    const rel = { type: 'relation' as const, id: 300, tags: { name: 'ComBuraco', place: 'suburb' },
      members: [
        { type: 'way' as const, ref: 1, role: 'outer', geometry: outer },
        { type: 'way' as const, ref: 2, role: 'inner', geometry: innerIn },
      ] };
    const r = normalizeOverpassToGeoJSON({ elements: [rel] }, opts);
    expect(r.stats.valid).toBe(1);
    const geom = r.featureCollection.features[0].geometry as any;
    expect(geom.type).toBe('Polygon');
    expect(geom.coordinates).toHaveLength(2); // outer + 1 buraco
  });

  it('1 outer + inner FORA → rejeitado (não suportado/inválido)', () => {
    const innerOut = [
      { lon: 5, lat: 5 }, { lon: 5.1, lat: 5 }, { lon: 5.1, lat: 5.1 }, { lon: 5, lat: 5.1 }, { lon: 5, lat: 5 },
    ];
    const rel = { type: 'relation' as const, id: 301, tags: { name: 'BuracoFora', place: 'suburb' },
      members: [
        { type: 'way' as const, ref: 1, role: 'outer', geometry: outer },
        { type: 'way' as const, ref: 2, role: 'inner', geometry: innerOut },
      ] };
    const r = normalizeOverpassToGeoJSON({ elements: [rel] }, opts);
    expect(r.stats.valid).toBe(0);
    expect(r.stats.invalid).toBe(1);
  });
});

describe('não fechar artificialmente ways desconectados', () => {
  const opts = { expectedCity: 'X', expectedUf: 'YY', bbox: null };

  it('relation com segmentos conectáveis que FECHAM → aceita', () => {
    // Dois segmentos que juntos formam um quadrado fechado.
    const segA = [ { lon: 0, lat: 0 }, { lon: 1, lat: 0 }, { lon: 1, lat: 1 } ];
    const segB = [ { lon: 1, lat: 1 }, { lon: 0, lat: 1 }, { lon: 0, lat: 0 } ];
    const rel = { type: 'relation' as const, id: 400, tags: { name: 'Fecha', place: 'suburb' },
      members: [
        { type: 'way' as const, ref: 1, role: 'outer', geometry: segA },
        { type: 'way' as const, ref: 2, role: 'outer', geometry: segB },
      ] };
    const r = normalizeOverpassToGeoJSON({ elements: [rel] }, opts);
    expect(r.stats.valid).toBe(1);
    expect((r.featureCollection.features[0].geometry as any).type).toBe('Polygon');
  });

  it('relation com segmento faltando (não fecha) → rejeita (não inventa fechamento)', () => {
    // Falta o segmento de volta; extremidades não coincidem.
    const segA = [ { lon: 0, lat: 0 }, { lon: 1, lat: 0 }, { lon: 1, lat: 1 } ];
    const segB = [ { lon: 1, lat: 1 }, { lon: 0.5, lat: 1 } ]; // termina em (0.5,1) != (0,0)
    const rel = { type: 'relation' as const, id: 401, tags: { name: 'NaoFecha', place: 'suburb' },
      members: [
        { type: 'way' as const, ref: 1, role: 'outer', geometry: segA },
        { type: 'way' as const, ref: 2, role: 'outer', geometry: segB },
      ] };
    const r = normalizeOverpassToGeoJSON({ elements: [rel] }, opts);
    expect(r.stats.valid).toBe(0);
    expect(r.stats.invalid).toBe(1);
  });

  it('way FECHADO → aceita', () => {
    const closed = { type: 'way' as const, id: 402, tags: { name: 'WayFechado', place: 'neighbourhood' },
      geometry: [ { lon: 0, lat: 0 }, { lon: 1, lat: 0 }, { lon: 1, lat: 1 }, { lon: 0, lat: 1 }, { lon: 0, lat: 0 } ] };
    const r = normalizeOverpassToGeoJSON({ elements: [closed] }, opts);
    expect(r.stats.valid).toBe(1);
  });

  it('way ABERTO → rejeita (não fecha automaticamente)', () => {
    const open = { type: 'way' as const, id: 403, tags: { name: 'WayAberto', place: 'neighbourhood' },
      geometry: [ { lon: 0, lat: 0 }, { lon: 1, lat: 0 }, { lon: 1, lat: 1 }, { lon: 0, lat: 1 } ] }; // não fecha
    const r = normalizeOverpassToGeoJSON({ elements: [open] }, opts);
    expect(r.stats.valid).toBe(0);
    expect(r.stats.invalid).toBe(1);
  });
});

describe('bbox: valida ENVELOPE inteiro, não só o primeiro ponto', () => {
  it('rejeita geometria cujo primeiro vértice está dentro mas a maior parte está fora', () => {
    // Primeiro vértice dentro do bbox (perto de -40.42/-20.30), mas polígono se
    // estende muito para fora (lng -30). Deve contar como outOfBBox.
    const bbox = { minLon: -40.75, maxLon: -40.25, minLat: -20.6, maxLat: -19.95 };
    const geom = [
      { lon: -40.42, lat: -20.30 }, // dentro
      { lon: -30.00, lat: -20.30 }, // muito fora (leste)
      { lon: -30.00, lat: -20.29 },
      { lon: -40.42, lat: -20.29 },
      { lon: -40.42, lat: -20.30 },
    ];
    const rel = { type: 'relation' as const, id: 200, tags: { name: 'Vaza', place: 'suburb' },
      members: [{ type: 'way' as const, ref: 1, role: 'outer', geometry: geom }] };
    const r = normalizeOverpassToGeoJSON({ elements: [rel] }, { expectedCity: 'X', expectedUf: 'ES', bbox });
    expect(r.stats.valid).toBe(0);
    expect(r.stats.outOfBBox).toBe(1);
  });

  it('aceita geometria com envelope totalmente dentro do bbox', () => {
    const bbox = { minLon: -40.75, maxLon: -40.25, minLat: -20.6, maxLat: -19.95 };
    const geom = [
      { lon: -40.42, lat: -20.30 }, { lon: -40.40, lat: -20.30 },
      { lon: -40.40, lat: -20.29 }, { lon: -40.42, lat: -20.29 }, { lon: -40.42, lat: -20.30 },
    ];
    const rel = { type: 'relation' as const, id: 201, tags: { name: 'Dentro', place: 'suburb' },
      members: [{ type: 'way' as const, ref: 1, role: 'outer', geometry: geom }] };
    const r = normalizeOverpassToGeoJSON({ elements: [rel] }, { expectedCity: 'X', expectedUf: 'ES', bbox });
    expect(r.stats.valid).toBe(1);
    expect(r.stats.outOfBBox).toBe(0);
  });
});

describe('registro de providers (prioridade)', () => {
  beforeEach(() => clearProviders());

  function makeProvider(id: string, isOfficial: boolean, priority: number, supports = true): TerritorialDatasetProvider {
    return {
      id, isOfficial, priority,
      supports: () => supports,
      fetchDataset: async () => { throw new Error('not used'); },
    };
  }

  it('ordena oficiais antes de comunitários, depois por priority', () => {
    registerProvider(makeProvider('osm', false, 100));
    registerProvider(makeProvider('ibge', true, 50));
    registerProvider(makeProvider('geosampa', true, 10));
    const order = getProvidersByPriority().map((p) => p.id);
    expect(order).toEqual(['geosampa', 'ibge', 'osm']);
  });

  it('selectProvider escolhe o primeiro que suporta', async () => {
    registerProvider(makeProvider('official-no', true, 10, false)); // não suporta
    registerProvider(makeProvider('osm', false, 100, true));
    const chosen = await selectProvider({ city: 'X', uf: 'YY' });
    expect(chosen?.id).toBe('osm');
  });

  it('registerProvider é idempotente por id', () => {
    registerProvider(makeProvider('osm', false, 100));
    registerProvider(makeProvider('osm', false, 5));
    const list = getProvidersByPriority().filter((p) => p.id === 'osm');
    expect(list).toHaveLength(1);
    expect(list[0].priority).toBe(5);
  });
});

describe('territorial-dataset-store (helpers puros)', () => {
  it('citySlug remove acentos/espaços', () => {
    expect(citySlug('São Paulo')).toBe('sao-paulo');
    expect(citySlug('Cariacica')).toBe('cariacica');
  });

  it('buildDatasetKeys monta chaves determinísticas por UF/cidade/versão', () => {
    const keys = buildDatasetKeys('es', 'Cariacica', 'v1');
    expect(keys.normalized).toBe('territorial-datasets/ES/cariacica/v1/normalized.geojson');
    expect(keys.raw).toBe('territorial-datasets/ES/cariacica/v1/raw.json');
    expect(keys.provenance).toBe('territorial-datasets/ES/cariacica/v1/provenance.json');
  });

  it('checksumOf é estável para o mesmo conteúdo', () => {
    const a = checksumOf({ type: 'FeatureCollection', features: [] });
    const b = checksumOf({ type: 'FeatureCollection', features: [] });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('persistDatasetVersion: raw/normalized/provenance distintos + source_verified forçado false', () => {
  function buildAcquired(overrides = {}) {
    const fc = { type: 'FeatureCollection', name: 'x_bairros', features: [
      { type: 'Feature', properties: { name: 'A', city: 'X', uf: 'YY', area_type: 'BAIRRO_OFICIAL' }, geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } },
    ] };
    return {
      rawSource: { elements: [{ type: 'relation', id: 1, tags: { name: 'A' } }], generator: 'overpass' },
      featureCollection: fc,
      provenance: {
        providerId: 'osm-overpass', source: 'OpenStreetMap', sourceUrl: 'https://overpass-api.de',
        method: 'overpass-api', collectedAt: new Date().toISOString(), isOfficial: false,
        query: '[out:json];', sourceIds: ['relation/1'], notes: 'comunitário',
      },
      stats: { total: 1, valid: 1, invalid: 0, duplicates: 0, outOfBBox: 0 },
      ...overrides,
    } as any;
  }

  it('grava raw.json = rawSource, normalized = FeatureCollection, provenance = proveniência (três conteúdos distintos)', async () => {
    const puts: Record<string, string> = {};
    const putObject = async (_bucket: string, key: string, body: string) => { puts[key] = body; };
    const prismaMock = { territorial_dataset_versions: { create: async ({ data }: any) => { prismaMock._last = data; return { id: 'row-1' }; } } } as any;

    const acquired = buildAcquired();
    const res = await persistDatasetVersion(
      { city: 'X', uf: 'yy', acquired, createdBy: 'admin-1', version: 'v1' },
      { prisma: prismaMock, putObject },
    );

    const raw = JSON.parse(puts['territorial-datasets/YY/x/v1/raw.json']);
    const normalized = JSON.parse(puts['territorial-datasets/YY/x/v1/normalized.geojson']);
    const provenance = JSON.parse(puts['territorial-datasets/YY/x/v1/provenance.json']);

    // raw = resposta bruta (tem 'generator'/'elements'), NÃO é proveniência
    expect(raw.generator).toBe('overpass');
    expect(raw.provider_id).toBeUndefined();
    // normalized = FeatureCollection
    expect(normalized.type).toBe('FeatureCollection');
    expect(normalized.features).toHaveLength(1);
    // provenance = metadados
    expect(provenance.providerId).toBe('osm-overpass');
    // três conteúdos distintos
    expect(puts['territorial-datasets/YY/x/v1/raw.json']).not.toBe(puts['territorial-datasets/YY/x/v1/normalized.geojson']);
    expect(puts['territorial-datasets/YY/x/v1/raw.json']).not.toBe(puts['territorial-datasets/YY/x/v1/provenance.json']);
    expect(puts['territorial-datasets/YY/x/v1/normalized.geojson']).not.toBe(puts['territorial-datasets/YY/x/v1/provenance.json']);
    // checksum e id retornados
    expect(res.id).toBe('row-1');
    expect(res.checksum).toMatch(/^[0-9a-f]{64}$/);
    // metadados: source_verified sempre false
    expect(prismaMock._last.source_verified).toBe(false);
    expect(prismaMock._last.is_official).toBe(false);
    expect(prismaMock._last.status).toBe('DRAFT');
  });

  it('provider NÃO consegue marcar fonte como verificada — source_verified permanece false mesmo se a proveniência tentar', async () => {
    const putObject = async () => {};
    const prismaMock = { territorial_dataset_versions: { create: async ({ data }: any) => { prismaMock._last = data; return { id: 'row-2' }; } } } as any;
    // Simula provider malicioso/errado injetando sourceVerified/is_official=true na proveniência.
    const acquired = buildAcquired({ provenance: {
      providerId: 'evil', source: 'x', sourceUrl: null, method: 'm', collectedAt: new Date().toISOString(),
      isOfficial: true, sourceVerified: true, // não deve influenciar source_verified
    } });
    await persistDatasetVersion({ city: 'X', uf: 'YY', acquired, version: 'v2' }, { prisma: prismaMock, putObject });
    expect(prismaMock._last.source_verified).toBe(false); // FORÇADO false
  });
});
