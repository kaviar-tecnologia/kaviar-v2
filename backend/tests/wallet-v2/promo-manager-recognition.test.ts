import { describe, expect, it } from 'vitest';
import { calculatePromoManagerRecognition } from
  '../../src/services/wallet-v2/promo-manager-recognition';

describe('KAVIAR — comissão contratual com boas-vindas', () => {
  it('preserva 40% da taxa integral com subsídio parcial', () => {
    const result = calculatePromoManagerRecognition(
      450n, 150n, 300n, 0n, 4000
    );

    expect(result.managerShareCents).toBe(180n);
    expect(result.kaviarShareCents).toBe(270n);
    expect(result.kaviarCashAfterManagerCents).toBe(-30n);
  });

  it('preserva 40% sem utilização de bônus', () => {
    const result = calculatePromoManagerRecognition(
      450n, 450n, 0n, 0n, 4000
    );

    expect(result.managerShareCents).toBe(180n);
    expect(result.kaviarCashAfterManagerCents).toBe(270n);
  });

  it('mantém a comissão quando a taxa é toda subsidiada', () => {
    const result = calculatePromoManagerRecognition(
      450n, 0n, 450n, 0n, 4000
    );

    expect(result.managerShareCents).toBe(180n);
    expect(result.kaviarCashAfterManagerCents).toBe(-180n);
  });

  it('área de sombra não gera comissão de gestor', () => {
    const result = calculatePromoManagerRecognition(
      450n, 150n, 300n, 0n, 0
    );

    expect(result.managerShareCents).toBe(0n);
    expect(result.kaviarShareCents).toBe(450n);
    expect(result.kaviarCashAfterManagerCents).toBe(150n);
  });

  it('rejeita valores que não fecham a taxa total', () => {
    expect(() => calculatePromoManagerRecognition(
      450n, 150n, 200n, 0n, 4000
    )).toThrow('PROMO_SETTLEMENT_AMOUNT_MISMATCH');
  });

  it('rejeita valores financeiros negativos', () => {
    expect(() => calculatePromoManagerRecognition(
      450n, -1n, 451n, 0n, 4000
    )).toThrow('PROMO_SETTLEMENT_NEGATIVE_AMOUNT');
  });

  it('rejeita percentuais inválidos', () => {
    for (const rate of [-1, 10001, 40.5]) {
      expect(() => calculatePromoManagerRecognition(
        450n, 150n, 300n, 0n, rate
      )).toThrow('PROMO_MANAGER_INVALID_RATE');
    }
  });

  it('reconhece R$ 1,40 e deixa R$ 0,40 pendentes', () => {
    const initial = calculatePromoManagerRecognition(
      450n, 50n, 300n, 100n, 4000
    );

    expect(initial.managerShareCents).toBe(180n);
    expect(initial.managerRecognizedCents).toBe(140n);
    expect(initial.managerPendingCents).toBe(40n);

    // Depois da quitação de R$ 1,00.
    const resolved = calculatePromoManagerRecognition(
      450n, 150n, 300n, 0n, 4000
    );

    expect(resolved.managerShareCents).toBe(180n);
    expect(resolved.managerRecognizedCents).toBe(180n);
    expect(resolved.managerPendingCents).toBe(0n);

    // Apenas a diferença deve ser reconhecida na quitação.
    expect(
      resolved.managerRecognizedCents -
      initial.managerRecognizedCents
    ).toBe(40n);
  });

  it('gestor inelegível não recebe comissão promocional', () => {
    const result = calculatePromoManagerRecognition(
      450n, 50n, 300n, 100n, 0
    );

    expect(result.managerShareCents).toBe(0n);
    expect(result.managerRecognizedCents).toBe(0n);
    expect(result.managerPendingCents).toBe(0n);
  });

});
