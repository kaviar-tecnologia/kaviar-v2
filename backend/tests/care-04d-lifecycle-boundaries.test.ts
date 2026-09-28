import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8');
const dispatcher = () => read('src/services/dispatcher.service.ts');
const acceptance = () => read('src/services/offer-acceptance.service.ts');
const routes = () => read('src/routes/rides-v2.ts');

describe('CARE-04D — official dispatch and acceptance boundaries', () => {
  it('keeps the unconditional CARE-04A dispatch block before discovery, offers or realtime', () => {
    const source = dispatcher();
    const block = source.indexOf('if (isUnsupportedCareIntent({');
    expect(block).toBeGreaterThan(-1);
    expect(block).toBeLessThan(source.indexOf('await this.findCandidates(ride)'));
    expect(source.slice(block, source.indexOf('await this.findCandidates(ride)')))
      .toContain('return;');
    expect(source.slice(block, source.indexOf('await this.findCandidates(ride)')))
      .toContain("status: 'canceled'");
    expect(source.slice(block, source.indexOf('await this.findCandidates(ride)')))
      .toContain("status: 'no_driver'");
  });

  it('filters CARE candidates before scoring using a fresh DB read and absent external evidence', () => {
    const source = dispatcher();
    const discovery = source.slice(source.indexOf('private async findCandidates('));
    expect(discovery).toContain('const careIntent = isUnsupportedCareIntent({');
    expect(discovery).toContain('care_ineligible: 0');
    const eligibility = discovery.indexOf('if (careIntent) {');
    const ranking = discovery.indexOf('candidates.push({');
    expect(eligibility).toBeGreaterThan(-1);
    expect(eligibility).toBeLessThan(ranking);
    expect(discovery.slice(eligibility, ranking))
      .toContain('evaluateCareEligibilityFromDb(\n          prisma, ride.id, ds.driver_id, null, new Date(),');
    expect(discovery.slice(eligibility, ranking)).toContain('if (!decision.eligible)');
    expect(discovery.slice(eligibility, ranking)).toContain('continue;');
  });

  it('revalidates the current ride inside the official offer transaction', () => {
    const source = dispatcher();
    const offer = source.slice(
      source.indexOf('const offer = await prisma.$transaction(async (tx) => {'),
      source.indexOf('console.log(`[OFFER_SENT]'),
    );
    expect(offer).toContain('tx.rides_v2.findUnique({');
    expect(offer).toContain('status: true, service_category: true, ride_type: true, trip_details: true');
    expect(offer.indexOf('tx.rides_v2.findUnique({'))
      .toBeLessThan(offer.indexOf('tx.ride_offers.create({'));
    expect(offer).toContain('evaluateCareEligibilityFromDb(\n          tx, rideId, bestCandidate.driver_id, null, new Date(),');
    expect(offer).toContain('throw new Error(CARE_UNAVAILABLE_CODE)');
    expect(offer).toContain('status: { in: [\'requested\', \'offered\'] }');
    expect(offer).toContain('service_category: ride.service_category');
    expect(offer).toContain('ride_type: ride.ride_type');
    expect(offer).toContain("if (updatedRide.count !== 1) throw new Error('Ride offer state changed');");
    expect(offer.indexOf('tx.ride_offers.create({')).toBeLessThan(offer.indexOf('tx.rides_v2.updateMany({'));
  });

  it('revalidates inside original acceptance transaction before assignment or wallet operations', () => {
    const source = acceptance();
    const tx = source.slice(
      source.indexOf('export async function acceptOfferInternal('),
      source.indexOf('const { ride, adjustmentStatus, rideStatus } = result;'),
    );
    const initial = tx.indexOf('if (isUnsupportedCareIntent({');
    const secondary = tx.indexOf('evaluateCareEligibilityFromDb(');
    const offerMutation = tx.indexOf('tx.ride_offers.updateMany({');
    const rideMutation = tx.indexOf('tx.rides_v2.updateMany({');
    expect(initial).toBeGreaterThan(-1);
    expect(initial).toBeLessThan(secondary);
    expect(secondary).toBeLessThan(offerMutation);
    expect(offerMutation).toBeLessThan(rideMutation);
    expect(tx).toContain('tx, offer.ride_id, driverId, null, new Date(),');
    expect(tx).toContain('throw new Error(CARE_UNAVAILABLE_CODE)');
    expect(tx).toContain('service_category: offer.ride.service_category');
    expect(tx).toContain('ride_type: offer.ride.ride_type');
    expect(tx).toContain("if (updatedRide.count !== 1)");
    expect(source.indexOf('const result = await prisma.$transaction('))
      .toBeLessThan(source.indexOf('Wallet V2: reserve estimated fee'));
  });

  it('keeps alternate price-adjustment acceptance blocked before settlement', () => {
    const source = routes();
    const adjustment = source.slice(
      source.indexOf("router.post('/:ride_id/adjustment-response'"),
      source.indexOf("router.get('/history'"),
    );
    expect(adjustment.indexOf('if (isUnsupportedCareIntent({')).toBeGreaterThan(-1);
    expect(adjustment.indexOf('if (isUnsupportedCareIntent({'))
      .toBeLessThan(adjustment.indexOf('UPDATE ride_settlements'));
    expect(adjustment).toContain('dispatcherService.dispatchRide(ride_id)');
    expect(source).not.toContain("router.post('/care");
  });

  it('has no feature flag or client-provided evidence that enables CARE in these services', () => {
    const source = dispatcher() + acceptance();
    expect(source).not.toMatch(/CARE_(?:ENABLED|RELEASED)\s*===?\s*['"]true['"]/);
    expect(source).not.toContain('req.body.insuranceConfirmedForMode');
    expect(source).toContain('CARE_UNAVAILABLE_CODE');
    expect(source).toContain('evaluateCareEligibilityFromDb');
  });
});
