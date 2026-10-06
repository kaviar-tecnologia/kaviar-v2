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

describe('CARE-516 filled read-only dry-run evidence', () => {
  const doc = readRepoFile('docs/care/CARE-516-dry-run-evidence-filled.md');
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

  it('records the current dry-run header evidence', () => {
    expect(doc).toContain('f5e5904b1901a1949bd750f15cafa6bae75d576e');
    expect(doc).toContain('f5e5904b docs(care): add dry-run evidence record (#515)');
    expect(plainDoc).toContain('dry-run interno read-only');
    expect(plainDoc).toContain('deploy para head');
    expect(plainDoc).toContain('nenhum encontrado');
    expect(plainDoc).toContain('decisao final');
    expect(plainDoc).toContain('`pendente`');
  });

  it('links the merged governance chain from CARE-512 through CARE-515', () => {
    for (const marker of [
      '#512',
      '#513',
      '#514',
      '#515',
      'bbb999ead7bf543f915770f9395ad04362356327',
      '8d5b3758d0e8cff33b0bf7c470733cffd70b8827',
      'f49ce40cb535bc930517ee70699f36e26aad0e8b',
      'f5e5904b1901a1949bd750f15cafa6bae75d576e',
    ]) {
      expect(doc).toContain(marker);
    }
  });

  it('records green local validation without treating it as release approval', () => {
    expect(plainDoc).toContain('typecheck');
    expect(plainDoc).toContain('sem erro');
    expect(plainDoc).toContain('11 arquivos, 61 testes passaram');
    expect(plainDoc).toContain('nao autoriza care publico/oficial');
  });

  it('keeps the final dry-run decision pending until operational read-only evidence exists', () => {
    for (const pendingEvidence of [
      'readiness admin coletado de ambiente autorizado',
      'territorio alvo do piloto',
      'regulacao municipal do territorio alvo',
      'confirmacao administrativa do seguro aplicavel',
      'passageiro de teste autorizado',
      'motorista elegivel',
      'veiculo compativel',
      'pricing simulado sem discriminacao',
      'dispatcher simulado sem chamada real',
      'aceite simulado sem oferta real',
      'wallet guard validado sem movimentacao',
      'rollback operacional documentado para o piloto',
    ]) {
      expect(plainDoc).toContain(pendingEvidence);
    }

    expect(plainDoc).toContain('resultado do dry-run read-only preenchido: `pendente`');
    expect(plainDoc).toContain('care permanece fail-closed');
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
