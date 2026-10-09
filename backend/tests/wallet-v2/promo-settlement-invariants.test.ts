import { describe, expect, it } from 'vitest';
import { assertPromoSettlementAmounts } from
  '../../src/services/wallet-v2/promo-settlement-invariants';

describe('Integridade financeira do bônus permanente', () => {
  it('aceita taxa integralmente subsidiada', () => {
    expect(() => assertPromoSettlementAmounts({
      feeAmountCents: 1800n,
      subsidizedCents: 1800n,
      collectedCents: 0n,
      pendingCents: 0n,
    })).not.toThrow();
  });

  it('aceita subsídio parcial e arrecadação', () => {
    expect(() => assertPromoSettlementAmounts({
      feeAmountCents: 1800n,
      subsidizedCents: 1200n,
      collectedCents: 600n,
      pendingCents: 0n,
    })).not.toThrow();
  });

  it('aceita subsídio parcial com cobrança pendente', () => {
    expect(() => assertPromoSettlementAmounts({
      feeAmountCents: 1800n,
      subsidizedCents: 1200n,
      collectedCents: 400n,
      pendingCents: 200n,
    })).not.toThrow();
  });

  it('preserva liquidação convencional sem bônus', () => {
    expect(() => assertPromoSettlementAmounts({
      feeAmountCents: 1800n,
      subsidizedCents: 0n,
      collectedCents: 1800n,
      pendingCents: 0n,
    })).not.toThrow();
  });

  it('rejeita soma superior à taxa', () => {
    expect(() => assertPromoSettlementAmounts({
      feeAmountCents: 1800n,
      subsidizedCents: 1200n,
      collectedCents: 800n,
      pendingCents: 0n,
    })).toThrow('PROMO_SETTLEMENT_AMOUNT_MISMATCH');
  });

  it('rejeita soma inferior à taxa', () => {
    expect(() => assertPromoSettlementAmounts({
      feeAmountCents: 1800n,
      subsidizedCents: 1200n,
      collectedCents: 500n,
      pendingCents: 0n,
    })).toThrow('PROMO_SETTLEMENT_AMOUNT_MISMATCH');
  });

  it('rejeita valores negativos', () => {
    expect(() => assertPromoSettlementAmounts({
      feeAmountCents: 1800n,
      subsidizedCents: -100n,
      collectedCents: 1900n,
      pendingCents: 0n,
    })).toThrow('PROMO_SETTLEMENT_NEGATIVE_AMOUNT');
  });

  it('aceita todos os valores zerados', () => {
    expect(() => assertPromoSettlementAmounts({
      feeAmountCents: 0n,
      subsidizedCents: 0n,
      collectedCents: 0n,
      pendingCents: 0n,
    })).not.toThrow();
  });
});
