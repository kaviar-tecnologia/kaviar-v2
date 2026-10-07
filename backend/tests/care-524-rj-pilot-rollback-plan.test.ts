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

describe('CARE-524 RJ pilot rollback plan', () => {
  const doc = readRepoFile('docs/care/CARE-524-rj-pilot-rollback-plan.md');
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

  it('defines the pilot as RJ-first while preserving national expansion', () => {
    expect(plainDoc).toContain('rio de janeiro/rj');
    expect(plainDoc).toContain('care_assisted');
    expect(plainDoc).toContain('expansao progressiva em municipios de todo o brasil');
    expect(plainDoc).toContain('avaliacao propria');
  });

  it('defines immediate rollback triggers and containment', () => {
    for (const item of [
      'elegibilidade do motorista',
      'compatibilidade do veiculo',
      'cobertura securitaria',
      'duvida regulatoria',
      'tarifa discriminatoria',
      'oferta para motorista nao elegivel',
      'aceite sem revalidacao',
      'wallet',
      'settlement',
      'erro tecnico critico',
      'na duvida, prevalece o bloqueio',
    ]) {
      expect(plainDoc).toContain(item);
    }

    expect(plainDoc).toContain('impedir novas solicitacoes care');
    expect(plainDoc).toContain('impedir novos despachos care');
    expect(plainDoc).toContain('impedir novos aceites care');
  });

  it('protects conventional products from CARE rollback', () => {
    for (const product of [
      'car_normal',
      'moto',
      'premium',
      'pricing convencional',
      'wallet convencional',
    ]) {
      expect(plainDoc).toContain(product);
    }

    expect(plainDoc).toContain('o rollback care deve ser isolado');
  });

  it('forbids automatic financial reversal and real financial side effects', () => {
    expect(plainDoc).toContain('rollback tecnico nao autoriza reversao financeira automatica');
    expect(plainDoc).toContain('nao gerar estorno automatico');
    expect(plainDoc).toContain('nao gerar cobranca compensatoria automatica');
    expect(plainDoc).toContain('nao disparar pagamento');
  });

  it('preserves evidence instead of deleting incident data', () => {
    for (const evidence of [
      'identificador da corrida',
      'identificador da oferta',
      'territorio',
      'motorista',
      'veiculo',
      'requisitos care',
      'pricing',
      'settlement',
      'eventos de wallet',
      'logs',
      'auditoria',
    ]) {
      expect(plainDoc).toContain(evidence);
    }

    expect(plainDoc).toContain('o rollback nao deve apagar evidencias');
  });

  it('requires a fresh authorization before reactivation and deploy', () => {
    expect(plainDoc).toContain('autorizacao expressa para ativacao');
    expect(plainDoc).toContain('autorizacao expressa separada para deploy');
    expect(plainDoc).toContain(
      'autorizacao anterior para documentacao, teste, investigacao ou dry-run nao vale como autorizacao de reativacao',
    );
  });

  it('does not authorize operational CARE or production changes', () => {
    for (const forbiddenAction of [
      'ativar care publico',
      'ativar care oficial',
      'criar corrida care real',
      'chamar dispatcher real',
      'ofertar corrida real',
      'permitir aceite real',
      'alterar flags em producao',
      'movimentar wallet',
      'gerar cobranca',
      'fazer estorno automatico',
      'fazer repasse',
      'disparar pagamento',
      'alterar producao',
      'fazer deploy',
    ]) {
      expect(plainDoc).toContain(forbiddenAction);
    }
  });

  it('matches the current fail-closed runtime evidence', () => {
    const readiness = readBackendFile('src/services/care/care-readiness-policy.ts');
    const adminShadow = readBackendFile('src/routes/admin-care-shadow.ts');

    expect(readiness).toContain('CARE_SERVICE_NOT_AVAILABLE');
    expect(readiness).toContain('CARE_UNAVAILABLE_CODE');

    expect(adminShadow).toMatch(/releaseReady:\s*false/);
    expect(adminShadow).toMatch(/publicCareAvailable:\s*false/);
    expect(adminShadow).toMatch(/officialCareAvailable:\s*false/);
    expect(adminShadow).toMatch(/operationAllowed:\s*false/);
    expect(adminShadow).toMatch(/dispatchAllowed:\s*false/);
    expect(adminShadow).toMatch(/acceptanceAllowed:\s*false/);
    expect(adminShadow).toMatch(/walletAllowed:\s*false/);
  });
});
