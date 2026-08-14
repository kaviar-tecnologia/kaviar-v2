/**
 * Tools: compliance_summary and excellence_seal_summary
 * Read-only aggregated views for SUPER_ADMIN Chat KAVIAR.
 */
import { pool } from '../../db';

// ── compliance_summary ────────────────────────────────────────────────────────

export type ComplianceSummaryData = {
  available: boolean;
  total: number;
  valid: number;
  expiringSoon30d: number;
  expired: number;
  noEmissionDate: number;
  pending: number;
  referenceTime: string;
};

export async function getComplianceSummary(): Promise<{
  tool: 'compliance_summary';
  data: ComplianceSummaryData;
}> {
  try {
    const result = await pool.query<{
      total: number; valid: number; expiring: number; expired: number; no_emission: number; pending: number;
    }>(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'approved' AND is_current = true AND valid_until >= NOW())::int AS valid,
        COUNT(*) FILTER (WHERE status = 'approved' AND is_current = true AND valid_until >= NOW() AND valid_until < (NOW() + INTERVAL '30 days'))::int AS expiring,
        COUNT(*) FILTER (WHERE status = 'approved' AND is_current = true AND valid_until < NOW())::int AS expired,
        COUNT(*) FILTER (WHERE status = 'approved' AND is_current = true AND emission_date IS NULL)::int AS no_emission,
        COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
      FROM driver_compliance_documents
    `);
    const r = result.rows[0]!;
    const refResult = await pool.query<{ ref: string }>(`SELECT to_char(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS ref`);
    return {
      tool: 'compliance_summary',
      data: { available: true, total: r.total, valid: r.valid, expiringSoon30d: r.expiring, expired: r.expired, noEmissionDate: r.no_emission, pending: r.pending, referenceTime: refResult.rows[0]?.ref ?? '' },
    };
  } catch {
    return { tool: 'compliance_summary', data: { available: false, total: 0, valid: 0, expiringSoon30d: 0, expired: 0, noEmissionDate: 0, pending: 0, referenceTime: '' } };
  }
}

// ── excellence_seal_summary ───────────────────────────────────────────────────

export type ExcellenceSealSummaryData = {
  available: boolean;
  activeCount: number;
  suspendedCount: number;
  grantedThisWeek: number;
  suspendedThisWeek: number;
  referenceTime: string;
};

export async function getExcellenceSealSummary(): Promise<{
  tool: 'excellence_seal_summary';
  data: ExcellenceSealSummaryData;
}> {
  try {
    const result = await pool.query<{ active: number; suspended_count: number }>(`
      SELECT
        COUNT(*) FILTER (WHERE progress = 100)::int AS active,
        COUNT(*) FILTER (WHERE progress = 0)::int AS suspended_count
      FROM driver_badges WHERE badge_code = 'EXCELLENCE_SEAL'
    `);
    const weekResult = await pool.query<{ granted_week: number; suspended_week: number }>(`
      SELECT
        COUNT(*) FILTER (WHERE event_type = 'GRANTED' AND created_at >= date_trunc('week', NOW() AT TIME ZONE 'America/Sao_Paulo'))::int AS granted_week,
        COUNT(*) FILTER (WHERE event_type = 'SUSPENDED' AND created_at >= date_trunc('week', NOW() AT TIME ZONE 'America/Sao_Paulo'))::int AS suspended_week
      FROM driver_badge_events WHERE badge_code = 'EXCELLENCE_SEAL'
    `);
    const refResult = await pool.query<{ ref: string }>(`SELECT to_char(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS ref`);
    const r = result.rows[0]!;
    const w = weekResult.rows[0]!;
    return {
      tool: 'excellence_seal_summary',
      data: { available: true, activeCount: r.active, suspendedCount: r.suspended_count, grantedThisWeek: w.granted_week, suspendedThisWeek: w.suspended_week, referenceTime: refResult.rows[0]?.ref ?? '' },
    };
  } catch {
    return { tool: 'excellence_seal_summary', data: { available: false, activeCount: 0, suspendedCount: 0, grantedThisWeek: 0, suspendedThisWeek: 0, referenceTime: '' } };
  }
}
