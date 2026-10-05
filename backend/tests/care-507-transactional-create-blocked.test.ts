import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CareRideMode } from '@prisma/client';
import { validateCareDraftRequirements } from '../src/services/care/care-ride-create';

const read = (path: string) => readFileSync(path, 'utf8');

describe('CARE-507 transactional create remains blocked', () => {
  it('documents the blocked transactional creation contract', () => {
    const doc = read('../docs/care/CARE-507-transactional-create-blocked.md');

    expect(doc).toContain('CARE-507 — criação transacional CARE bloqueada/fail-closed');
    expect(doc).toContain('`passenger_id` sempre vindo do passageiro autenticado');
    expect(doc).toContain('`passenger_id` vindo do body é proibido');
    expect(doc).toContain('CARE_SERVICE_NOT_AVAILABLE');
    expect(doc).toContain('CARE_REQUIREMENTS_MISSING');
    expect(doc).toContain('não faz deploy');
    expect(doc).toContain('não altera produção');
    expect(doc).toContain('não habilita CARE público');
    expect(doc).toContain('não mexe em wallet ou pagamentos');
  });

  it('keeps the public rides-v2 route blocked before create, pricing and dispatch', () => {
    const route = read('src/routes/rides-v2.ts');
    const createRoute = route.indexOf("router.post('/', authenticatePassenger");
    const gate = route.indexOf('if (await rejectBlockedCareIntent(req, res)) return;', createRoute);
    const createCall = route.indexOf('const ride = await createRideWithRequirements({', createRoute);
    const pricing = route.indexOf('// Pricing: quote + lock', createRoute);
    const dispatch = route.indexOf('dispatcherService.dispatchRide', createRoute);

    expect(createRoute).toBeGreaterThanOrEqual(0);
    expect(gate).toBeGreaterThan(createRoute);
    expect(createCall).toBeGreaterThan(gate);
    expect(pricing).toBeGreaterThan(gate);
    expect(dispatch).toBeGreaterThan(gate);
    expect(gate).toBeLessThan(createCall);
    expect(gate).toBeLessThan(pricing);
    expect(gate).toBeLessThan(dispatch);
  });

  it('keeps passenger identity authenticated and not body-controlled', () => {
    const route = read('src/routes/rides-v2.ts');
    const createRoute = route.indexOf("router.post('/', authenticatePassenger");
    const createCall = route.indexOf('const ride = await createRideWithRequirements({', createRoute);
    const afterCreate = route.indexOf('console.log(`[RIDE_CREATED]', createCall);
    const createBlock = route.slice(createCall, afterCreate);

    expect(route.slice(createRoute, createCall)).toContain('const passengerId = (req as any).passengerId;');
    expect(createBlock).toContain('passenger_id: passengerId');
    expect(createBlock).not.toMatch(/passenger_id:\s*req\.body/i);
    expect(createBlock).not.toMatch(/passenger_id:\s*body/i);
    expect(createBlock).not.toMatch(/passenger_id:\s*passenger_id/i);
  });

  it('keeps internal CARE persistence transactional and draft-only', () => {
    const source = read('src/services/care/care-ride-create.ts');

    expect(source).toContain("throw new CareDraftValidationError('CARE_REQUIREMENTS_MISSING');");
    expect(source).toContain('return prisma.$transaction(async tx => {');
    expect(source).toContain('const ride = await tx.rides_v2.create(args);');
    expect(source).toContain('await tx.care_trip_requirements.create({');
    expect(source).toContain("status: 'DRAFT'");
    expect(source).toContain("throw new CareDraftValidationError('CARE_DRAFT_MUST_BE_UNPRICED');");
    expect(source).toContain("throw new CareDraftValidationError('CARE_DRIVER_PREASSIGNMENT_FORBIDDEN');");
  });

  it('sanitizes client-like CARE requirement input', () => {
    const cleaned = validateCareDraftRequirements({
      mode: CareRideMode.ASSISTED,
      foldingWheelchair: false,
      remainInWheelchair: false,
      canSelfTransfer: null,
      needsExtraBoardingTime: true,
      guideDog: true,
      companionSeats: 1,
      reviewed_at: '2099-01-01',
      diagnosis: 'forbidden',
      status: 'READY',
      quoted_price: '100.00',
      driver_id: 'fake-driver',
    } as any);

    expect(cleaned).toEqual({
      mode: CareRideMode.ASSISTED,
      foldingWheelchair: false,
      remainInWheelchair: false,
      canSelfTransfer: null,
      needsExtraBoardingTime: true,
      usesWalkingAid: false,
      needsPickupGuidance: false,
      guideDog: true,
      companionSeats: 1,
    });
    expect(cleaned).not.toHaveProperty('diagnosis');
    expect(cleaned).not.toHaveProperty('status');
    expect(cleaned).not.toHaveProperty('quoted_price');
    expect(cleaned).not.toHaveProperty('driver_id');
  });
});
