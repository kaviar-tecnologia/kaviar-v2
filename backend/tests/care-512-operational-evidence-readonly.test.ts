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

const expectInOrder = (source: string, labels: string[]) => {
  let cursor = -1;

  for (const label of labels) {
    const index = source.indexOf(label);
    expect(index, `Missing ordered section: ${label}`).toBeGreaterThan(cursor);
    cursor = index;
  }
};

describe('CARE-512 operational evidence read-only contract', () => {
  const doc = readRepoFile('docs/care/CARE-512-operational-evidence-readonly.md');
  const plainDoc = normalize(doc);

  it('keeps CARE blocked while evidence is read-only', () => {
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

  it('defines ordered read-only evidence gates', () => {
    expectInOrder(plainDoc, [
      '## decisao',
      '## estado atual',
      '## principio read-only',
      '## criterio 1',
      '## criterio 2',
      '## criterio 3',
      '## criterio 4',
      '## criterio 5',
      '## fora de escopo',
      '## seguranca',
    ]);
  });

  it('forbids side effects and real CARE execution', () => {
    expect(plainDoc).toContain('sem alterar estado');
    expect(plainDoc).toContain('sem criar corrida real');
    expect(plainDoc).toContain('sem acionar dispatcher');
    expect(plainDoc).toContain('sem aceitar motorista');
    expect(plainDoc).toContain('sem movimentar wallet');
    expect(plainDoc).toContain('sem gerar pagamento');
    expect(plainDoc).toContain('nao autoriza operacao');
  });

  it('keeps the PR outside runtime, schema, deploy and production', () => {
    expect(plainDoc).toContain('nao altera codigo operacional');
    expect(plainDoc).toContain('nao altera schema prisma');
    expect(plainDoc).toContain('nao cria migration');
    expect(plainDoc).toContain('nao faz deploy');
    expect(plainDoc).toContain('nao altera producao');
    expect(plainDoc).toContain('nao habilita care publico');
    expect(plainDoc).toContain('nao habilita care oficial');
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
