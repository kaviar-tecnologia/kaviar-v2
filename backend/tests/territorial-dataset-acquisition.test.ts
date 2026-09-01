import { describe, it, expect } from 'vitest';
import {
  OpenStreetMapProvider,
  OverpassAcquisitionError,
  OVERPASS_MIRRORS,
} from '../src/services/territory/providers/openstreetmap-provider';
import { acquireCityDataset } from '../src/services/territory/territorial-dataset-acquisition.service';

// ─── Fixtures Overpass ────────────────────────────────────────────────────────

function ring(lng: number, lat: number, d = 0.01) {
  return [
    { lon: lng - d, lat: lat - d }, { lon: lng + d, lat: lat - d },
    { lon: lng + d, lat: lat + d }, { lon: lng - d, lat: lat + d }, { lon: lng - d, lat: lat - d },
  ];
}
function suburbRelation(id: number, name: string, lng: number, lat: number) {
  return { type: 'relation', id, tags: { name, place: 'suburb' },
    members: [{ type: 'way', ref: id * 10, role: 'outer', geometry: ring(lng, lat) }] };
}
function overpassJson(elements: any[]) {
  return JSON.stringify({ version: 0.6, generator: 'Overpass API', elements });
}

// Cariacica-like bbox (para testes que precisem de bbox)
const BBOX = { minLon: -40.75, maxLon: -40.25, minLat: -20.6, maxLat: -19.95 };
const CITY = -40.42, LAT = -20.30;

// Fake Response helper
function jsonResponse(body: string, { status = 200, contentType = 'application/json' as string | null } = {}) {
  return {
    status,
    type: 'default',
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? contentType : null) },
    text: async () => body,
  };
}

// fetch fake configurável por sequência de respostas/erros por chamada
function makeFetch(seq: Array<() => Promise<any>>) {
  let i = 0;
  const calls: string[] = [];
  const fn = (async (url: string) => {
    calls.push(url);
    const step = seq[Math.min(i, seq.length - 1)];
    i++;
    return step();
  }) as unknown as typeof fetch;
  (fn as any).calls = calls;
  return fn;
}

// ─── Provider: sucesso, cidade+UF, rawSource, proveniência ───────────────────

describe('OpenStreetMapProvider.fetchDataset — sucesso', () => {
  it('retorna features válidas, rawSource preservado e proveniência correta (OSM não oficial)', async () => {
    const raw = overpassJson([suburbRelation(1, 'Campo Grande', CITY, LAT), suburbRelation(2, 'Jardim América', CITY + 0.02, LAT + 0.02)]);
    const fetchImpl = makeFetch([() => Promise.resolve(jsonResponse(raw))]);
    const provider = new OpenStreetMapProvider({ bbox: BBOX });
    const ds = await provider.fetchDataset({ city: 'Cariacica', uf: 'ES' }, { fetchImpl });

    expect(ds.stats.valid).toBe(2);
    expect(ds.featureCollection.features).toHaveLength(2);
    // rawSource é a resposta bruta (tem 'generator'), não o normalizado
    expect((ds.rawSource as any).generator).toBe('Overpass API');
    // proveniência
    expect(ds.provenance.providerId).toBe('osm-overpass');
    expect(ds.provenance.isOfficial).toBe(false);
    expect(ds.provenance.method).toBe('overpass-api');
    expect(ds.provenance.sourceUrl).toBe(OVERPASS_MIRRORS[0]);
    expect(ds.provenance.query).toContain('Espírito Santo'); // UF entrou na query
    expect(ds.provenance.sourceIds).toContain('relation/1');
    // não existe sourceVerified na proveniência do provider
    expect((ds.provenance as any).sourceVerified).toBeUndefined();
  });

  it('a query usa cidade + UF (buildOverpassQuery com uf)', async () => {
    const fetchImpl = makeFetch([() => Promise.resolve(jsonResponse(overpassJson([suburbRelation(1, 'X', CITY, LAT)])))]);
    const provider = new OpenStreetMapProvider({ bbox: BBOX });
    const ds = await provider.fetchDataset({ city: 'Cariacica', uf: 'ES' }, { fetchImpl });
    expect(ds.provenance.query).toContain('rel["name"="Espírito Santo"]["admin_level"="4"]');
    expect(ds.provenance.query).toContain('rel["name"="Cariacica"]["admin_level"="8"]');
  });
});

// ─── Robustez: timeout, abort, mirrors, HTTP, content-type, JSON, limites ────

describe('OpenStreetMapProvider — robustez', () => {
  it('timeout: aborta e falha em todos os mirrors', async () => {
    // fetch que nunca resolve até o abort disparar
    const hanging = ((_url: string, init: any) => new Promise((_resolve, reject) => {
      const rej = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      if (init.signal.aborted) return rej();
      init.signal.addEventListener('abort', rej, { once: true });
    })) as unknown as typeof fetch;
    const provider = new OpenStreetMapProvider({ timeoutMs: 30, maxAttemptsPerMirror: 1, backoffBaseMs: 1 });
    await expect(provider.fetchDataset({ city: 'X', uf: 'ES' }, { fetchImpl: hanging }))
      .rejects.toMatchObject({ code: 'ALL_MIRRORS_FAILED' });
  });

  it('AbortController externo cancela a requisição', async () => {
    const ac = new AbortController();
    const hanging = ((_url: string, init: any) => new Promise((_resolve, reject) => {
      const rej = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      if (init.signal.aborted) return rej();
      init.signal.addEventListener('abort', rej, { once: true });
    })) as unknown as typeof fetch;
    const provider = new OpenStreetMapProvider({ timeoutMs: 5000, maxAttemptsPerMirror: 1, backoffBaseMs: 1 });
    const p = provider.fetchDataset({ city: 'X', uf: 'ES' }, { fetchImpl: hanging, signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ code: 'ALL_MIRRORS_FAILED' });
  });

  it('mirror principal falha (5xx) e fallback funciona', async () => {
    const raw = overpassJson([suburbRelation(1, 'X', CITY, LAT)]);
    const fetchImpl = makeFetch([
      () => Promise.resolve(jsonResponse('err', { status: 502 })), // mirror 1 tentativa 1
      () => Promise.resolve(jsonResponse('err', { status: 502 })), // mirror 1 tentativa 2
      () => Promise.resolve(jsonResponse(raw)),                    // mirror 2
    ]);
    const provider = new OpenStreetMapProvider({ bbox: BBOX, maxAttemptsPerMirror: 2, backoffBaseMs: 1 });
    const ds = await provider.fetchDataset({ city: 'Cariacica', uf: 'ES' }, { fetchImpl });
    expect(ds.stats.valid).toBe(1);
    expect(ds.provenance.sourceUrl).toBe(OVERPASS_MIRRORS[1]); // usou o fallback
  });

  it('todos os mirrors falham → ALL_MIRRORS_FAILED', async () => {
    const fetchImpl = makeFetch([() => Promise.resolve(jsonResponse('err', { status: 500 }))]);
    const provider = new OpenStreetMapProvider({ maxAttemptsPerMirror: 1, backoffBaseMs: 1 });
    await expect(provider.fetchDataset({ city: 'X', uf: 'ES' }, { fetchImpl }))
      .rejects.toMatchObject({ code: 'ALL_MIRRORS_FAILED' });
  });

  it('4xx é tratado como falha', async () => {
    const fetchImpl = makeFetch([() => Promise.resolve(jsonResponse('bad', { status: 400 }))]);
    const provider = new OpenStreetMapProvider({ maxAttemptsPerMirror: 1, backoffBaseMs: 1, mirrors: [OVERPASS_MIRRORS[0]] });
    await expect(provider.fetchDataset({ city: 'X', uf: 'ES' }, { fetchImpl }))
      .rejects.toMatchObject({ code: 'ALL_MIRRORS_FAILED' });
  });

  it('Content-Type inválido → rejeita', async () => {
    const fetchImpl = makeFetch([() => Promise.resolve(jsonResponse('<html>', { contentType: 'text/html' }))]);
    const provider = new OpenStreetMapProvider({ maxAttemptsPerMirror: 1, backoffBaseMs: 1, mirrors: [OVERPASS_MIRRORS[0]] });
    await expect(provider.fetchDataset({ city: 'X', uf: 'ES' }, { fetchImpl }))
      .rejects.toMatchObject({ code: 'ALL_MIRRORS_FAILED' });
  });

  it('JSON inválido → rejeita', async () => {
    const fetchImpl = makeFetch([() => Promise.resolve(jsonResponse('{ not json', { contentType: 'application/json' }))]);
    const provider = new OpenStreetMapProvider({ maxAttemptsPerMirror: 1, backoffBaseMs: 1, mirrors: [OVERPASS_MIRRORS[0]] });
    await expect(provider.fetchDataset({ city: 'X', uf: 'ES' }, { fetchImpl }))
      .rejects.toMatchObject({ code: 'ALL_MIRRORS_FAILED' });
  });

  it('redirect é bloqueado (SSRF)', async () => {
    const fetchImpl = makeFetch([() => Promise.resolve({ status: 302, type: 'opaqueredirect', headers: { get: () => null }, text: async () => '' })]);
    const provider = new OpenStreetMapProvider({ maxAttemptsPerMirror: 1, backoffBaseMs: 1, mirrors: [OVERPASS_MIRRORS[0]] });
    await expect(provider.fetchDataset({ city: 'X', uf: 'ES' }, { fetchImpl }))
      .rejects.toMatchObject({ code: 'ALL_MIRRORS_FAILED' });
  });

  it('payload maior que o limite → RESPONSE_TOO_LARGE (via content-length)', async () => {
    const big = () => Promise.resolve({
      status: 200, type: 'default',
      headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'application/json' : h.toLowerCase() === 'content-length' ? '999999999' : null) },
      text: async () => '{"elements":[]}',
    });
    const provider = new OpenStreetMapProvider({ maxAttemptsPerMirror: 1, backoffBaseMs: 1, mirrors: [OVERPASS_MIRRORS[0]], maxResponseBytes: 1000 });
    await expect(provider.fetchDataset({ city: 'X', uf: 'ES' }, { fetchImpl: big as any }))
      .rejects.toMatchObject({ code: 'ALL_MIRRORS_FAILED' });
  });

  it('excesso de elementos → TOO_MANY_ELEMENTS', async () => {
    const many = Array.from({ length: 5 }, (_, i) => suburbRelation(i + 1, 'B' + i, CITY, LAT));
    const fetchImpl = makeFetch([() => Promise.resolve(jsonResponse(overpassJson(many)))]);
    const provider = new OpenStreetMapProvider({ bbox: null, maxElements: 3, maxAttemptsPerMirror: 1, mirrors: [OVERPASS_MIRRORS[0]] });
    await expect(provider.fetchDataset({ city: 'X', uf: 'ES' }, { fetchImpl }))
      .rejects.toMatchObject({ code: 'TOO_MANY_ELEMENTS' });
  });
});

// ─── Qualidade: zero válidas, bbox, geometria inválida, dedupe ───────────────

describe('OpenStreetMapProvider — qualidade dos dados', () => {
  it('zero features válidas quando geometria é inválida', async () => {
    const bad = overpassJson([{ type: 'relation', id: 9, tags: { name: 'SemGeom', place: 'suburb' }, members: [] }]);
    const fetchImpl = makeFetch([() => Promise.resolve(jsonResponse(bad))]);
    const provider = new OpenStreetMapProvider({ bbox: BBOX, mirrors: [OVERPASS_MIRRORS[0]] });
    const ds = await provider.fetchDataset({ city: 'X', uf: 'ES' }, { fetchImpl });
    expect(ds.stats.valid).toBe(0);
    expect(ds.stats.invalid).toBe(1);
  });

  it('conta fora de bbox', async () => {
    const raw = overpassJson([suburbRelation(1, 'Perto', CITY, LAT), suburbRelation(2, 'Longe', -43.2, -22.9)]);
    const fetchImpl = makeFetch([() => Promise.resolve(jsonResponse(raw))]);
    const provider = new OpenStreetMapProvider({ bbox: BBOX, mirrors: [OVERPASS_MIRRORS[0]] });
    const ds = await provider.fetchDataset({ city: 'X', uf: 'ES' }, { fetchImpl });
    expect(ds.stats.valid).toBe(1);
    expect(ds.stats.outOfBBox).toBe(1);
  });

  it('deduplica por nome', async () => {
    const raw = overpassJson([suburbRelation(1, 'Tiradentes', CITY, LAT), suburbRelation(2, 'tiradentes', CITY + 0.02, LAT + 0.02)]);
    const fetchImpl = makeFetch([() => Promise.resolve(jsonResponse(raw))]);
    const provider = new OpenStreetMapProvider({ bbox: BBOX, mirrors: [OVERPASS_MIRRORS[0]] });
    const ds = await provider.fetchDataset({ city: 'X', uf: 'ES' }, { fetchImpl });
    expect(ds.stats.valid).toBe(1);
    expect(ds.stats.duplicates).toBe(1);
  });
});

// ─── Serviço de aquisição: DRAFT, source_verified false, sem escrita indevida ─

function prismaWithTerritory(territory: any) {
  const state: any = { territory, created: null };
  const prisma: any = {
    __state: state,
    operational_territories: { findUnique: async () => territory },
    territorial_dataset_versions: { create: async ({ data }: any) => { state.created = data; return { id: 'dsv-1' }; } },
    // Guardas: se algo tentar escrever nestas, o teste falha.
    neighborhoods: { create: async () => { throw new Error('NÃO deve criar neighborhoods'); }, update: async () => { throw new Error('NÃO deve alterar neighborhoods'); } },
    neighborhood_geofences: { create: async () => { throw new Error('NÃO deve criar geofences'); } },
    $executeRaw: async () => { throw new Error('NÃO deve gravar geofence (raw)'); },
  };
  return prisma;
}

describe('acquireCityDataset — persistência DRAFT e segurança', () => {
  const territory = { id: 't1', name: 'Cariacica', city_name: 'Cariacica', uf: 'ES', level: 'city' };

  it('sucesso: grava 3 objetos S3 + linha DRAFT; source_verified=false; sem tocar neighborhoods/geofences', async () => {
    const raw = overpassJson([suburbRelation(1, 'Campo Grande', CITY, LAT)]);
    const fetchImpl = makeFetch([() => Promise.resolve(jsonResponse(raw))]);
    const puts: Record<string, string> = {};
    const putObject = async (_b: string, k: string, body: string) => { puts[k] = body; };
    const prisma = prismaWithTerritory(territory);
    const provider = new OpenStreetMapProvider({ bbox: BBOX, mirrors: [OVERPASS_MIRRORS[0]] });

    const res = await acquireCityDataset({ territoryId: 't1', provider, acquisitionOptions: { fetchImpl }, prisma, putObject, createdBy: 'admin-x' });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.datasetVersionId).toBe('dsv-1');
    expect(res.stats.valid).toBe(1);
    // 3 objetos S3
    expect(Object.keys(puts).some((k) => k.endsWith('/raw.json'))).toBe(true);
    expect(Object.keys(puts).some((k) => k.endsWith('/normalized.geojson'))).toBe(true);
    expect(Object.keys(puts).some((k) => k.endsWith('/provenance.json'))).toBe(true);
    // linha DRAFT com source_verified=false / is_official=false / status DRAFT
    expect(prisma.__state.created.status).toBe('DRAFT');
    expect(prisma.__state.created.source_verified).toBe(false);
    expect(prisma.__state.created.is_official).toBe(false);
    expect(prisma.__state.created.provider_id).toBe('osm-overpass');
  });

  it('zero features válidas → NÃO persiste (NO_VALID_FEATURES), sem criar linha nem S3', async () => {
    const bad = overpassJson([{ type: 'relation', id: 9, tags: { name: 'SemGeom', place: 'suburb' }, members: [] }]);
    const fetchImpl = makeFetch([() => Promise.resolve(jsonResponse(bad))]);
    let putCalled = false;
    const putObject = async () => { putCalled = true; };
    const prisma = prismaWithTerritory(territory);
    const provider = new OpenStreetMapProvider({ bbox: BBOX, mirrors: [OVERPASS_MIRRORS[0]] });

    const res = await acquireCityDataset({ territoryId: 't1', provider, acquisitionOptions: { fetchImpl }, prisma, putObject });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('NO_VALID_FEATURES');
    expect(putCalled).toBe(false);
    expect(prisma.__state.created).toBeNull();
  });

  it('território sem UF → CITY_UF_MISSING, sem escrita', async () => {
    const prisma = prismaWithTerritory({ id: 't1', name: 'X', city_name: 'X', uf: '', level: 'city' });
    const res = await acquireCityDataset({ territoryId: 't1', provider: new OpenStreetMapProvider(), prisma });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.code).toBe('CITY_UF_MISSING');
    expect(prisma.__state.created).toBeNull();
  });

  it('falha externa (todos mirrors) → ACQUISITION_FAILED/ALL_MIRRORS_FAILED, sem persistir', async () => {
    const fetchImpl = makeFetch([() => Promise.resolve(jsonResponse('err', { status: 500 }))]);
    const prisma = prismaWithTerritory(territory);
    const provider = new OpenStreetMapProvider({ maxAttemptsPerMirror: 1, backoffBaseMs: 1 });
    const res = await acquireCityDataset({ territoryId: 't1', provider, acquisitionOptions: { fetchImpl }, prisma });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(prisma.__state.created).toBeNull();
  });
});
