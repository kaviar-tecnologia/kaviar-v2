import { randomInt } from 'crypto';
import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';
import { realTimeService } from './realtime.service';
import * as pricingEngine from './pricing-engine';
import { isWalletV2Enabled } from '../routes/driver-wallet-v2';
import { WalletSettlementService } from './wallet-v2/wallet-settlement.service';
import { WalletService } from './wallet-v2/wallet.service';
import { FeeSplitService } from './wallet-v2/fee-split.service';
import { TerritoryLedgerService } from './wallet-v2/territory-ledger.service';
import { PendingDebitService } from './wallet-v2/pending-debit.service';
import { pool } from '../db';
import { estimateFeeCentsFromPrice } from './wallet-v2/fee-helper';
import { isUnsupportedCareIntent, CARE_UNAVAILABLE_CODE } from './care/care-readiness-policy';
import { evaluateCareEligibilityFromDb } from './care/care-runtime-eligibility';

const ADJUSTMENT_MIN_PASSENGER_VERSION = '1.4.0';

function isVersionCompatible(version: string | null): boolean {
  if (!version) return false;
  const parts = version.split('.').map(Number);
  const min = ADJUSTMENT_MIN_PASSENGER_VERSION.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((parts[i] || 0) > (min[i] || 0)) return true;
    if ((parts[i] || 0) < (min[i] || 0)) return false;
  }
  return true; // equal
}

export async function acceptOfferInternal(offerId: string, driverId: string, adjustment?: number) {
  const result = await prisma.$transaction(async (tx) => {
    const offer = await tx.ride_offers.findUnique({
      where: { id: offerId },
      include: { ride: true }
    });

    if (!offer) throw new Error('Offer not found');
    if (offer.driver_id !== driverId) throw new Error('Forbidden');
    if (offer.status !== 'pending') throw new Error('Offer not pending');
    if (offer.expires_at < new Date()) throw new Error('Offer expired');

    // Defence in depth for pre-existing/imported offers: no assignment,
    // wallet reservation, notification or pricing on unsupported CARE.
    if (isUnsupportedCareIntent({
      service_category: offer.ride.service_category,
      ride_type: offer.ride.ride_type,
      trip_details: offer.ride.trip_details,
    })) {
      throw new Error(CARE_UNAVAILABLE_CODE);
    }

    // CARE-04D: additional transactional gate for a future explicitly
    // reviewed rollout. Re-read current evidence inside the SAME transaction,
    // before offer mutation, driver assignment, wallet or notifications.
    // Null means trusted CARE-specific municipality/territory/insurance
    // evidence is not yet connected. The CARE-04A unconditional guard above
    // remains authoritative and rejects CARE before this branch today.
    if (isUnsupportedCareIntent({
      service_category: offer.ride.service_category,
      ride_type: offer.ride.ride_type,
      trip_details: offer.ride.trip_details,
    })) {
      const careDecision = await evaluateCareEligibilityFromDb(
        tx, offer.ride_id, driverId, null, new Date(),
      );
      if (!careDecision.eligible) throw new Error(CARE_UNAVAILABLE_CODE);
      // An eligible snapshot cannot independently unlock a real CARE ride.
      throw new Error(CARE_UNAVAILABLE_CODE);
    }

    // Determine adjustment flow
    let adjustmentStatus: string | null = null;
    let rideStatus: 'accepted' | 'pending_adjustment' = 'accepted';

    if (adjustment) {
      const compatible = isVersionCompatible(offer.ride.passenger_app_version);
      if (compatible) {
        adjustmentStatus = 'pending';
        rideStatus = 'pending_adjustment';
      } else {
        adjustmentStatus = 'skipped';
        console.log(`[ADJUSTMENT_SKIPPED] offer_id=${offerId} ride_id=${offer.ride_id} reason=passenger_incompatible version=${offer.ride.passenger_app_version}`);
      }
    }

    if (!['requested', 'offered'].includes(offer.ride.status)) {
      throw new Error('Ride not available');
    }

    const acceptedOffer = await tx.ride_offers.updateMany({
      where: { id: offerId, status: 'pending' },
      data: {
        status: 'accepted',
        responded_at: new Date(),
        driver_adjustment: adjustment ? new Decimal(adjustment) : null,
        adjustment_status: adjustmentStatus,
      }
    });

    if (acceptedOffer.count !== 1) {
      throw new Error('Offer acceptance conflict');
    }

    const updatedRide = await tx.rides_v2.updateMany({
      // Compare-and-set against the identity loaded inside this transaction:
      // a concurrent change to CARE cannot inherit a regular offer/driver.
      where: {
        id: offer.ride_id,
        status: { in: ['requested', 'offered'] },
        service_category: offer.ride.service_category,
        ride_type: offer.ride.ride_type,
      },
      data: {
        driver_id: driverId,
        status: rideStatus,
        boarding_code: String(randomInt(1000, 10000)),
        accepted_at: rideStatus === 'accepted' ? new Date() : undefined,
        driver_adjustment: adjustmentStatus === 'pending' ? new Decimal(adjustment!) : null,
        adjusted_price: adjustmentStatus === 'pending' && offer.ride.quoted_price
          ? new Decimal(Number(offer.ride.quoted_price) + adjustment!)
          : null,
      }
    });

    if (updatedRide.count !== 1) {
      throw new Error('Offer acceptance conflict');
    }

    await tx.driver_status.upsert({
      where: { driver_id: driverId },
      create: { driver_id: driverId, availability: 'busy' },
      update: { availability: 'busy' }
    });

    // Copy last known location so passenger can see driver on map immediately
    const driverLoc = await tx.driver_locations.findUnique({ where: { driver_id: driverId } });
    if (driverLoc) {
      await tx.drivers.update({
        where: { id: driverId },
        data: { last_lat: driverLoc.lat, last_lng: driverLoc.lng, last_location_updated_at: new Date() }
      });
    }

    const logAdj = adjustment ? ` adjustment=${adjustment} adjustment_status=${adjustmentStatus}` : '';
    console.log(`[OFFER_ACCEPTED] offer_id=${offerId} ride_id=${offer.ride_id} driver_id=${driverId}${logAdj}`);
    console.log(`[RIDE_STATUS_CHANGED] ride_id=${offer.ride_id} status=${rideStatus} driver_id=${driverId}`);

    return { ride: offer.ride, adjustmentStatus, rideStatus };
  });

  const { ride, adjustmentStatus, rideStatus } = result;
  // Wallet V2: reserve estimated fee on accept
  if (rideStatus === 'accepted' && await isWalletV2Enabled()) {
      const price = Number(ride.quoted_price || ride.locked_price || 0);
      const estimatedFee = estimateFeeCentsFromPrice(price);
      if (estimatedFee > 0) {
        const walletSvc = new WalletService(pool);
        const feeSplitSvc = new FeeSplitService(pool);
        const ledgerSvc = new TerritoryLedgerService(pool);
        const pendingSvc = new PendingDebitService(pool);
        const settlement = new WalletSettlementService(pool, walletSvc, feeSplitSvc, ledgerSvc, pendingSvc, walletSvc);
        // Attempt reserve; if it fails we must revert the acceptance to avoid
        // leaving the ride assigned without reserve.
        try {
          await settlement.handleReserve(ride.id, driverId, BigInt(estimatedFee));
          await prisma.ride_offers.updateMany({
            where: { ride_id: ride.id, id: { not: offerId }, status: 'pending' },
            data: { status: 'canceled' }
          });
        } catch (reserveErr: any) {
          // If insufficient balance, perform compensating rollback of acceptance
          console.warn(`[WALLET_V2_RESERVE_FAIL] ride=${ride.id} driver=${driverId} reason=${reserveErr.message}`);
          await prisma.$transaction(async (tx) => {
            // Only revert if ride is still assigned to this driver and in accepted-like state
            const current = await tx.rides_v2.findUnique({ where: { id: ride.id } });
            if (current && current.driver_id === driverId && ['accepted', 'pending_adjustment'].includes(String(current.status))) {
              const pendingCount = await tx.ride_offers.count({ where: { ride_id: ride.id, status: 'pending' } });
              await tx.rides_v2.update({
                where: { id: ride.id },
                data: {
                  status: pendingCount > 0 ? 'offered' : 'requested',
                  driver_id: null,
                  accepted_at: null,
                  driver_adjustment: null,
                  adjusted_price: null
                }
              });
              await tx.ride_offers.updateMany({ where: { id: offerId }, data: { status: 'canceled' } });
              await tx.driver_status.updateMany({ where: { driver_id: driverId }, data: { availability: 'online' } });
            }
          });

          if (reserveErr.message === 'INSUFFICIENT_BALANCE') {
            const e: any = new Error('INSUFFICIENT_BALANCE');
            e.cause = reserveErr;
            throw e;
          }

          const e: any = new Error('RESERVE_FAILED');
          e.cause = reserveErr;
          throw e;
        }
      }
  }

  // SSE: notify passenger
  if (rideStatus === 'pending_adjustment') {
    realTimeService.emitToRide(ride.id, {
      type: 'ride.adjustment.pending',
      status: 'pending_adjustment',
      driver_id: driverId,
      quoted_price: Number(ride.quoted_price),
      driver_adjustment: adjustment,
      adjusted_price: Number(ride.quoted_price || 0) + (adjustment || 0),
      timestamp: new Date().toISOString()
    });
  } else {
    realTimeService.emitToRide(ride.id, {
      type: 'ride.status.changed',
      status: 'accepted',
      driver_id: driverId,
      timestamp: new Date().toISOString()
    });
  }

  // Pricing refine (fire-and-forget, only on direct accept)
  if (rideStatus === 'accepted') {
    try {
      const driverData = await prisma.drivers.findUnique({
        where: { id: driverId },
        select: { neighborhood_id: true, neighborhoods: { select: { name: true } } }
      });
      await pricingEngine.refine(
        ride.id,
        driverData?.neighborhood_id || null,
        (driverData as any)?.neighborhoods?.name || null
      );
    } catch (e: any) {
      console.error('[PRICING_REFINE_FAIL] acceptOffer', e.message);
    }
  }

  // WhatsApp: only on direct accept (not pending_adjustment)
  if (rideStatus === 'accepted') {
    try {
      const [passenger, driver] = await Promise.all([
        prisma.passengers.findUnique({ where: { id: ride.passenger_id }, select: { phone: true, name: true } }),
        prisma.drivers.findUnique({ where: { id: driverId }, select: { name: true, vehicle_color: true, vehicle_model: true, vehicle_plate: true } }),
      ]);
      if (passenger?.phone) {
        const { whatsappEvents } = require('../modules/whatsapp');
        whatsappEvents.rideDriverAssigned(passenger.phone, {
          '1': passenger.name || 'Passageiro',
          '2': driver?.name || 'Motorista',
          '3': driver?.vehicle_model || 'Não informado',
          '4': driver?.vehicle_color || 'Não informada',
          '5': driver?.vehicle_plate || 'Não informada',
        }).catch((e: any) => console.error('[WA_FAIL] rideDriverAssigned', e.message));
      }
    } catch (e: any) {
      console.error('[WA_LOOKUP_FAIL] acceptOffer', e.message);
    }
  }

  return { id: ride.id, adjustment_status: adjustmentStatus };
}
