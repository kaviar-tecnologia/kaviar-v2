/**
 * CARE-03: pure, fail-closed mobility eligibility.
 *
 * Not wired into rides-v2, offers or the dispatcher. The caller must supply
 * independent, trusted operational/municipal/territorial/insurance gates;
 * client-side booleans and user-provided metadata are NOT evidence.
 * Missing data is ineligible. Never fall back silently to CAR_NORMAL.
 */
export type CareMode = 'ASSISTED' | 'FOLDING_WHEELCHAIR' | 'ADAPTED_WHEELCHAIR';

export type CareRejectionCode =
  | 'REQUIREMENT_MISSING'
  | 'REQUIREMENT_NOT_READY'
  | 'REQUIREMENT_REVIEW_INVALID'
  | 'REQUIREMENT_MODE_INVALID'
  | 'REQUIREMENT_INCONSISTENT'
  | 'DRIVER_NOT_OPERATIONAL'
  | 'DRIVER_NOT_ONLINE'
  | 'DRIVER_NOT_QUALIFIED'
  | 'DRIVER_QUALIFICATION_EXPIRED'
  | 'TRAINING_INSUFFICIENT'
  | 'VEHICLE_NOT_CAR'
  | 'VEHICLE_NOT_VERIFIED'
  | 'VEHICLE_INSPECTION_EXPIRED'
  | 'VEHICLE_PLATE_MISMATCH'
  | 'VEHICLE_STORAGE_INSUFFICIENT'
  | 'VEHICLE_ADAPTATION_INCOMPLETE'
  | 'VEHICLE_CAPACITY_INSUFFICIENT'
  | 'COMPANION_CAPACITY_INSUFFICIENT'
  | 'MUNICIPAL_AUTHORIZATION_MISSING'
  | 'TERRITORY_NOT_ELIGIBLE'
  | 'INSURANCE_NOT_CONFIRMED';

export interface CareTripRequirementSnapshot {
  mode: string;
  status: string;
  reviewed_at: Date | string | null;
  reviewed_by_admin_id: string | null;
  needs_extra_boarding_time: boolean;
  uses_walking_aid: boolean;
  folding_wheelchair: boolean;
  remain_in_wheelchair: boolean;
  can_self_transfer: boolean | null;
  needs_pickup_guidance: boolean;
  guide_dog: boolean;
  companion_seats: number;
}

export interface CareDriverQualificationSnapshot {
  status: string;
  assisted_training_verified: boolean;
  folding_training_verified: boolean;
  adapted_training_verified: boolean;
  valid_until: Date | string | null;
  verified_at: Date | string | null;
  verified_by_admin_id: string | null;
}

export interface CareVehicleCapabilitySnapshot {
  status: string;
  plate_snapshot: string | null;
  folding_storage_verified: boolean;
  ramp_or_lift_verified: boolean;
  wheelchair_restraint_verified: boolean;
  occupant_restraint_verified: boolean;
  adaptation_document_verified: boolean;
  wheelchair_capacity: number;
  companion_seats: number;
  inspection_valid_until: Date | string | null;
  verified_at: Date | string | null;
  verified_by_admin_id: string | null;
}

export interface CareTrustedGates {
  /** Derived by server from driver status, documents and existing permissions. */
  driverOperational: boolean;
  driverOnline: boolean;
  municipalAuthorized: boolean;
  territoryEligible: boolean;
  /** Independent confirmation that this exact service/vehicle is covered. */
  insuranceConfirmedForMode: boolean;
}

export interface CareEligibilityInput {
  requirements: CareTripRequirementSnapshot | null | undefined;
  qualification: CareDriverQualificationSnapshot | null | undefined;
  vehicle: CareVehicleCapabilitySnapshot | null | undefined;
  registeredPlate: string | null | undefined;
  vehicleType: string | null | undefined;
  trustedGates: CareTrustedGates | null | undefined;
  /** Injected time makes decisions reproducible in tests and audit logs. */
  now: Date;
}

export interface CareEligibilityResult {
  eligible: boolean;
  reasons: CareRejectionCode[];
}

const isVerifiedWithinValidity = (
  status: string | null | undefined,
  verifiedAt: Date | string | null | undefined,
  verifiedBy: string | null | undefined,
  validUntil: Date | string | null | undefined,
  now: number,
): 'VALID' | 'UNVERIFIED' | 'EXPIRED' => {
  if (status !== 'VERIFIED') return 'UNVERIFIED';
  const reviewedAt = verifiedAt == null ? NaN : new Date(verifiedAt).getTime();
  const end = validUntil == null ? NaN : new Date(validUntil).getTime();
  if (!Number.isFinite(reviewedAt) || reviewedAt > now || !verifiedBy?.trim()) return 'UNVERIFIED';
  if (!Number.isFinite(end) || end <= now || end <= reviewedAt) return 'EXPIRED';
  return 'VALID';
};

const normalizePlate = (plate: string | null | undefined) =>
  typeof plate === 'string' ? plate.toUpperCase().replace(/[\s-]/g, '') : '';

const validPlate = (plate: string) => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plate);
const validCount = (value: number, upper: number) =>
  Number.isInteger(value) && value >= 0 && value <= upper;

/**
 * Contract only; MUST NOT be treated as final authorization to dispatch.
 * Downstream integration has to re-check this result at BOTH offer and acceptance,
 * and after cancellation/redispatch, with a current trusted snapshot.
 */
export function evaluateCareEligibility(input: CareEligibilityInput): CareEligibilityResult {
  const reasons = new Set<CareRejectionCode>();
  const reject = (reason: CareRejectionCode) => { reasons.add(reason); };
  const timestamp = input.now instanceof Date ? input.now.getTime() : NaN;
  if (!Number.isFinite(timestamp)) {
    return { eligible: false, reasons: ['REQUIREMENT_REVIEW_INVALID'] };
  }

  const r = input.requirements;
  const q = input.qualification;
  const v = input.vehicle;
  const gates = input.trustedGates;

  if (!r) reject('REQUIREMENT_MISSING');
  else {
    if (r.status !== 'READY') reject('REQUIREMENT_NOT_READY');
    const reviewTime = r.reviewed_at == null ? NaN : new Date(r.reviewed_at).getTime();
    if (!Number.isFinite(reviewTime) || reviewTime > timestamp || !r.reviewed_by_admin_id?.trim()) {
      reject('REQUIREMENT_REVIEW_INVALID');
    }
    if (!['ASSISTED', 'FOLDING_WHEELCHAIR', 'ADAPTED_WHEELCHAIR'].includes(r.mode)) {
      reject('REQUIREMENT_MODE_INVALID');
    }
    if (!validCount(r.companion_seats, 16)) reject('REQUIREMENT_INCONSISTENT');

    if (r.mode === 'ASSISTED' && (r.folding_wheelchair !== false || r.remain_in_wheelchair !== false)) {
      reject('REQUIREMENT_INCONSISTENT');
    }
    if (r.mode === 'FOLDING_WHEELCHAIR' &&
      (r.folding_wheelchair !== true || r.remain_in_wheelchair !== false || r.can_self_transfer !== true)) {
      reject('REQUIREMENT_INCONSISTENT');
    }
    if (r.mode === 'ADAPTED_WHEELCHAIR' && (r.remain_in_wheelchair !== true || r.folding_wheelchair !== false)) {
      reject('REQUIREMENT_INCONSISTENT');
    }
  }

  // An undefined/false external gate cannot grant eligibility.
  if (gates?.driverOperational !== true) reject('DRIVER_NOT_OPERATIONAL');
  if (gates?.driverOnline !== true) reject('DRIVER_NOT_ONLINE');
  if (gates?.municipalAuthorized !== true) reject('MUNICIPAL_AUTHORIZATION_MISSING');
  if (gates?.territoryEligible !== true) reject('TERRITORY_NOT_ELIGIBLE');
  if (gates?.insuranceConfirmedForMode !== true) reject('INSURANCE_NOT_CONFIRMED');

  if (input.vehicleType !== 'CAR') reject('VEHICLE_NOT_CAR');

  if (!q || isVerifiedWithinValidity(q.status, q.verified_at, q.verified_by_admin_id, q.valid_until, timestamp) !== 'VALID') {
    const state = q ? isVerifiedWithinValidity(q.status, q.verified_at, q.verified_by_admin_id, q.valid_until, timestamp) : 'UNVERIFIED';
    reject(state === 'EXPIRED' ? 'DRIVER_QUALIFICATION_EXPIRED' : 'DRIVER_NOT_QUALIFIED');
  } else if (!q.assisted_training_verified ||
    (r?.mode === 'FOLDING_WHEELCHAIR' && !q.folding_training_verified) ||
    (r?.mode === 'ADAPTED_WHEELCHAIR' && !q.adapted_training_verified)) {
    reject('TRAINING_INSUFFICIENT');
  }

  if (!v || isVerifiedWithinValidity(v.status, v.verified_at, v.verified_by_admin_id, v.inspection_valid_until, timestamp) !== 'VALID') {
    const state = v ? isVerifiedWithinValidity(v.status, v.verified_at, v.verified_by_admin_id, v.inspection_valid_until, timestamp) : 'UNVERIFIED';
    reject(state === 'EXPIRED' ? 'VEHICLE_INSPECTION_EXPIRED' : 'VEHICLE_NOT_VERIFIED');
  }

  const currentPlate = normalizePlate(input.registeredPlate);
  const verifiedPlate = normalizePlate(v?.plate_snapshot);
  if (!validPlate(currentPlate) || !validPlate(verifiedPlate) || currentPlate !== verifiedPlate) {
    reject('VEHICLE_PLATE_MISMATCH');
  }

  if (v) {
    if (!validCount(v.companion_seats, 32) || !validCount(v.wheelchair_capacity, 8)) {
      reject('VEHICLE_CAPACITY_INSUFFICIENT');
    }
    if (r && validCount(r.companion_seats, 16) && v.companion_seats < r.companion_seats) {
      reject('COMPANION_CAPACITY_INSUFFICIENT');
    }
    if ((r?.mode === 'FOLDING_WHEELCHAIR' || r?.uses_walking_aid === true) &&
      v.folding_storage_verified !== true) {
      reject('VEHICLE_STORAGE_INSUFFICIENT');
    }
    if (r?.mode === 'ADAPTED_WHEELCHAIR' &&
      (v.wheelchair_capacity < 1 || v.ramp_or_lift_verified !== true ||
       v.wheelchair_restraint_verified !== true || v.occupant_restraint_verified !== true ||
       v.adaptation_document_verified !== true)) {
      reject('VEHICLE_ADAPTATION_INCOMPLETE');
    }
  }

  // guide_dog, pickup guidance and extra boarding time must not become an
  // exclusion criterion simply because the passenger requested these.
  return { eligible: reasons.size === 0, reasons: [...reasons] };
}
