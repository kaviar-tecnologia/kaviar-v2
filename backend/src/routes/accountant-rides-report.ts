/**
 * Portal do Contador — Financeiro de Corridas (somente leitura)
 *
 * Reuses query logic from admin-accountant-report but:
 * - Uses accountant JWT auth (not admin)
 * - Scopes data to the entity the accountant is linked to
 * - Only shows for entities that have ride operations
 *
 * Endpoints:
 * GET /rides-report?legal_entity_id=xxx — rides summary + paginated list
 * GET /rides-report/csv?legal_entity_id=xxx — CSV export
 */

import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { verifyEntityAccess } from '../services/accounting/accounting-documents.service';

const router = Router();

const MAX_PERIOD_DAYS = 90;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const CSV_MAX_ROWS = 5000;

// ── Helpers (shared logic from admin report) ──────────────────────────────

function parseStrictDate(value: string, boundary: 'start' | 'end'): Date | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2020 || y > 2100) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return boundary === 'start' ? new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0)) : new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}

function deriveFinancialStatus(hasSettlement: boolean, settledAt: any): string {
  if (!hasSettlement) return 'UNAVAILABLE';
  return settledAt ? 'SETTLED' : 'UNSETTLED';
}

function formatDecimal(value: any): string | null {
  if (value == null) return null;
  const n = Number(value);
  return isNaN(n) ? null : n.toFixed(2);
}

const FROM_JOINS = `
  FROM rides_v2 r
  LEFT JOIN ride_settlements s ON s.ride_id = r.id
  LEFT JOIN drivers d ON d.id = r.driver_id
  LEFT JOIN passengers p ON p.id = r.passenger_id
`;

// ── Check if entity has ride operations ──────────────────────────────────

/**
 * Only entities that actually operate rides should see the rides report.
 * Currently only KAVIAR (the platform operator) has rides.
 * We check: entity CNPJ matches the operator CNPJ AND rides exist.
 * 
 * When a new operator entity is added, add its CNPJ to RIDES_OPERATOR_CNPJS
 * or use an env var / DB flag in the future.
 */
const RIDES_OPERATOR_CNPJS = new Set([
  '67783601000199', // KAVIAR TECNOLOGIA E SERVICOS DIGITAIS LTDA
]);

async function entityHasRides(entityId: string): Promise<boolean> {
  // Check if this entity is a rides operator
  const entityResult = await pool.query(
    'SELECT cnpj FROM legal_entities WHERE id = $1',
    [entityId]
  );
  const cnpj = entityResult.rows[0]?.cnpj?.replace(/\D/g, '');
  if (!cnpj || !RIDES_OPERATOR_CNPJS.has(cnpj)) {
    return false;
  }

  // Verify there are actually rides in the system
  const ridesResult = await pool.query('SELECT EXISTS(SELECT 1 FROM rides_v2 LIMIT 1) as has_rides');
  return ridesResult.rows[0]?.has_rides || false;
}

// ── GET /rides-report ─────────────────────────────────────────────────────

router.get('/rides-report', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const entityId = req.query.legal_entity_id as string;

    if (!entityId) {
      return res.status(400).json({ success: false, error: 'legal_entity_id é obrigatório' });
    }

    // Scope validation
    const link = await verifyEntityAccess(accountant.id, entityId);
    if (!link) return res.status(404).json({ success: false, error: 'Empresa não encontrada' });

    // Check if entity has rides
    const hasRides = await entityHasRides(entityId);
    if (!hasRides) {
      return res.status(404).json({ success: false, error: 'Esta empresa não possui operação de corridas' });
    }

    // Parse filters
    const startStr = req.query.start_date as string;
    const endStr = req.query.end_date as string;
    const status = req.query.status as string;
    const search = req.query.search as string;
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit as string) || DEFAULT_LIMIT));

    let startDate = startStr ? parseStrictDate(startStr, 'start') : null;
    let endDate = endStr ? parseStrictDate(endStr, 'end') : null;

    // Default: last 30 days
    if (!startDate) {
      startDate = new Date();
      startDate.setUTCDate(startDate.getUTCDate() - 30);
      startDate.setUTCHours(0, 0, 0, 0);
    }
    if (!endDate) {
      endDate = new Date();
      endDate.setUTCHours(23, 59, 59, 999);
    }

    // Max period
    const diffDays = (endDate.getTime() - startDate.getTime()) / 86400000;
    if (diffDays > MAX_PERIOD_DAYS) {
      return res.status(400).json({ success: false, error: `Período máximo: ${MAX_PERIOD_DAYS} dias` });
    }

    // Build WHERE
    const conditions = ['r.created_at >= $1', 'r.created_at <= $2'];
    const params: any[] = [startDate, endDate];
    let paramIdx = 3;

    if (status === 'SETTLED') { conditions.push('s.settled_at IS NOT NULL'); }
    else if (status === 'UNSETTLED') { conditions.push('s.id IS NOT NULL AND s.settled_at IS NULL'); }
    else if (status === 'UNAVAILABLE') { conditions.push('s.id IS NULL'); }

    if (search) {
      conditions.push(`(d.name ILIKE $${paramIdx} OR p.first_name ILIKE $${paramIdx} OR r.id::text ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }

    const where = conditions.join(' AND ');
    const offset = (page - 1) * limit;

    // Summary (settled only)
    const summarySQL = `
      SELECT 
        COUNT(*) as total_rides,
        COUNT(CASE WHEN s.settled_at IS NOT NULL THEN 1 END) as settled_rides,
        COALESCE(SUM(CASE WHEN s.settled_at IS NOT NULL THEN s.final_price END), 0) as total_revenue,
        COALESCE(SUM(CASE WHEN s.settled_at IS NOT NULL THEN s.fee_amount END), 0) as total_fees,
        COALESCE(SUM(CASE WHEN s.settled_at IS NOT NULL THEN s.driver_earnings END), 0) as total_driver_earnings
      ${FROM_JOINS}
      WHERE ${where}
    `;

    // Data
    const dataSQL = `
      SELECT 
        r.id, r.status, r.created_at, r.completed_at, r.canceled_at,
        r.driver_id, d.name as driver_name, p.first_name as passenger_first_name,
        s.id IS NOT NULL as has_settlement, s.settled_at,
        s.final_price, s.fee_percent, s.fee_amount, s.driver_earnings, s.credit_cost,
        s.settlement_territory
      ${FROM_JOINS}
      WHERE ${where}
      ORDER BY r.created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;

    const [summaryResult, dataResult, countResult] = await Promise.all([
      pool.query(summarySQL, params),
      pool.query(dataSQL, [...params, limit, offset]),
      pool.query(`SELECT COUNT(*) as total ${FROM_JOINS} WHERE ${where}`, params),
    ]);

    const summary = summaryResult.rows[0];
    const total = parseInt(countResult.rows[0]?.total || '0');

    const rides = dataResult.rows.map(row => {
      const financialStatus = deriveFinancialStatus(row.has_settlement, row.settled_at);
      return {
        id: row.id,
        status: row.status,
        financial_status: financialStatus,
        created_at: row.created_at,
        completed_at: row.completed_at,
        driver_name: row.driver_name || null,
        passenger_first_name: row.passenger_first_name || null,
        final_price: financialStatus === 'SETTLED' ? formatDecimal(row.final_price) : null,
        fee_amount: financialStatus === 'SETTLED' ? formatDecimal(row.fee_amount) : null,
        driver_earnings: financialStatus === 'SETTLED' ? formatDecimal(row.driver_earnings) : null,
        settlement_territory: row.settlement_territory || null,
        settled_at: row.settled_at,
      };
    });

    res.json({
      success: true,
      data: {
        summary: {
          total_rides: parseInt(summary.total_rides),
          settled_rides: parseInt(summary.settled_rides),
          total_revenue: formatDecimal(summary.total_revenue),
          total_fees: formatDecimal(summary.total_fees),
          total_driver_earnings: formatDecimal(summary.total_driver_earnings),
        },
        rides,
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        filters: { start_date: startDate.toISOString(), end_date: endDate.toISOString(), status: status || null },
      },
    });
  } catch (err: any) {
    console.error('[rides-report] error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// ── GET /rides-report/csv ─────────────────────────────────────────────────

router.get('/rides-report/csv', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const entityId = req.query.legal_entity_id as string;

    if (!entityId) return res.status(400).json({ success: false, error: 'legal_entity_id é obrigatório' });

    const link = await verifyEntityAccess(accountant.id, entityId);
    if (!link) return res.status(404).json({ success: false, error: 'Empresa não encontrada' });

    // Parse dates
    const startStr = req.query.start_date as string;
    const endStr = req.query.end_date as string;
    let startDate = startStr ? parseStrictDate(startStr, 'start') : new Date(Date.now() - 30 * 86400000);
    let endDate = endStr ? parseStrictDate(endStr, 'end') : new Date();
    if (!startDate) startDate = new Date(Date.now() - 30 * 86400000);
    if (!endDate) endDate = new Date();

    const conditions = ['r.created_at >= $1', 'r.created_at <= $2'];
    const params: any[] = [startDate, endDate];

    const where = conditions.join(' AND ');

    const sql = `
      SELECT 
        r.id, r.status, r.created_at, r.completed_at,
        d.name as driver_name, p.first_name as passenger_first_name,
        s.id IS NOT NULL as has_settlement, s.settled_at,
        s.final_price, s.fee_percent, s.fee_amount, s.driver_earnings, s.settlement_territory
      ${FROM_JOINS}
      WHERE ${where}
      ORDER BY r.created_at DESC
      LIMIT ${CSV_MAX_ROWS}
    `;

    const result = await pool.query(sql, params);

    // Generate CSV
    const BOM = '\ufeff';
    const header = 'ID;Status;Data;Motorista;Passageiro;Valor;Taxa;Ganho Motorista;Território;Liquidado Em\n';
    const rows = result.rows.map(row => {
      const fs = deriveFinancialStatus(row.has_settlement, row.settled_at);
      return [
        row.id,
        row.status,
        row.created_at ? new Date(row.created_at).toLocaleString('pt-BR') : '',
        row.driver_name || '',
        row.passenger_first_name || '',
        fs === 'SETTLED' ? formatDecimal(row.final_price) : '',
        fs === 'SETTLED' ? formatDecimal(row.fee_amount) : '',
        fs === 'SETTLED' ? formatDecimal(row.driver_earnings) : '',
        row.settlement_territory || '',
        row.settled_at ? new Date(row.settled_at).toLocaleString('pt-BR') : '',
      ].join(';');
    }).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=corridas_${new Date().toISOString().slice(0, 10)}.csv`);
    res.send(BOM + header + rows);
  } catch (err: any) {
    console.error('[rides-report] csv error:', err);
    res.status(500).json({ success: false, error: 'Erro interno' });
  }
});

// ── GET /rides-report/available ───────────────────────────────────────────

/**
 * Check if rides report is available for a given entity.
 * Used by frontend to conditionally show the "Financeiro de Corridas" section.
 */
router.get('/rides-report/available', async (req: Request, res: Response) => {
  try {
    const accountant = (req as any).accountant;
    const entityId = req.query.legal_entity_id as string;
    if (!entityId) return res.json({ success: true, data: { available: false } });

    const link = await verifyEntityAccess(accountant.id, entityId);
    if (!link) return res.json({ success: true, data: { available: false } });

    const hasRides = await entityHasRides(entityId);
    res.json({ success: true, data: { available: hasRides } });
  } catch (err: any) {
    res.json({ success: true, data: { available: false } });
  }
});

export const accountantRidesReportRoutes = router;
export default router;
