/**
 * Integration test: wallet_shadow_results UUID column integrity.
 *
 * Verifies that fee_config_id=NULL does not violate UUID constraint
 * on a real PostgreSQL 15 database.
 *
 * SAFETY:
 *   - Uses assertSafeFinanceDatabase() before creating any Pool
 *   - Uses transaction with ROLLBACK — no persistent state
 *   - Unique IDs per run — no collisions in parallel execution
 *   - Will NOT run against production (blocked by guard)
 */
import { describe, it, expect } from 'vitest';
import { Pool, PoolClient } from 'pg';
import { assertSafeFinanceDatabase, PRODUCTION_BLOCKED_ERROR } from '../src/lib/assert-safe-finance-db';

describe('wallet-shadow-uuid integration', () => {
  it('fee_config_id=NULL INSERT succeeds on real PostgreSQL (rollback)', async () => {
    // ═══ SAFETY GUARD — blocks production databases ═══
    assertSafeFinanceDatabase();

    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    let client: PoolClient | null = null;

    try {
      client = await pool.connect();
      await client.query('BEGIN');

      const RUN = `int-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const rideId = `shadow-int-${RUN}`;
      const driverId = `driver-int-${RUN}`;
      const passengerId = `pax-int-${RUN}`;

      // Create FK targets inside the transaction
      await client.query(
        `INSERT INTO passengers (id, name, phone, email, updated_at)
         VALUES ($1, 'Integration Test Pax', $2, $3, NOW())`,
        [passengerId, `+55219${RUN.slice(0, 8)}`, `${RUN}@integration.test`]
      );
      await client.query(
        `INSERT INTO drivers (id, name, phone, email, status, updated_at)
         VALUES ($1, 'Integration Test Driver', $2, $3, 'approved', NOW())`,
        [driverId, `+55219${RUN.slice(0, 8)}1`, `drv-${RUN}@integration.test`]
      );
      await client.query(
        `INSERT INTO rides_v2 (id, passenger_id, status, origin_lat, origin_lng, dest_lat, dest_lng, updated_at)
         VALUES ($1, $2, 'completed', -22.9, -43.2, -22.91, -43.21, NOW())`,
        [rideId, passengerId]
      );

      // ═══ THE TEST: INSERT with fee_config_id = NULL ═══
      // This previously used 'FLAT_CONSTANT_BPS_1800' which violates UUID type
      const result = await client.query(
        `INSERT INTO wallet_shadow_results
          (ride_id, driver_id, calculation_version, calculation_status,
           final_price_cents, wait_charge_cents, fee_config_id,
           fee_percent, fee_amount_cents, driver_earnings_cents, updated_at)
         VALUES ($1, $2, 1, 'success', 2000, 0, $3, 18, 360, 1640, NOW())
         RETURNING id, fee_config_id, fee_percent, calculation_status`,
        [rideId, driverId, null]
      );

      // Assertions
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].fee_config_id).toBeNull();
      expect(Number(result.rows[0].fee_percent)).toBe(18);
      expect(result.rows[0].calculation_status).toBe('success');
    } finally {
      // ═══ ROLLBACK: no persistent state left ═══
      if (client) {
        await client.query('ROLLBACK');
        client.release();
      }
      await pool.end();
    }
  });

  it('assertSafeFinanceDatabase blocks RDS hostname', () => {
    expect(() => assertSafeFinanceDatabase({
      databaseUrl: 'postgresql://user:pass@kaviar-prod.cluster-abc123.us-east-2.rds.amazonaws.com:5432/kaviar',
      nodeEnv: 'test',
    })).toThrow(PRODUCTION_BLOCKED_ERROR);
  });

  it('assertSafeFinanceDatabase blocks NODE_ENV=production', () => {
    expect(() => assertSafeFinanceDatabase({
      databaseUrl: 'postgresql://user:pass@127.0.0.1:5432/kaviar_test',
      nodeEnv: 'production',
    })).toThrow(PRODUCTION_BLOCKED_ERROR);
  });

  it('assertSafeFinanceDatabase allows local with _test name', () => {
    expect(() => assertSafeFinanceDatabase({
      databaseUrl: 'postgresql://user:pass@127.0.0.1:55450/kaviar_test',
      nodeEnv: 'test',
    })).not.toThrow();
  });

  it('assertSafeFinanceDatabase blocks missing DATABASE_URL', () => {
    expect(() => assertSafeFinanceDatabase({
      databaseUrl: undefined as any,
      nodeEnv: 'test',
    })).toThrow(PRODUCTION_BLOCKED_ERROR);
  });
});
