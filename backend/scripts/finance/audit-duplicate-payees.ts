/**
 * Audit: Duplicate Financial Payees (MANAGER type)
 *
 * Read-only script — produces detailed report of duplicates and their
 * linked destinations, obligations, and payouts.
 *
 * Run with: DATABASE_URL=... npx tsx scripts/finance/audit-duplicate-payees.ts
 */

import pg from 'pg';

async function main() {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const { rows } = await pool.query(`
      SELECT
        fp.id AS payee_id,
        fp.payee_type,
        fp.reference_id,
        fp.display_name,
        fp.created_at,
        (SELECT COUNT(*) FROM financial_payee_destinations fpd WHERE fpd.payee_id = fp.id) AS destination_count,
        (SELECT COUNT(*) FROM financial_obligations fo WHERE fo.payee_id = fp.id) AS obligation_count,
        (SELECT COUNT(*) FROM financial_payouts fpo WHERE fpo.payee_id = fp.id) AS payout_count
      FROM financial_payees fp
      WHERE fp.payee_type = 'MANAGER'
        AND fp.reference_id IN (
          SELECT reference_id FROM financial_payees
          WHERE payee_type = 'MANAGER' AND reference_id IS NOT NULL
          GROUP BY reference_id HAVING COUNT(*) > 1
        )
      ORDER BY fp.reference_id, fp.created_at
    `);

    if (rows.length === 0) {
      console.log('No duplicate MANAGER payees found.');
      return;
    }

    console.log(`Found ${rows.length} payee records across duplicated references:\n`);
    console.log(JSON.stringify(rows, null, 2));
    console.log('\n⚠️  Manual consolidation required:');
    console.log('  1. Identify which payee_id should be kept for each reference_id');
    console.log('  2. Remap financial_payee_destinations, obligations, and payouts to kept ID');
    console.log('  3. Remove duplicate payee via dedicated migration');
    console.log('  4. Re-run preflight to confirm clean state');
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error('Audit error:', err);
  process.exit(1);
});
