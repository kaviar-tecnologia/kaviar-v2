/**
 * Tool: driver_ratings_summary
 * Consulta avaliações de motoristas (somente de passageiros para motoristas).
 * Read-only. Não retorna comentários, tags ou dados pessoais.
 */
import { pool } from '../../db';

const ATTENTION_THRESHOLD_LOW_STARS = 2; // 1 ou 2 estrelas
const ATTENTION_MIN_COUNT = 3; // 3 ou mais nos últimos 30 dias
const ATTENTION_WINDOW_DAYS = 30;

export type DriverRatingsSummaryData = {
  available: boolean;
  totalDriversRated: number;
  globalAverageRating: string | null; // decimal string
  driversNeedingAttention: {
    driverId: string;
    driverName: string;
    lowRatingsCount: number;
    averageRating: string;
    totalRatings: number;
  }[];
  attentionCriteria: string;
  referenceTime: string;
  // Individual driver lookup (when driverId provided)
  individual: {
    available: boolean;
    driverId: string | null;
    driverName: string | null;
    averageRating: string | null;
    totalRatings: number;
    distribution: Record<string, number>;
    lowRatingsLast30d: number;
    needsAttention: boolean;
  } | null;
};

export async function getDriverRatingsSummary(args?: Record<string, string>): Promise<{
  tool: 'driver_ratings_summary';
  data: DriverRatingsSummaryData;
}> {
  const driverId = args?.driverId?.trim() || null;

  try {
    // Global stats
    const globalResult = await pool.query<{ total_drivers: number; avg_rating: string | null }>(`
      SELECT
        COUNT(DISTINCT entity_id)::int AS total_drivers,
        ROUND(AVG(average_rating), 2)::text AS avg_rating
      FROM rating_stats
      WHERE entity_type = 'DRIVER'
    `);
    const global = globalResult.rows[0];

    // Drivers needing attention: 3+ low ratings (1-2 stars) in last 30 days
    const attentionResult = await pool.query<{
      driver_id: string; driver_name: string; low_count: number; avg_rating: string; total_ratings: number;
    }>(`
      SELECT
        r.entity_id AS driver_id,
        COALESCE(d.name, 'Motorista') AS driver_name,
        COUNT(*)::int AS low_count,
        ROUND(rs.average_rating, 2)::text AS avg_rating,
        rs.total_ratings::int AS total_ratings
      FROM ratings r
      INNER JOIN drivers d ON d.id = r.entity_id
      LEFT JOIN rating_stats rs ON rs.entity_type = 'DRIVER' AND rs.entity_id = r.entity_id
      WHERE r.entity_type = 'DRIVER'
        AND r.rater_type = 'PASSENGER'
        AND r.rating <= $1
        AND r.created_at >= (NOW() - INTERVAL '1 day' * $2)
      GROUP BY r.entity_id, d.name, rs.average_rating, rs.total_ratings
      HAVING COUNT(*) >= $3
      ORDER BY COUNT(*) DESC
      LIMIT 10
    `, [ATTENTION_THRESHOLD_LOW_STARS, ATTENTION_WINDOW_DAYS, ATTENTION_MIN_COUNT]);

    // Reference time
    const refResult = await pool.query<{ ref: string }>(`SELECT to_char(NOW() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI') AS ref`);
    const referenceTime = refResult.rows[0]?.ref ?? new Date().toISOString();

    // Individual lookup
    let individual: DriverRatingsSummaryData['individual'] = null;
    if (driverId) {
      try {
        const indResult = await pool.query<{
          driver_name: string; avg_rating: string | null; total_ratings: number;
          r1: number; r2: number; r3: number; r4: number; r5: number;
          low_30d: number;
        }>(`
          SELECT
            COALESCE(d.name, 'Motorista') AS driver_name,
            ROUND(rs.average_rating, 2)::text AS avg_rating,
            COALESCE(rs.total_ratings, 0)::int AS total_ratings,
            COUNT(*) FILTER (WHERE r.rating = 1)::int AS r1,
            COUNT(*) FILTER (WHERE r.rating = 2)::int AS r2,
            COUNT(*) FILTER (WHERE r.rating = 3)::int AS r3,
            COUNT(*) FILTER (WHERE r.rating = 4)::int AS r4,
            COUNT(*) FILTER (WHERE r.rating = 5)::int AS r5,
            COUNT(*) FILTER (WHERE r.rating <= $2 AND r.created_at >= (NOW() - INTERVAL '1 day' * $3))::int AS low_30d
          FROM drivers d
          LEFT JOIN rating_stats rs ON rs.entity_type = 'DRIVER' AND rs.entity_id = d.id
          LEFT JOIN ratings r ON r.entity_type = 'DRIVER' AND r.entity_id = d.id AND r.rater_type = 'PASSENGER'
          WHERE d.id = $1
          GROUP BY d.name, rs.average_rating, rs.total_ratings
        `, [driverId, ATTENTION_THRESHOLD_LOW_STARS, ATTENTION_WINDOW_DAYS]);

        const ind = indResult.rows[0];
        if (ind) {
          individual = {
            available: true,
            driverId,
            driverName: ind.driver_name,
            averageRating: ind.avg_rating,
            totalRatings: ind.total_ratings,
            distribution: { '1': ind.r1, '2': ind.r2, '3': ind.r3, '4': ind.r4, '5': ind.r5 },
            lowRatingsLast30d: ind.low_30d,
            needsAttention: ind.low_30d >= ATTENTION_MIN_COUNT,
          };
        } else {
          individual = { available: true, driverId, driverName: null, averageRating: null, totalRatings: 0, distribution: {}, lowRatingsLast30d: 0, needsAttention: false };
        }
      } catch {
        individual = { available: false, driverId, driverName: null, averageRating: null, totalRatings: 0, distribution: {}, lowRatingsLast30d: 0, needsAttention: false };
      }
    }

    return {
      tool: 'driver_ratings_summary',
      data: {
        available: true,
        totalDriversRated: global?.total_drivers ?? 0,
        globalAverageRating: global?.avg_rating ?? null,
        driversNeedingAttention: attentionResult.rows.map(r => ({
          driverId: r.driver_id,
          driverName: r.driver_name,
          lowRatingsCount: r.low_count,
          averageRating: r.avg_rating,
          totalRatings: r.total_ratings,
        })),
        attentionCriteria: `${ATTENTION_MIN_COUNT}+ avaliações de ${ATTENTION_THRESHOLD_LOW_STARS} estrelas ou menos nos últimos ${ATTENTION_WINDOW_DAYS} dias`,
        referenceTime,
        individual,
      },
    };
  } catch {
    return {
      tool: 'driver_ratings_summary',
      data: {
        available: false, totalDriversRated: 0, globalAverageRating: null,
        driversNeedingAttention: [], attentionCriteria: '', referenceTime: new Date().toISOString(), individual: null,
      },
    };
  }
}
