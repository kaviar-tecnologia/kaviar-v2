/**
 * Types for Annual Incentive Shadow Readiness Service — Etapa 2C.4C
 *
 * Read-only operational health and readiness assessment.
 * No mutations, no flag changes, no corrections.
 */

// ─── Overall States ─────────────────────────────────────────────────────────

export const READINESS_STATES = [
  'READY_TO_ENABLE_SHADOW',
  'SHADOW_ACTIVE_HEALTHY',
  'SHADOW_ACTIVE_DEGRADED',
  'NOT_READY',
  'INVALID_CONFIGURATION',
  'INSUFFICIENT_TRAFFIC',
] as const;

export type ReadinessState = typeof READINESS_STATES[number];

// ─── Check Severity ─────────────────────────────────────────────────────────

export const CHECK_SEVERITIES = ['INFO', 'WARNING', 'BLOCKER'] as const;
export type CheckSeverity = typeof CHECK_SEVERITIES[number];

// ─── Check Status ───────────────────────────────────────────────────────────

export const CHECK_STATUSES = ['PASS', 'FAIL', 'NOT_APPLICABLE', 'UNKNOWN'] as const;
export type CheckStatus = typeof CHECK_STATUSES[number];

// ─── Individual Check ───────────────────────────────────────────────────────

export interface ReadinessCheck {
  id: string;
  name: string;
  severity: CheckSeverity;
  status: CheckStatus;
  message: string;
  evidence: string;
  recommendedAction: string;
}

// ─── Configuration State ────────────────────────────────────────────────────

export const CONFIGURATION_STATES = [
  'SHADOW_DISABLED',
  'WRITE_AVAILABLE_SHADOW_DISABLED',
  'SHADOW_ACTIVE',
  'INVALID_CONFIGURATION',
] as const;

export type ConfigurationState = typeof CONFIGURATION_STATES[number];

export interface FlagConfiguration {
  rawShadowValue: string | null;
  rawWriteValue: string | null;
  shadowEnabled: boolean;
  writeEnabled: boolean;
  configurationState: ConfigurationState;
  configurationSource: 'PROCESS_ENV';
  envShadowValue: string | null;
  envWriteValue: string | null;
  dbShadowValue: string | null;
  dbWriteValue: string | null;
  sourceDivergence: boolean;
}

// ─── Database Safety ────────────────────────────────────────────────────────

export interface DatabaseSafety {
  safe: boolean;
  hostname: string;
  databaseName: string;
  guardResult: string;
}

// ─── Structural Checks ─────────────────────────────────────────────────────

export interface StructuralCheckResult {
  ledgerTableExists: boolean;
  triggerExists: boolean;
  triggerEnabled: boolean;
  triggerState: string | null;
  idempotencyKeyConstraintExists: boolean;
  sourceIdentityConstraintExists: boolean;
  essentialColumnsPresent: boolean;
  essentialTypesCorrect: boolean;
  walletLedgerExists: boolean;
  pendingDebitsExists: boolean;
  timezone: string;
  policyVersion: string;
  checks: ReadinessCheck[];
}

// ─── Financial Metrics (from reconciler) ────────────────────────────────────

export interface FinancialMetrics {
  walletEventCount: number;
  expectedAccrualEventCount: number;
  actualAccrualEventCount: number;
  matchedCount: number;
  missingCount: number;
  mismatchCount: number;
  orphanCount: number;
  duplicateCount: number;
  unexpectedCount: number;
  zeroIncrementCount: number;
  reversalReviewCount: number;
  totalConsumedFeeCents: string;
  expectedGrossAccrualCents: string;
  actualGrossAccrualCents: string;
  actualNetAccrualCents: string;
  differenceCents: string;
  coverageBasisPoints: string | null;
}

// ─── Critical Divergences ───────────────────────────────────────────────────

export const CRITICAL_DIVERGENCE_TYPES_ALWAYS = [
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
  'UNEXPECTED_ACCRUAL',
  'ACCRUAL_EXISTS_FOR_ZERO_INCREMENT',
  'UNRESOLVED_PENDING_REFERENCE',
] as const;

export const CRITICAL_DIVERGENCE_TYPES_SHADOW_ACTIVE = [
  'MISSING_ACCRUAL',
  ...CRITICAL_DIVERGENCE_TYPES_ALWAYS,
] as const;

// ─── Pending Operations ─────────────────────────────────────────────────────

export interface PendingOperationsMetrics {
  pendingCount: number;
  failedCount: number;
  resolvedInWindowCount: number;
  oldestPendingCreatedAt: string | null;
  oldestPendingAgeHours: number | null;
  checks: ReadinessCheck[];
}

// ─── Legacy Coexistence ─────────────────────────────────────────────────────

export interface LegacyCoexistence {
  legacyAccrualRecordCountInWindow: number;
  annualIncentiveRecordCountInWindow: number;
  legacyCoexistenceDetected: boolean;
  checks: ReadinessCheck[];
}

// ─── Known Non-Atomic Boundaries ────────────────────────────────────────────

export interface NonAtomicBoundary {
  component: string;
  description: string;
  impact: string;
  severity: CheckSeverity;
  recommendedAction: string;
}

// ─── Filters ────────────────────────────────────────────────────────────────

export interface ReadinessFilters {
  driverId?: string;
  rideId?: string;
  programYear?: number;
  from?: Date;
  to?: Date;
  windowHours: number;
  expectedState?: 'disabled' | 'active';
}

// ─── Window ─────────────────────────────────────────────────────────────────

export interface ReadinessWindow {
  windowHours: number;
  from: string;
  to: string;
}

// ─── Full Report ────────────────────────────────────────────────────────────

export interface ReadinessReport {
  reportVersion: string;
  generatedAt: string;
  overallState: ReadinessState;
  databaseSafety: DatabaseSafety;
  configuration: FlagConfiguration;
  filters: {
    driverId: string | null;
    rideId: string | null;
    programYear: number | null;
    from: string | null;
    to: string | null;
  };
  window: ReadinessWindow;
  structuralChecks: ReadinessCheck[];
  financialChecks: ReadinessCheck[];
  operationalChecks: ReadinessCheck[];
  knownNonAtomicBoundaries: NonAtomicBoundary[];
  metrics: FinancialMetrics;
  reconciliation: {
    executed: boolean;
    criticalDivergenceCount: number;
    warningCount: number;
  };
  blockers: ReadinessCheck[];
  warnings: ReadinessCheck[];
  recommendations: string[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const READINESS_REPORT_VERSION = 'annual-incentive-shadow-readiness-v1';
export const EXPECTED_POLICY_VERSION = 'ANNUAL-INCENTIVE-v1';
export const EXPECTED_TIMEZONE = 'America/Sao_Paulo';
export const DEFAULT_WINDOW_HOURS = 24;
export const MIN_WINDOW_HOURS = 1;
export const MAX_WINDOW_HOURS = 720;

export const KNOWN_NON_ATOMIC_BOUNDARIES: NonAtomicBoundary[] = [
  {
    component: 'ride_fee_splits',
    description: 'O fee split (divisão da taxa para operador/parceiro) é gravado pós-commit da transação principal.',
    impact: 'Se a aplicação falhar entre o commit principal e o fee split, a divisão pode não ser registrada.',
    severity: 'WARNING',
    recommendedAction: 'Monitorar inconsistências de fee split; etapa futura de reconciliação territorial.',
  },
  {
    component: 'territory_ledger',
    description: 'O territory ledger (contabilidade territorial) é gravado pós-commit da transação principal.',
    impact: 'Se a aplicação falhar entre o commit principal e o territory ledger, o registro territorial pode não ser criado.',
    severity: 'WARNING',
    recommendedAction: 'Monitorar inconsistências territoriais; reconciliação territorial em etapa futura.',
  },
];

// ─── Essential Columns for annual_incentive_ledger ──────────────────────────

export const ESSENTIAL_COLUMNS: Record<string, string> = {
  id: 'text',
  driver_id: 'text',
  program_year: 'integer',
  event_type: 'text',
  amount_cents: 'bigint',
  base_amount_cents: 'bigint',
  rate_basis_points: 'integer',
  policy_version: 'text',
  source_type: 'text',
  source_id: 'text',
  source_event_id: 'text',
  correlation_id: 'text',
  reversal_of_id: 'text',
  idempotency_key: 'text',
  occurred_at: 'timestamp with time zone',
  created_at: 'timestamp with time zone',
};
