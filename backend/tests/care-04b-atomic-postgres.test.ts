import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CareRideMode, PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { createRideWithRequirements } from '../src/services/care/care-ride-create';

/**
 * This integration test is executed ONLY against a disposable local
 * PostgreSQL service in .github/workflows/care-04b-ci.yml.
 * No external provider, account, actual passenger, financial entry or
 * production database is involved.
 */
const db = new PrismaClient();
const passengerId = 'care04b-test-' + randomUUID();
const newKey = () => 'care04b-synthetic-' + randomUUID();
const assisted = () => ({
  mode: CareRideMode.ASSISTED,
  foldingWheelchair: false,
  remainInWheelchair: false,
  canSelfTransfer: null,
  companionSeats: 0,
  guideDog: true,
});

function draftRideArgs(key: string) {
  return {
    data: {
      passenger_id: passengerId,
      ride_type: 'care',
      service_category: 'CARE_ASSISTED',
      idempotency_key: key,
      status: 'requested' as const,
      origin_lat: new Decimal('-22.90000000'),
      origin_lng: new Decimal('-43.20000000'),
      dest_lat: new Decimal('-22.91000000'),
      dest_lng: new Decimal('-43.21000000'),
    },
  };
}

describe('CARE-04B atomic ride persistence (disposable PostgreSQL only)', () => {
  beforeAll(async () => {
    await db.passengers.create({
      data: {
        id: passengerId,
        name: 'CARE-04B Synthetic CI',
        email: passengerId + '@example.invalid',
        status: 'approved',
        updated_at: new Date(),
      },
    });
  });

  afterAll(async () => {
    await db.rides_v2.deleteMany({ where: { passenger_id: passengerId } });
    await db.passengers.delete({ where: { id: passengerId } });
    await db.$disconnect();
  });

  it('commits the same rides_v2 and requirements rows, with DRAFT, no review', async () => {
    const key = newKey();
    const ride = await createRideWithRequirements(draftRideArgs(key), assisted());
    const saved = await db.rides_v2.findUnique({
      where: { id: ride.id },
      include: { care_requirements: true },
    });
    expect(saved).not.toBeNull();
    expect(saved?.service_category).toBe('CARE_ASSISTED');
    expect(saved?.care_requirements).toMatchObject({
      ride_id: ride.id,
      mode: 'ASSISTED',
      status: 'DRAFT',
      reviewed_at: null,
      reviewed_by_admin_id: null,
      guide_dog: true,
    });
    expect(saved?.driver_id).toBeNull();
    const found = await db.rides_v2.count({
      where: { passenger_id: passengerId, idempotency_key: key },
    });
    expect(found).toBe(1);
  });

  it('rolls back the parent ride when the child insert fails', async () => {
    const key = newKey();
    // Only disposable CI DB. Simulates child write failure after the parent
    // INSERT, to prove that the parent cannot survive without requirements.
    await db.$executeRawUnsafe(`
      CREATE FUNCTION care04b_ci_reject_child() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        RAISE EXCEPTION 'CARE04B_SYNTHETIC_CHILD_FAILURE';
      END
      $$
    `);
    await db.$executeRawUnsafe(`
      CREATE TRIGGER care04b_ci_child_failure
      BEFORE INSERT ON care_trip_requirements
      FOR EACH ROW EXECUTE FUNCTION care04b_ci_reject_child()
    `);
    try {
      await expect(createRideWithRequirements(draftRideArgs(key), assisted()))
        .rejects.toThrow();
      expect(await db.rides_v2.count({
        where: { passenger_id: passengerId, idempotency_key: key },
      })).toBe(0);
      expect(await db.care_trip_requirements.count({
        where: { ride: { passenger_id: passengerId, idempotency_key: key } },
      })).toBe(0);
    } finally {
      await db.$executeRawUnsafe('DROP TRIGGER IF EXISTS care04b_ci_child_failure ON care_trip_requirements');
      await db.$executeRawUnsafe('DROP FUNCTION IF EXISTS care04b_ci_reject_child()');
    }
  });

  it('retains unchanged normal-ride behavior without creating a CARE child', async () => {
    const key = newKey();
    const ordinary = draftRideArgs(key);
    ordinary.data.service_category = 'CAR_NORMAL';
    ordinary.data.ride_type = 'normal';
    const ride = await createRideWithRequirements(ordinary);
    const saved = await db.rides_v2.findUnique({
      where: { id: ride.id },
      include: { care_requirements: true },
    });
    expect(saved?.service_category).toBe('CAR_NORMAL');
    expect(saved?.care_requirements).toBeNull();
  });
});
