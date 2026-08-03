/**
 * Validation schemas for manual financial transaction CRUD.
 * - BigInt-only for monetary values (no float/Number)
 * - Positive-only for gross/net, non-negative for fees/discounts
 * - Typed metadata schema (no z.record(z.unknown()))
 * - category_id required on create
 * - expected_updated_at for concurrency control
 */
import { z } from 'zod';

const strictTrimmedString = (max: number) => z.string().trim().min(1).max(max);
const optionalNullableTrimmedString = (max: number) =>
  z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(max).nullable().optional());

// BigInt string: must be integer, within PostgreSQL bigint range
const MAX_BIGINT = BigInt('9223372036854775807');
const MIN_BIGINT = BigInt('-9223372036854775808');

const strictPositiveBigInt = (field: string) =>
  z.string().regex(/^\d+$/, `${field} deve ser um inteiro positivo em string`).transform((v) => {
    const n = BigInt(v);
    if (n <= BigInt(0)) throw new Error(`${field} deve ser maior que zero`);
    if (n > MAX_BIGINT) throw new Error(`${field} excede o limite`);
    return n;
  });

const strictNonNegativeBigInt = (field: string) =>
  z.string().regex(/^\d+$/, `${field} deve ser um inteiro não-negativo em string`).transform((v) => {
    const n = BigInt(v);
    if (n < BigInt(0)) throw new Error(`${field} deve ser >= 0`);
    if (n > MAX_BIGINT) throw new Error(`${field} excede o limite`);
    return n;
  });

const strictDateBody = (field: string) =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${field} deve ser YYYY-MM-DD`).transform((v) => {
    const d = new Date(v + 'T00:00:00.000Z');
    if (isNaN(d.getTime())) throw new Error(`${field} data inválida`);
    return d;
  });

const optionalDateBody = (field: string) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, `${field} deve ser YYYY-MM-DD`).transform((v) => {
      const d = new Date(v + 'T00:00:00.000Z');
      if (isNaN(d.getTime())) throw new Error(`${field} data inválida`);
      return d;
    }).optional()
  );

const strictISODatetime = z.string().datetime({ message: 'expected_updated_at deve ser ISO 8601' }).transform((v) => new Date(v));

// ── Enums ──────────────────────────────────────────────────────────────────

const directionValues = ['IN', 'OUT'] as const;

const transactionTypeValues = [
  'INCOME', 'EXPENSE', 'TRANSFER', 'RECEIVABLE', 'PAYABLE',
  'ADJUSTMENT', 'REVERSAL', 'REFUND', 'RECONCILIATION',
  'ACCRUAL', 'SETTLEMENT', 'WITHDRAWAL', 'DEPOSIT', 'TAX', 'FEE', 'COMPENSATION',
] as const;

const paymentMethodValues = [
  'PIX', 'ASAAS', 'SUMUP', 'BANK_TRANSFER', 'TED', 'DOC',
  'CASH', 'CARD', 'BOLETO', 'INTERNAL', 'NONE',
] as const;

// ── Typed Metadata (no z.record(z.unknown())) ──────────────────────────────

export const transactionMetadataSchema = z.object({
  counterparty_name: z.string().max(200).optional().nullable(),
  counterparty_type: z.string().max(50).optional().nullable(),
  territory_id: z.string().max(120).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().max(2).optional().nullable(),
  reference_period: z.string().max(20).optional().nullable(),
  tax_name: z.string().max(120).optional().nullable(),
  tax_scope: z.enum(['federal', 'estadual', 'municipal']).optional().nullable(),
  beneficiary_name: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
}).strict().optional().nullable();

// ── Create Schema ──────────────────────────────────────────────────────────

export const financeTransactionCreateBodySchema = z.object({
  account_id: strictTrimmedString(120),
  counterparty_account_id: optionalNullableTrimmedString(120),
  category_id: strictTrimmedString(120), // REQUIRED
  cost_center_id: optionalNullableTrimmedString(120),

  direction: z.enum(directionValues),
  transaction_type: z.enum(transactionTypeValues),
  payment_method: z.enum(paymentMethodValues).optional().nullable(),

  competence_date: strictDateBody('competence_date'),
  transaction_date: strictDateBody('transaction_date'),
  due_date: optionalDateBody('due_date'),

  gross_amount_cents: strictPositiveBigInt('gross_amount_cents'),
  net_amount_cents: strictPositiveBigInt('net_amount_cents'),

  description: strictTrimmedString(500),
  memo: optionalNullableTrimmedString(2000),
  external_reference: optionalNullableTrimmedString(500),
  metadata: transactionMetadataSchema,
}).strict();

// ── Update Schema (DRAFT/PENDING only, requires expected_updated_at) ───────

export const financeTransactionUpdateBodySchema = z.object({
  expected_updated_at: strictISODatetime,

  account_id: strictTrimmedString(120).optional(),
  counterparty_account_id: optionalNullableTrimmedString(120),
  category_id: strictTrimmedString(120).optional(),
  cost_center_id: optionalNullableTrimmedString(120),

  direction: z.enum(directionValues).optional(),
  transaction_type: z.enum(transactionTypeValues).optional(),
  payment_method: z.enum(paymentMethodValues).optional().nullable(),

  competence_date: strictDateBody('competence_date').optional(),
  transaction_date: strictDateBody('transaction_date').optional(),
  due_date: optionalDateBody('due_date'),

  gross_amount_cents: strictPositiveBigInt('gross_amount_cents').optional(),
  net_amount_cents: strictPositiveBigInt('net_amount_cents').optional(),

  description: strictTrimmedString(500).optional(),
  memo: optionalNullableTrimmedString(2000),
  external_reference: optionalNullableTrimmedString(500),
  metadata: transactionMetadataSchema,
}).strict().refine(
  (data) => {
    const { expected_updated_at, ...rest } = data;
    return Object.keys(rest).length > 0;
  },
  { message: 'Ao menos um campo deve ser informado além de expected_updated_at' }
);

// ── Status transition schemas ──────────────────────────────────────────────

export const financeTransactionPostBodySchema = z.object({
  expected_updated_at: strictISODatetime,
  settlement_date: optionalDateBody('settlement_date'),
}).strict();

export const financeTransactionCancelBodySchema = z.object({
  expected_updated_at: strictISODatetime,
  canceled_reason: strictTrimmedString(500),
}).strict();

// ── Types ──────────────────────────────────────────────────────────────────

export type FinanceTransactionCreateBody = z.infer<typeof financeTransactionCreateBodySchema>;
export type FinanceTransactionUpdateBody = z.infer<typeof financeTransactionUpdateBodySchema>;
export type FinanceTransactionPostBody = z.infer<typeof financeTransactionPostBodySchema>;
export type FinanceTransactionCancelBody = z.infer<typeof financeTransactionCancelBodySchema>;
