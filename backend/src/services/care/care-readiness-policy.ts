/**
 * CARE-04: central containment for legacy rides_v2 entry points.
 *
 * CARE eligibility is not yet connected to transactional booking, dispatch and
 * acceptance. This gate is deliberately unconditional: a frontend flag must
 * never turn a non-CAR_NORMAL booking into a regular ride by accident.
 *
 * Once the operational integration is complete, replace this policy with a
 * single typed CARE flow that uses the existing dispatcher/acceptance service.
 * Do NOT add a second dispatcher or a client-controlled bypass.
 */

import {
  CareOfficialFlagState,
  readCareOfficialFlags,
} from './care-feature-flags';

export const CARE_UNAVAILABLE_CODE = 'CARE_SERVICE_NOT_AVAILABLE' as const;

export type CareReadinessReason =
  | 'NO_CARE_INTENT'
  | 'CARE_OFFICIAL_BLOCKED_PENDING_INTEGRATION';

export interface CareReadinessDecision {
  isCareIntent: boolean;
  unsupported: boolean;
  code: typeof CARE_UNAVAILABLE_CODE | null;
  reason: CareReadinessReason;
  flags: CareOfficialFlagState;
}

const careCategoryPattern =
  /^(?:CARE|KAVIAR_CARE|CAR_CARE|CAR_WHEELCHAIR|CAR_ADAPTED|ELDERLY_ASSISTANCE|ACOMPANHAMENTO_ATIVO|WHEELCHAIR|ADAPTED_WHEELCHAIR|FOLDING_WHEELCHAIR)(?:_|$)/;

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

const hasStructuredCareKeys = (value: unknown): boolean => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.keys(value).some(key => careIntentKeys.has(key));
};

/** Catches explicit CARE intent, even when sent under CAR_NORMAL. */
export function isCareIntent(input: unknown): boolean {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  const request = input as Record<string, unknown>;

  if ([
    request.service_category,
    request.serviceCategory,
    request.service_type,
    request.serviceType,
    request.ride_type,
    request.type,
  ].some(hasCareCategory)) return true;

  if (hasStructuredCareKeys(request) || hasStructuredCareKeys(request.trip_details)) return true;
  return false;
}

/**
 * Returns the explicit CARE readiness decision.
 *
 * Feature flags are exposed for observability and future rollout control, but
 * they do not bypass containment in this PR. The official CARE flow still needs
 * reviewed transactional booking, dispatcher, pricing and driver acceptance.
 */
export function getCareReadinessDecision(
  input: unknown,
  env: Record<string, string | undefined> = process.env,
): CareReadinessDecision {
  const careIntent = isCareIntent(input);
  const flags = readCareOfficialFlags(env);

  if (!careIntent) {
    return {
      isCareIntent: false,
      unsupported: false,
      code: null,
      reason: 'NO_CARE_INTENT',
      flags,
    };
  }

  return {
    isCareIntent: true,
    unsupported: true,
    code: CARE_UNAVAILABLE_CODE,
    reason: 'CARE_OFFICIAL_BLOCKED_PENDING_INTEGRATION',
    flags,
  };
}

/** Catches explicit CARE intent, even when sent under CAR_NORMAL. */
export function isUnsupportedCareIntent(input: unknown): boolean {
  return getCareReadinessDecision(input).unsupported;
}
