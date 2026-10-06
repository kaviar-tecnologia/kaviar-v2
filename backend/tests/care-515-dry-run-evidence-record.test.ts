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

describe('CARE-515 dry-run evidence record', () => {
  const doc = readRepoFile('docs/care/CARE-515-dry-run-evidence-record.md');
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

  it('does not execute or authorize real CARE', () => {
    expect(plainDoc).toContain('nao executa o dry-run');
    expect(plainDoc).toContain('nao autoriza care real');
    expect(plainDoc).toContain('nao altera estado operacional');
    expect(plainDoc).toContain('care permanece fail-closed');
  });

  it('requires the mandatory audit header', () => {
    for (const field of [
      'data e hora',
      'ambiente',
      'commit da main',
      'prs care considerados',
      'responsavel administrativo',
      'responsavel tecnico',
      'comandos ou fontes consultadas',
      'confirmacao de ausencia de deploy nao autorizado',
      'decisao final',
    ]) {
      expect(plainDoc).toContain(field);
    }
  });

  it('includes all CARE-514 dry-run checklist items', () => {
    for (const item of [
      'main e commit',
      'checks remotos',
      'ausencia de deploy',
      'typecheck',
      'testes care',
      'readiness admin',
      'flags fail-closed',
      'bloqueio de criacao',
      'dispatcher bloqueado',
      'aceite bloqueado',
      'wallet bloqueada',
      'territorio e regulacao',
      'seguro',
      'motorista e veiculo',
      'pricing sem discriminacao',
      'rollback',
      'decisao final',
    ]) {
      expect(plainDoc).toContain(item);
    }
  });

  it('blocks next phase on no-go or pending evidence', () => {
    expect(plainDoc).toContain('qualquer `no-go` bloqueia a proxima fase');
    expect(plainDoc).toContain('qualquer `pendente` mantem care bloqueado');
    expect(plainDoc).toContain('todos os itens devem confirmar ausencia de side effects');
  });

  it('continues the CARE-514 checklist chain', () => {
    const checklist = readRepoFile('docs/care/CARE-514-dry-run-execution-checklist.md');

    expect(checklist).toContain('CARE-514');
    expect(plainDoc).toContain('checklist care-514');
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
