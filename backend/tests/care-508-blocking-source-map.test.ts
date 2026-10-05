import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

describe('CARE-508 blocking source map', () => {
  it('documents the official CARE blocking map and non-operational scope', () => {
    const doc = read('../docs/care/CARE-508-blocking-source-map.md');

    expect(doc).toContain('CARE-508 — mapa oficial dos bloqueios CARE');
    expect(doc).toContain('CARE_SERVICE_NOT_AVAILABLE');
    expect(doc).toContain('CARE_REQUIREMENTS_MISSING');
    expect(doc).toContain('releaseReady=false');
    expect(doc).toContain('publicCareAvailable=false');
    expect(doc).toContain('officialCareAvailable=false');
    expect(doc).toContain('operationAllowed=false');
    expect(doc).toContain('dispatchAllowed=false');
    expect(doc).toContain('acceptanceAllowed=false');
    expect(doc).toContain('walletAllowed=false');
    expect(doc).toContain('não altera código operacional');
    expect(doc).toContain('não faz deploy');
    expect(doc).toContain('não altera produção');
    expect(doc).toContain('não mexe em pagamentos');
  });

  it('maps the public rides-v2 CARE gate before create, pricing and dispatch', () => {
    const route = read('src/routes/rides-v2.ts');

    const gateFn = route.indexOf('async function rejectBlockedCareIntent');
    const gateCall = route.indexOf('if (await rejectBlockedCareIntent(req, res)) return;');
    const passengerId = route.indexOf('const passengerId = (req as any).passengerId;', gateCall);
    const createCall = route.indexOf('const ride = await createRideWithRequirements({', gateCall);
    const pricing = route.indexOf('// Pricing: quote + lock', gateCall);
    const dispatch = route.indexOf('dispatcherService.dispatchRide', gateCall);

    expect(route).toContain('CARE_UNAVAILABLE_CODE');
    expect(route).toContain('isUnsupportedCareIntent');
    expect(route).toContain('createRideWithRequirements');

    expect(gateFn).toBeGreaterThanOrEqual(0);
    expect(gateCall).toBeGreaterThan(gateFn);
    expect(passengerId).toBeGreaterThan(gateCall);
    expect(createCall).toBeGreaterThan(gateCall);
    expect(pricing).toBeGreaterThan(gateCall);
    expect(dispatch).toBeGreaterThan(gateCall);
    expect(gateCall).toBeLessThan(createCall);
    expect(gateCall).toBeLessThan(pricing);
    expect(gateCall).toBeLessThan(dispatch);
  });

  it('maps readiness policy as the public fail-closed source', () => {
    const readiness = read('src/services/care/care-readiness-policy.ts');

    expect(readiness).toContain("CARE_SERVICE_NOT_AVAILABLE");
    expect(readiness).toContain('export function isUnsupportedCareIntent');
    expect(readiness).toContain('CARE_UNAVAILABLE_CODE');
  });

  it('maps internal transactional creation as blocked without CARE requirements', () => {
    const source = read('src/services/care/care-ride-create.ts');

    expect(source).toContain('isUnsupportedCareIntent');
    expect(source).toContain("throw new CareDraftValidationError('CARE_REQUIREMENTS_MISSING');");
    expect(source).toContain('return prisma.$transaction(async tx => {');
    expect(source).toContain('const ride = await tx.rides_v2.create(args);');
    expect(source).toContain('await tx.care_trip_requirements.create({');
    expect(source).toContain("status: 'DRAFT'");
    expect(source).toContain("CARE_DRAFT_MUST_BE_UNPRICED");
    expect(source).toContain("CARE_DRIVER_PREASSIGNMENT_FORBIDDEN");
  });

  it('maps admin shadow readiness as read-only and operationally closed', () => {
    const route = read('src/routes/admin-care-shadow.ts');

    expect(route).toContain('CARE_READINESS_REPORT_VERSION');
    expect(route).toContain('router.get(\'/readiness\'');
    expect(route).toContain('publicCode: CARE_UNAVAILABLE_CODE');
    expect(route).toContain('operationAllowed: false');
    expect(route).toContain('dispatchAllowed: false');
    expect(route).toContain('acceptanceAllowed: false');
    expect(route).toContain('walletAllowed: false');
    expect(route).toContain('shadowOnly: true');
  });
});
