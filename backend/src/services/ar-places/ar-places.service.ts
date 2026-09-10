import { Prisma, ar_place_locale, ar_place_status, ar_place_type } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import type { TerritoryScope } from '../territory-scope.service';
import { getDefaultAiRulesForArPlaceType } from './ar-place-ai-rules';
import type {
  ArPlaceCreateBody,
  ArPlaceListQuery,
  ArPlacePatchBody,
  PartnerArPlaceChangeRequestBody,
} from './ar-places-validation';

type ArPlaceActor = {
  id: string;
  role: string;
};

type PartnerActor = {
  userId: string;
  partnerId: string;
};

type ContentLike = {
  locale?: 'pt-BR' | 'en' | 'es' | 'fr' | ar_place_locale;
  summary?: string | null;
  description?: string | null;
  learn_more?: string | null;
  useful_info?: string | null;
  grounding_rule?: string | null;
  boundary_rule?: string | null;
};

type EditableSnapshot = {
  locale: ar_place_locale;
  name: string;
  address: string | null;
  summary: string | null;
  description: string | null;
  learn_more: string | null;
  useful_info: string | null;
};

const PENDING_CHANGE_STATUS = 'PENDING';
const APPROVED_CHANGE_STATUS = 'APPROVED';
const REJECTED_CHANGE_STATUS = 'REJECTED';

const arPlaceContentSelect = {
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
} as const;

const ownerPartnerSelect = {
  id: true,
  name: true,
  partner_type: true,
  status: true,
} as const;

const changeRequestSelect = {
  id: true,
  ar_place_id: true,
  partner_id: true,
  submitted_by_partner_user_id: true,
  status: true,
  locale: true,
  name: true,
  address: true,
  summary: true,
  description: true,
  learn_more: true,
  useful_info: true,
  reviewed_by_admin_id: true,
  reviewed_at: true,
  rejection_reason: true,
  created_at: true,
  updated_at: true,
  partner: {
    select: ownerPartnerSelect,
  },
} as const;

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

function normalizeLocale(locale?: 'pt-BR' | 'en' | 'es' | 'fr' | ar_place_locale): ar_place_locale {
  if (locale === 'PT_BR' || locale === 'EN' || locale === 'ES' || locale === 'FR') return locale;
  if (locale === 'en') return 'EN';
  if (locale === 'es') return 'ES';
  if (locale === 'fr') return 'FR';
  return 'PT_BR';
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
  if (target.includes('uq_ar_place_partner_change_requests_pending')) {
    throw new ArPlaceServiceError(409, 'Já existe uma alteração pendente para este local');
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

async function assertOwnerPartnerExists(ownerPartnerId: string, actor: ArPlaceActor, scope: TerritoryScope | null | undefined) {
  const partner = await prisma.territorial_partners.findUnique({
    where: { id: ownerPartnerId },
    select: { id: true, territory_id: true },
  });
  if (!partner) {
    throw new ArPlaceServiceError(400, 'owner_partner_id não encontrado');
  }

  if (isScopedRole(actor.role)) {
    if (!partner.territory_id) {
      throw new ArPlaceServiceError(403, 'Parceiro owner sem território compatível com o escopo');
    }
    assertTerritoryInScope(actor.role, scope, partner.territory_id);
  }
}

function hasOwnField(value: object | undefined, key: string) {
  return !!value && Object.prototype.hasOwnProperty.call(value, key);
}

function buildCreateContentData(type: ar_place_type, content?: ContentLike) {
  const defaults = getDefaultAiRulesForArPlaceType(type);
  const groundingRule = hasOwnField(content, 'grounding_rule')
    ? content?.grounding_rule ?? null
    : defaults?.grounding_rule ?? null;
  const boundaryRule = hasOwnField(content, 'boundary_rule')
    ? content?.boundary_rule ?? null
    : defaults?.boundary_rule ?? null;
  const data = {
    locale: normalizeLocale(content?.locale),
    summary: content?.summary ?? null,
    description: content?.description ?? null,
    learn_more: content?.learn_more ?? null,
    useful_info: content?.useful_info ?? null,
    grounding_rule: groundingRule,
    boundary_rule: boundaryRule,
  };

  const hasData =
    content !== undefined ||
    groundingRule !== null ||
    boundaryRule !== null;

  return hasData ? data : undefined;
}

function buildContentUpdateData(content: ContentLike) {
  const data: Prisma.ar_place_contentsUpdateInput = {};
  if (hasOwnField(content, 'summary')) data.summary = content.summary ?? null;
  if (hasOwnField(content, 'description')) data.description = content.description ?? null;
  if (hasOwnField(content, 'learn_more')) data.learn_more = content.learn_more ?? null;
  if (hasOwnField(content, 'useful_info')) data.useful_info = content.useful_info ?? null;
  if (hasOwnField(content, 'grounding_rule')) data.grounding_rule = content.grounding_rule ?? null;
  if (hasOwnField(content, 'boundary_rule')) data.boundary_rule = content.boundary_rule ?? null;
  return data;
}

function getPrimaryContent<T extends { locale: ar_place_locale }>(contents: T[] | undefined, locale: ar_place_locale = 'PT_BR') {
  return contents?.find((item) => item.locale === locale) || contents?.[0] || null;
}

function extractEditableSnapshot(place: {
  name: string;
  address: string | null;
  contents?: Array<{
    locale: ar_place_locale;
    summary: string | null;
    description: string | null;
    learn_more: string | null;
    useful_info: string | null;
  }>;
}) {
  const content = getPrimaryContent(place.contents);
  return {
    locale: content?.locale || 'PT_BR',
    name: place.name,
    address: place.address || null,
    summary: content?.summary ?? null,
    description: content?.description ?? null,
    learn_more: content?.learn_more ?? null,
    useful_info: content?.useful_info ?? null,
  } satisfies EditableSnapshot;
}

function overlayEditableSnapshot(base: EditableSnapshot, body: PartnerArPlaceChangeRequestBody): EditableSnapshot {
  return {
    locale: base.locale,
    name: hasOwnField(body, 'name') ? body.name ?? base.name : base.name,
    address: hasOwnField(body, 'address') ? body.address ?? null : base.address,
    summary: hasOwnField(body, 'summary') ? body.summary ?? null : base.summary,
    description: hasOwnField(body, 'description') ? body.description ?? null : base.description,
    learn_more: hasOwnField(body, 'learn_more') ? body.learn_more ?? null : base.learn_more,
    useful_info: hasOwnField(body, 'useful_info') ? body.useful_info ?? null : base.useful_info,
  };
}

function getPendingInvalidationReason(ownerChanged: boolean, typeChangedAwayFromHotel: boolean) {
  if (ownerChanged && typeChangedAwayFromHotel) {
    return 'Pendência invalidada porque o ownership do local mudou e o local deixou de ser HOTEL para autoatendimento.';
  }
  if (ownerChanged) {
    return 'Pendência invalidada porque o ownership do local mudou.';
  }
  return 'Pendência invalidada porque o local deixou de ser HOTEL para autoatendimento.';
}

async function rejectPendingChangeRequestsForPlace(
  tx: Prisma.TransactionClient,
  placeId: string,
  actorId: string,
  reason: string,
) {
  await tx.ar_place_partner_change_requests.updateMany({
    where: {
      ar_place_id: placeId,
      status: PENDING_CHANGE_STATUS,
    },
    data: {
      status: REJECTED_CHANGE_STATUS,
      reviewed_by_admin_id: actorId,
      reviewed_at: new Date(),
      rejection_reason: reason,
    },
  });
}

function buildAdminArPlaceInclude(includePendingRequest = false) {
  return {
    territory: { select: { id: true, name: true, city_name: true, uf: true } },
    owner_partner: { select: ownerPartnerSelect },
    contents: {
      orderBy: { created_at: 'asc' as const },
      select: arPlaceContentSelect,
    },
    ...(includePendingRequest
      ? {
          change_requests: {
            where: { status: 'PENDING' },
            orderBy: { created_at: 'desc' as const },
            take: 1,
            select: changeRequestSelect,
          },
        }
      : {}),
  };
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
      owner_partner: { select: ownerPartnerSelect },
      contents: {
        where: { locale: 'PT_BR' },
        select: arPlaceContentSelect,
        take: 1,
      },
      change_requests: {
        where: { status: 'PENDING' },
        orderBy: { created_at: 'desc' },
        take: 1,
        select: changeRequestSelect,
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
    include: buildAdminArPlaceInclude(true),
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
  if (body.owner_partner_id) {
    await assertOwnerPartnerExists(body.owner_partner_id, actor, scope);
  }
  await assertPlaceIdAvailable(body.place_id);
  assertTerritoryInScope(actor.role, scope, body.territory_id || null);

  const contentData = buildCreateContentData(body.type, body.content);

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
        owner_partner_id: body.owner_partner_id || null,
        contents: contentData
          ? {
              create: contentData,
            }
          : undefined,
      },
      include: buildAdminArPlaceInclude(true),
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
    select: { id: true, status: true, territory_id: true, type: true, owner_partner_id: true },
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
  if (body.owner_partner_id) {
    await assertOwnerPartnerExists(body.owner_partner_id, actor, scope);
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
  if (body.owner_partner_id !== undefined) {
    data.owner_partner = body.owner_partner_id ? { connect: { id: body.owner_partner_id } } : { disconnect: true };
  }
  const nextType = body.type ?? existing.type;
  const ownerChanged = body.owner_partner_id !== undefined && body.owner_partner_id !== existing.owner_partner_id;
  const typeChangedAwayFromHotel = existing.type === 'HOTEL' && nextType !== 'HOTEL';
  const shouldInvalidatePendingChangeRequests = ownerChanged || typeChangedAwayFromHotel;
  const pendingInvalidationReason = shouldInvalidatePendingChangeRequests
    ? getPendingInvalidationReason(ownerChanged, typeChangedAwayFromHotel)
    : null;

  try {
    return await prisma.$transaction(async (tx) => {
      const updated = await tx.ar_places.update({
        where: { id },
        data,
      });

      if (shouldInvalidatePendingChangeRequests && pendingInvalidationReason) {
        await rejectPendingChangeRequestsForPlace(tx, id, actor.id, pendingInvalidationReason);
      }

      if (body.content) {
        const locale = normalizeLocale(body.content.locale);
        const createContent = buildCreateContentData(body.type || existing.type, body.content)!;
        await tx.ar_place_contents.upsert({
          where: {
            ar_place_id_locale: {
              ar_place_id: id,
              locale,
            },
          },
          update: buildContentUpdateData(body.content),
          create: {
            ar_place_id: id,
            ...createContent,
          },
        });
      }

      return tx.ar_places.findUnique({
        where: { id: updated.id },
        include: buildAdminArPlaceInclude(true),
      });
    });
  } catch (error) {
    normalizeUniqueError(error);
    throw error;
  }
}

export async function getAdminArPlacePendingChangeRequest(
  placeId: string,
  actor: ArPlaceActor,
  scope: TerritoryScope | null | undefined,
) {
  ensureScopeForScopedRole(actor.role, scope);

  const place = await prisma.ar_places.findFirst({
    where: {
      id: placeId,
      ...buildScopeWhere(actor.role, scope),
    },
    select: {
      id: true,
      change_requests: {
        where: { status: 'PENDING' },
        orderBy: { created_at: 'desc' },
        take: 1,
        select: changeRequestSelect,
      },
    },
  });

  if (!place) {
    throw new ArPlaceServiceError(404, 'Local AR não encontrado');
  }

  return place.change_requests[0] || null;
}

export async function approveAdminArPlaceChangeRequest(
  placeId: string,
  requestId: string,
  actor: ArPlaceActor,
  scope: TerritoryScope | null | undefined,
) {
  ensureScopeForScopedRole(actor.role, scope);
  if (actor.role !== 'SUPER_ADMIN') {
    throw new ArPlaceServiceError(403, 'Apenas SUPER_ADMIN pode aprovar alterações pendentes');
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const place = await tx.ar_places.findFirst({
        where: {
          id: placeId,
          ...buildScopeWhere(actor.role, scope),
        },
        include: {
          contents: {
            orderBy: { created_at: 'asc' },
            select: arPlaceContentSelect,
          },
          change_requests: {
            where: { id: requestId },
            take: 1,
            select: changeRequestSelect,
          },
        },
      });

      if (!place) {
        throw new ArPlaceServiceError(404, 'Local AR não encontrado');
      }
      if (place.type !== 'HOTEL') {
        throw new ArPlaceServiceError(409, 'Alteração pendente só pode ser revisada para locais HOTEL nesta fase');
      }

      const request = place.change_requests[0];
      if (!request) {
        throw new ArPlaceServiceError(404, 'Alteração pendente não encontrada');
      }
      if (request.status !== PENDING_CHANGE_STATUS) {
        throw new ArPlaceServiceError(409, 'Alteração pendente já foi revisada ou invalidada');
      }
      if (!place.owner_partner_id || request.partner_id !== place.owner_partner_id) {
        throw new ArPlaceServiceError(409, 'Ownership do local mudou ou foi removido. A alteração pendente não pode mais ser aplicada.');
      }

      const claim = await tx.ar_place_partner_change_requests.updateMany({
        where: {
          id: requestId,
          ar_place_id: placeId,
          partner_id: place.owner_partner_id,
          status: PENDING_CHANGE_STATUS,
        },
        data: {
          status: APPROVED_CHANGE_STATUS,
          reviewed_by_admin_id: actor.id,
          reviewed_at: new Date(),
          rejection_reason: null,
        },
      });
      if (claim.count !== 1) {
        throw new ArPlaceServiceError(409, 'Alteração pendente já foi revisada ou invalidada');
      }

      const updatedPlace = await tx.ar_places.updateMany({
        where: {
          id: placeId,
          owner_partner_id: request.partner_id,
          type: 'HOTEL',
        },
        data: {
          name: request.name,
          address: request.address,
        },
      });
      if (updatedPlace.count !== 1) {
        throw new ArPlaceServiceError(409, 'Ownership do local mudou ou o local deixou de ser HOTEL antes da publicação da alteração.');
      }

      await tx.ar_place_contents.upsert({
        where: {
          ar_place_id_locale: {
            ar_place_id: placeId,
            locale: request.locale,
          },
        },
        update: {
          summary: request.summary,
          description: request.description,
          learn_more: request.learn_more,
          useful_info: request.useful_info,
        },
        create: {
          ar_place_id: placeId,
          ...buildCreateContentData(place.type, {
            locale: request.locale,
            summary: request.summary,
            description: request.description,
            learn_more: request.learn_more,
            useful_info: request.useful_info,
          })!,
        },
      });

      const reviewed = await tx.ar_place_partner_change_requests.findFirst({
        where: { id: requestId },
        select: changeRequestSelect,
      });
      if (!reviewed) {
        throw new ArPlaceServiceError(404, 'Alteração pendente não encontrada');
      }
      return reviewed;
    });
  } catch (error) {
    normalizeUniqueError(error);
    throw error;
  }
}

export async function rejectAdminArPlaceChangeRequest(
  placeId: string,
  requestId: string,
  actor: ArPlaceActor,
  scope: TerritoryScope | null | undefined,
  reason?: string | null,
) {
  ensureScopeForScopedRole(actor.role, scope);
  if (actor.role !== 'SUPER_ADMIN') {
    throw new ArPlaceServiceError(403, 'Apenas SUPER_ADMIN pode rejeitar alterações pendentes');
  }
  return prisma.$transaction(async (tx) => {
    const place = await tx.ar_places.findFirst({
      where: {
        id: placeId,
        ...buildScopeWhere(actor.role, scope),
      },
      select: {
        id: true,
        type: true,
        owner_partner_id: true,
        change_requests: {
          where: { id: requestId },
          take: 1,
          select: changeRequestSelect,
        },
      },
    });

    if (!place) {
      throw new ArPlaceServiceError(404, 'Local AR não encontrado');
    }
    if (place.type !== 'HOTEL') {
      throw new ArPlaceServiceError(409, 'Alteração pendente só pode ser revisada para locais HOTEL nesta fase');
    }

    const request = place.change_requests[0];
    if (!request) {
      throw new ArPlaceServiceError(404, 'Alteração pendente não encontrada');
    }
    if (request.status !== PENDING_CHANGE_STATUS) {
      throw new ArPlaceServiceError(409, 'Alteração pendente já foi revisada ou invalidada');
    }
    if (!place.owner_partner_id || request.partner_id !== place.owner_partner_id) {
      throw new ArPlaceServiceError(409, 'Ownership do local mudou ou foi removido. A alteração pendente não pode mais ser aplicada.');
    }

    const rejected = await tx.ar_place_partner_change_requests.updateMany({
      where: {
        id: requestId,
        ar_place_id: placeId,
        partner_id: place.owner_partner_id,
        status: PENDING_CHANGE_STATUS,
      },
      data: {
        status: REJECTED_CHANGE_STATUS,
        reviewed_by_admin_id: actor.id,
        reviewed_at: new Date(),
        rejection_reason: reason || null,
      },
    });
    if (rejected.count !== 1) {
      throw new ArPlaceServiceError(409, 'Alteração pendente já foi revisada ou invalidada');
    }

    const reviewed = await tx.ar_place_partner_change_requests.findFirst({
      where: { id: requestId },
      select: changeRequestSelect,
    });
    if (!reviewed) {
      throw new ArPlaceServiceError(404, 'Alteração pendente não encontrada');
    }
    return reviewed;
  });
}

export async function listPartnerOwnedHotelArPlaces(actor: PartnerActor) {
  return prisma.ar_places.findMany({
    where: {
      owner_partner_id: actor.partnerId,
      type: 'HOTEL',
    },
    include: {
      contents: {
        where: { locale: 'PT_BR' },
        select: arPlaceContentSelect,
        take: 1,
      },
      change_requests: {
        where: { status: PENDING_CHANGE_STATUS },
        orderBy: { created_at: 'desc' },
        take: 1,
        select: changeRequestSelect,
      },
    },
    orderBy: { updated_at: 'desc' },
  });
}

export async function getPartnerOwnedHotelArPlaceById(placeId: string, actor: PartnerActor) {
  const place = await prisma.ar_places.findFirst({
    where: {
      id: placeId,
      owner_partner_id: actor.partnerId,
      type: 'HOTEL',
    },
    include: {
      contents: {
        orderBy: { created_at: 'asc' },
        select: arPlaceContentSelect,
      },
      change_requests: {
        where: { status: PENDING_CHANGE_STATUS },
        orderBy: { created_at: 'desc' },
        take: 1,
        select: changeRequestSelect,
      },
    },
  });

  if (!place) {
    throw new ArPlaceServiceError(404, 'Local AR não encontrado');
  }

  return place;
}

export async function upsertPartnerOwnedHotelArPlaceChangeRequest(
  placeId: string,
  body: PartnerArPlaceChangeRequestBody,
  actor: PartnerActor,
) {
  const place = await prisma.ar_places.findFirst({
    where: {
      id: placeId,
      owner_partner_id: actor.partnerId,
      type: 'HOTEL',
    },
    include: {
      contents: {
        orderBy: { created_at: 'asc' },
        select: arPlaceContentSelect,
      },
      change_requests: {
        where: { status: 'PENDING' },
        orderBy: { created_at: 'desc' },
        take: 1,
        select: changeRequestSelect,
      },
    },
  });

  if (!place) {
    throw new ArPlaceServiceError(404, 'Local AR não encontrado');
  }

  const existingRequest = place.change_requests[0] || null;
  if (existingRequest && existingRequest.partner_id !== actor.partnerId) {
    throw new ArPlaceServiceError(409, 'Já existe uma alteração pendente para este local');
  }

  const baseSnapshot = existingRequest
    ? {
        locale: existingRequest.locale,
        name: existingRequest.name,
        address: existingRequest.address,
        summary: existingRequest.summary,
        description: existingRequest.description,
        learn_more: existingRequest.learn_more,
        useful_info: existingRequest.useful_info,
      }
    : extractEditableSnapshot(place);

  const nextSnapshot = overlayEditableSnapshot(baseSnapshot, body);

  try {
    const request = await prisma.$transaction(async (tx) => {
      if (existingRequest) {
        return tx.ar_place_partner_change_requests.update({
          where: { id: existingRequest.id },
          data: {
            submitted_by_partner_user_id: actor.userId,
            locale: nextSnapshot.locale,
            name: nextSnapshot.name,
            address: nextSnapshot.address,
            summary: nextSnapshot.summary,
            description: nextSnapshot.description,
            learn_more: nextSnapshot.learn_more,
            useful_info: nextSnapshot.useful_info,
          },
          select: changeRequestSelect,
        });
      }

      return tx.ar_place_partner_change_requests.create({
        data: {
          ar_place_id: placeId,
          partner_id: actor.partnerId,
          submitted_by_partner_user_id: actor.userId,
          status: PENDING_CHANGE_STATUS,
          locale: nextSnapshot.locale,
          name: nextSnapshot.name,
          address: nextSnapshot.address,
          summary: nextSnapshot.summary,
          description: nextSnapshot.description,
          learn_more: nextSnapshot.learn_more,
          useful_info: nextSnapshot.useful_info,
        },
        select: changeRequestSelect,
      });
    });

    return request;
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
        select: arPlaceContentSelect,
      },
    },
  });
}
