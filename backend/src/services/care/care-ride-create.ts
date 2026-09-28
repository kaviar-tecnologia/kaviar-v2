import { Prisma, CareRideMode } from '@prisma/client';
import { prisma } from '../../lib/prisma';

/**
 * CARE-04B: one shared rides_v2 creation boundary, NOT a second ride service.
 *
 * The existing rides-v2 route calls the normal path unchanged. A future,
 * explicitly approved CARE branch will supply the second argument to create
 * the ride and its requirements in one transaction. Neither this function
 * nor this PR enables any CARE route, quote, offer, acceptance or payment.
 */
export type CareDraftRequirements = {
  mode: CareRideMode;
  needsExtraBoardingTime?: boolean;
  usesWalkingAid?: boolean;
  foldingWheelchair: boolean;
  remainInWheelchair: boolean;
  canSelfTransfer?: boolean | null;
  needsPickupGuidance?: boolean;
  guideDog?: boolean;
  companionSeats?: number;
};

const CARE_CATEGORY_BY_MODE: Record<CareRideMode, string> = {
  ASSISTED: 'CARE_ASSISTED',
  FOLDING_WHEELCHAIR: 'CARE_FOLDING_WHEELCHAIR',
  ADAPTED_WHEELCHAIR: 'CARE_ADAPTED_WHEELCHAIR',
};

export class CareDraftValidationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CareDraftValidationError';
  }
}

/**
 * Validate only explicit, functional per-trip needs. Never accept a reviewed
 * state, credentials, insurer claim, diagnosis or medical text from a client.
 */
export function validateCareDraftRequirements(value: CareDraftRequirements): CareDraftRequirements {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new CareDraftValidationError('CARE_REQUIREMENTS_INVALID');
  }
  if (!Object.values(CareRideMode).includes(value.mode)) {
    throw new CareDraftValidationError('CARE_MODE_INVALID');
  }
  if (!Number.isInteger(value.companionSeats ?? 0) ||
      (value.companionSeats ?? 0) < 0 || (value.companionSeats ?? 0) > 16) {
    throw new CareDraftValidationError('CARE_COMPANION_SEATS_INVALID');
  }
  for (const field of [
    'needsExtraBoardingTime', 'usesWalkingAid', 'needsPickupGuidance', 'guideDog',
  ] as const) {
    if (value[field] !== undefined && typeof value[field] !== 'boolean') {
      throw new CareDraftValidationError('CARE_REQUIREMENTS_INVALID');
    }
  }
  if (typeof value.foldingWheelchair !== 'boolean' ||
      typeof value.remainInWheelchair !== 'boolean' ||
      (value.canSelfTransfer !== undefined && value.canSelfTransfer !== null &&
        typeof value.canSelfTransfer !== 'boolean')) {
    throw new CareDraftValidationError('CARE_REQUIREMENTS_INVALID');
  }
  if (value.mode === CareRideMode.ASSISTED &&
      (value.foldingWheelchair || value.remainInWheelchair)) {
    throw new CareDraftValidationError('CARE_MODE_INCONSISTENT');
  }
  if (value.mode === CareRideMode.FOLDING_WHEELCHAIR &&
      (!value.foldingWheelchair || value.remainInWheelchair || value.canSelfTransfer !== true)) {
    throw new CareDraftValidationError('CARE_SELF_TRANSFER_REQUIRED');
  }
  if (value.mode === CareRideMode.ADAPTED_WHEELCHAIR &&
      (!value.remainInWheelchair || value.foldingWheelchair)) {
    throw new CareDraftValidationError('CARE_ADAPTED_VEHICLE_REQUIRED');
  }

  // A fresh, allowlisted object: never spread untrusted request fields into DB.
  return {
    mode: value.mode,
    foldingWheelchair: value.foldingWheelchair,
    remainInWheelchair: value.remainInWheelchair,
    canSelfTransfer: value.canSelfTransfer ?? null,
    needsExtraBoardingTime: value.needsExtraBoardingTime === true,
    usesWalkingAid: value.usesWalkingAid === true,
    needsPickupGuidance: value.needsPickupGuidance === true,
    guideDog: value.guideDog === true,
    companionSeats: value.companionSeats ?? 0,
  };
}

type RideCreateArgs = Prisma.rides_v2CreateArgs;

/**
 * Common create boundary for the existing route and future CARE integration.
 *
 * No-care path delegates verbatim to the original ORM call, without an extra
 * transaction or changes to standard ride semantics. CARE path writes both
 * rows in the same Prisma transaction. Its requirement always starts DRAFT:
 * this function cannot authorize, dispatch or mark a trip READY.
 *
 * Note: the CARE path is intentionally not yet exposed to an HTTP route.
 */
export async function createRideWithRequirements(
  args: RideCreateArgs,
  careDraft?: CareDraftRequirements,
) {
  if (!careDraft) {
    return prisma.rides_v2.create(args);
  }

  const required = validateCareDraftRequirements(careDraft);
  const requestedCategory = args.data.service_category;
  if (requestedCategory !== CARE_CATEGORY_BY_MODE[required.mode]) {
    throw new CareDraftValidationError('CARE_CATEGORY_MODE_MISMATCH');
  }
  if (args.data.status !== 'requested' || args.data.ride_type !== 'care') {
    throw new CareDraftValidationError('CARE_RIDE_STATE_INVALID');
  }
  // No accidental signed-off trip, monetary status or pre-assigned driver.
  if (args.data.driver_id != null) {
    throw new CareDraftValidationError('CARE_DRIVER_PREASSIGNMENT_FORBIDDEN');
  }

  return prisma.$transaction(async tx => {
    const ride = await tx.rides_v2.create(args);
    await tx.care_trip_requirements.create({
      data: {
        ride_id: ride.id,
        mode: required.mode,
        status: 'DRAFT',
        folding_wheelchair: required.foldingWheelchair,
        remain_in_wheelchair: required.remainInWheelchair,
        can_self_transfer: required.canSelfTransfer ?? null,
        needs_extra_boarding_time: required.needsExtraBoardingTime === true,
        uses_walking_aid: required.usesWalkingAid === true,
        needs_pickup_guidance: required.needsPickupGuidance === true,
        guide_dog: required.guideDog === true,
        companion_seats: required.companionSeats ?? 0,
        // No reviewed_at/reviewed_by: these require a separate, authorized
        // operational review. No client-controlled approval or credentials.
      },
    });
    return ride;
  });
}
