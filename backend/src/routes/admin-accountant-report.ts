/**
 * Área do Contador V1 — Somente Leitura
 *
 * GET /api/admin/finance/accountant-report        → resumo + listagem paginada
 * GET /api/admin/finance/accountant-report/csv    → exportação CSV (mesmo filtro)
 *
 * Dados vêm de ride_settlements (fonte de verdade) + rides_v2 (status/datas).
 * Nenhuma operação de escrita. Nenhum recálculo de valores históricos.
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
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  thirtyDaysAgo.setHours(0, 0, 0, 0);

  let startDate: Date;
  let endDate: Date;

  if (query.start_date) {
    startDate = new Date(query.start_date);
    if (isNaN(startDate.getTime())) return { error: 'start_date inválida' };
    startDate.setHours(0, 0, 0, 0);
  } else {
    startDate = thirtyDaysAgo;
  }

  if (query.end_date) {
    endDate = new Date(query.end_date);
    if (isNaN(endDate.getTime())) return { error: 'end_date inválida' };
    endDate.setHours(23, 59, 59, 999);
  } else {
    endDate = new Date(now);
    endDate.setHours(23, 59, 59, 999);
  }

  if (endDate < startDate) return { error: 'end_date deve ser posterior a start_date' };

  const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > MAX_PERIOD_DAYS) return { error: `Período máximo permitido: ${MAX_PERIOD_DAYS} dias` };

  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(query.limit, 10) || DEFAULT_LIMIT));

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
    conditions.push(`(r.id::text ILIKE $${paramIdx} OR d.full_name ILIKE $${paramIdx})`);
    params.push(`%${filters.search}%`);
    paramIdx++;
  }

  return { where: conditions.join(' AND '), params };
}

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

function formatMoney(value: string | number | null | undefined): string {
  if (value == null) return '';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (isNaN(num)) return '';
  return num.toFixed(2);
}

function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatDateShort(value: string | Date | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
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

    // Summary query (uses same WHERE, no pagination)
    const summarySQL = `
      SELECT
        COUNT(DISTINCT r.id)::int AS total_rides,
        COUNT(DISTINCT CASE WHEN r.status = 'completed' THEN r.id END)::int AS completed_rides,
        COUNT(DISTINCT CASE WHEN r.status IN ('canceled_by_passenger','canceled_by_driver') THEN r.id END)::int AS canceled_rides,
        COALESCE(SUM(CASE WHEN r.status = 'completed' THEN s.final_price ELSE 0 END), 0) AS gross_total,
        COALESCE(SUM(CASE WHEN r.status = 'completed' THEN s.fee_amount ELSE 0 END), 0) AS platform_fee_total,
        COALESCE(SUM(CASE WHEN r.status = 'completed' THEN s.driver_earnings ELSE 0 END), 0) AS driver_earnings_total
      FROM rides_v2 r
      LEFT JOIN ride_settlements s ON s.ride_id = r.id
      WHERE ${where}
    `;

    // Count for pagination
    const countSQL = `
      SELECT COUNT(DISTINCT r.id)::int AS total
      FROM rides_v2 r
      LEFT JOIN ride_settlements s ON s.ride_id = r.id
      LEFT JOIN drivers d ON d.id = r.driver_id
      WHERE ${where}
    `;

    // Listing query with pagination
    const listSQL = `
      SELECT
        r.id,
        r.status,
        r.created_at,
        r.completed_at,
        r.canceled_at,
        r.driver_id,
        r.passenger_id,
        d.full_name AS driver_name,
        p.name AS passenger_first_name,
        s.final_price,
        s.fee_percent,
        s.fee_amount,
        s.driver_earnings,
        s.settlement_territory,
        s.credit_cost,
        s.settled_at
      FROM rides_v2 r
      LEFT JOIN ride_settlements s ON s.ride_id = r.id
      LEFT JOIN drivers d ON d.id = r.driver_id
      LEFT JOIN passengers p ON p.id = r.passenger_id
      WHERE ${where}
      ORDER BY r.created_at DESC
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

    const rides = listResult.rows.map((row: any) => ({
      id: row.id,
      status: row.status,
      created_at: row.created_at,
      completed_at: row.completed_at,
      canceled_at: row.canceled_at,
      driver_id: row.driver_id,
      driver_name: row.driver_name || null,
      passenger_first_name: row.passenger_first_name || null,
      final_price: row.final_price != null ? formatMoney(row.final_price) : null,
      fee_percent: row.fee_percent != null ? formatMoney(row.fee_percent) : null,
      fee_amount: row.fee_amount != null ? formatMoney(row.fee_amount) : null,
      driver_earnings: row.driver_earnings != null ? formatMoney(row.driver_earnings) : null,
      settlement_territory: row.settlement_territory || null,
      credit_cost: row.credit_cost,
      settled_at: row.settled_at,
    }));

    return res.json({
      success: true,
      data: {
        summary: {
          total_rides: summary.total_rides,
          completed_rides: summary.completed_rides,
          canceled_rides: summary.canceled_rides,
          gross_total: formatMoney(summary.gross_total),
          platform_fee_total: formatMoney(summary.platform_fee_total),
          driver_earnings_total: formatMoney(summary.driver_earnings_total),
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
    // CSV: no pagination, enforce maximum rows
    const csvMaxRows = 5000;
    const { where, params } = buildWhereClause(filters);

    const listSQL = `
      SELECT
        r.id,
        r.status,
        r.created_at,
        r.completed_at,
        r.canceled_at,
        d.full_name AS driver_name,
        p.name AS passenger_first_name,
        s.final_price,
        s.fee_percent,
        s.fee_amount,
        s.driver_earnings,
        s.settlement_territory,
        s.credit_cost,
        s.settled_at
      FROM rides_v2 r
      LEFT JOIN ride_settlements s ON s.ride_id = r.id
      LEFT JOIN drivers d ON d.id = r.driver_id
      LEFT JOIN passengers p ON p.id = r.passenger_id
      WHERE ${where}
      ORDER BY r.created_at DESC
      LIMIT $${params.length + 1}
    `;

    const result = await pool.query(listSQL, [...params, csvMaxRows]);

    // Build CSV
    const headers = [
      'ID Corrida',
      'Data',
      'Status',
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

    const rows = result.rows.map((row: any) => [
      csvSafe(row.id),
      csvSafe(formatDate(row.created_at)),
      csvSafe(row.status),
      csvSafe(row.driver_name),
      csvSafe(row.passenger_first_name),
      csvSafe(row.settlement_territory),
      csvSafe(formatMoney(row.final_price)),
      csvSafe(formatMoney(row.fee_percent)),
      csvSafe(formatMoney(row.fee_amount)),
      csvSafe(formatMoney(row.driver_earnings)),
      csvSafe(row.credit_cost != null ? String(row.credit_cost) : ''),
      csvSafe(formatDate(row.settled_at)),
    ]);

    const csvContent = [
      headers.map(h => `"${h}"`).join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(',')),
    ].join('\r\n');

    const startStr = formatDateShort(filters.startDate);
    const endStr = formatDateShort(filters.endDate);
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
