import { pool } from '../../db';

export type RidesSummaryTodayData = {
  rides: number;
  grossAmount: string;
  kaviarFee: string;
};

export type DriversDocumentsPendingData = {
  driversAffected: number;
  summary: Record<string, number>;
  compliancePending: number;
};

export async function getRidesSummaryToday(): Promise<{
  tool: 'rides_summary_today';
  data: RidesSummaryTodayData;
}> {
  const result = await pool.query<{
    rides: number;
    gross_total: string;
    platform_fee_total: string;
  }>(`
    SELECT
      COUNT(DISTINCT r.id)::int AS rides,
      COALESCE(SUM(s.final_price), 0)::text AS gross_total,
      COALESCE(SUM(s.fee_amount), 0)::text AS platform_fee_total
    FROM rides_v2 r
    INNER JOIN ride_settlements s ON s.ride_id = r.id
    WHERE s.settled_at IS NOT NULL
      AND (
        s.settled_at
          AT TIME ZONE 'UTC'
          AT TIME ZONE 'America/Sao_Paulo'
      )::date =
      (NOW() AT TIME ZONE 'America/Sao_Paulo')::date
  `);

  const row = result.rows[0];

  if (!row) {
    throw new Error(
      'Não foi possível obter o resumo financeiro das corridas.'
    );
  }

  return {
    tool: 'rides_summary_today',
    data: {
      rides: row.rides,
      grossAmount: row.gross_total,
      kaviarFee: row.platform_fee_total,
    },
  };
}

export async function getDriversDocumentsPending(): Promise<{
  tool: 'drivers_documents_pending';
  data: DriversDocumentsPendingData;
}> {
  // Documentos obrigatórios com status que requer ação (SUBMITTED = aguardando revisão, MISSING/REJECTED = pendentes do motorista)
  const docResult = await pool.query<{
    status: string;
    driver_count: number;
  }>(`
    SELECT
      status,
      COUNT(DISTINCT driver_id)::int AS driver_count
    FROM driver_documents
    WHERE status IN ('SUBMITTED', 'MISSING', 'REJECTED')
    GROUP BY status
    ORDER BY status
  `);

  // Documentos de compliance pendentes de aprovação admin
  const complianceResult = await pool.query<{
    pending_count: number;
  }>(`
    SELECT COUNT(DISTINCT driver_id)::int AS pending_count
    FROM driver_compliance_documents
    WHERE status = 'pending'
  `);

  const summary: Record<string, number> = {};

  for (const row of docResult.rows) {
    summary[row.status] = row.driver_count;
  }

  // Total de motoristas distintos afetados (precisa de query separada para evitar dupla contagem)
  const totalResult = await pool.query<{
    total_drivers: number;
  }>(`
    SELECT COUNT(DISTINCT driver_id)::int AS total_drivers
    FROM driver_documents
    WHERE status IN ('SUBMITTED', 'MISSING', 'REJECTED')
  `);

  const driversAffected = totalResult.rows[0]?.total_drivers ?? 0;
  const compliancePending = complianceResult.rows[0]?.pending_count ?? 0;

  return {
    tool: 'drivers_documents_pending',
    data: {
      driversAffected,
      summary,
      compliancePending,
    },
  };
}
