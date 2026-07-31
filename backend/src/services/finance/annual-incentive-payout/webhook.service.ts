/**
 * Webhook & Completion Service for Annual Incentive Payouts.
 *
 * Handles:
 * - Webhook event deduplication
 * - Provider DONE → internal PAID + PAYMENT events
 * - Provider FAILED → RELEASE + FAILED_RELEASED
 * - Idempotent processing (repeated webhook = no-op)
 */

import { Pool, PoolClient } from 'pg';
import { AnnualIncentiveLedgerService } from '../annual-incentive-ledger.service';
import { transitionRequest, getRequestById, getRequestAllocations } from './request.service';
import {
  NormalizedAnnualIncentivePayoutEvent,
  AnnualIncentiveRequest,
  PAYOUT_ERRORS,
  TERMINAL_STATUSES,
} from './types';

export interface WebhookDeps {
  pool: Pool;
  ledgerService: AnnualIncentiveLedgerService;
}

/**
 * Processes a normalized webhook event.
 * Idempotent: repeated events are stored but not re-processed.
 */
export async function processWebhookEvent(
  deps: WebhookDeps,
  event: NormalizedAnnualIncentivePayoutEvent,
  providerName: string,
): Promise<{ processed: boolean; duplicate: boolean }> {
  const { pool, ledgerService } = deps;

  // 1. Deduplicate by provider_event_id
  const { rows: existing } = await pool.query(
    `SELECT id, processed FROM annual_incentive_webhook_events
     WHERE provider_name = $1 AND provider_event_id = $2`,
    [providerName, event.providerEventId]
  );

  if (existing.length > 0) {
    return { processed: existing[0].processed, duplicate: true };
  }

  // 2. Store event
  await pool.query(
    `INSERT INTO annual_incentive_webhook_events
     (provider_name, provider_event_id, event_type, payout_id, payload_safe)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (provider_name, provider_event_id) DO NOTHING`,
    [
      providerName,
      event.providerEventId,
      event.eventType,
      null, // will update after finding payout
      JSON.stringify(sanitizePayload(event.raw)),
    ]
  );

  // 3. Find payout by provider_payout_id
  const { rows: payoutRows } = await pool.query(
    `SELECT p.*, r.id as request_id, r.status as request_status, r.driver_id
     FROM annual_incentive_payouts p
     JOIN annual_incentive_requests r ON r.id = p.request_id
     WHERE p.provider_payout_id = $1`,
    [event.providerPayoutId]
  );

  if (payoutRows.length === 0) {
    // Payout not found — store event for later reconciliation
    return { processed: false, duplicate: false };
  }

  const payout = payoutRows[0];
  const requestId = payout.request_id;

  // Update webhook event with payout reference
  await pool.query(
    `UPDATE annual_incentive_webhook_events SET payout_id = $1
     WHERE provider_name = $2 AND provider_event_id = $3`,
    [payout.id, providerName, event.providerEventId]
  );

  // 4. Process based on event type
  switch (event.eventType) {
    case 'DONE':
      await handlePayoutDone(deps, payout, event);
      break;
    case 'FAILED':
    case 'CANCELLED':
      await handlePayoutFailed(deps, payout, event);
      break;
    case 'PROCESSING':
    case 'PENDING':
      await handlePayoutProcessing(deps, payout);
      break;
    default:
      // Unknown event type — store but don't act
      break;
  }

  // Mark as processed
  await pool.query(
    `UPDATE annual_incentive_webhook_events SET processed = true, processed_at = NOW()
     WHERE provider_name = $1 AND provider_event_id = $2`,
    [providerName, event.providerEventId]
  );

  return { processed: true, duplicate: false };
}

/**
 * Handles provider DONE: creates PAYMENT events and marks as PAID.
 * Atomic: all or nothing within one transaction.
 */
async function handlePayoutDone(
  deps: WebhookDeps,
  payout: any,
  event: NormalizedAnnualIncentivePayoutEvent,
): Promise<void> {
  const { pool, ledgerService } = deps;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Lock payout and request
    const { rows: [lockedPayout] } = await client.query(
      'SELECT * FROM annual_incentive_payouts WHERE id = $1 FOR UPDATE',
      [payout.id]
    );
    const { rows: [lockedRequest] } = await client.query(
      'SELECT * FROM annual_incentive_requests WHERE id = $1 FOR UPDATE',
      [payout.request_id]
    );

    // Already paid — idempotent
    if (lockedRequest.status === 'PAID') {
      await client.query('COMMIT');
      return;
    }

    // CRITICAL: If already released, this is a state conflict
    if (['FAILED_RELEASED', 'CANCELLED_RELEASED'].includes(lockedRequest.status)) {
      await client.query('COMMIT');
      throw Object.assign(
        new Error(`DONE received but request already ${lockedRequest.status}`),
        { code: PAYOUT_ERRORS.PAYOUT_STATE_CONFLICT }
      );
    }

    // Validate amount if provided
    if (event.amountCents != null) {
      const payoutAmount = BigInt(lockedPayout.amount_cents);
      if (event.amountCents !== payoutAmount) {
        await client.query('COMMIT');
        throw Object.assign(
          new Error('Amount mismatch between provider and internal record'),
          { code: PAYOUT_ERRORS.AMOUNT_MISMATCH }
        );
      }
    }

    // Get allocations
    const { rows: allocations } = await client.query(
      'SELECT * FROM annual_incentive_request_allocations WHERE request_id = $1',
      [payout.request_id]
    );

    // Create PAYMENT events per allocation
    for (const alloc of allocations) {
      await ledgerService.appendEventInClient(client, {
        driverId: lockedRequest.driver_id,
        programYear: alloc.program_year,
        eventType: 'PAYMENT',
        amountCents: BigInt(alloc.amount_cents),
        baseAmountCents: null,
        rateBasisPoints: null,
        policyVersion: 'annual_incentive_payout_v1',
        sourceType: 'PAYMENT',
        sourceId: payout.id,
        sourceEventId: `${payout.id}:payment:${alloc.program_year}`,
        requestId: payout.request_id,
        correlationId: lockedRequest.correlation_id,
        reversalOfId: null,
        idempotencyKey: `payout_payment:${payout.id}:${alloc.program_year}`,
        metadata: {
          providerPayoutId: lockedPayout.provider_payout_id,
          externalReference: lockedPayout.external_reference,
        },
        occurredAt: new Date(),
      });
    }

    // Update payout
    await client.query(
      `UPDATE annual_incentive_payouts
       SET status = 'DONE', confirmed_at = NOW(), provider_status = 'DONE', updated_at = NOW()
       WHERE id = $1`,
      [payout.id]
    );

    // Transition request to PAID
    await transitionRequest(client, payout.request_id, 'PAID');

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Handles provider FAILED/CANCELLED: releases reservation.
 */
async function handlePayoutFailed(
  deps: WebhookDeps,
  payout: any,
  event: NormalizedAnnualIncentivePayoutEvent,
): Promise<void> {
  const { pool, ledgerService } = deps;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [lockedRequest] } = await client.query(
      'SELECT * FROM annual_incentive_requests WHERE id = $1 FOR UPDATE',
      [payout.request_id]
    );

    // Already terminal — idempotent
    if (TERMINAL_STATUSES.includes(lockedRequest.status)) {
      await client.query('COMMIT');
      return;
    }

    // Release reservation
    const { rows: allocations } = await client.query(
      'SELECT * FROM annual_incentive_request_allocations WHERE request_id = $1',
      [payout.request_id]
    );

    for (const alloc of allocations) {
      await ledgerService.appendEventInClient(client, {
        driverId: lockedRequest.driver_id,
        programYear: alloc.program_year,
        eventType: 'RELEASE',
        amountCents: BigInt(alloc.amount_cents),
        baseAmountCents: null,
        rateBasisPoints: null,
        policyVersion: 'annual_incentive_payout_v1',
        sourceType: 'REQUEST',
        sourceId: payout.request_id,
        sourceEventId: `${payout.request_id}:release_webhook:${alloc.program_year}`,
        requestId: payout.request_id,
        correlationId: lockedRequest.correlation_id,
        reversalOfId: null,
        idempotencyKey: `payout_release:${payout.id}:${alloc.program_year}`,
        metadata: { reason: event.eventType },
        occurredAt: new Date(),
      });
    }

    // Update payout
    const payoutStatus = event.eventType === 'CANCELLED' ? 'CANCELLED' : 'FAILED';
    await client.query(
      `UPDATE annual_incentive_payouts
       SET status = $1, failed_at = NOW(), provider_status = $2, updated_at = NOW()
       WHERE id = $3`,
      [payoutStatus, event.eventType, payout.id]
    );

    // Transition request
    const reqStatus = event.eventType === 'CANCELLED' ? 'CANCELLED_RELEASED' : 'FAILED_RELEASED';
    await transitionRequest(client, payout.request_id, reqStatus as any, {
      failureCode: `PROVIDER_${event.eventType}`,
      failureMessageSafe: `Provider reported ${event.eventType.toLowerCase()}`,
    });

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Handles PROCESSING/PENDING status updates.
 */
async function handlePayoutProcessing(deps: WebhookDeps, payout: any): Promise<void> {
  const { pool } = deps;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [lockedRequest] } = await client.query(
      'SELECT * FROM annual_incentive_requests WHERE id = $1 FOR UPDATE',
      [payout.request_id]
    );

    if (TERMINAL_STATUSES.includes(lockedRequest.status)) {
      await client.query('COMMIT');
      return;
    }

    // Update payout status
    await client.query(
      `UPDATE annual_incentive_payouts SET status = 'PROCESSING', provider_status = 'PROCESSING', updated_at = NOW()
       WHERE id = $1`,
      [payout.id]
    );

    // Transition request if possible
    if (['SUBMITTED', 'SUBMITTING'].includes(lockedRequest.status)) {
      await transitionRequest(client, payout.request_id, 'PROCESSING');
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Sanitizes webhook payload: removes sensitive fields.
 */
function sanitizePayload(raw: Record<string, unknown>): Record<string, unknown> {
  const sanitized = { ...raw };
  // Remove any potential sensitive data
  delete sanitized.pixKey;
  delete sanitized.pix_key;
  delete sanitized.cpf;
  delete sanitized.document;
  delete sanitized.apiKey;
  delete sanitized.token;
  delete sanitized.secret;
  return sanitized;
}
