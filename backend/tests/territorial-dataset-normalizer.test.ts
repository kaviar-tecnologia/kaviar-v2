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
  it('gera query genérica com o nome da cidade e escapa aspas', () => {
    expect(buildOverpassQuery('Cariacica')).toContain('rel["name"="Cariacica"]');
    expect(buildOverpassQuery('São "X"')).toContain('São \\"X\\"');
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
