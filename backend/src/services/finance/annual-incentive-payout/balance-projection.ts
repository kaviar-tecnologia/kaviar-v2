/**
 * Balance Projection for Annual Incentive Payout.
 *
 * Calculates available balance per program_year from ledger events.
 * Convention: amount_cents is always positive; semantics determined by event_type.
 *
 * Formula per year:
 *   accrued = SUM(amount_cents) WHERE event_type IN ('ACCRUAL', 'CARRY_FORWARD_IN')
 *   reversed = SUM(amount_cents) WHERE event_type = 'REVERSAL'
 *   paid = SUM(amount_cents) WHERE event_type = 'PAYMENT'
 *   openReserved = SUM(REQUEST_RESERVATION) - SUM(RELEASE) - SUM(PAYMENT linked to reservation)
 *   available = accrued - reversed - paid - openReserved
 *
 * IMPORTANT: This uses absolute values. The migration CHECK constraint ensures amount_cents != 0
 * but does NOT enforce sign convention. The existing code stores ACCRUAL as positive.
 * We rely on event_type for semantics, not on the sign of amount_cents.
 */

import { Pool, PoolClient } from 'pg';
import {
  BalanceProjection,
  BalanceProjectionByYear,
  FifoAllocation,
  PAYOUT_ERRORS,
} from './types';

type Queryable = Pick<Pool | PoolClient, 'query'>;

/**
 * Projects balance for a driver across all program years.
 * Can be called within a transaction (PoolClient) or standalone (Pool).
 */
export async function projectBalance(
  db: Queryable,
  driverId: string,
): Promise<BalanceProjection> {
  const { rows } = await db.query<{
    program_year: number;
    event_type: string;
    total_cents: string; // bigint comes as string from pg
  }>(
    `SELECT program_year, event_type, SUM(ABS(amount_cents)) AS total_cents
     FROM annual_incentive_ledger
     WHERE driver_id = $1
     GROUP BY program_year, event_type
     ORDER BY program_year ASC`,
    [driverId]
  );

  return projectFromAggregateRows(driverId, rows);
}

/**
 * Pure projection function. Given pre-aggregated rows (program_year, event_type, total_cents),
 * produces a BalanceProjection. Reusable for single-driver and multi-driver aggregation
 * without N+1 queries.
 */
export function projectFromAggregateRows(
  driverId: string,
  rows: Array<{ program_year: number; event_type: string; total_cents: string }>,
): BalanceProjection {

  // Group by year
  const yearMap = new Map<number, {
    accrued: bigint;
    reversed: bigint;
    paid: bigint;
    reserved: bigint;
    released: bigint;
  }>();

  for (const row of rows) {
    const year = row.program_year;
    if (!yearMap.has(year)) {
      yearMap.set(year, { accrued: 0n, reversed: 0n, paid: 0n, reserved: 0n, released: 0n });
    }
    const entry = yearMap.get(year)!;
    const cents = BigInt(row.total_cents);

    switch (row.event_type) {
      case 'ACCRUAL':
      case 'CARRY_FORWARD_IN':
        entry.accrued += cents;
        break;
      case 'REVERSAL':
      case 'CARRY_FORWARD_OUT':
        entry.reversed += cents;
        break;
      case 'PAYMENT':
        entry.paid += cents;
        break;
      case 'REQUEST_RESERVATION':
        entry.reserved += cents;
        break;
      case 'RELEASE':
        entry.released += cents;
        break;
    }
  }

  const byYear: BalanceProjectionByYear[] = [];
  let totalAccrued = 0n;
  let totalReversed = 0n;
  let totalPaid = 0n;
  let totalOpenReserved = 0n;
  let totalAvailable = 0n;

  for (const [year, data] of yearMap) {
    const openReserved = data.reserved - data.released - data.paid;
    const effectiveReserved = openReserved > 0n ? openReserved : 0n;
    const available = data.accrued - data.reversed - data.paid - effectiveReserved;
    const effectiveAvailable = available > 0n ? available : 0n;

    byYear.push({
      programYear: year,
      accruedCents: data.accrued,
      reversedCents: data.reversed,
      paidCents: data.paid,
      openReservedCents: effectiveReserved,
      availableCents: effectiveAvailable,
    });

    totalAccrued += data.accrued;
    totalReversed += data.reversed;
    totalPaid += data.paid;
    totalOpenReserved += effectiveReserved;
    totalAvailable += effectiveAvailable;
  }

  // Sort by year ascending (FIFO order)
  byYear.sort((a, b) => a.programYear - b.programYear);

  return {
    driverId,
    byYear,
    totalAccruedCents: totalAccrued,
    totalReversedCents: totalReversed,
    totalPaidCents: totalPaid,
    totalOpenReservedCents: totalOpenReserved,
    totalAvailableCents: totalAvailable,
  };
}

/**
 * Allocates requested amount using FIFO (oldest year first).
 * Returns allocations per program_year.
 * Throws if insufficient balance.
 */
export function allocateFifo(
  byYear: BalanceProjectionByYear[],
  requestedCents: bigint,
): FifoAllocation[] {
  if (requestedCents <= 0n) {
    throw Object.assign(
      new Error('Requested amount must be positive'),
      { code: PAYOUT_ERRORS.INVALID_AMOUNT }
    );
  }

  let remaining = requestedCents;
  const allocations: FifoAllocation[] = [];

  // Process years from oldest to newest (already sorted)
  for (const year of byYear) {
    if (remaining <= 0n) break;
    if (year.availableCents <= 0n) continue;

    const alloc = remaining <= year.availableCents ? remaining : year.availableCents;
    allocations.push({ programYear: year.programYear, amountCents: alloc });
    remaining -= alloc;
  }

  if (remaining > 0n) {
    throw Object.assign(
      new Error('Insufficient balance for requested amount'),
      { code: PAYOUT_ERRORS.INSUFFICIENT_BALANCE }
    );
  }

  return allocations;
}
