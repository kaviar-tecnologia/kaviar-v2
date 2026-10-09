import { describe, expect, it } from 'vitest';
import {
  isQualifyingReferralRecharge,
} from '../../src/services/wallet-v2/referral-eligibility';

describe('KAVIAR — elegibilidade de recargas para indicação', () => {
  const recharge = {
    payment_provider: 'sumup',
    status: 'confirmed',
    amount_cents: 2000n,
  };

  it('aceita recarga SumUp confirmada de R$ 20', () => {
    expect(isQualifyingReferralRecharge(recharge)).toBe(true);
  });

  it('aceita recarga confirmada acima de R$ 20', () => {
    expect(isQualifyingReferralRecharge({
      ...recharge,
      amount_cents: 5000n,
    })).toBe(true);
  });

  it('recusa recarga de R$ 19,99', () => {
    expect(isQualifyingReferralRecharge({
      ...recharge,
      amount_cents: 1999n,
    })).toBe(false);
  });

  it('recusa pagamento pendente', () => {
    expect(isQualifyingReferralRecharge({
      ...recharge,
      status: 'pending',
    })).toBe(false);
  });

  it('recusa pagamento expirado', () => {
    expect(isQualifyingReferralRecharge({
      ...recharge,
      status: 'expired',
    })).toBe(false);
  });

  it('recusa créditos de outro provedor', () => {
    expect(isQualifyingReferralRecharge({
      ...recharge,
      payment_provider: 'manual',
    })).toBe(false);
  });
});

describe('KAVIAR — elegibilidade do motorista indicado', () => {
  const driver = {
    status: 'approved',
    suspended_at: null,
    banned_at: null,
    deleted_at: null,
  };

  it('aprova motorista aprovado', async () => {
    const { isEligibleReferralDriver } =
      await import('../../src/services/wallet-v2/referral-eligibility');
    expect(isEligibleReferralDriver(driver)).toBe(true);
  });

  it('aprova motorista ativo', async () => {
    const { isEligibleReferralDriver } =
      await import('../../src/services/wallet-v2/referral-eligibility');
    expect(isEligibleReferralDriver({ ...driver, status: 'active' })).toBe(true);
  });

  it('bloqueia motorista suspenso', async () => {
    const { isEligibleReferralDriver } =
      await import('../../src/services/wallet-v2/referral-eligibility');
    expect(isEligibleReferralDriver({
      ...driver,
      suspended_at: new Date(),
    })).toBe(false);
  });

  it('bloqueia motorista banido', async () => {
    const { isEligibleReferralDriver } =
      await import('../../src/services/wallet-v2/referral-eligibility');
    expect(isEligibleReferralDriver({
      ...driver,
      banned_at: new Date(),
    })).toBe(false);
  });

  it('bloqueia motorista excluído', async () => {
    const { isEligibleReferralDriver } =
      await import('../../src/services/wallet-v2/referral-eligibility');
    expect(isEligibleReferralDriver({
      ...driver,
      deleted_at: new Date(),
    })).toBe(false);
  });

  it('bloqueia motorista pendente', async () => {
    const { isEligibleReferralDriver } =
      await import('../../src/services/wallet-v2/referral-eligibility');
    expect(isEligibleReferralDriver({
      ...driver,
      status: 'pending',
    })).toBe(false);
  });
});
