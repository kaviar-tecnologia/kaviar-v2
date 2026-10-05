import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CARE-505 official release gap report', () => {
  const readDoc = () =>
    readFileSync('../docs/care/CARE-505-official-release-gap-report.md', 'utf8');

  it('documents the gap report without activating CARE or changing runtime', () => {
    const doc = readDoc();

    expect(doc).toContain('CARE-505 — relatório de lacunas técnicas para liberar CARE oficial');
    expect(doc).toContain('somente documental e de teste');
    expect(doc).toContain('não libera CARE oficial');
    expect(doc).toContain('não habilita CARE público');
    expect(doc).toContain('não altera backend/src');
    expect(doc).toContain('não altera runtime');
    expect(doc).toContain('não altera dispatcher');
    expect(doc).toContain('não altera aceite');
    expect(doc).toContain('não altera pricing');
    expect(doc).toContain('não altera wallet');
    expect(doc).toContain('não cria migration');
    expect(doc).toContain('não altera produção');
    expect(doc).toContain('não faz deploy');
  });

  it('keeps the current official CARE decision fail-closed', () => {
    const doc = readDoc();

    expect(doc).toContain('O CARE ainda não está pronto para liberação oficial.');
    expect(doc).toContain('releaseReady=false');
    expect(doc).toContain('publicCareAvailable=false');
    expect(doc).toContain('officialCareAvailable=false');
    expect(doc).toContain('operationAllowed=false');
    expect(doc).toContain('dispatchAllowed=false');
    expect(doc).toContain('acceptanceAllowed=false');
    expect(doc).toContain('walletAllowed=false');
    expect(doc).toContain('CARE_SERVICE_NOT_AVAILABLE');
    expect(doc).toContain('Mesmo que todas as release flags estejam ligadas');
  });

  it('covers all critical gaps before official release', () => {
    const doc = readDoc();

    for (const section of [
      'Entrada pública do passageiro',
      'Gate de passageiro e flags',
      'Tipo CARE inicial',
      'Território, município e seguro',
      'Pricing e paridade não discriminatória',
      'Elegibilidade do motorista',
      'Capacidade do veículo',
      'Dispatcher CARE',
      'Aceite CARE',
      'Wallet, split e settlement',
      'Auditoria e observabilidade',
      'Rollback',
    ]) {
      expect(doc).toContain(section);
    }
  });

  it('requires mandatory tests for dispatcher acceptance pricing wallet and rollback', () => {
    const doc = readDoc();

    expect(doc).toContain('teste de dry-run sem oferta real');
    expect(doc).toContain('teste de revalidação completa no aceite');
    expect(doc).toContain('teste de paridade com corrida comum equivalente');
    expect(doc).toContain('teste de ausência de acréscimo discriminatório');
    expect(doc).toContain('teste de wallet bloqueado para CARE não autorizado');
    expect(doc).toContain('teste de settlement bloqueado');
    expect(doc).toContain('teste de flags desligadas bloqueando CARE');
    expect(doc).toContain('teste de `CAR_NORMAL`, moto e Premium preservados');
  });

  it('records global stop criteria and non-authorization of production activation', () => {
    const doc = readDoc();

    expect(doc).toContain('teste financeiro falhando');
    expect(doc).toContain('regressão de `CAR_NORMAL`');
    expect(doc).toContain('dispatcher ofertando CARE inválido');
    expect(doc).toContain('aceite sem revalidação');
    expect(doc).toContain('wallet executando para CARE bloqueado');
    expect(doc).toContain('pricing discriminatório');
    expect(doc).toContain('deploy sem autorização explícita');
    expect(doc).toContain('Este relatório não autoriza ativação, deploy, flags em produção, operação real, oferta real, aceite real, pricing real ou wallet CARE.');
  });

  it('keeps source flags and readiness policy fail-closed', () => {
    const flags = readFileSync('src/services/care/care-feature-flags.ts', 'utf8');
    const readiness = readFileSync('src/services/care/care-readiness-policy.ts', 'utf8');

    expect(flags).toContain('CARE_PUBLIC_REQUEST_ENABLED: false');
    expect(flags).toContain('CARE_OFFICIAL_ENABLED: false');
    expect(flags).toContain('CARE_DISPATCH_ENABLED: false');
    expect(flags).toContain('CARE_DRIVER_ACCEPTANCE_ENABLED: false');

    expect(readiness).toContain("CARE_SERVICE_NOT_AVAILABLE");
    expect(readiness).toContain('CARE_OFFICIAL_BLOCKED_PENDING_INTEGRATION');
  });
});
