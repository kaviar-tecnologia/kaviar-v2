import { Prisma, ar_place_locale, ar_place_status } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { TerritoryScope } from '../territory-scope.service';
import type { ArPlaceCreateBody, ArPlaceListQuery, ArPlacePatchBody } from './ar-places-validation';

type ArPlaceActor = {
  id: string;
  role: string;
};

export class ArPlaceServiceError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function isScopedRole(role: string) {
  return role === 'TERRITORIAL_MANAGER' || role === 'TERRITORIAL_OPERATOR';
}

function ensureScopeForScopedRole(role: string, scope: TerritoryScope | null | undefined) {
  if (!isScopedRole(role)) return;
  const hasScope = (scope?.territoryIds || []).length > 0;
  if (!hasScope) {
    throw new ArPlaceServiceError(403, 'Sem território vinculado. Acesso negado.');
  }
}

function mapLocale(locale: 'pt-BR' | 'en' | 'es' | 'fr'): ar_place_locale {
  if (locale === 'pt-BR') return 'PT_BR';
  if (locale === 'en') return 'EN';
  if (locale === 'es') return 'ES';
  return 'FR';
}

function assertAllowedStatusTransition(role: string, from: ar_place_status, to: ar_place_status) {
  if (from === to) return;

  if (role === 'SUPER_ADMIN') {
    const allowed: Record<ar_place_status, ar_place_status[]> = {
      DRAFT: ['SUBMITTED'],
      SUBMITTED: ['APPROVED', 'REJECTED'],
      APPROVED: ['INACTIVE'],
      REJECTED: ['DRAFT'],
      INACTIVE: [],
    };
    if (!allowed[from].includes(to)) {
      throw new ArPlaceServiceError(409, `Transição de status inválida: ${from} -> ${to}`);
    }
    return;
  }

  if (role === 'TERRITORIAL_MANAGER') {
    if (from === 'DRAFT' && to === 'SUBMITTED') return;
    throw new ArPlaceServiceError(403, `Role ${role} não pode alterar status de ${from} para ${to}`);
  }

  throw new ArPlaceServiceError(403, `Role ${role} não pode alterar status`);
}

async function assertTerritoryExists(territoryId: string) {
  const territory = await prisma.operational_territories.findUnique({
    where: { id: territoryId },
    select: { id: true },
  });
  if (!territory) {
    throw new ArPlaceServiceError(400, 'territory_id não encontrado');
  }
}

function assertTerritoryInScope(role: string, scope: TerritoryScope | null | undefined, territoryId: string | null | undefined) {
  if (!isScopedRole(role)) return;
  if (!territoryId) {
    throw new ArPlaceServiceError(400, 'territory_id é obrigatório para este perfil');
  }
  const allowedTerritories = scope?.territoryIds || [];
  if (!allowedTerritories.includes(territoryId)) {
    throw new ArPlaceServiceError(403, 'Território fora do escopo do administrador');
  }
}

function buildScopeWhere(role: string, scope: TerritoryScope | null | undefined): Prisma.ar_placesWhereInput {
  if (!isScopedRole(role)) return {};
  const territoryIds = scope?.territoryIds || [];
  return { territory_id: { in: territoryIds } };
}

function isUniqueViolation(error: unknown) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return error.code === 'P2002';
}

function normalizeUniqueError(error: unknown): never {
  if (!isUniqueViolation(error)) throw error;
  const meta = (error as Prisma.PrismaClientKnownRequestError).meta as { target?: unknown } | undefined;
  const target = Array.isArray(meta?.target) ? meta?.target.join(',') : String(meta?.target || '');
  if (target.includes('place_id')) {
    throw new ArPlaceServiceError(409, 'place_id já existe');
  }
  if (target.includes('uq_ar_place_contents_place_locale')) {
    throw new ArPlaceServiceError(409, 'Conteúdo duplicado para este locale');
  }
  throw new ArPlaceServiceError(409, 'Conflito de unicidade');
}

async function assertPlaceIdAvailable(placeId: string, ignoreId?: string) {
  const existing = await prisma.ar_places.findFirst({
    where: {
      place_id: placeId,
      ...(ignoreId ? { id: { not: ignoreId } } : {}),
    },
    select: { id: true },
  });
  if (existing) {
    throw new ArPlaceServiceError(409, 'place_id já existe');
  }
}

export async function listAdminArPlaces(
  query: ArPlaceListQuery,
  actor: ArPlaceActor,
  scope: TerritoryScope | null | undefined,
) {
  ensureScopeForScopedRole(actor.role, scope);

  const where: Prisma.ar_placesWhereInput = {
    ...buildScopeWhere(actor.role, scope),
  };

  if (query.type) where.type = query.type;
  if (query.status) where.status = query.status;
  if (query.city) where.city = { contains: query.city, mode: 'insensitive' };
  if (query.state) where.state = query.state;
  if (query.territoryId) where.territory_id = query.territoryId;

  return prisma.ar_places.findMany({
    where,
    include: {
      territory: {
        select: { id: true, name: true, city_name: true, uf: true },
      },
      contents: {
        where: { locale: 'PT_BR' },
        select: {
          id: true,
          locale: true,
          summary: true,
          description: true,
          learn_more: true,
          useful_info: true,
          grounding_rule: true,
          boundary_rule: true,
          created_at: true,
          updated_at: true,
        },
        take: 1,
      },
    },
    orderBy: { updated_at: 'desc' },
  });
}

export async function getAdminArPlaceById(id: string, actor: ArPlaceActor, scope: TerritoryScope | null | undefined) {
  ensureScopeForScopedRole(actor.role, scope);

  const whereScope = buildScopeWhere(actor.role, scope);

  return prisma.ar_places.findFirst({
    where: {
      id,
      ...whereScope,
    },
    include: {
      territory: { select: { id: true, name: true, city_name: true, uf: true } },
      contents: {
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          locale: true,
          summary: true,
          description: true,
          learn_more: true,
          useful_info: true,
          grounding_rule: true,
          boundary_rule: true,
          created_at: true,
          updated_at: true,
        },
      },
    },
  });
}

export async function createAdminArPlace(
  body: ArPlaceCreateBody,
  actor: ArPlaceActor,
  scope: TerritoryScope | null | undefined,
) {
  ensureScopeForScopedRole(actor.role, scope);

  if (body.status && body.status !== 'DRAFT') {
    throw new ArPlaceServiceError(400, 'Novo local AR deve ser criado com status DRAFT');
  }
  const targetStatus: ar_place_status = 'DRAFT';

  if (body.territory_id) {
    await assertTerritoryExists(body.territory_id);
  }
  await assertPlaceIdAvailable(body.place_id);
  assertTerritoryInScope(actor.role, scope, body.territory_id || null);

  try {
    return await prisma.ar_places.create({
      data: {
        place_id: body.place_id,
        name: body.name,
        type: body.type,
        city: body.city,
        state: body.state,
        address: body.address || null,
        latitude: body.latitude,
        longitude: body.longitude,
        status: targetStatus,
        territory_id: body.territory_id || null,
        contents: body.content
          ? {
              create: {
                locale: mapLocale(body.content.locale),
                summary: body.content.summary || null,
                description: body.content.description || null,
                learn_more: body.content.learn_more || null,
                useful_info: body.content.useful_info || null,
                grounding_rule: body.content.grounding_rule || null,
                boundary_rule: body.content.boundary_rule || null,
              },
            }
          : undefined,
      },
      include: {
        territory: { select: { id: true, name: true, city_name: true, uf: true } },
        contents: {
          orderBy: { created_at: 'asc' },
          select: {
            id: true,
            locale: true,
            summary: true,
            description: true,
            learn_more: true,
            useful_info: true,
            grounding_rule: true,
            boundary_rule: true,
            created_at: true,
            updated_at: true,
          },
        },
      },
    });
  } catch (error) {
    normalizeUniqueError(error);
    throw error;
  }
}

export async function updateAdminArPlace(
  id: string,
  body: ArPlacePatchBody,
  actor: ArPlaceActor,
  scope: TerritoryScope | null | undefined,
) {
  ensureScopeForScopedRole(actor.role, scope);

  const existing = await prisma.ar_places.findFirst({
    where: {
      id,
      ...buildScopeWhere(actor.role, scope),
    },
    select: { id: true, status: true, territory_id: true },
  });
  if (!existing) {
    throw new ArPlaceServiceError(404, 'Local AR não encontrado');
  }

  const nextStatus = body.status || existing.status;
  assertAllowedStatusTransition(actor.role, existing.status, nextStatus);

  if (body.place_id !== undefined) {
    await assertPlaceIdAvailable(body.place_id, id);
  }

  if (body.territory_id) {
    await assertTerritoryExists(body.territory_id);
  }
  if (body.territory_id !== undefined) {
    assertTerritoryInScope(actor.role, scope, body.territory_id);
  } else if (existing.territory_id) {
    assertTerritoryInScope(actor.role, scope, existing.territory_id);
  }

  const data: Prisma.ar_placesUpdateInput = {
    status: nextStatus,
  };
  if (body.place_id !== undefined) data.place_id = body.place_id;
  if (body.name !== undefined) data.name = body.name;
  if (body.type !== undefined) data.type = body.type;
  if (body.city !== undefined) data.city = body.city;
  if (body.state !== undefined) data.state = body.state;
  if (body.address !== undefined) data.address = body.address;
  if (body.latitude !== undefined) data.latitude = body.latitude;
  if (body.longitude !== undefined) data.longitude = body.longitude;
  if (body.territory_id !== undefined) data.territory = body.territory_id ? { connect: { id: body.territory_id } } : { disconnect: true };

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.ar_places.update({
        where: { id },
        data,
      });

      if (body.content) {
        await tx.ar_place_contents.upsert({
          where: {
            ar_place_id_locale: {
              ar_place_id: id,
              locale: mapLocale(body.content.locale),
            },
          },
          update: {
            summary: body.content.summary || null,
            description: body.content.description || null,
            learn_more: body.content.learn_more || null,
            useful_info: body.content.useful_info || null,
            grounding_rule: body.content.grounding_rule || null,
            boundary_rule: body.content.boundary_rule || null,
          },
          create: {
            ar_place_id: id,
            locale: mapLocale(body.content.locale),
            summary: body.content.summary || null,
            description: body.content.description || null,
            learn_more: body.content.learn_more || null,
            useful_info: body.content.useful_info || null,
            grounding_rule: body.content.grounding_rule || null,
            boundary_rule: body.content.boundary_rule || null,
          },
        });
      }

      return tx.ar_places.findUnique({
        where: { id: updated.id },
        include: {
          territory: { select: { id: true, name: true, city_name: true, uf: true } },
          contents: {
            orderBy: { created_at: 'asc' },
            select: {
              id: true,
              locale: true,
              summary: true,
              description: true,
              learn_more: true,
              useful_info: true,
              grounding_rule: true,
              boundary_rule: true,
              created_at: true,
              updated_at: true,
            },
          },
        },
      });
    });
  } catch (error) {
    normalizeUniqueError(error);
    throw error;
  }
}

export async function getApprovedPublicArPlaceByPlaceId(placeId: string) {
  return prisma.ar_places.findFirst({
    where: {
      place_id: placeId,
      status: 'APPROVED',
    },
    include: {
      territory: { select: { id: true, name: true, city_name: true, uf: true } },
      contents: {
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          locale: true,
          summary: true,
          description: true,
          learn_more: true,
          useful_info: true,
          grounding_rule: true,
          boundary_rule: true,
          created_at: true,
          updated_at: true,
        },
      },
    },
  });
}
