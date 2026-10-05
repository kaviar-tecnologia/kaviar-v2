import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

function indexOfOrFail(source: string, token: string): number {
  const index = source.indexOf(token);
  expect(index, `Missing token: ${token}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe('CARE-509 staged release matrix', () => {
  it('documents the mandatory staged release matrix and blocked current state', () => {
    const doc = read('../docs/care/CARE-509-staged-release-matrix.md');

    expect(doc).toContain('CARE-509 — matriz de liberação controlada por etapas');
    expect(doc).toContain('CARE continua bloqueado');
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

  it('keeps release stages ordered from public block to final authorization', () => {
    const doc = read('../docs/care/CARE-509-staged-release-matrix.md');

    const stage0 = indexOfOrFail(doc, '### Etapa 0 — bloqueio público');
    const stage1 = indexOfOrFail(doc, '### Etapa 1 — pré-requisitos administrativos');
    const stage2 = indexOfOrFail(doc, '### Etapa 2 — elegibilidade motorista e veículo');
    const stage3 = indexOfOrFail(doc, '### Etapa 3 — pricing sem discriminação');
    const stage4 = indexOfOrFail(doc, '### Etapa 4 — dispatcher controlado');
    const stage5 = indexOfOrFail(doc, '### Etapa 5 — aceite controlado');
    const stage6 = indexOfOrFail(doc, '### Etapa 6 — wallet e pagamentos');
    const stage7 = indexOfOrFail(doc, '### Etapa 7 — autorização final');

    expect(stage0).toBeLessThan(stage1);
    expect(stage1).toBeLessThan(stage2);
    expect(stage2).toBeLessThan(stage3);
    expect(stage3).toBeLessThan(stage4);
    expect(stage4).toBeLessThan(stage5);
    expect(stage5).toBeLessThan(stage6);
    expect(stage6).toBeLessThan(stage7);
  });

  it('requires non-discriminatory pricing before dispatcher, acceptance, wallet and final authorization', () => {
    const doc = read('../docs/care/CARE-509-staged-release-matrix.md');

    const pricing = indexOfOrFail(doc, 'tarifa sem discriminação por idade, deficiência ou mobilidade');
    const dispatcher = indexOfOrFail(doc, '### Etapa 4 — dispatcher controlado');
    const acceptance = indexOfOrFail(doc, '### Etapa 5 — aceite controlado');
    const wallet = indexOfOrFail(doc, '### Etapa 6 — wallet e pagamentos');
    const authorization = indexOfOrFail(doc, 'autorização expressa do proprietário');

    expect(pricing).toBeLessThan(dispatcher);
    expect(dispatcher).toBeLessThan(acceptance);
    expect(acceptance).toBeLessThan(wallet);
    expect(wallet).toBeLessThan(authorization);
  });

  it('matches the current fail-closed source map before any operational release', () => {
    const readiness = read('src/services/care/care-readiness-policy.ts');
    const rideCreate = read('src/services/care/care-ride-create.ts');
    const adminShadow = read('src/routes/admin-care-shadow.ts');
    const publicRoute = read('src/routes/rides-v2.ts');

    expect(readiness).toContain('CARE_UNAVAILABLE_CODE');
    expect(readiness).toContain('CARE_SERVICE_NOT_AVAILABLE');
    expect(readiness).toContain('export function isUnsupportedCareIntent');

    expect(rideCreate).toContain("throw new CareDraftValidationError('CARE_REQUIREMENTS_MISSING');");
    expect(rideCreate).toContain('return prisma.$transaction(async tx => {');
    expect(rideCreate).toContain("status: 'DRAFT'");

    expect(adminShadow).toContain('publicCode: CARE_UNAVAILABLE_CODE');
    expect(adminShadow).toContain('operationAllowed: false');
    expect(adminShadow).toContain('dispatchAllowed: false');
    expect(adminShadow).toContain('acceptanceAllowed: false');
    expect(adminShadow).toContain('walletAllowed: false');

    const gate = indexOfOrFail(publicRoute, 'if (await rejectBlockedCareIntent(req, res)) return;');
    const create = indexOfOrFail(publicRoute, 'const ride = await createRideWithRequirements({');
    const pricing = indexOfOrFail(publicRoute, '// Pricing: quote + lock');
    const dispatch = indexOfOrFail(publicRoute, 'dispatcherService.dispatchRide');

    expect(gate).toBeLessThan(create);
    expect(gate).toBeLessThan(pricing);
    expect(gate).toBeLessThan(dispatch);
  });
});
