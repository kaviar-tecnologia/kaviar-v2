import { pool } from '../../db';

export type RidesSummaryTodayData = {
  rides: number;
  grossAmount: string;
  kaviarFee: string;
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