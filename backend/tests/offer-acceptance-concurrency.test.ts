import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { acceptOfferInternal } from '../src/services/offer-acceptance.service';

const prisma = new PrismaClient();

describe('Offer acceptance concurrency', () => {
  let testPassengerId: string;
  let testDriverAId: string;
  let testDriverBId: string;
  let uniqueSuffix: string;

  beforeAll(async () => {
    uniqueSuffix = Date.now().toString().slice(-6);

    const passenger = await prisma.passengers.create({
      data: {
        id: 'care05d-normal-passenger-' + randomUUID(),
        name: `Test Passenger ${uniqueSuffix}`,
        email: `passenger-${uniqueSuffix}@example.com`,
        status: 'approved',
        updated_at: new Date(),
      }
    });
    testPassengerId = passenger.id;

    const driverA = await prisma.drivers.create({
      data: {
        id: 'care05d-normal-driver-' + randomUUID(),
        name: `Test Driver A ${uniqueSuffix}`,
        email: `driver-a-${uniqueSuffix}@example.com`,
        status: 'approved',
        updated_at: new Date(),
      }
    });
    testDriverAId = driverA.id;

    const driverB = await prisma.drivers.create({
      data: {
        id: 'care05d-normal-driver-' + randomUUID(),
        name: `Test Driver B ${uniqueSuffix}`,
        email: `driver-b-${uniqueSuffix}@example.com`,
        status: 'approved',
        updated_at: new Date(),
      }
    });
    testDriverBId = driverB.id;
  });

  afterAll(async () => {
    await prisma.ride_offers.deleteMany({
      where: {
        driver_id: { in: [testDriverAId, testDriverBId] }
      }
    });

    await prisma.rides_v2.deleteMany({ where: { passenger_id: testPassengerId } });
    await prisma.drivers.deleteMany({ where: { id: { in: [testDriverAId, testDriverBId] } } });
    await prisma.passengers.deleteMany({ where: { id: testPassengerId } });
    await prisma.$disconnect();
  });

  it('allows only one driver to accept the same ride offer simultaneously', async () => {
    const ride = await prisma.rides_v2.create({
      data: {
        passenger_id: testPassengerId,
        origin_lat: new Decimal(-23.55052),
        origin_lng: new Decimal(-46.63331),
        dest_lat: new Decimal(-23.54800),
        dest_lng: new Decimal(-46.63200),
        status: 'offered',
        quoted_price: new Decimal(20.00),
        passenger_app_version: '1.0.0',
      }
    });

    const offerA = await prisma.ride_offers.create({
      data: {
        ride_id: ride.id,
        driver_id: testDriverAId,
        status: 'pending',
        territory_tier: 'NEIGHBORHOOD',
        expires_at: new Date(Date.now() + 1000 * 60),
      }
    });

    const offerB = await prisma.ride_offers.create({
      data: {
        ride_id: ride.id,
        driver_id: testDriverBId,
        status: 'pending',
        territory_tier: 'NEIGHBORHOOD',
        expires_at: new Date(Date.now() + 1000 * 60),
      }
    });

    const [resultA, resultB] = await Promise.allSettled([
      acceptOfferInternal(offerA.id, testDriverAId),
      acceptOfferInternal(offerB.id, testDriverBId),
    ]);

    const fulfilledCount = [resultA, resultB].filter((r) => r.status === 'fulfilled').length;
    const rejectedCount = [resultA, resultB].filter((r) => r.status === 'rejected').length;

    expect(fulfilledCount).toBe(1);
    expect(rejectedCount).toBe(1);

    const rideAfter = await prisma.rides_v2.findUnique({ where: { id: ride.id } });
    expect(rideAfter).not.toBeNull();
    expect(rideAfter?.status).toBe('accepted');
    expect([testDriverAId, testDriverBId]).toContain(rideAfter?.driver_id);

    const acceptedOffers = await prisma.ride_offers.findMany({
      where: { ride_id: ride.id, status: 'accepted' }
    });
    const canceledOffers = await prisma.ride_offers.findMany({
      where: { ride_id: ride.id, status: 'canceled' }
    });

    expect(acceptedOffers.length).toBe(1);
    expect(canceledOffers.length).toBe(1);

    const failedResult = [resultA, resultB].find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(failedResult.reason.message).toBe('Offer acceptance conflict');
  });
});
