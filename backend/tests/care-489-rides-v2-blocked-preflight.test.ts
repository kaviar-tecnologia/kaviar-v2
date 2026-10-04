import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

const blockedCareHelper = (route: string): string => route.slice(
  route.indexOf('async function rejectBlockedCareIntent'),
  route.indexOf('// 5.0 Estimativa'),
);

describe('CARE-489 rides-v2 blocked internal pilot preflight', () => {
  it('wires the internal pilot preflight only at the passenger estimate/create boundary', () => {
    const route = read('src/routes/rides-v2.ts');

    expect(route).toContain(
      "import { getCareInternalPilotPreflightDecision } from '../services/care/care-internal-pilot-preflight';",
    );
    expect(route).toContain('async function rejectBlockedCareIntent(req: Request, res: Response): Promise<boolean>');
    expect(route).toContain('getCareInternalPilotPreflightDecision(');
    expect(route).toContain('prisma,');
    expect(route).toContain('req.body,');
    expect(route).toContain('(req as any).passengerId');
    expect(route).not.toContain('req.body.passengerId');
  });

  it('keeps estimate blocked before any route distance, pricing or quote work', () => {
    const route = read('src/routes/rides-v2.ts');
    const estimate = route.slice(
      route.indexOf("router.post('/estimate'"),
      route.indexOf("router.get('/active'"),
    );

    expect(estimate.indexOf('if (await rejectBlockedCareIntent(req, res))')).toBeGreaterThan(-1);
    expect(estimate.indexOf('if (await rejectBlockedCareIntent(req, res))'))
      .toBeLessThan(estimate.indexOf('getRouteDistance('));
    expect(blockedCareHelper(route)).toContain('res.status(403).json({ success: false, error: CARE_UNAVAILABLE_CODE })');
  });

  it('keeps create blocked before idempotency, persistence or dispatch work', () => {
    const route = read('src/routes/rides-v2.ts');
    const create = route.slice(
      route.indexOf("router.post('/', authenticatePassenger"),
      route.indexOf("router.post('/:ride_id/outside-fallback-consent'"),
    );

    const block = create.indexOf('if (await rejectBlockedCareIntent(req, res))');
    const creationBoundary = create.indexOf('createRideWithRequirements(');

    expect(block).toBeGreaterThan(-1);
    expect(creationBoundary).toBeGreaterThan(-1);
    expect(block).toBeLessThan(create.indexOf('idempotencyKey'));
    expect(block).toBeLessThan(creationBoundary);
    expect(blockedCareHelper(route)).toContain('res.status(403).json({ success: false, error: CARE_UNAVAILABLE_CODE })');
  });

  it('does not connect the preflight to dispatcher, acceptance, pricing or wallet services', () => {
    const dispatcher = read('src/services/dispatcher.service.ts');
    const acceptance = read('src/services/offer-acceptance.service.ts');
    const pricing = read('src/services/pricing-engine.ts');

    expect(dispatcher).not.toContain('getCareInternalPilotPreflightDecision');
    expect(acceptance).not.toContain('getCareInternalPilotPreflightDecision');
    expect(pricing).not.toContain('getCareInternalPilotPreflightDecision');
  });

  it('keeps the preflight permanently blocked in this PR', () => {
    const preflight = read('src/services/care/care-internal-pilot-preflight.ts');

    expect(preflight).toContain('canProceed: false');
    expect(preflight).not.toContain('canProceed: true');
    expect(preflight).toContain('CARE_UNAVAILABLE_CODE');
  });
});
