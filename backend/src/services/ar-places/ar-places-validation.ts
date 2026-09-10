import { ar_place_status, ar_place_type } from '@prisma/client';
import { z } from 'zod';

const PLACE_ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const TERRITORY_ID_REGEX = /^[A-Za-z0-9_-]+$/;

const optionalTrimmedString = (max = 2000) =>
  z.preprocess(
    (value) => {
      if (value === undefined) return undefined;
      if (value === null) return null;
      if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed === '' ? null : trimmed;
      }
      return value;
    },
    z.string().max(max).nullable().optional(),
  );

const requiredTrimmedString = (max = 255) =>
  z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().min(1).max(max));

export const localeInputSchema = z.enum(['pt-BR', 'en', 'es', 'fr']);

export const arPlaceIdParamSchema = z.object({
  id: z.string().uuid('id inválido'),
});

export const arPlacePlaceIdParamSchema = z.object({
  placeId: z.string().regex(PLACE_ID_REGEX, 'placeId inválido'),
});

export const arPlaceListQuerySchema = z.object({
  type: z.nativeEnum(ar_place_type).optional(),
  status: z.nativeEnum(ar_place_status).optional(),
  city: z.preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().min(1).max(120).optional()),
  state: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
    z.string().regex(/^[A-Z]{2}$/, 'state deve ter duas letras').optional(),
  ),
  territoryId: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().min(1).max(120).regex(TERRITORY_ID_REGEX, 'territoryId inválido').optional(),
  ),
});

export const arPlaceContentInputSchema = z.object({
  locale: localeInputSchema.default('pt-BR'),
  summary: optionalTrimmedString(400),
  description: optionalTrimmedString(4000),
  learn_more: optionalTrimmedString(1000),
  useful_info: optionalTrimmedString(4000),
  grounding_rule: optionalTrimmedString(1000),
  boundary_rule: optionalTrimmedString(1000),
});

export const arPlaceCreateBodySchema = z.object({
  place_id: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().regex(PLACE_ID_REGEX, 'place_id inválido'),
  ),
  name: requiredTrimmedString(255),
  type: z.nativeEnum(ar_place_type),
  city: requiredTrimmedString(120),
  state: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
    z.string().regex(/^[A-Z]{2}$/, 'state deve ter duas letras'),
  ),
  address: optionalTrimmedString(500),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  territory_id: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z.string().min(1).max(120).regex(TERRITORY_ID_REGEX, 'territory_id inválido').nullable().optional(),
  ),
  status: z.nativeEnum(ar_place_status).optional(),
  content: arPlaceContentInputSchema.optional(),
});

export const arPlacePatchBodySchema = z
  .object({
    place_id: z
      .preprocess((value) => (typeof value === 'string' ? value.trim() : value), z.string().regex(PLACE_ID_REGEX, 'place_id inválido'))
      .optional(),
    name: requiredTrimmedString(255).optional(),
    type: z.nativeEnum(ar_place_type).optional(),
    city: requiredTrimmedString(120).optional(),
    state: z
      .preprocess(
        (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
        z.string().regex(/^[A-Z]{2}$/, 'state deve ter duas letras'),
      )
      .optional(),
    address: optionalTrimmedString(500),
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    territory_id: z.preprocess(
      (value) => (typeof value === 'string' ? value.trim() : value),
      z.string().min(1).max(120).regex(TERRITORY_ID_REGEX, 'territory_id inválido').nullable().optional(),
    ),
    status: z.nativeEnum(ar_place_status).optional(),
    content: arPlaceContentInputSchema.optional(),
  })
  .refine(
    (value) =>
      Object.keys(value).some((key) => {
        const typed = value as Record<string, unknown>;
        return typed[key] !== undefined;
      }),
    { message: 'Nenhuma alteração enviada' },
  );

export type ArPlaceListQuery = z.infer<typeof arPlaceListQuerySchema>;
export type ArPlaceCreateBody = z.infer<typeof arPlaceCreateBodySchema>;
export type ArPlacePatchBody = z.infer<typeof arPlacePatchBodySchema>;
