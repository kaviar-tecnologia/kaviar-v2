import { Prisma } from '@prisma/client';

export const CARE_INTERNAL_PILOT_FLAG_KEY = 'CARE_INTERNAL_PILOT' as const;

export type CareInternalPilotReadClient = Pick<
  Prisma.TransactionClient,
  'feature_flag_allowlist'
>;

export interface CareInternalPilotDecision {
  allowed: boolean;
  key: typeof CARE_INTERNAL_PILOT_FLAG_KEY;
  passengerId: string | null;
  reason:
    | 'PASSENGER_ALLOWLISTED'
    | 'PASSENGER_NOT_ALLOWLISTED'
    | 'PASSENGER_ID_MISSING'
    | 'ALLOWLIST_UNAVAILABLE';
}

/**
 * CARE-487: read-only internal pilot gate.
 *
 * This service only checks whether the authenticated passenger is present in
 * the existing feature_flag_allowlist for CARE_INTERNAL_PILOT.
 *
 * It does NOT enable public CARE request, booking, pricing, dispatch, driver
 * acceptance, wallet, migration, production variables, or any runtime CARE flow.
 */
export async function getCareInternalPilotDecision(
  db: CareInternalPilotReadClient,
  passengerId: unknown,
): Promise<CareInternalPilotDecision> {
  const normalizedPassengerId = typeof passengerId === 'string'
    ? passengerId.trim()
    : '';

  if (!normalizedPassengerId) {
    return {
      allowed: false,
      key: CARE_INTERNAL_PILOT_FLAG_KEY,
      passengerId: null,
      reason: 'PASSENGER_ID_MISSING',
    };
  }

  try {
    const entry = await db.feature_flag_allowlist.findUnique({
      where: {
        key_passenger_id: {
          key: CARE_INTERNAL_PILOT_FLAG_KEY,
          passenger_id: normalizedPassengerId,
        },
      },
      select: { id: true },
    });

    return {
      allowed: !!entry,
      key: CARE_INTERNAL_PILOT_FLAG_KEY,
      passengerId: normalizedPassengerId,
      reason: entry ? 'PASSENGER_ALLOWLISTED' : 'PASSENGER_NOT_ALLOWLISTED',
    };
  } catch {
    return {
      allowed: false,
      key: CARE_INTERNAL_PILOT_FLAG_KEY,
      passengerId: normalizedPassengerId,
      reason: 'ALLOWLIST_UNAVAILABLE',
    };
  }
}

export async function isCareInternalPilotPassenger(
  db: CareInternalPilotReadClient,
  passengerId: unknown,
): Promise<boolean> {
  const decision = await getCareInternalPilotDecision(db, passengerId);
  return decision.allowed;
}
