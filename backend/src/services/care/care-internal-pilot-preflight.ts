import {
  areCareOfficialReleaseFlagsEnabled,
} from './care-feature-flags';
import {
  CARE_UNAVAILABLE_CODE,
  getCareReadinessDecision,
  type CareReadinessDecision,
} from './care-readiness-policy';
import {
  getCareInternalPilotDecision,
  type CareInternalPilotDecision,
  type CareInternalPilotReadClient,
} from './care-internal-pilot-gate';

export type CareInternalPilotPreflightReason =
  | 'NO_CARE_INTENT'
  | 'PASSENGER_ALLOWLISTED_BUT_OFFICIAL_FLAGS_NOT_READY'
  | 'PASSENGER_ALLOWLISTED_BUT_OFFICIAL_FLOW_NOT_IMPLEMENTED'
  | 'PASSENGER_NOT_ALLOWLISTED'
  | 'PASSENGER_ID_MISSING'
  | 'ALLOWLIST_UNAVAILABLE';

export interface CareInternalPilotPreflightDecision {
  isCareIntent: boolean;
  internalPilotAllowed: boolean;
  officialFlagsReady: boolean;
  canProceed: false;
  unsupported: boolean;
  code: typeof CARE_UNAVAILABLE_CODE | null;
  reason: CareInternalPilotPreflightReason;
  readiness: CareReadinessDecision;
  pilot: CareInternalPilotDecision | null;
}

/**
 * CARE-488: composed internal pilot preflight.
 *
 * This composes:
 * 1. CARE intent detection.
 * 2. CARE_INTERNAL_PILOT allowlist lookup.
 * 3. Official CARE rollout flags.
 * 4. The existing hard block until the real transactional flow is implemented.
 *
 * It does NOT connect to rides-v2, pricing, dispatcher, acceptance, wallet,
 * mobile, production flags, migrations, or any operational CARE release.
 */
export async function getCareInternalPilotPreflightDecision(
  db: CareInternalPilotReadClient,
  input: unknown,
  passengerId: unknown,
  env: Record<string, string | undefined> = process.env,
): Promise<CareInternalPilotPreflightDecision> {
  const readiness = getCareReadinessDecision(input, env);
  const officialFlagsReady = areCareOfficialReleaseFlagsEnabled(env);

  if (!readiness.isCareIntent) {
    return {
      isCareIntent: false,
      internalPilotAllowed: false,
      officialFlagsReady,
      canProceed: false,
      unsupported: false,
      code: null,
      reason: 'NO_CARE_INTENT',
      readiness,
      pilot: null,
    };
  }

  const pilot = await getCareInternalPilotDecision(db, passengerId);

  if (!pilot.allowed) {
    const blockedReason: CareInternalPilotPreflightReason =
      pilot.reason === 'PASSENGER_ID_MISSING'
        || pilot.reason === 'ALLOWLIST_UNAVAILABLE'
        || pilot.reason === 'PASSENGER_NOT_ALLOWLISTED'
        ? pilot.reason
        : 'PASSENGER_NOT_ALLOWLISTED';

    return {
      isCareIntent: true,
      internalPilotAllowed: false,
      officialFlagsReady,
      canProceed: false,
      unsupported: true,
      code: CARE_UNAVAILABLE_CODE,
      reason: blockedReason,
      readiness,
      pilot,
    };
  }

  return {
    isCareIntent: true,
    internalPilotAllowed: true,
    officialFlagsReady,
    canProceed: false,
    unsupported: true,
    code: CARE_UNAVAILABLE_CODE,
    reason: officialFlagsReady
      ? 'PASSENGER_ALLOWLISTED_BUT_OFFICIAL_FLOW_NOT_IMPLEMENTED'
      : 'PASSENGER_ALLOWLISTED_BUT_OFFICIAL_FLAGS_NOT_READY',
    readiness,
    pilot,
  };
}
