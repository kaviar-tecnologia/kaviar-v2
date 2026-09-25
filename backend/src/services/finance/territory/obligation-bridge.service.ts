/**
 * Territory Cycle → Financial Obligation Bridge.
 *
 * Creates a single financial_obligation when a cycle reaches APPROVED status.
 * Idempotent: will not duplicate if called again for the same cycle.
 * Fail-closed: requires MANAGER_PAYOUT_ENGINE=outbound.
 *
 * Transitions cycle to OBLIGATION_CREATED.
 */

import { Pool, PoolClient } from 'pg';
import { assertOutboundEngine } from './engine-selection';

export interface CreateObligationResult {
  obligationId: string;
  cycleId: string;
  alreadyExists: boolean;
}

const ERRORS = {
  CYCLE_NOT_FOUND: 'TERRITORY_CYCLE_NOT_FOUND',
  INVALID_STATUS: 'TERRITORY_CYCLE_INVALID_TRANSITION',
  ALREADY_EXISTS: 'TERRITORY_CYCLE_OBLIGATION_ALREADY_EXISTS',
} as const;

function makeError(code: string, msg: string): Error {
  return Object.assign(new Error(msg), { code });
}

/**
 * Creates a financial_obligation from an APPROVED territory payout cycle.
 * Transactional and idempotent.
 */
export async function createObligationFromCycle(
  pool: Pool,
  cycleId: string,
  adminId: string,
): Promise<CreateObligationResult> {
  assertOutboundEngine();

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock the cycle row
    const { rows: [cycle] } = await client.query(
      `SELECT id, territory_id, manager_id, reference_month, status,
              approved_amount_cents, fiscal_document_status
       FROM territory_payout_cycles
       WHERE id = $1
       FOR UPDATE`,
      [cycleId]
    );

    if (!cycle) {
      await client.query('ROLLBACK');
      throw makeError(ERRORS.CYCLE_NOT_FOUND, `Cycle ${cycleId} not found`);
    }

    // Idempotency: already OBLIGATION_CREATED or beyond
    if (['OBLIGATION_CREATED', 'PAYMENT_PROCESSING', 'PAID'].includes(cycle.status)) {
      await client.query('ROLLBACK');
      const existing = await pool.query(
        `SELECT id FROM financial_obligations WHERE source_type = 'territory_payout_cycle' AND source_id = $1 LIMIT 1`,
        [cycleId]
      );
      if (!existing.rows[0]?.id) {
        throw makeError('TERRITORY_CYCLE_INCONSISTENCY', `Cycle ${cycleId} is ${cycle.status} but no corresponding financial_obligation found`);
      }
      return { obligationId: existing.rows[0].id, cycleId, alreadyExists: true };
    }

    if (cycle.status !== 'APPROVED') {
      await client.query('ROLLBACK');
      throw makeError(ERRORS.INVALID_STATUS, `Cycle ${cycleId} is ${cycle.status}, expected APPROVED`);
    }

    if (!cycle.manager_id) {
      await client.query('ROLLBACK');
      throw makeError('TERRITORY_CYCLE_NO_MANAGER', 'Cycle has no manager assigned');
    }

    const idempotencyKey = `territory_cycle_obligation:${cycleId}`;
    const amountCents = BigInt(cycle.approved_amount_cents);
    const competenceDate = cycle.reference_month + '-01';

    // Resolve the CNPJ legally responsible for this territory at the cycle competence.
    // Fail closed: outbound money cannot be created without explicit entity attribution.
    const { rows: [entityAssignment] } = await client.query(
      `SELECT legal_entity_id
       FROM financial_entity_territory_assignments
       WHERE territory_id = $1
         AND effective_from <= $2::date
         AND (effective_until IS NULL OR effective_until >= $2::date)
       ORDER BY effective_from DESC
       LIMIT 1`,
      [cycle.territory_id, competenceDate]
    );
    if (!entityAssignment?.legal_entity_id) {
      await client.query('ROLLBACK');
      throw makeError(
        'TERRITORY_CYCLE_LEGAL_ENTITY_NOT_ASSIGNED',
        `Territory ${cycle.territory_id} has no active legal entity assignment for ${cycle.reference_month}`
      );
    }

    const { rows: [mobilityUnit] } = await client.query(
      `SELECT id FROM financial_business_units WHERE code = 'MOBILITY' AND is_active = true LIMIT 1`
    );
    if (!mobilityUnit?.id) {
      await client.query('ROLLBACK');
      throw makeError('FINANCE_MOBILITY_BUSINESS_UNIT_MISSING', 'MOBILITY business unit is not active');
    }

    // Ensure payee exists for manager
    const { rows: [payee] } = await client.query(
      `SELECT id FROM financial_payees WHERE reference_id = $1 AND payee_type = 'MANAGER' LIMIT 1`,
      [cycle.manager_id]
    );

    let payeeId: string;
    if (payee) {
      payeeId = payee.id;
    } else {
      // Payee must be pre-registered for managers — fail-closed
      await client.query('ROLLBACK');
      throw makeError('TERRITORY_CYCLE_PAYEE_NOT_FOUND', `No payee registered for manager ${cycle.manager_id}. Register the payee first.`);
    }

    // Create financial_obligation
    const { rows: [obligation] } = await client.query(
      `INSERT INTO financial_obligations (
        payee_id, purpose, source_type, source_id, legal_entity_id, business_unit_id,
        description_safe, gross_amount_cents, net_amount_cents,
        competence_date, status, idempotency_key, created_by_system,
        created_at, updated_at
       ) VALUES (
        $1, 'MANAGER_TERRITORIAL_COMMISSION', 'territory_payout_cycle', $2, $3, $4,
        $5, $6, $6,
        $7::date, 'DRAFT', $8, true,
        NOW(), NOW()
       )
       ON CONFLICT (idempotency_key) DO UPDATE SET updated_at = NOW()
       RETURNING id`,
      [
        payeeId,
        cycleId,
        entityAssignment.legal_entity_id,
        mobilityUnit.id,
        `Comissão territorial ${cycle.reference_month}`,
        amountCents.toString(),
        competenceDate,
        idempotencyKey,
      ]
    );

    // Advance cycle status
    await client.query(
      `UPDATE territory_payout_cycles
       SET status = 'OBLIGATION_CREATED', updated_at = NOW()
       WHERE id = $1`,
      [cycleId]
    );

    // Create outbox entry for async payment processing
    await client.query(
      `INSERT INTO financial_payout_outbox (obligation_id, payee_id, purpose, status, created_at, updated_at)
       VALUES ($1, $2, 'MANAGER_TERRITORIAL_COMMISSION', 'PENDING', NOW(), NOW())
       ON CONFLICT (obligation_id) DO NOTHING`,
      [obligation.id, payeeId]
    );

    await client.query('COMMIT');

    console.log(`[TERRITORY_OBLIGATION] cycle=${cycleId} obligation=${obligation.id} amount=${amountCents}`);

    return { obligationId: obligation.id, cycleId, alreadyExists: false };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
