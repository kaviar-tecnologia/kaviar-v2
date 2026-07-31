import { pool } from '../db';
import { PLATFORM_FEE_PERCENT } from './finance/territory/monetary';

/**
 * Shadow calculation for the new 18% fee model.
 * Writes to wallet_shadow_results (isolated from real financial tables).
 * Never modifies wallets, rides, credits, or creates financial obligations.
 *
 * NOTE: Uses PLATFORM_FEE_PERCENT as the fee source for consistency with
 * the authoritative settlement path. The platform_fee_configs query is
 * retained as documentation of the legacy path but is no longer the source.
 *
 * Feature flag: feature_flags row 'WALLET_SHADOW_MODE' or env WALLET_SHADOW_MODE.
 */

// Legacy credits are abstract units. Price per credit varies by package:
//   10-pack: R$2.00/credit, 25-pack: R$1.80, 50-pack: R$1.60
// This is a CONSERVATIVE UPPER BOUND for divergence comparison only.
// Named explicitly to prevent misinterpretation as actual revenue.
const LEGACY_CONSERVATIVE_NOMINAL_CENTS_PER_CREDIT = 200;

let cachedFeeConfig: { id: string; percent: number; fetchedAt: number } | null = null;
let cachedEnabled: { value: boolean; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60_000;

async function isShadowEnabled(): Promise<boolean> {
  if (cachedEnabled && Date.now() - cachedEnabled.fetchedAt < CACHE_TTL_MS) return cachedEnabled.value;
  let enabled = false;
  try {
    const r = await pool.query(`SELECT enabled FROM feature_flags WHERE key = 'WALLET_SHADOW_MODE' LIMIT 1`);
    enabled = r.rows[0]?.enabled === true;
  } catch (err) {
    console.warn('[SHADOW_FLAG] DB query failed, using env fallback:', (err as Error).message?.slice(0, 80));
    enabled = process.env.WALLET_SHADOW_MODE === 'true';
  }
  cachedEnabled = { value: enabled, fetchedAt: Date.now() };
  return enabled;
}

/** @deprecated No longer called when flat mode is active. Retained for potential future use if dynamic configuration is re-enabled. */
async function getFeeConfig(): Promise<{ id: string; percent: number } | null> {
  if (cachedFeeConfig && Date.now() - cachedFeeConfig.fetchedAt < CACHE_TTL_MS) return cachedFeeConfig;
  const r = await pool.query(
    `SELECT id, platform_fee_percent FROM platform_fee_configs
     WHERE approval_status = 'approved' AND effective_from <= NOW()
       AND (effective_to IS NULL OR effective_to > NOW())
     ORDER BY effective_from DESC LIMIT 1`
  );
  if (!r.rows[0]) { cachedFeeConfig = null; return null; }
  cachedFeeConfig = { id: r.rows[0].id, percent: Number(r.rows[0].platform_fee_percent), fetchedAt: Date.now() };
  return cachedFeeConfig;
}

/** Reset caches — exported for tests only */
export function _resetCache() {
  cachedFeeConfig = null;
  cachedEnabled = null;
}

export interface ShadowInput {
  rideId: string;
  driverId: string;
  finalPriceCents: number;    // Definitive final price ALREADY including wait charge
  waitChargeCents: number;    // Informational breakdown (how much of finalPriceCents is wait)
  legacyCreditCost: number;   // Credits consumed by legacy system for this ride
}

export async function shadowCalculate(input: ShadowInput): Promise<void> {
  if (!(await isShadowEnabled())) return;

  const { rideId, driverId, finalPriceCents, waitChargeCents, legacyCreditCost } = input;

  try {
    // Shadow uses the same fee constant as the authoritative settlement path.
    // Previously read from platform_fee_configs; now derives from PLATFORM_FEE_PERCENT
    // to guarantee shadow results match real settlement values.
    const feePercent = PLATFORM_FEE_PERCENT;
    const feeAmountCents = Math.round(finalPriceCents * feePercent / 100);

    // Single query: resolve territory, assignment, and finance rules
    const ctx = await pool.query(
      `SELECT n.territory_id,
              tma.id AS assignment_id, tma.status AS assignment_status,
              tfr.matrix_share_percent, tfr.regional_share_percent
       FROM rides_v2 r
       LEFT JOIN neighborhoods n ON n.id = r.origin_neighborhood_id
       LEFT JOIN territory_manager_assignments tma
         ON tma.territory_id = n.territory_id AND tma.status IN ('active', 'suspended')
       LEFT JOIN territory_finance_rules tfr
         ON tfr.territory_id = n.territory_id AND tfr.is_active = true
       WHERE r.id = $1
       ORDER BY tma.started_at DESC, tfr.created_at DESC
       LIMIT 1`,
      [rideId]
    );

    const row = ctx.rows[0] || {};
    const territoryId: string | null = row.territory_id || null;
    const assignmentId: string | null = row.assignment_id || null;
    const assignmentStatus: string | null = row.assignment_status || null;

    let matrixPct: number, managerPct: number, allocationReason: string;

    if (!territoryId || !assignmentId) {
      matrixPct = 100; managerPct = 0; allocationReason = 'no_manager';
    } else if (assignmentStatus === 'suspended') {
      matrixPct = Number(row.matrix_share_percent || 60);
      managerPct = Number(row.regional_share_percent || 40);
      allocationReason = 'manager_suspended';
    } else {
      matrixPct = Number(row.matrix_share_percent || 60);
      managerPct = Number(row.regional_share_percent || 40);
      allocationReason = 'standard';
    }

    const matrixShareCents = Math.round(feeAmountCents * matrixPct / 100);
    const managerShareCents = feeAmountCents - matrixShareCents;
    const driverEarningsCents = finalPriceCents - feeAmountCents;
    const legacyNominalCents = legacyCreditCost * LEGACY_CONSERVATIVE_NOMINAL_CENTS_PER_CREDIT;
    const divergenceCents = feeAmountCents - legacyNominalCents;
    const refMonth = getReferenceMonth(new Date());

    await pool.query(
      `INSERT INTO wallet_shadow_results
        (ride_id, driver_id, calculation_version, calculation_status,
         final_price_cents, wait_charge_cents, fee_config_id,
         fee_percent, fee_amount_cents,
         matrix_share_percent, matrix_share_cents,
         manager_share_percent, manager_share_cents,
         driver_earnings_cents, territory_id, assignment_id, assignment_status,
         allocation_reason, legacy_credit_cost, legacy_nominal_value_cents,
         divergence_cents, reference_month, updated_at)
       VALUES ($1,$2,1,'success',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,NOW())
       ON CONFLICT (ride_id, calculation_version) DO UPDATE SET
         calculation_status = 'success',
         final_price_cents = EXCLUDED.final_price_cents,
         wait_charge_cents = EXCLUDED.wait_charge_cents,
         fee_config_id = EXCLUDED.fee_config_id,
         fee_percent = EXCLUDED.fee_percent,
         fee_amount_cents = EXCLUDED.fee_amount_cents,
         matrix_share_percent = EXCLUDED.matrix_share_percent,
         matrix_share_cents = EXCLUDED.matrix_share_cents,
         manager_share_percent = EXCLUDED.manager_share_percent,
         manager_share_cents = EXCLUDED.manager_share_cents,
         driver_earnings_cents = EXCLUDED.driver_earnings_cents,
         territory_id = EXCLUDED.territory_id,
         assignment_id = EXCLUDED.assignment_id,
         assignment_status = EXCLUDED.assignment_status,
         allocation_reason = EXCLUDED.allocation_reason,
         legacy_credit_cost = EXCLUDED.legacy_credit_cost,
         legacy_nominal_value_cents = EXCLUDED.legacy_nominal_value_cents,
         divergence_cents = EXCLUDED.divergence_cents,
         reference_month = EXCLUDED.reference_month,
         error_code = NULL, error_message = NULL,
         updated_at = NOW()`,
      [rideId, driverId, finalPriceCents, waitChargeCents, 'FLAT_CONSTANT_BPS_1800',
       feePercent, feeAmountCents, matrixPct, matrixShareCents,
       managerPct, managerShareCents, driverEarningsCents,
       territoryId, assignmentId, assignmentStatus,
       allocationReason, legacyCreditCost, legacyNominalCents,
       divergenceCents, refMonth]
    );
  } catch (err) {
    await persistError(rideId, driverId, finalPriceCents, waitChargeCents, legacyCreditCost,
      'CALCULATION_EXCEPTION', (err as Error).message?.slice(0, 500));
    console.error(`[SHADOW_ERROR] ride=${rideId}`, err);
  }
}

async function persistError(
  rideId: string, driverId: string, finalPriceCents: number, waitChargeCents: number,
  legacyCreditCost: number, errorCode: string, errorMessage: string
) {
  try {
    await pool.query(
      `INSERT INTO wallet_shadow_results
        (ride_id, driver_id, calculation_version, calculation_status,
         final_price_cents, wait_charge_cents, legacy_credit_cost,
         legacy_nominal_value_cents, error_code, error_message, updated_at)
       VALUES ($1,$2,1,'error',$3,$4,$5,$6,$7,$8,NOW())
       ON CONFLICT (ride_id, calculation_version) DO UPDATE SET
         calculation_status = 'error', error_code = EXCLUDED.error_code,
         error_message = EXCLUDED.error_message, updated_at = NOW()`,
      [rideId, driverId, finalPriceCents, waitChargeCents,
       legacyCreditCost, legacyCreditCost * LEGACY_CONSERVATIVE_NOMINAL_CENTS_PER_CREDIT,
       errorCode, errorMessage]
    );
  } catch { /* last resort: console only */ }
}

function getReferenceMonth(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date);
  const year = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  return `${year}-${month}-01`;
}
