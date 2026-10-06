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

describe('CARE-520 insurance and regulation read-only evidence', () => {
  const doc = readRepoFile('docs/care/CARE-520-insurance-regulation-readonly-evidence.md');
  const plainDoc = normalize(doc);

  it('defines insurance and regulation as required read-only evidence', () => {
    expect(plainDoc).toContain('seguro app: existente');
    expect(plainDoc).toContain('aplicabilidade ao piloto care pendente de evidencia especifica');
    expect(plainDoc).toContain('regulacao local: pendente de evidencia read-only');
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

  it('requires minimum insurance evidence', () => {
    [
      'existencia do seguro app contratado',
      'documento, apolice ou contrato administrativo aplicavel',
      'vigencia',
      'cobertura territorial',
      'cobertura para passageiro',
      'cobertura para motorista',
      'exclusoes conhecidas',
      'uso care esta dentro do escopo',
      'endosso, aditivo ou seguro especifico',
      'decisao juridica ou administrativa',
    ].forEach((requiredEvidence) => {
      expect(plainDoc).toContain(requiredEvidence);
    });
  });

  it('requires minimum local regulation evidence', () => {
    [
      'municipio ou area exata do piloto',
      'regra municipal aplicavel',
      'exigencias de motorista',
      'exigencias de veiculo',
      'cadastro, autorizacao ou comunicacao',
      'transporte assistido, idoso, pcd ou acompanhante',
      'ausencia de proibicao conhecida',
      'e-mail, protocolo, lei, decreto, regulamento ou checklist administrativo',
    ].forEach((requiredEvidence) => {
      expect(plainDoc).toContain(requiredEvidence);
    });
  });

  it('does not treat insurance or regulation as presumed approvals', () => {
    expect(plainDoc).toContain('seguro app existente nao equivale automaticamente');
    expect(plainDoc).toContain('regulacao municipal presumida nao equivale');
    expect(plainDoc).toContain('resultado atual: `pendente`');
    expect(plainDoc).toContain('a decisao atual permanece `pendente`');
    expect(plainDoc).toContain('care permanece fail-closed');
  });

  it('forbids operational, production and unsupported legal assumptions', () => {
    [
      'alterar producao',
      'fazer deploy',
      'criar corrida care real',
      'acionar dispatcher real',
      'permitir aceite real',
      'cobrar tarifa care',
      'movimentar wallet',
      'fazer repasse',
      'assumir cobertura de seguro sem evidencia',
      'assumir autorizacao regulatoria sem evidencia',
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
