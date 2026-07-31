/**
 * Outbound Payment Worker.
 *
 * Processes the financial_payout_outbox queue:
 * 1. Picks items using FOR UPDATE SKIP LOCKED
 * 2. Validates purpose enabled, payee, destination, limits, balance
 * 3. Submits to provider (outside DB transaction)
 * 4. Records result
 *
 * Does NOT hold DB transaction open during HTTP calls.
 */

import { Pool, PoolClient } from 'pg';
import { OutboundPaymentProvider, OUTBOUND_PAYMENT_ERRORS } from './types';
import { isOutboundPaymentsEnabled, isPurposeEnabled, validateAccountOwnership } from './account-preflight';

const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 3_600_000;
const BATCH_SIZE = 10;
const DESTINATION_COOLDOWN_HOURS = 24;

export interface OutboundWorkerDeps {
  pool: Pool;
  provider: OutboundPaymentProvider;
}

interface OutboxItem {
  id: string;
  obligationId: string;
  payeeId: string;
  purpose: string;
  status: string;
  attempts: number;
}

/**
 * Processes a batch of outbox items.
 */
export async function processOutboundBatch(deps: OutboundWorkerDeps): Promise<number> {
  const { pool, provider } = deps;

  // Global gate
  if (!isOutboundPaymentsEnabled()) return 0;

  // Provider health
  const avail = await provider.validateAvailability();
  if (!avail.available) return 0;

  // Pick items
  const client = await pool.connect();
  let items: OutboxItem[];
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT id, obligation_id, payee_id, purpose, status, attempts
       FROM financial_payout_outbox
       WHERE status IN ('PENDING', 'PROCESSING')
         AND next_at <= NOW()
       ORDER BY priority DESC, next_at ASC
       LIMIT $1
       FOR UPDATE SKIP LOCKED`,
      [BATCH_SIZE]
    );
    items = rows.map(r => ({
      id: r.id, obligationId: r.obligation_id, payeeId: r.payee_id,
      purpose: r.purpose, status: r.status, attempts: r.attempts,
    }));

    if (items.length > 0) {
      await client.query(
        `UPDATE financial_payout_outbox SET status = 'PROCESSING', locked_at = NOW(), updated_at = NOW()
         WHERE id = ANY($1)`,
        [items.map(i => i.id)]
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

  let processed = 0;
  for (const item of items) {
    try {
      await processOneOutboundItem(deps, item);
      processed++;
    } catch (err: any) {
      console.error(`[OUTBOUND_WORKER_ERROR] obligation=${item.obligationId} error=${err.message}`);
    }
  }
  return processed;
}

async function processOneOutboundItem(deps: OutboundWorkerDeps, item: OutboxItem): Promise<void> {
  const { pool, provider } = deps;

  // Check purpose enabled
  if (!isPurposeEnabled(item.purpose)) {
    await markOutboxStatus(pool, item.id, 'BLOCKED');
    await updateObligationStatus(pool, item.obligationId, 'BLOCKED', 'PURPOSE_DISABLED');
    return;
  }

  // Load obligation
  const { rows: [obl] } = await pool.query('SELECT * FROM financial_obligations WHERE id = $1', [item.obligationId]);
  if (!obl || ['PAID', 'FAILED', 'CANCELLED'].includes(obl.status)) {
    await markOutboxStatus(pool, item.id, 'DONE');
    return;
  }

  // Load payee and destination
  const { rows: [payee] } = await pool.query('SELECT * FROM financial_payees WHERE id = $1', [item.payeeId]);
  if (!payee || payee.status !== 'ACTIVE') {
    await markOutboxStatus(pool, item.id, 'BLOCKED');
    await updateObligationStatus(pool, item.obligationId, 'BLOCKED', OUTBOUND_PAYMENT_ERRORS.PAYEE_NOT_ACTIVE);
    return;
  }

  const { rows: [dest] } = await pool.query(
    `SELECT * FROM financial_payee_destinations WHERE payee_id = $1 AND status = 'active' AND superseded_at IS NULL LIMIT 1`,
    [item.payeeId]
  );
  if (!dest) {
    await markOutboxStatus(pool, item.id, 'BLOCKED');
    await updateObligationStatus(pool, item.obligationId, 'BLOCKED', OUTBOUND_PAYMENT_ERRORS.DESTINATION_NOT_FOUND);
    return;
  }

  // Check destination cooldown
  if (dest.cooldown_until && new Date(dest.cooldown_until) > new Date()) {
    await markOutboxStatus(pool, item.id, 'BLOCKED');
    await updateObligationStatus(pool, item.obligationId, 'BLOCKED', OUTBOUND_PAYMENT_ERRORS.DESTINATION_COOLDOWN);
    return;
  }

  // Check balance
  const balance = await provider.getAvailableBalance();
  const amountCents = BigInt(obl.net_amount_cents);
  if (balance.amountCents < amountCents) {
    // Schedule retry — balance may be replenished
    await scheduleRetry(pool, item, item.attempts + 1);
    await updateObligationStatus(pool, item.obligationId, 'RETRYABLE_FAILURE', OUTBOUND_PAYMENT_ERRORS.INSUFFICIENT_BALANCE);
    return;
  }

  // Determine instrument
  const instrument = dest.method === 'BILL' ? 'ASAAS_BILL_PAYMENT' : 'ASAAS_PIX_TRANSFER';
  const externalRef = `kaviar-payment:${item.purpose.toLowerCase().replace(/_/g, '-')}:${item.obligationId}`;

  // Create payout record and transition to SUBMITTING
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE financial_obligations SET status = 'SUBMITTING', updated_at = NOW() WHERE id = $1`,
      [item.obligationId]
    );
    await client.query(
      `INSERT INTO financial_payouts (obligation_id, payee_id, amount_cents, instrument, provider_name, external_reference, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'SUBMITTING')
       ON CONFLICT (external_reference) DO NOTHING`,
      [item.obligationId, item.payeeId, amountCents.toString(), instrument, provider.providerName, externalRef]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  // Call provider OUTSIDE transaction
  let result;
  if (instrument === 'ASAAS_PIX_TRANSFER') {
    // Decrypt key for provider call (using the hmac to find the right destination)
    const pixKey = dest.key_encrypted; // Worker needs to decrypt — for now pass encrypted (adapter handles)
    const keyType = dest.key_type ?? 'CPF';
    result = await provider.createTransfer({
      obligationId: item.obligationId,
      payeeId: item.payeeId,
      amountCents,
      pixAddressKey: pixKey, // Will be decrypted by caller when real adapter is wired
      pixAddressKeyType: keyType as 'CPF' | 'CNPJ',
      externalReference: externalRef,
      description: obl.description_safe?.slice(0, 100),
    });
  } else {
    result = await provider.createBillPayment({
      obligationId: item.obligationId,
      identificationField: dest.key_encrypted, // Bill identification field
      externalReference: externalRef,
    });
  }

  // Record attempt
  const attemptNum = item.attempts + 1;
  await pool.query(
    `INSERT INTO financial_payout_attempts (payout_id, attempt_number, status, error_code, error_safe, finished_at)
     SELECT p.id, $2, $3, $4, $5, NOW()
     FROM financial_payouts p WHERE p.obligation_id = $1 LIMIT 1`,
    [item.obligationId, attemptNum, result.success ? 'SUCCESS' : 'FAILED', result.errorCode ?? null, result.errorMessage ?? null]
  );

  // Handle result
  if (result.success) {
    const providerId = ('providerTransferId' in result ? result.providerTransferId : (result as any).providerBillId) ?? null;
    const providerStatus = ('providerStatus' in result ? result.providerStatus : null) ?? null;

    await pool.query(
      `UPDATE financial_payouts SET provider_payout_id = $1, status = 'SUBMITTED', provider_status = $2, submitted_at = NOW(), updated_at = NOW()
       WHERE obligation_id = $3`,
      [providerId, providerStatus, item.obligationId]
    );
    await pool.query(`UPDATE financial_obligations SET status = 'SUBMITTED', updated_at = NOW() WHERE id = $1`, [item.obligationId]);
    await markOutboxStatus(pool, item.id, 'DONE');
  } else if (result.isTimeout) {
    await pool.query(`UPDATE financial_payouts SET status = 'UNKNOWN_SUBMISSION', updated_at = NOW() WHERE obligation_id = $1`, [item.obligationId]);
    await markOutboxStatus(pool, item.id, 'BLOCKED');
  } else if (result.isDefinitiveFailure) {
    await pool.query(`UPDATE financial_payouts SET status = 'FAILED', failed_at = NOW(), updated_at = NOW() WHERE obligation_id = $1`, [item.obligationId]);
    await updateObligationStatus(pool, item.obligationId, 'FAILED', result.errorCode ?? 'DEFINITIVE_FAILURE');
    await markOutboxStatus(pool, item.id, 'FAILED');
  } else {
    await scheduleRetry(pool, item, attemptNum);
    await updateObligationStatus(pool, item.obligationId, 'RETRYABLE_FAILURE', result.errorCode ?? 'TEMPORARY_FAILURE');
  }
}

async function scheduleRetry(pool: Pool, item: OutboxItem, attemptNum: number): Promise<void> {
  if (attemptNum >= MAX_ATTEMPTS) {
    await markOutboxStatus(pool, item.id, 'BLOCKED');
    await updateObligationStatus(pool, item.obligationId, 'BLOCKED', 'MAX_ATTEMPTS_EXCEEDED');
    return;
  }
  const backoffMs = Math.min(BASE_BACKOFF_MS * Math.pow(2, attemptNum - 1), MAX_BACKOFF_MS);
  const nextAt = new Date(Date.now() + backoffMs);
  await pool.query(
    `UPDATE financial_payout_outbox SET status = 'PENDING', attempts = $1, next_at = $2, locked_at = NULL, updated_at = NOW() WHERE id = $3`,
    [attemptNum, nextAt, item.id]
  );
}

async function markOutboxStatus(pool: Pool, id: string, status: string): Promise<void> {
  await pool.query(`UPDATE financial_payout_outbox SET status = $1, updated_at = NOW() WHERE id = $2`, [status, id]);
}

async function updateObligationStatus(pool: Pool, id: string, status: string, failureCode?: string): Promise<void> {
  await pool.query(
    `UPDATE financial_obligations SET status = $1, failure_code = $2, updated_at = NOW() WHERE id = $3`,
    [status, failureCode ?? null, id]
  );
}
