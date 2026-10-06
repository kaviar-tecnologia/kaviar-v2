import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(process.cwd(), '..');

const readRepoFile = (path: string) =>
  readFileSync(resolve(repoRoot, path), 'utf8');

const readBackendFile = (path: string) =>
  readFileSync(resolve(process.cwd(), path), 'utf8');

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase();

describe('CARE-521 pricing nondiscrimination read-only evidence', () => {
  const doc = readRepoFile('docs/care/CARE-521-pricing-nondiscrimination-readonly-evidence.md');
  const plainDoc = normalize(doc);

  it('defines the core nondiscrimination pricing rule', () => {
    expect(plainDoc).toContain('nao pode cobrar mais caro por idade');
    expect(plainDoc).toContain('deficiencia');
    expect(plainDoc).toContain('morbidade');
    expect(plainDoc).toContain('condicao de saude');
    expect(plainDoc).toContain('custo operacional objetivo');
    expect(plainDoc).toContain('nao discriminatorio');
  });

  it('keeps CARE fail-closed and non-operational', () => {
    [
      'CARE_SERVICE_NOT_AVAILABLE',
      'CARE_REQUIREMENTS_MISSING',
      'releaseReady=false',
      'publicCareAvailable=false',
      'officialCareAvailable=false',
      'operationAllowed=false',
      'dispatchAllowed=false',
      'acceptanceAllowed=false',
      'walletAllowed=false',
    ].forEach((marker) => {
      expect(doc).toContain(marker);
    });

    expect(plainDoc).toContain('nao autoriza care real');
    expect(plainDoc).toContain('nao habilita care publico/oficial');
  });

  it('forbids protected personal conditions as pricing factors', () => {
    [
      'idade',
      'deficiencia',
      'morbidade',
      'condicao de saude',
      'necessidade de cuidado',
      'necessidade de acompanhante',
      'vulnerabilidade social',
      'capacidade reduzida de locomocao',
    ].forEach((forbiddenFactor) => {
      expect(plainDoc).toContain(forbiddenFactor);
    });
  });

  it('allows only objective operational cost components with evidence', () => {
    [
      'distancia',
      'tempo',
      'espera',
      'pedagio',
      'estacionamento',
      'categoria operacional do veiculo',
      'recurso fisico do veiculo realmente utilizado',
      'servico adicional contratado pelo passageiro',
      'custo regulatorio ou securitario comprovado',
      'incentivo promocional documentado',
    ].forEach((allowedComponent) => {
      expect(plainDoc).toContain(allowedComponent);
    });
  });

  it('requires minimum pricing evidence before operation', () => {
    [
      'formula de preco aplicavel',
      'ausencia de fator baseado em idade',
      'ausencia de fator baseado em deficiencia',
      'ausencia de fator baseado em morbidade',
      'ausencia de fator baseado em condicao de saude',
      'separacao entre custo operacional e perfil pessoal do passageiro',
      'exemplo de simulacao sem cobranca real',
      'comparacao com corrida convencional equivalente',
      'decisao juridica, administrativa ou tecnica registrada',
    ].forEach((requiredEvidence) => {
      expect(plainDoc).toContain(requiredEvidence);
    });
  });

  it('keeps the current result pending unless nondiscrimination is demonstrated', () => {
    expect(plainDoc).toContain('resultado atual: `pendente`');
    expect(plainDoc).toContain('pricing care sem discriminacao');
    expect(plainDoc).toContain('a decisao atual permanece `pendente`');
    expect(plainDoc).toContain('care permanece fail-closed');
  });

  it('forbids operational, production and pricing side effects', () => {
    [
      'alterar producao',
      'fazer deploy',
      'criar corrida care real',
      'acionar dispatcher real',
      'permitir aceite real',
      'cobrar tarifa care',
      'movimentar wallet',
      'fazer repasse',
      'alterar regra real de pricing',
      'criar taxa por idade, deficiencia, morbidade ou condicao de saude',
    ].forEach((forbiddenEffect) => {
      expect(plainDoc).toContain(forbiddenEffect);
    });
  });

  it('matches current fail-closed runtime evidence', () => {
    const readinessPolicy = readBackendFile('src/services/care/care-readiness-policy.ts');
    const adminShadowRoute = readBackendFile('src/routes/admin-care-shadow.ts');
    const ridesV2Route = readBackendFile('src/routes/rides-v2.ts');

    expect(readinessPolicy).toContain('CARE_SERVICE_NOT_AVAILABLE');
    expect(readinessPolicy).toContain('CARE_UNAVAILABLE_CODE');

    expect(adminShadowRoute).toMatch(/operationAllowed:\s*false/);
    expect(adminShadowRoute).toMatch(/dispatchAllowed:\s*false/);
    expect(adminShadowRoute).toMatch(/acceptanceAllowed:\s*false/);
    expect(adminShadowRoute).toMatch(/walletAllowed:\s*false/);

    const blockedCareIntentIndex = ridesV2Route.indexOf('rejectBlockedCareIntent');
    const transactionalCreateIndex = ridesV2Route.lastIndexOf('createRideWithRequirements');

    expect(blockedCareIntentIndex).toBeGreaterThanOrEqual(0);
    expect(transactionalCreateIndex).toBeGreaterThanOrEqual(0);
    expect(blockedCareIntentIndex).toBeLessThan(transactionalCreateIndex);
  });
});
