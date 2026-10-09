export interface PromoFeeAllocation {
  feeCents: bigint;
  promoCents: bigint;
  cashCents: bigint;
}

export function allocatePromoFee(
  feeCents: bigint,
  availablePromoCents: bigint
): PromoFeeAllocation {
  if (feeCents < 0n || availablePromoCents < 0n) {
    throw new Error('INVALID_PROMO_ALLOCATION_AMOUNT');
  }

  const promoCents =
    availablePromoCents < feeCents
      ? availablePromoCents
      : feeCents;

  const cashCents = feeCents - promoCents;

  if (
    promoCents + cashCents !== feeCents ||
    promoCents < 0n ||
    cashCents < 0n
  ) {
    throw new Error('PROMO_ALLOCATION_INVARIANT');
  }

  return {
    feeCents,
    promoCents,
    cashCents,
  };
}
