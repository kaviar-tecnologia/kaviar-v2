/**
 * Treasury Health Service.
 *
 * Calculates available Asaas balance vs upcoming obligations.
 */

import { Pool } from 'pg';
import { OutboundPaymentProvider, Money } from './types';
import { validateAccountOwnership } from './account-preflight';

export interface TreasuryHealth {
  /** null means the provider balance could not be verified, never zero by fallback. */
  providerBalanceCents: bigint | null;
  approvedObligationsCents: bigint;
  reservedObligationsCents: bigint;
  inTransitCents: bigint;
  blockedObligationsCents: bigint;
  dueNext7DaysCents: bigint;
  dueNext30DaysCents: bigint;
  bufferCents: bigint | null;
  deficitCents: bigint | null;
  accountOwnershipConfirmed: boolean;
  providerAvailable: boolean;
}

export async function calculateTreasuryHealth(
  pool: Pool,
  provider: OutboundPaymentProvider,
): Promise<TreasuryHealth> {
  const [balance, approved, reserved, inTransit, blocked, due7, due30] = await Promise.all([
    provider.getAvailableBalance().catch(() => null),
    sumObligationsByStatus(pool, ['APPROVED', 'SCHEDULED']),
    sumObligationsByStatus(pool, ['RESERVED', 'QUEUED', 'RETRYABLE_FAILURE']),
    sumObligationsByStatus(pool, ['SUBMITTING', 'SUBMITTED', 'PROCESSING']),
    // Blocked work remains economically committed, but is not labelled
    // 'in transit' on the dashboard; it needs independent reconciliation.
    sumObligationsByStatus(pool, ['BLOCKED', 'BLOCKED_POLICY_REVIEW']),
    sumDueWithinDays(pool, 7),
    sumDueWithinDays(pool, 30),
  ]);

  // A SumUp recharge is a driver wallet liability, NOT available Asaas cash.
  // Do not infer Asaas funding from wallet_recharges, driver_wallets or ledgers.
  const validBalance = (value: Money | null): value is Money =>
    value !== null && value.currency === 'BRL' &&
    typeof value.amountCents === 'bigint' && value.amountCents >= 0n;
  const providerAvail = await provider.validateAvailability().catch(() => ({ available: false }));
  const providerAvailable = validBalance(balance) && providerAvail.available === true;
  const verifiedBalance = providerAvailable ? balance.amountCents : null;
  const totalCommitted = approved + reserved + inTransit + blocked;
  const deficit = verifiedBalance === null ? null :
    totalCommitted > verifiedBalance ? totalCommitted - verifiedBalance : 0n;

  let ownershipConfirmed = false;
  if (provider.providerName === 'asaas' && provider.getAccountStatus) {
    const account = await provider.getAccountStatus().catch(() => null);
    ownershipConfirmed = validateAccountOwnership(account).passed;
  }

  return {
    providerBalanceCents: verifiedBalance,
    approvedObligationsCents: approved,
    reservedObligationsCents: reserved,
    inTransitCents: inTransit,
    blockedObligationsCents: blocked,
    dueNext7DaysCents: due7,
    dueNext30DaysCents: due30,
    bufferCents: verifiedBalance === null ? null : verifiedBalance > totalCommitted ? verifiedBalance - totalCommitted : 0n,
    deficitCents: deficit,
    accountOwnershipConfirmed: ownershipConfirmed,
    providerAvailable,
  };
}

async function sumObligationsByStatus(pool: Pool, statuses: string[]): Promise<bigint> {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(net_amount_cents), 0) as total FROM financial_obligations WHERE status = ANY($1)`,
    [statuses]
  );
  return BigInt(rows[0].total);
}

async function sumDueWithinDays(pool: Pool, days: number): Promise<bigint> {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(net_amount_cents), 0) as total FROM financial_obligations
     WHERE due_date IS NOT NULL AND due_date <= CURRENT_DATE + CAST($1 AS INTEGER)
       AND status NOT IN ('PAID', 'FAILED', 'CANCELLED')`,
    [days]
  );
  return BigInt(rows[0].total);
}
