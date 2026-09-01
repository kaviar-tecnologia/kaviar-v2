import { describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  computeBoundingBox,
  readDeclaredBoundingBox,
  expandBoundingBox,
  validateNeighborhoodGeoJSON,
  type NeighborhoodFeatureCollection,
} from '../src/services/territory/city-preparation.core';
import {
  dryRunPrepareCity,
  executePrepareCity,
  resolveExpectedBBox,
} from '../src/services/territory/city-preparation.service';
import {
  resolveDataset,
  resolveGeojsonPath,
  type TerritorialManifest,
} from '../src/services/territory/territorial-dataset-registry';

// ─────────────────────────────────────────────────────────────────────────────
// Estes testes provam que o MESMO mecanismo funciona para uma cidade que NÃO é
// Cariacica, sem nenhuma lógica especial de cidade. A "cidade" aqui é uma
// fixture sintética ("Vila Fictícia" / UF "ZZ") posicionada numa região
// arbitrária (lon~20, lat~10) — bem longe de Cariacica/ES.
// ─────────────────────────────────────────────────────────────────────────────

const FIXTURE_PATH = path.join(__dirname, 'fixtures/vila_ficticia_bairros.geojson');
const fixtureFC: NeighborhoodFeatureCollection = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));

const FIC_TERRITORY = {
  id: 'terr-ficticia', name: 'Vila Fictícia', level: 'city', status: 'planning',
  uf: 'ZZ', city_name: 'Vila Fictícia', regulatory_status: 'not_evaluated', coverage_status: 'NOT_LOADED',
};

// ─── bbox genérico ────────────────────────────────────────────────────────────

describe('bbox genérico (sem constante de cidade)', () => {
  it('computeBoundingBox deriva a extensão do arquivo', () => {
    const bbox = computeBoundingBox(fixtureFC);
    expect(bbox).not.toBeNull();
    // Fixture está em torno de lon 20, lat 10 (NÃO Cariacica ~ -40,-20)
    expect(bbox!.minLon).toBeGreaterThan(19);
    expect(bbox!.maxLon).toBeLessThan(21);
    expect(bbox!.minLat).toBeGreaterThan(9);
    expect(bbox!.maxLat).toBeLessThan(11);
  });

  it('readDeclaredBoundingBox lê bbox declarado no topo (RFC 7946)', () => {
    const withBBox: any = { ...fixtureFC, bbox: [19.9, 9.9, 20.2, 10.2] };
    const declared = readDeclaredBoundingBox(withBBox);
    expect(declared).toEqual({ minLon: 19.9, minLat: 9.9, maxLon: 20.2, maxLat: 10.2 });
  });

  it('resolveExpectedBBox: explícito > declarado > derivado', () => {
    const explicit = { minLon: 0, maxLon: 1, minLat: 0, maxLat: 1 };
    // 1) explícito vence
    expect(resolveExpectedBBox({ territoryId: 't', bbox: explicit } as any, fixtureFC)).toEqual(explicit);
    // 2) null explícito = pular (retorna null)
    expect(resolveExpectedBBox({ territoryId: 't', bbox: null } as any, fixtureFC)).toBeNull();
    // 3) sem bbox e sem metadados → derivado do arquivo (não-nulo)
    const derived = resolveExpectedBBox({ territoryId: 't' } as any, fixtureFC);
    expect(derived).not.toBeNull();
  });

  it('validação aceita a cidade fictícia usando bbox derivado', () => {
    const derived = expandBoundingBox(computeBoundingBox(fixtureFC)!, 0.5);
    const result = validateNeighborhoodGeoJSON(fixtureFC, {
      expectedCity: 'Vila Fictícia', expectedUf: 'ZZ', bbox: derived,
    });
    expect(result.ok).toBe(true);
    expect(result.valid).toHaveLength(5);
    expect(result.invalid).toHaveLength(0);
  });
});

// ─── registro genérico de datasets ───────────────────────────────────────────

describe('registro genérico de datasets (por city+uf)', () => {
  const manifest: TerritorialManifest = {
    version: 1,
    datasets: [
      { city: 'Vila Fictícia', uf: 'ZZ', file: 'vila_ficticia_bairros.geojson', sourceVerified: false },
      { city: 'Outra Cidade', uf: 'YY', file: 'outra.geojson', sourceVerified: true },
    ],
  };

  it('resolve por city+uf (case-insensitive)', () => {
    const ds = resolveDataset('vila fictícia', 'zz', manifest);
    expect(ds?.file).toBe('vila_ficticia_bairros.geojson');
    expect(ds?.sourceVerified).toBe(false);
  });

  it('retorna null para cidade não registrada', () => {
    expect(resolveDataset('Cidade Inexistente', 'XX', manifest)).toBeNull();
  });

  it('resolveGeojsonPath monta caminho absoluto do dataset', () => {
    const r = resolveGeojsonPath('Outra Cidade', 'YY', manifest);
    expect(r).not.toBeNull();
    expect(r!.filePath.endsWith('outra.geojson')).toBe(true);
  });
});

// ─── Prisma mock genérico ────────────────────────────────────────────────────

function createPrismaMock(territory: any = FIC_TERRITORY) {
  const state = {
    territory,
    neighborhoods: [] as any[],
    geofences: new Map<string, any>(),
    managers: [{ admin: { name: 'Gestor Fictício', is_active: true } }],
    counters: { create: 0, update: 0, execraw: 0 },
  };
  const prisma: any = {
    __state: state,
    operational_territories: {
      findUnique: async ({ where }: any) => (state.territory && state.territory.id === where.id ? { ...state.territory } : null),
    },
    territory_manager_assignments: { findMany: async () => state.managers },
    neighborhoods: {
      findMany: async ({ where }: any) =>
        state.neighborhoods.filter((n) => n.city === where.city).map((n) => ({
          id: n.id, name: n.name, territory_id: n.territory_id,
          neighborhood_geofences: state.geofences.has(n.id) ? { id: state.geofences.get(n.id).id } : null,
        })),
      findFirst: async ({ where }: any) => {
        const f = state.neighborhoods.find((n) => n.name === where.name && n.city === where.city);
        return f ? { id: f.id } : null;
      },
      create: async ({ data }: any) => { state.counters.create++; state.neighborhoods.push({ ...data }); return { ...data }; },
      update: async ({ where, data }: any) => {
        state.counters.update++;
        const r = state.neighborhoods.find((n) => n.id === where.id);
        if (r) Object.assign(r, { area_type: data.area_type ?? r.area_type, territory_id: data.territory_id ?? r.territory_id });
        return { ...r };
      },
    },
    $executeRaw: async (_s: TemplateStringsArray, ...v: any[]) => {
      state.counters.execraw++;
      state.geofences.set(v[1], { id: v[0], neighborhood_id: v[1] });
      return 1;
    },
  };
  return prisma;
}

describe('fluxo genérico com cidade fictícia (mesmo mecanismo, sem Cariacica)', () => {
  it('dry-run não grava e produz plano correto', async () => {
    const prisma = createPrismaMock();
    const { plan } = await dryRunPrepareCity({
      territoryId: 'terr-ficticia', geojson: fixtureFC, city: 'Vila Fictícia', prisma,
    });
    expect(plan.city).toBe('Vila Fictícia');
    expect(plan.uf).toBe('ZZ');
    expect(plan.totals.validNeighborhoods).toBe(5);
    expect(plan.totals.toCreate).toBe(5);
    expect(plan.canProceed).toBe(true);
    expect(prisma.__state.counters.create).toBe(0);
    expect(prisma.__state.counters.execraw).toBe(0);
  });

  it('execução grava e é idempotente na 2ª vez', async () => {
    const prisma = createPrismaMock();
    const first = await executePrepareCity({ territoryId: 'terr-ficticia', geojson: fixtureFC, city: 'Vila Fictícia', prisma });
    expect(first.created).toBe(5);
    expect(first.geofencesWritten).toBe(5);
    expect(first.linkedToTerritory).toBe(5);
    expect(prisma.__state.neighborhoods.every((n: any) => n.territory_id === 'terr-ficticia')).toBe(true);

    const second = await executePrepareCity({ territoryId: 'terr-ficticia', geojson: fixtureFC, city: 'Vila Fictícia', prisma });
    expect(second.created).toBe(0);
    expect(second.updated).toBe(5);
    expect(second.linkedToTerritory).toBe(0);
    expect(prisma.__state.neighborhoods).toHaveLength(5); // sem duplicar
  });

  it('mantém Planejamento/modalidades: o serviço não altera o território', async () => {
    const prisma = createPrismaMock();
    await executePrepareCity({ territoryId: 'terr-ficticia', geojson: fixtureFC, city: 'Vila Fictícia', prisma });
    // território permanece intacto (o mock não expõe update de território e o serviço não o chama)
    expect(prisma.__state.territory.status).toBe('planning');
  });
});
