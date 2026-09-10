import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Admin = { id: string; role: string };

const { authState, scopeState, dbState, prismaMock, nextUuid } = vi.hoisted(() => {
  const territories = new Map<string, { id: string; name: string; city_name: string | null; uf: string | null }>([
    ['territory-rio', { id: 'territory-rio', name: 'Rio', city_name: 'Rio de Janeiro', uf: 'RJ' }],
  ]);
  const partners = new Map<string, any>([
    ['partner-a', { id: 'partner-a', name: 'Hotel Atlântico Partner', partner_type: 'business', status: 'active', territory_id: 'territory-rio' }],
    ['partner-b', { id: 'partner-b', name: 'Outro Partner', partner_type: 'business', status: 'active', territory_id: 'territory-rio' }],
  ]);

  const state = {
    places: [] as any[],
    contents: [] as any[],
    changeRequests: [] as any[],
    territories,
    partners,
  };

  function now() {
    return new Date('2026-09-10T18:00:00.000Z');
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
    if (where.owner_partner_id && place.owner_partner_id !== where.owner_partner_id) return false;
    if (where.territory_id && typeof where.territory_id === 'string' && place.territory_id !== where.territory_id) return false;
    if (where.territory_id?.in && !where.territory_id.in.includes(place.territory_id)) return false;
    if (where.city?.contains) {
      const city = String(place.city || '').toLowerCase();
      const needle = String(where.city.contains).toLowerCase();
      if (!city.includes(needle)) return false;
    }
    return true;
  }

  function filterChangeRequest(changeRequest: any, where: any): boolean {
    if (!where) return true;
    if (where.id && changeRequest.id !== where.id) return false;
    if (where.status && changeRequest.status !== where.status) return false;
    if (where.partner_id && changeRequest.partner_id !== where.partner_id) return false;
    if (where.ar_place_id && changeRequest.ar_place_id !== where.ar_place_id) return false;
    return true;
  }

  function project(record: any, select: any) {
    if (!select) return { ...record };
    const projected: Record<string, unknown> = {};
    Object.entries(select).forEach(([key, value]) => {
      if (!value) return;
      if (key === 'partner' && typeof value === 'object') {
        const partner = state.partners.get(record.partner_id) || null;
        projected.partner = partner ? project(partner, (value as any).select) : null;
        return;
      }
      projected[key] = record[key];
    });
    return projected;
  }

  function hydrateChangeRequests(placeId: string, include: any) {
    let rows = state.changeRequests.filter((item) => item.ar_place_id === placeId);
    if (include?.where) {
      rows = rows.filter((item) => filterChangeRequest(item, include.where));
    }
    if (include?.orderBy?.created_at === 'desc') {
      rows = rows.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    if (include?.take) rows = rows.slice(0, include.take);
    return rows.map((item) => project(item, include.select));
  }

  function hydratePlace(place: any, include: any) {
    const base = { ...place };
    if (include?.territory) {
      base.territory = place.territory_id ? state.territories.get(place.territory_id) || null : null;
    }
    if (include?.owner_partner) {
      const partner = place.owner_partner_id ? state.partners.get(place.owner_partner_id) || null : null;
      base.owner_partner = partner ? project(partner, include.owner_partner.select) : null;
    }
    if (include?.contents) {
      let contents = state.contents.filter((item) => item.ar_place_id === place.id);
      if (include.contents.where?.locale) {
        contents = contents.filter((item) => item.locale === include.contents.where.locale);
      }
      if (include.contents.orderBy?.created_at === 'asc') {
        contents = contents.slice().sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }
      base.contents = contents.slice(0, include.contents.take || contents.length).map((item) => project(item, include.contents.select));
    }
    if (include?.change_requests) {
      base.change_requests = hydrateChangeRequests(place.id, include.change_requests);
    }
    return base;
  }

  const prismaMock: any = {
    ar_places: {
      findMany: vi.fn(async ({ where, include }: any) =>
        state.places.filter((place) => filterPlace(place, where)).map((place) => hydratePlace(place, include)),
      ),
      findFirst: vi.fn(async ({ where, include, select }: any) => {
        const found = state.places.find((place) => filterPlace(place, where));
        if (!found) return null;
        if (select) {
          const selected: Record<string, unknown> = {};
          Object.keys(select).forEach((key) => {
            if (!select[key]) return;
            if (key === 'change_requests') {
              selected.change_requests = hydrateChangeRequests(found.id, select.change_requests);
              return;
            }
            selected[key] = found[key];
          });
          return selected;
        }
        return hydratePlace(found, include);
      }),
      findUnique: vi.fn(async ({ where, include }: any) => {
        const found = state.places.find((place) => place.id === where.id);
        if (!found) return null;
        return hydratePlace(found, include);
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
          owner_partner_id: data.owner_partner_id ?? null,
          created_at: now(),
          updated_at: now(),
        };
        state.places.push(created);
        if (data.contents?.create) {
          state.contents.push({
            id: nextUuid(1000 + state.contents.length + 1),
            ar_place_id: created.id,
            ...data.contents.create,
            created_at: now(),
            updated_at: now(),
          });
        }
        return hydratePlace(created, include);
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
          owner_partner_id: data.owner_partner
            ? data.owner_partner.disconnect
              ? null
              : data.owner_partner.connect.id
            : current.owner_partner_id,
          updated_at: now(),
        };
        delete next.territory;
        delete next.owner_partner;
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
          id: nextUuid(2000 + state.contents.length + 1),
          ...create,
          ar_place_id: key.ar_place_id,
          created_at: now(),
          updated_at: now(),
        };
        state.contents.push(created);
        return created;
      }),
    },
    ar_place_partner_change_requests: {
      findFirst: vi.fn(async ({ where, select }: any) => {
        const found = state.changeRequests.find((item) => filterChangeRequest(item, where));
        if (!found) return null;
        return project(found, select);
      }),
      create: vi.fn(async ({ data, select }: any) => {
        const created = {
          id: nextUuid(3000 + state.changeRequests.length + 1),
          ...data,
          reviewed_by_admin_id: null,
          reviewed_at: null,
          rejection_reason: null,
          created_at: now(),
          updated_at: now(),
        };
        state.changeRequests.push(created);
        return project(created, select);
      }),
      update: vi.fn(async ({ where, data, select }: any) => {
        const index = state.changeRequests.findIndex((item) => item.id === where.id);
        if (index === -1) throw new Error('not found');
        state.changeRequests[index] = { ...state.changeRequests[index], ...data, updated_at: now() };
        return project(state.changeRequests[index], select);
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        let count = 0;
        state.changeRequests = state.changeRequests.map((item) => {
          if (!filterChangeRequest(item, where)) return item;
          count += 1;
          return { ...item, ...data, updated_at: now() };
        });
        return { count };
      }),
    },
    territorial_partners: {
      findUnique: vi.fn(async ({ where, select }: any) => {
        const partner = state.partners.get(where.id) || null;
        if (!partner) return null;
        return select ? project(partner, select) : clone(partner);
      }),
    },
    operational_territories: {
      findUnique: vi.fn(async ({ where }: any) => state.territories.get(where.id) || null),
    },
    $transaction: vi.fn(async (callback: any) => {
      const tx = {
        ar_places: prismaMock.ar_places,
        ar_place_contents: prismaMock.ar_place_contents,
        ar_place_partner_change_requests: prismaMock.ar_place_partner_change_requests,
      };
      return callback(tx);
    }),
  };

  return {
    authState: { admin: { id: 'sa-1', role: 'SUPER_ADMIN' } as Admin | null },
    scopeState: { scope: null as any },
    dbState: state,
    prismaMock,
    nextUuid,
  };
});

vi.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));
vi.mock('../src/config', () => ({ config: { jwtSecret: 'test-secret' } }));
vi.mock('../src/services/email/email.service', () => ({ emailService: { sendMail: vi.fn() } }));
vi.mock('../src/modules/whatsapp', () => ({ whatsappEvents: { authVerificationCode: vi.fn() } }));
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
const { default: partnerPortalRoutes } = await import('../src/routes/partner-portal');

const app = express();
app.use(express.json());
app.use('/api/admin/ar', adminArPlacesRoutes);
app.use('/api/public/ar/places', publicArPlacesRoutes);
app.use('/api/partner', partnerPortalRoutes);

function managerScope() {
  return {
    territoryIds: ['territory-rio'],
    neighborhoodIds: [],
    accessLevel: 'full',
  };
}

function partnerToken(partnerId: string, userId = `${partnerId}-user`) {
  return jwt.sign({ type: 'partner', partnerId, userId }, 'test-secret');
}

function adminLikeToken() {
  return jwt.sign({ type: 'admin', adminId: 'a-1' }, 'test-secret');
}

function seedApprovedHotel(overrides: Record<string, unknown> = {}) {
  const place = {
    id: nextUuid(dbState.places.length + 1),
    place_id: `hotel-${dbState.places.length + 1}`,
    name: 'Hotel Publicado',
    type: 'HOTEL',
    city: 'Rio de Janeiro',
    state: 'RJ',
    address: 'Av. Atlântica, 100',
    latitude: -22.9,
    longitude: -43.2,
    status: 'APPROVED',
    territory_id: 'territory-rio',
    owner_partner_id: 'partner-a',
    created_at: new Date('2026-09-10T12:00:00.000Z'),
    updated_at: new Date('2026-09-10T12:00:00.000Z'),
    ...overrides,
  };
  dbState.places.push(place);
  dbState.contents.push({
    id: nextUuid(9000 + dbState.contents.length + 1),
    ar_place_id: place.id,
    locale: 'PT_BR',
    summary: 'Resumo publicado',
    description: 'Descrição publicada',
    learn_more: 'Saiba mais publicado',
    useful_info: 'Info publicada',
    grounding_rule: 'Grounding atual',
    boundary_rule: 'Boundary atual',
    created_at: new Date('2026-09-10T12:00:00.000Z'),
    updated_at: new Date('2026-09-10T12:00:00.000Z'),
  });
  return place;
}

beforeEach(() => {
  authState.admin = { id: 'sa-1', role: 'SUPER_ADMIN' };
  scopeState.scope = null;
  dbState.places = [];
  dbState.contents = [];
  dbState.changeRequests = [];
});

describe('AR partner ownership + hotel self-service', () => {
  it('aplica default HOTEL de IA quando admin não informa regras', async () => {
    const res = await request(app).post('/api/admin/ar/places').send({
      place_id: 'hotel-default-rules',
      name: 'Hotel Default',
      type: 'HOTEL',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -22.91,
      longitude: -43.18,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.contents[0].grounding_rule).toContain('Use somente informações cadastradas e aprovadas para o hotel');
    expect(res.body.data.contents[0].boundary_rule).toContain('Não confirme reservas');
  });

  it('preserva override explícito do admin para regras de IA', async () => {
    const res = await request(app).post('/api/admin/ar/places').send({
      place_id: 'hotel-override-rules',
      name: 'Hotel Override',
      type: 'HOTEL',
      city: 'Rio de Janeiro',
      state: 'RJ',
      latitude: -22.91,
      longitude: -43.18,
      content: {
        locale: 'pt-BR',
        grounding_rule: 'Regra custom',
        boundary_rule: 'Limite custom',
      },
    });

    expect(res.status).toBe(201);
    expect(res.body.data.contents[0].grounding_rule).toBe('Regra custom');
    expect(res.body.data.contents[0].boundary_rule).toBe('Limite custom');
  });

  it('lista no portal parceiro apenas hotéis do próprio owner e oculta owner null', async () => {
    seedApprovedHotel();
    seedApprovedHotel({ id: nextUuid(2), place_id: 'hotel-sem-owner', owner_partner_id: null });
    seedApprovedHotel({ id: nextUuid(3), place_id: 'care-owner', type: 'CARE' });

    const res = await request(app)
      .get('/api/partner/ar-places')
      .set('Authorization', `Bearer ${partnerToken('partner-a')}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].place_id).toBe('hotel-1');
  });

  it('retorna 404 para acesso cross-tenant no portal parceiro', async () => {
    const place = seedApprovedHotel();

    const res = await request(app)
      .get(`/api/partner/ar-places/${place.id}`)
      .set('Authorization', `Bearer ${partnerToken('partner-b')}`);

    expect(res.status).toBe(404);
  });

  it('bloqueia payload com campos proibidos no portal parceiro', async () => {
    const place = seedApprovedHotel();

    const res = await request(app)
      .put(`/api/partner/ar-places/${place.id}/change-request`)
      .set('Authorization', `Bearer ${partnerToken('partner-a')}`)
      .send({
        name: 'Hotel Editado',
        status: 'APPROVED',
      });

    expect(res.status).toBe(400);
  });

  it('mantém no máximo um PENDING por local e atualiza a pendência existente', async () => {
    const place = seedApprovedHotel();

    const first = await request(app)
      .put(`/api/partner/ar-places/${place.id}/change-request`)
      .set('Authorization', `Bearer ${partnerToken('partner-a', 'partner-user-1')}`)
      .send({ summary: 'Resumo pendente 1' });
    expect(first.status).toBe(200);

    const second = await request(app)
      .put(`/api/partner/ar-places/${place.id}/change-request`)
      .set('Authorization', `Bearer ${partnerToken('partner-a', 'partner-user-2')}`)
      .send({ summary: 'Resumo pendente 2' });
    expect(second.status).toBe(200);

    expect(dbState.changeRequests).toHaveLength(1);
    expect(dbState.changeRequests[0].summary).toBe('Resumo pendente 2');
    expect(dbState.changeRequests[0].submitted_by_partner_user_id).toBe('partner-user-2');
  });

  it('mantém o endpoint público servindo a versão APPROVED durante pendência', async () => {
    const place = seedApprovedHotel();

    await request(app)
      .put(`/api/partner/ar-places/${place.id}/change-request`)
      .set('Authorization', `Bearer ${partnerToken('partner-a')}`)
      .send({ summary: 'Resumo pendente' });

    const publicRes = await request(app).get(`/api/public/ar/places/by-place-id/${place.place_id}?locale=pt-BR`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.content.summary).toBe('Resumo publicado');
  });

  it('troca de ownership invalida a pendência antiga e preserva histórico sem afetar o publicado', async () => {
    const place = seedApprovedHotel({ place_id: 'hotel-owner-switch' });

    const pending = await request(app)
      .put(`/api/partner/ar-places/${place.id}/change-request`)
      .set('Authorization', `Bearer ${partnerToken('partner-a')}`)
      .send({ summary: 'Resumo do owner A' });
    expect(pending.status).toBe(200);

    const switchOwner = await request(app)
      .patch(`/api/admin/ar/places/${place.id}`)
      .send({ owner_partner_id: 'partner-b' });
    expect(switchOwner.status).toBe(200);
    expect(switchOwner.body.data.owner_partner_id).toBe('partner-b');
    expect(switchOwner.body.data.pending_change_request).toBeNull();

    expect(dbState.changeRequests).toHaveLength(1);
    expect(dbState.changeRequests[0].status).toBe('REJECTED');
    expect(dbState.changeRequests[0].partner_id).toBe('partner-a');
    expect(dbState.changeRequests[0].rejection_reason).toContain('ownership do local mudou');

    const approveOld = await request(app).post(
      `/api/admin/ar/places/${place.id}/change-request/${pending.body.data.id}/approve`,
    );
    expect(approveOld.status).toBe(409);

    const publicRes = await request(app).get(`/api/public/ar/places/by-place-id/${place.place_id}?locale=pt-BR`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.content.summary).toBe('Resumo publicado');

    const partnerBRes = await request(app)
      .get(`/api/partner/ar-places/${place.id}`)
      .set('Authorization', `Bearer ${partnerToken('partner-b')}`);
    expect(partnerBRes.status).toBe(200);
    expect(partnerBRes.body.data.pending_change_request).toBeNull();
  });

  it('aprovação admin aplica a proposta em transação sem mudar governança da IA', async () => {
    const place = seedApprovedHotel();

    await request(app)
      .put(`/api/partner/ar-places/${place.id}/change-request`)
      .set('Authorization', `Bearer ${partnerToken('partner-a')}`)
      .send({
        name: 'Hotel Atualizado',
        address: 'Av. Atlântica, 200',
        summary: 'Resumo aprovado',
      });

    const pending = await request(app).get(`/api/admin/ar/places/${place.id}/change-request`);
    expect(pending.status).toBe(200);
    expect(pending.body.data.summary).toBe('Resumo aprovado');

    const approve = await request(app).post(
      `/api/admin/ar/places/${place.id}/change-request/${pending.body.data.id}/approve`,
    );
    expect(approve.status).toBe(200);
    expect(approve.body.data.status).toBe('APPROVED');

    const publicRes = await request(app).get(`/api/public/ar/places/by-place-id/${place.place_id}?locale=pt-BR`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.name).toBe('Hotel Atualizado');
    expect(publicRes.body.data.address).toBe('Av. Atlântica, 200');
    expect(publicRes.body.data.content.summary).toBe('Resumo aprovado');
    expect(publicRes.body.data.content.grounding_rule).toBe('Grounding atual');
  });

  it('rejeição admin mantém conteúdo publicado intacto', async () => {
    const place = seedApprovedHotel({ place_id: 'hotel-reject' });

    const createPending = await request(app)
      .put(`/api/partner/ar-places/${place.id}/change-request`)
      .set('Authorization', `Bearer ${partnerToken('partner-a')}`)
      .send({ description: 'Descrição rejeitada' });
    expect(createPending.status).toBe(200);

    const reject = await request(app).post(
      `/api/admin/ar/places/${place.id}/change-request/${createPending.body.data.id}/reject`,
    );
    expect(reject.status).toBe(200);
    expect(reject.body.data.status).toBe('REJECTED');

    const publicRes = await request(app).get(`/api/public/ar/places/by-place-id/${place.place_id}?locale=pt-BR`);
    expect(publicRes.status).toBe(200);
    expect(publicRes.body.data.content.description).toBe('Descrição publicada');
  });

  it('approve e reject falham de forma segura se a request já não estiver PENDING', async () => {
    const place = seedApprovedHotel({ place_id: 'hotel-atomic-review' });

    const pending = await request(app)
      .put(`/api/partner/ar-places/${place.id}/change-request`)
      .set('Authorization', `Bearer ${partnerToken('partner-a')}`)
      .send({ description: 'Nova descrição' });
    expect(pending.status).toBe(200);

    const approve = await request(app).post(
      `/api/admin/ar/places/${place.id}/change-request/${pending.body.data.id}/approve`,
    );
    expect(approve.status).toBe(200);

    const rejectAfterApprove = await request(app).post(
      `/api/admin/ar/places/${place.id}/change-request/${pending.body.data.id}/reject`,
    );
    expect(rejectAfterApprove.status).toBe(409);

    const approveAgain = await request(app).post(
      `/api/admin/ar/places/${place.id}/change-request/${pending.body.data.id}/approve`,
    );
    expect(approveAgain.status).toBe(409);
  });

  it('somente SUPER_ADMIN aprova ou rejeita pendências', async () => {
    const place = seedApprovedHotel({ place_id: 'hotel-governed' });
    const createPending = await request(app)
      .put(`/api/partner/ar-places/${place.id}/change-request`)
      .set('Authorization', `Bearer ${partnerToken('partner-a')}`)
      .send({ summary: 'Resumo revisão' });
    expect(createPending.status).toBe(200);

    authState.admin = { id: 'manager-1', role: 'TERRITORIAL_MANAGER' };
    scopeState.scope = managerScope();

    const approve = await request(app).post(
      `/api/admin/ar/places/${place.id}/change-request/${createPending.body.data.id}/approve`,
    );
    expect(approve.status).toBe(403);
  });

  it('não confunde auth de parceiro com token de outro tipo', async () => {
    seedApprovedHotel();

    const res = await request(app)
      .get('/api/partner/ar-places')
      .set('Authorization', `Bearer ${adminLikeToken()}`);

    expect(res.status).toBe(403);
  });
});
