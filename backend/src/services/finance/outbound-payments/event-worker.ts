/**
 * Outbound Provider Event Worker.
 *
 * Processes financial_provider_events with processing_status = PENDING.
 * Runs on a scheduler with advisory lock. NOT inside the webhook request.
 *
 * Flow:
 *   1. Pick PENDING events (FOR UPDATE SKIP LOCKED)
 *   2. Mark PROCESSING
 *   3. Call processProviderEvent (which may query provider, create PAYMENT, etc.)
 *   4. Mark PROCESSED or FAILED_RETRYABLE
 */

import { Pool } from 'pg';
import { processProviderEvent, EventProcessorDeps } from './event-processor';
import { AsaasOutboundPaymentProvider, createOutboundPaymentProvider } from './providers';
import { AnnualIncentiveLedgerService } from '../annual-incentive-ledger.service';

const BATCH_SIZE = 10;
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 30_000;

export interface EventWorkerDeps {
  pool: Pool;
  ledgerService: AnnualIncentiveLedgerService;
}

/**
 * Processes a batch of pending provider events.
 */
export async function processEventBatch(deps: EventWorkerDeps): Promise<number> {
  const { pool, ledgerService } = deps;

  // Pick pending events
  const client = await pool.connect();
  let events: Array<{ id: string; provider_name: string; provider_event_id: string; event_category: string; event_type: string; payload_safe: any; processing_attempts: number }>;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, provider_name, provider_event_id, event_category, event_type, payload_safe, processing_attempts
       FROM financial_provider_events
       WHERE processing_status IN ('PENDING', 'FAILED_RETRYABLE', 'PROCESSING')
         AND next_processing_at <= NOW()
       ORDER BY created_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE]
    );
    events = rows;

    if (events.length > 0) {
      await client.query(
        `UPDATE financial_provider_events
         SET processing_status = 'PROCESSING', next_processing_at = NOW() + INTERVAL '15 minutes'
         WHERE id = ANY($1)`,
        [events.map(e => e.id)]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  if (events.length === 0) return 0;

  let processed = 0;
  for (const event of events) {
    try {
      const provider = event.provider_name === 'asaas'
        ? new AsaasOutboundPaymentProvider()
        : createOutboundPaymentProvider();
      const normalized = provider.normalizeWebhook(event.payload_safe);
      // Override with stored values (more reliable than re-normalizing)
      normalized.providerEventId = event.provider_event_id;
      normalized.eventCategory = event.event_category as any;
      normalized.eventType = event.event_type as any;

      const processorDeps: EventProcessorDeps = { pool, ledgerService };
      const outcome = await processProviderEvent(processorDeps, normalized, event.provider_name);
      if (!outcome.processed) {
        throw new Error('PAYOUT_NOT_MATCHED_YET');
      }

      // Unknown event types (e.g. blocked/refunded) are retained without
      // ever treating them as a successful payment.
      await pool.query(
        `UPDATE financial_provider_events
         SET processing_status = $2, processed = true, processed_at = NOW(),
             processing_attempts = processing_attempts + 1
         WHERE id = $1`,
        [event.id, normalized.eventType === 'UNKNOWN' ? 'IGNORED_UNKNOWN_EVENT' : 'PROCESSED']
      );
      processed++;
    } catch (err: any) {
      const attempts = event.processing_attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await pool.query(
          `UPDATE financial_provider_events
           SET processing_status = 'FAILED_REVIEW_REQUIRED', processing_error_safe = $1,
               processing_attempts = $2
           WHERE id = $3`,
          ['PROCESSING_FAILED', attempts, event.id]
        );
      } else {
        const backoff = BASE_BACKOFF_MS * Math.pow(2, attempts - 1);
        const nextAt = new Date(Date.now() + backoff);
        await pool.query(
          `UPDATE financial_provider_events
           SET processing_status = 'FAILED_RETRYABLE', processing_error_safe = $1,
               processing_attempts = $2, next_processing_at = $3
           WHERE id = $4`,
          ['PROCESSING_FAILED', attempts, nextAt, event.id]
        );
      }
    }
  }

  return processed;
}
