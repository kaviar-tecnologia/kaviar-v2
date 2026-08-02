/**
 * Área do Contador V1 — Somente Leitura
 *
 * GET /api/admin/finance/accountant-report        → resumo + listagem paginada
 * GET /api/admin/finance/accountant-report/csv    → exportação CSV (mesmo filtro)
 *
 * Dados vêm de ride_settlements (fonte de verdade para valores liquidados) + rides_v2 (operacional).
 * Nenhuma operação de escrita. Nenhum recálculo de valores históricos.
 *
 * financial_status:
 *   SETTLED     — settlement existe e settled_at IS NOT NULL
 *   UNSETTLED   — settlement existe, settled_at IS NULL
 *   UNAVAILABLE — settlement não existe
 *
 * Valores financeiros só são expostos quando financial_status = SETTLED.
 */

import { Router, Request, Response } from 'express';
import { authenticateAdmin, allowFinanceAccess } from '../middlewares/auth';
import { pool } from '../db';

const router = Router();
router.use(authenticateAdmin);
router.use(allowFinanceAccess);

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAX_PERIOD_DAYS = 90;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const CSV_MAX_ROWS = 5000;

// ── Strict Date Parser ────────────────────────────────────────────────────────

/**
 * Parse a date string in strict YYYY-MM-DD format.
 * Rejects invalid formats, non-existent dates (e.g. 2026-02-31), and JS rollover.
 * Returns a UTC Date at the given boundary or null.
 */
function parseStrictDate(value: string, boundary: 'start' | 'end'): Date | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  // Validate ranges
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 2020 || year > 2100) return null;

  // Use UTC constructor to avoid rollover — check it stayed the same
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null; // JS rolled over (e.g. Feb 31 → Mar 3)
  }

  if (boundary === 'start') {
    return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
  }
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
}

// ── Decimal-safe Money Formatter ──────────────────────────────────────────────

/**
 * Format a Decimal-like value to an exact 2-decimal string without float conversion.
 * Accepts: "10", "10.5", "10.50", "10.00", "-5.3"
 * Rejects: empty, non-numeric, NaN-producing strings
 */
export function formatDecimal(value: string | number | null | undefined): string | null {
  if (value == null) return null;
  const str = String(value).trim();
  if (str === '') return null;

  // Strict pattern: optional sign, digits, optional decimal with 0-N digits
  const match = /^(-?\d+)(?:\.(\d+))?$/.exec(str);
  if (!match) return null;

  const intPart = match[1];
  let fracPart = match[2] || '';

  // Pad or verify two decimal places
  if (fracPart.length === 0) {
    fracPart = '00';
  } else if (fracPart.length === 1) {
    fracPart = fracPart + '0';
  } else if (fracPart.length === 2) {
    // exact
  } else {
    // More than 2 decimal digits — reject (don't silently round)
    return null;
  }

  return `${intPart}.${fracPart}`;
}

// ── CSV Injection Protection ──────────────────────────────────────────────────

/**
 * Protege valor contra CSV injection.
 * Prefixar com apóstrofo se começa com =, +, -, @, \t, \r.
 */
function csvSafe(value: string | null | undefined): string {
  if (value == null) return '';
  const str = String(value).replace(/"/g, '""');
  if (/^[=+\-@\t\r]/.test(str)) return `'${str}`;
  return str;
}

function formatDateBR(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const min = String(d.getUTCMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function formatDateISO(value: Date): string {
  return value.toISOString().slice(0, 10);
}

// ── Financial Status ──────────────────────────────────────────────────────────

type FinancialStatus = 'SETTLED' | 'UNSETTLED' | 'UNAVAILABLE';

function deriveFinancialStatus(hasSettlement: boolean, settledAt: any): FinancialStatus {
  if (!hasSettlement) return 'UNAVAILABLE';
  if (settledAt != null) return 'SETTLED';
  return 'UNSETTLED';
}

// ── Filters ───────────────────────────────────────────────────────────────────

interface ReportFilters {
  startDate: Date;
  endDate: Date;
  status?: string;
  territory?: string;
  search?: string;
  page: number;
  limit: number;
}

function parseFilters(query: any): ReportFilters | { error: string } {
  const now = new Date();
  const thirtyDaysAgo = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 30, 0, 0, 0, 0
  ));

  let startDate: Date;
  let endDate: Date;

  if (query.start_date) {
    const parsed = parseStrictDate(query.start_date, 'start');
    if (!parsed) return { error: 'start_date inválida. Use formato YYYY-MM-DD com data existente.' };
    startDate = parsed;
  } else {
    startDate = thirtyDaysAgo;
  }

  if (query.end_date) {
    const parsed = parseStrictDate(query.end_date, 'end');
    if (!parsed) return { error: 'end_date inválida. Use formato YYYY-MM-DD com data existente.' };
    endDate = parsed;
  } else {
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
    endDate = today;
  }

  if (endDate < startDate) return { error: 'end_date deve ser posterior a start_date' };

  const diffMs = endDate.getTime() - startDate.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays > MAX_PERIOD_DAYS) return { error: `Período máximo permitido: ${MAX_PERIOD_DAYS} dias` };

  // page and limit: positive finite integers
  const rawPage = parseInt(query.page, 10);
  const rawLimit = parseInt(query.limit, 10);
  const page = (Number.isFinite(rawPage) && rawPage > 0) ? rawPage : 1;
  const limit = (Number.isFinite(rawLimit) && rawLimit > 0) ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;

  const status = query.status && typeof query.status === 'string' ? query.status.trim() : undefined;
  const territory = query.territory && typeof query.territory === 'string' ? query.territory.trim() : undefined;
  const search = query.search && typeof query.search === 'string' ? query.search.trim() : undefined;

  return { startDate, endDate, status, territory, search, page, limit };
}

function buildWhereClause(filters: ReportFilters): { where: string; params: any[] } {
  const conditions: string[] = ['r.created_at >= $1', 'r.created_at <= $2'];
  const params: any[] = [filters.startDate, filters.endDate];
  let paramIdx = 3;

  if (filters.status) {
    conditions.push(`r.status = $${paramIdx}`);
    params.push(filters.status);
    paramIdx++;
  }

  if (filters.territory) {
    conditions.push(`s.settlement_territory = $${paramIdx}`);
    params.push(filters.territory);
    paramIdx++;
  }

  if (filters.search) {
    conditions.push(`(r.id::text ILIKE $${paramIdx} OR d.name ILIKE $${paramIdx})`);
    params.push(`%${filters.search}%`);
    paramIdx++;
  }

  return { where: conditions.join(' AND '), params };
}

/**
 * Standard FROM/JOIN clause used by all queries.
 * Ensures d (drivers) and p (passengers) are always available for WHERE/SELECT.
 */
const FROM_JOINS = `
  FROM rides_v2 r
  LEFT JOIN ride_settlements s ON s.ride_id = r.id
  LEFT JOIN drivers d ON d.id = r.driver_id
  LEFT JOIN passengers p ON p.id = r.passenger_id
`;

// ── Serializer ────────────────────────────────────────────────────────────────

function serializeRide(row: any) {
  const financialStatus = deriveFinancialStatus(row.has_settlement, row.settled_at);
  const isSettled = financialStatus === 'SETTLED';

  return {
    id: row.id,
    status: row.status,
    financial_status: financialStatus,
    created_at: row.created_at,
    completed_at: row.completed_at,
    canceled_at: row.canceled_at,
    driver_id: row.driver_id,
    driver_name: row.driver_name || null,
    passenger_first_name: row.passenger_first_name || null,
    final_price: isSettled ? formatDecimal(row.final_price) : null,
    fee_percent: isSettled ? formatDecimal(row.fee_percent) : null,
    fee_amount: isSettled ? formatDecimal(row.fee_amount) : null,
    driver_earnings: isSettled ? formatDecimal(row.driver_earnings) : null,
    settlement_territory: row.settlement_territory || null,
    credit_cost: isSettled ? row.credit_cost : null,
    settled_at: row.settled_at,
  };
}

// ── GET /accountant-report ────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  try {
    const parsed = parseFilters(req.query);
    if ('error' in parsed) {
      return res.status(400).json({ success: false, error: parsed.error });
    }

    const filters = parsed;
    const { where, params } = buildWhereClause(filters);
    const offset = (filters.page - 1) * filters.limit;

    // Summary: sums ONLY settled rides (settled_at IS NOT NULL)
    const summarySQL = `
      SELECT
        COUNT(DISTINCT r.id)::int AS total_rides,
        COUNT(DISTINCT CASE WHEN r.status = 'completed' THEN r.id END)::int AS completed_rides,
        COUNT(DISTINCT CASE WHEN r.status IN ('canceled_by_passenger','canceled_by_driver') THEN r.id END)::int AS canceled_rides,
        COALESCE(SUM(CASE WHEN s.settled_at IS NOT NULL THEN s.final_price ELSE 0 END), 0)::text AS gross_total,
        COALESCE(SUM(CASE WHEN s.settled_at IS NOT NULL THEN s.fee_amount ELSE 0 END), 0)::text AS platform_fee_total,
        COALESCE(SUM(CASE WHEN s.settled_at IS NOT NULL THEN s.driver_earnings ELSE 0 END), 0)::text AS driver_earnings_total
      ${FROM_JOINS}
      WHERE ${where}
    `;

    // Count for pagination
    const countSQL = `
      SELECT COUNT(DISTINCT r.id)::int AS total
      ${FROM_JOINS}
      WHERE ${where}
    `;

    // Listing with deterministic ordering
    const listSQL = `
      SELECT
        r.id,
        r.status,
        r.created_at,
        r.completed_at,
        r.canceled_at,
        r.driver_id,
        r.passenger_id,
        d.name AS driver_name,
        NULLIF(split_part(btrim(p.name), ' ', 1), '') AS passenger_first_name,
        s.final_price::text AS final_price,
        s.fee_percent::text AS fee_percent,
        s.fee_amount::text AS fee_amount,
        s.driver_earnings::text AS driver_earnings,
        s.settlement_territory,
        s.credit_cost,
        s.settled_at,
        (s.ride_id IS NOT NULL) AS has_settlement
      ${FROM_JOINS}
      WHERE ${where}
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const [summaryResult, countResult, listResult] = await Promise.all([
      pool.query(summarySQL, params),
      pool.query(countSQL, params),
      pool.query(listSQL, [...params, filters.limit, offset]),
    ]);

    const summary = summaryResult.rows[0];
    const total = countResult.rows[0].total;
    const totalPages = Math.ceil(total / filters.limit);

    const rides = listResult.rows.map(serializeRide);

    return res.json({
      success: true,
      data: {
        summary: {
          total_rides: summary.total_rides,
          completed_rides: summary.completed_rides,
          canceled_rides: summary.canceled_rides,
          gross_total: formatDecimal(summary.gross_total) || '0.00',
          platform_fee_total: formatDecimal(summary.platform_fee_total) || '0.00',
          driver_earnings_total: formatDecimal(summary.driver_earnings_total) || '0.00',
          period: {
            start: filters.startDate.toISOString(),
            end: filters.endDate.toISOString(),
          },
        },
        rides,
        pagination: {
          page: filters.page,
          limit: filters.limit,
          total,
          totalPages,
        },
      },
    });
  } catch (error) {
    console.error('[ACCOUNTANT_REPORT]', error);
    return res.status(500).json({ success: false, error: 'Erro interno do servidor' });
  }
});

// ── GET /accountant-report/csv ────────────────────────────────────────────────

router.get('/csv', async (req: Request, res: Response) => {
  try {
    const parsed = parseFilters(req.query);
    if ('error' in parsed) {
      return res.status(400).json({ success: false, error: parsed.error });
    }

    const filters = parsed;
    const { where, params } = buildWhereClause(filters);

    // Count first — reject if over limit
    const countSQL = `
      SELECT COUNT(DISTINCT r.id)::int AS total
      ${FROM_JOINS}
      WHERE ${where}
    `;
    const countResult = await pool.query(countSQL, params);
    const total = countResult.rows[0].total;

    if (total > CSV_MAX_ROWS) {
      return res.status(422).json({
        success: false,
        code: 'CSV_ROW_LIMIT_EXCEEDED',
        error: 'O relatório possui mais de 5.000 linhas. Reduza o período ou aplique mais filtros.',
        total,
        max: CSV_MAX_ROWS,
      });
    }

    // Fetch all rows (capped at CSV_MAX_ROWS for safety)
    const listSQL = `
      SELECT
        r.id,
        r.status,
        r.created_at,
        r.completed_at,
        r.canceled_at,
        d.name AS driver_name,
        NULLIF(split_part(btrim(p.name), ' ', 1), '') AS passenger_first_name,
        s.final_price::text AS final_price,
        s.fee_percent::text AS fee_percent,
        s.fee_amount::text AS fee_amount,
        s.driver_earnings::text AS driver_earnings,
        s.settlement_territory,
        s.credit_cost,
        s.settled_at,
        (s.ride_id IS NOT NULL) AS has_settlement
      ${FROM_JOINS}
      WHERE ${where}
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT ${CSV_MAX_ROWS}
    `;

    const result = await pool.query(listSQL, params);

    const FINANCIAL_STATUS_LABELS: Record<FinancialStatus, string> = {
      SETTLED: 'Liquidado',
      UNSETTLED: 'Não liquidado',
      UNAVAILABLE: 'Indisponível',
    };

    // Build CSV
    const headers = [
      'ID Corrida',
      'Data',
      'Status',
      'Status Financeiro',
      'Motorista',
      'Passageiro',
      'Território',
      'Valor Bruto (R$)',
      'Taxa Plataforma (%)',
      'Taxa Plataforma (R$)',
      'Valor Motorista (R$)',
      'Créditos Consumidos',
      'Data Liquidação',
    ];

    const rows = result.rows.map((row: any) => {
      const financialStatus = deriveFinancialStatus(row.has_settlement, row.settled_at);
      const isSettled = financialStatus === 'SETTLED';

      return [
        csvSafe(row.id),
        csvSafe(formatDateBR(row.created_at)),
        csvSafe(row.status),
        csvSafe(FINANCIAL_STATUS_LABELS[financialStatus]),
        csvSafe(row.driver_name),
        csvSafe(row.passenger_first_name),
        csvSafe(row.settlement_territory),
        csvSafe(isSettled ? (formatDecimal(row.final_price) || '') : ''),
        csvSafe(isSettled ? (formatDecimal(row.fee_percent) || '') : ''),
        csvSafe(isSettled ? (formatDecimal(row.fee_amount) || '') : ''),
        csvSafe(isSettled ? (formatDecimal(row.driver_earnings) || '') : ''),
        csvSafe(isSettled && row.credit_cost != null ? String(row.credit_cost) : ''),
        csvSafe(formatDateBR(row.settled_at)),
      ];
    });

    const csvContent = [
      headers.map(h => `"${h}"`).join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\r\n');

    const startStr = formatDateISO(filters.startDate);
    const endStr = formatDateISO(filters.endDate);
    const filename = `kaviar-relatorio-contador-${startStr}-a-${endStr}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    // BOM for Excel UTF-8 recognition
    return res.send('\uFEFF' + csvContent);
  } catch (error) {
    console.error('[ACCOUNTANT_REPORT_CSV]', error);
    return res.status(500).json({ success: false, error: 'Erro ao gerar CSV' });
  }
});

export default router;
