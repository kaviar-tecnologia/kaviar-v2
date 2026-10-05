import { parseCareBooleanFlag } from './care-feature-flags';
import { CARE_UNAVAILABLE_CODE } from './care-readiness-policy';
import {
  evaluateCareEligibilityFromDb,
  type CareExternalEvidence,
  type CareReadClient,
  type CareRuntimeEligibilityResult,
  type CareRuntimeRejectionCode,
} from './care-runtime-eligibility';

export const CARE_ELIGIBILITY_SHADOW_FLAG_KEY = 'CARE_ELIGIBILITY_SHADOW_ENABLED' as const;

export type CareEligibilityShadowStatus =
  | 'SHADOW_DISABLED'
  | 'SHADOW_INPUT_INVALID'
  | 'SHADOW_EVALUATED'
  | 'SHADOW_EVALUATION_FAILED';

export type CareEligibilityShadowReason =
  | CareRuntimeRejectionCode
  | 'CARE_SHADOW_DISABLED'
  | 'CARE_SHADOW_INPUT_INVALID'
  | 'CARE_SHADOW_EVALUATION_EXCEPTION'
  | 'CARE_SHADOW_ONLY_NOT_OPERATIONAL';

export interface CareEligibilityShadowInput {
  rideId: unknown;
  driverId: unknown;
  externalEvidence?: CareExternalEvidence | null;
  now?: Date;
}

export interface CareEligibilityShadowAuditEvent {
  kind: 'CARE_ELIGIBILITY_SHADOW_DECISION';
  rideId: string | null;
  driverId: string | null;
  evaluatedAt: string;
  shadowEnabled: boolean;
  eligibilityEligible: boolean | null;
  operationAllowed: false;
  dispatchAllowed: false;
  acceptanceAllowed: false;
  walletAllowed: false;
  publicCode: typeof CARE_UNAVAILABLE_CODE;
  reasons: CareEligibilityShadowReason[];
}

export interface CareEligibilityShadowDecision {
  shadowOnly: true;
  status: CareEligibilityShadowStatus;
  shadowEnabled: boolean;
  eligibility: CareRuntimeEligibilityResult | null;
  reasons: CareEligibilityShadowReason[];
  operationAllowed: false;
  dispatchAllowed: false;
  acceptanceAllowed: false;
  walletAllowed: false;
  publicCode: typeof CARE_UNAVAILABLE_CODE;
  auditEvent: CareEligibilityShadowAuditEvent;
}

const normalizeId = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const validClock = (value: Date): boolean =>
  value instanceof Date && Number.isFinite(value.getTime());

export function isCareEligibilityShadowEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return parseCareBooleanFlag(env[CARE_ELIGIBILITY_SHADOW_FLAG_KEY], false);
}

function buildShadowDecision(
  status: CareEligibilityShadowStatus,
  shadowEnabled: boolean,
  rideId: string | null,
  driverId: string | null,
  evaluatedAt: Date,
  eligibility: CareRuntimeEligibilityResult | null,
  reasons: CareEligibilityShadowReason[],
): CareEligibilityShadowDecision {
  const uniqueReasons = [...new Set(reasons)];

  return {
    shadowOnly: true,
    status,
    shadowEnabled,
    eligibility,
    reasons: uniqueReasons,
    operationAllowed: false,
    dispatchAllowed: false,
    acceptanceAllowed: false,
    walletAllowed: false,
    publicCode: CARE_UNAVAILABLE_CODE,
    auditEvent: {
      kind: 'CARE_ELIGIBILITY_SHADOW_DECISION',
      rideId,
      driverId,
      evaluatedAt: evaluatedAt.toISOString(),
      shadowEnabled,
      eligibilityEligible: eligibility?.eligible ?? null,
      operationAllowed: false,
      dispatchAllowed: false,
      acceptanceAllowed: false,
      walletAllowed: false,
      publicCode: CARE_UNAVAILABLE_CODE,
      reasons: uniqueReasons,
    },
  };
}

/**
 * CARE-497: internal eligibility shadow mode.
 *
 * This is an explicit, read-only observation helper. It never authorizes
 * booking, dispatch, offer acceptance, wallet settlement, payout, production
 * flags or public CARE availability.
 *
 * The output is intentionally structured for audit/test visibility while the
 * operational answer remains fail-closed: operationAllowed is always false.
 */
export async function evaluateCareEligibilityShadowMode(
  db: CareReadClient,
  input: CareEligibilityShadowInput,
  env: Record<string, string | undefined> = process.env,
): Promise<CareEligibilityShadowDecision> {
  const shadowEnabled = isCareEligibilityShadowEnabled(env);
  const rideId = normalizeId(input.rideId);
  const driverId = normalizeId(input.driverId);
  const now = input.now ?? new Date();
  const safeNow = validClock(now) ? now : new Date(0);

  if (!shadowEnabled) {
    return buildShadowDecision(
      'SHADOW_DISABLED',
      false,
      rideId,
      driverId,
      safeNow,
      null,
      ['CARE_SHADOW_DISABLED'],
    );
  }

  if (!rideId || !driverId || !validClock(now)) {
    return buildShadowDecision(
      'SHADOW_INPUT_INVALID',
      true,
      rideId,
      driverId,
      safeNow,
      null,
      ['CARE_SHADOW_INPUT_INVALID'],
    );
  }

  try {
    const eligibility = await evaluateCareEligibilityFromDb(
      db,
      rideId,
      driverId,
      input.externalEvidence,
      now,
    );

    return buildShadowDecision(
      'SHADOW_EVALUATED',
      true,
      rideId,
      driverId,
      now,
      eligibility,
      ['CARE_SHADOW_ONLY_NOT_OPERATIONAL', ...eligibility.reasons],
    );
  } catch {
    return buildShadowDecision(
      'SHADOW_EVALUATION_FAILED',
      true,
      rideId,
      driverId,
      now,
      null,
      ['CARE_SHADOW_EVALUATION_EXCEPTION'],
    );
  }
}
