import 'dotenv/config';
import { pool } from '../../src/db';

const PASSENGER_ID = 'kaviar_ai_test_passenger';
const RIDE_ID = 'kaviar_ai_test_ride';
const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const PROFILE_SLUG = 'kaviar-ai-test';

function assertLocalDatabase() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error('DATABASE_URL não configurada.');
  }

  const url = new URL(databaseUrl);

  const localHost =
    url.hostname === '127.0.0.1' ||
    url.hostname === 'localhost';

  if (
    !localHost ||
    url.port !== '5433' ||
    url.pathname !== '/kaviar' ||
    process.env.KAVIAR_AI_LOCAL_TEST !== '1'
  ) {
    throw new Error(
      'BLOQUEADO: esta fixture só pode rodar em 127.0.0.1:5433/kaviar com KAVIAR_AI_LOCAL_TEST=1.'
    );
  }
}

async function setup() {
  assertLocalDatabase();

  await pool.query('BEGIN');

  try {
    await pool.query(
      `
      INSERT INTO passengers (
        id,
        name,
        email,
        status,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        'KAVIAR AI Test Passenger',
        'kaviar-ai-test@local.invalid',
        'active',
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE
      SET updated_at = NOW()
      `,
      [PASSENGER_ID]
    );

    await pool.query(
      `
      INSERT INTO pricing_profiles (
        id,
        slug,
        name,
        base_fare,
        per_km,
        per_minute,
        minimum_fare,
        fee_local,
        fee_adjacent,
        fee_external,
        updated_at
      )
      VALUES (
        $1,
        $2,
        'KAVIAR AI Local Test',
        5,
        2,
        0.5,
        8,
        18,
        18,
        18,
        NOW()
      )
      ON CONFLICT (id) DO UPDATE
      SET updated_at = NOW()
      `,
      [PROFILE_ID, PROFILE_SLUG]
    );

    await pool.query(
      `
      INSERT INTO rides_v2 (
        id,
        passenger_id,
        status,
        origin_lat,
        origin_lng,
        dest_lat,
        dest_lng,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        'completed',
        -22.970,
        -43.178,
        -22.971,
        -43.179,
        NOW(),
        NOW()
      )
      ON CONFLICT (id) DO UPDATE
      SET
        status = 'completed',
        updated_at = NOW()
      `,
      [RIDE_ID, PASSENGER_ID]
    );

    await pool.query(
      `
      INSERT INTO ride_settlements (
        ride_id,
        pricing_profile_id,
        pricing_profile_slug,
        route_territory,
        distance_km,
        base_fare_used,
        per_km_used,
        per_minute_used,
        minimum_fare_used,
        quoted_price,
        locked_price,
        final_price,
        fee_percent,
        fee_amount,
        driver_earnings,
        quoted_at,
        locked_at,
        settled_at
      )
      VALUES (
        $1,
        $2,
        $3,
        'local',
        5,
        5,
        2,
        0.5,
        8,
        20.00,
        20.00,
        20.00,
        18.00,
        3.60,
        16.40,
        NOW(),
        NOW(),
        NOW()
      )
      ON CONFLICT (ride_id) DO UPDATE
      SET
        final_price = 20.00,
        fee_percent = 18.00,
        fee_amount = 3.60,
        driver_earnings = 16.40,
        settled_at = NOW()
      `,
      [RIDE_ID, PROFILE_ID, PROFILE_SLUG]
    );

    await pool.query('COMMIT');

    console.log('✅ Fixture criada.');
    console.log('Corrida: R$ 20,00');
    console.log('Receita KAVIAR: R$ 3,60');
  } catch (error) {
    await pool.query('ROLLBACK');
    throw error;
  } finally {
    await pool.end();
  }
}

setup().catch((error) => {
  console.error(error);
  process.exit(1);
});