/**
 * Types and constants for the Annual Incentive Reconciliation Service.
 * Etapa 2C.4A — Reconciliador read-only do modo sombra.
 */

// ─── Reconciliation Statuses ────────────────────────────────────────────────

export const RECONCILIATION_STATUSES = [
  'MATCH',
  'MISSING_ACCRUAL',
  'UNEXPECTED_ACCRUAL',
  'AMOUNT_MISMATCH',
  'BASE_AMOUNT_MISMATCH',
  'RATE_MISMATCH',
  'POLICY_VERSION_MISMATCH',
  'PROGRAM_YEAR_MISMATCH',
  'OCCURRED_AT_MISMATCH',
  'DRIVER_MISMATCH',
  'SOURCE_ID_MISMATCH',
  'SOURCE_TYPE_MISMATCH',
  'IDEMPOTENCY_KEY_MISMATCH',
  'CORRELATION_ID_MISMATCH',
  'DUPLICATE_SOURCE',
  'ORPHAN_ACCRUAL',
  'EXPECTED_ZERO_INCREMENT',
  'ACCRUAL_EXISTS_FOR_ZERO_INCREMENT',
  'UNRESOLVED_PENDING_REFERENCE',
  'REVERSAL_PRESENT_REVIEW_REQUIRED',
] as const;

export type ReconciliationStatus = typeof RECONCILIATION_STATUSES[number];

// ─── Shadow Configuration States ────────────────────────────────────────────

export const SHADOW_STATES = [
  'SHADOW_DISABLED_EXPECTED_LEDGER_EMPTY',
  'SHADOW_DISABLED_WRITE_AVAILABLE',
  'SHADOW_ACTIVE',
  'INVALID_SHADOW_CONFIGURATION',
] as const;

export type ShadowState = typeof SHADOW_STATES[number];

// ─── Reconciliation Item ────────────────────────────────────────────────────

export interface ReconciliationItem {
  driverId: string;
  rideId: string;
  walletLedgerEntryId: string;
  walletEntryType: string;
  walletCreatedAt: Date;
  programYear: number;
  consumedFeeAmountCents: bigint;
  cumulativeBaseCents: bigint;
  expectedIncrementCents: bigint;
  expectedIdempotencyKey: string;
  actualAnnualIncentiveEventId: string | null;
  actualAmountCents: bigint | null;
  actualBaseAmountCents: bigint | null;
  actualRateBasisPoints: number | null;
  actualPolicyVersion: string | null;
  actualProgramYear: number | null;
  actualOccurredAt: Date | null;
  statuses: ReconciliationStatus[];
}

// ─── Reversal Item ──────────────────────────────────────────────────────────

export interface ReversalItem {
  eventId: string;
  driverId: string;
  programYear: number;
  amountCents: bigint;
  reversalOfId: string | null;
  sourceId: string | null;
  statuses: ReconciliationStatus[];
  issues: string[];
}

// ─── Totals ─────────────────────────────────────────────────────────────────

export interface ReconciliationTotals {
  totalConsumedFeeCents: bigint;
  expectedGrossAccrualCents: bigint;
  actualGrossAccrualCents: bigint;
  actualReversalCents: bigint;
  actualNetAccrualCents: bigint;
  differenceCents: bigint;
  wouldAccrueCents: bigint;
  walletEventCount: number;
  expectedAccrualEventCount: number;
  actualAccrualEventCount: number;
  matchedCount: number;
  mismatchCount: number;
  missingCount: number;
  orphanCount: number;
  duplicateCount: number;
  zeroIncrementCount: number;
  unresolvedPendingReferenceCount: number;
  reversalReviewCount: number;
  unexpectedCount: number;
}

// ─── Groups ─────────────────────────────────────────────────────────────────

export interface ReconciliationGroup {
  totalConsumedFeeCents: bigint;
  expectedGrossAccrualCents: bigint;
  actualGrossAccrualCents: bigint;
  actualReversalCents: bigint;
  actualNetAccrualCents: bigint;
  differenceCents: bigint;
  itemCount: number;
}

export interface ReconciliationGroups {
  byDriver: Record<string, ReconciliationGroup>;
  byProgramYear: Record<number, ReconciliationGroup>;
  byRide: Record<string, ReconciliationGroup>;
  bySourceType: Record<string, ReconciliationGroup>;
  byStatus: Record<string, number>;
}

// ─── Filters ────────────────────────────────────────────────────────────────

export interface ReconciliationFilters {
  driverId?: string;
  rideId?: string;
  programYear?: number;
  from?: Date;
  to?: Date;
}

// ─── Configuration ──────────────────────────────────────────────────────────

export interface ReconciliationConfiguration {
  shadowState: ShadowState;
  shadowEnabled: boolean;
  writeEnabled: boolean;
  databaseSafe: boolean;
}

// ─── Report ─────────────────────────────────────────────────────────────────

export interface ReconciliationReport {
  reportVersion: string;
  generatedAt: Date;
  configuration: ReconciliationConfiguration;
  filters: ReconciliationFilters;
  totals: ReconciliationTotals;
  groups: ReconciliationGroups;
  items: ReconciliationItem[];
  reversals: ReversalItem[];
  orphans: ReconciliationItem[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const RATE_BASIS_POINTS = 1000n;
export const BASIS_POINTS_DENOMINATOR = 10000n;
export const POLICY_VERSION = 'ANNUAL-INCENTIVE-v1';
export const REPORT_VERSION = 'annual-incentive-reconciliation-v1';
