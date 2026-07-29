/**
 * Territory Payout Cycle Service.
 *
 * Manages the lifecycle of monthly commission cycles:
 *   OPEN → CALCULATED → UNDER_REVIEW → APPROVED
 *
 * Source of truth: territory_ledger (immutable entries).
 * All amounts in BigInt cents.
 */

import { Pool } from 'pg';
import { applyBasisPoints, MANAGER_COMMISSION_RATE_BPS } from './monetary';
import { isMonthOutbound } from './engine-selection';

const POLICY_VERSION = 'territorial_commission_v1';

export interface CycleCalculation {
  grossPlatformFeeCents: bigint;
  grossManagerCommissionCents: bigint;
  approvedAdjustmentsCents: bigint;
  approvedAmountCents: bigint;
  rideCount: number;
}

export interface TerritoryPayoutCycle {
  id: string;
  territoryId: string;
  managerId: string | null;
  referenceMonth: string;
  policyVersion: string;
  commissionRateBasisPoints: number;
  grossPlatformFeeCents: bigint;
  grossManagerCommissionCents: bigint;
  approvedAdjustmentsCents: bigint;
  approvedAmountCents: bigint;
  status: string;
  fiscalDocumentRequired: boolean;
  fiscalDocumentStatus: string;
  calculatedAt: Date | null;
  approvedAt: Date | null;
  createdAt: Date;
}

function mapCycle(row: any): TerritoryPayoutCycle {
  return {
    id: row.id,
    territoryId: row.territory_id,
    managerId: row.manager_id,
    referenceMonth: row.reference_month,
    policyVersion: row.policy_version,
    commissionRateBasisPoints: row.commission_rate_basis_points,
    grossPlatformFeeCents: BigInt(row.gross_platform_fee_cents),
    grossManagerCommissionCents: BigInt(row.gross_manager_commission_cents),
    approvedAdjustmentsCents: BigInt(row.approved_adjustments_cents),
    approvedAmountCents: BigInt(row.approved_amount_cents),
    status: row.status,
    fiscalDocumentRequired: row.fiscal_document_required,
    fiscalDocumentStatus: row.fiscal_document_status,
    calculatedAt: row.calculated_at,
    approvedAt: row.approved_at,
    createdAt: row.created_at,
  };
}

/**
 * Calculates a cycle from territory_ledger entries.
 * Idempotent: same inputs produce same cycle.
 */
export async function calculateCycle(
  pool: Pool,
  territoryId: string,
  referenceMonth: string,
  managerId: string | null,
): Promise<TerritoryPayoutCycle> {
  // Validate engine allows outbound for this month
  if (!isMonthOutbound(referenceMonth)) {
    throw Object.assign(
      new Error(`Month ${referenceMonth} is not eligible for outbound cycle`),
      { code: 'TERRITORY_CYCLE_MONTH_NOT_OUTBOUND' }
    );
  }

  const idempotencyKey = `territory_cycle:${territoryId}:${managerId ?? 'none'}:${referenceMonth}:${POLICY_VERSION}`;

  // Check existing
  const { rows: existing } = await pool.query(
    'SELECT * FROM territory_payout_cycles WHERE idempotency_key = $1', [idempotencyKey]
  );
  if (existing.length > 0) {
    return mapCycle(existing[0]);
  }

  // Sum from territory_ledger (immutable source)
  const { rows: ledgerSummary } = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN entry_type = 'fee_share' THEN amount_cents ELSE 0 END), 0) as gross_fee,
       COALESCE(SUM(CASE WHEN entry_type IN ('referral_cost','family_return_cost','adjustment') THEN amount_cents ELSE 0 END), 0) as adjustments,
       COUNT(*) FILTER (WHERE entry_type = 'fee_share') as ride_count
     FROM territory_ledger
     WHERE territory_id = $1 AND reference_month = $2
       AND ($3::text IS NULL OR manager_id = $3)`,
    [territoryId, referenceMonth, managerId]
  );

  const grossFee = BigInt(ledgerSummary[0].gross_fee);
  const adjustments = BigInt(ledgerSummary[0].adjustments);

  // The gross_platform_fee for this territory is the sum of fee_share entries
  // (which already represent 40% of the platform fee).
  // But we need the FULL platform fee for transparency.
  // fee_share = 40% of platform_fee → platform_fee = fee_share * 10000 / 4000
  // Actually, fee_share IS the manager's 40%. The platform_fee is fee_share / 0.4
  const grossPlatformFee = grossFee * 10000n / BigInt(MANAGER_COMMISSION_RATE_BPS);
  const grossCommission = grossFee; // fee_share IS already the 40%
  const approvedAmount = grossCommission + adjustments > 0n ? grossCommission + adjustments : 0n;

  // Determine if fiscal document required (PJ check via recipient_type)
  const { rows: opProfile } = await pool.query(
    `SELECT recipient_type FROM operator_profiles WHERE territory_id = $1 AND is_active = true LIMIT 1`,
    [territoryId]
  );
  const fiscalRequired = opProfile[0]?.recipient_type === 'pj' || opProfile[0]?.recipient_type === 'association';

  // Create cycle
  const { rows: [created] } = await pool.query(
    `INSERT INTO territory_payout_cycles
     (territory_id, manager_id, reference_month, policy_version, commission_rate_basis_points,
      gross_platform_fee_cents, gross_manager_commission_cents, approved_adjustments_cents,
      approved_amount_cents, status, fiscal_document_required, fiscal_document_status,
      calculated_at, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'CALCULATED', $10, $11, NOW(), $12)
     ON CONFLICT (idempotency_key) DO UPDATE SET id = territory_payout_cycles.id
     RETURNING *`,
    [
      territoryId, managerId, referenceMonth, POLICY_VERSION, MANAGER_COMMISSION_RATE_BPS,
      grossPlatformFee.toString(), grossCommission.toString(), adjustments.toString(),
      approvedAmount.toString(), fiscalRequired, fiscalRequired ? 'PENDING' : 'NOT_REQUIRED',
      idempotencyKey,
    ]
  );

  return mapCycle(created);
}

/**
 * Submit cycle for review.
 */
export async function submitForReview(pool: Pool, cycleId: string): Promise<TerritoryPayoutCycle> {
  const { rows: [updated] } = await pool.query(
    `UPDATE territory_payout_cycles
     SET status = 'UNDER_REVIEW', submitted_for_review_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'CALCULATED' RETURNING *`,
    [cycleId]
  );
  if (!updated) throw Object.assign(new Error('Cycle not found or not in CALCULATED status'), { code: 'TERRITORY_CYCLE_INVALID_TRANSITION' });
  return mapCycle(updated);
}

/**
 * Approve cycle.
 */
export async function approveCycle(pool: Pool, cycleId: string, approvedBy: string): Promise<TerritoryPayoutCycle> {
  const { rows: [updated] } = await pool.query(
    `UPDATE territory_payout_cycles
     SET status = 'APPROVED', approved_at = NOW(), approved_by = $2, updated_at = NOW()
     WHERE id = $1 AND status = 'UNDER_REVIEW' RETURNING *`,
    [cycleId, approvedBy]
  );
  if (!updated) throw Object.assign(new Error('Cycle not found or not in UNDER_REVIEW status'), { code: 'TERRITORY_CYCLE_INVALID_TRANSITION' });
  return mapCycle(updated);
}

/**
 * Cancel cycle.
 */
export async function cancelCycle(pool: Pool, cycleId: string, cancelledBy: string, reason: string): Promise<TerritoryPayoutCycle> {
  const { rows: [current] } = await pool.query('SELECT status FROM territory_payout_cycles WHERE id = $1', [cycleId]);
  if (!current) throw new Error('Cycle not found');
  if (['PAID', 'REVERSED'].includes(current.status)) {
    throw Object.assign(new Error('Cannot cancel a paid or reversed cycle'), { code: 'TERRITORY_CYCLE_INVALID_TRANSITION' });
  }

  const { rows: [updated] } = await pool.query(
    `UPDATE territory_payout_cycles
     SET status = 'CANCELLED', cancelled_at = NOW(), cancelled_by = $2, cancel_reason = $3, updated_at = NOW()
     WHERE id = $1 RETURNING *`,
    [cycleId, cancelledBy, reason]
  );
  return mapCycle(updated);
}

/**
 * List cycles.
 */
export async function listCycles(pool: Pool, filters: { territoryId?: string; managerId?: string; status?: string; limit?: number; offset?: number }): Promise<TerritoryPayoutCycle[]> {
  let where = 'WHERE 1=1';
  const params: any[] = [];
  let idx = 1;
  if (filters.territoryId) { where += ` AND territory_id = $${idx++}`; params.push(filters.territoryId); }
  if (filters.managerId) { where += ` AND manager_id = $${idx++}`; params.push(filters.managerId); }
  if (filters.status) { where += ` AND status = $${idx++}`; params.push(filters.status); }

  const { rows } = await pool.query(
    `SELECT * FROM territory_payout_cycles ${where} ORDER BY reference_month DESC, created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
    [...params, filters.limit ?? 20, filters.offset ?? 0]
  );
  return rows.map(mapCycle);
}

/**
 * Get cycle by ID.
 */
export async function getCycleById(pool: Pool, cycleId: string): Promise<TerritoryPayoutCycle | null> {
  const { rows } = await pool.query('SELECT * FROM territory_payout_cycles WHERE id = $1', [cycleId]);
  return rows.length > 0 ? mapCycle(rows[0]) : null;
}
