#!/usr/bin/env npx ts-node
/**
 * Family Return Reconciliation — Dry-Run (Read-Only)
 *
 * Compares per-driver:
 * - legacy_accrued_cents: total existing in family_return_accruals
 * - legacy_expected_from_recharges_cents: 10% of confirmed wallet_recharges
 * - legacy_expected_from_credit_purchases_cents: 10% of confirmed driver_credit_purchases
 * - actual_fee_debit_cents: sum of fee_debit entries in wallet_ledger
 * - actual_pending_resolve_cents: sum of pending_resolve entries in wallet_ledger
 * - actual_consumed_fee_cents: fee_debit + pending_resolve (effective consumption)
 * - new_policy_expected_incentive_cents: floor(actual_consumed_fee_cents × 10%)
 * - legacy_vs_new_policy_difference_cents: legacy_accrued - new_policy_expected
 *
 * Classifications:
 * - MATCHED: legacy accrued matches new policy expected (within tolerance)
 * - OVER_ACCRUED: legacy accrued > new policy expected
 * - UNDER_ACCRUED: legacy accrued < new policy expected
 * - LEGACY_REQUEST_EXISTS: driver has a retorno_familiar_requests entry (not paid)
 * - LEGACY_APPROVED_UNPAID: request approved but not yet paid
 * - LEGACY_PAID: request was marked as paid
 * - DUPLICATE_SOURCE: wallet_ledger has duplicate idempotency_keys
 * - ORPHAN_RECORD: accrual exists but no matching financial source
 * - MANUAL_REVIEW: cannot be classified automatically
 *
 * SAFETY:
 * - Read-only: NO INSERT, UPDATE, or DELETE statements
 * - Calls assertSafeFinanceDatabase() before connecting
 * - Only works on local dev/test databases
 *
 * Usage:
 *   DATABASE_URL=postgresql://kaviar:kaviar@127.0.0.1:5432/kaviar_dev \
 *   npx ts-node src/scripts/reconcile-family-return-dryrun.ts [--json] [--year=2026]
 */

import pg from 'pg';
import { assertSafeFinanceDatabase } from '../lib/assert-safe-finance-db';

// --- Safety check BEFORE any database connection ---
assertSafeFinanceDatabase();

// --- Types ---
type Classification =
  | 'MATCHED'
  | 'OVER_ACCRUED'
  | 'UNDER_ACCRUED'
  | 'LEGACY_REQUEST_EXISTS'
  | 'LEGACY_APPROVED_UNPAID'
  | 'LEGACY_PAID'
  | 'DUPLICATE_SOURCE'
  | 'ORPHAN_RECORD'
  | 'MANUAL_REVIEW';

type DriverReconciliationRow = {
  driver_id: string;
  legacy_accrued_cents: number;
  legacy_accrued_count: number;
  legacy_expected_from_recharges_cents: number;
  legacy_expected_from_credit_purchases_cents: number;
  actual_fee_debit_cents: number;
  actual_pending_resolve_cents: number;
  actual_consumed_fee_cents: number;
  new_policy_expected_incentive_cents: number;
  legacy_vs_new_policy_difference_cents: number;
  has_legacy_request: boolean;
  legacy_request_status: string | null;
  has_duplicate_idempotency_keys: boolean;
  duplicate_ledger_ids: string[];
  classification: Classification;
  notes: string[];
};

type ReconciliationReport = {
  generated_at: string;
  year: number;
  incentive_percent: number;
  summary: {
    total_drivers: number;
    matched: number;
    over_accrued: number;
    under_accrued: number;
    legacy_request_exists: number;
    legacy_approved_unpaid: number;
    legacy_paid: number;
    duplicate_source: number;
    orphan_records: number;
    manual_review: number;
  };
  drivers: DriverReconciliationRow[];
};

// --- Parse args ---
const args = process.argv.slice(2);
const jsonOutput = args.includes('--json');
const yearArg = args.find((a) => a.startsWith('--year='));
const year = yearArg ? parseInt(yearArg.split('=')[1], 10) : new Date().getFullYear();
const incentivePercent = parseInt(process.env.FAMILY_RETURN_PERCENT || '10', 10);

// --- Main ---
async function main(): Promise<void> {
  const { Pool } = pg;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const report = await generateReport(pool, year, incentivePercent);
    if (jsonOutput) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printReport(report);
    }
  } finally {
    await pool.end();
  }
}

async function generateReport(pool: pg.Pool, year: number, percent: number): Promise<ReconciliationReport> {
  // 1. Get all drivers with financial activity in the year
  const driversResult = await pool.query(`
    SELECT DISTINCT driver_id FROM (
      SELECT driver_id FROM family_return_accruals
        WHERE EXTRACT(YEAR FROM created_at) = $1
      UNION
      SELECT driver_id FROM driver_credit_purchases
        WHERE status = 'confirmed' AND paid_at IS NOT NULL
          AND EXTRACT(YEAR FROM paid_at) = $1
      UNION
      SELECT driver_id FROM wallet_recharges
        WHERE status = 'confirmed' AND confirmed_at IS NOT NULL
          AND EXTRACT(YEAR FROM confirmed_at) = $1
      UNION
      SELECT driver_id FROM wallet_ledger
        WHERE entry_type IN ('fee_debit', 'pending_resolve')
          AND EXTRACT(YEAR FROM created_at) = $1
    ) AS all_drivers
  `, [year]);

  const driverIds: string[] = driversResult.rows.map((r: any) => r.driver_id);

  if (driverIds.length === 0) {
    return emptyReport(year, percent);
  }

  // 2. Accruals per driver
  const accrualsResult = await pool.query(`
    SELECT driver_id,
           COALESCE(SUM(accrued_amount_cents), 0)::bigint AS total_cents,
           COUNT(*)::int AS cnt
    FROM family_return_accruals
    WHERE EXTRACT(YEAR FROM created_at) = $1
    GROUP BY driver_id
  `, [year]);
  const accrualsMap = new Map<string, { total: number; count: number }>();
  for (const row of accrualsResult.rows) {
    accrualsMap.set(row.driver_id, { total: Number(row.total_cents), count: row.cnt });
  }

  // 3. Legacy credit purchases per driver (for legacy reference)
  const purchasesResult = await pool.query(`
    SELECT driver_id,
           COALESCE(SUM(amount_cents), 0)::bigint AS total_cents
    FROM driver_credit_purchases
    WHERE status = 'confirmed' AND paid_at IS NOT NULL
      AND EXTRACT(YEAR FROM paid_at) = $1
    GROUP BY driver_id
  `, [year]);
  const purchasesMap = new Map<string, number>();
  for (const row of purchasesResult.rows) {
    purchasesMap.set(row.driver_id, Number(row.total_cents));
  }

  // 4. Wallet recharges confirmed (legacy calculation base)
  const rechargesResult = await pool.query(`
    SELECT driver_id,
           COALESCE(SUM(amount_cents), 0)::bigint AS total_cents
    FROM wallet_recharges
    WHERE status = 'confirmed' AND confirmed_at IS NOT NULL
      AND EXTRACT(YEAR FROM confirmed_at) = $1
    GROUP BY driver_id
  `, [year]);
  const rechargesMap = new Map<string, number>();
  for (const row of rechargesResult.rows) {
    rechargesMap.set(row.driver_id, Number(row.total_cents));
  }

  // 5. fee_debit totals per driver (deduplicated by idempotency_key)
  const feeDebitResult = await pool.query(`
    SELECT driver_id,
           COALESCE(SUM(ABS(balance_delta_cents)), 0)::bigint AS total_cents
    FROM (
      SELECT DISTINCT ON (idempotency_key) id, driver_id, balance_delta_cents
      FROM wallet_ledger
      WHERE entry_type = 'fee_debit'
        AND EXTRACT(YEAR FROM created_at) = $1
      ORDER BY idempotency_key, id ASC
    ) AS deduped
    GROUP BY driver_id
  `, [year]);
  const feeDebitMap = new Map<string, number>();
  for (const row of feeDebitResult.rows) {
    feeDebitMap.set(row.driver_id, Number(row.total_cents));
  }

  // 6. pending_resolve totals per driver (deduplicated by idempotency_key)
  const pendingResolveResult = await pool.query(`
    SELECT driver_id,
           COALESCE(SUM(ABS(balance_delta_cents)), 0)::bigint AS total_cents
    FROM (
      SELECT DISTINCT ON (idempotency_key) id, driver_id, balance_delta_cents
      FROM wallet_ledger
      WHERE entry_type = 'pending_resolve'
        AND EXTRACT(YEAR FROM created_at) = $1
      ORDER BY idempotency_key, id ASC
    ) AS deduped
    GROUP BY driver_id
  `, [year]);
  const pendingResolveMap = new Map<string, number>();
  for (const row of pendingResolveResult.rows) {
    pendingResolveMap.set(row.driver_id, Number(row.total_cents));
  }

  // 7. Detect duplicate idempotency_keys in wallet_ledger (fee_debit + pending_resolve)
  const duplicatesResult = await pool.query(`
    SELECT driver_id, idempotency_key, array_agg(id ORDER BY id) AS ids
    FROM wallet_ledger
    WHERE entry_type IN ('fee_debit', 'pending_resolve')
      AND EXTRACT(YEAR FROM created_at) = $1
    GROUP BY driver_id, idempotency_key
    HAVING COUNT(*) > 1
  `, [year]);
  const duplicatesMap = new Map<string, string[]>();
  for (const row of duplicatesResult.rows) {
    const existing = duplicatesMap.get(row.driver_id) || [];
    existing.push(...row.ids.map((id: any) => String(id)));
    duplicatesMap.set(row.driver_id, existing);
  }

  // 8. Legacy requests
  const requestsResult = await pool.query(`
    SELECT driver_id, status
    FROM retorno_familiar_requests
    WHERE year = $1
  `, [year]);
  const requestsMap = new Map<string, string>();
  for (const row of requestsResult.rows) {
    requestsMap.set(row.driver_id, row.status);
  }

  // 9. Build per-driver reconciliation
  const drivers: DriverReconciliationRow[] = [];

  for (const driverId of driverIds) {
    const accruals = accrualsMap.get(driverId) || { total: 0, count: 0 };
    const purchasesTotal = purchasesMap.get(driverId) || 0;
    const rechargesTotal = rechargesMap.get(driverId) || 0;
    const feeDebit = feeDebitMap.get(driverId) || 0;
    const pendingResolve = pendingResolveMap.get(driverId) || 0;
    const requestStatus = requestsMap.get(driverId) || null;
    const duplicateIds = duplicatesMap.get(driverId) || [];

    // Calculations
    const actualConsumedFee = feeDebit + pendingResolve;
    const newPolicyExpected = Math.floor(actualConsumedFee * percent / 100);
    const legacyExpectedFromRecharges = Math.floor(rechargesTotal * percent / 100);
    const legacyExpectedFromPurchases = Math.floor(purchasesTotal * percent / 100);
    const legacyVsNewDifference = accruals.total - newPolicyExpected;

    const notes: string[] = [];
    let classification: Classification;

    // Classify — priority order
    if (duplicateIds.length > 0) {
      classification = 'DUPLICATE_SOURCE';
      notes.push(`Duplicate idempotency_keys found. Affected ledger IDs: ${duplicateIds.join(', ')}`);
    } else if (requestStatus === 'paid') {
      classification = 'LEGACY_PAID';
      notes.push(`Legacy request paid (status=${requestStatus})`);
    } else if (requestStatus === 'approved') {
      classification = 'LEGACY_APPROVED_UNPAID';
      notes.push(`Legacy request approved but not yet paid (status=${requestStatus})`);
    } else if (requestStatus) {
      classification = 'LEGACY_REQUEST_EXISTS';
      notes.push(`Legacy request exists (status=${requestStatus})`);
    } else if (accruals.count > 0 && rechargesTotal === 0 && purchasesTotal === 0 && actualConsumedFee === 0) {
      classification = 'ORPHAN_RECORD';
      notes.push('Accruals exist but no confirmed recharges, purchases, or fee consumption found');
    } else if (legacyVsNewDifference === 0) {
      classification = 'MATCHED';
    } else if (legacyVsNewDifference > 0) {
      classification = 'OVER_ACCRUED';
      notes.push(`Legacy accrued ${legacyVsNewDifference}¢ more than new policy expects`);
    } else {
      classification = 'UNDER_ACCRUED';
      notes.push(`Legacy accrued ${Math.abs(legacyVsNewDifference)}¢ less than new policy expects`);
    }

    // Additional context
    if (actualConsumedFee === 0 && accruals.total > 0 && classification !== 'ORPHAN_RECORD' && classification !== 'DUPLICATE_SOURCE') {
      notes.push('No fee consumption yet — new policy would yield 0¢');
    }
    if (rechargesTotal > 0 && actualConsumedFee === 0) {
      notes.push('Has recharges but no fee consumption (new driver or pre-wallet-v2)');
    }

    drivers.push({
      driver_id: driverId,
      legacy_accrued_cents: accruals.total,
      legacy_accrued_count: accruals.count,
      legacy_expected_from_recharges_cents: legacyExpectedFromRecharges,
      legacy_expected_from_credit_purchases_cents: legacyExpectedFromPurchases,
      actual_fee_debit_cents: feeDebit,
      actual_pending_resolve_cents: pendingResolve,
      actual_consumed_fee_cents: actualConsumedFee,
      new_policy_expected_incentive_cents: newPolicyExpected,
      legacy_vs_new_policy_difference_cents: legacyVsNewDifference,
      has_legacy_request: !!requestStatus,
      legacy_request_status: requestStatus,
      has_duplicate_idempotency_keys: duplicateIds.length > 0,
      duplicate_ledger_ids: duplicateIds,
      classification,
      notes,
    });
  }

  // Sort: duplicates and manual_review first, then by absolute difference descending
  drivers.sort((a, b) => {
    const priority: Record<Classification, number> = {
      DUPLICATE_SOURCE: 0,
      MANUAL_REVIEW: 1,
      ORPHAN_RECORD: 2,
      OVER_ACCRUED: 3,
      UNDER_ACCRUED: 4,
      LEGACY_PAID: 5,
      LEGACY_APPROVED_UNPAID: 6,
      LEGACY_REQUEST_EXISTS: 7,
      MATCHED: 8,
    };
    const pa = priority[a.classification] ?? 99;
    const pb = priority[b.classification] ?? 99;
    if (pa !== pb) return pa - pb;
    return Math.abs(b.legacy_vs_new_policy_difference_cents) - Math.abs(a.legacy_vs_new_policy_difference_cents);
  });

  // Summary
  const summary = {
    total_drivers: drivers.length,
    matched: drivers.filter((d) => d.classification === 'MATCHED').length,
    over_accrued: drivers.filter((d) => d.classification === 'OVER_ACCRUED').length,
    under_accrued: drivers.filter((d) => d.classification === 'UNDER_ACCRUED').length,
    legacy_request_exists: drivers.filter((d) => d.classification === 'LEGACY_REQUEST_EXISTS').length,
    legacy_approved_unpaid: drivers.filter((d) => d.classification === 'LEGACY_APPROVED_UNPAID').length,
    legacy_paid: drivers.filter((d) => d.classification === 'LEGACY_PAID').length,
    duplicate_source: drivers.filter((d) => d.classification === 'DUPLICATE_SOURCE').length,
    orphan_records: drivers.filter((d) => d.classification === 'ORPHAN_RECORD').length,
    manual_review: drivers.filter((d) => d.classification === 'MANUAL_REVIEW').length,
  };

  return {
    generated_at: new Date().toISOString(),
    year,
    incentive_percent: percent,
    summary,
    drivers,
  };
}

function emptyReport(year: number, percent: number): ReconciliationReport {
  return {
    generated_at: new Date().toISOString(),
    year,
    incentive_percent: percent,
    summary: { total_drivers: 0, matched: 0, over_accrued: 0, under_accrued: 0, legacy_request_exists: 0, legacy_approved_unpaid: 0, legacy_paid: 0, duplicate_source: 0, orphan_records: 0, manual_review: 0 },
    drivers: [],
  };
}

function printReport(report: ReconciliationReport): void {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  FAMILY RETURN → ANNUAL INCENTIVE RECONCILIATION (DRY-RUN)');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  Generated: ${report.generated_at}`);
  console.log(`  Year: ${report.year} | Incentive: ${report.incentive_percent}%`);
  console.log(`  Formula: floor(actual_consumed_fee_cents × ${report.incentive_percent}%)`);
  console.log('───────────────────────────────────────────────────────────────────');
  console.log('  SUMMARY');
  console.log(`  Total drivers analyzed:    ${report.summary.total_drivers}`);
  console.log(`  ✓ MATCHED:                 ${report.summary.matched}`);
  console.log(`  ↑ OVER_ACCRUED:            ${report.summary.over_accrued}`);
  console.log(`  ↓ UNDER_ACCRUED:           ${report.summary.under_accrued}`);
  console.log(`  ⚡ DUPLICATE_SOURCE:        ${report.summary.duplicate_source}`);
  console.log(`  ⚠ LEGACY_REQUEST_EXISTS:   ${report.summary.legacy_request_exists}`);
  console.log(`  ◎ LEGACY_APPROVED_UNPAID:  ${report.summary.legacy_approved_unpaid}`);
  console.log(`  $ LEGACY_PAID:             ${report.summary.legacy_paid}`);
  console.log(`  ? ORPHAN_RECORD:           ${report.summary.orphan_records}`);
  console.log(`  ! MANUAL_REVIEW:           ${report.summary.manual_review}`);
  console.log('───────────────────────────────────────────────────────────────────');

  if (report.drivers.length === 0) {
    console.log('  No drivers found for reconciliation.');
    console.log('═══════════════════════════════════════════════════════════════════');
    return;
  }

  console.log('');
  console.log('  DETAILS (sorted by priority)');
  console.log('');

  for (const d of report.drivers) {
    const icon = d.classification === 'MATCHED' ? '✓' :
                 d.classification === 'OVER_ACCRUED' ? '↑' :
                 d.classification === 'UNDER_ACCRUED' ? '↓' :
                 d.classification === 'DUPLICATE_SOURCE' ? '⚡' :
                 d.classification === 'MANUAL_REVIEW' ? '!' : '⚠';

    console.log(`  [${icon}] ${d.classification} — driver: ${d.driver_id}`);
    console.log(`      Legacy accrued:         ${d.legacy_accrued_cents}¢ (${d.legacy_accrued_count} records)`);
    console.log(`      Legacy exp. recharges:  ${d.legacy_expected_from_recharges_cents}¢`);
    console.log(`      Legacy exp. purchases:  ${d.legacy_expected_from_credit_purchases_cents}¢`);
    console.log(`      Actual fee_debit:       ${d.actual_fee_debit_cents}¢`);
    console.log(`      Actual pending_resolve: ${d.actual_pending_resolve_cents}¢`);
    console.log(`      Actual consumed fee:    ${d.actual_consumed_fee_cents}¢`);
    console.log(`      New policy expected:    ${d.new_policy_expected_incentive_cents}¢`);
    console.log(`      Legacy vs New diff:     ${d.legacy_vs_new_policy_difference_cents > 0 ? '+' : ''}${d.legacy_vs_new_policy_difference_cents}¢`);
    if (d.has_duplicate_idempotency_keys) {
      console.log(`      ⚡ DUPLICATES: ledger IDs [${d.duplicate_ledger_ids.join(', ')}]`);
    }
    if (d.notes.length > 0) {
      console.log(`      Notes: ${d.notes.join('; ')}`);
    }
    console.log('');
  }

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  This is a DRY-RUN report. No data was modified.');
  console.log('  Amounts are in centavos. Arredondamento: Math.floor (trunca).');
  console.log('═══════════════════════════════════════════════════════════════════');
}

// --- Run ---
main().catch((err) => {
  console.error('RECONCILIATION FAILED:', err.message);
  process.exit(1);
});
