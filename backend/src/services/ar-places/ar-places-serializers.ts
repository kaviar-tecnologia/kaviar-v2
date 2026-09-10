import { ar_place_locale, ar_place_status, ar_place_type } from '@prisma/client';

type ArPlaceWithRelations = {
  id: string;
  place_id: string;
  name: string;
  type: ar_place_type;
  city: string;
  state: string;
  address: string | null;
  latitude: unknown;
  longitude: unknown;
  status: ar_place_status;
  territory_id: string | null;
  created_at: Date;
  updated_at: Date;
  territory?: {
    id: string;
    name: string;
    city_name: string | null;
    uf: string | null;
  } | null;
  contents?: Array<{
    id: string;
    locale: ar_place_locale;
    summary: string | null;
    description: string | null;
    learn_more: string | null;
    useful_info: string | null;
    grounding_rule: string | null;
    boundary_rule: string | null;
    created_at: Date;
    updated_at: Date;
  }>;
};

type ArPlaceContent = NonNullable<ArPlaceWithRelations['contents']>[number];

const localeToPublicMap: Record<ar_place_locale, 'pt-BR' | 'en' | 'es' | 'fr'> = {
  PT_BR: 'pt-BR',
  EN: 'en',
  ES: 'es',
  FR: 'fr',
};

function toNumber(value: unknown): number {
  return Number(value);
}

export function serializeArPlaceContent(content: ArPlaceContent) {
  return {
    id: content.id,
    locale: localeToPublicMap[content.locale],
    summary: content.summary,
    description: content.description,
    learn_more: content.learn_more,
    useful_info: content.useful_info,
    grounding_rule: content.grounding_rule,
    boundary_rule: content.boundary_rule,
    created_at: content.created_at,
    updated_at: content.updated_at,
  };
}

function serializePublicArPlaceContent(content: ArPlaceContent) {
  return {
    locale: localeToPublicMap[content.locale],
    summary: content.summary,
    description: content.description,
    learn_more: content.learn_more,
    useful_info: content.useful_info,
    grounding_rule: content.grounding_rule,
    boundary_rule: content.boundary_rule,
  };
}

export function serializeArPlaceListItem(record: ArPlaceWithRelations) {
  return {
    id: record.id,
    place_id: record.place_id,
    name: record.name,
    type: record.type,
    city: record.city,
    state: record.state,
    address: record.address,
    latitude: toNumber(record.latitude),
    longitude: toNumber(record.longitude),
    status: record.status,
    territory_id: record.territory_id,
    territory: record.territory
      ? {
          id: record.territory.id,
          name: record.territory.name,
          city_name: record.territory.city_name,
          state: record.territory.uf,
        }
      : null,
    summary: record.contents?.[0]?.summary ?? null,
    updated_at: record.updated_at,
  };
}

export function serializeArPlaceDetail(record: ArPlaceWithRelations) {
  return {
    id: record.id,
    place_id: record.place_id,
    name: record.name,
    type: record.type,
    city: record.city,
    state: record.state,
    address: record.address,
    latitude: toNumber(record.latitude),
    longitude: toNumber(record.longitude),
    status: record.status,
    territory_id: record.territory_id,
    territory: record.territory
      ? {
          id: record.territory.id,
          name: record.territory.name,
          city_name: record.territory.city_name,
          state: record.territory.uf,
        }
      : null,
    contents: (record.contents || []).map(serializeArPlaceContent),
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export function serializePublicArPlace(record: ArPlaceWithRelations, locale: 'pt-BR' | 'en' | 'es' | 'fr') {
  const preferredContent =
    (record.contents || []).find((item) => localeToPublicMap[item.locale] === locale) ||
    (record.contents || []).find((item) => item.locale === 'PT_BR') ||
    (record.contents || [])[0] ||
    null;

  return {
    placeId: record.place_id,
    name: record.name,
    type: record.type,
    city: record.city,
    state: record.state,
    address: record.address,
    latitude: toNumber(record.latitude),
    longitude: toNumber(record.longitude),
    territory: record.territory
      ? {
          name: record.territory.name,
          city: record.territory.city_name,
          state: record.territory.uf,
        }
      : null,
    content: preferredContent ? serializePublicArPlaceContent(preferredContent) : null,
  };
}
