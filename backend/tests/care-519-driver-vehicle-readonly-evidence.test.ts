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

describe('CARE-519 driver and vehicle read-only evidence', () => {
  const doc = readRepoFile('docs/care/CARE-519-driver-vehicle-readonly-evidence.md');
  const plainDoc = normalize(doc);

  it('defines the RJ candidate composition without authorizing operation', () => {
    expect(plainDoc).toContain('gestora territorial candidata: fernanda');
    expect(plainDoc).toContain('motorista candidato: aparecido');
    expect(plainDoc).toContain('territorio candidato: rio de janeiro');
    expect(plainDoc).toContain('veiculo candidato: pendente de evidencia read-only');
    expect(plainDoc).toContain('nao autoriza care real');
    expect(plainDoc).toContain('nao habilita care publico/oficial');
  });

  it('keeps CARE fail-closed', () => {
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
  });

  it('requires read-only driver evidence', () => {
    [
      'identificador do motorista no sistema',
      'nome administrativo conferido',
      'status ativo',
      'documentos obrigatorios aprovados',
      'vinculo territorial com o territorio candidato',
      'ausencia de bloqueio operacional',
      'somente simulacao care',
      'nao gera corrida, aceite, pagamento ou repasse',
    ].forEach((requiredEvidence) => {
      expect(plainDoc).toContain(requiredEvidence);
    });
  });

  it('requires read-only vehicle evidence', () => {
    [
      'identificador do veiculo no sistema',
      'vinculo do veiculo com o motorista candidato',
      'status ativo ou pendente documentado',
      'placa/modelo/categoria',
      'capacidade minima',
      'restricoes conhecidas',
      'nenhuma capacidade especial sera presumida sem evidencia',
    ].forEach((requiredEvidence) => {
      expect(plainDoc).toContain(requiredEvidence);
    });
  });

  it('keeps the current result pending unless evidence is sufficient', () => {
    expect(plainDoc).toContain('resultado atual: `pendente`');
    expect(plainDoc).toContain('faltam evidencias read-only do cadastro real');
    expect(plainDoc).toContain('a decisao atual permanece `pendente`');
    expect(plainDoc).toContain('care permanece fail-closed');
  });

  it('forbids operational and production side effects', () => {
    [
      'alterar producao',
      'fazer deploy',
      'criar corrida care real',
      'acionar dispatcher real',
      'permitir aceite real',
      'cobrar tarifa care',
      'movimentar wallet',
      'fazer repasse',
      'alterar cadastro de motorista',
      'alterar cadastro de veiculo',
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
