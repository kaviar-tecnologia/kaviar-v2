/**
 * Fee calculation helper for Wallet V2.
 *
 * Derives from PLATFORM_FEE_PERCENT (monetary.ts) — the single source of
 * truth for the platform fee rate. These functions provide convenience
 * wrappers using Number arithmetic for wallet reserve estimates.
 *
 * For authoritative BigInt calculations (settlement, fee-split, ledger),
 * use applyBasisPoints() from monetary.ts directly.
 */

import { PLATFORM_FEE_PERCENT } from '../finance/territory/monetary';

export function calculateFeeCents(finalPriceCents: number): number {
  return Math.round(finalPriceCents * PLATFORM_FEE_PERCENT / 100);
}

export function estimateFeeCentsFromPrice(priceReais: number): number {
  return Math.round(priceReais * 100 * PLATFORM_FEE_PERCENT / 100);
}
