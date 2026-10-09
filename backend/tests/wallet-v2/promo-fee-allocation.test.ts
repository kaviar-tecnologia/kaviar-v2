import { describe, expect, it } from 'vitest';
import { allocatePromoFee } from '../../src/services/wallet-v2/promo-fee-allocation';

describe('Distribuição da taxa com bônus promocional', () => {
  it('bônus cobre integralmente a taxa', () => {
    expect(allocatePromoFee(900n, 2000n)).toEqual({
      feeCents: 900n,
      promoCents: 900n,
      cashCents: 0n,
    });
  });

  it('bônus cobre parcialmente a taxa', () => {
    expect(allocatePromoFee(1500n, 1100n)).toEqual({
      feeCents: 1500n,
      promoCents: 1100n,
      cashCents: 400n,
    });
  });

  it('sem bônus, toda a taxa é financeira', () => {
    expect(allocatePromoFee(900n, 0n)).toEqual({
      feeCents: 900n,
      promoCents: 0n,
      cashCents: 900n,
    });
  });

  it('taxa zero não consome bônus', () => {
    expect(allocatePromoFee(0n, 2000n)).toEqual({
      feeCents: 0n,
      promoCents: 0n,
      cashCents: 0n,
    });
  });

  it('bônus exatamente igual à taxa', () => {
    expect(allocatePromoFee(2000n, 2000n)).toEqual({
      feeCents: 2000n,
      promoCents: 2000n,
      cashCents: 0n,
    });
  });

  it('rejeita valores negativos', () => {
    expect(() => allocatePromoFee(-1n, 2000n))
      .toThrow('INVALID_PROMO_ALLOCATION_AMOUNT');

    expect(() => allocatePromoFee(900n, -1n))
      .toThrow('INVALID_PROMO_ALLOCATION_AMOUNT');
  });

  it('não utiliza bônus acima do valor da taxa', () => {
    const result = allocatePromoFee(500n, 5000n);

    expect(result.promoCents).toBe(500n);
    expect(result.cashCents).toBe(0n);
    expect(result.promoCents + result.cashCents)
      .toBe(result.feeCents);
  });
});
