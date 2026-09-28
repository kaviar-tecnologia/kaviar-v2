import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CARE_UNAVAILABLE_CODE,
  isUnsupportedCareIntent,
} from '../src/services/care/care-readiness-policy';

const read = (relative: string) => readFileSync(resolve(process.cwd(), relative), 'utf8');

describe('CARE-04 central backend readiness gate', () => {
  it('blocks recognized CARE categories, independent of case and separators', () => {
    for (const service_category of [
      'CARE', 'care_assisted', 'KAVIAR-CARE-ADAPTED', 'CAR_CARE',
      'ELDERLY_ASSISTANCE', 'ACOMPANHAMENTO_ATIVO', 'FOLDING_WHEELCHAIR',
      'ADAPTED_WHEELCHAIR', 'CAR_ADAPTED',
    ]) {
      expect(isUnsupportedCareIntent({ service_category }), service_category).toBe(true);
    }
    expect(CARE_UNAVAILABLE_CODE).toBe('CARE_SERVICE_NOT_AVAILABLE');
  });

  it('blocks CARE intent under aliases even when service_category is CAR_NORMAL', () => {
    for (const field of ['serviceCategory', 'service_type', 'serviceType', 'ride_type', 'type']) {
      expect(isUnsupportedCareIntent({ service_category: 'CAR_NORMAL', [field]: 'CARE_ASSISTED' }), field).toBe(true);
    }
  });

  it('blocks structured CARE requirements even when top-level category is CAR_NORMAL', () => {
    for (const key of [
      'care', 'care_mode', 'careMode', 'care_requirements', 'careRequirements',
      'mobility_requirements', 'mobilityRequirements', 'wheelchair_mode',
      'needs_wheelchair_accessible_vehicle', 'requires_adapted_vehicle',
      'careNeedsEscort',
    ]) {
      expect(isUnsupportedCareIntent({
        service_category: 'CAR_NORMAL',
        trip_details: { [key]: false },
      }), key).toBe(true);
      expect(isUnsupportedCareIntent({ service_category: 'CAR_NORMAL', [key]: null }), key).toBe(true);
    }
  });

  it('preserves conventional rides, legitimate normal-trip attributes and motorbikes', () => {
    const cases = [
      { service_category: 'CAR_NORMAL' },
      { service_category: 'MOTO_PASSENGER', trip_details: { luggage: true } },
      { service_category: 'CAR_NORMAL', trip_details: { notes: 'Care with luggage, please' } },
      { service_category: 'TOUR_GUIDE', type: 'normal' },
      {},
      null,
      'CARE',
    ];
    for (const request of cases) {
      expect(isUnsupportedCareIntent(request), JSON.stringify(request)).toBe(false);
    }
  });

  it('never treats arbitrary notes as an approved CARE booking', () => {
    expect(isUnsupportedCareIntent({ service_category: 'CAR_NORMAL', trip_details: { notes: 'cadeira de rodas' } })).toBe(false);
    // The real CARE UI must send a structured mode; free-text notes are
    // not a capability/qualification contract and cannot enable CARE.
    expect(isUnsupportedCareIntent({ service_category: 'CARE_ASSISTED', trip_details: { notes: 'none' } })).toBe(true);
  });

  it('guards estimate and create before any quoted price or persisted ride', () => {
    const code = read('src/routes/rides-v2.ts');
    const estimate = code.slice(code.indexOf("router.post('/estimate'"), code.indexOf("router.get('/active'"));
    const create = code.slice(code.indexOf("router.post('/', authenticatePassenger"), code.indexOf("router.post('/:ride_id/outside-fallback-consent'"));
    expect(estimate.indexOf('if (isUnsupportedCareIntent(req.body))')).toBeGreaterThan(-1);
    expect(estimate.indexOf('if (isUnsupportedCareIntent(req.body))')).toBeLessThan(estimate.indexOf('getRouteDistance('));
    expect(create.indexOf('if (isUnsupportedCareIntent(req.body))')).toBeGreaterThan(-1);
    expect(create.indexOf('if (isUnsupportedCareIntent(req.body))')).toBeLessThan(create.indexOf('rides_v2.create('));
    expect(create.indexOf('if (isUnsupportedCareIntent(req.body))')).toBeLessThan(create.indexOf('idempotencyKey'));
    expect(estimate).toContain("res.status(403).json({ success: false, error: CARE_UNAVAILABLE_CODE })");
    expect(create).toContain("res.status(403).json({ success: false, error: CARE_UNAVAILABLE_CODE })");
    // Price-adjustment acceptance bypasses acceptOfferInternal; explicitly
    // guard this second acceptance path before settlement/status changes.
    const adjustment = code.slice(code.indexOf("router.post('/:ride_id/adjustment-response'"), code.indexOf("router.get('/history'"));
    expect(adjustment.indexOf('if (isUnsupportedCareIntent({')).toBeGreaterThan(-1);
    expect(adjustment.indexOf('if (isUnsupportedCareIntent({')).toBeLessThan(adjustment.indexOf('const adjustedPrice ='));
    expect(adjustment).toContain("res.status(403).json({ success: false, error: CARE_UNAVAILABLE_CODE })");
  });

  it('blocks central dispatch and acceptance before making any offer or assignment', () => {
    const dispatch = read('src/services/dispatcher.service.ts');
    const accept = read('src/services/offer-acceptance.service.ts');
    expect(dispatch.indexOf('if (isUnsupportedCareIntent({')).toBeGreaterThan(-1);
    expect(dispatch.indexOf('if (isUnsupportedCareIntent({')).toBeLessThan(dispatch.indexOf('const allCandidates = await this.findCandidates(ride)'));
    expect(dispatch).toContain('CARE_DISPATCH_BLOCKED');
    expect(dispatch).toContain("data: { status: 'no_driver' }");
    expect(dispatch).toContain("data: { status: 'canceled' }");
    expect(accept.indexOf('if (isUnsupportedCareIntent({')).toBeGreaterThan(-1);
    expect(accept.indexOf('if (isUnsupportedCareIntent({')).toBeLessThan(accept.indexOf('const acceptedOffer = await tx.ride_offers.updateMany('));
    expect(accept).toContain('throw new Error(CARE_UNAVAILABLE_CODE)');
  });

  it('does not create an alternative CARE dispatcher or enable mobile CARE', () => {
    const mobile = read('../src/components/passenger/ServiceSelector.tsx');
    expect(mobile).toContain('title="KAVIAR Care"');
    expect(mobile).toContain('statusText="Em implantação."');
    const dispatcher = read('src/services/dispatcher.service.ts');
    expect(dispatcher).toContain('class DispatcherService');
  });
});
