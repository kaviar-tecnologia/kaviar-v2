import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Static contract tests. The CI smoke test also executes migration SQL in a
// disposable PostgreSQL instance; these assertions alone do not prove DB safety.
const schema = readFileSync(resolve(process.cwd(), 'prisma/schema.prisma'), 'utf8');
const sql = readFileSync(resolve(process.cwd(), 'prisma/migrations/20260928144000_care_mobility_foundation/migration.sql'), 'utf8');
const section = (model: string) => {
  const match = schema.match(new RegExp('model ' + model + ' \\{([\\s\\S]*?)^\\}', 'm'));
  expect(match, 'Missing model ' + model).toBeTruthy();
  return match![1];
};

describe('CARE-02: isolated, fail-closed mobility data contract', () => {
  it('creates exactly the intended new tables and enums without touching existing data', () => {
    expect([...sql.matchAll(/CREATE TABLE "(.*?)"/g)].map(x => x[1])).toEqual([
      'care_trip_requirements', 'care_driver_qualifications', 'care_vehicle_capabilities',
    ]);
    expect([...sql.matchAll(/CREATE TYPE "(.*?)"/g)].map(x => x[1])).toEqual([
      'CareRideMode', 'CareQualificationStatus', 'CareTripStatus',
    ]);
    expect(sql).not.toMatch(/^\s*(?:INSERT\s+INTO|UPDATE\s+|DELETE\s+FROM|TRUNCATE\b|DROP\s+(?:TABLE|TYPE))\b/im);
    expect(sql).not.toMatch(/ALTER TABLE "(?:drivers|rides_v2|passengers|financial_[^"]*)"/);
    expect(sql).not.toMatch(/\b(?:SUMUP|ASAAS|OUTBOUND_PAYMENTS_ENABLED|FINANCE_OFFICIAL_ARCHIVE_ENABLED)\b/i);
  });

  it('starts every eligibility and trip unapproved', () => {
    expect(section('care_trip_requirements')).toContain('@default(DRAFT)');
    expect(section('care_driver_qualifications')).toContain('@default(PENDING)');
    expect(section('care_vehicle_capabilities')).toContain('@default(PENDING)');
    expect(sql).toContain('"status" "CareTripStatus" NOT NULL DEFAULT \'DRAFT\'');
    expect(sql.match(/"status" "CareQualificationStatus" NOT NULL DEFAULT 'PENDING'/g)).toHaveLength(2);
    expect(sql).toContain('care_trip_ready_requires_review');
    expect(sql).toContain('care_driver_verified_requires_evidence');
    expect(sql).toContain('care_vehicle_verified_requires_review');
  });

  it('separates per-trip requirements from medical profiles and limits exposure', () => {
    const trip = section('care_trip_requirements');
    expect(trip).toContain('ride_id                   String         @unique');
    expect(trip).toContain('CareRideMode');
    expect(trip).toContain('can_self_transfer');
    expect(trip).toContain('guide_dog');
    expect(trip).not.toMatch(/medical|diagnosis|cid|medication|health_notes/i);
    expect(sql).toContain('care_trip_mode_consistency');
    expect(sql).toContain('"can_self_transfer" IS TRUE');
  });

  it('documents driver and vehicle verification instead of merely a boolean for CARE', () => {
    const qualification = section('care_driver_qualifications');
    const vehicle = section('care_vehicle_capabilities');
    expect(qualification).toContain('valid_until');
    expect(qualification).toContain('verified_by_admin_id');
    expect(vehicle).toContain('plate_snapshot');
    expect(vehicle).toContain('inspection_valid_until');
    expect(vehicle).toContain('ramp_or_lift_verified');
    expect(vehicle).toContain('wheelchair_restraint_verified');
    expect(vehicle).toContain('occupant_restraint_verified');
    expect(sql).toContain('care_vehicle_adapted_requires_equipment');
    expect(sql).toContain('"wheelchair_capacity" = 0');
  });

  it('uses explicit one-to-one relations while preserving legacy profile and ride fields', () => {
    expect(section('rides_v2')).toContain('care_requirements      care_trip_requirements?');
    expect(section('drivers')).toContain('care_qualification          care_driver_qualifications?');
    expect(section('drivers')).toContain('care_vehicle                care_vehicle_capabilities?');
    expect(sql).toContain('REFERENCES "rides_v2"("id") ON DELETE CASCADE');
    expect(sql.match(/REFERENCES "drivers"\("id"\) ON DELETE CASCADE/g)).toHaveLength(2);
    expect(schema).toContain('model elderly_profiles {');
    expect(schema).toContain('medical_notes     String?');
  });
});
