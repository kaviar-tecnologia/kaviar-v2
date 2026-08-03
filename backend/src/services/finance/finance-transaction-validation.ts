/**
 * Finance Transaction Validation — Manual Entries
 * - Strict calendar date validation (rejects Feb 30, etc.)
 * - Direction/type compatibility enforced
 * - BigInt-only monetary (positive gross/net, non-negative fees)
 * - Typed metadata (no z.record(z.unknown()))
 * - CAS via expected_updated_at
 */
import { z } from 'zod';

// ── Primitives ─────────────────────────────────────────────────────────────

const strictTrimmedString = (max: number) => z.string().trim().min(1).max(max);
const optionalNullableTrimmedString = (max: number) =>
  z.preprocess((v) => (v === '' ? null : v), z.string().trim().max(max).nullable().optional());

const MAX_BIGINT = BigInt('9223372036854775807');

function bigIntPositive(field: string) {
  return z.string().refine(
    (v) => /^\d+$/.test(v) && BigInt(v) > BigInt(0) && BigInt(v) <= MAX_BIGINT,
    { message: `${field}: inteiro positivo em string, máx ${MAX_BIGINT}` }
  ).transform((v) => BigInt(v));
}

function bigIntNonNegative(field: string) {
  return z.string().refine(
    (v) => /^\d+$/.test(v) && BigInt(v) >= BigInt(0) && BigInt(v) <= MAX_BIGINT,
    { message: `${field}: inteiro não-negativo em string, máx ${MAX_BIGINT}` }
  ).transform((v) => BigInt(v));
}

/** Strict YYYY-MM-DD: rejects non-existent calendar dates */
function strictCalendarDate(field: string) {
  return z.string().refine((v) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
    if (!m) return false;
    const [, ys, ms, ds] = m;
    const y = parseInt(ys, 10), mo = parseInt(ms, 10), d = parseInt(ds, 10);
    if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return false;
    const date = new Date(Date.UTC(y, mo - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
  }, { message: `${field}: data YYYY-MM-DD inexistente ou formato inválido` })
    .transform((v) => new Date(v + 'T00:00:00.000Z'));
}

function optionalCalendarDate(field: string) {
  return z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    strictCalendarDate(field).optional()
  );
}

const strictISODatetime = z.string().refine(
  (v) => !isNaN(Date.parse(v)),
  { message: 'expected_updated_at: ISO 8601 válido' }
).transform((v) => new Date(v));

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

// ── Direction/Type Compatibility ───────────────────────────────────────────

const VALID_IN_TYPES = new Set(['INCOME', 'RECEIVABLE', 'DEPOSIT']);
const VALID_OUT_TYPES = new Set(['EXPENSE', 'PAYABLE', 'TAX', 'FEE', 'WITHDRAWAL']);

export function validateDirectionTypeCompatibility(direction: string, type: string): string | null {
  if (direction === 'IN' && !VALID_IN_TYPES.has(type)) {
    return `Tipo "${type}" incompatível com direção IN. Permitidos: INCOME, RECEIVABLE, DEPOSIT.`;
  }
  if (direction === 'OUT' && !VALID_OUT_TYPES.has(type)) {
    return `Tipo "${type}" incompatível com direção OUT. Permitidos: EXPENSE, PAYABLE, TAX, FEE, WITHDRAWAL.`;
  }
  return null;
}

// ── Typed Metadata ─────────────────────────────────────────────────────────

export const transactionMetadataSchema = z.object({
  counterparty_name: z.string().max(200).optional().nullable(),
  counterparty_type: z.enum(['ACCOUNTING', 'MARKETING', 'LEGAL', 'PARTNER', 'TERRITORIAL_MANAGER', 'GOVERNMENT', 'TECHNOLOGY', 'OTHER']).optional().nullable(),
  territory_id: z.string().max(120).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().max(2).optional().nullable(),
  reference_period: z.string().max(20).optional().nullable(),
  tax_name: z.string().max(120).optional().nullable(),
  tax_scope: z.enum(['federal', 'estadual', 'municipal']).optional().nullable(),
  beneficiary_name: z.string().max(200).optional().nullable(),
  campaign_type: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
}).strict().optional().nullable();

// ── Create Schema ──────────────────────────────────────────────────────────

export const financeTransactionCreateBodySchema = z.object({
  account_id: strictTrimmedString(120),
  counterparty_account_id: optionalNullableTrimmedString(120),
  category_id: strictTrimmedString(120),
  cost_center_id: optionalNullableTrimmedString(120),
  direction: z.enum(directionValues),
  transaction_type: z.enum(transactionTypeValues),
  payment_method: z.enum(paymentMethodValues).optional().nullable(),
  competence_date: strictCalendarDate('competence_date'),
  transaction_date: strictCalendarDate('transaction_date'),
  due_date: optionalCalendarDate('due_date'),
  gross_amount_cents: bigIntPositive('gross_amount_cents'),
  net_amount_cents: bigIntPositive('net_amount_cents'),
  description: strictTrimmedString(500),
  memo: optionalNullableTrimmedString(2000),
  external_reference: optionalNullableTrimmedString(500),
  metadata: transactionMetadataSchema,
}).strict().superRefine((data, ctx) => {
  // Direction/type compatibility
  const err = validateDirectionTypeCompatibility(data.direction, data.transaction_type);
  if (err) ctx.addIssue({ code: z.ZodIssueCode.custom, message: err, path: ['transaction_type'] });
  // net must equal gross in V1
  if (data.net_amount_cents !== data.gross_amount_cents) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Nesta versão, net_amount_cents deve ser igual a gross_amount_cents', path: ['net_amount_cents'] });
  }
  // due_date must be >= transaction_date
  if (data.due_date && data.transaction_date && data.due_date < data.transaction_date) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'due_date não pode ser anterior a transaction_date', path: ['due_date'] });
  }
});

// ── Update Schema ──────────────────────────────────────────────────────────

export const financeTransactionUpdateBodySchema = z.object({
  expected_updated_at: strictISODatetime,
  account_id: strictTrimmedString(120).optional(),
  counterparty_account_id: optionalNullableTrimmedString(120),
  category_id: strictTrimmedString(120).optional(),
  cost_center_id: optionalNullableTrimmedString(120),
  direction: z.enum(directionValues).optional(),
  transaction_type: z.enum(transactionTypeValues).optional(),
  payment_method: z.enum(paymentMethodValues).optional().nullable(),
  competence_date: strictCalendarDate('competence_date').optional(),
  transaction_date: strictCalendarDate('transaction_date').optional(),
  due_date: optionalCalendarDate('due_date'),
  gross_amount_cents: bigIntPositive('gross_amount_cents').optional(),
  net_amount_cents: bigIntPositive('net_amount_cents').optional(),
  description: strictTrimmedString(500).optional(),
  memo: optionalNullableTrimmedString(2000),
  external_reference: optionalNullableTrimmedString(500),
  metadata: transactionMetadataSchema,
}).strict().refine(
  (data) => { const { expected_updated_at, ...rest } = data; return Object.keys(rest).length > 0; },
  { message: 'Ao menos um campo deve ser informado além de expected_updated_at' }
);

// ── Post/Cancel ────────────────────────────────────────────────────────────

export const financeTransactionPostBodySchema = z.object({
  expected_updated_at: strictISODatetime,
  settlement_date: optionalCalendarDate('settlement_date'),
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
