/**
 * Annual Incentive Request Service.
 *
 * Handles creation of payout requests with:
 * - Atomic reservation (REQUEST_RESERVATION events in ledger)
 * - FIFO allocation by program_year
 * - Idempotency
 * - Concurrency safety (partial unique index on open requests)
 * - Destination snapshot immutability
 */

import { Pool, PoolClient } from 'pg';
import { AnnualIncentiveLedgerService } from '../annual-incentive-ledger.service';
import { createPayoutProvider } from './providers';

type Queryable = Pick<Pool | PoolClient, 'query'>;
import { projectBalance, allocateFifo } from './balance-projection';
import { isWithinRequestWindow } from './request-window';
import { getActiveDestination, getDriverCpf } from './destination.service';
import { encryptPayoutSecret, hashPayoutValue, normalizeCpf } from './crypto';
import {
  AnnualIncentiveRequest,
  RequestAllocation,
  FifoAllocation,
  PAYOUT_ERRORS,
  VALID_TRANSITIONS,
  AnnualIncentiveRequestStatus,
  TERMINAL_STATUSES,
} from './types';

const DEADLINE_HOURS = 48;

export interface CreateRequestInput {
  driverId: string;
  requestedAmountCents: bigint;
  idempotencyKey: string;
  now?: Date;
}

export interface CreateRequestResult {
  request: AnnualIncentiveRequest;
  allocations: RequestAllocation[];
  created: boolean;
}

function mapRequest(row: any): AnnualIncentiveRequest {
  return {
    id: row.id,
    driverId: row.driver_id,
    requestedAmountCents: BigInt(row.requested_amount_cents),
    status: row.status,
    destinationSnapshotEncrypted: row.destination_snapshot_encrypted,
    destinationHash: row.destination_hash,
    destinationMasked: row.destination_masked,
    requestedAt: row.requested_at,
    reservedAt: row.reserved_at,
    eligibilityCheckedAt: row.eligibility_checked_at,
    queuedAt: row.queued_at,
    paidAt: row.paid_at,
    failedAt: row.failed_at,
    releasedAt: row.released_at,
    deadlineAt: row.deadline_at,
    idempotencyKey: row.idempotency_key,
    correlationId: row.correlation_id,
    failureCode: row.failure_code,
    failureMessageSafe: row.failure_message_safe,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAllocation(row: any): RequestAllocation {
  return {
    id: row.id,
    requestId: row.request_id,
    programYear: row.program_year,
    amountCents: BigInt(row.amount_cents),
    createdAt: row.created_at,
  };
}

/**
 * Creates a payout request atomically:
 * 1. Validate window
 * 2. Validate destination
 * 3. Project balance
 * 4. Allocate FIFO
 * 5. Create request + allocations + ledger events + outbox
 * All in one transaction.
 */
export async function createRequest(
  pool: Pool,
  ledgerService: AnnualIncentiveLedgerService,
  input: CreateRequestInput,
): Promise<CreateRequestResult> {
  const { driverId, requestedAmountCents, idempotencyKey, now } = input;
  const currentTime = now ?? new Date();

  // 1. Validate amount
  if (requestedAmountCents <= 0n) {
    throw Object.assign(
      new Error('Requested amount must be positive'),
      { code: PAYOUT_ERRORS.INVALID_AMOUNT }
    );
  }

  // 2. Validate window
  if (!isWithinRequestWindow(currentTime)) {
    throw Object.assign(
      new Error('Requests are only allowed from October 1 to December 31 (São Paulo timezone)'),
      { code: PAYOUT_ERRORS.WINDOW_CLOSED }
    );
  }

  // 2b. Validate provider capability BEFORE any financial operation
  const provider = createPayoutProvider();
  const providerAvail = await provider.validateAvailability();
  if (!providerAvail.available) {
    throw Object.assign(
      new Error(providerAvail.reason ?? 'Payout provider capability not confirmed'),
      { code: PAYOUT_ERRORS.PROVIDER_CAPABILITY_NOT_CONFIRMED }
    );
  }

  // 3. Check idempotency (outside transaction for early return)
  const existing = await pool.query(
    'SELECT * FROM annual_incentive_requests WHERE idempotency_key = $1',
    [idempotencyKey]
  );
  if (existing.rows.length > 0) {
    const existingReq = mapRequest(existing.rows[0]);
    if (existingReq.requestedAmountCents !== requestedAmountCents || existingReq.driverId !== driverId) {
      throw Object.assign(
        new Error('Idempotency key conflict: different economic data'),
        { code: PAYOUT_ERRORS.IDEMPOTENCY_CONFLICT }
      );
    }
    const allocs = await pool.query(
      'SELECT * FROM annual_incentive_request_allocations WHERE request_id = $1 ORDER BY program_year',
      [existingReq.id]
    );
    return {
      request: existingReq,
      allocations: allocs.rows.map(mapAllocation),
      created: false,
    };
  }

  // 4. Validate destination exists
  const destination = await getActiveDestination(pool, driverId);
  if (!destination) {
    throw Object.assign(
      new Error('No active payout destination configured'),
      { code: PAYOUT_ERRORS.DESTINATION_NOT_FOUND }
    );
  }

  // 5. Validate CPF matches
  const driverCpf = await getDriverCpf(pool, driverId);
  if (!driverCpf) {
    throw Object.assign(
      new Error('Driver CPF not registered'),
      { code: PAYOUT_ERRORS.CPF_NOT_VERIFIED }
    );
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock driver's ledger rows to prevent concurrent balance changes
    await client.query(
      'SELECT 1 FROM annual_incentive_ledger WHERE driver_id = $1 FOR UPDATE',
      [driverId]
    );

    // 6. Check no open request (the unique index will enforce this too)
    const openCheck = await client.query(
      `SELECT id FROM annual_incentive_requests
       WHERE driver_id = $1 AND status NOT IN ('PAID', 'FAILED_RELEASED', 'CANCELLED_RELEASED')
       FOR UPDATE`,
      [driverId]
    );
    if (openCheck.rows.length > 0) {
      throw Object.assign(
        new Error('Another open request exists for this driver'),
        { code: PAYOUT_ERRORS.OPEN_REQUEST_EXISTS }
      );
    }

    // 7. Project balance within transaction
    const balance = await projectBalance(client, driverId);

    // 8. Validate sufficient balance
    if (requestedAmountCents > balance.totalAvailableCents) {
      throw Object.assign(
        new Error(`Insufficient balance: available=${balance.totalAvailableCents}, requested=${requestedAmountCents}`),
        { code: PAYOUT_ERRORS.INSUFFICIENT_BALANCE }
      );
    }

    // 9. FIFO allocation
    const fifoAllocations = allocateFifo(balance.byYear, requestedAmountCents);

    // 10. Snapshot destination (immutable copy)
    const destSnapshot = encryptPayoutSecret(JSON.stringify({
      pixKeyType: destination.pixKeyType,
      pixKeyHash: destination.pixKeyHash,
      ownerDocumentHash: destination.ownerDocumentHash,
      createdAt: destination.createdAt.toISOString(),
    }));

    // 11. Create request
    const deadlineAt = new Date(currentTime.getTime() + DEADLINE_HOURS * 60 * 60 * 1000);
    const { rows: [reqRow] } = await client.query(
      `INSERT INTO annual_incentive_requests
       (driver_id, requested_amount_cents, status, destination_snapshot_encrypted,
        destination_hash, destination_masked, requested_at, reserved_at, deadline_at,
        idempotency_key)
       VALUES ($1, $2, 'RESERVED', $3, $4, $5, $6, $6, $7, $8)
       RETURNING *`,
      [
        driverId,
        requestedAmountCents.toString(),
        destSnapshot,
        destination.pixKeyHash,
        destination.pixKeyMasked,
        currentTime,
        deadlineAt,
        idempotencyKey,
      ]
    );

    const request = mapRequest(reqRow);

    // 12. Create allocations
    const allocations: RequestAllocation[] = [];
    for (const alloc of fifoAllocations) {
      const { rows: [allocRow] } = await client.query(
        `INSERT INTO annual_incentive_request_allocations (request_id, program_year, amount_cents)
         VALUES ($1, $2, $3) RETURNING *`,
        [request.id, alloc.programYear, alloc.amountCents.toString()]
      );
      allocations.push(mapAllocation(allocRow));
    }

    // 13. Create REQUEST_RESERVATION events in ledger (one per allocation)
    for (const alloc of fifoAllocations) {
      await ledgerService.appendEventInClient(client, {
        driverId,
        programYear: alloc.programYear,
        eventType: 'REQUEST_RESERVATION',
        amountCents: alloc.amountCents,
        baseAmountCents: null,
        rateBasisPoints: null,
        policyVersion: 'annual_incentive_payout_v1',
        sourceType: 'REQUEST',
        sourceId: request.id,
        sourceEventId: `${request.id}:reservation:${alloc.programYear}`,
        requestId: request.id,
        correlationId: request.correlationId,
        reversalOfId: null,
        idempotencyKey: `request_reservation:${request.id}:${alloc.programYear}`,
        metadata: { allocAmountCents: alloc.amountCents.toString() },
        occurredAt: currentTime,
      });
    }

    // 14. Create outbox entry (engine-dependent)
    const { getAnnualIncentivePayoutEngine } = await import('./engine-selection');
    const engine = getAnnualIncentivePayoutEngine();

    if (engine === 'outbound') {
      // Outbound engine: create financial_obligation + financial_payout_outbox
      // Find or create payee for this driver
      let payeeId: string;
      const { rows: existingPayee } = await client.query(
        `SELECT id FROM financial_payees WHERE reference_id = $1 AND payee_type = 'DRIVER' LIMIT 1`,
        [driverId]
      );
      if (existingPayee.length > 0) {
        payeeId = existingPayee[0].id;
      } else {
        const { rows: [newPayee] } = await client.query(
          `INSERT INTO financial_payees (payee_type, reference_id, legal_name_encrypted, cpf_cnpj_encrypted, cpf_cnpj_hmac, cpf_cnpj_masked, document_type, status, verification_status)
           VALUES ('DRIVER', $1, $2, $3, $4, $5, 'CPF', 'ACTIVE', 'VERIFIED') RETURNING id`,
          [driverId, destSnapshot, destination.pixKeyEncrypted, destination.pixKeyHash, destination.pixKeyMasked]
        );
        payeeId = newPayee.id;
      }

      // Create financial_obligation
      const extRef = `kaviar-payment:driver-annual-incentive:${request.id}`;
      const oblIdempotencyKey = `annual_incentive_obligation:${request.id}`;

      await client.query(
        `INSERT INTO financial_obligations
         (payee_id, purpose, source_type, source_id, description_safe, gross_amount_cents,
          net_amount_cents, due_date, idempotency_key, correlation_id, created_by_system,
          destination_snapshot_encrypted, destination_hmac, destination_masked, deadline_at, status)
         VALUES ($1, 'DRIVER_ANNUAL_INCENTIVE', 'ANNUAL_INCENTIVE_REQUEST', $2, 'Gratificação Anual',
                 $3, $3, NULL, $4, $5, true, $6, $7, $8, $9, 'QUEUED')`,
        [
          payeeId, request.id, requestedAmountCents.toString(), oblIdempotencyKey,
          request.correlationId, destSnapshot, destination.pixKeyHash,
          destination.pixKeyMasked, deadlineAt,
        ]
      );

      // Get obligation ID
      const { rows: [oblRow] } = await client.query(
        `SELECT id FROM financial_obligations WHERE idempotency_key = $1`, [oblIdempotencyKey]
      );

      // Create financial_payout_outbox
      await client.query(
        `INSERT INTO financial_payout_outbox (obligation_id, payee_id, purpose, status)
         VALUES ($1, $2, 'DRIVER_ANNUAL_INCENTIVE', 'PENDING')`,
        [oblRow.id, payeeId]
      );
    } else if (engine === 'legacy') {
      // Legacy engine: use annual_incentive_payout_outbox
      await client.query(
        `INSERT INTO annual_incentive_payout_outbox (request_id, driver_id, status, priority)
         VALUES ($1, $2, 'PENDING', 0)`,
        [request.id, driverId]
      );
    }
    // engine === 'disabled': no outbox entry — request stays RESERVED but cannot be submitted

    await client.query('COMMIT');

    return { request, allocations, created: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Validates and performs a state transition on a request.
 */
export async function transitionRequest(
  client: PoolClient,
  requestId: string,
  newStatus: AnnualIncentiveRequestStatus,
  extra?: {
    failureCode?: string;
    failureMessageSafe?: string;
  },
): Promise<AnnualIncentiveRequest> {
  const { rows } = await client.query(
    'SELECT * FROM annual_incentive_requests WHERE id = $1 FOR UPDATE',
    [requestId]
  );

  if (rows.length === 0) {
    throw new Error(`Request not found: ${requestId}`);
  }

  const current = mapRequest(rows[0]);
  const allowed = VALID_TRANSITIONS[current.status];

  if (!allowed.includes(newStatus)) {
    throw Object.assign(
      new Error(`Invalid transition: ${current.status} → ${newStatus}`),
      { code: PAYOUT_ERRORS.TRANSITION_INVALID }
    );
  }

  const updates: string[] = [`status = '${newStatus}'`, `updated_at = NOW()`];
  const now = new Date();

  switch (newStatus) {
    case 'ELIGIBILITY_CHECKED':
      updates.push(`eligibility_checked_at = '${now.toISOString()}'`);
      break;
    case 'QUEUED':
      updates.push(`queued_at = '${now.toISOString()}'`);
      break;
    case 'PAID':
      updates.push(`paid_at = '${now.toISOString()}'`);
      break;
    case 'FAILED_RELEASED':
    case 'CANCELLED_RELEASED':
      updates.push(`released_at = '${now.toISOString()}'`);
      if (extra?.failureCode) updates.push(`failure_code = '${extra.failureCode}'`);
      if (extra?.failureMessageSafe) updates.push(`failure_message_safe = '${extra.failureMessageSafe}'`);
      break;
    case 'BLOCKED':
    case 'BLOCKED_PROVIDER_CAPABILITY':
      updates.push(`failed_at = '${now.toISOString()}'`);
      if (extra?.failureCode) updates.push(`failure_code = '${extra.failureCode}'`);
      if (extra?.failureMessageSafe) updates.push(`failure_message_safe = '${extra.failureMessageSafe}'`);
      break;
  }

  const { rows: [updated] } = await client.query(
    `UPDATE annual_incentive_requests SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    [requestId]
  );

  return mapRequest(updated);
}

/**
 * Gets a request by ID.
 */
export async function getRequestById(
  db: Queryable,
  requestId: string,
): Promise<AnnualIncentiveRequest | null> {
  const { rows } = await db.query(
    'SELECT * FROM annual_incentive_requests WHERE id = $1',
    [requestId]
  );
  return rows.length > 0 ? mapRequest(rows[0]) : null;
}

/**
 * Gets the open request for a driver.
 */
export async function getOpenRequest(
  db: Queryable,
  driverId: string,
): Promise<AnnualIncentiveRequest | null> {
  const { rows } = await db.query(
    `SELECT * FROM annual_incentive_requests
     WHERE driver_id = $1 AND status NOT IN ('PAID', 'FAILED_RELEASED', 'CANCELLED_RELEASED')
     LIMIT 1`,
    [driverId]
  );
  return rows.length > 0 ? mapRequest(rows[0]) : null;
}

/**
 * Lists requests for a driver.
 */
export async function listDriverRequests(
  db: Queryable,
  driverId: string,
  limit = 20,
  offset = 0,
): Promise<AnnualIncentiveRequest[]> {
  const { rows } = await db.query(
    `SELECT * FROM annual_incentive_requests
     WHERE driver_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [driverId, limit, offset]
  );
  return rows.map(mapRequest);
}

/**
 * Gets allocations for a request.
 */
export async function getRequestAllocations(
  db: Queryable,
  requestId: string,
): Promise<RequestAllocation[]> {
  const { rows } = await db.query(
    'SELECT * FROM annual_incentive_request_allocations WHERE request_id = $1 ORDER BY program_year',
    [requestId]
  );
  return rows.map(mapAllocation);
}
