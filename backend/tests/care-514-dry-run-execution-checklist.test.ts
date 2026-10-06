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

describe('CARE-514 dry-run execution checklist', () => {
  const doc = readRepoFile('docs/care/CARE-514-dry-run-execution-checklist.md');
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

  it('keeps the checklist read-only and non-operational', () => {
    expect(plainDoc).toContain('somente read-only');
    expect(plainDoc).toContain('nao autoriza care publico');
    expect(plainDoc).toContain('nao habilita care publico ou oficial');
    expect(plainDoc).toContain('nao executa nem autoriza operacao real');
  });

  it('requires all dry-run execution checkpoints', () => {
    for (const checkpoint of [
      'confirmar main e commit',
      'confirmar checks remotos',
      'confirmar ausencia de deploy',
      'rodar typecheck',
      'rodar testes care',
      'coletar readiness admin',
      'verificar flags fail-closed',
      'verificar bloqueio de criacao',
      'verificar dispatcher bloqueado',
      'verificar aceite bloqueado',
      'verificar wallet bloqueada',
      'verificar territorio e regulacao',
      'verificar seguro',
      'verificar motorista e veiculo',
      'verificar pricing sem discriminacao',
      'registrar rollback',
      'registrar decisao final',
    ]) {
      expect(plainDoc).toContain(checkpoint);
    }
  });

  it('requires auditable execution evidence for each checkpoint', () => {
    for (const field of [
      'data e hora',
      'ambiente',
      'commit',
      'responsavel',
      'comando ou fonte consultada',
      'evidencia observada',
      'resultado: go, no-go ou pendente',
      'motivo do resultado',
      'confirmacao de ausencia de side effects',
    ]) {
      expect(plainDoc).toContain(field);
    }
  });

  it('blocks next phase on no-go or pending results', () => {
    expect(plainDoc).toContain('qualquer no-go bloqueia a proxima fase');
    expect(plainDoc).toContain('qualquer pendente mantem care bloqueado');
    expect(plainDoc).toContain('a proxima fase exige pr proprio');
    expect(plainDoc).toContain('autorizacao expressa');
  });

  it('continues the CARE-513 inventory chain', () => {
    const inventory = readRepoFile('docs/care/CARE-513-dry-run-evidence-inventory.md');

    expect(inventory).toContain('CARE-513');
    expect(plainDoc).toContain('inventario care-513');
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
