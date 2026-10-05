import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

function indexOfOrFail(source: string, token: string): number {
  const index = source.indexOf(token);
  expect(index, `Missing token: ${token}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe('CARE-510 exit criteria', () => {
  it('documents objective criteria for leaving fail-closed mode', () => {
    const doc = read('../docs/care/CARE-510-exit-criteria.md');

    expect(doc).toContain('CARE-510 — critérios objetivos de saída do modo bloqueado');
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

  it('requires all eight exit criteria in order', () => {
    const doc = read('../docs/care/CARE-510-exit-criteria.md');

    const c1 = indexOfOrFail(doc, '## Critério 1 — escopo de liberação');
    const c2 = indexOfOrFail(doc, '## Critério 2 — elegibilidade administrativa');
    const c3 = indexOfOrFail(doc, '## Critério 3 — elegibilidade motorista e veículo');
    const c4 = indexOfOrFail(doc, '## Critério 4 — pricing e não discriminação');
    const c5 = indexOfOrFail(doc, '## Critério 5 — dispatcher e aceite');
    const c6 = indexOfOrFail(doc, '## Critério 6 — wallet, repasse e pagamentos');
    const c7 = indexOfOrFail(doc, '## Critério 7 — observabilidade e rollback');
    const c8 = indexOfOrFail(doc, '## Critério 8 — autorização final');

    expect(c1).toBeLessThan(c2);
    expect(c2).toBeLessThan(c3);
    expect(c3).toBeLessThan(c4);
    expect(c4).toBeLessThan(c5);
    expect(c5).toBeLessThan(c6);
    expect(c6).toBeLessThan(c7);
    expect(c7).toBeLessThan(c8);
  });

  it('forbids accidental or implicit real CARE enablement', () => {
    const doc = read('../docs/care/CARE-510-exit-criteria.md');

    expect(doc).toContain('É proibido habilitar CARE real por:');
    expect(doc).toContain('alteração direta de variável');
    expect(doc).toContain('hotfix sem PR');
    expect(doc).toContain('deploy sem checklist');
    expect(doc).toContain('mudança de código sem teste');
    expect(doc).toContain('interpretação implícita de autorização anterior');
    expect(doc).toContain('reaproveitamento de autorização dada para docs ou testes');
  });

  it('matches the current fail-closed implementation before exit criteria are met', () => {
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

    expect(adminShadow).toContain('releaseReady: false');
    expect(adminShadow).toContain('publicCareAvailable: false');
    expect(adminShadow).toContain('officialCareAvailable: false');
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
