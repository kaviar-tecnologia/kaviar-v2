/**
 * Treasury Health Service.
 *
 * Calculates available Asaas balance vs upcoming obligations.
 */

import { Pool } from 'pg';
import { OutboundPaymentProvider } from './types';

export interface TreasuryHealth {
  providerBalanceCents: bigint;
  approvedObligationsCents: bigint;
  reservedObligationsCents: bigint;
  inTransitCents: bigint;
  dueNext7DaysCents: bigint;
  dueNext30DaysCents: bigint;
  bufferCents: bigint;
  deficitCents: bigint;
  accountOwnershipConfirmed: boolean;
  providerAvailable: boolean;
}

export async function calculateTreasuryHealth(
  pool: Pool,
  provider: OutboundPaymentProvider,
): Promise<TreasuryHealth> {
  const [balance, approved, reserved, inTransit, due7, due30] = await Promise.all([
    provider.getAvailableBalance().catch(() => ({ amountCents: 0n, currency: 'BRL' })),
    sumObligationsByStatus(pool, ['APPROVED', 'SCHEDULED']),
    sumObligationsByStatus(pool, ['RESERVED', 'QUEUED']),
    sumObligationsByStatus(pool, ['SUBMITTING', 'SUBMITTED', 'PROCESSING']),
    sumDueWithinDays(pool, 7),
    sumDueWithinDays(pool, 30),
  ]);

  const totalCommitted = approved + reserved + inTransit;
  const deficit = totalCommitted > balance.amountCents ? totalCommitted - balance.amountCents : 0n;

  const providerAvail = await provider.validateAvailability().catch(() => ({ available: false }));
  const ownershipConfirmed = process.env.ASAAS_PAYOUT_ACCOUNT_OWNERSHIP_CONFIRMED === 'true';

  return {
    providerBalanceCents: balance.amountCents,
    approvedObligationsCents: approved,
    reservedObligationsCents: reserved,
    inTransitCents: inTransit,
    dueNext7DaysCents: due7,
    dueNext30DaysCents: due30,
    bufferCents: balance.amountCents > totalCommitted ? balance.amountCents - totalCommitted : 0n,
    deficitCents: deficit,
    accountOwnershipConfirmed: ownershipConfirmed,
    providerAvailable: providerAvail.available,
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
