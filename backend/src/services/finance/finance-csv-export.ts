/**
 * Finance Transaction CSV Export — Server-side
 *
 * - Reuses same filters as listFinanceTransactions (via financeTransactionsListQuerySchema)
 * - BigInt → decimal string without floating point (string division by 100)
 * - Dates → DD/MM/YYYY civil dates, timestamps → DD/MM/YYYY HH:mm (America/Sao_Paulo)
 * - CSV injection mitigation via csvSafe()
 * - Separator: semicolon (;) for Excel BR
 * - BOM UTF-8 for correct encoding in Excel
 * - Limit: 5000 rows (422 if exceeded)
 * - Includes accounting classification fields from financial_categories
 */
import { prisma } from '../../lib/prisma';
import { Prisma } from '@prisma/client';

export const CSV_EXPORT_MAX_ROWS = 5000;

// ── BigInt → Decimal String (centavos → reais, sem float) ────────────────────

/**
 * Converts a BigInt/string representing centavos to a decimal string "R$ 1234,56".
 * Pure string manipulation — no Number, parseInt, or floating point.
 *
 * Examples:
 *   0n → "0,00"
 *   12345n → "123,45"
 *   -12345n → "-123,45"
 *   100n → "1,00"
 *   1n → "0,01"
 *   9007199254740993n → "90071992547409,93"  (above MAX_SAFE_INTEGER)
 */
export function bigIntCentsToDecimal(value: bigint | string | null | undefined): string {
  if (value == null) return '';
  const bi = typeof value === 'string' ? BigInt(value) : value;
  const isNeg = bi < BigInt(0);
  const abs = isNeg ? -bi : bi;
  const str = abs.toString();
  let intPart: string;
  let fracPart: string;
  if (str.length <= 2) {
    intPart = '0';
    fracPart = str.padStart(2, '0');
  } else {
    intPart = str.slice(0, -2);
    fracPart = str.slice(-2);
  }
  return `${isNeg ? '-' : ''}${intPart},${fracPart}`;
}

// ── Civil Date Formatting (no timezone shift) ────────────────────────────────

/**
 * Formats a date stored as midnight UTC (YYYY-MM-DD dates from Prisma)
 * to DD/MM/YYYY without timezone shift.
 * These are civil dates — the DB stores them at 00:00 UTC.
 */
export function formatCivilDateBR(value: Date | string | null | undefined): string {
  if (!value) return '';
  let y: number, m: number, d: number;

  if (typeof value === 'string') {
    // ISO date string "YYYY-MM-DD" or "YYYY-MM-DDT00:00:00.000Z"
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!match) return '';
    y = parseInt(match[1], 10);
    m = parseInt(match[2], 10);
    d = parseInt(match[3], 10);
  } else {
    // Date object — use UTC to avoid timezone shift
    y = value.getUTCFullYear();
    m = value.getUTCMonth() + 1;
    d = value.getUTCDate();
  }
  return `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
}

/**
 * Formats a timestamp to DD/MM/YYYY HH:mm in America/Sao_Paulo timezone.
 */
export function formatTimestampBR(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = typeof value === 'string' ? new Date(value) : value;
  if (isNaN(date.getTime())) return '';
  try {
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
    return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
  } catch {
    return '';
  }
}

// ── CSV Injection Mitigation ─────────────────────────────────────────────────

/**
 * Escapes a value for safe CSV inclusion:
 * - Null/undefined → empty string
 * - Doubles internal quotes
 * - Prefixes formula characters (=, +, -, @, \t, \r) with apostrophe
 */
export function csvSafe(value: string | number | boolean | null | undefined): string {
  if (value == null) return '';
  const str = String(value).replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(str)) return `'${str}`;
  return str;
}

/**
 * Wraps a value in quotes for CSV field. Handles semicolons, newlines, quotes.
 */
function csvField(value: string): string {
  // Always quote to handle semicolons and newlines safely
  return `"${value}"`;
}

// ── CSV Row Builder ──────────────────────────────────────────────────────────

export const CSV_HEADERS = [
  'ID',
  'Status',
  'Origem',
  'Descrição',
  'Observação',
  'Referência externa',
  'Direção',
  'Tipo transação',
  'Conta financeira',
  'Código da conta',
  'Categoria',
  'Código categoria',
  'Código contábil',
  'Natureza contábil',
  'Grupo DRE',
  'Grupo balanço patrimonial',
  'Classificação fiscal',
  'Dedutível',
  'Código exportação',
  'Notas do contador',
  'Centro de custo',
  'Data competência',
  'Data transação',
  'Vencimento',
  'Liquidação',
  'Valor bruto',
  'Taxas',
  'Descontos',
  'Retenções',
  'Valor líquido',
  'Forma pagamento',
  'Motivo cancelamento',
  'Criado em',
  'Atualizado em',
];

export function buildCsvRow(row: any): string[] {
  return [
    csvSafe(row.id),
    csvSafe(row.status),
    csvSafe(row.source_type),
    csvSafe(row.description),
    csvSafe(row.memo),
    csvSafe(row.external_reference),
    csvSafe(row.direction),
    csvSafe(row.transaction_type),
    csvSafe(row.account?.name),
    csvSafe(row.account?.code),
    csvSafe(row.category?.name),
    csvSafe(row.category?.code),
    csvSafe(row.category?.accounting_code),
    csvSafe(row.category?.accounting_nature),
    csvSafe(row.category?.dre_group),
    csvSafe(row.category?.balance_sheet_group),
    csvSafe(row.category?.fiscal_classification),
    csvSafe(row.category?.deductible == null ? '' : row.category.deductible ? 'Sim' : 'Não'),
    csvSafe(row.category?.export_code),
    csvSafe(row.category?.accountant_notes),
    csvSafe(row.cost_center?.name),
    csvSafe(formatCivilDateBR(row.competence_date)),
    csvSafe(formatCivilDateBR(row.transaction_date)),
    csvSafe(formatCivilDateBR(row.due_date)),
    csvSafe(formatCivilDateBR(row.settlement_date)),
    csvSafe(bigIntCentsToDecimal(row.gross_amount_cents)),
    csvSafe(bigIntCentsToDecimal(row.fee_amount_cents)),
    csvSafe(bigIntCentsToDecimal(row.discount_amount_cents)),
    csvSafe(bigIntCentsToDecimal(row.retention_amount_cents)),
    csvSafe(bigIntCentsToDecimal(row.net_amount_cents)),
    csvSafe(row.payment_method),
    csvSafe(row.canceled_reason),
    csvSafe(formatTimestampBR(row.created_at)),
    csvSafe(formatTimestampBR(row.updated_at)),
  ];
}

// ── Query Builder ────────────────────────────────────────────────────────────

const EXPORT_SELECT = {
  id: true,
  description: true,
  memo: true,
  external_reference: true,
  direction: true,
  transaction_type: true,
  status: true,
  payment_method: true,
  source_type: true,
  competence_date: true,
  transaction_date: true,
  due_date: true,
  settlement_date: true,
  gross_amount_cents: true,
  fee_amount_cents: true,
  discount_amount_cents: true,
  retention_amount_cents: true,
  net_amount_cents: true,
  canceled_reason: true,
  created_at: true,
  updated_at: true,
  account: { select: { id: true, code: true, name: true } },
  category: {
    select: {
      id: true,
      code: true,
      name: true,
      accounting_code: true,
      accounting_nature: true,
      dre_group: true,
      balance_sheet_group: true,
      fiscal_classification: true,
      deductible: true,
      export_code: true,
      accountant_notes: true,
    },
  },
  cost_center: { select: { id: true, code: true, name: true } },
};

export interface CsvExportFilters {
  search?: string;
  account_id?: string;
  counterparty_account_id?: string;
  category_id?: string;
  cost_center_id?: string;
  direction?: string;
  transaction_type?: string;
  status?: string;
  payment_method?: string;
  source_type?: string;
  origin_type?: string;
  provider?: string;
  transfer_group_id?: string;
  date_field?: string;
  date_from?: Date;
  date_to?: Date;
}

function buildWhereClause(filters: CsvExportFilters): Prisma.financial_transactionsWhereInput {
  const where: Prisma.financial_transactionsWhereInput = {};

  if (filters.account_id) where.account_id = filters.account_id;
  if (filters.counterparty_account_id) where.counterparty_account_id = filters.counterparty_account_id;
  if (filters.category_id) where.category_id = filters.category_id;
  if (filters.cost_center_id) where.cost_center_id = filters.cost_center_id;
  if (filters.direction) where.direction = filters.direction as any;
  if (filters.transaction_type) where.transaction_type = filters.transaction_type as any;
  if (filters.status) where.status = filters.status as any;
  if (filters.payment_method) where.payment_method = filters.payment_method as any;
  if (filters.source_type) where.source_type = filters.source_type as any;
  if (filters.origin_type) where.origin_type = filters.origin_type as any;
  if (filters.provider) where.provider = filters.provider;
  if (filters.transfer_group_id) where.transfer_group_id = filters.transfer_group_id;

  // Date range
  const dateField = (filters.date_field || 'transaction_date') as string;
  if (filters.date_from || filters.date_to) {
    const dateWhere: any = {};
    if (filters.date_from) dateWhere.gte = filters.date_from;
    if (filters.date_to) dateWhere.lte = filters.date_to;
    (where as any)[dateField] = dateWhere;
  }

  // Search
  if (filters.search) {
    const term = filters.search.trim();
    if (term) {
      where.OR = [
        { description: { contains: term, mode: 'insensitive' } },
        { memo: { contains: term, mode: 'insensitive' } },
        { external_reference: { contains: term, mode: 'insensitive' } },
      ];
    }
  }

  return where;
}

export async function queryTransactionsForCsvExport(filters: CsvExportFilters): Promise<{ rows: any[]; total: number }> {
  const where = buildWhereClause(filters);

  const total = await prisma.financial_transactions.count({ where });

  if (total > CSV_EXPORT_MAX_ROWS) {
    return { rows: [], total };
  }

  const rows = await prisma.financial_transactions.findMany({
    where,
    select: EXPORT_SELECT,
    orderBy: [
      { transaction_date: 'desc' },
      { created_at: 'desc' },
      { id: 'desc' },
    ],
    take: CSV_EXPORT_MAX_ROWS,
  });

  return { rows, total };
}

// ── CSV Assembly ─────────────────────────────────────────────────────────────

export function buildCsvContent(rows: any[]): string {
  const BOM = '\uFEFF';
  const SEP = ';';

  const headerLine = CSV_HEADERS.map((h) => csvField(csvSafe(h))).join(SEP);
  const dataLines = rows.map((row) =>
    buildCsvRow(row).map((field) => csvField(field)).join(SEP)
  );

  return BOM + headerLine + '\r\n' + dataLines.join('\r\n') + (dataLines.length > 0 ? '\r\n' : '');
}
