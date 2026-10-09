/**
 * Regras de elegibilidade financeira para indicações KAVIAR.
 * Não executa pagamentos nem altera saldos.
 */

export interface ReferralRecharge {
  payment_provider: string;
  status: string;
  amount_cents: bigint;
}

export const REFERRAL_MIN_RECHARGE_CENTS = 2000n;

export interface ReferralDriver {
  status: string;
  suspended_at: Date | null;
  banned_at: Date | null;
  deleted_at: Date | null;
}

export function isEligibleReferralDriver(
  driver: ReferralDriver
): boolean {
  return (
    ['approved', 'active'].includes(driver.status) &&
    driver.suspended_at === null &&
    driver.banned_at === null &&
    driver.deleted_at === null
  );
}


export function isQualifyingReferralRecharge(
  recharge: ReferralRecharge
): boolean {
  return (
    recharge.payment_provider === 'sumup' &&
    recharge.status === 'confirmed' &&
    recharge.amount_cents >= REFERRAL_MIN_RECHARGE_CENTS
  );
}
