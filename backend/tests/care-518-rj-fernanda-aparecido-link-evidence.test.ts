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

describe('CARE-518 RJ / Fernanda / Aparecido link evidence', () => {
  const doc = readRepoFile('docs/care/CARE-518-rj-fernanda-aparecido-link-evidence.md');
  const plainDoc = normalize(doc);

  it('defines the corrected candidate pilot composition', () => {
    expect(plainDoc).toContain('territorio candidato: rio de janeiro');
    expect(plainDoc).toContain('gestora territorial candidata: fernanda');
    expect(plainDoc).toContain('motorista candidato: aparecido');
    expect(plainDoc).toContain('mesmo escopo operacional');
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

  it('requires evidence that manager, driver and territory are linked', () => {
    [
      'territorio exato do aparecido',
      'fernanda e a gestora territorial desse mesmo territorio',
      'aparecido e motorista cadastrado nesse mesmo territorio',
      'cadastro do motorista esta ativo',
      'documentos do motorista estao aptos',
      'existe veiculo cadastrado para o motorista',
      'veiculo e compativel',
      'seguro app pode ser aplicado',
      'regulacao local permite',
      'passageiro de teste esta autorizado',
    ].forEach((requiredEvidence) => {
      expect(plainDoc).toContain(requiredEvidence);
    });
  });

  it('blocks go decisions based only on assumption or conversation', () => {
    expect(plainDoc).toContain('nao pode ser considerado `go` por presuncao');
    expect(plainDoc).toContain('memoria');
    expect(plainDoc).toContain('conversa');
    expect(plainDoc).toContain('intencao operacional');
    expect(plainDoc).toContain('evidencia precisa ser registrada por leitura de sistema');
  });

  it('keeps the current result pending', () => {
    expect(plainDoc).toContain('resultado atual: `pendente`');
    expect(plainDoc).toContain('a decisao atual permanece `pendente`');
    expect(plainDoc).toContain('care permanece fail-closed');
  });

  it('forbids production, deploy and operational side effects', () => {
    [
      'alterar producao',
      'fazer deploy',
      'criar corrida care real',
      'acionar dispatcher real',
      'permitir aceite real',
      'cobrar tarifa care',
      'movimentar wallet',
      'fazer repasse',
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
