import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import {
  previewDatasetVersion,
  rejectDatasetVersion,
  listTerritoryDatasets,
  datasetBelongsToTerritory,
  resolveVersionOwnership,
} from '../src/services/territory/territorial-dataset-review.service';

// ─── FeatureCollection normalizada válida dentro de Cariacica ────────────────
function ring(lng: number, lat: number, d = 0.005) {
  return [[lng - d, lat - d], [lng + d, lat - d], [lng + d, lat + d], [lng - d, lat + d], [lng - d, lat - d]];
}
function fc(names: Array<{ name: string; lng: number; lat: number }>) {
  return {
    type: 'FeatureCollection', name: 'cariacica_bairros',
    features: names.map((n) => ({
      type: 'Feature',
      properties: { name: n.name, city: 'Cariacica', uf: 'ES', area_type: 'BAIRRO_OFICIAL' },
      geometry: { type: 'Polygon', coordinates: [ring(n.lng, n.lat)] },
    })),
  };
}
const VALID_FC = fc([{ name: 'Campo Grande', lng: -40.42, lat: -20.30 }, { name: 'Jardim América', lng: -40.40, lat: -20.31 }]);
const VALID_BODY = JSON.stringify(VALID_FC);
const VALID_CHECKSUM = createHash('sha256').update(VALID_BODY).digest('hex');

const TERRITORY = { id: 'terr-cariacica', name: 'Cariacica', city_name: 'Cariacica', uf: 'ES', level: 'city', status: 'planning' };

// ─── Prisma mock com guardas contra escrita indevida ─────────────────────────
function makePrisma(versionRow: any, opts: { territory?: any; extraVersions?: any[]; territories?: any[] } = {}) {
  const territory = opts.territory ?? TERRITORY;
  const versions: any[] = [versionRow, ...(opts.extraVersions ?? [])].filter(Boolean);
  // Universo de territórios para a checagem de ambiguidade (default: só o próprio).
  const territories: any[] = opts.territories ?? [territory];
  const state: any = { versions, writes: { neighborhoods: 0, geofences: 0, execRaw: 0, territoryUpdate: 0, managerWrite: 0 }, transitions: [] };
  const prisma: any = {
    __state: state,
    operational_territories: {
      findUnique: async ({ where }: any) => {
        const t = territories.find((x) => x.id === where.id) ?? (territory && territory.id === where.id ? territory : null);
        return t ? { ...t } : null;
      },
      findMany: async ({ where }: any) => {
        // filtra por uf (in [...]) como o resolver faz
        const ufs = where?.uf?.in ?? null;
        return territories
          .filter((t) => !ufs || ufs.includes(t.uf))
          .map((t) => ({ id: t.id, name: t.name, city_name: t.city_name, uf: t.uf }));
      },
      update: async () => { state.writes.territoryUpdate++; throw new Error('NÃO deve alterar operational_territories'); },
      updateMany: async () => { state.writes.territoryUpdate++; throw new Error('NÃO deve alterar operational_territories'); },
    },
    territory_manager_assignments: {
      findMany: async () => [], // leitura permitida (loadManager no dry-run)
      create: async () => { state.writes.managerWrite++; throw new Error('NÃO deve alterar gestores'); },
      updateMany: async () => { state.writes.managerWrite++; throw new Error('NÃO deve alterar gestores'); },
    },
    territorial_dataset_versions: {
      findUnique: async ({ where }: any) => { const v = versions.find((x) => x.id === where.id); return v ? { ...v } : null; },
      findMany: async ({ where }: any) => {
        const wantUf = where.uf?.toUpperCase ? where.uf.toUpperCase() : where.uf;
        return versions
          .filter((v) => v.city === where.city && v.uf === wantUf)
          .map((v) => ({ ...v }));
      },
      // compare-and-set
      updateMany: async ({ where, data }: any) => {
        const allowed = where.status?.in ?? (where.status ? [where.status] : null);
        const v = versions.find((x) => x.id === where.id && (!allowed || allowed.includes(x.status)));
        if (!v) return { count: 0 };
        state.transitions.push({ from: v.status, to: data.status });
        v.status = data.status;
        return { count: 1 };
      },
    },
    // GUARDAS: qualquer escrita real em bairros/geofences deve FALHAR o teste.
    neighborhoods: {
      create: async () => { state.writes.neighborhoods++; throw new Error('NÃO deve criar neighborhoods'); },
      update: async () => { state.writes.neighborhoods++; throw new Error('NÃO deve alterar neighborhoods'); },
      upsert: async () => { state.writes.neighborhoods++; throw new Error('NÃO deve upsert neighborhoods'); },
      findFirst: async () => null, // leitura permitida (dry-run consulta existentes)
      findMany: async () => [],
    },
    neighborhood_geofences: {
      create: async () => { state.writes.geofences++; throw new Error('NÃO deve criar geofences'); },
    },
    $executeRaw: async () => { state.writes.execRaw++; throw new Error('NÃO deve gravar geofence via raw'); },
  };
  return prisma;
}

function draftVersion(over: any = {}) {
  return {
    id: 'v1', city: 'Cariacica', uf: 'ES', provider_id: 'osm-overpass', source: 'OSM',
    source_url: 'u', method: 'overpass-api', collected_at: new Date(), is_official: false, source_verified: false,
    s3_raw_key: 'k/raw.json', s3_normalized_key: 'k/normalized.geojson',
    feature_count: 2, invalid_count: 0, duplicate_count: 0, out_of_bbox_count: 0,
    status: 'DRAFT', created_by: null, created_at: new Date(), applied_at: null, notes: null,
    checksum: VALID_CHECKSUM, ...over,
  };
}
const okGetObject = async () => VALID_BODY;

// ─── isolamento (pura) ───────────────────────────────────────────────────────
describe('datasetBelongsToTerritory', () => {
  it('casa por city+uf (case-insensitive)', () => {
    expect(datasetBelongsToTerritory({ city: 'cariacica', uf: 'es' }, TERRITORY)).toBe(true);
  });
  it('rejeita UF diferente', () => {
    expect(datasetBelongsToTerritory({ city: 'Cariacica', uf: 'MG' }, TERRITORY)).toBe(false);
  });
  it('rejeita cidade diferente', () => {
    expect(datasetBelongsToTerritory({ city: 'Vitória', uf: 'ES' }, TERRITORY)).toBe(false);
  });
});

describe('previewDatasetVersion', () => {
  it('1) DRAFT + preview OK → PREVIEWED (transitioned) e plano correto', async () => {
    const prisma = makePrisma(draftVersion());
    const r = await previewDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe('PREVIEWED');
    expect(r.transitioned).toBe(true);
    expect(r.plan.totals.validNeighborhoods).toBe(2);
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED');
    // nada escrito em bairros/geofences/território
    expect(prisma.__state.writes).toEqual({ neighborhoods: 0, geofences: 0, execRaw: 0, territoryUpdate: 0, managerWrite: 0 });
  });

  it('2) DRAFT + falha (S3 erro) → continua DRAFT', async () => {
    const prisma = makePrisma(draftVersion());
    const getObject = async () => { const e: any = new Error('s3 down'); e.code = 'S3_LOAD_FAILED'; throw e; };
    const r = await previewDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject });
    expect(r.ok).toBe(false);
    expect(prisma.__state.versions[0].status).toBe('DRAFT');
    expect(prisma.__state.transitions).toHaveLength(0);
  });

  it('3) DRAFT + checksum inválido → continua DRAFT', async () => {
    const prisma = makePrisma(draftVersion({ checksum: 'deadbeef' }));
    const r = await previewDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('CHECKSUM_MISMATCH');
    expect(prisma.__state.versions[0].status).toBe('DRAFT');
  });

  it('4) DRAFT + abort → continua DRAFT', async () => {
    const prisma = makePrisma(draftVersion());
    const ac = new AbortController(); ac.abort();
    const r = await previewDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject, signal: ac.signal });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('PREVIEW_ABORTED');
    expect(prisma.__state.versions[0].status).toBe('DRAFT');
  });

  it('4b) DRAFT + deadline → continua DRAFT', async () => {
    const prisma = makePrisma(draftVersion());
    // getObject demora além do deadline
    const slowGet = () => new Promise<string>((resolve) => setTimeout(() => resolve(VALID_BODY), 200));
    const r = await previewDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: slowGet, totalDeadlineMs: 20 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('PREVIEW_DEADLINE_EXCEEDED');
    expect(prisma.__state.versions[0].status).toBe('DRAFT');
  });

  it('5) PREVIEWED + preview novamente → sucesso e continua PREVIEWED (sem transição)', async () => {
    const prisma = makePrisma(draftVersion({ status: 'PREVIEWED' }));
    const r = await previewDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe('PREVIEWED');
    expect(r.transitioned).toBe(false);
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED');
    expect(prisma.__state.writes.neighborhoods).toBe(0);
  });

  it('6) dataset de territory/cidade diferente → rejeitado', async () => {
    const prisma = makePrisma(draftVersion({ city: 'Vitória' }));
    const r = await previewDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('DATASET_TERRITORY_MISMATCH');
    expect(prisma.__state.versions[0].status).toBe('DRAFT');
  });

  it('9) REJECTED → preview inválido', async () => {
    const prisma = makePrisma(draftVersion({ status: 'REJECTED' }));
    const r = await previewDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('13) GeoJSON acima do limite → rejeitado ANTES do parse (permanece DRAFT)', async () => {
    const prisma = makePrisma(draftVersion());
    const huge = 'x'.repeat(2000);
    const getBig = async () => huge; // não é JSON, mas deve falhar por tamanho antes do parse
    const r = await previewDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: getBig, maxNormalizedBytes: 1000 });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('NORMALIZED_TOO_LARGE');
    expect(prisma.__state.versions[0].status).toBe('DRAFT');
  });

  it('JSON inválido do S3 → permanece DRAFT', async () => {
    const prisma = makePrisma(draftVersion({ checksum: null })); // sem checksum p/ chegar ao parse
    const r = await previewDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => '{ not json' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('INVALID_NORMALIZED_JSON');
    expect(prisma.__state.versions[0].status).toBe('DRAFT');
  });

  it('14) checksum é calculado sobre os bytes lidos do S3 (bate quando corresponde)', async () => {
    const prisma = makePrisma(draftVersion({ checksum: VALID_CHECKSUM }));
    const r = await previewDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: async () => VALID_BODY });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.checksumMatches).toBe(true);
  });

  it('12) concorrência DRAFT→PREVIEWED: só uma transição efetiva', async () => {
    const prisma = makePrisma(draftVersion());
    const [a, b] = await Promise.all([
      previewDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject }),
      previewDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    const transitionedCount = [a, b].filter((r) => r.ok && (r as any).transitioned).length;
    expect(transitionedCount).toBe(1); // apenas uma efetiva
    expect(prisma.__state.versions[0].status).toBe('PREVIEWED');
    // apenas UMA transição registrada (compare-and-set)
    expect(prisma.__state.transitions.filter((t: any) => t.to === 'PREVIEWED')).toHaveLength(1);
  });
});

describe('rejectDatasetVersion', () => {
  it('7) DRAFT → REJECTED', async () => {
    const prisma = makePrisma(draftVersion());
    const r = await rejectDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma });
    expect(r.ok).toBe(true);
    expect(prisma.__state.versions[0].status).toBe('REJECTED');
    expect(prisma.__state.writes.neighborhoods).toBe(0);
  });

  it('8) PREVIEWED → REJECTED', async () => {
    const prisma = makePrisma(draftVersion({ status: 'PREVIEWED' }));
    const r = await rejectDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma });
    expect(r.ok).toBe(true);
    expect(prisma.__state.versions[0].status).toBe('REJECTED');
  });

  it('9) REJECTED → reject inválido (terminal)', async () => {
    const prisma = makePrisma(draftVersion({ status: 'REJECTED' }));
    const r = await rejectDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('APPLIED → reject inválido (não sofre transição na Fase 2)', async () => {
    const prisma = makePrisma(draftVersion({ status: 'APPLIED' }));
    const r = await rejectDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('dataset de outro território → rejeitado', async () => {
    const prisma = makePrisma(draftVersion({ uf: 'MG' }));
    const r = await rejectDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('DATASET_TERRITORY_MISMATCH');
  });
});

describe('10/11) invariantes: nenhum fluxo escreve bairros/geofences/território/gestor', () => {
  it('preview + reject não tocam neighborhoods/geofences/territory/manager', async () => {
    const prisma = makePrisma(draftVersion());
    await previewDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    await rejectDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma });
    expect(prisma.__state.writes.neighborhoods).toBe(0);
    expect(prisma.__state.writes.geofences).toBe(0);
    expect(prisma.__state.writes.execRaw).toBe(0);
    expect(prisma.__state.writes.territoryUpdate).toBe(0);
    expect(prisma.__state.writes.managerWrite).toBe(0);
  });
});

describe('listTerritoryDatasets', () => {
  it('lista versões do território', async () => {
    const prisma = makePrisma(draftVersion(), { extraVersions: [draftVersion({ id: 'v2', status: 'PREVIEWED' })] });
    const r = await listTerritoryDatasets('terr-cariacica', { prisma });
    expect(r.ok).toBe(true);
    expect(r.datasets?.length).toBe(2);
  });
});

// ─── 15) Endpoints restritos a SUPER_ADMIN (asserção de fonte) ───────────────
describe('15) endpoints Fase 2 são SUPER_ADMIN', () => {
  const src = (() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { readFileSync } = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { resolve } = require('path');
    return readFileSync(resolve(__dirname, '../src/routes/admin-territories.ts'), 'utf8');
  })();

  it('router aplica requireSuperAdmin', () => {
    expect(src).toMatch(/router\.use\(\s*authenticateAdmin\s*,\s*requireSuperAdmin\s*\)/);
  });
  it('registra os 3 endpoints de dataset da Fase 2', () => {
    expect(src).toContain("'/:id/prepare-city/datasets'");
    expect(src).toContain("'/:id/prepare-city/datasets/:versionId/preview'");
    expect(src).toContain("'/:id/prepare-city/datasets/:versionId/reject'");
  });
});

// ─── Guarda de ambiguidade (dois territórios com mesma city+UF) ──────────────
describe('DATASET_TERRITORY_AMBIGUOUS: dois territórios com mesma city+UF', () => {
  // Dois territórios distintos que mapeiam para Cariacica/ES.
  const T1 = { id: 'terr-cariacica', name: 'Cariacica', city_name: 'Cariacica', uf: 'ES', level: 'city', status: 'planning' };
  const T2 = { id: 'terr-cariacica-2', name: 'Cariacica Sede', city_name: 'Cariacica', uf: 'ES', level: 'city', status: 'planning' };

  it('list bloqueado por ambiguidade', async () => {
    const prisma = makePrisma(draftVersion(), { territory: T1, territories: [T1, T2] });
    const r = await listTerritoryDatasets('terr-cariacica', { prisma });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('DATASET_TERRITORY_AMBIGUOUS');
  });

  it('preview bloqueado por ambiguidade ANTES do S3 (getObject não chamado)', async () => {
    const prisma = makePrisma(draftVersion(), { territory: T1, territories: [T1, T2] });
    let s3Called = false;
    const getObject = async () => { s3Called = true; return VALID_BODY; };
    const r = await previewDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('DATASET_TERRITORY_AMBIGUOUS');
    expect(s3Called).toBe(false); // S3 nunca acessado
    expect(prisma.__state.versions[0].status).toBe('DRAFT'); // sem transição
  });

  it('reject bloqueado por ambiguidade (sem transição)', async () => {
    const prisma = makePrisma(draftVersion(), { territory: T1, territories: [T1, T2] });
    const r = await rejectDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('DATASET_TERRITORY_AMBIGUOUS');
    expect(prisma.__state.versions[0].status).toBe('DRAFT');
  });

  it('caso NÃO ambíguo continua funcionando (só um território casa)', async () => {
    const OTHER = { id: 'terr-vitoria', name: 'Vitória', city_name: 'Vitória', uf: 'ES', level: 'city' };
    const prisma = makePrisma(draftVersion(), { territory: T1, territories: [T1, OTHER] });
    const r = await previewDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe('PREVIEWED');
  });
});

// ─── versionId com city/UF divergente → bloqueado ANTES do S3/transição ──────
describe('versionId com city/UF divergente', () => {
  it('mismatch bloqueia antes do S3 (getObject não chamado, sem transição)', async () => {
    const prisma = makePrisma(draftVersion({ city: 'Vitória' })); // versão de outra cidade
    let s3Called = false;
    const getObject = async () => { s3Called = true; return VALID_BODY; };
    const r = await previewDatasetVersion({ territoryId: 'terr-cariacica', versionId: 'v1', prisma, getObject });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('DATASET_TERRITORY_MISMATCH');
    expect(s3Called).toBe(false);
    expect(prisma.__state.versions[0].status).toBe('DRAFT');
  });
});

// ─── FASE 3A: territory_id como autoridade primária de isolamento ────────────
describe('FASE 3A — isolamento por territory_id', () => {
  const T1 = { id: 'terr-1', name: 'Cariacica', city_name: 'Cariacica', uf: 'ES', level: 'city', status: 'planning' };
  const T2 = { id: 'terr-2', name: 'Cariacica Sede', city_name: 'Cariacica', uf: 'ES', level: 'city', status: 'planning' };

  it('2) versão com territory_id correto passa isolamento', async () => {
    const prisma = makePrisma(draftVersion({ territory_id: 'terr-1' }), { territory: T1, territories: [T1, T2] });
    const r = await previewDatasetVersion({ territoryId: 'terr-1', versionId: 'v1', prisma, getObject: okGetObject });
    // Mesmo com T1/T2 ambíguos por city+uf, territory_id resolve → sucesso.
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe('PREVIEWED');
  });

  it('3) versão com territory_id de OUTRO território → mismatch', async () => {
    const prisma = makePrisma(draftVersion({ territory_id: 'terr-2' }), { territory: T1, territories: [T1, T2] });
    let s3 = false;
    const r = await previewDatasetVersion({ territoryId: 'terr-1', versionId: 'v1', prisma, getObject: async () => { s3 = true; return VALID_BODY; } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('DATASET_TERRITORY_MISMATCH');
    expect(s3).toBe(false); // bloqueado antes do S3
    expect(prisma.__state.versions[0].status).toBe('DRAFT');
  });

  it('4) city/UF iguais mas territory_id diferente → bloqueia PELO territory_id (não passa)', async () => {
    // T1 e T2 têm a mesma city+uf; a versão aponta para T2. Preview em T1 falha.
    const prisma = makePrisma(draftVersion({ territory_id: 'terr-2' }), { territory: T1, territories: [T1, T2] });
    const r = await rejectDatasetVersion({ territoryId: 'terr-1', versionId: 'v1', prisma });
    expect(r.ok).toBe(false);
    expect(r.code).toBe('DATASET_TERRITORY_MISMATCH');
    expect(prisma.__state.versions[0].status).toBe('DRAFT'); // sem transição
  });

  it('5) legado territory_id NULL + city/UF inequívoco → continua funcionando', async () => {
    const OTHER = { id: 'terr-vitoria', name: 'Vitória', city_name: 'Vitória', uf: 'ES', level: 'city' };
    const prisma = makePrisma(draftVersion({ territory_id: null }), { territory: T1, territories: [T1, OTHER] });
    const r = await previewDatasetVersion({ territoryId: 'terr-1', versionId: 'v1', prisma, getObject: okGetObject });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.status).toBe('PREVIEWED');
  });

  it('6) legado territory_id NULL + city/UF ambíguo → continua fail-closed', async () => {
    const prisma = makePrisma(draftVersion({ territory_id: null }), { territory: T1, territories: [T1, T2] });
    let s3 = false;
    const r = await previewDatasetVersion({ territoryId: 'terr-1', versionId: 'v1', prisma, getObject: async () => { s3 = true; return VALID_BODY; } });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.code).toBe('DATASET_TERRITORY_AMBIGUOUS');
    expect(s3).toBe(false);
  });
});

// ─── FASE 3A: territory_id NÃO deve depender de city/uf do território ─────────
describe('FASE 3A — territory_id independe de city/uf', () => {
  it('território SEM city_name/UF + versão com territory_id CORRETO → ownership válido (OK)', async () => {
    // Território moderno sem city/uf preenchidos; ownership resolve só por territory_id.
    const T = { id: 'terr-x', name: 'Território X', city_name: null, uf: null };
    const prisma = makePrisma(draftVersion({ territory_id: 'terr-x' }), { territory: T, territories: [T] });
    const own = await resolveVersionOwnership(prisma, 'terr-x', 'v1');
    expect(own.code).toBe('OK');
    expect(own.version?.id).toBe('v1');
  });

  it('território SEM city/UF + versão com territory_id ERRADO → MISMATCH (não CITY_UF_MISSING)', async () => {
    const T = { id: 'terr-x', name: 'Território X', city_name: null, uf: null };
    // versão aponta para outro território
    const prisma = makePrisma(draftVersion({ territory_id: 'terr-outro' }), { territory: T, territories: [T] });
    const own = await resolveVersionOwnership(prisma, 'terr-x', 'v1');
    expect(own.code).toBe('DATASET_TERRITORY_MISMATCH');
  });

  it('versão LEGADA territory_id=NULL + território SEM city/UF → CITY_UF_MISSING (fail-closed)', async () => {
    const T = { id: 'terr-x', name: 'Território X', city_name: null, uf: null };
    const prisma = makePrisma(draftVersion({ territory_id: null }), { territory: T, territories: [T] });
    const own = await resolveVersionOwnership(prisma, 'terr-x', 'v1');
    expect(own.code).toBe('CITY_UF_MISSING');
  });
});
