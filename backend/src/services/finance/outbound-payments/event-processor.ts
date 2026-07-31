/**
 * Financial Provider Event Processor.
 *
 * Processes events from financial_provider_events:
 * - TRANSFER_DONE → marks obligation PAID, creates domain-specific PAYMENT
 * - TRANSFER_FAILED → marks obligation FAILED
 * - BILL_DONE → marks obligation PAID
 * - Deduplication: repeated events are no-op
 */

import { Pool } from 'pg';
import { NormalizedProviderEvent, OUTBOUND_PAYMENT_ERRORS } from './types';
import { AnnualIncentiveLedgerService } from '../annual-incentive-ledger.service';

export interface EventProcessorDeps {
  pool: Pool;
  ledgerService?: AnnualIncentiveLedgerService;
}

/**
 * Persists and processes a normalized provider event.
 */
export async function processProviderEvent(
  deps: EventProcessorDeps,
  event: NormalizedProviderEvent,
  providerName: string,
): Promise<{ processed: boolean; duplicate: boolean }> {
  const { pool } = deps;

  // Deduplicate
  const { rows: existing } = await pool.query(
    `SELECT id, processed FROM financial_provider_events WHERE provider_name = $1 AND provider_event_id = $2`,
    [providerName, event.providerEventId]
  );
  if (existing.length > 0) return { processed: existing[0].processed, duplicate: true };

  // Persist
  await pool.query(
    `INSERT INTO financial_provider_events (provider_name, provider_event_id, event_category, event_type, payload_safe)
     VALUES ($1, $2, $3, $4, $5) ON CONFLICT (provider_name, provider_event_id) DO NOTHING`,
    [providerName, event.providerEventId, event.eventCategory, event.eventType, JSON.stringify(sanitize(event.raw))]
  );

  // Find payout
  const { rows: payoutRows } = await pool.query(
    `SELECT p.*, o.purpose, o.source_type, o.source_id, o.status as obl_status
     FROM financial_payouts p JOIN financial_obligations o ON o.id = p.obligation_id
     WHERE p.provider_payout_id = $1`,
    [event.providerPayoutId]
  );

  if (payoutRows.length === 0) {
    // Try by external reference
    if (event.externalReference) {
      const { rows: byRef } = await pool.query(
        `SELECT p.*, o.purpose, o.source_type, o.source_id, o.status as obl_status
         FROM financial_payouts p JOIN financial_obligations o ON o.id = p.obligation_id
         WHERE p.external_reference = $1`,
        [event.externalReference]
      );
      if (byRef.length > 0) return await processMatchedEvent(deps, event, byRef[0], providerName);
    }
    return { processed: false, duplicate: false };
  }

  return await processMatchedEvent(deps, event, payoutRows[0], providerName);
}

async function processMatchedEvent(
  deps: EventProcessorDeps,
  event: NormalizedProviderEvent,
  payout: any,
  providerName: string,
): Promise<{ processed: boolean; duplicate: boolean }> {
  const { pool, ledgerService } = deps;

  // Update event with payout_id
  await pool.query(
    `UPDATE financial_provider_events SET payout_id = $1 WHERE provider_name = $2 AND provider_event_id = $3`,
    [payout.id, providerName, event.providerEventId]
  );

  switch (event.eventType) {
    case 'DONE':
      await handleDone(deps, payout, event);
      break;
    case 'FAILED':
    case 'CANCELLED':
      await handleFailed(deps, payout, event);
      break;
    case 'PROCESSING':
    case 'PENDING':
      await handleProcessing(pool, payout);
      break;
  }

  await pool.query(
    `UPDATE financial_provider_events SET processed = true, processed_at = NOW() WHERE provider_name = $1 AND provider_event_id = $2`,
    [providerName, event.providerEventId]
  );

  return { processed: true, duplicate: false };
}

async function handleDone(deps: EventProcessorDeps, payout: any, event: NormalizedProviderEvent): Promise<void> {
  const { pool, ledgerService } = deps;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: [locked] } = await client.query(
      'SELECT * FROM financial_payouts WHERE id = $1 FOR UPDATE', [payout.id]
    );
    const { rows: [lockedObl] } = await client.query(
      'SELECT * FROM financial_obligations WHERE id = $1 FOR UPDATE', [payout.obligation_id]
    );

    // Already paid — idempotent
    if (lockedObl.status === 'PAID') { await client.query('COMMIT'); return; }
    if (['FAILED', 'CANCELLED'].includes(lockedObl.status)) {
      await client.query('COMMIT');
      throw Object.assign(new Error('DONE after terminal state'), { code: OUTBOUND_PAYMENT_ERRORS.PAYOUT_STATE_CONFLICT });
    }

    // Validate amount if provided
    if (event.amountCents != null && event.amountCents !== BigInt(locked.amount_cents)) {
      await client.query('COMMIT');
      throw Object.assign(new Error('Amount mismatch'), { code: OUTBOUND_PAYMENT_ERRORS.AMOUNT_MISMATCH });
    }

    // Mark payout DONE
    await client.query(
      `UPDATE financial_payouts SET status = 'DONE', confirmed_at = NOW(), provider_status = 'DONE', updated_at = NOW() WHERE id = $1`,
      [payout.id]
    );

    // Mark obligation PAID
    await client.query(
      `UPDATE financial_obligations SET status = 'PAID', updated_at = NOW() WHERE id = $1`,
      [payout.obligation_id]
    );

    // Domain-specific: create PAYMENT in annual incentive ledger
    if (payout.purpose === 'DRIVER_ANNUAL_INCENTIVE' && payout.source_type === 'ANNUAL_INCENTIVE_REQUEST' && ledgerService) {
      await createAnnualIncentivePayment(client, ledgerService, payout);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function createAnnualIncentivePayment(
  client: any,
  ledgerService: AnnualIncentiveLedgerService,
  payout: any,
): Promise<void> {
  const requestId = payout.source_id;
  if (!requestId) return;

  // Get allocations
  const { rows: allocations } = await client.query(
    'SELECT * FROM annual_incentive_request_allocations WHERE request_id = $1', [requestId]
  );

  const { rows: [request] } = await client.query(
    'SELECT * FROM annual_incentive_requests WHERE id = $1 FOR UPDATE', [requestId]
  );
  if (!request || request.status === 'PAID') return;

  for (const alloc of allocations) {
    await ledgerService.appendEventInClient(client, {
      driverId: request.driver_id,
      programYear: alloc.program_year,
      eventType: 'PAYMENT',
      amountCents: BigInt(alloc.amount_cents),
      baseAmountCents: null,
      rateBasisPoints: null,
      policyVersion: 'outbound_payment_v1',
      sourceType: 'PAYMENT',
      sourceId: payout.id,
      sourceEventId: `${payout.id}:payment:${alloc.program_year}`,
      requestId,
      correlationId: request.correlation_id,
      reversalOfId: null,
      idempotencyKey: `outbound_payment:${payout.id}:${alloc.program_year}`,
      metadata: { providerPayoutId: payout.provider_payout_id, externalReference: payout.external_reference },
      occurredAt: new Date(),
    });
  }

  // Mark annual incentive request as PAID
  await client.query(
    `UPDATE annual_incentive_requests SET status = 'PAID', paid_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [requestId]
  );
}

async function handleFailed(deps: EventProcessorDeps, payout: any, event: NormalizedProviderEvent): Promise<void> {
  const { pool, ledgerService } = deps;

  // CRITICAL: Before releasing, confirm the actual current status with the provider.
  // A webhook FAILED/CANCELLED could be out-of-order (e.g., arrives after DONE was already processed).
  // If provider confirms DONE, we must apply payment instead of release.
  // If provider is unreachable or status is ambiguous, hold reservation.

  // Import provider dynamically to avoid circular deps
  const { createOutboundPaymentProvider } = await import('./providers');
  const provider = createOutboundPaymentProvider();

  if (payout.provider_payout_id) {
    try {
      const currentStatus = payout.instrument === 'ASAAS_BILL_PAYMENT'
        ? await provider.getBillPayment(payout.provider_payout_id)
        : await provider.getTransfer(payout.provider_payout_id);

      if (currentStatus.found) {
        const provStatus = (currentStatus.providerStatus ?? '').toUpperCase();
        if (provStatus === 'DONE' || provStatus === 'CONFIRMED') {
          // Provider says DONE — apply payment, NOT release
          await handleDone(deps, payout, {
            ...event,
            eventType: 'DONE',
            amountCents: currentStatus.amountCents,
          });
          return;
        }
        if (!['FAILED', 'CANCELLED', 'ERROR'].includes(provStatus)) {
          // Ambiguous status (PENDING, IN_BANK_PROCESSING, etc.) — do NOT release
          await pool.query(
            `UPDATE financial_payouts SET status = 'BLOCKED_PROVIDER_RECONCILIATION', updated_at = NOW() WHERE id = $1`,
            [payout.id]
          );
          await pool.query(
            `UPDATE financial_obligations SET status = 'BLOCKED', failure_code = 'RECONCILIATION_REQUIRED', updated_at = NOW() WHERE id = $1`,
            [payout.obligation_id]
          );
          return;
        }
      }
    } catch {
      // Provider unreachable — cannot confirm, hold reservation
      await pool.query(
        `UPDATE financial_payouts SET status = 'BLOCKED_PROVIDER_RECONCILIATION', updated_at = NOW() WHERE id = $1`,
        [payout.id]
      );
      await pool.query(
        `UPDATE financial_obligations SET status = 'BLOCKED', failure_code = 'RECONCILIATION_REQUIRED', updated_at = NOW() WHERE id = $1`,
        [payout.obligation_id]
      );
      return;
    }
  }

  // Provider confirmed FAILED/CANCELLED — safe to release
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [lockedObl] } = await client.query(
      'SELECT * FROM financial_obligations WHERE id = $1 FOR UPDATE', [payout.obligation_id]
    );
    if (['PAID', 'FAILED', 'CANCELLED'].includes(lockedObl.status)) { await client.query('COMMIT'); return; }

    const status = event.eventType === 'CANCELLED' ? 'CANCELLED' : 'FAILED';
    await client.query(`UPDATE financial_payouts SET status = $1, failed_at = NOW(), updated_at = NOW() WHERE id = $2`, [status, payout.id]);
    await client.query(`UPDATE financial_obligations SET status = $1, failure_code = 'PROVIDER_${event.eventType}', updated_at = NOW() WHERE id = $2`, [status, payout.obligation_id]);

    // For annual incentive: release reservation
    if (payout.purpose === 'DRIVER_ANNUAL_INCENTIVE' && payout.source_type === 'ANNUAL_INCENTIVE_REQUEST' && ledgerService) {
      const requestId = payout.source_id;
      const { rows: [request] } = await client.query('SELECT * FROM annual_incentive_requests WHERE id = $1 FOR UPDATE', [requestId]);
      if (request && !['PAID', 'FAILED_RELEASED', 'CANCELLED_RELEASED'].includes(request.status)) {
        const { rows: allocations } = await client.query('SELECT * FROM annual_incentive_request_allocations WHERE request_id = $1', [requestId]);
        for (const alloc of allocations) {
          await ledgerService.appendEventInClient(client, {
            driverId: request.driver_id, programYear: alloc.program_year, eventType: 'RELEASE',
            amountCents: BigInt(alloc.amount_cents), baseAmountCents: null, rateBasisPoints: null,
            policyVersion: 'outbound_payment_v1', sourceType: 'REQUEST', sourceId: requestId,
            sourceEventId: `${payout.id}:release:${alloc.program_year}`, requestId,
            correlationId: request.correlation_id, reversalOfId: null,
            idempotencyKey: `outbound_release:${payout.id}:${alloc.program_year}`,
            metadata: { reason: event.eventType }, occurredAt: new Date(),
          });
        }
        const reqStatus = event.eventType === 'CANCELLED' ? 'CANCELLED_RELEASED' : 'FAILED_RELEASED';
        await client.query(`UPDATE annual_incentive_requests SET status = $1, released_at = NOW(), updated_at = NOW() WHERE id = $2`, [reqStatus, requestId]);
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function handleProcessing(pool: Pool, payout: any): Promise<void> {
  await pool.query(`UPDATE financial_payouts SET status = 'PROCESSING', provider_status = 'PROCESSING', updated_at = NOW() WHERE id = $1`, [payout.id]);
  await pool.query(`UPDATE financial_obligations SET status = 'PROCESSING', updated_at = NOW() WHERE id = $1`, [payout.obligation_id]);
}

function sanitize(raw: Record<string, unknown>): Record<string, unknown> {
  const s = { ...raw };
  delete s.pixKey; delete s.pix_key; delete s.cpf; delete s.cnpj; delete s.document;
  delete s.apiKey; delete s.token; delete s.secret; delete s.access_token;
  return s;
}
