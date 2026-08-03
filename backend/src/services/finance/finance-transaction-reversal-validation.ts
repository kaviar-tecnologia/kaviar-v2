import { z } from 'zod';

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

const strictISODatetime = z.string().refine(
  (v) => !isNaN(Date.parse(v)),
  { message: 'expected_updated_at: ISO 8601 válido' }
).transform((v) => new Date(v));

export const financeTransactionReverseBodySchema = z.object({
  expected_updated_at: strictISODatetime,
  reversal_date: strictCalendarDate('reversal_date'),
  reason: z.string().trim().min(3, 'Motivo deve ter ao menos 3 caracteres').max(500),
}).strict();

export type FinanceTransactionReverseBody = z.infer<typeof financeTransactionReverseBodySchema>;
