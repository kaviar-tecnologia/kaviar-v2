import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CARE-495 official flow contract', () => {
  const readDoc = () =>
    readFileSync('../docs/care/CARE-495-official-flow-contract.md', 'utf8');

  it('documents a contract without activating CARE or changing runtime', () => {
    const doc = readDoc();

    expect(doc).toContain('CARE-495 — Official CARE flow contract');
    expect(doc).toContain('não libera CARE oficial');
    expect(doc).toContain('não habilita CARE público');
    expect(doc).toContain('não altera backend/src');
    expect(doc).toContain('não altera runtime');
    expect(doc).toContain('não altera dispatcher');
    expect(doc).toContain('não altera aceite');
    expect(doc).toContain('não altera pricing');
    expect(doc).toContain('não altera wallet');
    expect(doc).toContain('não cria migration');
    expect(doc).toContain('não altera variáveis de produção');
    expect(doc).toContain('não faz deploy');
  });

  it('requires fail-closed operation and authenticated passenger context', () => {
    const doc = readDoc();

    expect(doc).toContain('fail-closed por padrão');
    expect(doc).toContain('nenhum uso de passengerId vindo do body para autorizar CARE');
    expect(doc).toContain('a autenticação do passageiro deve vir do contexto autenticado');
    expect(doc).toContain('se houver intenção CARE e o CARE não estiver liberado, bloquear fail-closed');
    expect(doc).toContain('CARE_SERVICE_NOT_AVAILABLE');
  });

  it('defines the official CARE stages before operational code', () => {
    const doc = readDoc();

    expect(doc).toContain('Entrada da solicitação');
    expect(doc).toContain('Gate de passageiro');
    expect(doc).toContain('Validação do tipo CARE');
    expect(doc).toContain('Território, município e seguro');
    expect(doc).toContain('Pricing e paridade');
    expect(doc).toContain('Elegibilidade do motorista');
    expect(doc).toContain('Capacidade do veículo');
    expect(doc).toContain('Dispatcher CARE');
    expect(doc).toContain('Aceite CARE');
    expect(doc).toContain('Wallet, split e settlement');
    expect(doc).toContain('Auditoria e observabilidade');
    expect(doc).toContain('Rollback');
  });

  it('keeps the first CARE scope minimal and non-discriminatory', () => {
    const doc = readDoc();

    expect(doc).toContain('CARE_ASSISTED simples');
    expect(doc).toContain('sem wheelchair adaptada');
    expect(doc).toContain('sem van adaptada');
    expect(doc).toContain('preço igual à corrida comum equivalente');
    expect(doc).toContain('não pode haver acréscimo por idade, deficiência ou morbidade');
    expect(doc).toContain('pricing CARE não pode afetar CAR_NORMAL, MOTO ou Premium');
  });

  it('requires dispatcher dry-run acceptance revalidation and wallet guard', () => {
    const doc = readDoc();

    expect(doc).toContain('dispatcher CARE deve começar em dry-run');
    expect(doc).toContain('dry-run registra o que teria sido ofertado sem oferta real');
    expect(doc).toContain('dispatcher não pode ofertar CARE inválido');
    expect(doc).toContain('aceite CARE deve revalidar passageiro, tipo CARE, território, município, seguro, motorista, veículo, pricing e wallet guard');
    expect(doc).toContain('wallet só pode executar depois de autorização oficial');
    expect(doc).toContain('settlement não pode ocorrer para CARE bloqueado');
  });

  it('records future sequence stop criteria audit and rollback requirements', () => {
    const doc = readDoc();

    expect(doc).toContain('#496 — matriz de riscos e motivos de bloqueio');
    expect(doc).toContain('#497 — shadow mode de elegibilidade, sem operação real');
    expect(doc).toContain('#498 — dispatcher CARE dry-run');
    expect(doc).toContain('#499 — aceite CARE dry-run');
    expect(doc).toContain('#500 — pricing/paridade CARE');
    expect(doc).toContain('#501 — wallet/settlement guard CARE');
    expect(doc).toContain('#502 — staging/piloto interno simulado');
    expect(doc).toContain('#503 — deploy escuro com tudo desligado');
    expect(doc).toContain('#504 — piloto interno real mínimo, se autorizado');
    expect(doc).toContain('toda decisão CARE precisa deixar rastro auditável');
    expect(doc).toContain('desligar flags deve voltar o CARE para bloqueio');
    expect(doc).toContain('qualquer erro financeiro deve parar avanço');
  });
});
