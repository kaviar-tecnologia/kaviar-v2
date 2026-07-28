/**
 * Payout Worker Service.
 *
 * Processes the outbox queue:
 * 1. Picks pending items using FOR UPDATE SKIP LOCKED
 * 2. Runs eligibility checks
 * 3. Submits to provider (outside DB transaction)
 * 4. Records result idempotently
 *
 * Uses advisory lock pattern from withSchedulerLock.
 * Does NOT hold DB transaction open during HTTP calls.
 */

import { Pool, PoolClient } from 'pg';
import { AnnualIncentiveLedgerService } from '../annual-incentive-ledger.service';
import { transitionRequest, getRequestById, getRequestAllocations } from './request.service';
import { checkEligibility, EligibilityContext } from './eligibility.service';
import { getActiveDestination } from './destination.service';
import { decryptPayoutSecret, normalizeCpf } from './crypto';
import {
  AnnualIncentivePayoutProvider,
  AnnualIncentiveRequest,
  PAYOUT_ERRORS,
  TERMINAL_STATUSES,
} from './types';

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 60_000; // 1 minute
const MAX_BACKOFF_MS = 3_600_000; // 1 hour
const BATCH_SIZE = 10;

export interface WorkerDeps {
  pool: Pool;
  ledgerService: AnnualIncentiveLedgerService;
  provider: AnnualIncentivePayoutProvider;
}

interface OutboxItem {
  id: string;
  requestId: string;
  driverId: string;
  status: string;
  attempts: number;
}

/**
 * Processes a batch of outbox items.
 * Returns number of items processed.
 */
export async function processOutboxBatch(deps: WorkerDeps): Promise<number> {
  const { pool, ledgerService, provider } = deps;

  // Pick items ready for processing
  const client = await pool.connect();
  let items: OutboxItem[];
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, request_id, driver_id, status, attempts
       FROM annual_incentive_payout_outbox
       WHERE status IN ('PENDING', 'PROCESSING')
         AND next_at <= NOW()
       ORDER BY priority DESC, next_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE]
    );
    items = rows.map(r => ({
      id: r.id,
      requestId: r.request_id,
      driverId: r.driver_id,
      status: r.status,
      attempts: r.attempts,
    }));

    // Mark as processing
    if (items.length > 0) {
      const ids = items.map(i => i.id);
      await client.query(
        `UPDATE annual_incentive_payout_outbox
         SET status = 'PROCESSING', locked_at = NOW(), updated_at = NOW()
         WHERE id = ANY($1)`,
        [ids]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  if (items.length === 0) return 0;

  // Process each item outside transaction
  let processed = 0;
  for (const item of items) {
    try {
      await processOneItem(deps, item);
      processed++;
    } catch (err: any) {
      console.error(`[PAYOUT_WORKER_ERROR] request=${item.requestId} error=${err.message}`);
    }
  }

  return processed;
}

async function processOneItem(deps: WorkerDeps, item: OutboxItem): Promise<void> {
  const { pool, ledgerService, provider } = deps;

  // Load request
  const request = await getRequestById(pool, item.requestId);
  if (!request) {
    await markOutboxDone(pool, item.id, 'FAILED');
    return;
  }

  // Skip terminal states
  if (TERMINAL_STATUSES.includes(request.status)) {
    await markOutboxDone(pool, item.id, 'DONE');
    return;
  }

  // Run eligibility if still RESERVED
  if (request.status === 'RESERVED') {
    const eligCtx: EligibilityContext = { pool, provider };
    const eligibility = await checkEligibility(eligCtx, request);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (eligibility.eligible) {
        await transitionRequest(client, request.id, 'ELIGIBILITY_CHECKED');
        await transitionRequest(client, request.id, 'QUEUED');
      } else if (eligibility.isDefinitive) {
        // Definitive failure: release reservation
        await releaseReservation(client, ledgerService, request);
        await transitionRequest(client, request.id, 'FAILED_RELEASED', {
          failureCode: eligibility.failureCode,
          failureMessageSafe: eligibility.failureMessageSafe,
        });
        await markOutboxDone(pool, item.id, 'FAILED');
        await client.query('COMMIT');
        return;
      } else {
        // Provider not available — block but keep reservation
        const blockStatus = eligibility.failureCode === PAYOUT_ERRORS.PROVIDER_CAPABILITY_NOT_CONFIRMED
          ? 'BLOCKED_PROVIDER_CAPABILITY' as const
          : 'BLOCKED' as const;
        await transitionRequest(client, request.id, blockStatus, {
          failureCode: eligibility.failureCode,
          failureMessageSafe: eligibility.failureMessageSafe,
        });
        await markOutboxBlocked(pool, item.id);
        await client.query('COMMIT');
        return;
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // At this point, request should be QUEUED or RETRYABLE_FAILURE
  const freshRequest = await getRequestById(pool, item.requestId);
  if (!freshRequest || !['QUEUED', 'RETRYABLE_FAILURE'].includes(freshRequest.status)) {
    await markOutboxDone(pool, item.id, 'DONE');
    return;
  }

  // Submit to provider
  await submitToProvider(deps, freshRequest, item);
}

async function submitToProvider(
  deps: WorkerDeps,
  request: AnnualIncentiveRequest,
  item: OutboxItem,
): Promise<void> {
  const { pool, ledgerService, provider } = deps;

  // Get destination CPF for provider call
  const dest = await getActiveDestination(pool, request.driverId);
  if (!dest) {
    await handleDefinitiveFailure(pool, ledgerService, request, item, PAYOUT_ERRORS.DESTINATION_NOT_FOUND);
    return;
  }

  // Decrypt the key for the provider call
  const pixKeyCpf = decryptPayoutSecret(dest.pixKeyEncrypted);
  const externalReference = `annual-incentive-request:${request.id}`;

  // Transition to SUBMITTING (inside transaction)
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await transitionRequest(client, request.id, 'SUBMITTING');

    // Create payout record
    await client.query(
      `INSERT INTO annual_incentive_payouts
       (request_id, driver_id, amount_cents, provider_name, external_reference, status)
       VALUES ($1, $2, $3, $4, $5, 'SUBMITTING')
       ON CONFLICT (external_reference) DO NOTHING`,
      [request.id, request.driverId, request.requestedAmountCents.toString(), provider.providerName, externalReference]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Call provider OUTSIDE transaction
  const result = await provider.createPayout({
    requestId: request.id,
    driverId: request.driverId,
    amountCents: request.requestedAmountCents,
    pixKeyCpf,
    externalReference,
    idempotencyKey: `payout:${request.id}`,
  });

  // Record attempt
  const attemptNum = item.attempts + 1;
  await pool.query(
    `INSERT INTO annual_incentive_payout_attempts
     (payout_id, attempt_number, status, error_code, error_safe, finished_at)
     SELECT p.id, $2, $3, $4, $5, NOW()
     FROM annual_incentive_payouts p WHERE p.request_id = $1
     LIMIT 1`,
    [
      request.id,
      attemptNum,
      result.success ? 'SUCCESS' : (result.isTimeout ? 'TIMEOUT' : 'FAILED'),
      result.errorCode ?? null,
      result.errorMessage ?? null,
    ]
  );

  // Handle result
  if (result.success) {
    // Update payout with provider ID
    const updateClient = await pool.connect();
    try {
      await updateClient.query('BEGIN');
      await updateClient.query(
        `UPDATE annual_incentive_payouts
         SET provider_payout_id = $1, status = 'SUBMITTED', provider_status = $2,
             submitted_at = NOW(), updated_at = NOW()
         WHERE request_id = $3`,
        [result.providerPayoutId, result.providerStatus, request.id]
      );
      await transitionRequest(updateClient, request.id, 'SUBMITTED');
      await updateClient.query(
        `UPDATE annual_incentive_payout_outbox SET status = 'DONE', updated_at = NOW() WHERE id = $1`,
        [item.id]
      );
      await updateClient.query('COMMIT');
    } catch (err) {
      await updateClient.query('ROLLBACK');
      throw err;
    } finally {
      updateClient.release();
    }
  } else if (result.isTimeout) {
    // Unknown state — do not retry blindly
    await pool.query(
      `UPDATE annual_incentive_payouts SET status = 'UNKNOWN_SUBMISSION', updated_at = NOW()
       WHERE request_id = $1`,
      [request.id]
    );
    await markOutboxBlocked(pool, item.id);
  } else if (result.isDefinitiveFailure) {
    await handleDefinitiveFailure(pool, ledgerService, request, item, result.errorCode ?? 'PROVIDER_DEFINITIVE_FAILURE');
  } else {
    // Temporary failure — schedule retry with backoff
    await scheduleRetry(pool, request, item, attemptNum);
  }
}

async function handleDefinitiveFailure(
  pool: Pool,
  ledgerService: AnnualIncentiveLedgerService,
  request: AnnualIncentiveRequest,
  item: OutboxItem,
  failureCode: string,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await releaseReservation(client, ledgerService, request);
    await transitionRequest(client, request.id, 'FAILED_RELEASED', {
      failureCode,
      failureMessageSafe: 'Definitive failure from provider',
    });
    await client.query(
      `UPDATE annual_incentive_payouts SET status = 'FAILED', failed_at = NOW(), updated_at = NOW()
       WHERE request_id = $1`,
      [request.id]
    );
    await client.query(
      `UPDATE annual_incentive_payout_outbox SET status = 'FAILED', updated_at = NOW() WHERE id = $1`,
      [item.id]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function scheduleRetry(
  pool: Pool,
  request: AnnualIncentiveRequest,
  item: OutboxItem,
  attemptNum: number,
): Promise<void> {
  if (attemptNum >= MAX_ATTEMPTS) {
    // Max attempts reached — block
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await transitionRequest(client, request.id, 'BLOCKED', {
        failureCode: 'MAX_ATTEMPTS_EXCEEDED',
        failureMessageSafe: `Failed after ${attemptNum} attempts`,
      });
      await client.query(
        `UPDATE annual_incentive_payout_outbox SET status = 'BLOCKED', updated_at = NOW() WHERE id = $1`,
        [item.id]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return;
  }

  // Exponential backoff: 1min, 2min, 4min, 8min (capped at 1 hour)
  const backoffMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, attemptNum - 1), MAX_BACKOFF_MS);
  const nextAt = new Date(Date.now() + backoffMs);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await transitionRequest(client, request.id, 'RETRYABLE_FAILURE');
    await client.query(
      `UPDATE annual_incentive_payout_outbox
       SET status = 'PENDING', attempts = $1, next_at = $2, locked_at = NULL, updated_at = NOW()
       WHERE id = $3`,
      [attemptNum, nextAt, item.id]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Releases reservation by creating RELEASE events in the ledger.
 */
async function releaseReservation(
  client: PoolClient,
  ledgerService: AnnualIncentiveLedgerService,
  request: AnnualIncentiveRequest,
): Promise<void> {
  const { rows: allocations } = await client.query(
    'SELECT * FROM annual_incentive_request_allocations WHERE request_id = $1',
    [request.id]
  );

  for (const alloc of allocations) {
    await ledgerService.appendEventInClient(client, {
      driverId: request.driverId,
      programYear: alloc.program_year,
      eventType: 'RELEASE',
      amountCents: BigInt(alloc.amount_cents),
      baseAmountCents: null,
      rateBasisPoints: null,
      policyVersion: 'annual_incentive_payout_v1',
      sourceType: 'REQUEST',
      sourceId: request.id,
      sourceEventId: `${request.id}:release:${alloc.program_year}`,
      requestId: request.id,
      correlationId: request.correlationId,
      reversalOfId: null,
      idempotencyKey: `request_release:${request.id}:${alloc.program_year}`,
      metadata: {},
      occurredAt: new Date(),
    });
  }
}

async function markOutboxDone(pool: Pool, outboxId: string, status: 'DONE' | 'FAILED'): Promise<void> {
  await pool.query(
    `UPDATE annual_incentive_payout_outbox SET status = $1, updated_at = NOW() WHERE id = $2`,
    [status, outboxId]
  );
}

async function markOutboxBlocked(pool: Pool, outboxId: string): Promise<void> {
  await pool.query(
    `UPDATE annual_incentive_payout_outbox SET status = 'BLOCKED', updated_at = NOW() WHERE id = $1`,
    [outboxId]
  );
}
