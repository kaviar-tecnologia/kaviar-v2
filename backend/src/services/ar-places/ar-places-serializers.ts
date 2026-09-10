import { ar_place_locale, ar_place_status, ar_place_type } from '@prisma/client';

type ArPlaceOwner = {
  id: string;
  name: string;
  partner_type: string;
  status?: string | null;
} | null | undefined;

type ArPlaceChangeRequest = {
  id: string;
  ar_place_id: string;
  partner_id: string;
  submitted_by_partner_user_id: string;
  status: string;
  locale: ar_place_locale;
  name: string;
  address: string | null;
  summary: string | null;
  description: string | null;
  learn_more: string | null;
  useful_info: string | null;
  reviewed_by_admin_id: string | null;
  reviewed_at: Date | null;
  rejection_reason: string | null;
  created_at: Date;
  updated_at: Date;
  partner?: ArPlaceOwner;
};

type ArPlaceWithRelations = {
  id: string;
  place_id: string;
  name: string;
  type: ar_place_type;
  city: string;
  state: string;
  address: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  website_url?: string | null;
  instagram_url?: string | null;
  latitude: unknown;
  longitude: unknown;
  status: ar_place_status;
  territory_id: string | null;
  owner_partner_id?: string | null;
  created_at: Date;
  updated_at: Date;
  territory?: {
    id: string;
    name: string;
    city_name: string | null;
    uf: string | null;
  } | null;
  owner_partner?: ArPlaceOwner;
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
  change_requests?: ArPlaceChangeRequest[];
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

function serializeOwner(owner: ArPlaceOwner) {
  if (!owner) return null;
  return {
    id: owner.id,
    name: owner.name,
    partner_type: owner.partner_type,
    status: owner.status ?? null,
  };
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

export function serializeArPlaceChangeRequest(record: ArPlaceChangeRequest | null | undefined) {
  if (!record) return null;
  return {
    id: record.id,
    ar_place_id: record.ar_place_id,
    partner_id: record.partner_id,
    submitted_by_partner_user_id: record.submitted_by_partner_user_id,
    status: record.status,
    locale: localeToPublicMap[record.locale],
    name: record.name,
    address: record.address,
    summary: record.summary,
    description: record.description,
    learn_more: record.learn_more,
    useful_info: record.useful_info,
    reviewed_by_admin_id: record.reviewed_by_admin_id,
    reviewed_at: record.reviewed_at,
    rejection_reason: record.rejection_reason,
    created_at: record.created_at,
    updated_at: record.updated_at,
    partner: serializeOwner(record.partner),
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
    phone: record.phone ?? null,
    whatsapp: record.whatsapp ?? null,
    website_url: record.website_url ?? null,
    instagram_url: record.instagram_url ?? null,
    latitude: toNumber(record.latitude),
    longitude: toNumber(record.longitude),
    status: record.status,
    territory_id: record.territory_id,
    owner_partner_id: record.owner_partner_id ?? record.owner_partner?.id ?? null,
    owner_partner: serializeOwner(record.owner_partner),
    territory: record.territory
      ? {
          id: record.territory.id,
          name: record.territory.name,
          city_name: record.territory.city_name,
          state: record.territory.uf,
        }
      : null,
    summary: record.contents?.[0]?.summary ?? null,
    pending_change_request: serializeArPlaceChangeRequest(record.change_requests?.[0]),
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
    phone: record.phone ?? null,
    whatsapp: record.whatsapp ?? null,
    website_url: record.website_url ?? null,
    instagram_url: record.instagram_url ?? null,
    latitude: toNumber(record.latitude),
    longitude: toNumber(record.longitude),
    status: record.status,
    territory_id: record.territory_id,
    owner_partner_id: record.owner_partner_id ?? record.owner_partner?.id ?? null,
    owner_partner: serializeOwner(record.owner_partner),
    territory: record.territory
      ? {
          id: record.territory.id,
          name: record.territory.name,
          city_name: record.territory.city_name,
          state: record.territory.uf,
        }
      : null,
    contents: (record.contents || []).map(serializeArPlaceContent),
    pending_change_request: serializeArPlaceChangeRequest(record.change_requests?.[0]),
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export function serializePartnerArPlace(record: ArPlaceWithRelations) {
  return {
    id: record.id,
    place_id: record.place_id,
    name: record.name,
    type: record.type,
    city: record.city,
    state: record.state,
    address: record.address,
    status: record.status,
    content: record.contents?.[0] ? serializeArPlaceContent(record.contents[0]) : null,
    pending_change_request: serializeArPlaceChangeRequest(record.change_requests?.[0]),
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
    ...(record.phone ? { phone: record.phone } : {}),
    ...(record.whatsapp ? { whatsapp: record.whatsapp } : {}),
    ...(record.website_url ? { website_url: record.website_url } : {}),
    ...(record.instagram_url ? { instagram_url: record.instagram_url } : {}),
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
