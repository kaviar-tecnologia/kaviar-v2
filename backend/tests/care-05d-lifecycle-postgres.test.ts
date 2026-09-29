import { randomUUID } from 'node:crypto';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { CareRideMode, PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { createRideWithRequirements } from '../src/services/care/care-ride-create';
import { acceptOfferInternal } from '../src/services/offer-acceptance.service';
import { dispatcherService } from '../src/services/dispatcher.service';

/**
 * CARE-05D — real official service calls against a disposable CI Postgres.
 * No production URL, insurance/provider call, payment/ledger or CARE activation.
 * Legacy offers are synthesized ONLY inside the isolated test DB to prove
 * the central block rejects both direct accept and redispatch.
 */
const db = new PrismaClient();
const passengerId = 'care05d-passenger-' + randomUUID();
const driverId = 'care05d-driver-' + randomUUID();

async function careRide() {
  return createRideWithRequirements({
    data: {
      passenger_id: passengerId,
      ride_type: 'care',
      service_category: 'CARE_ASSISTED',
      status: 'requested',
      idempotency_key: 'care05d-' + randomUUID(),
      origin_lat: new Decimal('-22.90000000'),
      origin_lng: new Decimal('-43.20000000'),
      dest_lat: new Decimal('-22.91000000'),
      dest_lng: new Decimal('-43.21000000'),
    },
  }, {
    mode: CareRideMode.ASSISTED,
    foldingWheelchair: false,
    remainInWheelchair: false,
    companionSeats: 0,
    needsExtraBoardingTime: true,
  });
}

async function offeredCareRide(expiresAt = new Date(Date.now() + 600_000)) {
  const ride = await careRide();
  await db.rides_v2.update({
    where: { id: ride.id },
    data: { status: 'offered' },
  });
  const offer = await db.ride_offers.create({
    data: {
      ride_id: ride.id, driver_id: driverId,
      status: 'pending', territory_tier: 'NEIGHBORHOOD',
      expires_at: expiresAt,
    },
  });
  return { ride, offer };
}

async function assertNoCareAcceptance(rideId: string) {
  const ride = await db.rides_v2.findUnique({ where: { id: rideId } });
  expect(ride?.driver_id).toBeNull();
  expect(await db.ride_offers.count({
    where: { ride_id: rideId, status: 'accepted' },
  })).toBe(0);
  expect(await db.ride_settlements.count({
    where: { ride_id: rideId },
  })).toBe(0);
  expect((await db.driver_status.findUnique({
    where: { driver_id: driverId },
  }))?.availability).toBe('online');
}

describe('CARE-05D — actual official lifecycle remains closed (disposable PostgreSQL)', () => {
  beforeAll(async () => {
    await db.passengers.create({
      data: {
        id: passengerId, email: passengerId + '@example.invalid',
        name: 'Synthetic CARE-05D Passenger', status: 'approved',
        updated_at: new Date(),
      },
    });
    await db.drivers.create({
      data: {
        id: driverId, email: driverId + '@example.invalid',
        name: 'Synthetic CARE-05D Driver', status: 'approved',
        vehicle_type: 'CAR', vehicle_plate: 'ABC1D23',
        updated_at: new Date(),
      },
    });
    await db.driver_status.create({
      data: { driver_id: driverId, availability: 'online' },
    });
  });

  afterAll(async () => {
    await db.ride_offers.deleteMany({ where: { ride: { passenger_id: passengerId } } });
    await db.rides_v2.deleteMany({ where: { passenger_id: passengerId } });
    await db.driver_status.deleteMany({ where: { driver_id: driverId } });
    await db.drivers.deleteMany({ where: { id: driverId } });
    await db.passengers.deleteMany({ where: { id: passengerId } });
    await db.$disconnect();
  });

  it('creates exactly one CARE draft with child requirements, no price or driver', async () => {
    const ride = await careRide();
    const saved = await db.rides_v2.findUnique({
      where: { id: ride.id }, include: { care_requirements: true },
    });
    expect(saved?.status).toBe('requested');
    expect(saved?.care_requirements).toMatchObject({
      mode: 'ASSISTED', status: 'DRAFT',
      needs_extra_boarding_time: true, reviewed_at: null,
    });
    expect(saved?.quoted_price).toBeNull();
    expect(saved?.locked_price).toBeNull();
    await assertNoCareAcceptance(ride.id);
  });

  it('rejects an imported pending CARE offer BEFORE assigning driver or touching settlement', async () => {
    const { ride, offer } = await offeredCareRide();
    await expect(acceptOfferInternal(offer.id, driverId))
      .rejects.toThrow('CARE_SERVICE_NOT_AVAILABLE');
    expect((await db.ride_offers.findUnique({ where: { id: offer.id } }))?.status)
      .toBe('pending');
    expect((await db.rides_v2.findUnique({ where: { id: ride.id } }))?.status)
      .toBe('offered');
    await assertNoCareAcceptance(ride.id);
  });

  it('rejects both simultaneous accepts; no offer can bypass CARE-04A', async () => {
    const { ride, offer } = await offeredCareRide();
    const attempts = await Promise.allSettled([
      acceptOfferInternal(offer.id, driverId),
      acceptOfferInternal(offer.id, driverId),
    ]);
    expect(attempts.every(r => r.status === 'rejected')).toBe(true);
    await assertNoCareAcceptance(ride.id);
  });

  it('cancels synthetic pending CARE offers using the existing dispatcher; redispatch stays closed', async () => {
    const { ride, offer } = await offeredCareRide();
    await dispatcherService.dispatchRide(ride.id);
    expect((await db.ride_offers.findUnique({ where: { id: offer.id } }))?.status)
      .toBe('canceled');
    expect((await db.rides_v2.findUnique({ where: { id: ride.id } }))?.status)
      .toBe('no_driver');
    await dispatcherService.dispatchRide(ride.id);
    expect(await db.ride_offers.count({ where: { ride_id: ride.id } })).toBe(1);
    await assertNoCareAcceptance(ride.id);
  });

  it('expired CARE offer cannot be accepted or create a settlement', async () => {
    const { ride, offer } = await offeredCareRide(new Date(Date.now() - 1_000));
    await expect(acceptOfferInternal(offer.id, driverId))
      .rejects.toThrow('Offer expired');
    await dispatcherService.dispatchRide(ride.id);
    expect((await db.ride_offers.findUnique({ where: { id: offer.id } }))?.status)
      .toBe('canceled');
    await assertNoCareAcceptance(ride.id);
  });

  it('cancellation remains final while dispatcher cancels any pending imported offer', async () => {
    const { ride, offer } = await offeredCareRide();
    await db.rides_v2.update({
      where: { id: ride.id }, data: { status: 'canceled_by_passenger' },
    });
    await dispatcherService.dispatchRide(ride.id);
    expect((await db.rides_v2.findUnique({ where: { id: ride.id } }))?.status)
      .toBe('canceled_by_passenger');
    expect((await db.ride_offers.findUnique({ where: { id: offer.id } }))?.status)
      .toBe('canceled');
    await assertNoCareAcceptance(ride.id);
  });
});
