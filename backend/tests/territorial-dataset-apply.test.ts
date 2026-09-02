import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { applyDatasetVersion } from '../src/services/territory/territorial-dataset-apply.service';

// ─── Fixtures GeoJSON ────────────────────────────────────────────────────────

const CITY = 'Cariacica';
const UF = 'ES';
const TERRITORY = { id: 'terr-cariacica', name: 'Cariacica', city_name: 'Cariacica', uf: 'ES', level: 'city', status: 'planning' };

// Coordenadas próximas (dentro de um bbox derivado do próprio arquivo).
function polygon(name: string): any {
  return {
    type: 'Feature',
    properties: { name, city: CITY, uf: UF, source: 'OSM', source_url: 'https://osm' },
    geometry: {
      type: 'Polygon',
      coordinates: [[[-40.42, -20.26], [-40.40, -20.26], [-40.40, -20.24], [-40.42, -20.24], [-40.42, -20.26]]],
    },
  };
}
function multiPolygon(name: string): any {
  return {
    type: 'Feature',
    properties: { name, city: CITY, uf: UF, source: 'OSM', source_url: 'https://osm' },
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [[[-40.42, -20.26], [-40.41, -20.26], [-40.41, -20.25], [-40.42, -20.25], [-40.42, -20.26]]],
        [[[-40.40, -20.24], [-40.39, -20.24], [-40.39, -20.23], [-40.40, -20.23], [-40.40, -20.24]]],
      ],
    },
  };
}
function fc(...features: any[]): any {
  return { type: 'FeatureCollection', features };
}
function bodyOf(collection: any): string { return JSON.stringify(collection); }
function checksumOf(body: string): string { return createHash('sha256').update(body).digest('hex'); }

const VALID_FC = fc(polygon('Centro'), multiPolygon('Campo Grande'));
const VALID_BODY = bodyOf(VALID_FC);
const VALID_CHECKSUM = checksumOf(VALID_BODY);

function versionRow(over: any = {}): any {
  return {
    id: 'v1', city: CITY, uf: UF, territory_id: 'terr-cariacica',
    provider_id: 'osm', source: 'OSM', source_url: null, method: null,
    collected_at: new Date(), is_official: false, source_verified: false,
    s3_raw_key: 'raw', s3_normalized_key: 'norm', feature_count: 2,
    invalid_count: 0, duplicate_count: 0, out_of_bbox_count: 0,
    status: 'PREVIEWED', created_by: null, created_at: new Date(),
    applied_at: null, notes: null, checksum: VALID_CHECKSUM,
    ...over,
  };
}

// ─── Mock Prisma transacional ────────────────────────────────────────────────
// Suporta: operational_territories.findUnique/findMany; territorial_dataset_versions
// findUnique/updateMany (CAS); neighborhoods findFirst/create/update; $queryRaw
// (geometria), $executeRaw (geofence), $transaction interativo com ROLLBACK real
// (snapshot/restore) quando a função lança.

interface MockOpts {
  territory?: any;
  territories?: any[];
  neighborhoods?: any[];      // estado inicial de bairros
  geofences?: Record<string, any>; // neighborhood_id -> { coordinates }
  geometry?: 'valid' | 'invalid' | 'empty' | 'wrong_srid'; // resposta do $queryRaw
  failGeofenceOnce?: boolean; // $executeRaw lança uma vez (rollback de geofence)
  failFinalTransition?: boolean; // CAS APPLYING->APPLIED retorna count 0
  concurrentSteal?: boolean;  // simula outra corrida: CAS PREVIEWED->APPLYING retorna count 0
}

function makePrisma(vRow: any, opts: MockOpts = {}) {
  const territory = opts.territory ?? TERRITORY;
  const territories = opts.territories ?? [territory];
  const state: any = {
    versions: [vRow],
    neighborhoods: [...(opts.neighborhoods ?? [])],
    geofences: { ...(opts.geofences ?? {}) },
    geofenceWrites: 0,
    firstGeofenceFailed: false,
  };

  const model = {
    operational_territories: {
      findUnique: async ({ where }: any) => {
        const t = territories.find((x) => x.id === where.id) ?? (territory.id === where.id ? territory : null);
        return t ? { ...t } : null;
      },
      findMany: async ({ where }: any) => {
        const ufs = where?.uf?.in ?? null;
        return territories.filter((t) => !ufs || ufs.includes(t.uf)).map((t) => ({ id: t.id, name: t.name, city_name: t.city_name, uf: t.uf }));
      },
    },
    territorial_dataset_versions: {
      findUnique: async ({ where }: any) => { const v = state.versions.find((x: any) => x.id === where.id); return v ? { ...v } : null; },
      updateMany: async ({ where, data }: any) => {
        // CAS: casa por id + status atual.
        const allowed = where.status?.in ?? (where.status ? [where.status] : null);
        // Simulação de concorrência no gate PREVIEWED->APPLYING.
        if (opts.concurrentSteal && data.status === 'APPLYING') return { count: 0 };
        if (opts.failFinalTransition && data.status === 'APPLIED') return { count: 0 };
        const v = state.versions.find((x: any) => x.id === where.id && (!allowed || allowed.includes(x.status)));
        if (!v) return { count: 0 };
        Object.assign(v, data);
        return { count: 1 };
      },
    },
    neighborhoods: {
      findFirst: async ({ where }: any) => {
        const n = state.neighborhoods.find((x: any) => x.name === where.name && x.city === where.city);
        if (!n) return null;
        return { id: n.id, territory_id: n.territory_id ?? null, area_type: n.area_type ?? null, neighborhood_geofences: state.geofences[n.id] ? { coordinates: state.geofences[n.id].coordinates } : null };
      },
      create: async ({ data }: any) => { state.neighborhoods.push({ ...data }); return { id: data.id }; },
      update: async ({ where, data }: any) => {
        const n = state.neighborhoods.find((x: any) => x.id === where.id);
        if (n) Object.assign(n, data);
        return { id: where.id };
      },
      // guardas: nunca deve apagar
      delete: async () => { throw new Error('NÃO deve apagar neighborhoods'); },
      deleteMany: async () => { throw new Error('NÃO deve apagar neighborhoods'); },
    },
    // $queryRaw: validação de geometria (assertGeometryValid)
    $queryRaw: async (..._args: any[]) => {
      const mode = opts.geometry ?? 'valid';
      if (mode === 'invalid') return [{ is_valid: false, is_empty: false, srid: 4326, gtype: 'POLYGON', xmin: -40.42, xmax: -40.40, ymin: -20.26, ymax: -20.24 }];
      if (mode === 'empty') return [{ is_valid: true, is_empty: true, srid: 4326, gtype: 'POLYGON', xmin: 0, xmax: 0, ymin: 0, ymax: 0 }];
      if (mode === 'wrong_srid') return [{ is_valid: true, is_empty: false, srid: 3857, gtype: 'POLYGON', xmin: -40.42, xmax: -40.40, ymin: -20.26, ymax: -20.24 }];
      // valid: envelope dentro do bbox derivado de QUALQUER fixture (usa o
      // extent do Polygon 'Centro', que é o mais interno e comum a todas).
      return [{ is_valid: true, is_empty: false, srid: 4326, gtype: 'MULTIPOLYGON', xmin: -40.42, xmax: -40.40, ymin: -20.26, ymax: -20.24 }];
    },
    // $executeRaw: escrita da geofence
    $executeRaw: async (..._args: any[]) => {
      if (opts.failGeofenceOnce && !state.firstGeofenceFailed) {
        state.firstGeofenceFailed = true;
        throw new Error('DB geofence insert failed');
      }
      state.geofenceWrites++;
      return 1;
    },
  };

  // $transaction interativo com rollback (snapshot/restore).
  const prisma: any = {
    ...model,
    __state: state,
    $transaction: async (fn: any) => {
      const snapshot = {
        versions: JSON.parse(JSON.stringify(state.versions)),
        neighborhoods: JSON.parse(JSON.stringify(state.neighborhoods)),
        geofences: JSON.parse(JSON.stringify(state.geofences)),
        geofenceWrites: state.geofenceWrites,
      };
      try {
        return await fn(model);
      } catch (err) {
        // ROLLBACK: restaura estado anterior ao início da transação.
        state.versions = snapshot.versions;
        state.neighborhoods = snapshot.neighborhoods;
        state.geofences = snapshot.geofences;
        state.geofenceWrites = snapshot.geofenceWrites;
        throw err;
      }
    },
  };
  return prisma;
}

const okGetObject = async () => VALID_BODY;

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('FASE 3B — applyDatasetVersion (estados)', () => {
  it('PREVIEWED → APPLYING → APPLIED (sucesso, cria bairros+geofences)', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }));
    const r = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(true);
    expect(r.code).toBe('OK');
    expect(r.to).toBe('APPLIED');
    expect(prisma.__state.versions[0].status).toBe('APPLIED');
    expect(prisma.__state.versions[0].applied_at).toBeTruthy();
    expect(r.counters?.created).toBe(2);
    expect(r.counters?.geofencesWritten).toBe(2);
  });

  it('DRAFT não pode aplicar', async () => {
    const prisma = makePrisma(versionRow({ status: 'DRAFT' }));
    const r = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_STATUS_TRANSITION');
    expect(prisma.__state.versions[0].status).toBe('DRAFT');
    expect(prisma.__state.geofenceWrites).toBe(0);
  });

  it('APPLIED não reaplica', async () => {
    const prisma = makePrisma(versionRow({ status: 'APPLIED' }));
    const r = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('REJECTED não aplica', async () => {
    const prisma = makePrisma(versionRow({ status: 'REJECTED' }));
    const r = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_STATUS_TRANSITION');
  });
});

describe('FASE 3B — ownership territorial', () => {
  it('ownership correto aplica', async () => {
    const prisma = makePrisma(versionRow({ territory_id: 'terr-cariacica' }));
    const r = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(true);
  });

  it('ownership errado é bloqueado ANTES da escrita', async () => {
    const prisma = makePrisma(versionRow({ territory_id: 'terr-outro' }));
    let s3 = false;
    const r = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => { s3 = true; return VALID_BODY; } });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('DATASET_TERRITORY_MISMATCH');
    expect(s3).toBe(false); // nem leu o S3
    expect(prisma.__state.geofenceWrites).toBe(0);
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED');
  });
});

describe('FASE 3B — concorrência (CAS)', () => {
  it('duas chamadas concorrentes: apenas uma vence o CAS', async () => {
    // Estado compartilhado: primeira vence PREVIEWED->APPLYING->APPLIED;
    // segunda encontra status != PREVIEWED e falha no gate.
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }));
    const [a, b] = await Promise.all([
      applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject }),
      applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject }),
    ]);
    const oks = [a, b].filter((x) => x.ok);
    const fails = [a, b].filter((x) => !x.ok);
    expect(oks.length).toBe(1);
    expect(fails.length).toBe(1);
    // A que falhou é por conflito de estado (não mais PREVIEWED) OU status transition.
    expect(['APPLY_CONFLICT', 'INVALID_STATUS_TRANSITION']).toContain(fails[0].code);
    expect(prisma.__state.versions[0].status).toBe('APPLIED');
  });

  it('gate CAS perde a corrida (count 0) → APPLY_CONFLICT sem escrita', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), { concurrentSteal: true });
    const r = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('APPLY_CONFLICT');
    expect(prisma.__state.geofenceWrites).toBe(0);
    // rollback preservou PREVIEWED
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED');
  });
});

describe('FASE 3B — rollback integral', () => {
  it('falha ao criar bairro → rollback (status volta a PREVIEWED, sem geofence)', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }));
    // força erro no create do primeiro bairro
    prisma.neighborhoods.create = async () => { throw new Error('DB create neighborhood failed'); };
    const r = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED'); // rollback
    expect(prisma.__state.versions[0].applied_at).toBeNull();
    expect(prisma.__state.neighborhoods.length).toBe(0);
    expect(prisma.__state.geofenceWrites).toBe(0);
  });

  it('falha ao gravar geofence → rollback integral', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), { failGeofenceOnce: true });
    const r = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED'); // rollback
    expect(prisma.__state.neighborhoods.length).toBe(0);         // bairro criado foi revertido
    expect(prisma.__state.geofenceWrites).toBe(0);
  });

  it('falha na transição final APPLYING→APPLIED → rollback (não fica APPLIED)', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), { failFinalTransition: true });
    const r = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('APPLY_CONFLICT');
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED'); // rollback (não APPLIED nem APPLYING)
    expect(prisma.__state.versions[0].applied_at).toBeNull();
    expect(prisma.__state.neighborhoods.length).toBe(0);
  });
});

describe('FASE 3B — geometria (PostGIS)', () => {
  it('Polygon válido aplica', async () => {
    const body = bodyOf(fc(polygon('Centro')));
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED', checksum: checksumOf(body) }));
    const r = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => body });
    expect(r.ok).toBe(true);
    expect(r.counters?.created).toBe(1);
  });

  it('MultiPolygon válido aplica', async () => {
    const body = bodyOf(fc(multiPolygon('Campo Grande')));
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED', checksum: checksumOf(body) }));
    const r = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => body });
    expect(r.ok).toBe(true);
  });

  it('geometria inválida (ST_IsValid=false) → rollback, sem escrita', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), { geometry: 'invalid' });
    const r = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_GEOMETRY');
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED');
    expect(prisma.__state.geofenceWrites).toBe(0);
  });

  it('geometria vazia → INVALID_GEOMETRY', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), { geometry: 'empty' });
    const r = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_GEOMETRY');
  });

  it('SRID != 4326 → INVALID_GEOMETRY', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), { geometry: 'wrong_srid' });
    const r = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_GEOMETRY');
  });
});

describe('FASE 3B — idempotência e conflitos', () => {
  it('reaplicar não duplica (unchanged); precisa re-PREVIEWED entre applies', async () => {
    // 1º apply cria os bairros e geofences.
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }));
    const r1 = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r1.ok).toBe(true);
    const nbCount = prisma.__state.neighborhoods.length;
    // registra geofences no estado para simular persistência entre applies
    for (const n of prisma.__state.neighborhoods) {
      // coordinates registradas conforme o que o serviço grava (coordinates da feature)
    }
    // volta a PREVIEWED para permitir reexecução
    prisma.__state.versions[0].status = 'PREVIEWED';
    // popular geofences com as coordinates para casar "unchanged"
    const centro = prisma.__state.neighborhoods.find((x: any) => x.name === 'Centro');
    const campo = prisma.__state.neighborhoods.find((x: any) => x.name === 'Campo Grande');
    prisma.__state.geofences[centro.id] = { coordinates: polygon('Centro').geometry.coordinates };
    prisma.__state.geofences[campo.id] = { coordinates: multiPolygon('Campo Grande').geometry.coordinates };

    const r2 = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r2.ok).toBe(true);
    // não duplicou bairros
    expect(prisma.__state.neighborhoods.length).toBe(nbCount);
    // ambos unchanged
    expect(r2.counters?.unchanged).toBe(2);
    expect(r2.counters?.created).toBe(0);
  });

  it('bairro já existente do MESMO território → update (não duplica)', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), {
      neighborhoods: [{ id: 'nb-centro', name: 'Centro', city: CITY, territory_id: 'terr-cariacica', area_type: 'X' }],
      geofences: {},
    });
    const body = bodyOf(fc(polygon('Centro')));
    prisma.__state.versions[0].checksum = checksumOf(body);
    const r = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => body });
    expect(r.ok).toBe(true);
    expect(r.counters?.updated).toBe(1);
    expect(r.counters?.created).toBe(0);
    expect(prisma.__state.neighborhoods.length).toBe(1); // não duplicou
  });

  it('geofence já existente → sobrescreve sem duplicar (ON CONFLICT)', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), {
      neighborhoods: [{ id: 'nb-centro', name: 'Centro', city: CITY, territory_id: 'terr-cariacica' }],
      geofences: { 'nb-centro': { coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] } }, // geo antiga diferente
    });
    const body = bodyOf(fc(polygon('Centro')));
    prisma.__state.versions[0].checksum = checksumOf(body);
    const r = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => body });
    expect(r.ok).toBe(true);
    expect(r.counters?.geofencesWritten).toBe(1); // reescreveu 1, sem duplicar
  });

  it('conflito (bairro de OUTRO território) NÃO provoca delete; conta conflicts/skipped', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), {
      neighborhoods: [{ id: 'nb-centro', name: 'Centro', city: CITY, territory_id: 'terr-OUTRO' }],
    });
    const body = bodyOf(fc(polygon('Centro'), polygon('Novo')));
    prisma.__state.versions[0].checksum = checksumOf(body);
    const r = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => body });
    expect(r.ok).toBe(true);
    expect(r.counters?.conflicts).toBe(1);
    expect(r.counters?.skipped).toBe(1);
    expect(r.conflicts?.[0].name).toBe('Centro');
    // 'Centro' preservado com territory_id do OUTRO (não sobrescrito, não apagado)
    const centro = prisma.__state.neighborhoods.find((x: any) => x.name === 'Centro');
    expect(centro.territory_id).toBe('terr-OUTRO');
    expect(prisma.__state.neighborhoods.find((x: any) => x.name === 'Novo')).toBeTruthy(); // 'Novo' criado
    expect(r.counters?.created).toBe(1);
  });
});

describe('FASE 3B — segurança territorial (nenhuma escrita fora do territoryId)', () => {
  it('nunca vincula bairro a outro territory_id além do alvo', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }));
    const r = await applyDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(true);
    for (const n of prisma.__state.neighborhoods) {
      expect(n.territory_id).toBe('terr-cariacica');
    }
  });
});
