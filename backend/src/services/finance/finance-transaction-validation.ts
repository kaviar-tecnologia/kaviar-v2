/**
 * Validation schemas for manual financial transaction CRUD.
 * SUPER_ADMIN: full CRUD
 * FINANCE: read-only (uses existing list/detail schemas)
 */
import { z } from 'zod';

const strictTrimmedString = (max: number) => z.string().trim().min(1).max(max);
const optionalNullableTrimmedString = (max: number) =>
  z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(max).nullable().optional());

const strictBigIntString = (field: string) =>
  z.string().regex(/^-?\d+$/, `${field} deve ser um inteiro em string`).transform((v) => BigInt(v));

const strictDateBody = (field: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${field} deve ser YYYY-MM-DD`).transform((v) => new Date(v + 'T00:00:00.000Z'));

const optionalDateBody = (field: string) =>
  z.preprocess(
    (v) => (v === '' || v === null ? undefined : v),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${field} deve ser YYYY-MM-DD`).transform((v) => new Date(v + 'T00:00:00.000Z')).optional()
  );

// ── Enums ──────────────────────────────────────────────────────────────────

const directionValues = ['IN', 'OUT'] as const;

const transactionTypeValues = [
  'INCOME', 'EXPENSE', 'TRANSFER', 'RECEIVABLE', 'PAYABLE',
  'ADJUSTMENT', 'REVERSAL', 'REFUND', 'RECONCILIATION',
  'ACCRUAL', 'SETTLEMENT', 'WITHDRAWAL', 'DEPOSIT', 'TAX', 'FEE', 'COMPENSATION',
] as const;

const transactionStatusValues = [
  'DRAFT', 'PENDING', 'POSTED', 'CANCELED', 'REVERSED', 'BLOCKED', 'RECONCILED', 'CLOSED',
] as const;

const paymentMethodValues = [
  'PIX', 'ASAAS', 'SUMUP', 'BANK_TRANSFER', 'TED', 'DOC',
  'CASH', 'CARD', 'BOLETO', 'INTERNAL', 'NONE',
] as const;

// For manual entries, source_type is always MANUAL
const manualSourceType = 'MANUAL' as const;

// ── Create Schema ──────────────────────────────────────────────────────────

export const financeTransactionCreateBodySchema = z.object({
  account_id: strictTrimmedString(120),
  counterparty_account_id: optionalNullableTrimmedString(120),
  category_id: optionalNullableTrimmedString(120),
  cost_center_id: optionalNullableTrimmedString(120),

  direction: z.enum(directionValues),
  transaction_type: z.enum(transactionTypeValues),
  payment_method: z.enum(paymentMethodValues).optional().nullable(),

  competence_date: strictDateBody('competence_date'),
  transaction_date: strictDateBody('transaction_date'),
  due_date: optionalDateBody('due_date'),

  gross_amount_cents: strictBigIntString('gross_amount_cents'),
  fee_amount_cents: strictBigIntString('fee_amount_cents').optional().default('0'),
  discount_amount_cents: strictBigIntString('discount_amount_cents').optional().default('0'),
  retention_amount_cents: strictBigIntString('retention_amount_cents').optional().default('0'),
  net_amount_cents: strictBigIntString('net_amount_cents'),

  description: strictTrimmedString(500),
  memo: optionalNullableTrimmedString(2000),
  external_reference: optionalNullableTrimmedString(500),
  metadata: z.record(z.unknown()).optional().nullable(),
}).strict();

// ── Update Schema (only DRAFT/PENDING can be edited) ───────────────────────

export const financeTransactionUpdateBodySchema = z.object({
  account_id: strictTrimmedString(120).optional(),
  counterparty_account_id: optionalNullableTrimmedString(120),
  category_id: optionalNullableTrimmedString(120),
  cost_center_id: optionalNullableTrimmedString(120),

  direction: z.enum(directionValues).optional(),
  transaction_type: z.enum(transactionTypeValues).optional(),
  payment_method: z.enum(paymentMethodValues).optional().nullable(),

  competence_date: strictDateBody('competence_date').optional(),
  transaction_date: strictDateBody('transaction_date').optional(),
  due_date: optionalDateBody('due_date'),

  gross_amount_cents: strictBigIntString('gross_amount_cents').optional(),
  fee_amount_cents: strictBigIntString('fee_amount_cents').optional(),
  discount_amount_cents: strictBigIntString('discount_amount_cents').optional(),
  retention_amount_cents: strictBigIntString('retention_amount_cents').optional(),
  net_amount_cents: strictBigIntString('net_amount_cents').optional(),

  description: strictTrimmedString(500).optional(),
  memo: optionalNullableTrimmedString(2000),
  external_reference: optionalNullableTrimmedString(500),
  metadata: z.record(z.unknown()).optional().nullable(),
}).strict();

// ── Status transition schemas ──────────────────────────────────────────────

export const financeTransactionPostBodySchema = z.object({
  settlement_date: optionalDateBody('settlement_date'),
}).strict().optional();

export const financeTransactionCancelBodySchema = z.object({
  canceled_reason: strictTrimmedString(500),
}).strict();

// ── Types ──────────────────────────────────────────────────────────────────

export type FinanceTransactionCreateBody = z.infer<typeof financeTransactionCreateBodySchema>;
export type FinanceTransactionUpdateBody = z.infer<typeof financeTransactionUpdateBodySchema>;
export type FinanceTransactionCancelBody = z.infer<typeof financeTransactionCancelBodySchema>;

export { manualSourceType };
