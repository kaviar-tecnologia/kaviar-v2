import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Admin = { id: string; role: string };

const { authState, scopeState, dbState, prismaMock } = vi.hoisted(() => {
  const territories = new Map<string, { id: string; name: string; city_name: string | null; uf: string | null }>([
    ['11111111-1111-4111-8111-111111111111', { id: '11111111-1111-4111-8111-111111111111', name: 'Rio', city_name: 'Rio de Janeiro', uf: 'RJ' }],
    ['22222222-2222-4222-8222-222222222222', { id: '22222222-2222-4222-8222-222222222222', name: 'Niterói', city_name: 'Niterói', uf: 'RJ' }],
  ]);

  const state = {
    places: [] as any[],
    contents: [] as any[],
    territories,
  };

  function now() {
    return new Date('2026-09-09T12:00:00.000Z');
  }

  function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  }

  function nextUuid(prefix: number) {
    return `00000000-0000-4000-8000-${String(prefix).padStart(12, '0')}`;
  }

  function filterPlace(place: any, where: any): boolean {
    if (!where) return true;
    if (where.id && typeof where.id === 'string' && place.id !== where.id) return false;
    if (where.id?.not && place.id === where.id.not) return false;
    if (where.place_id && place.place_id !== where.place_id) return false;
    if (where.type && place.type !== where.type) return false;
    if (where.status && place.status !== where.status) return false;
    if (where.territory_id && typeof where.territory_id === 'string' && place.territory_id !== where.territory_id) return false;
    if (where.territory_id?.in && !where.territory_id.in.includes(place.territory_id)) return false;
    if (where.city?.contains) {
      const city = String(place.city || '').toLowerCase();
      const needle = String(where.city.contains).toLowerCase();
      if (!city.includes(needle)) return false;
    }
    return true;
  }

  function hydrate(place: any, include: any) {
    const base = { ...place };
    if (include?.territory) {
      base.territory = place.territory_id ? territories.get(place.territory_id) || null : null;
    }
    if (include?.contents) {
      let contents = state.contents.filter((item) => item.ar_place_id === place.id);
      if (include.contents.where?.locale) {
        contents = contents.filter((item) => item.locale === include.contents.where.locale);
      }
      base.contents = contents.slice(0, include.contents.take || contents.length).map((item) => ({ ...item }));
    }
    return base;
  }

  const prismaMock: any = {
    ar_places: {
      findMany: vi.fn(async ({ where, include }: any) =>
        state.places.filter((place) => filterPlace(place, where)).map((place) => hydrate(place, include)),
      ),
      findFirst: vi.fn(async ({ where, include, select }: any) => {
        const found = state.places.find((place) => filterPlace(place, where));
        if (!found) return null;
        if (select) {
          const selected: Record<string, unknown> = {};
          Object.keys(select).forEach((key) => {
            if (select[key]) selected[key] = found[key];
          });
          return selected;
        }
        return hydrate(found, include);
      }),
      findUnique: vi.fn(async ({ where, include }: any) => {
        const found = state.places.find((place) => place.id === where.id);
        if (!found) return null;
        return hydrate(found, include);
      }),
      create: vi.fn(async ({ data, include }: any) => {
        const created = {
          id: nextUuid(state.places.length + 1),
          place_id: data.place_id,
          name: data.name,
          type: data.type,
          city: data.city,
          state: data.state,
          address: data.address ?? null,
          latitude: data.latitude,
          longitude: data.longitude,
          status: data.status ?? 'DRAFT',
          territory_id: data.territory_id ?? null,
          created_at: now(),
          updated_at: now(),
        };
        state.places.push(created);
        if (data.contents?.create) {
          state.contents.push({
            id: nextUuid(10000 + state.contents.length + 1),
            ar_place_id: created.id,
            locale: data.contents.create.locale,
            summary: data.contents.create.summary ?? null,
            description: data.contents.create.description ?? null,
            learn_more: data.contents.create.learn_more ?? null,
            useful_info: data.contents.create.useful_info ?? null,
            grounding_rule: data.contents.create.grounding_rule ?? null,
            boundary_rule: data.contents.create.boundary_rule ?? null,
            created_at: now(),
            updated_at: now(),
          });
        }
        return hydrate(created, include);
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const index = state.places.findIndex((item) => item.id === where.id);
        if (index === -1) throw new Error('not found');
        const current = state.places[index];
        const next = {
          ...current,
          ...data,
          territory_id: data.territory
            ? data.territory.disconnect
              ? null
              : data.territory.connect.id
            : current.territory_id,
          updated_at: now(),
        };
        delete next.territory;
        state.places[index] = next;
        return { ...next };
      }),
    },
    ar_place_contents: {
      upsert: vi.fn(async ({ where, update, create }: any) => {
        const key = where.ar_place_id_locale;
        const index = state.contents.findIndex((item) => item.ar_place_id === key.ar_place_id && item.locale === key.locale);
        if (index >= 0) {
          state.contents[index] = { ...state.contents[index], ...update, updated_at: now() };
          return { ...state.contents[index] };
        }
        const created = {
          id: nextUuid(10000 + state.contents.length + 1),
          ...create,
          created_at: now(),
          updated_at: now(),
        };
        state.contents.push(created);
        return created;
      }),
    },
    operational_territories: {
      findUnique: vi.fn(async ({ where }: any) => state.territories.get(where.id) || null),
    },
    $transaction: vi.fn(async (callback: any) => {
      const tx = {
        ar_places: prismaMock.ar_places,
        ar_place_contents: prismaMock.ar_place_contents,
      };
      return callback(tx);
    }),
  };

  return {
    authState: { admin: { id: 'sa-1', role: 'SUPER_ADMIN' } as Admin | null },
    scopeState: { scope: null as any },
    dbState: state,
    prismaMock,
  };
});

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/middlewares/auth', () => ({
  authenticateAdmin: (req: any, res: any, next: any) => {
    if (!authState.admin) return res.status(401).json({ success: false, error: 'Não autenticado' });
    req.admin = authState.admin;
    next();
  },
  requireRole: (allowedRoles: string[]) => (req: any, res: any, next: any) => {
    if (!allowedRoles.includes(req.admin.role)) {
      return res.status(403).json({ success: false, error: 'Acesso negado. Permissão insuficiente.' });
    }
    next();
  },
}));
vi.mock('../src/middlewares/territory-scope', () => ({
  applyTerritoryScope: (req: any, _res: any, next: any) => {
    req.territoryScope = scopeState.scope;
    next();
  },
}));
vi.mock('../src/middlewares/require-territory-scope', () => ({
  requireTerritoryScope: (req: any, res: any, next: any) => {
    const role = req.admin?.role;
    if (role === 'TERRITORIAL_MANAGER' || role === 'TERRITORIAL_OPERATOR') {
      const ids = req.territoryScope?.territoryIds || [];
      if (ids.length === 0) return res.status(403).json({ success: false, error: 'Sem território vinculado. Acesso negado.' });
    }
    next();
  },
}));

const { default: adminArPlacesRoutes } = await import('../src/routes/admin-ar-places');
const { default: publicArPlacesRoutes } = await import('../src/routes/public-ar-places');

const app = express();
app.use(express.json());
app.use('/api/admin/ar', adminArPlacesRoutes);
app.use('/api/public/ar/places', publicArPlacesRoutes);

function managerScope() {
  return {
    territoryIds: ['11111111-1111-4111-8111-111111111111'],
    neighborhoodIds: [],
    accessLevel: 'full',
  };
}

beforeEach(() => {
  authState.admin = { id: 'sa-1', role: 'SUPER_ADMIN' };
  scopeState.scope = null;
  dbState.places = [];
  dbState.contents = [];
});

describe('admin ar places CRUD and RBAC', () => {
  it('SUPER_ADMIN cria sem status e recebe DRAFT', async () => {
    const res = await request(app).post('/api/admin/ar/places').send({
      place_id: 'hotel-atlantico-rio',
      name: 'Hotel Atlântico Rio',
      type: 'HOTEL',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -22.91,
      longitude: -43.18,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('DRAFT');
  });

  it('SUPER_ADMIN não pode criar diretamente como APPROVED', async () => {
    const res = await request(app).post('/api/admin/ar/places').send({
      place_id: 'hotel-aprovado-direto',
      name: 'Hotel Aprovado Direto',
      type: 'HOTEL',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -22.91,
      longitude: -43.18,
      status: 'APPROVED',
    });
    expect(res.status).toBe(400);
  });

  it('TERRITORIAL_MANAGER não pode criar com SUBMITTED ou APPROVED', async () => {
    authState.admin = { id: 'manager-1', role: 'TERRITORIAL_MANAGER' };
    scopeState.scope = managerScope();

    const submittedRes = await request(app).post('/api/admin/ar/places').send({
      place_id: 'manager-submitted-direto',
      name: 'Manager Submitted',
      type: 'HOTEL',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -22.91,
      longitude: -43.18,
      territory_id: '11111111-1111-4111-8111-111111111111',
      status: 'SUBMITTED',
    });
    expect(submittedRes.status).toBe(400);

    const approvedRes = await request(app).post('/api/admin/ar/places').send({
      place_id: 'manager-approved-direto',
      name: 'Manager Approved',
      type: 'HOTEL',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -22.91,
      longitude: -43.18,
      territory_id: '11111111-1111-4111-8111-111111111111',
      status: 'APPROVED',
    });
    expect(approvedRes.status).toBe(400);
  });

  it('rejeita place_id duplicado', async () => {
    await request(app).post('/api/admin/ar/places').send({
      place_id: 'hotel-atlantico-rio',
      name: 'Hotel A',
      type: 'HOTEL',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -22.91,
      longitude: -43.18,
    });
    const res = await request(app).post('/api/admin/ar/places').send({
      place_id: 'hotel-atlantico-rio',
      name: 'Hotel B',
      type: 'HOTEL',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -22.92,
      longitude: -43.19,
    });
    expect(res.status).toBe(409);
  });

  it('rejeita slug inválido', async () => {
    const res = await request(app).post('/api/admin/ar/places').send({
      place_id: 'Hotel Invalido',
      name: 'Hotel',
      type: 'HOTEL',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -22.9,
      longitude: -43.2,
    });
    expect(res.status).toBe(400);
  });

  it('rejeita latitude inválida e longitude inválida', async () => {
    const latRes = await request(app).post('/api/admin/ar/places').send({
      place_id: 'hotel-lat',
      name: 'Hotel',
      type: 'HOTEL',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -91,
      longitude: -43.2,
    });
    expect(latRes.status).toBe(400);

    const lngRes = await request(app).post('/api/admin/ar/places').send({
      place_id: 'hotel-lng',
      name: 'Hotel',
      type: 'HOTEL',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -22.9,
      longitude: 181,
    });
    expect(lngRes.status).toBe(400);
  });

  it('rejeita territory_id inexistente', async () => {
    const res = await request(app).post('/api/admin/ar/places').send({
      place_id: 'hotel-sem-territorio',
      name: 'Hotel',
      type: 'HOTEL',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -22.9,
      longitude: -43.2,
      territory_id: '33333333-3333-4333-8333-333333333333',
    });
    expect(res.status).toBe(400);
  });

  it('lista, filtra e busca por id', async () => {
    await request(app).post('/api/admin/ar/places').send({
      place_id: 'hotel-atlantico-rio',
      name: 'Hotel Atlântico',
      type: 'HOTEL',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -22.9,
      longitude: -43.2,
      territory_id: '11111111-1111-4111-8111-111111111111',
    });
    await request(app).post('/api/admin/ar/places').send({
      place_id: 'pet-botafogo',
      name: 'Pet Botafogo',
      type: 'PET',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -22.95,
      longitude: -43.18,
      territory_id: '11111111-1111-4111-8111-111111111111',
    });

    const listRes = await request(app).get('/api/admin/ar/places?type=PET&city=rio');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);

    const id = listRes.body.data[0].id;
    const getRes = await request(app).get(`/api/admin/ar/places/${id}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.place_id).toBe('pet-botafogo');
  });

  it('edita local e conteúdo pt-BR (upsert sem duplicar locale)', async () => {
    const created = await request(app).post('/api/admin/ar/places').send({
      place_id: 'aeroporto-demo',
      name: 'Aeroporto Demo',
      type: 'AIRPORT',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -22.8,
      longitude: -43.25,
      content: { locale: 'pt-BR', summary: 'Resumo 1' },
    });
    const id = created.body.data.id;

    const patch1 = await request(app).patch(`/api/admin/ar/places/${id}`).send({
      content: { locale: 'pt-BR', summary: 'Resumo 2' },
    });
    expect(patch1.status).toBe(200);

    const patch2 = await request(app).patch(`/api/admin/ar/places/${id}`).send({
      content: { locale: 'pt-BR', summary: 'Resumo 3' },
    });
    expect(patch2.status).toBe(200);

    const getRes = await request(app).get(`/api/admin/ar/places/${id}`);
    expect(getRes.body.data.contents.filter((item: any) => item.locale === 'pt-BR')).toHaveLength(1);
    expect(getRes.body.data.contents[0].summary).toBe('Resumo 3');
  });

  it('FINANCE é bloqueado', async () => {
    authState.admin = { id: 'f-1', role: 'FINANCE' };
    const res = await request(app).get('/api/admin/ar/places');
    expect(res.status).toBe(403);
  });

  it('TERRITORIAL_OPERATOR possui leitura apenas no escopo', async () => {
    await request(app).post('/api/admin/ar/places').send({
      place_id: 'hotel-rio',
      name: 'Hotel Rio',
      type: 'HOTEL',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -22.9,
      longitude: -43.2,
      territory_id: '11111111-1111-4111-8111-111111111111',
    });
    authState.admin = { id: 'op-1', role: 'TERRITORIAL_OPERATOR' };
    scopeState.scope = managerScope();

    const listRes = await request(app).get('/api/admin/ar/places');
    expect(listRes.status).toBe(200);
    expect(listRes.body.data).toHaveLength(1);

    const createRes = await request(app).post('/api/admin/ar/places').send({
      place_id: 'novo-op',
      name: 'Novo',
      type: 'HOTEL',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -22.9,
      longitude: -43.2,
      territory_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(createRes.status).toBe(403);
  });

  it('TERRITORIAL_MANAGER restrito ao scope e pode apenas DRAFT -> SUBMITTED', async () => {
    authState.admin = { id: 'manager-1', role: 'TERRITORIAL_MANAGER' };
    scopeState.scope = managerScope();

    const outsideCreate = await request(app).post('/api/admin/ar/places').send({
      place_id: 'hotel-fora',
      name: 'Hotel Fora',
      type: 'HOTEL',
      city: 'Niterói',
      state: 'RJ',
      latitude: -22.9,
      longitude: -43.2,
      territory_id: '22222222-2222-4222-8222-222222222222',
    });
    expect(outsideCreate.status).toBe(403);

    const create = await request(app).post('/api/admin/ar/places').send({
      place_id: 'hotel-scope',
      name: 'Hotel Scope',
      type: 'HOTEL',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -22.9,
      longitude: -43.2,
      territory_id: '11111111-1111-4111-8111-111111111111',
    });
    expect(create.status).toBe(201);
    const id = create.body.data.id;

    const submit = await request(app).patch(`/api/admin/ar/places/${id}`).send({ status: 'SUBMITTED' });
    expect(submit.status).toBe(200);
    expect(submit.body.data.status).toBe('SUBMITTED');

    const approve = await request(app).patch(`/api/admin/ar/places/${id}`).send({ status: 'APPROVED' });
    expect(approve.status).toBe(403);
  });

  it('SUPER_ADMIN aplica transições APPROVE, REJECT, INACTIVATE', async () => {
    const created = await request(app).post('/api/admin/ar/places').send({
      place_id: 'tour-rio',
      name: 'Tour Rio',
      type: 'TOURISM',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -22.9,
      longitude: -43.2,
    });
    const id = created.body.data.id;

    const submitted = await request(app).patch(`/api/admin/ar/places/${id}`).send({ status: 'SUBMITTED' });
    expect(submitted.status).toBe(200);
    const approved = await request(app).patch(`/api/admin/ar/places/${id}`).send({ status: 'APPROVED' });
    expect(approved.status).toBe(200);
    const inactivated = await request(app).patch(`/api/admin/ar/places/${id}`).send({ status: 'INACTIVE' });
    expect(inactivated.status).toBe(200);

    const created2 = await request(app).post('/api/admin/ar/places').send({
      place_id: 'tour-rio-2',
      name: 'Tour Rio 2',
      type: 'TOURISM',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -22.91,
      longitude: -43.22,
    });
    const id2 = created2.body.data.id;
    await request(app).patch(`/api/admin/ar/places/${id2}`).send({ status: 'SUBMITTED' });
    const rejected = await request(app).patch(`/api/admin/ar/places/${id2}`).send({ status: 'REJECTED' });
    expect(rejected.status).toBe(200);
  });
});

describe('public ar place endpoint only returns APPROVED', () => {
  const basePayload = {
    name: 'Local público',
    type: 'HOTEL',
    city: 'Rio de Janeiro',
    state: 'RJ',
    latitude: -22.9,
    longitude: -43.2,
  };

  it('DRAFT, SUBMITTED, REJECTED, INACTIVE retornam 404', async () => {
    const statuses = ['DRAFT', 'SUBMITTED', 'REJECTED', 'INACTIVE'];
    for (const status of statuses) {
      const create = await request(app).post('/api/admin/ar/places').send({
        ...basePayload,
        place_id: `status-${status.toLowerCase()}`,
      });
      const id = create.body.data.id;
      if (status !== 'DRAFT') {
        await request(app).patch(`/api/admin/ar/places/${id}`).send({ status: 'SUBMITTED' });
        if (status === 'REJECTED') await request(app).patch(`/api/admin/ar/places/${id}`).send({ status: 'REJECTED' });
        if (status === 'INACTIVE') {
          await request(app).patch(`/api/admin/ar/places/${id}`).send({ status: 'APPROVED' });
          await request(app).patch(`/api/admin/ar/places/${id}`).send({ status: 'INACTIVE' });
        }
      }
      const res = await request(app).get(`/api/public/ar/places/by-place-id/status-${status.toLowerCase()}`);
      expect(res.status).toBe(404);
    }
  });

  it('APPROVED retorna 200', async () => {
    const create = await request(app).post('/api/admin/ar/places').send({
      ...basePayload,
      place_id: 'status-approved',
      content: { locale: 'pt-BR', summary: 'Resumo público' },
    });
    const id = create.body.data.id;
    await request(app).patch(`/api/admin/ar/places/${id}`).send({ status: 'SUBMITTED' });
    await request(app).patch(`/api/admin/ar/places/${id}`).send({ status: 'APPROVED' });

    const res = await request(app).get('/api/public/ar/places/by-place-id/status-approved');
    expect(res.status).toBe(200);
    expect(res.body.data.placeId).toBe('status-approved');
    expect(res.body.data.content.locale).toBe('pt-BR');
  });
});
