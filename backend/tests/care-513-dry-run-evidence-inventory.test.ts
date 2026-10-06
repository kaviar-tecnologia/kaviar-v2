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

describe('CARE-513 dry-run evidence inventory', () => {
  const doc = readRepoFile('docs/care/CARE-513-dry-run-evidence-inventory.md');
  const plainDoc = normalize(doc);

  it('keeps CARE fail-closed', () => {
    for (const marker of [
      'CARE_SERVICE_NOT_AVAILABLE',
      'CARE_REQUIREMENTS_MISSING',
      'releaseReady=false',
      'publicCareAvailable=false',
      'officialCareAvailable=false',
      'operationAllowed=false',
      'dispatchAllowed=false',
      'acceptanceAllowed=false',
      'walletAllowed=false',
    ]) {
      expect(doc).toContain(marker);
    }
  });

  it('defines the dry-run as read-only and non-operational', () => {
    expect(plainDoc).toContain('somente read-only');
    expect(plainDoc).toContain('nao autoriza care publico, care oficial');
    expect(plainDoc).toContain('nao habilita care publico ou oficial');
  });

  it('covers the minimum evidence inventory', () => {
    for (const item of [
      'github',
      'readiness admin read-only',
      'care-508',
      'care-510',
      'care-511',
      'care-512',
      'passageiro',
      'territorio',
      'seguro',
      'motorista',
      'veiculo',
      'pricing',
      'dispatcher',
      'aceite',
      'wallet',
      'observabilidade',
      'rollback',
    ]) {
      expect(plainDoc).toContain(item);
    }
  });

  it('forbids side effects and real CARE execution', () => {
    for (const forbiddenAction of [
      'criar corrida real',
      'chamar dispatcher real',
      'oferecer corrida a motorista',
      'permitir aceite real',
      'gerar cobranca',
      'movimentar wallet',
      'disparar pagamento',
    ]) {
      expect(plainDoc).toContain(forbiddenAction);
    }
  });

  it('requires pricing evidence without discrimination', () => {
    expect(plainDoc).toContain('pricing sem discriminacao');
    expect(plainDoc).toContain('idade');
    expect(plainDoc).toContain('deficiencia');
    expect(plainDoc).toContain('morbidade');
  });

  it('matches current runtime fail-closed evidence', () => {
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
