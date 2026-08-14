/**
 * Excellence Seal Scheduler — runs daily at 04:00 America/Sao_Paulo.
 * Evaluates eligibility, grants, suspends, and restores EXCELLENCE_SEAL.
 * Revocation is manual-only (ban or SUPER_ADMIN decision).
 */
import { pool } from '../db';
import { withSchedulerLock } from '../lib/scheduler-lock';

const BADGE_CODE = 'EXCELLENCE_SEAL';
const SCHEDULER_INTERVAL_MS = 60 * 60 * 1000; // Check every hour; logic runs only at 04:00 SP
const RUN_HOUR_SP = 4; // 04:00 America/Sao_Paulo

// Criteria (all are proposals, configurable via env in future)
const MIN_COMPLETED_RIDES = 10_000;
const MIN_HISTORICAL_AVG = 4.7;
const MIN_RECENT_AVG_90D = 4.6;
const MIN_TOTAL_RATINGS = 500;
const MIN_RECENT_RATINGS_90D = 10;
const MAX_LOW_RATINGS_30D = 2; // < 3 means max 2
const MIN_ACTIVE_MONTHS = 12;
const GRACE_PERIOD_DAYS = 7;

interface EligibilityResult {
  eligible: boolean;
  criteria: Record<string, any>;
  failedCriteria: string[];
}

async function evaluateDriver(driverId: string): Promise<EligibilityResult> {
  const criteria: Record<string, any> = {};
  const failedCriteria: string[] = [];

  // 1. Completed rides with settlement
  const ridesResult = await pool.query<{ cnt: number }>(`
    SELECT COUNT(*)::int AS cnt FROM rides_v2 r
    INNER JOIN ride_settlements s ON s.ride_id = r.id
    WHERE r.driver_id = $1 AND r.status = 'completed' AND s.settled_at IS NOT NULL
  `, [driverId]);
  criteria.completedRides = ridesResult.rows[0]?.cnt ?? 0;
  if (criteria.completedRides < MIN_COMPLETED_RIDES) failedCriteria.push('completedRides');

  // 2. Historical average (from rating_stats)
  const avgResult = await pool.query<{ avg: string | null; total: number }>(`
    SELECT average_rating::text AS avg, total_ratings::int AS total
    FROM rating_stats WHERE entity_type = 'DRIVER' AND entity_id = $1
  `, [driverId]);
  criteria.historicalAvg = avgResult.rows[0]?.avg ? parseFloat(avgResult.rows[0].avg) : 0;
  criteria.totalRatings = avgResult.rows[0]?.total ?? 0;
  if (criteria.historicalAvg < MIN_HISTORICAL_AVG) failedCriteria.push('historicalAvg');
  if (criteria.totalRatings < MIN_TOTAL_RATINGS) failedCriteria.push('totalRatings');

  // 3. Recent average 90d + recent count
  const recentResult = await pool.query<{ avg: string | null; cnt: number }>(`
    SELECT ROUND(AVG(rating), 2)::text AS avg, COUNT(*)::int AS cnt
    FROM ratings
    WHERE entity_type = 'DRIVER' AND rater_type = 'PASSENGER' AND entity_id = $1
      AND created_at >= (NOW() - INTERVAL '90 days')
  `, [driverId]);
  criteria.recentAvg90d = recentResult.rows[0]?.avg ? parseFloat(recentResult.rows[0].avg) : 0;
  criteria.recentRatings90d = recentResult.rows[0]?.cnt ?? 0;
  if (criteria.recentRatings90d >= MIN_RECENT_RATINGS_90D && criteria.recentAvg90d < MIN_RECENT_AVG_90D) {
    failedCriteria.push('recentAvg90d');
  }
  if (criteria.recentRatings90d < MIN_RECENT_RATINGS_90D) {
    // Not enough recent data — use only historical; don't fail on recent avg
  }

  // 4. Low ratings last 30d
  const lowResult = await pool.query<{ cnt: number }>(`
    SELECT COUNT(*)::int AS cnt FROM ratings
    WHERE entity_type = 'DRIVER' AND rater_type = 'PASSENGER' AND entity_id = $1
      AND rating <= 2 AND created_at >= (NOW() - INTERVAL '30 days')
  `, [driverId]);
  criteria.lowRatings30d = lowResult.rows[0]?.cnt ?? 0;
  if (criteria.lowRatings30d > MAX_LOW_RATINGS_30D) failedCriteria.push('lowRatings30d');

  // 5. Active months
  const activeResult = await pool.query<{ active_since: string | null }>(`
    SELECT active_since::text FROM drivers WHERE id = $1
  `, [driverId]);
  const activeSince = activeResult.rows[0]?.active_since ? new Date(activeResult.rows[0].active_since) : null;
  const monthsActive = activeSince ? Math.floor((Date.now() - activeSince.getTime()) / (30.44 * 24 * 60 * 60 * 1000)) : 0;
  criteria.activeMonths = monthsActive;
  if (monthsActive < MIN_ACTIVE_MONTHS) failedCriteria.push('activeMonths');

  // 6. Recent ride in 90d
  const recentRideResult = await pool.query<{ has: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM rides_v2 r INNER JOIN ride_settlements s ON s.ride_id = r.id
      WHERE r.driver_id = $1 AND r.status = 'completed' AND s.settled_at IS NOT NULL
        AND s.settled_at >= (NOW() - INTERVAL '90 days')
    ) AS has
  `, [driverId]);
  criteria.recentRide90d = recentRideResult.rows[0]?.has ?? false;
  if (!criteria.recentRide90d) failedCriteria.push('recentRide90d');

  // 7. Compliance: emission_date + valid_until >= NOW()
  const compResult = await pool.query<{ valid: boolean }>(`
    SELECT EXISTS (
      SELECT 1 FROM driver_compliance_documents
      WHERE driver_id = $1 AND is_current = true AND status = 'approved'
        AND emission_date IS NOT NULL AND valid_until >= NOW()
    ) AS valid
  `, [driverId]);
  criteria.complianceValid = compResult.rows[0]?.valid ?? false;
  if (!criteria.complianceValid) failedCriteria.push('complianceValid');

  return { eligible: failedCriteria.length === 0, criteria, failedCriteria };
}

async function runSealEvaluation(): Promise<void> {
  console.log('[EXCELLENCE_SEAL] Starting daily evaluation...');

  // Get all potential candidates (drivers with enough rides to be worth checking)
  const candidates = await pool.query<{ driver_id: string }>(`
    SELECT r.driver_id FROM rides_v2 r
    INNER JOIN ride_settlements s ON s.ride_id = r.id
    WHERE r.status = 'completed' AND s.settled_at IS NOT NULL
    GROUP BY r.driver_id
    HAVING COUNT(*) >= $1
  `, [MIN_COMPLETED_RIDES]);

  // Also check drivers who currently have the seal (for suspension)
  const currentHolders = await pool.query<{ driver_id: string }>(`
    SELECT driver_id FROM driver_badges WHERE badge_type = $1
  `, [BADGE_CODE]);

  const allDriverIds = new Set([
    ...candidates.rows.map(r => r.driver_id),
    ...currentHolders.rows.map(r => r.driver_id),
  ]);

  let granted = 0, suspended = 0, restored = 0, maintained = 0;

  for (const driverId of allDriverIds) {
    try {
      const { eligible, criteria, failedCriteria } = await evaluateDriver(driverId);

      // Check current badge state
      const badge = await pool.query<{ id: string }>(`
        SELECT id FROM driver_badges WHERE driver_id = $1 AND badge_type = $2
      `, [driverId, BADGE_CODE]);
      const hasBadge = badge.rows.length > 0;

      if (eligible && !hasBadge) {
        // GRANT
        await pool.query(`
          INSERT INTO driver_badges (driver_id, badge_type, unlocked_at, progress)
          VALUES ($1, $2, NOW(), 100)
          ON CONFLICT (driver_id, badge_type) DO UPDATE SET progress = 100
        `, [driverId, BADGE_CODE]);
        await pool.query(`
          INSERT INTO driver_badge_events (driver_id, badge_code, event_type, criteria_snapshot, created_at)
          VALUES ($1, $2, 'GRANTED', $3, NOW())
        `, [driverId, BADGE_CODE, JSON.stringify(criteria)]);
        granted++;
      } else if (eligible && hasBadge) {
        // Check if was suspended (progress=0) and restore
        const suspended_badge = await pool.query<{ progress: number }>(`
          SELECT progress FROM driver_badges WHERE driver_id = $1 AND badge_type = $2
        `, [driverId, BADGE_CODE]);
        if (suspended_badge.rows[0]?.progress === 0) {
          await pool.query(`UPDATE driver_badges SET progress = 100 WHERE driver_id = $1 AND badge_type = $2`, [driverId, BADGE_CODE]);
          await pool.query(`INSERT INTO driver_badge_events (driver_id, badge_code, event_type, criteria_snapshot, created_at) VALUES ($1, $2, 'RESTORED', $3, NOW())`, [driverId, BADGE_CODE, JSON.stringify(criteria)]);
          restored++;
        } else {
          maintained++;
        }
      } else if (!eligible && hasBadge) {
        // Check grace period: immediate for low ratings, 7 days for others
        const isLowRatingFail = failedCriteria.includes('lowRatings30d');

        if (isLowRatingFail) {
          // Immediate suspension
          await pool.query(`UPDATE driver_badges SET progress = 0 WHERE driver_id = $1 AND badge_type = $2`, [driverId, BADGE_CODE]);
          await pool.query(`INSERT INTO driver_badge_events (driver_id, badge_code, event_type, reason, criteria_snapshot, created_at) VALUES ($1, $2, 'SUSPENDED', $3, $4, NOW())`, [driverId, BADGE_CODE, 'Notas baixas recorrentes (imediato)', JSON.stringify({ ...criteria, failedCriteria })]);
          suspended++;
        } else {
          // Grace period: check if failing for 7+ consecutive days
          const failHistory = await pool.query<{ cnt: number }>(`
            SELECT COUNT(*)::int AS cnt FROM driver_badge_events
            WHERE driver_id = $1 AND badge_code = $2 AND event_type = 'CRITERIA_FAIL_DETECTED'
              AND created_at >= (NOW() - INTERVAL '1 day' * $3)
          `, [driverId, BADGE_CODE, GRACE_PERIOD_DAYS]);

          if ((failHistory.rows[0]?.cnt ?? 0) >= GRACE_PERIOD_DAYS - 1) {
            // 7 days reached — suspend
            await pool.query(`UPDATE driver_badges SET progress = 0 WHERE driver_id = $1 AND badge_type = $2`, [driverId, BADGE_CODE]);
            await pool.query(`INSERT INTO driver_badge_events (driver_id, badge_code, event_type, reason, criteria_snapshot, created_at) VALUES ($1, $2, 'SUSPENDED', $3, $4, NOW())`, [driverId, BADGE_CODE, `Critérios não atendidos por ${GRACE_PERIOD_DAYS} dias`, JSON.stringify({ ...criteria, failedCriteria })]);
            suspended++;
          } else {
            // Record fail detection
            await pool.query(`INSERT INTO driver_badge_events (driver_id, badge_code, event_type, criteria_snapshot, created_at) VALUES ($1, $2, 'CRITERIA_FAIL_DETECTED', $3, NOW())`, [driverId, BADGE_CODE, JSON.stringify({ ...criteria, failedCriteria })]);
          }
        }
      }
    } catch (err) {
      console.error(`[EXCELLENCE_SEAL] Error evaluating driver ${driverId}:`, (err as Error).message?.slice(0, 100));
    }
  }

  console.log(`[EXCELLENCE_SEAL] Completed: granted=${granted} suspended=${suspended} restored=${restored} maintained=${maintained} total_evaluated=${allDriverIds.size}`);
}

export function startExcellenceSealScheduler(): void {
  console.log('[EXCELLENCE_SEAL] Scheduler registered (runs daily at 04:00 America/Sao_Paulo)');

  setInterval(async () => {
    // Check if it's 04:xx in São Paulo
    const spHour = new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: 'numeric', hour12: false });
    if (parseInt(spHour) !== RUN_HOUR_SP) return;

    const acquired = await withSchedulerLock('excellence_seal_daily', runSealEvaluation);
    if (acquired) {
      console.log('[EXCELLENCE_SEAL] Daily run completed.');
    }
  }, SCHEDULER_INTERVAL_MS);
}
