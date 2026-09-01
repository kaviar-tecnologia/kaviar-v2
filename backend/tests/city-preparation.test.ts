import { describe, expect, it, beforeEach } from 'vitest';
import {
  validateNeighborhoodGeoJSON,
  buildCityPreparationPlan,
  normalizeNeighborhoodName,
  CARIACICA_BBOX,
  type NeighborhoodFeatureCollection,
  type TerritoryInfo,
  type ManagerInfo,
  type ExistingNeighborhood,
} from '../src/services/territory/city-preparation.core';
import {
  dryRunPrepareCity,
  executePrepareCity,
  loadExistingNeighborhoods,
} from '../src/services/territory/city-preparation.service';

// ─── Helpers de geometria ────────────────────────────────────────────────────

// Quadrado válido dentro do bbox de Cariacica (anel fechado, >=4 pts, WGS84).
function squareInCariacica(lon = -40.42, lat = -20.30, d = 0.005): number[][] {
  return [
    [lon, lat],
    [lon + d, lat],
    [lon + d, lat + d],
    [lon, lat + d],
    [lon, lat], // fecha o anel
  ];
}

function feature(name: string, ring: number[][], extraProps: Record<string, any> = {}) {
  return {
    type: 'Feature' as const,
    properties: {
      name,
      city: 'Cariacica',
      uf: 'ES',
      area_type: 'BAIRRO_OFICIAL',
      source: 'OpenStreetMap (IBGE)',
      source_url: 'https://overpass-api.de/api/interpreter',
      center_lat: -20.3,
      center_lng: -40.42,
      ...extraProps,
    },
    geometry: { type: 'Polygon' as const, coordinates: [ring] },
  };
}

function fc(features: any[]): NeighborhoodFeatureCollection {
  return { type: 'FeatureCollection', features };
}

const CARIACICA_TERRITORY: TerritoryInfo = {
  found: true,
  id: 'terr-cariacica',
  name: 'Cariacica',
  level: 'city',
  status: 'planning',
  uf: 'ES',
  cityName: 'Cariacica',
  regulatoryStatus: 'not_evaluated',
  coverageStatus: 'NOT_LOADED',
};

const MANAGER_PRESENT: ManagerInfo = { found: true, count: 1, names: ['George Gabriel Sabbagh Cordero'] };

// ─── 1. Validação de GeoJSON ─────────────────────────────────────────────────

describe('validateNeighborhoodGeoJSON', () => {
  it('aceita bairros válidos dentro do bbox de Cariacica', () => {
    const result = validateNeighborhoodGeoJSON(
      fc([feature('Campo Grande', squareInCariacica(-40.42, -20.32)), feature('Jardim América', squareInCariacica(-40.40, -20.30))]),
      { expectedCity: 'Cariacica', expectedUf: 'ES', bbox: CARIACICA_BBOX },
    );
    expect(result.ok).toBe(true);
    expect(result.valid).toHaveLength(2);
    expect(result.invalid).toHaveLength(0);
    expect(result.duplicates).toHaveLength(0);
  });

  it('rejeita geometria inválida: anel não fechado', () => {
    const openRing = [[-40.42, -20.30], [-40.41, -20.30], [-40.41, -20.29]]; // 3 pts, não fecha
    const result = validateNeighborhoodGeoJSON(fc([feature('Aberto', openRing)]), {
      expectedCity: 'Cariacica', bbox: CARIACICA_BBOX,
    });
    expect(result.ok).toBe(false);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid[0].reason).toMatch(/menos de 4 pontos|não fechado/);
  });

  it('rejeita geometria fora de WGS84', () => {
    const bad = [[-999, -20.3], [-40.41, -20.30], [-40.41, -20.29], [-999, -20.3]];
    const result = validateNeighborhoodGeoJSON(fc([feature('ForaWGS84', bad)]), {
      expectedCity: 'Cariacica', bbox: null,
    });
    expect(result.ok).toBe(false);
    expect(result.invalid[0].reason).toMatch(/WGS84|área da cidade/);
  });

  it('rejeita coordenada fora da área da cidade (compatibilidade geográfica)', () => {
    // Ponto do Rio de Janeiro — válido WGS84 mas fora do bbox de Cariacica
    const rio = [[-43.17, -22.90], [-43.16, -22.90], [-43.16, -22.89], [-43.17, -22.90]];
    const result = validateNeighborhoodGeoJSON(fc([feature('BairroDoRio', rio)]), {
      expectedCity: 'Cariacica', bbox: CARIACICA_BBOX,
    });
    expect(result.ok).toBe(false);
    expect(result.invalid[0].reason).toMatch(/área da cidade/);
  });

  it('detecta duplicidade de nomes no arquivo', () => {
    const result = validateNeighborhoodGeoJSON(
      fc([feature('Tiradentes', squareInCariacica(-40.42, -20.32)), feature('Tiradentes', squareInCariacica(-40.40, -20.30))]),
      { expectedCity: 'Cariacica', bbox: CARIACICA_BBOX },
    );
    expect(result.ok).toBe(false);
    expect(result.duplicates).toContain('tiradentes');
  });

  it('rejeita feature sem nome', () => {
    const f = feature('X', squareInCariacica());
    delete (f.properties as any).name;
    const result = validateNeighborhoodGeoJSON(fc([f]), { expectedCity: 'Cariacica', bbox: CARIACICA_BBOX });
    expect(result.invalid[0].reason).toMatch(/sem nome/);
  });

  it('rejeita cidade divergente (isolamento na origem)', () => {
    const result = validateNeighborhoodGeoJSON(
      fc([feature('Copacabana', squareInCariacica(), { city: 'Rio de Janeiro' })]),
      { expectedCity: 'Cariacica', bbox: CARIACICA_BBOX },
    );
    expect(result.ok).toBe(false);
    expect(result.invalid[0].reason).toMatch(/cidade divergente/);
  });
});

// ─── 2. Plano dry-run ─────────────────────────────────────────────────────────

describe('buildCityPreparationPlan', () => {
  it('classifica create vs update e conta vínculo territorial', () => {
    const validation = validateNeighborhoodGeoJSON(
      fc([feature('Campo Grande', squareInCariacica(-40.42, -20.32)), feature('Novo Bairro', squareInCariacica(-40.40, -20.30))]),
      { expectedCity: 'Cariacica', bbox: CARIACICA_BBOX },
    );
    const existing: ExistingNeighborhood[] = [
      { id: 'n1', name: 'Campo Grande', territory_id: null, hasGeofence: false },
    ];
    const plan = buildCityPreparationPlan({
      city: 'Cariacica', uf: 'ES', validation, territory: CARIACICA_TERRITORY, manager: MANAGER_PRESENT, existing,
    });
    expect(plan.totals.toCreate).toBe(1); // Novo Bairro
    expect(plan.totals.toUpdate).toBe(1); // Campo Grande já existe
    expect(plan.totals.toLinkTerritory).toBe(2); // ambos precisam vincular (existente estava sem territory_id)
    expect(plan.canProceed).toBe(true);
  });

  it('não permite prosseguir sem território', () => {
    const validation = validateNeighborhoodGeoJSON(fc([feature('Campo Grande', squareInCariacica())]), {
      expectedCity: 'Cariacica', bbox: CARIACICA_BBOX,
    });
    const noTerritory: TerritoryInfo = { ...CARIACICA_TERRITORY, found: false, id: null };
    const plan = buildCityPreparationPlan({
      city: 'Cariacica', uf: 'ES', validation, territory: noTerritory, manager: MANAGER_PRESENT, existing: [],
    });
    expect(plan.canProceed).toBe(false);
    expect(plan.risks.join(' ')).toMatch(/não foi encontrado/);
  });

  it('não permite prosseguir com duplicidade no arquivo', () => {
    const validation = validateNeighborhoodGeoJSON(
      fc([feature('Tiradentes', squareInCariacica(-40.42, -20.32)), feature('Tiradentes', squareInCariacica(-40.40, -20.30))]),
      { expectedCity: 'Cariacica', bbox: CARIACICA_BBOX },
    );
    const plan = buildCityPreparationPlan({
      city: 'Cariacica', uf: 'ES', validation, territory: CARIACICA_TERRITORY, manager: MANAGER_PRESENT, existing: [],
    });
    expect(plan.canProceed).toBe(false);
  });

  it('sinaliza pendência regulatória e não sugere liberar modalidades', () => {
    const validation = validateNeighborhoodGeoJSON(fc([feature('Campo Grande', squareInCariacica())]), {
      expectedCity: 'Cariacica', bbox: CARIACICA_BBOX,
    });
    const plan = buildCityPreparationPlan({
      city: 'Cariacica', uf: 'ES', validation,
      territory: { ...CARIACICA_TERRITORY, regulatoryStatus: 'credentialing_required' },
      manager: MANAGER_PRESENT, existing: [],
    });
    expect(plan.risks.join(' ')).toMatch(/regulat/i);
    expect(plan.risks.join(' ')).toMatch(/compliance municipal/i);
  });

  it('não vincula novamente bairro já ligado ao território (idempotência do plano)', () => {
    const validation = validateNeighborhoodGeoJSON(fc([feature('Campo Grande', squareInCariacica())]), {
      expectedCity: 'Cariacica', bbox: CARIACICA_BBOX,
    });
    const existing: ExistingNeighborhood[] = [
      { id: 'n1', name: 'Campo Grande', territory_id: 'terr-cariacica', hasGeofence: true },
    ];
    const plan = buildCityPreparationPlan({
      city: 'Cariacica', uf: 'ES', validation, territory: CARIACICA_TERRITORY, manager: MANAGER_PRESENT, existing,
    });
    expect(plan.totals.toUpdate).toBe(1);
    expect(plan.totals.toLinkTerritory).toBe(0); // já vinculado
  });
});

// ─── 3. Prisma mock em memória para o serviço ────────────────────────────────

interface NeighborhoodRow {
  id: string;
  name: string;
  city: string;
  area_type: string | null;
  territory_id: string | null;
  center_lat: any;
  center_lng: any;
  is_active: boolean;
}

function createPrismaMock(seed?: {
  territory?: any;
  neighborhoods?: NeighborhoodRow[];
  managers?: any[];
}) {
  const state = {
    territory: seed?.territory ?? {
      id: 'terr-cariacica', name: 'Cariacica', level: 'city', status: 'planning',
      uf: 'ES', city_name: 'Cariacica', regulatory_status: 'not_evaluated', coverage_status: 'NOT_LOADED',
    },
    neighborhoods: (seed?.neighborhoods ?? []) as NeighborhoodRow[],
    geofences: new Map<string, any>(), // neighborhood_id -> row
    managers: seed?.managers ?? [
      { admin: { name: 'George Gabriel Sabbagh Cordero', is_active: true } },
    ],
    counters: { createCalls: 0, updateCalls: 0, executeRawCalls: 0 },
  };

  const prisma: any = {
    __state: state,
    operational_territories: {
      findUnique: async ({ where }: any) =>
        state.territory && state.territory.id === where.id ? { ...state.territory } : null,
    },
    territory_manager_assignments: {
      findMany: async () => state.managers,
    },
    neighborhoods: {
      findMany: async ({ where, select }: any) => {
        // Isolamento: filtra por city
        return state.neighborhoods
          .filter((n) => n.city === where.city)
          .map((n) => ({
            id: n.id,
            name: n.name,
            territory_id: n.territory_id,
            neighborhood_geofences: state.geofences.has(n.id) ? { id: state.geofences.get(n.id).id } : null,
          }));
      },
      findFirst: async ({ where }: any) => {
        const found = state.neighborhoods.find((n) => n.name === where.name && n.city === where.city);
        return found ? { id: found.id } : null;
      },
      create: async ({ data }: any) => {
        state.counters.createCalls++;
        const row: NeighborhoodRow = {
          id: data.id, name: data.name, city: data.city, area_type: data.area_type,
          territory_id: data.territory_id ?? null, center_lat: data.center_lat ?? null,
          center_lng: data.center_lng ?? null, is_active: data.is_active ?? true,
        };
        state.neighborhoods.push(row);
        return { ...row };
      },
      update: async ({ where, data }: any) => {
        state.counters.updateCalls++;
        const row = state.neighborhoods.find((n) => n.id === where.id);
        if (row) {
          if (data.area_type !== undefined) row.area_type = data.area_type;
          if (data.territory_id !== undefined) row.territory_id = data.territory_id;
          if (data.center_lat !== undefined) row.center_lat = data.center_lat;
          if (data.center_lng !== undefined) row.center_lng = data.center_lng;
        }
        return { ...row };
      },
    },
    // Tagged template: (strings, ...values)
    $executeRaw: async (_strings: TemplateStringsArray, ...values: any[]) => {
      state.counters.executeRawCalls++;
      // values[0]=geofenceId, [1]=neighborhoodId, [2]=geofence_type, [3]=coordinates json, ...
      const neighborhoodId = values[1];
      state.geofences.set(neighborhoodId, { id: values[0], neighborhood_id: neighborhoodId, geofence_type: values[2] });
      return 1;
    },
  };
  return prisma;
}

// GeoJSON de Cariacica com 3 bairros válidos
const cariacicaGeoJSON = fc([
  feature('Campo Grande', squareInCariacica(-40.42, -20.32)),
  feature('Jardim América', squareInCariacica(-40.40, -20.30)),
  feature('Alto Lage', squareInCariacica(-40.41, -20.31)),
]);

describe('dryRunPrepareCity (serviço) — não grava', () => {
  it('produz plano sem nenhuma escrita no banco', async () => {
    const prisma = createPrismaMock();
    const { plan } = await dryRunPrepareCity({
      territoryId: 'terr-cariacica', geojson: cariacicaGeoJSON, prisma,
    });
    expect(plan.city).toBe('Cariacica');
    expect(plan.uf).toBe('ES');
    expect(plan.totals.validNeighborhoods).toBe(3);
    expect(plan.totals.toCreate).toBe(3);
    expect(plan.canProceed).toBe(true);
    expect(plan.manager.found).toBe(true);
    // NENHUMA escrita
    expect(prisma.__state.counters.createCalls).toBe(0);
    expect(prisma.__state.counters.updateCalls).toBe(0);
    expect(prisma.__state.counters.executeRawCalls).toBe(0);
    expect(prisma.__state.neighborhoods).toHaveLength(0);
  });
});

describe('executePrepareCity (serviço) — grava com autorização', () => {
  it('cria bairros, grava geofences e vincula territory_id', async () => {
    const prisma = createPrismaMock();
    const result = await executePrepareCity({
      territoryId: 'terr-cariacica', geojson: cariacicaGeoJSON, prisma,
    });
    expect(result.created).toBe(3);
    expect(result.updated).toBe(0);
    expect(result.geofencesWritten).toBe(3);
    expect(result.linkedToTerritory).toBe(3);
    // Todos vinculados ao território correto
    expect(prisma.__state.neighborhoods.every((n: any) => n.territory_id === 'terr-cariacica')).toBe(true);
    expect(prisma.__state.neighborhoods.every((n: any) => n.area_type === 'BAIRRO_OFICIAL')).toBe(true);
    // Geofence gravada para cada bairro
    expect(prisma.__state.geofences.size).toBe(3);
  });

  it('é idempotente: 2ª execução não duplica (0 created)', async () => {
    const prisma = createPrismaMock();
    await executePrepareCity({ territoryId: 'terr-cariacica', geojson: cariacicaGeoJSON, prisma });
    const second = await executePrepareCity({ territoryId: 'terr-cariacica', geojson: cariacicaGeoJSON, prisma });

    expect(second.created).toBe(0);
    expect(second.updated).toBe(3);
    expect(second.linkedToTerritory).toBe(0); // já vinculados
    // Total de bairros permanece 3 (sem duplicação)
    expect(prisma.__state.neighborhoods).toHaveLength(3);
    expect(prisma.__state.geofences.size).toBe(3);
  });

  it('recusa execução quando não pode prosseguir (sem território)', async () => {
    const prisma = createPrismaMock({ territory: null });
    await expect(
      executePrepareCity({ territoryId: 'inexistente', geojson: cariacicaGeoJSON, prisma }),
    ).rejects.toThrow();
    expect(prisma.__state.neighborhoods).toHaveLength(0);
  });
});

// ─── 4. Isolamento entre cidades / regressão RJ-SP ───────────────────────────

describe('Isolamento entre cidades (sem regressão RJ/SP)', () => {
  it('loadExistingNeighborhoods filtra estritamente por city', async () => {
    const prisma = createPrismaMock({
      neighborhoods: [
        { id: 'rj1', name: 'Copacabana', city: 'Rio de Janeiro', area_type: 'BAIRRO_OFICIAL', territory_id: 'terr-rj', center_lat: null, center_lng: null, is_active: true },
        { id: 'sp1', name: 'Sé', city: 'São Paulo', area_type: 'DISTRITO', territory_id: 'terr-sp', center_lat: null, center_lng: null, is_active: true },
        { id: 'ca1', name: 'Campo Grande', city: 'Cariacica', area_type: 'BAIRRO_OFICIAL', territory_id: 'terr-cariacica', center_lat: null, center_lng: null, is_active: true },
      ],
    });
    const cariacica = await loadExistingNeighborhoods(prisma, 'Cariacica');
    expect(cariacica).toHaveLength(1);
    expect(cariacica[0].name).toBe('Campo Grande');
  });

  it('executar Cariacica não altera bairros de RJ/SP', async () => {
    const prisma = createPrismaMock({
      neighborhoods: [
        { id: 'rj1', name: 'Copacabana', city: 'Rio de Janeiro', area_type: 'BAIRRO_OFICIAL', territory_id: 'terr-rj', center_lat: -22.98, center_lng: -43.19, is_active: true },
        { id: 'sp1', name: 'Sé', city: 'São Paulo', area_type: 'DISTRITO', territory_id: 'terr-sp', center_lat: -23.55, center_lng: -46.63, is_active: true },
      ],
    });

    const rjBefore = JSON.stringify(prisma.__state.neighborhoods.find((n: any) => n.id === 'rj1'));
    const spBefore = JSON.stringify(prisma.__state.neighborhoods.find((n: any) => n.id === 'sp1'));

    await executePrepareCity({ territoryId: 'terr-cariacica', geojson: cariacicaGeoJSON, prisma });

    const rjAfter = JSON.stringify(prisma.__state.neighborhoods.find((n: any) => n.id === 'rj1'));
    const spAfter = JSON.stringify(prisma.__state.neighborhoods.find((n: any) => n.id === 'sp1'));

    expect(rjAfter).toBe(rjBefore); // Copacabana intacto
    expect(spAfter).toBe(spBefore); // Sé intacto
    // Cariacica adicionou 3 bairros novos (total 5)
    expect(prisma.__state.neighborhoods).toHaveLength(5);
    // Geofences só para os 3 de Cariacica
    expect(prisma.__state.geofences.size).toBe(3);
  });
});

// ─── 5. normalizeNeighborhoodName ─────────────────────────────────────────────

describe('normalizeNeighborhoodName', () => {
  it('normaliza espaços e caixa', () => {
    expect(normalizeNeighborhoodName('  Campo   Grande ')).toBe('campo grande');
    expect(normalizeNeighborhoodName('Jardim América')).toBe('jardim américa');
  });
});
