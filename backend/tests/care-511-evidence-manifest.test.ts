import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

function indexOfOrFail(source: string, token: string): number {
  const index = source.indexOf(token);
  expect(index, `Missing token: ${token}`).toBeGreaterThanOrEqual(0);
  return index;
}

describe('CARE-511 evidence manifest', () => {
  it('documents the minimum evidence manifest before any operational CARE release', () => {
    const doc = read('../docs/care/CARE-511-evidence-manifest.md');

    expect(doc).toContain('CARE-511 — manifesto de evidências para liberação CARE');
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
    expect(doc).toContain('pacote de evidências');
    expect(doc).toContain('rastro verificável, revisável e auditável');
  });

  it('requires all twelve evidence sections in order', () => {
    const doc = read('../docs/care/CARE-511-evidence-manifest.md');

    const e1 = indexOfOrFail(doc, '## Evidência 1 — integridade de código');
    const e2 = indexOfOrFail(doc, '## Evidência 2 — bloqueio atual preservado');
    const e3 = indexOfOrFail(doc, '## Evidência 3 — autorização de escopo');
    const e4 = indexOfOrFail(doc, '## Evidência 4 — território, gestor e contrato');
    const e5 = indexOfOrFail(doc, '## Evidência 5 — passageiro e solicitação');
    const e6 = indexOfOrFail(doc, '## Evidência 6 — motorista e veículo');
    const e7 = indexOfOrFail(doc, '## Evidência 7 — pricing sem discriminação');
    const e8 = indexOfOrFail(doc, '## Evidência 8 — dispatcher e aceite');
    const e9 = indexOfOrFail(doc, '## Evidência 9 — wallet, repasse e pagamentos');
    const e10 = indexOfOrFail(doc, '## Evidência 10 — produção e observabilidade');
    const e11 = indexOfOrFail(doc, '## Evidência 11 — aceite jurídico, financeiro e operacional');
    const e12 = indexOfOrFail(doc, '## Evidência 12 — fechamento pós-liberação');

    expect(e1).toBeLessThan(e2);
    expect(e2).toBeLessThan(e3);
    expect(e3).toBeLessThan(e4);
    expect(e4).toBeLessThan(e5);
    expect(e5).toBeLessThan(e6);
    expect(e6).toBeLessThan(e7);
    expect(e7).toBeLessThan(e8);
    expect(e8).toBeLessThan(e9);
    expect(e9).toBeLessThan(e10);
    expect(e10).toBeLessThan(e11);
    expect(e11).toBeLessThan(e12);
  });

  it('forbids weak evidence from being treated as release approval', () => {
    const doc = read('../docs/care/CARE-511-evidence-manifest.md');

    expect(doc).toContain('É proibido usar como evidência suficiente:');
    expect(doc).toContain('print isolado sem contexto');
    expect(doc).toContain('teste local sem commit');
    expect(doc).toContain('commit sem PR');
    expect(doc).toContain('PR sem checks verdes');
    expect(doc).toContain('deploy sem versão confirmada');
    expect(doc).toContain('variável alterada manualmente');
    expect(doc).toContain('autorização dada para outro escopo');
    expect(doc).toContain('autorização verbal não registrada');
    expect(doc).toContain('ausência de erro como prova de segurança');
  });

  it('keeps this manifest out of operational scope', () => {
    const doc = read('../docs/care/CARE-511-evidence-manifest.md');

    expect(doc).toContain('não altera código operacional');
    expect(doc).toContain('não altera schema Prisma');
    expect(doc).toContain('não cria migration');
    expect(doc).toContain('não faz deploy');
    expect(doc).toContain('não altera produção');
    expect(doc).toContain('não habilita CARE público');
    expect(doc).toContain('não habilita CARE oficial');
    expect(doc).toContain('não mexe em dispatcher, aceite, pricing, wallet ou pagamentos');
  });

  it('matches the current fail-closed implementation while evidence is not complete', () => {
    const readiness = read('src/services/care/care-readiness-policy.ts');
    const adminShadow = read('src/routes/admin-care-shadow.ts');
    const publicRoute = read('src/routes/rides-v2.ts');

    expect(readiness).toContain('CARE_UNAVAILABLE_CODE');
    expect(readiness).toContain('CARE_SERVICE_NOT_AVAILABLE');
    expect(readiness).toContain('export function isUnsupportedCareIntent');

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
