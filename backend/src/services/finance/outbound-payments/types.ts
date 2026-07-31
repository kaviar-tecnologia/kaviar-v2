/**
 * Types for the Outbound Payment Infrastructure (Marco 3.1).
 *
 * Architecture:
 *   SumUp → recebimentos e recargas (unchanged)
 *   Asaas → todos os pagamentos de saída
 */

// ─── Payee Types ─────────────────────────────────────────────────────────────

export const PAYEE_TYPES = [
  'DRIVER', 'MANAGER', 'ACCOUNTING_FIRM', 'SUPPLIER',
  'SERVICE_PROVIDER', 'EMPLOYEE', 'CONTRACTOR',
  'GOVERNMENT_ENTITY', 'UTILITY_PROVIDER', 'OTHER_LEGAL_PAYEE',
] as const;
export type PayeeType = typeof PAYEE_TYPES[number];

export const PAYEE_STATUSES = ['PENDING_VERIFICATION', 'ACTIVE', 'BLOCKED', 'DISABLED'] as const;
export type PayeeStatus = typeof PAYEE_STATUSES[number];

// ─── Payment Purposes ────────────────────────────────────────────────────────

export const PAYMENT_PURPOSES = [
  'DRIVER_ANNUAL_INCENTIVE', 'MANAGER_TERRITORIAL_COMMISSION',
  'ACCOUNTING_SERVICE', 'SUPPLIER_INVOICE', 'SERVICE_PROVIDER',
  'OPERATIONAL_EXPENSE', 'EMPLOYEE_OR_CONTRACTOR_REIMBURSEMENT',
  'TAX_OR_GOVERNMENT_PAYMENT', 'UTILITY_BILL',
  'OTHER_APPROVED_BUSINESS_EXPENSE',
] as const;
export type PaymentPurpose = typeof PAYMENT_PURPOSES[number];

// ─── Destination Methods ─────────────────────────────────────────────────────

export const DESTINATION_METHODS = [
  'PIX_CPF', 'PIX_CNPJ', 'PIX_EMAIL', 'PIX_PHONE', 'PIX_EVP',
  'BANK_ACCOUNT', 'BILL',
] as const;
export type DestinationMethod = typeof DESTINATION_METHODS[number];

export const INITIALLY_ENABLED_METHODS: readonly DestinationMethod[] = ['PIX_CPF', 'PIX_CNPJ'];

// ─── Instruments ─────────────────────────────────────────────────────────────

export const PAYMENT_INSTRUMENTS = [
  'ASAAS_PIX_TRANSFER', 'ASAAS_BANK_TRANSFER', 'ASAAS_BILL_PAYMENT',
] as const;
export type PaymentInstrument = typeof PAYMENT_INSTRUMENTS[number];

// ─── Obligation Status ───────────────────────────────────────────────────────

export const OBLIGATION_STATUSES = [
  'DRAFT', 'VALIDATING', 'APPROVED', 'SCHEDULED', 'RESERVED',
  'QUEUED', 'SUBMITTING', 'SUBMITTED', 'PROCESSING', 'PAID',
  'BLOCKED', 'BLOCKED_POLICY_REVIEW', 'RETRYABLE_FAILURE',
  'FAILED', 'CANCELLED',
] as const;
export type ObligationStatus = typeof OBLIGATION_STATUSES[number];

export const TERMINAL_OBLIGATION_STATUSES: readonly ObligationStatus[] = ['PAID', 'FAILED', 'CANCELLED'];

// ─── Payout Status ───────────────────────────────────────────────────────────

export const PAYOUT_STATUSES = [
  'PENDING', 'SUBMITTING', 'SUBMITTED', 'PROCESSING', 'DONE',
  'FAILED', 'CANCELLED', 'UNKNOWN_SUBMISSION', 'BLOCKED_PROVIDER_RECONCILIATION',
] as const;
export type OutboundPayoutStatus = typeof PAYOUT_STATUSES[number];

// ─── Provider Interface ──────────────────────────────────────────────────────

export interface ProviderAvailability {
  available: boolean;
  reason?: string;
}

export interface Money {
  amountCents: bigint;
  currency: string;
}

export interface CreateTransferInput {
  obligationId: string;
  payeeId: string;
  amountCents: bigint;
  pixAddressKey: string;
  pixAddressKeyType: 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';
  description?: string;
  externalReference: string;
}

export interface CreateTransferResult {
  success: boolean;
  providerTransferId?: string;
  providerStatus?: string;
  errorCode?: string;
  errorMessage?: string;
  isDefinitiveFailure?: boolean;
  isTimeout?: boolean;
}

export interface TransferResult {
  found: boolean;
  providerTransferId?: string;
  providerStatus?: string;
  amountCents?: bigint;
  externalReference?: string;
  feeCents?: bigint;
  completedAt?: Date;
  failedAt?: Date;
}

export interface CreateBillPaymentInput {
  obligationId: string;
  identificationField: string;
  description?: string;
  scheduleDate?: string;
  externalReference: string;
}

export interface CreateBillPaymentResult {
  success: boolean;
  providerBillId?: string;
  providerStatus?: string;
  amountCents?: bigint;
  discount?: bigint;
  errorCode?: string;
  errorMessage?: string;
  isDefinitiveFailure?: boolean;
  isTimeout?: boolean;
}

export interface BillPaymentResult {
  found: boolean;
  providerBillId?: string;
  providerStatus?: string;
  amountCents?: bigint;
  externalReference?: string;
  completedAt?: Date;
}

export interface NormalizedProviderEvent {
  providerEventId: string;
  providerPayoutId: string;
  eventCategory: 'TRANSFER' | 'BILL_PAYMENT';
  eventType: 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED' | 'CANCELLED' | 'UNKNOWN';
  amountCents?: bigint;
  externalReference?: string;
  raw: Record<string, unknown>;
}

export interface OutboundPaymentProvider {
  readonly providerName: string;

  validateAvailability(): Promise<ProviderAvailability>;

  getAvailableBalance(): Promise<Money>;

  createTransfer(input: CreateTransferInput): Promise<CreateTransferResult>;

  getTransfer(providerTransferId: string): Promise<TransferResult>;

  findTransferByExternalReference?(externalReference: string): Promise<TransferResult | null>;

  createBillPayment(input: CreateBillPaymentInput): Promise<CreateBillPaymentResult>;

  getBillPayment(providerBillId: string): Promise<BillPaymentResult>;

  normalizeWebhook(input: unknown): NormalizedProviderEvent;
}

// ─── Account Ownership Preflight ─────────────────────────────────────────────

export interface AccountOwnershipCheck {
  passed: boolean;
  personType?: string;
  cpfCnpj?: string;
  generalStatus?: string;
  transferCapability?: string;
  failureReason?: string;
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export const OUTBOUND_PAYMENT_ERRORS = {
  PROVIDER_UNAVAILABLE: 'OUTBOUND_PROVIDER_UNAVAILABLE',
  PROVIDER_CAPABILITY_NOT_CONFIRMED: 'OUTBOUND_PROVIDER_CAPABILITY_NOT_CONFIRMED',
  ACCOUNT_OWNERSHIP_MISMATCH: 'PRODUCTION_BLOCKED_ACCOUNT_OWNERSHIP_MISMATCH',
  PAYEE_NOT_ACTIVE: 'OUTBOUND_PAYEE_NOT_ACTIVE',
  PAYEE_NOT_VERIFIED: 'OUTBOUND_PAYEE_NOT_VERIFIED',
  DESTINATION_NOT_FOUND: 'OUTBOUND_DESTINATION_NOT_FOUND',
  DESTINATION_COOLDOWN: 'OUTBOUND_DESTINATION_COOLDOWN',
  DESTINATION_METHOD_NOT_ALLOWED: 'OUTBOUND_DESTINATION_METHOD_NOT_ALLOWED',
  OBLIGATION_INVALID: 'OUTBOUND_OBLIGATION_INVALID',
  INSUFFICIENT_BALANCE: 'OUTBOUND_INSUFFICIENT_BALANCE',
  LIMIT_EXCEEDED: 'OUTBOUND_LIMIT_EXCEEDED',
  DUPLICATE_COMPETENCE: 'OUTBOUND_DUPLICATE_COMPETENCE',
  PURPOSE_DISABLED: 'OUTBOUND_PURPOSE_DISABLED',
  PRODUCTION_BLOCKED: 'OUTBOUND_PRODUCTION_BLOCKED',
  FAKE_IN_PRODUCTION: 'OUTBOUND_FAKE_IN_PRODUCTION',
  IDEMPOTENCY_CONFLICT: 'OUTBOUND_IDEMPOTENCY_CONFLICT',
  TRANSITION_INVALID: 'OUTBOUND_TRANSITION_INVALID',
  ALREADY_PAID: 'OUTBOUND_ALREADY_PAID',
  AMOUNT_MISMATCH: 'OUTBOUND_AMOUNT_MISMATCH',
  PAYOUT_STATE_CONFLICT: 'OUTBOUND_CRITICAL_PAYOUT_STATE_CONFLICT',
} as const;

// ─── Feature Flags ───────────────────────────────────────────────────────────

export const PURPOSE_FLAGS: Record<PaymentPurpose, string> = {
  DRIVER_ANNUAL_INCENTIVE: 'DRIVER_ANNUAL_INCENTIVE_ENABLED',
  MANAGER_TERRITORIAL_COMMISSION: 'MANAGER_TERRITORIAL_COMMISSION_ENABLED',
  ACCOUNTING_SERVICE: 'ACCOUNTING_SERVICE_PAYMENT_ENABLED',
  SUPPLIER_INVOICE: 'SUPPLIER_PAYMENT_ENABLED',
  SERVICE_PROVIDER: 'SUPPLIER_PAYMENT_ENABLED',
  OPERATIONAL_EXPENSE: 'SUPPLIER_PAYMENT_ENABLED',
  EMPLOYEE_OR_CONTRACTOR_REIMBURSEMENT: 'SUPPLIER_PAYMENT_ENABLED',
  TAX_OR_GOVERNMENT_PAYMENT: 'BILL_PAYMENT_ENABLED',
  UTILITY_BILL: 'BILL_PAYMENT_ENABLED',
  OTHER_APPROVED_BUSINESS_EXPENSE: 'SUPPLIER_PAYMENT_ENABLED',
};
