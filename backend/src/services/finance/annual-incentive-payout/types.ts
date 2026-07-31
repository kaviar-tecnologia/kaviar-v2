/**
 * Types for the Annual Incentive Payout system (Marco 3).
 *
 * Design decision: saldo permanece no program_year original.
 * Alocação FIFO distribui o valor começando pelo ano mais antigo.
 */

// ─── Request Status (State Machine) ─────────────────────────────────────────

export const ANNUAL_INCENTIVE_REQUEST_STATUSES = [
  'RESERVED',
  'ELIGIBILITY_CHECKED',
  'QUEUED',
  'PROVIDER_CAPABILITY_CHECK',
  'SUBMITTING',
  'SUBMITTED',
  'PROCESSING',
  'PAID',
  'RETRYABLE_FAILURE',
  'BLOCKED',
  'BLOCKED_PROVIDER_CAPABILITY',
  'FAILED_RELEASED',
  'CANCELLED_RELEASED',
] as const;

export type AnnualIncentiveRequestStatus = typeof ANNUAL_INCENTIVE_REQUEST_STATUSES[number];

export const TERMINAL_STATUSES: readonly AnnualIncentiveRequestStatus[] = [
  'PAID',
  'FAILED_RELEASED',
  'CANCELLED_RELEASED',
];

export const OPEN_STATUSES: readonly AnnualIncentiveRequestStatus[] =
  ANNUAL_INCENTIVE_REQUEST_STATUSES.filter(s => !TERMINAL_STATUSES.includes(s));

// ─── Valid State Transitions ─────────────────────────────────────────────────

export const VALID_TRANSITIONS: Record<AnnualIncentiveRequestStatus, readonly AnnualIncentiveRequestStatus[]> = {
  RESERVED: ['ELIGIBILITY_CHECKED', 'BLOCKED', 'CANCELLED_RELEASED'],
  ELIGIBILITY_CHECKED: ['QUEUED', 'BLOCKED', 'BLOCKED_PROVIDER_CAPABILITY', 'CANCELLED_RELEASED'],
  QUEUED: ['PROVIDER_CAPABILITY_CHECK', 'SUBMITTING', 'BLOCKED', 'CANCELLED_RELEASED'],
  PROVIDER_CAPABILITY_CHECK: ['SUBMITTING', 'BLOCKED_PROVIDER_CAPABILITY', 'CANCELLED_RELEASED'],
  SUBMITTING: ['SUBMITTED', 'RETRYABLE_FAILURE', 'BLOCKED', 'FAILED_RELEASED'],
  SUBMITTED: ['PROCESSING', 'PAID', 'RETRYABLE_FAILURE', 'BLOCKED', 'FAILED_RELEASED', 'CANCELLED_RELEASED'],
  PROCESSING: ['PAID', 'RETRYABLE_FAILURE', 'BLOCKED', 'FAILED_RELEASED', 'CANCELLED_RELEASED'],
  PAID: [],
  RETRYABLE_FAILURE: ['QUEUED', 'BLOCKED', 'FAILED_RELEASED'],
  BLOCKED: ['FAILED_RELEASED', 'CANCELLED_RELEASED'],
  BLOCKED_PROVIDER_CAPABILITY: ['QUEUED', 'FAILED_RELEASED', 'CANCELLED_RELEASED'],
  FAILED_RELEASED: [],
  CANCELLED_RELEASED: [],
};

// ─── Payout Status ───────────────────────────────────────────────────────────

export const PAYOUT_STATUSES = [
  'PENDING',
  'SUBMITTING',
  'SUBMITTED',
  'PROCESSING',
  'DONE',
  'FAILED',
  'CANCELLED',
  'UNKNOWN_SUBMISSION',
  'BLOCKED_PROVIDER_RECONCILIATION',
] as const;

export type PayoutStatus = typeof PAYOUT_STATUSES[number];

// ─── Pix Key Types ───────────────────────────────────────────────────────────

export const ALLOWED_PIX_KEY_TYPES = ['CPF'] as const;
export type AllowedPixKeyType = typeof ALLOWED_PIX_KEY_TYPES[number];

// ─── Balance Projection ──────────────────────────────────────────────────────

export interface BalanceProjectionByYear {
  programYear: number;
  accruedCents: bigint;
  reversedCents: bigint;
  paidCents: bigint;
  openReservedCents: bigint;
  availableCents: bigint;
}

export interface BalanceProjection {
  driverId: string;
  byYear: BalanceProjectionByYear[];
  totalAccruedCents: bigint;
  totalReversedCents: bigint;
  totalPaidCents: bigint;
  totalOpenReservedCents: bigint;
  totalAvailableCents: bigint;
}

// ─── FIFO Allocation ─────────────────────────────────────────────────────────

export interface FifoAllocation {
  programYear: number;
  amountCents: bigint;
}

// ─── Request ─────────────────────────────────────────────────────────────────

export interface AnnualIncentiveRequest {
  id: string;
  driverId: string;
  requestedAmountCents: bigint;
  status: AnnualIncentiveRequestStatus;
  destinationSnapshotEncrypted: string;
  destinationHash: string;
  destinationMasked: string;
  requestedAt: Date;
  reservedAt: Date | null;
  eligibilityCheckedAt: Date | null;
  queuedAt: Date | null;
  paidAt: Date | null;
  failedAt: Date | null;
  releasedAt: Date | null;
  deadlineAt: Date;
  idempotencyKey: string;
  correlationId: string;
  failureCode: string | null;
  failureMessageSafe: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RequestAllocation {
  id: string;
  requestId: string;
  programYear: number;
  amountCents: bigint;
  createdAt: Date;
}

// ─── Payout Destination ──────────────────────────────────────────────────────

export interface PayoutDestination {
  id: string;
  driverId: string;
  provider: string;
  method: string;
  pixKeyType: AllowedPixKeyType;
  pixKeyEncrypted: string;
  pixKeyHash: string;
  pixKeyMasked: string;
  ownerDocumentHash: string;
  status: string;
  verifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  supersededAt: Date | null;
}

// ─── Payout ──────────────────────────────────────────────────────────────────

export interface AnnualIncentivePayout {
  id: string;
  requestId: string;
  driverId: string;
  amountCents: bigint;
  providerName: string;
  providerPayoutId: string | null;
  externalReference: string;
  status: PayoutStatus;
  providerStatus: string | null;
  providerResponseSafe: Record<string, unknown> | null;
  submittedAt: Date | null;
  confirmedAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Provider Interface ──────────────────────────────────────────────────────

export interface PayoutProviderAvailability {
  available: boolean;
  reason?: string;
}

export interface CreateAnnualIncentivePayoutInput {
  requestId: string;
  driverId: string;
  amountCents: bigint;
  pixKeyCpf: string; // normalized, no punctuation
  externalReference: string;
  idempotencyKey: string;
}

export interface CreateAnnualIncentivePayoutResult {
  success: boolean;
  providerPayoutId?: string;
  providerStatus?: string;
  errorCode?: string;
  errorMessage?: string;
  isDefinitiveFailure?: boolean;
  isTimeout?: boolean;
}

export interface GetAnnualIncentivePayoutResult {
  found: boolean;
  providerPayoutId?: string;
  providerStatus?: string;
  amountCents?: bigint;
  externalReference?: string;
  completedAt?: Date;
  failedAt?: Date;
}

export interface NormalizedAnnualIncentivePayoutEvent {
  providerEventId: string;
  providerPayoutId: string;
  eventType: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED' | 'CANCELLED' | 'UNKNOWN';
  amountCents?: bigint;
  externalReference?: string;
  raw: Record<string, unknown>;
}

export interface AnnualIncentivePayoutProvider {
  readonly providerName: string;

  validateAvailability(): Promise<PayoutProviderAvailability>;

  createPayout(
    input: CreateAnnualIncentivePayoutInput
  ): Promise<CreateAnnualIncentivePayoutResult>;

  getPayout(
    providerPayoutId: string
  ): Promise<GetAnnualIncentivePayoutResult>;

  findByExternalReference?(
    externalReference: string
  ): Promise<GetAnnualIncentivePayoutResult | null>;

  normalizeWebhook?(
    input: unknown
  ): NormalizedAnnualIncentivePayoutEvent;
}

// ─── Eligibility ─────────────────────────────────────────────────────────────

export interface EligibilityCheck {
  eligible: boolean;
  failureCode?: string;
  failureMessageSafe?: string;
  isDefinitive?: boolean;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export const PAYOUT_ERRORS = {
  WINDOW_CLOSED: 'ANNUAL_INCENTIVE_WINDOW_CLOSED',
  INSUFFICIENT_BALANCE: 'ANNUAL_INCENTIVE_INSUFFICIENT_BALANCE',
  INVALID_AMOUNT: 'ANNUAL_INCENTIVE_INVALID_AMOUNT',
  OPEN_REQUEST_EXISTS: 'ANNUAL_INCENTIVE_OPEN_REQUEST_EXISTS',
  DESTINATION_NOT_FOUND: 'ANNUAL_INCENTIVE_DESTINATION_NOT_FOUND',
  DESTINATION_INVALID: 'ANNUAL_INCENTIVE_DESTINATION_INVALID',
  CPF_MISMATCH: 'ANNUAL_INCENTIVE_CPF_MISMATCH',
  CPF_NOT_VERIFIED: 'ANNUAL_INCENTIVE_CPF_NOT_VERIFIED',
  IDEMPOTENCY_CONFLICT: 'ANNUAL_INCENTIVE_REQUEST_IDEMPOTENCY_CONFLICT',
  PROVIDER_UNAVAILABLE: 'ANNUAL_INCENTIVE_PROVIDER_UNAVAILABLE',
  PROVIDER_CAPABILITY_NOT_CONFIRMED: 'PAYOUT_PROVIDER_CAPABILITY_NOT_CONFIRMED',
  TRANSITION_INVALID: 'ANNUAL_INCENTIVE_TRANSITION_INVALID',
  ALREADY_PAID: 'ANNUAL_INCENTIVE_ALREADY_PAID',
  AMOUNT_MISMATCH: 'ANNUAL_INCENTIVE_AMOUNT_MISMATCH',
  PAYOUT_STATE_CONFLICT: 'CRITICAL_PAYOUT_STATE_CONFLICT',
  PRODUCTION_BLOCKED: 'ANNUAL_INCENTIVE_PRODUCTION_BLOCKED',
  FAKE_PROVIDER_IN_PRODUCTION: 'ANNUAL_INCENTIVE_FAKE_PROVIDER_IN_PRODUCTION',
} as const;
