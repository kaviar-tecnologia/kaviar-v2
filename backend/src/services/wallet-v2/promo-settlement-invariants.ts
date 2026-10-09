export interface PromoSettlementAmounts {
  feeAmountCents: bigint;
  subsidizedCents: bigint;
  collectedCents: bigint;
  pendingCents: bigint;
}

export function assertPromoSettlementAmounts(
  values: PromoSettlementAmounts
): void {
  const {
    feeAmountCents,
    subsidizedCents,
    collectedCents,
    pendingCents,
  } = values;

  if (
    feeAmountCents < 0n ||
    subsidizedCents < 0n ||
    collectedCents < 0n ||
    pendingCents < 0n
  ) {
    throw new Error('PROMO_SETTLEMENT_NEGATIVE_AMOUNT');
  }

  if (
    subsidizedCents + collectedCents + pendingCents !==
    feeAmountCents
  ) {
    throw new Error('PROMO_SETTLEMENT_AMOUNT_MISMATCH');
  }
}
