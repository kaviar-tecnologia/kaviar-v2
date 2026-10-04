import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CARE-494 professional execution playbook', () => {
  it('documents the professional CARE execution strategy without activating CARE', () => {
    const doc = readFileSync('../docs/care/CARE-494-professional-execution-playbook.md', 'utf8');

    expect(doc).toContain('CARE-494 — Professional execution playbook');
    expect(doc).toContain('não libera CARE oficial');
    expect(doc).toContain('não habilita CARE público');
    expect(doc).toContain('não altera runtime');
    expect(doc).toContain('não altera dispatcher');
    expect(doc).toContain('não altera aceite');
    expect(doc).toContain('não altera pricing');
    expect(doc).toContain('não altera wallet');
    expect(doc).toContain('não cria migration');
    expect(doc).toContain('não altera variáveis de produção');
    expect(doc).toContain('não faz deploy');
  });

  it('requires slow layered execution and rejects Frankenstein implementation', () => {
    const doc = readFileSync('../docs/care/CARE-494-professional-execution-playbook.md', 'utf8');

    expect(doc).toContain('avançar bem devagar, em camadas');
    expect(doc).toContain('produto regulado dentro do sistema');
    expect(doc).toContain('Frankenstein');
    expect(doc).toContain('Não misturar dispatcher, aceite, pricing e wallet no mesmo PR');
    expect(doc).toContain('dispatcher + aceite + pricing + wallet + app + deploy no mesmo pacote');
  });

  it('keeps production inactive and requires separate authorization', () => {
    const doc = readFileSync('../docs/care/CARE-494-professional-execution-playbook.md', 'utf8');

    expect(doc).toContain('Não deve haver deploy do CARE ativo.');
    expect(doc).toContain('Não deve haver tentativa de liberar botão público.');
    expect(doc).toContain('produção continua sem CARE ativo');
    expect(doc).toContain('qualquer liberação futura exige autorização separada');
  });

  it('requires matrix shadow mode blockers rollback and minimum pilot before operation', () => {
    const doc = readFileSync('../docs/care/CARE-494-professional-execution-playbook.md', 'utf8');

    expect(doc).toContain('Criar uma matriz de fluxo oficial CARE');
    expect(doc).toContain('CARE shadow mode');
    expect(doc).toContain('Criar motivos oficiais de bloqueio');
    expect(doc).toContain('Liberar apenas piloto mínimo');
    expect(doc).toContain('rollback pronto');
    expect(doc).toContain('Para tudo se');
  });

  it('preserves normal rides wallet dispatcher acceptance and pricing from premature CARE coupling', () => {
    const doc = readFileSync('../docs/care/CARE-494-professional-execution-playbook.md', 'utf8');

    expect(doc).toContain('rides-v2 continua sendo o fluxo principal');
    expect(doc).toContain('CARE entra por adaptadores/serviços próprios');
    expect(doc).toContain('CAR_NORMAL não saber demais sobre CARE');
    expect(doc).toContain('MOTO não ser afetado');
    expect(doc).toContain('Premium não ser afetado');
    expect(doc).toContain('wallet não assumir corrida inválida');
    expect(doc).toContain('dispatcher não oferecer corrida sem elegibilidade');
  });

  it('records the intended future sequence from 494 to 504', () => {
    const doc = readFileSync('../docs/care/CARE-494-professional-execution-playbook.md', 'utf8');

    expect(doc).toContain('#494 — relatório executivo/técnico do checkpoint CARE atual');
    expect(doc).toContain('#495 — contrato técnico oficial do fluxo CARE');
    expect(doc).toContain('#496 — matriz de riscos e motivos de bloqueio');
    expect(doc).toContain('#497 — shadow mode de elegibilidade, sem operação real');
    expect(doc).toContain('#498 — dispatcher CARE dry-run');
    expect(doc).toContain('#499 — aceite CARE dry-run');
    expect(doc).toContain('#500 — pricing/paridade CARE');
    expect(doc).toContain('#501 — wallet/settlement guard CARE');
    expect(doc).toContain('#502 — staging/piloto interno simulado');
    expect(doc).toContain('#503 — deploy escuro com tudo desligado');
    expect(doc).toContain('#504 — piloto interno real mínimo, se autorizado');
  });
});
