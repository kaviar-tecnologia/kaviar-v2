import { randomUUID } from 'crypto';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { acceptOfferInternal } from '../src/services/offer-acceptance.service';
import * as walletFlag from '../src/routes/driver-wallet-v2';
import { WalletSettlementService } from '../src/services/wallet-v2/wallet-settlement.service';

const prisma = new PrismaClient();

describe('Offer acceptance wallet reserve handling', () => {
  let testPassengerId: string;
  let testDriverId: string;
  let testDriverBId: string;
  let uniqueSuffix: string;

  beforeAll(async () => {
    uniqueSuffix = Date.now().toString().slice(-6);
    const passenger = await prisma.passengers.create({ data: { id: randomUUID(), updated_at: new Date(), name: `P ${uniqueSuffix}`, email: `p-${uniqueSuffix}@x`, status: 'approved' } });
    testPassengerId = passenger.id;
    const driverA = await prisma.drivers.create({ data: { id: randomUUID(), updated_at: new Date(), name: `D1 ${uniqueSuffix}`, email: `d1-${uniqueSuffix}@x`, status: 'approved' } });
    testDriverId = driverA.id;
    const driverB = await prisma.drivers.create({ data: { id: randomUUID(), updated_at: new Date(), name: `D2 ${uniqueSuffix}`, email: `d2-${uniqueSuffix}@x`, status: 'approved' } });
    testDriverBId = driverB.id;
  });

  afterAll(async () => {
    const driverIds = [testDriverId, testDriverBId].filter(Boolean);

    try {
      if (driverIds.length > 0) {
        await prisma.ride_offers.deleteMany({
          where: { driver_id: { in: driverIds } }
        });

        await prisma.driver_status.deleteMany({
          where: { driver_id: { in: driverIds } }
        });
      }

      if (testPassengerId) {
        await prisma.rides_v2.deleteMany({
          where: { passenger_id: testPassengerId }
        });
      }

      if (driverIds.length > 0) {
        await prisma.drivers.deleteMany({
          where: { id: { in: driverIds } }
        });
      }

      if (testPassengerId) {
        await prisma.passengers.deleteMany({
          where: { id: testPassengerId }
        });
      }
    } finally {
      vi.restoreAllMocks();
      await prisma.$disconnect();
    }
  });

  it('reverts acceptance when reserve fails due to insufficient balance without canceling other pending offers', async () => {
    const ride = await prisma.rides_v2.create({ data: { passenger_id: testPassengerId, origin_lat: new Decimal(-23), origin_lng: new Decimal(-46), dest_lat: new Decimal(-23), dest_lng: new Decimal(-46), status: 'offered', quoted_price: new Decimal(30.00), passenger_app_version: '1.0.0' } });

    const offerA = await prisma.ride_offers.create({ data: { ride_id: ride.id, driver_id: testDriverId, status: 'pending', territory_tier: 'NEIGHBORHOOD', expires_at: new Date(Date.now() + 60000) } });
    const offerB = await prisma.ride_offers.create({ data: { ride_id: ride.id, driver_id: testDriverBId, status: 'pending', territory_tier: 'NEIGHBORHOOD', expires_at: new Date(Date.now() + 60000) } });

    vi.spyOn(walletFlag, 'isWalletV2Enabled').mockResolvedValue(true);
    const spy = vi.spyOn(WalletSettlementService.prototype, 'handleReserve').mockRejectedValue(new Error('INSUFFICIENT_BALANCE'));

    await expect(acceptOfferInternal(offerA.id, testDriverId)).rejects.toThrow('INSUFFICIENT_BALANCE');

    const rideAfter = await prisma.rides_v2.findUnique({ where: { id: ride.id } });
    expect(rideAfter?.driver_id).toBeNull();
    expect(rideAfter?.status).toBe('offered');

    const offerAAfter = await prisma.ride_offers.findUnique({ where: { id: offerA.id } });
    expect(offerAAfter?.status).toBe('canceled');

    const offerBAfter = await prisma.ride_offers.findUnique({ where: { id: offerB.id } });
    expect(offerBAfter?.status).toBe('pending');

    spy.mockRestore();
  });
});
