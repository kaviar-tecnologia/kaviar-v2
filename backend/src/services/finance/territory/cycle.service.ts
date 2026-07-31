/**
 * Territory Payout Cycle Service (Marco 3.2A).
 *
 * Lifecycle:
 *   previewCycle → confirmRegularCycle → CALCULATED → UNDER_REVIEW → APPROVED → ...
 *   confirmSupplementalCycle → CALCULATED (positive delta only)
 *
 * Source of truth: territory_ledger (immutable entries).
 * All amounts in BigInt cents.
 */

import { Pool, PoolClient } from 'pg';
import { applyBasisPoints, MANAGER_COMMISSION_RATE_BPS, PLATFORM_FEE_RATE_BPS } from './monetary';
import { assertOutboundEngine, isMonthOutbound, isValidReferenceMonth } from './engine-selection';

const POLICY_VERSION = 'territorial_commission_v1';
const COMPETENCE_TIMEZONE = 'America/Sao_Paulo';

// ═══════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════

export type CycleStatus =
  | 'CALCULATED' | 'UNDER_REVIEW' | 'APPROVED'
  | 'OBLIGATION_CREATED' | 'PAYMENT_PROCESSING' | 'PAID'
  | 'BLOCKED' | 'BLOCKED_NEGATIVE_ADJUSTMENT' | 'CANCELLED';

export interface TerritoryPayoutCycle {
  id: string;
  territoryId: string;
  managerId: string | null;
  referenceMonth: string;
  policyVersion: string;
  commissionRateBasisPoints: number;
  platformFeeRateBasisPoints: number;
  cycleType: 'REGULAR' | 'SUPPLEMENTAL';
  parentCycleId: string | null;
  sequenceNumber: number;
  grossPlatformFeeCents: bigint;
  grossManagerCommissionCents: bigint;
  approvedAdjustmentsCents: bigint;
  approvedAmountCents: bigint;
  status: CycleStatus;
  fiscalDocumentRequired: boolean;
  fiscalDocumentStatus: string;
  approvedAt: Date | null;
  approvedBy: string | null;
  calculatedAt: Date | null;
  createdAt: Date;
}

export interface CyclePreview {
  territoryId: string;
  managerId: string | null;
  referenceMonth: string;
  grossPlatformFeeCents: bigint;
  grossManagerCommissionCents: bigint;
  approvedAmountCents: bigint;
  entryCount: number;
  status: 'CALCULATED' | 'BLOCKED';
  divergences: Array<{ rideId: string; reason: string }>;
  rateHomogeneous: boolean;
  mixedRates?: Array<{ platform_fee_rate_bps: number; manager_commission_rate_bps: number }>;
  canConfirm: boolean;
  confirmBlockers: string[];
}

interface LedgerEntry {
  id: string;
  ride_id: string;
  entry_type: string;
  amount_cents: string;
  manager_assignment_id: string | null;
}

interface RateSnapshot {
  platformFeeRateBps: number;
  managerCommissionRateBps: number;
}

// ═══════════════════════════════════════════════════════════════
// PREVIEW (read-only, no persistence)
// ═══════════════════════════════════════════════════════════════

export async function previewCycle(
  pool: Pool,
  territoryId: string,
  referenceMonth: string,
  managerId: string | null,
): Promise<CyclePreview> {
  if (!isValidReferenceMonth(referenceMonth)) {
    throw Object.assign(new Error('Invalid reference_month'), { code: 'TERRITORY_CYCLE_INVALID_MONTH' });
  }
  if (!isMonthOutbound(referenceMonth)) {
    throw Object.assign(new Error('Month not eligible for outbound'), { code: 'TERRITORY_CYCLE_MONTH_NOT_OUTBOUND' });
  }

  const entries = await getUnallocatedEntries(pool, territoryId, managerId, referenceMonth);
  const divergences = await checkReconciliation(pool, territoryId, managerId, referenceMonth);
  const rates = await checkRateHomogeneity(pool, territoryId, managerId, referenceMonth);
  const blockers: string[] = [];

  if (entries.length === 0) blockers.push('NO_UNALLOCATED_ENTRIES');
  if (divergences.length > 0) blockers.push('LEDGER_DIVERGENCE');
  if (!rates.homogeneous) blockers.push('MIXED_RATES');

  let grossPlatformFee = 0n, grossCommission = 0n;
  for (const e of entries) {
    if (e.entry_type === 'platform_fee') grossPlatformFee += BigInt(e.amount_cents);
    if (e.entry_type === 'fee_share') grossCommission += BigInt(e.amount_cents);
  }

  if (grossCommission < 0n || grossPlatformFee < 0n) blockers.push('NEGATIVE_ADJUSTMENT_UNSUPPORTED');

  // Check fiscal profile
  if (managerId) {
    try { await resolveFiscalProfile(pool, managerId, territoryId); }
    catch { blockers.push('FISCAL_PROFILE_MISSING'); }
  }

  // Check cancelled BLOCKED
  const { rows: cancelled } = await pool.query(
    `SELECT id FROM territory_payout_cycles WHERE territory_id=$1
     AND manager_id IS NOT DISTINCT FROM $2 AND reference_month=$3
     AND cycle_type='REGULAR' AND status='CANCELLED'`, [territoryId, managerId, referenceMonth]);
  if (cancelled.length > 0) blockers.push('BLOCKED_CANCELLED_EXISTS');

  const status: 'CALCULATED' | 'BLOCKED' = managerId ? 'CALCULATED' : 'BLOCKED';

  return {
    territoryId, managerId, referenceMonth,
    grossPlatformFeeCents: grossPlatformFee,
    grossManagerCommissionCents: grossCommission,
    approvedAmountCents: status === 'CALCULATED' && blockers.length === 0 ? grossCommission : 0n,
    entryCount: entries.length,
    status,
    divergences,
    rateHomogeneous: rates.homogeneous,
    mixedRates: rates.homogeneous ? undefined : rates.rates,
    canConfirm: blockers.length === 0 && entries.length > 0,
    confirmBlockers: blockers,
  };
}

// ═══════════════════════════════════════════════════════════════
// CONFIRM REGULAR CYCLE
// ═══════════════════════════════════════════════════════════════

export async function confirmRegularCycle(
  pool: Pool,
  territoryId: string,
  referenceMonth: string,
  managerId: string | null,
): Promise<TerritoryPayoutCycle> {
  assertOutboundEngine();
  if (!isValidReferenceMonth(referenceMonth)) {
    throw Object.assign(new Error('Invalid reference_month'), { code: 'TERRITORY_CYCLE_INVALID_MONTH' });
  }
  if (!isMonthOutbound(referenceMonth)) {
    throw Object.assign(new Error('Month not eligible'), { code: 'TERRITORY_CYCLE_MONTH_NOT_OUTBOUND' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await acquireCycleLock(client, territoryId, managerId, referenceMonth);

    // Idempotency: check existing REGULAR (non-cancelled)
    const existing = await getActiveRegular(client, territoryId, managerId, referenceMonth);
    if (existing) { await client.query('COMMIT'); return existing; }

    // Check for cancelled BLOCKED — fail closed
    const { rows: cancelledRows } = await client.query(
      `SELECT id FROM territory_payout_cycles WHERE territory_id=$1
       AND manager_id IS NOT DISTINCT FROM $2 AND reference_month=$3
       AND cycle_type='REGULAR' AND status='CANCELLED'`, [territoryId, managerId, referenceMonth]);
    if (cancelledRows.length > 0) {
      await client.query('ROLLBACK');
      throw Object.assign(new Error('A cancelled BLOCKED cycle exists for this period'),
        { code: 'TERRITORY_CYCLE_BLOCKED_CANCELLED' });
    }

    const entries = await getUnallocatedEntriesInClient(client, territoryId, managerId, referenceMonth);

    // No empty cycles
    if (entries.length === 0) {
      await client.query('ROLLBACK');
      throw Object.assign(new Error('No unallocated entries'), { code: 'TERRITORY_CYCLE_NO_UNALLOCATED_ENTRIES' });
    }

    // Per-entry negative check (before aggregation and reconciliation)
    assertNoNegativeCycleEntries(entries);

    const cycleStatus = managerId ? 'CALCULATED' : 'BLOCKED';

    let grossPlatformFee = 0n, grossCommission = 0n;
    for (const e of entries) {
      if (e.entry_type === 'platform_fee') grossPlatformFee += BigInt(e.amount_cents);
      if (e.entry_type === 'fee_share') grossCommission += BigInt(e.amount_cents);
    }

    // Aggregate negative guard (defense-in-depth)
    if (grossCommission < 0n || grossPlatformFee < 0n) {
      await client.query('ROLLBACK');
      throw Object.assign(new Error('Negative values not supported'), { code: 'TERRITORY_CYCLE_NEGATIVE_ADJUSTMENT_UNSUPPORTED' });
    }

    // BLOCKED: diagnostic only, no allocations, no fiscal check
    if (cycleStatus === 'BLOCKED') {
      const cycle = await insertCycle(client, {
        territoryId, managerId: null, referenceMonth,
        cycleType: 'REGULAR', parentCycleId: null, sequenceNumber: 1,
        grossPlatformFee, grossCommission,
        approvedAmount: 0n, status: 'BLOCKED',
        platformFeeRateBps: PLATFORM_FEE_RATE_BPS, managerCommissionRateBps: MANAGER_COMMISSION_RATE_BPS,
        fiscalRequired: false, fiscalStatus: 'NOT_REQUIRED',
      });
      await client.query('COMMIT');
      return cycle;
    }

    // CALCULATED: full validation
    const divergences = await checkReconciliationInClient(client, territoryId, managerId, referenceMonth);
    if (divergences.length > 0) {
      await client.query('ROLLBACK');
      throw Object.assign(new Error(`Ledger divergent for ${divergences.length} ride(s)`),
        { code: 'TERRITORY_CYCLE_LEDGER_DIVERGENCE', divergences });
    }

    const rates = await checkRateHomogeneityInClient(client, territoryId, managerId, referenceMonth);
    if (!rates.homogeneous) {
      await client.query('ROLLBACK');
      throw Object.assign(new Error('Mixed rates'), { code: 'TERRITORY_CYCLE_MIXED_RATES', rates: rates.rates });
    }

    const fiscal = await resolveFiscalProfile(client, managerId!, territoryId);

    const cycle = await insertCycle(client, {
      territoryId, managerId, referenceMonth,
      cycleType: 'REGULAR', parentCycleId: null, sequenceNumber: 1,
      grossPlatformFee, grossCommission,
      approvedAmount: grossCommission, status: 'CALCULATED',
      platformFeeRateBps: rates.effectiveRates!.platform_fee_rate_bps,
      managerCommissionRateBps: rates.effectiveRates!.manager_commission_rate_bps,
      fiscalRequired: fiscal.required, fiscalStatus: fiscal.status,
    });

    await insertAllocations(client, cycle.id, entries);
    await client.query('COMMIT');
    return cycle;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════
// CONFIRM SUPPLEMENTAL CYCLE
// ═══════════════════════════════════════════════════════════════

export async function confirmSupplementalCycle(
  pool: Pool,
  territoryId: string,
  referenceMonth: string,
  managerId: string | null,
): Promise<TerritoryPayoutCycle | null> {
  assertOutboundEngine();
  if (!managerId) return null;
  if (!isValidReferenceMonth(referenceMonth)) {
    throw Object.assign(new Error('Invalid reference_month'), { code: 'TERRITORY_CYCLE_INVALID_MONTH' });
  }
  if (!isMonthOutbound(referenceMonth)) {
    throw Object.assign(new Error('Month not eligible'), { code: 'TERRITORY_CYCLE_MONTH_NOT_OUTBOUND' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await acquireCycleLock(client, territoryId, managerId, referenceMonth);

    const regular = await getActiveRegular(client, territoryId, managerId, referenceMonth);
    if (!regular) {
      await client.query('ROLLBACK');
      throw Object.assign(new Error('No active REGULAR cycle'), { code: 'TERRITORY_CYCLE_NO_REGULAR_PARENT' });
    }

    // Cumulative reconciliation BEFORE any no-op return
    const divergences = await checkReconciliationInClient(client, territoryId, managerId, referenceMonth);
    if (divergences.length > 0) {
      await client.query('ROLLBACK');
      throw Object.assign(new Error('Ledger divergent'), { code: 'TERRITORY_CYCLE_LEDGER_DIVERGENCE', divergences });
    }

    const entries = await getUnallocatedEntriesInClient(client, territoryId, managerId, referenceMonth);

    // Per-entry negative check (before reconciliation can mask it)
    assertNoNegativeCycleEntries(entries);

    // No unallocated entries → no supplemental needed
    if (entries.length === 0) { await client.query('COMMIT'); return null; }

    let grossPlatformFee = 0n, grossCommission = 0n;
    for (const e of entries) {
      if (e.entry_type === 'platform_fee') grossPlatformFee += BigInt(e.amount_cents);
      if (e.entry_type === 'fee_share') grossCommission += BigInt(e.amount_cents);
    }

    // Zero commission: no cycle
    if (grossCommission === 0n) {
      await client.query('COMMIT');
      return null;
    }

    const rates = await checkRateHomogeneityInClient(client, territoryId, managerId, referenceMonth);
    if (!rates.homogeneous) {
      await client.query('ROLLBACK');
      throw Object.assign(new Error('Mixed rates'), { code: 'TERRITORY_CYCLE_MIXED_RATES' });
    }

    const fiscal = await resolveFiscalProfile(client, managerId, territoryId);
    const seqNum = await getNextSequenceNumber(client, regular.id);

    const cycle = await insertCycle(client, {
      territoryId, managerId, referenceMonth,
      cycleType: 'SUPPLEMENTAL', parentCycleId: regular.id, sequenceNumber: seqNum,
      grossPlatformFee, grossCommission,
      approvedAmount: grossCommission, status: 'CALCULATED',
      platformFeeRateBps: rates.effectiveRates!.platform_fee_rate_bps,
      managerCommissionRateBps: rates.effectiveRates!.manager_commission_rate_bps,
      fiscalRequired: fiscal.required, fiscalStatus: fiscal.status,
    });
    await insertAllocations(client, cycle.id, entries);
    await client.query('COMMIT');
    return cycle;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════
// STATE TRANSITIONS
// ═══════════════════════════════════════════════════════════════

export async function submitForReview(pool: Pool, cycleId: string): Promise<TerritoryPayoutCycle> {
  assertOutboundEngine();
  const { rows: [updated] } = await pool.query(
    `UPDATE territory_payout_cycles SET status='UNDER_REVIEW', submitted_for_review_at=NOW(), updated_at=NOW()
     WHERE id=$1 AND status='CALCULATED' RETURNING *`, [cycleId]);
  if (!updated) throw Object.assign(new Error('Invalid transition'), { code: 'TERRITORY_CYCLE_INVALID_TRANSITION' });
  return mapCycle(updated);
}

export async function approveCycle(pool: Pool, cycleId: string, approvedBy: string): Promise<TerritoryPayoutCycle> {
  assertOutboundEngine();
  // Atomic: validate fiscal status and transition in one UPDATE with WHERE conditions.
  // Rejects if:
  //   - status != UNDER_REVIEW
  //   - fiscal_document_required=true AND fiscal_document_status != 'VALIDATED'
  //   - fiscal_document_required=false AND fiscal_document_status != 'NOT_REQUIRED' (incoherent)
  const { rows: [updated] } = await pool.query(
    `UPDATE territory_payout_cycles
     SET status='APPROVED', approved_at=NOW(), approved_by=$2, updated_at=NOW()
     WHERE id=$1 AND status='UNDER_REVIEW'
       AND (
         (fiscal_document_required = false AND fiscal_document_status = 'NOT_REQUIRED')
         OR (fiscal_document_required = true AND fiscal_document_status = 'VALIDATED')
       )
     RETURNING *`, [cycleId, approvedBy]);
  if (!updated) {
    // Determine specific error
    const { rows: [row] } = await pool.query(
      'SELECT status, fiscal_document_required, fiscal_document_status FROM territory_payout_cycles WHERE id=$1', [cycleId]);
    if (!row) throw new Error('Cycle not found');
    if (row.status !== 'UNDER_REVIEW') {
      throw Object.assign(new Error('Invalid transition'), { code: 'TERRITORY_CYCLE_INVALID_TRANSITION' });
    }
    if (row.fiscal_document_required && row.fiscal_document_status !== 'VALIDATED') {
      throw Object.assign(new Error('Fiscal document not validated'), { code: 'TERRITORY_CYCLE_FISCAL_DOCUMENT_NOT_VALIDATED' });
    }
    // fiscal_document_required=false but status != NOT_REQUIRED → incoherent
    throw Object.assign(new Error('Fiscal document state incoherent'), { code: 'TERRITORY_CYCLE_FISCAL_DOCUMENT_NOT_VALIDATED' });
  }
  return mapCycle(updated);
}

export async function cancelCycle(pool: Pool, cycleId: string, cancelledBy: string, reason: string): Promise<TerritoryPayoutCycle> {
  assertOutboundEngine();
  const { rows: [current] } = await pool.query('SELECT status FROM territory_payout_cycles WHERE id=$1', [cycleId]);
  if (!current) throw new Error('Cycle not found');
  if (!['BLOCKED', 'BLOCKED_NEGATIVE_ADJUSTMENT'].includes(current.status)) {
    throw Object.assign(new Error(`Cannot cancel cycle in status ${current.status}`), { code: 'TERRITORY_CYCLE_INVALID_TRANSITION' });
  }
  const { rows: [updated] } = await pool.query(
    `UPDATE territory_payout_cycles SET status='CANCELLED', cancelled_at=NOW(), cancelled_by=$2, cancel_reason=$3, updated_at=NOW()
     WHERE id=$1 RETURNING *`, [cycleId, cancelledBy, reason]);
  return mapCycle(updated);
}

export async function getCycleById(pool: Pool, cycleId: string): Promise<TerritoryPayoutCycle | null> {
  const { rows } = await pool.query('SELECT * FROM territory_payout_cycles WHERE id=$1', [cycleId]);
  return rows.length > 0 ? mapCycle(rows[0]) : null;
}

// ═══════════════════════════════════════════════════════════════
// PRIVATE HELPERS
// ═══════════════════════════════════════════════════════════════

async function acquireCycleLock(client: PoolClient, territoryId: string, managerId: string | null, referenceMonth: string): Promise<void> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
    [`territory-cycle:${territoryId}:${managerId ?? 'none'}:${referenceMonth}`]);
}

async function getActiveRegular(client: PoolClient, territoryId: string, managerId: string | null, referenceMonth: string): Promise<TerritoryPayoutCycle | null> {
  const { rows } = await client.query(
    `SELECT * FROM territory_payout_cycles
     WHERE territory_id=$1 AND manager_id IS NOT DISTINCT FROM $2
       AND reference_month=$3 AND cycle_type='REGULAR' AND status<>'CANCELLED'`, [territoryId, managerId, referenceMonth]);
  return rows.length > 0 ? mapCycle(rows[0]) : null;
}

async function getUnallocatedEntries(db: Pool | PoolClient, territoryId: string, managerId: string | null, referenceMonth: string): Promise<LedgerEntry[]> {
  const { rows } = await db.query(
    `SELECT tl.id::text, tl.reference_id AS ride_id, tl.entry_type, tl.amount_cents::text, tl.manager_assignment_id
     FROM territory_ledger tl
     WHERE tl.territory_id=$1 AND tl.manager_id IS NOT DISTINCT FROM $2
       AND tl.reference_month=$3 AND tl.entry_type IN ('platform_fee','fee_share') AND tl.reference_type='ride'
       AND NOT EXISTS (SELECT 1 FROM territory_cycle_allocations tca WHERE tca.ledger_entry_id=tl.id)`,
    [territoryId, managerId, referenceMonth]);
  return rows;
}

async function getUnallocatedEntriesInClient(client: PoolClient, territoryId: string, managerId: string | null, referenceMonth: string): Promise<LedgerEntry[]> {
  return getUnallocatedEntries(client, territoryId, managerId, referenceMonth);
}

function assertNoNegativeCycleEntries(entries: LedgerEntry[]): void {
  for (const e of entries) {
    if (BigInt(e.amount_cents) < 0n) {
      throw Object.assign(
        new Error(`Negative entry: ledger_id=${e.id} ride=${e.ride_id} type=${e.entry_type} amount=${e.amount_cents}`),
        { code: 'TERRITORY_CYCLE_NEGATIVE_ADJUSTMENT_UNSUPPORTED' },
      );
    }
  }
}

async function checkReconciliation(db: Pool | PoolClient, territoryId: string, managerId: string | null, referenceMonth: string): Promise<Array<{ rideId: string; reason: string }>> {
  const { rows } = await db.query(
    `WITH ledger_agg AS (
       -- Cumulative ledger entries for this territory/manager/month (all, not just unallocated)
       SELECT tl.reference_id AS ride_id,
         COALESCE(SUM(tl.amount_cents) FILTER (WHERE tl.entry_type='platform_fee'),0) AS pf_sum,
         COALESCE(SUM(tl.amount_cents) FILTER (WHERE tl.entry_type='fee_share'),0) AS fs_sum,
         COUNT(*) FILTER (WHERE tl.entry_type='platform_fee') AS pf_count,
         COUNT(*) FILTER (WHERE tl.entry_type='fee_share') AS fs_count,
         -- Per-entry metadata comparison against split (detects ANY divergent entry)
         BOOL_OR(tl.territory_id IS DISTINCT FROM rfs.territory_id) AS territory_mismatch,
         BOOL_OR(tl.manager_id IS DISTINCT FROM rfs.manager_id) AS manager_mismatch,
         BOOL_OR(tl.manager_assignment_id IS DISTINCT FROM rfs.manager_assignment_id) AS assignment_mismatch,
         BOOL_OR(tl.reference_month IS DISTINCT FROM rfs.reference_month) AS month_mismatch,
         -- Split metadata for economic checks
         MAX(rfs.fee_collected_cents) AS fee_collected_cents,
         MAX(rfs.fee_pending_cents) AS fee_pending_cents,
         MAX(rfs.fee_amount_cents) AS fee_amount_cents,
         MAX(rfs.collection_status) AS collection_status,
         MAX(rfs.manager_commission_rate_bps) AS manager_commission_rate_bps
       FROM territory_ledger tl
       JOIN ride_fee_splits rfs ON rfs.ride_id = tl.reference_id
         AND rfs.territory_id=$1 AND rfs.manager_id IS NOT DISTINCT FROM $2 AND rfs.reference_month=$3
       WHERE tl.territory_id=$1 AND tl.manager_id IS NOT DISTINCT FROM $2 AND tl.reference_month=$3
         AND tl.entry_type IN ('platform_fee','fee_share') AND tl.reference_type='ride'
       GROUP BY tl.reference_id
     ), split_src AS (
       -- All splits for this territory/manager/month with collected fees
       SELECT ride_id, fee_collected_cents, fee_pending_cents, fee_amount_cents,
              collection_status, manager_commission_rate_bps
       FROM ride_fee_splits
       WHERE territory_id=$1 AND manager_id IS NOT DISTINCT FROM $2 AND reference_month=$3
         AND fee_collected_cents > 0
     ), ledger_rides AS (
       -- All rides with ledger entries (for detecting ledger_without_split)
       SELECT DISTINCT reference_id AS ride_id
       FROM territory_ledger
       WHERE territory_id=$1 AND manager_id IS NOT DISTINCT FROM $2 AND reference_month=$3
         AND entry_type IN ('platform_fee','fee_share') AND reference_type='ride'
     )
     SELECT COALESCE(lr.ride_id, ss.ride_id) AS ride_id,
       CASE
         WHEN ss.ride_id IS NULL AND lr.ride_id IS NOT NULL THEN 'ledger_without_split'
         WHEN lr.ride_id IS NULL AND ss.ride_id IS NOT NULL THEN 'split_without_ledger'
         WHEN la.pf_count = 0 THEN 'platform_fee_entry_missing'
         WHEN la.fs_count = 0 THEN 'fee_share_entry_missing'
         WHEN la.territory_mismatch THEN 'territory_mismatch'
         WHEN la.manager_mismatch THEN 'manager_mismatch'
         WHEN la.assignment_mismatch THEN 'assignment_mismatch'
         WHEN la.month_mismatch THEN 'month_mismatch'
         WHEN la.pf_sum <> ss.fee_collected_cents THEN 'platform_fee_mismatch'
         WHEN la.fs_sum <> (ss.fee_collected_cents * ss.manager_commission_rate_bps + 5000) / 10000 THEN 'fee_share_mismatch'
         WHEN ss.fee_collected_cents < 0 THEN 'negative_collected'
         WHEN ss.fee_pending_cents < 0 THEN 'negative_pending'
         WHEN ss.fee_collected_cents + ss.fee_pending_cents <> ss.fee_amount_cents THEN 'split_invariant_violated'
         WHEN ss.collection_status = 'collected' AND ss.fee_pending_cents <> 0 THEN 'status_collected_but_pending'
         WHEN ss.collection_status = 'pending' AND ss.fee_collected_cents <> 0 THEN 'status_pending_but_collected'
         WHEN ss.collection_status = 'partial' AND (ss.fee_collected_cents <= 0 OR ss.fee_pending_cents <= 0) THEN 'status_partial_invalid'
         ELSE NULL
       END AS reason
     FROM ledger_rides lr
     FULL OUTER JOIN split_src ss ON ss.ride_id = lr.ride_id
     LEFT JOIN ledger_agg la ON la.ride_id = lr.ride_id
     WHERE ss.ride_id IS NULL OR lr.ride_id IS NULL
       OR la.pf_count = 0 OR la.fs_count = 0
       OR la.territory_mismatch OR la.manager_mismatch OR la.assignment_mismatch OR la.month_mismatch
       OR la.pf_sum <> ss.fee_collected_cents
       OR la.fs_sum <> (ss.fee_collected_cents * ss.manager_commission_rate_bps + 5000) / 10000
       OR ss.fee_collected_cents < 0 OR ss.fee_pending_cents < 0
       OR ss.fee_collected_cents + ss.fee_pending_cents <> ss.fee_amount_cents
       OR (ss.collection_status = 'collected' AND ss.fee_pending_cents <> 0)
       OR (ss.collection_status = 'pending' AND ss.fee_collected_cents <> 0)
       OR (ss.collection_status = 'partial' AND (ss.fee_collected_cents <= 0 OR ss.fee_pending_cents <= 0))`,
    [territoryId, managerId, referenceMonth]);
  return rows.filter((r: any) => r.reason).map((r: any) => ({ rideId: r.ride_id, reason: r.reason }));
}

async function checkReconciliationInClient(client: PoolClient, territoryId: string, managerId: string | null, referenceMonth: string) {
  return checkReconciliation(client, territoryId, managerId, referenceMonth);
}

async function checkRateHomogeneity(db: Pool | PoolClient, territoryId: string, managerId: string | null, referenceMonth: string) {
  const { rows } = await db.query(
    `SELECT DISTINCT platform_fee_rate_bps, manager_commission_rate_bps
     FROM ride_fee_splits WHERE territory_id=$1 AND manager_id IS NOT DISTINCT FROM $2
       AND reference_month=$3 AND fee_collected_cents > 0`,
    [territoryId, managerId, referenceMonth]);
  const homogeneous = rows.length === 1;
  return {
    homogeneous,
    rates: rows,
    effectiveRates: homogeneous ? rows[0] as { platform_fee_rate_bps: number; manager_commission_rate_bps: number } : null,
  };
}

async function checkRateHomogeneityInClient(client: PoolClient, territoryId: string, managerId: string | null, referenceMonth: string) {
  return checkRateHomogeneity(client, territoryId, managerId, referenceMonth);
}

async function resolveFiscalProfile(db: Pool | PoolClient, managerId: string, territoryId: string): Promise<{ required: boolean; status: string }> {
  const { rows } = await db.query(
    `SELECT recipient_type FROM operator_profiles
     WHERE admin_id=$1 AND territory_id=$2 AND is_active=true`, [managerId, territoryId]);
  if (rows.length !== 1) {
    throw Object.assign(new Error('Fiscal profile missing or ambiguous'), { code: 'TERRITORY_CYCLE_FISCAL_PROFILE_MISSING' });
  }
  const rt = rows[0].recipient_type;
  if (rt === 'individual') return { required: false, status: 'NOT_REQUIRED' };
  if (rt === 'company' || rt === 'association') return { required: true, status: 'PENDING' };
  throw Object.assign(new Error(`Unknown recipient_type: ${rt}`), { code: 'TERRITORY_CYCLE_FISCAL_PROFILE_MISSING' });
}

async function getNextSequenceNumber(client: PoolClient, parentCycleId: string): Promise<number> {
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(sequence_number), 1) + 1 AS next FROM territory_payout_cycles WHERE parent_cycle_id=$1`, [parentCycleId]);
  return Number(rows[0].next);
}

async function insertCycle(client: PoolClient, params: {
  territoryId: string; managerId: string | null; referenceMonth: string;
  cycleType: 'REGULAR' | 'SUPPLEMENTAL'; parentCycleId: string | null; sequenceNumber: number;
  grossPlatformFee: bigint; grossCommission: bigint;
  approvedAmount: bigint; status: string;
  platformFeeRateBps: number; managerCommissionRateBps: number;
  fiscalRequired: boolean; fiscalStatus: string;
}): Promise<TerritoryPayoutCycle> {
  const idemKey = `territory_cycle:${params.cycleType}:${params.territoryId}:${params.managerId ?? 'none'}:${params.referenceMonth}:${POLICY_VERSION}:seq${params.sequenceNumber}`;

  // Try INSERT
  const { rows: inserted } = await client.query(
    `INSERT INTO territory_payout_cycles
     (territory_id, manager_id, reference_month, policy_version,
      commission_rate_basis_points, platform_fee_rate_basis_points, competence_timezone,
      cycle_type, parent_cycle_id, sequence_number,
      gross_platform_fee_cents, gross_manager_commission_cents, approved_adjustments_cents, approved_amount_cents,
      status, fiscal_document_required, fiscal_document_status,
      calculated_at, recognized_at, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,$13,$14,$15,$16,NOW(),NOW(),$17)
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING *`,
    [params.territoryId, params.managerId, params.referenceMonth, POLICY_VERSION,
     params.managerCommissionRateBps, params.platformFeeRateBps, COMPETENCE_TIMEZONE,
     params.cycleType, params.parentCycleId, params.sequenceNumber,
     params.grossPlatformFee.toString(), params.grossCommission.toString(), params.approvedAmount.toString(),
     params.status, params.fiscalRequired, params.fiscalStatus, idemKey]);

  if (inserted.length === 1) return mapCycle(inserted[0]);

  // Conflict: validate idempotency
  const { rows: [existing] } = await client.query(
    'SELECT * FROM territory_payout_cycles WHERE idempotency_key=$1', [idemKey]);

  if (existing.status === 'CANCELLED') {
    throw Object.assign(new Error('Cancelled cycle exists for this key'), { code: 'TERRITORY_CYCLE_BLOCKED_CANCELLED' });
  }

  // Economic identity check
  const mismatch =
    existing.territory_id !== params.territoryId ||
    (existing.manager_id ?? null) !== (params.managerId ?? null) ||
    existing.reference_month !== params.referenceMonth ||
    existing.policy_version !== POLICY_VERSION ||
    existing.platform_fee_rate_basis_points !== params.platformFeeRateBps ||
    existing.commission_rate_basis_points !== params.managerCommissionRateBps ||
    existing.cycle_type !== params.cycleType ||
    (existing.parent_cycle_id ?? null) !== (params.parentCycleId ?? null) ||
    existing.sequence_number !== params.sequenceNumber ||
    BigInt(existing.gross_platform_fee_cents) !== params.grossPlatformFee ||
    BigInt(existing.gross_manager_commission_cents) !== params.grossCommission ||
    BigInt(existing.approved_amount_cents) !== params.approvedAmount;

  if (mismatch) {
    throw Object.assign(new Error('Cycle economic identity mismatch'), { code: 'TERRITORY_CYCLE_IDEMPOTENCY_MISMATCH' });
  }

  return mapCycle(existing);
}

async function insertAllocations(client: PoolClient, cycleId: string, entries: LedgerEntry[]): Promise<void> {
  for (const e of entries) {
    await client.query(
      `INSERT INTO territory_cycle_allocations (cycle_id, ledger_entry_id, ride_id, entry_type, amount_cents, manager_assignment_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [cycleId, e.id, e.ride_id, e.entry_type, e.amount_cents, e.manager_assignment_id]);
  }
}

function mapCycle(row: any): TerritoryPayoutCycle {
  return {
    id: row.id,
    territoryId: row.territory_id,
    managerId: row.manager_id,
    referenceMonth: row.reference_month,
    policyVersion: row.policy_version,
    commissionRateBasisPoints: row.commission_rate_basis_points,
    platformFeeRateBasisPoints: row.platform_fee_rate_basis_points,
    cycleType: row.cycle_type,
    parentCycleId: row.parent_cycle_id,
    sequenceNumber: row.sequence_number,
    grossPlatformFeeCents: BigInt(row.gross_platform_fee_cents),
    grossManagerCommissionCents: BigInt(row.gross_manager_commission_cents),
    approvedAdjustmentsCents: BigInt(row.approved_adjustments_cents),
    approvedAmountCents: BigInt(row.approved_amount_cents),
    status: row.status,
    fiscalDocumentRequired: row.fiscal_document_required,
    fiscalDocumentStatus: row.fiscal_document_status,
    approvedAt: row.approved_at,
    approvedBy: row.approved_by ?? null,
    calculatedAt: row.calculated_at,
    createdAt: row.created_at,
  };
}
