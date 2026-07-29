/**
 * Territory Payout Cycle Service (Marco 3.2A).
 *
 * Lifecycle:
 *   previewCycle → confirmRegularCycle → CALCULATED → UNDER_REVIEW → APPROVED → ...
 *   confirmSupplementalCycle → CALCULATED | BLOCKED_NEGATIVE_ADJUSTMENT
 *
 * Source of truth: territory_ledger (immutable entries).
 * All amounts in BigInt cents.
 */

import { Pool, PoolClient } from 'pg';
import { applyBasisPoints, MANAGER_COMMISSION_RATE_BPS, PLATFORM_FEE_RATE_BPS } from './monetary';
import { isMonthOutbound, isValidReferenceMonth } from './engine-selection';

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
  status: 'CALCULATED' | 'BLOCKED' | 'BLOCKED_NEGATIVE_ADJUSTMENT';
  divergences: Array<{ rideId: string; reason: string }>;
  rateHomogeneous: boolean;
  mixedRates?: Array<{ platformFeeRateBps: number; managerCommissionRateBps: number }>;
}

interface LedgerEntry {
  id: string;
  ride_id: string;
  entry_type: string;
  amount_cents: string;
  manager_assignment_id: string | null;
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

  let grossPlatformFee = 0n, grossCommission = 0n;
  for (const e of entries) {
    if (e.entry_type === 'platform_fee') grossPlatformFee += BigInt(e.amount_cents);
    if (e.entry_type === 'fee_share') grossCommission += BigInt(e.amount_cents);
  }

  const status: CyclePreview['status'] = !managerId ? 'BLOCKED'
    : grossCommission < 0n ? 'BLOCKED_NEGATIVE_ADJUSTMENT'
    : 'CALCULATED';

  return {
    territoryId, managerId, referenceMonth,
    grossPlatformFeeCents: grossPlatformFee,
    grossManagerCommissionCents: grossCommission,
    approvedAmountCents: status === 'CALCULATED' ? grossCommission : 0n,
    entryCount: entries.length,
    status,
    divergences,
    rateHomogeneous: rates.homogeneous,
    mixedRates: rates.homogeneous ? undefined : rates.rates,
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

    // Idempotency: check existing REGULAR
    const existing = await getActiveRegular(client, territoryId, managerId, referenceMonth);
    if (existing) { await client.query('COMMIT'); return existing; }

    const entries = await getUnallocatedEntriesInClient(client, territoryId, managerId, referenceMonth);
    const cycleStatus = managerId ? 'CALCULATED' : 'BLOCKED';

    let grossPlatformFee = 0n, grossCommission = 0n;
    for (const e of entries) {
      if (e.entry_type === 'platform_fee') grossPlatformFee += BigInt(e.amount_cents);
      if (e.entry_type === 'fee_share') grossCommission += BigInt(e.amount_cents);
    }

    // BLOCKED: diagnostic only, no allocations
    if (cycleStatus === 'BLOCKED') {
      const cycle = await insertCycle(client, {
        territoryId, managerId: null, referenceMonth,
        cycleType: 'REGULAR', parentCycleId: null, sequenceNumber: 1,
        grossPlatformFee, grossCommission,
        approvedAmount: 0n, status: 'BLOCKED',
      });
      await client.query('COMMIT');
      return cycle;
    }

    // CALCULATED: validate and create with allocations
    const divergences = await checkReconciliationInClient(client, territoryId, managerId, referenceMonth);
    if (divergences.length > 0) {
      await client.query('ROLLBACK');
      throw Object.assign(new Error(`Ledger divergent for ${divergences.length} ride(s)`), {
        code: 'TERRITORY_CYCLE_LEDGER_DIVERGENCE', divergences,
      });
    }

    const rates = await checkRateHomogeneityInClient(client, territoryId, managerId, referenceMonth);
    if (!rates.homogeneous) {
      await client.query('ROLLBACK');
      throw Object.assign(new Error('Mixed rates in cycle period'), {
        code: 'TERRITORY_CYCLE_MIXED_RATES', rates: rates.rates,
      });
    }

    const cycle = await insertCycle(client, {
      territoryId, managerId, referenceMonth,
      cycleType: 'REGULAR', parentCycleId: null, sequenceNumber: 1,
      grossPlatformFee, grossCommission,
      approvedAmount: grossCommission, status: 'CALCULATED',
    });

    // Create allocations
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
  if (!managerId) return null; // SUPPLEMENTAL not applicable without manager
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

    const entries = await getUnallocatedEntriesInClient(client, territoryId, managerId, referenceMonth);
    if (entries.length === 0) { await client.query('COMMIT'); return null; }

    // Validate
    const divergences = await checkReconciliationInClient(client, territoryId, managerId, referenceMonth);
    if (divergences.length > 0) {
      await client.query('ROLLBACK');
      throw Object.assign(new Error('Ledger divergent'), { code: 'TERRITORY_CYCLE_LEDGER_DIVERGENCE', divergences });
    }
    const rates = await checkRateHomogeneityInClient(client, territoryId, managerId, referenceMonth);
    if (!rates.homogeneous) {
      await client.query('ROLLBACK');
      throw Object.assign(new Error('Mixed rates'), { code: 'TERRITORY_CYCLE_MIXED_RATES' });
    }

    let grossPlatformFee = 0n, grossCommission = 0n;
    for (const e of entries) {
      if (e.entry_type === 'platform_fee') grossPlatformFee += BigInt(e.amount_cents);
      if (e.entry_type === 'fee_share') grossCommission += BigInt(e.amount_cents);
    }

    const seqNum = await getNextSequenceNumber(client, regular.id);

    if (grossCommission < 0n) {
      const cycle = await insertCycle(client, {
        territoryId, managerId, referenceMonth,
        cycleType: 'SUPPLEMENTAL', parentCycleId: regular.id, sequenceNumber: seqNum,
        grossPlatformFee, grossCommission,
        approvedAmount: 0n, status: 'BLOCKED_NEGATIVE_ADJUSTMENT',
      });
      await client.query('COMMIT');
      return cycle;
    }

    const cycle = await insertCycle(client, {
      territoryId, managerId, referenceMonth,
      cycleType: 'SUPPLEMENTAL', parentCycleId: regular.id, sequenceNumber: seqNum,
      grossPlatformFee, grossCommission,
      approvedAmount: grossCommission, status: 'CALCULATED',
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
  const { rows: [updated] } = await pool.query(
    `UPDATE territory_payout_cycles SET status='UNDER_REVIEW', submitted_for_review_at=NOW(), updated_at=NOW()
     WHERE id=$1 AND status='CALCULATED' RETURNING *`, [cycleId]);
  if (!updated) throw Object.assign(new Error('Invalid transition'), { code: 'TERRITORY_CYCLE_INVALID_TRANSITION' });
  return mapCycle(updated);
}

export async function approveCycle(pool: Pool, cycleId: string, approvedBy: string): Promise<TerritoryPayoutCycle> {
  const { rows: [updated] } = await pool.query(
    `UPDATE territory_payout_cycles SET status='APPROVED', approved_at=NOW(), approved_by=$2, updated_at=NOW()
     WHERE id=$1 AND status='UNDER_REVIEW' RETURNING *`, [cycleId, approvedBy]);
  if (!updated) throw Object.assign(new Error('Invalid transition'), { code: 'TERRITORY_CYCLE_INVALID_TRANSITION' });
  return mapCycle(updated);
}

export async function cancelCycle(pool: Pool, cycleId: string, cancelledBy: string, reason: string): Promise<TerritoryPayoutCycle> {
  const { rows: [current] } = await pool.query('SELECT status FROM territory_payout_cycles WHERE id=$1', [cycleId]);
  if (!current) throw new Error('Cycle not found');
  const cancellable = ['BLOCKED', 'BLOCKED_NEGATIVE_ADJUSTMENT'];
  if (!cancellable.includes(current.status)) {
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

async function checkReconciliation(db: Pool | PoolClient, territoryId: string, managerId: string | null, referenceMonth: string): Promise<Array<{ rideId: string; reason: string }>> {
  const { rows } = await db.query(
    `WITH ledger_totals AS (
       SELECT reference_id AS ride_id,
         COALESCE(SUM(amount_cents) FILTER (WHERE entry_type='platform_fee'),0) AS pf_total,
         COALESCE(SUM(amount_cents) FILTER (WHERE entry_type='fee_share'),0) AS fs_total
       FROM territory_ledger
       WHERE territory_id=$1 AND manager_id IS NOT DISTINCT FROM $2 AND reference_month=$3
         AND entry_type IN ('platform_fee','fee_share') AND reference_type='ride'
       GROUP BY reference_id
     ), split_source AS (
       SELECT ride_id, fee_collected_cents, manager_commission_rate_bps
       FROM ride_fee_splits
       WHERE territory_id=$1 AND manager_id IS NOT DISTINCT FROM $2 AND reference_month=$3
         AND fee_collected_cents > 0
     )
     SELECT COALESCE(lt.ride_id, ss.ride_id) AS ride_id,
       CASE
         WHEN ss.ride_id IS NULL THEN 'ledger_without_split'
         WHEN lt.ride_id IS NULL THEN 'split_without_ledger'
         WHEN lt.pf_total <> ss.fee_collected_cents THEN 'platform_fee_mismatch'
         WHEN lt.fs_total <> (ss.fee_collected_cents * ss.manager_commission_rate_bps + 5000) / 10000 THEN 'fee_share_mismatch'
         ELSE NULL
       END AS reason
     FROM ledger_totals lt FULL OUTER JOIN split_source ss ON ss.ride_id = lt.ride_id
     WHERE ss.ride_id IS NULL OR lt.ride_id IS NULL
       OR lt.pf_total <> ss.fee_collected_cents
       OR lt.fs_total <> (ss.fee_collected_cents * ss.manager_commission_rate_bps + 5000) / 10000`,
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
  return { homogeneous: rows.length <= 1, rates: rows };
}

async function checkRateHomogeneityInClient(client: PoolClient, territoryId: string, managerId: string | null, referenceMonth: string) {
  return checkRateHomogeneity(client, territoryId, managerId, referenceMonth);
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
}): Promise<TerritoryPayoutCycle> {
  const idemKey = `territory_cycle:${params.cycleType}:${params.territoryId}:${params.managerId ?? 'none'}:${params.referenceMonth}:${POLICY_VERSION}:seq${params.sequenceNumber}`;
  const { rows: [row] } = await client.query(
    `INSERT INTO territory_payout_cycles
     (territory_id, manager_id, reference_month, policy_version,
      commission_rate_basis_points, platform_fee_rate_basis_points, competence_timezone,
      cycle_type, parent_cycle_id, sequence_number,
      gross_platform_fee_cents, gross_manager_commission_cents, approved_adjustments_cents, approved_amount_cents,
      status, calculated_at, recognized_at, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,0,$13,$14,NOW(),NOW(),$15)
     ON CONFLICT (idempotency_key) DO UPDATE SET id=territory_payout_cycles.id
     RETURNING *`,
    [params.territoryId, params.managerId, params.referenceMonth, POLICY_VERSION,
     MANAGER_COMMISSION_RATE_BPS, PLATFORM_FEE_RATE_BPS, COMPETENCE_TIMEZONE,
     params.cycleType, params.parentCycleId, params.sequenceNumber,
     params.grossPlatformFee.toString(), params.grossCommission.toString(), params.approvedAmount.toString(),
     params.status, idemKey]);
  return mapCycle(row);
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
    calculatedAt: row.calculated_at,
    createdAt: row.created_at,
  };
}
