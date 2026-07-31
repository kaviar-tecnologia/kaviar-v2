/**
 * Types for the Annual Incentive Ledger service.
 */

// ─── Event Types ────────────────────────────────────────────────────────────

export const ANNUAL_INCENTIVE_EVENT_TYPES = [
  'ACCRUAL',
  'REVERSAL',
  'REQUEST_RESERVATION',
  'RELEASE',
  'PAYMENT',
  'CARRY_FORWARD_IN',
  'CARRY_FORWARD_OUT',
] as const;

export type AnnualIncentiveEventType = typeof ANNUAL_INCENTIVE_EVENT_TYPES[number];

// ─── Source Types ───────────────────────────────────────────────────────────

export const ANNUAL_INCENTIVE_SOURCE_TYPES = [
  'FEE_DEBIT',
  'PENDING_RESOLVE',
  'CANCEL_COMPENSATION',
  'MANUAL_RECONCILIATION',
  'LEGACY_IMPORT',
  'REQUEST',
  'PAYMENT',
  'CARRY_FORWARD',
] as const;

export type AnnualIncentiveSourceType = typeof ANNUAL_INCENTIVE_SOURCE_TYPES[number];

// ─── Input ──────────────────────────────────────────────────────────────────

export interface AppendEventInput {
  driverId: string;
  programYear: number;
  eventType: AnnualIncentiveEventType;
  amountCents: bigint;
  baseAmountCents: bigint | null;
  rateBasisPoints: number | null;
  policyVersion: string;
  sourceType: AnnualIncentiveSourceType;
  sourceId: string | null;
  sourceEventId: string | null;
  requestId: string | null;
  correlationId: string | null;
  reversalOfId: string | null;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  occurredAt: Date;
}

// ─── Stored Event ───────────────────────────────────────────────────────────

export interface AnnualIncentiveLedgerEvent {
  id: string;
  driverId: string;
  programYear: number;
  eventType: AnnualIncentiveEventType;
  amountCents: bigint;
  baseAmountCents: bigint | null;
  rateBasisPoints: number | null;
  policyVersion: string;
  sourceType: AnnualIncentiveSourceType;
  sourceId: string | null;
  sourceEventId: string | null;
  requestId: string | null;
  correlationId: string | null;
  reversalOfId: string | null;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
  occurredAt: Date;
  createdAt: Date;
}

// ─── Result ─────────────────────────────────────────────────────────────────

export interface AppendEventResult {
  event: AnnualIncentiveLedgerEvent;
  created: boolean;
}

// ─── Query Options ──────────────────────────────────────────────────────────

export interface ListDriverEventsOptions {
  programYear?: number;
  eventType?: AnnualIncentiveEventType;
  occurredFrom?: Date;
  occurredTo?: Date;
  limit?: number;
  afterId?: string;
}

// ─── Errors ─────────────────────────────────────────────────────────────────

export const ANNUAL_INCENTIVE_ERRORS = {
  WRITE_DISABLED: 'ANNUAL_INCENTIVE_WRITE_DISABLED',
  IDEMPOTENCY_CONFLICT: 'ANNUAL_INCENTIVE_IDEMPOTENCY_CONFLICT',
  SOURCE_CONFLICT: 'ANNUAL_INCENTIVE_SOURCE_CONFLICT',
  INVALID_AMOUNT: 'ANNUAL_INCENTIVE_INVALID_AMOUNT',
  INVALID_INPUT: 'ANNUAL_INCENTIVE_INVALID_INPUT',
} as const;
