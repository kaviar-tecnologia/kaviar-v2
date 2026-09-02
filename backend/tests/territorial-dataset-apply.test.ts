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
  geofences?: Record<string, any>; // neighborhood_id -> { coordinates: {type,coordinates} }
  geometry?: 'valid' | 'invalid' | 'empty' | 'wrong_srid'; // resposta do $queryRaw
  failGeofenceOnce?: boolean; // $executeRaw lança uma vez (rollback de geofence)
  failFinalTransition?: boolean; // CAS APPLYING->APPLIED retorna count 0
  concurrentSteal?: boolean;  // simula outra corrida: CAS PREVIEWED->APPLYING retorna count 0
  featureEnvelope?: { xmin: number; xmax: number; ymin: number; ymax: number }; // envelope da geometria no $queryRaw
  onGeofenceWrite?: (n: number) => void; // hook chamado a cada geofence escrita (dentro da tx)
}

// resolveBBox injetado: bbox municipal CONFIÁVEL fixo (não chama OSM/Overpass).
// Cobre Cariacica (~-40.30..-40.50, -20.15..-20.40). Congelado antes da tx.
const MUNICIPAL_BBOX = { minLon: -40.55, maxLon: -40.30, minLat: -20.40, maxLat: -20.15 };
function bboxOk() {
  return async (_p: any, _c: any, _u: any, _o: any) => ({ bbox: { ...MUNICIPAL_BBOX }, source: 'osm_municipality' as const, code: 'OK' as const });
}
function bboxUnavailable() {
  return async () => ({ bbox: null, source: 'none' as const, code: 'MUNICIPAL_BBOX_UNAVAILABLE' as const });
}
function bboxAmbiguous() {
  return async () => ({ bbox: null, source: 'none' as const, code: 'MUNICIPAL_BBOX_AMBIGUOUS' as const });
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
      findMany: async ({ where }: any) => {
        // Retorna bairros da cidade alvo (o serviço filtra por nome normalizado).
        return state.neighborhoods
          .filter((x: any) => x.city === where.city)
          .map((n: any) => ({
            id: n.id,
            name: n.name,
            territory_id: n.territory_id ?? null,
            area_type: n.area_type ?? null,
            neighborhood_geofences: state.geofences[n.id] ? { coordinates: state.geofences[n.id].coordinates } : null,
          }));
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
    // $queryRaw: validação de geometria (assertGeometryValid). Envelope dentro
    // do MUNICIPAL_BBOX por padrão; configurável via featureEnvelope (p/ testar
    // feature fora do bbox municipal).
    $queryRaw: async (..._args: any[]) => {
      const mode = opts.geometry ?? 'valid';
      const env = opts.featureEnvelope ?? { xmin: -40.42, xmax: -40.40, ymin: -20.26, ymax: -20.24 };
      if (mode === 'invalid') return [{ is_valid: false, is_empty: false, srid: 4326, gtype: 'POLYGON', ...env }];
      if (mode === 'empty') return [{ is_valid: true, is_empty: true, srid: 4326, gtype: 'POLYGON', xmin: 0, xmax: 0, ymin: 0, ymax: 0 }];
      if (mode === 'wrong_srid') return [{ is_valid: true, is_empty: false, srid: 3857, gtype: 'POLYGON', ...env }];
      return [{ is_valid: true, is_empty: false, srid: 4326, gtype: 'MULTIPOLYGON', ...env }];
    },
    // $executeRaw: escrita da geofence
    $executeRaw: async (..._args: any[]) => {
      if (opts.failGeofenceOnce && !state.firstGeofenceFailed) {
        state.firstGeofenceFailed = true;
        throw new Error('DB geofence insert failed');
      }
      state.geofenceWrites++;
      if (opts.onGeofenceWrite) opts.onGeofenceWrite(state.geofenceWrites);
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
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
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
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_STATUS_TRANSITION');
    expect(prisma.__state.versions[0].status).toBe('DRAFT');
    expect(prisma.__state.geofenceWrites).toBe(0);
  });

  it('APPLIED não reaplica', async () => {
    const prisma = makePrisma(versionRow({ status: 'APPLIED' }));
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('REJECTED não aplica', async () => {
    const prisma = makePrisma(versionRow({ status: 'REJECTED' }));
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_STATUS_TRANSITION');
  });
});

describe('FASE 3B — ownership territorial', () => {
  it('ownership correto aplica', async () => {
    const prisma = makePrisma(versionRow({ territory_id: 'terr-cariacica' }));
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(true);
  });

  it('ownership errado é bloqueado ANTES da escrita', async () => {
    const prisma = makePrisma(versionRow({ territory_id: 'terr-outro' }));
    let s3 = false;
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => { s3 = true; return VALID_BODY; } });
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
      applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject }),
      applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject }),
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
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
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
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED'); // rollback
    expect(prisma.__state.versions[0].applied_at).toBeNull();
    expect(prisma.__state.neighborhoods.length).toBe(0);
    expect(prisma.__state.geofenceWrites).toBe(0);
  });

  it('falha ao gravar geofence → rollback integral', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), { failGeofenceOnce: true });
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED'); // rollback
    expect(prisma.__state.neighborhoods.length).toBe(0);         // bairro criado foi revertido
    expect(prisma.__state.geofenceWrites).toBe(0);
  });

  it('falha na transição final APPLYING→APPLIED → rollback (não fica APPLIED)', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), { failFinalTransition: true });
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
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
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => body });
    expect(r.ok).toBe(true);
    expect(r.counters?.created).toBe(1);
  });

  it('MultiPolygon válido aplica', async () => {
    const body = bodyOf(fc(multiPolygon('Campo Grande')));
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED', checksum: checksumOf(body) }));
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => body });
    expect(r.ok).toBe(true);
  });

  it('geometria inválida (ST_IsValid=false) → rollback, sem escrita', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), { geometry: 'invalid' });
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_GEOMETRY');
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED');
    expect(prisma.__state.geofenceWrites).toBe(0);
  });

  it('geometria vazia → INVALID_GEOMETRY', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), { geometry: 'empty' });
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_GEOMETRY');
  });

  it('SRID != 4326 → INVALID_GEOMETRY', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), { geometry: 'wrong_srid' });
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_GEOMETRY');
  });
});

describe('FASE 3B — idempotência e conflitos', () => {
  it('reaplicar não duplica (unchanged); precisa re-PREVIEWED entre applies', async () => {
    // 1º apply cria os bairros e geofences.
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }));
    const r1 = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r1.ok).toBe(true);
    const nbCount = prisma.__state.neighborhoods.length;
    // registra geofences no estado para simular persistência entre applies
    for (const n of prisma.__state.neighborhoods) {
      // coordinates registradas conforme o que o serviço grava (coordinates da feature)
    }
    // volta a PREVIEWED para permitir reexecução
    prisma.__state.versions[0].status = 'PREVIEWED';
    // popular geofences com o FORMATO REAL armazenado ({type,coordinates}) para casar "unchanged"
    const centro = prisma.__state.neighborhoods.find((x: any) => x.name === 'Centro');
    const campo = prisma.__state.neighborhoods.find((x: any) => x.name === 'Campo Grande');
    prisma.__state.geofences[centro.id] = { coordinates: { type: 'Polygon', coordinates: polygon('Centro').geometry.coordinates } };
    prisma.__state.geofences[campo.id] = { coordinates: { type: 'MultiPolygon', coordinates: multiPolygon('Campo Grande').geometry.coordinates } };

    const r2 = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
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
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => body });
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
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => body });
    expect(r.ok).toBe(true);
    expect(r.counters?.geofencesWritten).toBe(1); // reescreveu 1, sem duplicar
  });

  it('conflito (bairro de OUTRO território) → fail-closed: rollback, sem APPLIED, sem delete', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), {
      neighborhoods: [{ id: 'nb-centro', name: 'Centro', city: CITY, territory_id: 'terr-OUTRO' }],
    });
    const body = bodyOf(fc(polygon('Centro'), polygon('Novo')));
    prisma.__state.versions[0].checksum = checksumOf(body);
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => body });
    // FAIL-CLOSED: conflito territorial aborta o apply inteiro.
    expect(r.ok).toBe(false);
    expect(r.code).toBe('NEIGHBORHOOD_TERRITORY_CONFLICT');
    expect(r.conflicts?.[0].name).toBeTruthy(); // lista de conflitos retornada
    // rollback integral: versão continua PREVIEWED, nenhuma escrita parcial
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED');
    expect(prisma.__state.versions[0].applied_at).toBeNull();
    expect(prisma.__state.geofenceWrites).toBe(0);
    // 'Centro' preservado no OUTRO território; 'Novo' NÃO permanece (rollback)
    const centro = prisma.__state.neighborhoods.find((x: any) => x.name === 'Centro');
    expect(centro.territory_id).toBe('terr-OUTRO'); // não sobrescrito, não apagado
    expect(prisma.__state.neighborhoods.find((x: any) => x.name === 'Novo')).toBeFalsy();
    expect(prisma.__state.neighborhoods.length).toBe(1);
  });
});

describe('FASE 3B — segurança territorial (nenhuma escrita fora do territoryId)', () => {
  it('nunca vincula bairro a outro territory_id além do alvo', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }));
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(true);
    for (const n of prisma.__state.neighborhoods) {
      expect(n.territory_id).toBe('terr-cariacica');
    }
  });
});

// ─── FIX #1: bbox municipal confiável (não circular) ─────────────────────────
describe('FASE 3B — bbox municipal confiável', () => {
  it('bbox municipal correto → apply permitido', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }));
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(true);
  });

  it('bbox municipal indisponível → nenhuma escrita', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }));
    const r = await applyDatasetVersion({ resolveBBox: bboxUnavailable(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('MUNICIPAL_BBOX_UNAVAILABLE');
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED'); // sem transição
    expect(prisma.__state.geofenceWrites).toBe(0);
    expect(prisma.__state.neighborhoods.length).toBe(0);
  });

  it('bbox municipal ambíguo → fail-closed, nenhuma escrita', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }));
    const r = await applyDatasetVersion({ resolveBBox: bboxAmbiguous(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('MUNICIPAL_BBOX_AMBIGUOUS');
    expect(prisma.__state.geofenceWrites).toBe(0);
  });

  it('dataset inteiro de OUTRA cidade → bloqueado (cidade divergente do território)', async () => {
    // GeoJSON com city != território → validateNeighborhoodGeoJSON reprova por
    // "cidade divergente" (não passa a proteção territorial). Nenhuma escrita.
    const other = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: { name: 'Bairro X', city: 'São Paulo', uf: 'SP' },
        geometry: { type: 'Polygon', coordinates: [[[-46.7, -23.6], [-46.6, -23.6], [-46.6, -23.5], [-46.7, -23.5], [-46.7, -23.6]]] },
      }],
    };
    const body = JSON.stringify(other);
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED', checksum: checksumOf(body) }));
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => body });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_GEOJSON'); // reprovado antes da tx
    expect(prisma.__state.geofenceWrites).toBe(0);
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED');
  });

  it('uma feature FORA do bbox municipal → bloqueada (INVALID_GEOMETRY, rollback)', async () => {
    // A validação estrutural passa (bbox municipal é largo), mas a checagem
    // PostGIS de envelope encontra a feature fora do bbox municipal congelado.
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), {
      featureEnvelope: { xmin: -46.7, xmax: -46.6, ymin: -23.6, ymax: -23.5 }, // longe do MUNICIPAL_BBOX
    });
    // Para chegar ao PostGIS, o GeoJSON precisa passar a validação estrutural
    // (dentro do bbox municipal largo). Usamos VALID_BODY (Cariacica), mas o
    // envelope PostGIS mockado devolve coords fora → INVALID_GEOMETRY.
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_GEOMETRY');
    expect(prisma.__state.geofenceWrites).toBe(0);
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED');
  });
});

// ─── FIX #2: comparação de geofence com o FORMATO REAL armazenado ────────────
describe('FASE 3B — idempotência real da geofence (formato {type,coordinates})', () => {
  it('mesma geometria (formato real) → unchanged; sem geofence; sem update de bairro', async () => {
    // Reproduz EXATAMENTE o formato armazenado em coordinates: {type,coordinates}.
    const stored = { type: 'Polygon', coordinates: polygon('Centro').geometry.coordinates };
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), {
      neighborhoods: [{ id: 'nb-centro', name: 'Centro', city: CITY, territory_id: 'terr-cariacica', area_type: 'BAIRRO_OFICIAL' }],
      geofences: { 'nb-centro': { coordinates: stored } },
    });
    const body = bodyOf(fc(polygon('Centro')));
    prisma.__state.versions[0].checksum = checksumOf(body);

    // instrumenta update p/ garantir que NÃO é chamado
    let nbUpdated = false;
    const origUpdate = prisma.neighborhoods.update;
    prisma.neighborhoods.update = async (a: any) => { nbUpdated = true; return origUpdate(a); };

    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => body });
    expect(r.ok).toBe(true);
    expect(r.counters?.unchanged).toBe(1);
    expect(r.counters?.updated).toBe(0);
    expect(r.counters?.created).toBe(0);
    expect(r.counters?.geofencesWritten).toBe(0); // nenhuma geofence escrita
    expect(nbUpdated).toBe(false);                 // nenhum update de bairro
  });

  it('geometria diferente (mesmo formato) → update + geofence reescrita', async () => {
    const stored = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }; // diferente
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), {
      neighborhoods: [{ id: 'nb-centro', name: 'Centro', city: CITY, territory_id: 'terr-cariacica' }],
      geofences: { 'nb-centro': { coordinates: stored } },
    });
    const body = bodyOf(fc(polygon('Centro')));
    prisma.__state.versions[0].checksum = checksumOf(body);
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => body });
    expect(r.ok).toBe(true);
    expect(r.counters?.updated).toBe(1);
    expect(r.counters?.unchanged).toBe(0);
    expect(r.counters?.geofencesWritten).toBe(1);
  });
});

// ─── FIX #3: identidade por nome normalizado ─────────────────────────────────
describe('FASE 3B — identidade por nome normalizado', () => {
  it('Centro existente + dataset "Centro" → mesmo bairro, sem duplicação', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), {
      neighborhoods: [{ id: 'nb-centro', name: 'Centro', city: CITY, territory_id: 'terr-cariacica' }],
    });
    const body = bodyOf(fc(polygon('Centro')));
    prisma.__state.versions[0].checksum = checksumOf(body);
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => body });
    expect(r.ok).toBe(true);
    expect(prisma.__state.neighborhoods.length).toBe(1); // reutilizou
    expect(r.counters?.created).toBe(0);
    expect(r.counters?.updated).toBe(1);
  });

  it('espaços duplicados/trim no dataset → mesmo bairro (nome normalizado)', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), {
      neighborhoods: [{ id: 'nb-centro', name: 'Centro', city: CITY, territory_id: 'terr-cariacica' }],
    });
    // dataset traz "  Centro  " com espaços → normaliza para "centro"
    const feat = polygon('  Centro  ');
    const body = bodyOf(fc(feat));
    prisma.__state.versions[0].checksum = checksumOf(body);
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => body });
    expect(r.ok).toBe(true);
    expect(prisma.__state.neighborhoods.length).toBe(1); // não duplicou
    expect(r.counters?.created).toBe(0);
  });

  it('dois registros legados que normalizam para o mesmo nome → conflito/fail-closed', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), {
      neighborhoods: [
        { id: 'nb-1', name: 'Centro', city: CITY, territory_id: 'terr-cariacica' },
        { id: 'nb-2', name: 'centro', city: CITY, territory_id: 'terr-cariacica' }, // normaliza igual
      ],
    });
    const body = bodyOf(fc(polygon('Centro')));
    prisma.__state.versions[0].checksum = checksumOf(body);
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => body });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('NEIGHBORHOOD_IDENTITY_CONFLICT');
    // rollback integral: sem escrita, status preservado, sem dedupe destrutivo
    expect(prisma.__state.neighborhoods.length).toBe(2);
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED');
    expect(prisma.__state.geofenceWrites).toBe(0);
  });

  it('bairro normalizado pertence a OUTRO território → fail-closed, sem escrita', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), {
      neighborhoods: [{ id: 'nb-centro', name: '  centro ', city: CITY, territory_id: 'terr-OUTRO' }],
    });
    const body = bodyOf(fc(polygon('Centro')));
    prisma.__state.versions[0].checksum = checksumOf(body);
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => body });
    expect(r.ok).toBe(false); // fail-closed
    expect(r.code).toBe('NEIGHBORHOOD_TERRITORY_CONFLICT');
    const centro = prisma.__state.neighborhoods.find((x: any) => x.id === 'nb-centro');
    expect(centro.territory_id).toBe('terr-OUTRO'); // não sobrescrito
    expect(prisma.__state.neighborhoods.length).toBe(1); // não criou duplicado
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED'); // rollback
    expect(prisma.__state.geofenceWrites).toBe(0);
  });
});

// ─── FIX #1: conflito territorial => rollback integral (não APPLIED parcial) ─
describe('FASE 3B — conflito territorial é fail-closed (rollback integral)', () => {
  it('1 conflito + 1 bairro novo → rollback: bairro novo NÃO permanece, versão PREVIEWED', async () => {
    // 'Centro' pertence a outro território (conflito); 'Novo' seria criado.
    // Como o conflito aborta a tx, o 'Novo' já criado é revertido.
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), {
      neighborhoods: [{ id: 'nb-centro', name: 'Centro', city: CITY, territory_id: 'terr-OUTRO' }],
    });
    // Ordena 'Novo' ANTES de 'Centro' para provar que uma escrita já feita é revertida.
    const body = bodyOf(fc(polygon('Novo'), polygon('Centro')));
    prisma.__state.versions[0].checksum = checksumOf(body);
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => body });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('NEIGHBORHOOD_TERRITORY_CONFLICT');
    expect(r.conflicts && r.conflicts.length).toBeGreaterThanOrEqual(1); // lista de conflitos
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED'); // não APPLIED
    expect(prisma.__state.versions[0].applied_at).toBeNull();
    expect(prisma.__state.geofenceWrites).toBe(0); // nenhuma geofence parcial
    // 'Novo' não permanece; 'Centro' intocado no OUTRO território (sem delete)
    expect(prisma.__state.neighborhoods.find((x: any) => x.name === 'Novo')).toBeFalsy();
    expect(prisma.__state.neighborhoods.length).toBe(1);
  });
});

// ─── FIX #2: cancelamento/deadline propagados por todo o apply ───────────────
describe('FASE 3B — cancelamento e deadline', () => {
  it('abort durante resolução do bbox → zero escrita, PREVIEWED', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }));
    const controller = new AbortController();
    // resolveBBox simula cancelamento durante OSM: aborta e retorna (o serviço
    // deve checar signal.aborted após o bbox e não iniciar a transação).
    const resolveAbort = async () => { controller.abort(); return { bbox: { ...MUNICIPAL_BBOX }, source: 'osm_municipality' as const, code: 'OK' as const }; };
    const r = await applyDatasetVersion({ resolveBBox: resolveAbort as any, signal: controller.signal, territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('APPLY_ABORTED');
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED');
    expect(prisma.__state.geofenceWrites).toBe(0);
    expect(prisma.__state.neighborhoods.length).toBe(0);
  });

  it('abort ANTES do CAS (já cancelado ao entrar) → zero escrita', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }));
    const controller = new AbortController();
    controller.abort(); // já cancelado
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), signal: controller.signal, territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('APPLY_ABORTED');
    expect(prisma.__state.geofenceWrites).toBe(0);
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED');
  });

  it('abort DURANTE o loop de bairros → rollback integral (não APPLIED)', async () => {
    const controller = new AbortController();
    // aborta após a primeira geofence escrita (dentro da tx); a checagem no
    // início da próxima iteração do loop lança __ABORT__ => rollback.
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }), {
      onGeofenceWrite: (n: number) => { if (n === 1) controller.abort(); },
    });
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), signal: controller.signal, territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('APPLY_ABORTED');
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED'); // rollback (não APPLIED nem APPLYING)
    expect(prisma.__state.versions[0].applied_at).toBeNull();
    expect(prisma.__state.neighborhoods.length).toBe(0); // parcial revertido
    expect(prisma.__state.geofenceWrites).toBe(0);        // rollback zera o contador (snapshot)
  });

  it('deadline excedido → PREVIEWED preservado, APPLY_DEADLINE_EXCEEDED', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }));
    // resolveBBox demora além do deadline (totalDeadlineMs pequeno).
    const slowResolve = async () => { await new Promise((res) => setTimeout(res, 40)); return { bbox: { ...MUNICIPAL_BBOX }, source: 'osm_municipality' as const, code: 'OK' as const }; };
    const r = await applyDatasetVersion({ resolveBBox: slowResolve as any, totalDeadlineMs: 5, territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('APPLY_DEADLINE_EXCEEDED');
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED');
    expect(prisma.__state.geofenceWrites).toBe(0);
    expect(prisma.__state.neighborhoods.length).toBe(0);
  });

  it('abort DURANTE GetObject (S3) → APPLY_ABORTED, nenhuma transação', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }));
    const controller = new AbortController();
    // getObject recebe o signal; simula cancelamento no meio do GetObject:
    // aborta e lança ABORTED (como o defaultGetObject faria ao detectar abort).
    const getObject = async (_b: string, _k: string, signal?: AbortSignal) => {
      controller.abort();
      if (signal?.aborted) { const e: any = new Error('GetObject cancelado'); e.code = 'ABORTED'; throw e; }
      return VALID_BODY;
    };
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), signal: controller.signal, territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('APPLY_ABORTED');
    expect(prisma.__state.geofenceWrites).toBe(0);
    expect(prisma.__state.neighborhoods.length).toBe(0);
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED');
  });

  it('deadline DURANTE leitura do S3 → APPLY_DEADLINE_EXCEEDED, nenhuma transação', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }));
    // getObject demora além do deadline; o controller de deadline aborta e o
    // getObject respeita o signal (interrompe e lança ABORTED).
    const getObject = async (_b: string, _k: string, signal?: AbortSignal) => {
      await new Promise((res) => setTimeout(res, 40));
      if (signal?.aborted) { const e: any = new Error('stream cancelado'); e.code = 'ABORTED'; throw e; }
      return VALID_BODY;
    };
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), totalDeadlineMs: 5, territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('APPLY_DEADLINE_EXCEEDED');
    expect(prisma.__state.geofenceWrites).toBe(0);
    expect(prisma.__state.neighborhoods.length).toBe(0);
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED');
  });

  it('stream interrompido NÃO é parseado (getObject aborta antes de retornar corpo)', async () => {
    const prisma = makePrisma(versionRow({ status: 'PREVIEWED' }));
    const controller = new AbortController();
    let parsed = false;
    // getObject aborta e lança ANTES de devolver o corpo → serviço não parseia.
    const getObject = async (_b: string, _k: string, signal?: AbortSignal) => {
      controller.abort();
      const e: any = new Error('stream interrompido'); e.code = 'ABORTED'; throw e;
    };
    const r = await applyDatasetVersion({ resolveBBox: bboxOk(), signal: controller.signal, territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('APPLY_ABORTED');
    expect(parsed).toBe(false);
    expect(prisma.__state.neighborhoods.length).toBe(0);
  });
});
