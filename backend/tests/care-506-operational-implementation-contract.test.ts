import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CARE-506 operational implementation contract', () => {
  const readDoc = () =>
    readFileSync('../docs/care/CARE-506-operational-implementation-contract.md', 'utf8');

  it('documents the final operational implementation contract without activating CARE', () => {
    const doc = readDoc();

    expect(doc).toContain('CARE-506 — contrato técnico final de implementação operacional CARE');
    expect(doc).toContain('somente documental e de teste');
    expect(doc).toContain('não libera CARE oficial');
    expect(doc).toContain('não habilita CARE público');
    expect(doc).toContain('não altera backend/src');
    expect(doc).toContain('não altera runtime');
    expect(doc).toContain('não altera dispatcher');
    expect(doc).toContain('não altera aceite');
    expect(doc).toContain('não altera pricing');
    expect(doc).toContain('não altera wallet');
    expect(doc).toContain('não altera flags');
    expect(doc).toContain('não cria migration');
    expect(doc).toContain('não altera produção');
    expect(doc).toContain('não faz deploy');
  });

  it('keeps the current CARE decision fail-closed', () => {
    const doc = readDoc();

    expect(doc).toContain('O CARE oficial continua bloqueado.');
    expect(doc).toContain('releaseReady=false');
    expect(doc).toContain('publicCareAvailable=false');
    expect(doc).toContain('officialCareAvailable=false');
    expect(doc).toContain('operationAllowed=false');
    expect(doc).toContain('dispatchAllowed=false');
    expect(doc).toContain('acceptanceAllowed=false');
    expect(doc).toContain('walletAllowed=false');
    expect(doc).toContain('CARE_SERVICE_NOT_AVAILABLE');
    expect(doc).toContain('Este contrato não autoriza ativação, deploy, flags em produção, operação real, oferta real, aceite real, pricing real, wallet CARE ou settlement CARE.');
  });

  it('defines required contracts for every future operational component', () => {
    const doc = readDoc();

    for (const section of [
      'Contrato 1 — entrada pública e criação transacional',
      'Contrato 2 — gate de passageiro e flags',
      'Contrato 3 — tipo CARE e requisitos',
      'Contrato 4 — território, município e seguro',
      'Contrato 5 — pricing e paridade',
      'Contrato 6 — elegibilidade do motorista e veículo',
      'Contrato 7 — dispatcher CARE',
      'Contrato 8 — aceite CARE',
      'Contrato 9 — wallet, split e settlement',
      'Contrato 10 — auditoria, observabilidade e suporte',
      'Contrato 11 — rollback',
    ]) {
      expect(doc).toContain(section);
    }
  });

  it('requires separation of future PRs and forbids mixing critical systems', () => {
    const doc = readDoc();

    expect(doc).toContain('A implementação operacional futura deve ser dividida em PRs pequenos e auditáveis');
    expect(doc).toContain('criação transacional CARE ainda bloqueada por flag');
    expect(doc).toContain('dispatcher CARE dry-run sem oferta real');
    expect(doc).toContain('aceite CARE dry-run sem assignment real');
    expect(doc).toContain('pricing CARE com paridade e não discriminação');
    expect(doc).toContain('wallet e settlement guard');
    expect(doc).toContain('deploy escuro com tudo desligado');
    expect(doc).toContain('Nenhum PR futuro deve misturar dispatcher, aceite, pricing, wallet, app e deploy no mesmo pacote.');
  });

  it('requires non-discriminatory pricing insurance territory driver vehicle and rollback tests', () => {
    const doc = readDoc();

    expect(doc).toContain('não pode haver acréscimo por idade, deficiência ou mobilidade reduzida');
    expect(doc).toContain('seguro genérico não pode ser tratado automaticamente como evidência suficiente');
    expect(doc).toContain('território, município e seguro devem ser revalidados antes da oferta e antes do aceite');
    expect(doc).toContain('motorista comum não recebe oferta CARE');
    expect(doc).toContain('troca de veículo ou placa exige nova validação');
    expect(doc).toContain('dry-run não cria oferta real');
    expect(doc).toContain('dry-run não cria assignment real');
    expect(doc).toContain('wallet não executa para CARE bloqueado');
    expect(doc).toContain('desligar flags deve bloquear novas solicitações CARE');
  });

  it('records global stop criteria and minimum activation criteria', () => {
    const doc = readDoc();

    expect(doc).toContain('teste financeiro falhando');
    expect(doc).toContain('regressão de `CAR_NORMAL`');
    expect(doc).toContain('oferta CARE inválida no dispatcher');
    expect(doc).toContain('aceite sem revalidação');
    expect(doc).toContain('wallet executando para CARE bloqueado');
    expect(doc).toContain('settlement para CARE bloqueado');
    expect(doc).toContain('pricing discriminatório');
    expect(doc).toContain('deploy sem autorização explícita');
    expect(doc).toContain('autorização expressa para ativação');
    expect(doc).toContain('autorização expressa separada para deploy');
  });

  it('keeps source flags and readiness policy fail-closed', () => {
    const flags = readFileSync('src/services/care/care-feature-flags.ts', 'utf8');
    const readiness = readFileSync('src/services/care/care-readiness-policy.ts', 'utf8');

    expect(flags).toContain('CARE_PUBLIC_REQUEST_ENABLED: false');
    expect(flags).toContain('CARE_OFFICIAL_ENABLED: false');
    expect(flags).toContain('CARE_DISPATCH_ENABLED: false');
    expect(flags).toContain('CARE_DRIVER_ACCEPTANCE_ENABLED: false');

    expect(readiness).toContain('CARE_SERVICE_NOT_AVAILABLE');
    expect(readiness).toContain('CARE_OFFICIAL_BLOCKED_PENDING_INTEGRATION');
  });
});
