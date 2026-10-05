import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

describe('CARE-496 risk and blocking reason matrix', () => {
  const readDoc = () =>
    readFileSync('../docs/care/CARE-496-risk-blocking-matrix.md', 'utf8');

  it('documents the risk matrix without activating CARE or changing runtime', () => {
    const doc = readDoc();

    expect(doc).toContain('CARE-496 — Risk and blocking reason matrix');
    expect(doc).toContain('não libera CARE oficial');
    expect(doc).toContain('não habilita CARE público');
    expect(doc).toContain('não altera backend/src');
    expect(doc).toContain('não altera runtime');
    expect(doc).toContain('não altera dispatcher');
    expect(doc).toContain('não altera aceite');
    expect(doc).toContain('não altera pricing');
    expect(doc).toContain('não altera wallet');
    expect(doc).toContain('não cria migration');
    expect(doc).toContain('não faz deploy');
  });

  it('requires clear columns severity actions stop criteria and mandatory tests', () => {
    const doc = readDoc();

    expect(doc).toContain('etapa do fluxo');
    expect(doc).toContain('risco identificado');
    expect(doc).toContain('motivo interno de bloqueio');
    expect(doc).toContain('severidade');
    expect(doc).toContain('ação esperada');
    expect(doc).toContain('critério de parada');
    expect(doc).toContain('teste obrigatório');
    expect(doc).toContain('Sem motivo interno claro, o CARE não deve avançar');
    expect(doc).toContain('Sem teste obrigatório, o CARE não deve avançar');
  });

  it('keeps the public code unavailable while defining internal blocking reasons', () => {
    const doc = readDoc();

    expect(doc).toContain('CARE_SERVICE_NOT_AVAILABLE');
    expect(doc).toContain('CARE_BODY_PASSENGER_ID_IGNORED');
    expect(doc).toContain('PASSENGER_ID_MISSING');
    expect(doc).toContain('ALLOWLIST_UNAVAILABLE');
    expect(doc).toContain('PASSENGER_ALLOWLISTED_BUT_OFFICIAL_FLOW_NOT_IMPLEMENTED');
    expect(doc).toContain('CARE_ALLOWLIST_MISUSED_AS_RELEASE');
  });

  it('covers type territory city insurance and non-discriminatory pricing risks', () => {
    const doc = readDoc();

    expect(doc).toContain('CARE_TYPE_NOT_SUPPORTED');
    expect(doc).toContain('CARE_WHEELCHAIR_OUT_OF_INITIAL_PILOT');
    expect(doc).toContain('CARE_VAN_OUT_OF_INITIAL_PILOT');
    expect(doc).toContain('CARE_TERRITORY_NOT_ALLOWED');
    expect(doc).toContain('CARE_CITY_NOT_ALLOWED');
    expect(doc).toContain('CARE_INSURANCE_NOT_CONFIRMED');
    expect(doc).toContain('CARE_PRICE_PARITY_FAILED');
    expect(doc).toContain('CARE_DISCRIMINATORY_PRICE_RISK');
  });

  it('covers driver vehicle dispatcher acceptance and wallet blockers', () => {
    const doc = readDoc();

    expect(doc).toContain('CARE_DRIVER_NOT_VERIFIED');
    expect(doc).toContain('CARE_DRIVER_NOT_QUALIFIED');
    expect(doc).toContain('CARE_VEHICLE_NOT_CAPABLE');
    expect(doc).toContain('CARE_DISPATCH_NOT_DRY_RUN');
    expect(doc).toContain('CARE_DISPATCH_INVALID_OFFER_ATTEMPT');
    expect(doc).toContain('CARE_ACCEPTANCE_REVALIDATION_FAILED');
    expect(doc).toContain('CARE_WALLET_GUARD_FAILED');
    expect(doc).toContain('CARE_SETTLEMENT_BLOCKED');
    expect(doc).toContain('CARE_PAYOUT_NOT_AUTHORIZED');
  });

  it('defines global stop rules future sequence and acceptance criteria', () => {
    const doc = readDoc();

    expect(doc).toContain('qualquer alteração em backend/src sem PR específico autorizado');
    expect(doc).toContain('qualquer deploy não autorizado');
    expect(doc).toContain('qualquer teste financeiro falhando');
    expect(doc).toContain('qualquer regressão em CAR_NORMAL');
    expect(doc).toContain('qualquer oferta CARE inválida no dispatcher');
    expect(doc).toContain('qualquer aceite sem revalidação');
    expect(doc).toContain('#497 — shadow mode de elegibilidade, sem operação real');
    expect(doc).toContain('#498 — dispatcher CARE dry-run');
    expect(doc).toContain('#499 — aceite CARE dry-run');
    expect(doc).toContain('#500 — pricing/paridade CARE');
    expect(doc).toContain('#501 — wallet/settlement guard CARE');
    expect(doc).toContain('#504 — piloto interno real mínimo, se autorizado');
    expect(doc).toContain('a matriz não autoriza CARE oficial');
    expect(doc).toContain('a matriz não altera runtime');
  });
});
