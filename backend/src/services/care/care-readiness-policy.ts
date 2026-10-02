/**
 * CARE-04: central containment for legacy rides_v2 entry points.
 *
 * CARE eligibility is not yet connected to transactional booking, dispatch and
 * acceptance. This gate keeps official/structured CARE unavailable while allowing
 * one controlled public-assisted category to run operationally as CAR_NORMAL.
 *
 * Once the operational integration is complete, replace this policy with a
 * single typed CARE flow that uses the existing dispatcher/acceptance service.
 * Do NOT add a second dispatcher or a client-controlled bypass.
 */

const careCategoryPattern =
  /^(?:CARE|KAVIAR_CARE|CAR_CARE|CAR_WHEELCHAIR|CAR_ADAPTED|ELDERLY_ASSISTANCE|ACOMPANHAMENTO_ATIVO|WHEELCHAIR|ADAPTED_WHEELCHAIR|FOLDING_WHEELCHAIR)(?:_|$)/;

const publicAssistedCategoryPattern =
  /^(?:ELDERLY_ASSISTANCE|ACOMPANHAMENTO_ATIVO|CARE_ASSISTED)$/;

const careIntentKeys = new Set([
  'care',
  'care_mode',
  'careMode',
  'care_requirements',
  'careRequirements',
  'careNeedsEscort',
  'mobility_requirements',
  'mobilityRequirements',
  'wheelchair_mode',
  'wheelchairMode',
  'requires_adapted_vehicle',
  'requiresAdaptedVehicle',
  'needs_wheelchair_accessible_vehicle',
  'needsWheelchairAccessibleVehicle',
]);

const normalizeCategory = (value: unknown): string =>
  typeof value === 'string'
    ? value.trim().toUpperCase().replace(/[\s-]+/g, '_')
    : '';

const hasCareCategory = (value: unknown): boolean =>
  careCategoryPattern.test(normalizeCategory(value));

const hasPublicAssistedCategory = (value: unknown): boolean =>
  publicAssistedCategoryPattern.test(normalizeCategory(value));

export function isPublicAssistedRideIntent(input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;

  const request = input as Record<string, unknown>;

  // Liberação pública controlada: somente o campo canônico service_category
  // pode pedir CARE assistido público. Aliases continuam bloqueados para
  // evitar bypass quando service_category vier como CAR_NORMAL.
  if (!hasPublicAssistedCategory(request.service_category)) return false;

  const aliasFields = [
    request.serviceCategory,
    request.service_type,
    request.serviceType,
    request.ride_type,
    request.type,
  ];

  if (aliasFields.some(hasCareCategory)) return false;

  // CARE público assistido não pode carregar requisitos estruturados de CARE,
  // cadeira de rodas, veículo adaptado, evidência, modo médico ou flags especiais.
  if (hasStructuredCareKeys(request) || hasStructuredCareKeys(request.trip_details)) {
    return false;
  }

  return true;
}

const hasStructuredCareKeys = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).some(key => careIntentKeys.has(key));
};

/** Catches explicit CARE intent, even when sent under CAR_NORMAL. */
export function isUnsupportedCareIntent(input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;

  const request = input as Record<string, unknown>;
  const publicAssisted = isPublicAssistedRideIntent(request);

  if (hasCareCategory(request.service_category) && !hasPublicAssistedCategory(request.service_category)) {
    return true;
  }

  const aliasFields = [
    request.serviceCategory,
    request.service_type,
    request.serviceType,
    request.ride_type,
    request.type,
  ];

  if (aliasFields.some(hasCareCategory)) return true;

  if (hasStructuredCareKeys(request) || hasStructuredCareKeys(request.trip_details)) {
    return !publicAssisted;
  }

  return false;
}


export const CARE_UNAVAILABLE_CODE = 'CARE_SERVICE_NOT_AVAILABLE' as const;
