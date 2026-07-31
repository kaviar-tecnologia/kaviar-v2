/**
 * Preflight: Territory Cycles Migration Safety Check
 *
 * Read-only script. Must pass before applying hardening migration.
 * Run with: DATABASE_URL=... npx tsx scripts/finance/preflight-territory-cycles.ts
 */

import pg from 'pg';

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  let failures = 0;

  try {
    console.log('═══ Preflight: Territory Cycles ═══\n');

    // 1. Duplicate active assignments
    const { rows: dupAssignments } = await pool.query(`
      SELECT territory_id, array_agg(id::text) AS ids, array_agg(admin_id) AS admins
      FROM territory_manager_assignments
      WHERE status = 'active'
      GROUP BY territory_id
      HAVING COUNT(*) > 1
    `);
    if (dupAssignments.length > 0) {
      console.error('❌ BLOCKING: Duplicate active assignments:');
      for (const d of dupAssignments) {
        console.error(`  territory=${d.territory_id} ids=${d.ids} admins=${d.admins}`);
      }
      failures++;
    } else {
      console.log('✓ No duplicate active assignments');
    }

    // 2. Duplicate MANAGER payees
    const { rows: dupPayees } = await pool.query(`
      SELECT reference_id, array_agg(id::text) AS ids
      FROM financial_payees
      WHERE payee_type = 'MANAGER' AND reference_id IS NOT NULL
      GROUP BY payee_type, reference_id
      HAVING COUNT(*) > 1
    `);
    if (dupPayees.length > 0) {
      console.error('❌ BLOCKING: Duplicate MANAGER payees:');
      for (const d of dupPayees) {
        console.error(`  reference_id=${d.reference_id} ids=${d.ids}`);
      }
      console.error('  Run: npx tsx scripts/finance/audit-duplicate-payees.ts');
      failures++;
    } else {
      console.log('✓ No duplicate MANAGER payees');
    }

    // 3. Incremental keys
    const { rows: incrementalKeys } = await pool.query(`
      SELECT idempotency_key FROM territory_ledger
      WHERE idempotency_key LIKE '%:partial%' OR idempotency_key LIKE '%:resolve:%'
      LIMIT 10
    `);
    if (incrementalKeys.length > 0) {
      console.error('❌ BLOCKING: Incremental settlement keys found:');
      for (const k of incrementalKeys) console.error(`  ${k.idempotency_key}`);
      failures++;
    } else {
      console.log('✓ No incremental settlement keys');
    }

    // 4. Idempotency consistency
    const { rows: divergent } = await pool.query(`
      SELECT tl.id, tl.idempotency_key, tl.amount_cents AS existing_amount,
             rfs.fee_collected_cents AS expected_amount
      FROM territory_ledger tl
      JOIN ride_fee_splits rfs ON tl.idempotency_key = 'territory_platform_fee:' || rfs.ride_id
      WHERE rfs.territory_id IS NOT NULL AND rfs.fee_collected_cents > 0
        AND (
          tl.entry_type IS DISTINCT FROM 'platform_fee'
          OR tl.territory_id IS DISTINCT FROM rfs.territory_id
          OR tl.manager_id IS DISTINCT FROM rfs.manager_id
          OR tl.manager_assignment_id IS DISTINCT FROM rfs.manager_assignment_id
          OR tl.reference_month IS DISTINCT FROM rfs.reference_month
          OR tl.amount_cents IS DISTINCT FROM rfs.fee_collected_cents
          OR tl.reference_id IS DISTINCT FROM rfs.ride_id
          OR tl.reference_type IS DISTINCT FROM 'ride'
        )
      UNION ALL
      SELECT tl.id, tl.idempotency_key, tl.amount_cents,
             (rfs.fee_collected_cents * rfs.manager_commission_rate_bps + 5000) / 10000
      FROM territory_ledger tl
      JOIN ride_fee_splits rfs ON tl.idempotency_key = 'territory_fee_share:' || rfs.ride_id
      WHERE rfs.territory_id IS NOT NULL AND rfs.fee_collected_cents > 0
        AND (
          tl.entry_type IS DISTINCT FROM 'fee_share'
          OR tl.territory_id IS DISTINCT FROM rfs.territory_id
          OR tl.manager_id IS DISTINCT FROM rfs.manager_id
          OR tl.manager_assignment_id IS DISTINCT FROM rfs.manager_assignment_id
          OR tl.reference_month IS DISTINCT FROM rfs.reference_month
          OR tl.amount_cents IS DISTINCT FROM (rfs.fee_collected_cents * rfs.manager_commission_rate_bps + 5000) / 10000
          OR tl.reference_id IS DISTINCT FROM rfs.ride_id
          OR tl.reference_type IS DISTINCT FROM 'ride'
        )
      LIMIT 20
    `);
    if (divergent.length > 0) {
      console.error(`❌ BLOCKING: ${divergent.length} idempotency mismatches:`);
      for (const d of divergent) {
        console.error(`  id=${d.id} key=${d.idempotency_key} existing=${d.existing_amount} expected=${d.expected_amount}`);
      }
      failures++;
    } else {
      console.log('✓ No idempotency mismatches');
    }

    // 5. Report: recognized_at coverage
    const { rows: [coverage] } = await pool.query(`
      SELECT COUNT(*) AS total,
             COUNT(recognized_at) AS with_recognized,
             COUNT(*) - COUNT(recognized_at) AS without_recognized
      FROM ride_fee_splits
    `);
    console.log(`\n📊 ride_fee_splits coverage: ${coverage.total} total, ${coverage.with_recognized} with recognized_at, ${coverage.without_recognized} without`);

    // Final result
    if (failures > 0) {
      console.error(`\n❌ PREFLIGHT FAILED — ${failures} blocking issue(s). Fix before deploying migration.`);
      process.exit(1);
    } else {
      console.log('\n✅ PREFLIGHT PASSED — safe to apply hardening migration.');
    }
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Preflight error:', err);
  process.exit(2);
});
