import { describe, expect, it } from 'vitest';
import {
  evaluateCareEligibility,
  type CareEligibilityInput,
  type CareRejectionCode,
} from '../src/services/care/care-eligibility';

const now = new Date('2026-09-28T14:00:00.000Z');

function assisted(): CareEligibilityInput {
  return {
    now,
    requirements: {
      mode: 'ASSISTED',
      status: 'READY',
      reviewed_at: new Date('2026-09-27T13:00:00.000Z'),
      reviewed_by_admin_id: 'synthetic-reviewer',
      needs_extra_boarding_time: true,
      uses_walking_aid: false,
      folding_wheelchair: false,
      remain_in_wheelchair: false,
      can_self_transfer: null,
      needs_pickup_guidance: true,
      guide_dog: false,
      companion_seats: 1,
    },
    qualification: {
      status: 'VERIFIED',
      assisted_training_verified: true,
      folding_training_verified: false,
      adapted_training_verified: false,
      verified_at: new Date('2026-09-27T13:00:00.000Z'),
      verified_by_admin_id: 'synthetic-reviewer',
      valid_until: new Date('2026-10-20T13:00:00.000Z'),
    },
    vehicle: {
      status: 'VERIFIED',
      plate_snapshot: 'ABC-1D23',
      folding_storage_verified: false,
      ramp_or_lift_verified: false,
      wheelchair_restraint_verified: false,
      occupant_restraint_verified: false,
      adaptation_document_verified: false,
      wheelchair_capacity: 0,
      companion_seats: 2,
      verified_at: new Date('2026-09-27T13:00:00.000Z'),
      verified_by_admin_id: 'synthetic-reviewer',
      inspection_valid_until: new Date('2026-10-20T13:00:00.000Z'),
    },
    registeredPlate: 'abc1d23',
    vehicleType: 'CAR',
    trustedGates: {
      driverOperational: true,
      driverOnline: true,
      municipalAuthorized: true,
      territoryEligible: true,
      insuranceConfirmedForMode: true,
    },
  };
}

const failure = (input: CareEligibilityInput, code: CareRejectionCode) => {
  const result = evaluateCareEligibility(input);
  expect(result.eligible).toBe(false);
  expect(result.reasons).toContain(code);
};

describe('CARE-03 fail-closed, pure compatibility evaluator (synthetic inputs)', () => {
  it('accepts fully reviewed, insured and compatible assisted mobility', () => {
    expect(evaluateCareEligibility(assisted())).toEqual({ eligible: true, reasons: [] });
  });

  it('allows guide dog and extra boarding time without treating them as exclusion criteria', () => {
    const input = assisted();
    input.requirements!.guide_dog = true;
    input.requirements!.needs_extra_boarding_time = true;
    expect(evaluateCareEligibility(input).eligible).toBe(true);
  });

  it('requires READY trip and recorded review; refuses missing requirements', () => {
    const input = assisted();
    input.requirements = null;
    failure(input, 'REQUIREMENT_MISSING');
    input.requirements = assisted().requirements;
    input.requirements!.status = 'DRAFT';
    failure(input, 'REQUIREMENT_NOT_READY');
    input.requirements!.status = 'READY';
    input.requirements!.reviewed_by_admin_id = '';
    failure(input, 'REQUIREMENT_REVIEW_INVALID');
  });

  it('refuses a future-dated review or an invalid clock', () => {
    const input = assisted();
    input.requirements!.reviewed_at = '2027-01-01T00:00:00Z';
    failure(input, 'REQUIREMENT_REVIEW_INVALID');
    input.now = new Date('not a valid date');
    failure(input, 'REQUIREMENT_REVIEW_INVALID');
  });

  it('does not silently treat unknown CARE mode as a normal ride', () => {
    const input = assisted();
    input.requirements!.mode = 'CAR_NORMAL';
    failure(input, 'REQUIREMENT_MODE_INVALID');
  });

  it('rejects inconsistent declaration, fractional or negative passenger counts', () => {
    const input = assisted();
    input.requirements!.remain_in_wheelchair = true;
    failure(input, 'REQUIREMENT_INCONSISTENT');
    input.requirements!.remain_in_wheelchair = false;
    input.requirements!.companion_seats = 1.5;
    failure(input, 'REQUIREMENT_INCONSISTENT');
    input.requirements!.companion_seats = -1;
    failure(input, 'REQUIREMENT_INCONSISTENT');
  });

  it('fails closed when all external authorizations are absent', () => {
    const input = assisted();
    input.trustedGates = null;
    expect(evaluateCareEligibility(input).reasons).toEqual(expect.arrayContaining([
      'DRIVER_NOT_OPERATIONAL', 'DRIVER_NOT_ONLINE', 'MUNICIPAL_AUTHORIZATION_MISSING',
      'TERRITORY_NOT_ELIGIBLE', 'INSURANCE_NOT_CONFIRMED',
    ]));
  });

  it('does not assume insurance from presence of other operational gates', () => {
    const input = assisted();
    input.trustedGates!.insuranceConfirmedForMode = false;
    failure(input, 'INSURANCE_NOT_CONFIRMED');
  });

  it('enforces online, operational, municipal and territorial checks independently', () => {
    const keys = [
      ['driverOperational', 'DRIVER_NOT_OPERATIONAL'],
      ['driverOnline', 'DRIVER_NOT_ONLINE'],
      ['municipalAuthorized', 'MUNICIPAL_AUTHORIZATION_MISSING'],
      ['territoryEligible', 'TERRITORY_NOT_ELIGIBLE'],
    ] as const;
    for (const [key, code] of keys) {
      const input = assisted();
      input.trustedGates![key] = false;
      failure(input, code);
    }
  });

  it('never offers CARE on a motorcycle', () => {
    const input = assisted();
    input.vehicleType = 'MOTORCYCLE';
    failure(input, 'VEHICLE_NOT_CAR');
  });

  it('denies absent, suspended, expired and future-dated qualifications', () => {
    const input = assisted();
    input.qualification = null;
    failure(input, 'DRIVER_NOT_QUALIFIED');
    input.qualification = assisted().qualification;
    input.qualification!.status = 'SUSPENDED';
    failure(input, 'DRIVER_NOT_QUALIFIED');
    input.qualification!.status = 'VERIFIED';
    input.qualification!.valid_until = now;
    failure(input, 'DRIVER_QUALIFICATION_EXPIRED');
    input.qualification!.valid_until = '2026-10-20T13:00:00.000Z';
    input.qualification!.verified_at = '2027-10-20T13:00:00.000Z';
    failure(input, 'DRIVER_NOT_QUALIFIED');
  });

  it('requires mode-specific driver training as well as base assistance training', () => {
    const input = assisted();
    input.qualification!.assisted_training_verified = false;
    failure(input, 'TRAINING_INSUFFICIENT');
    input.qualification!.assisted_training_verified = true;
    input.requirements!.mode = 'FOLDING_WHEELCHAIR';
    input.requirements!.folding_wheelchair = true;
    input.requirements!.can_self_transfer = true;
    input.vehicle!.folding_storage_verified = true;
    failure(input, 'TRAINING_INSUFFICIENT');
  });

  it('requires folding wheelchair passenger to self-transfer and storage to be verified', () => {
    const input = assisted();
    input.requirements!.mode = 'FOLDING_WHEELCHAIR';
    input.requirements!.folding_wheelchair = true;
    input.qualification!.folding_training_verified = true;
    failure(input, 'REQUIREMENT_INCONSISTENT');
    input.requirements!.can_self_transfer = true;
    failure(input, 'VEHICLE_STORAGE_INSUFFICIENT');
    input.vehicle!.folding_storage_verified = true;
    expect(evaluateCareEligibility(input).eligible).toBe(true);
  });

  it('requires verified storage for a declared walking aid', () => {
    const input = assisted();
    input.requirements!.uses_walking_aid = true;
    failure(input, 'VEHICLE_STORAGE_INSUFFICIENT');
    input.vehicle!.folding_storage_verified = true;
    expect(evaluateCareEligibility(input).eligible).toBe(true);
  });

  it('rejects adapted ride when occupancy declaration is contradictory', () => {
    const input = assisted();
    input.requirements!.mode = 'ADAPTED_WHEELCHAIR';
    input.requirements!.remain_in_wheelchair = false;
    failure(input, 'REQUIREMENT_INCONSISTENT');
  });

  it('requires adapted vehicle equipment, trained driver and valid passenger capacity', () => {
    const input = assisted();
    input.requirements!.mode = 'ADAPTED_WHEELCHAIR';
    input.requirements!.remain_in_wheelchair = true;
    failure(input, 'TRAINING_INSUFFICIENT');
    failure(input, 'VEHICLE_ADAPTATION_INCOMPLETE');
    input.qualification!.adapted_training_verified = true;
    input.vehicle!.wheelchair_capacity = 1;
    input.vehicle!.ramp_or_lift_verified = true;
    input.vehicle!.wheelchair_restraint_verified = true;
    input.vehicle!.occupant_restraint_verified = true;
    input.vehicle!.adaptation_document_verified = true;
    expect(evaluateCareEligibility(input).eligible).toBe(true);
    input.vehicle!.occupant_restraint_verified = false;
    failure(input, 'VEHICLE_ADAPTATION_INCOMPLETE');
  });

  it('rejects missing, expired and unreviewed vehicle evidence', () => {
    const input = assisted();
    input.vehicle = null;
    failure(input, 'VEHICLE_NOT_VERIFIED');
    input.vehicle = assisted().vehicle;
    input.vehicle!.status = 'PENDING';
    failure(input, 'VEHICLE_NOT_VERIFIED');
    input.vehicle!.status = 'VERIFIED';
    input.vehicle!.inspection_valid_until = now;
    failure(input, 'VEHICLE_INSPECTION_EXPIRED');
    input.vehicle!.inspection_valid_until = '2026-10-20T00:00:00.000Z';
    input.vehicle!.verified_by_admin_id = null;
    failure(input, 'VEHICLE_NOT_VERIFIED');
  });

  it('invalidates a formerly verified vehicle when the current plate changes', () => {
    const input = assisted();
    input.registeredPlate = 'XYZ9Z99';
    failure(input, 'VEHICLE_PLATE_MISMATCH');
    input.registeredPlate = '';
    failure(input, 'VEHICLE_PLATE_MISMATCH');
    input.registeredPlate = 'ABC1D23';
    expect(evaluateCareEligibility(input).eligible).toBe(true);
  });

  it('checks declared companions against real verified seat count', () => {
    const input = assisted();
    input.requirements!.companion_seats = 3;
    failure(input, 'COMPANION_CAPACITY_INSUFFICIENT');
    input.vehicle!.companion_seats = 3;
    expect(evaluateCareEligibility(input).eligible).toBe(true);
    input.vehicle!.companion_seats = -1;
    failure(input, 'VEHICLE_CAPACITY_INSUFFICIENT');
  });

  it('returns reason codes without diagnostic data and does not mutate input', () => {
    const input = assisted();
    const before = JSON.stringify(input);
    input.trustedGates!.insuranceConfirmedForMode = false;
    const result = evaluateCareEligibility(input);
    expect(result.reasons).toEqual(['INSURANCE_NOT_CONFIRMED']);
    expect(result).not.toHaveProperty('medical_notes');
    expect(JSON.stringify(input)).toBe(before.replace('"insuranceConfirmedForMode":true', '"insuranceConfirmedForMode":false'));
  });
});
