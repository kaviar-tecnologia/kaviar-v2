import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CARE-483 driver acceptance remains gated', () => {
  it('blocks CARE before offer mutation, ride assignment, wallet, pricing and notifications', () => {
    const source = readFileSync('src/services/offer-acceptance.service.ts', 'utf8');
    const block = source.indexOf('throw new Error(CARE_UNAVAILABLE_CODE);');
    const offerMutation = source.indexOf('const acceptedOffer = await tx.ride_offers.updateMany({');
    const rideMutation = source.indexOf('const updatedRide = await tx.rides_v2.updateMany({');
    const wallet = source.indexOf('Wallet V2: reserve estimated fee');
    const realtime = source.indexOf('realTimeService.emitToRide');
    const pricing = source.indexOf('await pricingEngine.refine(');
    const whatsapp = source.indexOf('whatsappEvents.rideDriverAssigned');
    expect(block).toBeGreaterThan(-1);
    expect(block).toBeLessThan(offerMutation);
    expect(block).toBeLessThan(rideMutation);
    expect(block).toBeLessThan(wallet);
    expect(block).toBeLessThan(realtime);
    expect(block).toBeLessThan(pricing);
    expect(block).toBeLessThan(whatsapp);
    expect(source).toContain('no assignment,');
    expect(source).toContain('wallet reservation, notification or pricing');
  });

  it('keeps the future CARE eligibility recheck staged inside the acceptance transaction', () => {
    const source = readFileSync('src/services/offer-acceptance.service.ts', 'utf8');
    const eligibility = source.indexOf('evaluateCareEligibilityFromDb(');
    const offerMutation = source.indexOf('const acceptedOffer = await tx.ride_offers.updateMany({');
    expect(eligibility).toBeGreaterThan(-1);
    expect(eligibility).toBeLessThan(offerMutation);
    expect(source).toContain('tx, offer.ride_id, driverId, null, new Date(),');
    expect(source).toContain('An eligible snapshot cannot independently unlock a real CARE ride.');
  });
});
