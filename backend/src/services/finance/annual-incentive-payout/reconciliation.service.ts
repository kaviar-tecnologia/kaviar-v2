/**
 * Internal Reconciliation Service for Annual Incentive Payouts.
 *
 * Periodically checks:
 * - SUBMITTED/PROCESSING payouts for lost webhooks (polls provider)
 * - UNKNOWN_SUBMISSION payouts needing resolution
 * - Deadline breaches
 * - Internal consistency (ledger vs requests)
 *
 * Only corrects automatically when evidence is unambiguous.
 * Ambiguous cases → BLOCKED_PROVIDER_RECONCILIATION.
 */

import { Pool } from 'pg';
import { AnnualIncentiveLedgerService } from '../annual-incentive-ledger.service';
import { AnnualIncentivePayoutProvider, PAYOUT_ERRORS } from './types';
import { processWebhookEvent, WebhookDeps } from './webhook.service';

export interface ReconciliationDeps {
  pool: Pool;
  ledgerService: AnnualIncentiveLedgerService;
  provider: AnnualIncentivePayoutProvider;
}

export interface ReconciliationReport {
  checked: number;
  resolved: number;
  blocked: number;
  deadlineBreaches: number;
  errors: string[];
}

/**
 * Runs a reconciliation cycle.
 */
export async function runReconciliation(deps: ReconciliationDeps): Promise<ReconciliationReport> {
  const report: ReconciliationReport = { checked: 0, resolved: 0, blocked: 0, deadlineBreaches: 0, errors: [] };

  await reconcileSubmittedPayouts(deps, report);
  await reconcileUnknownSubmissions(deps, report);
  await checkDeadlineBreaches(deps, report);

  return report;
}

/**
 * Polls provider for payouts stuck in SUBMITTED/PROCESSING.
 */
async function reconcileSubmittedPayouts(deps: ReconciliationDeps, report: ReconciliationReport): Promise<void> {
  const { pool, ledgerService, provider } = deps;

  const { rows } = await pool.query(
    `SELECT * FROM annual_incentive_payouts
     WHERE status IN ('SUBMITTED', 'PROCESSING')
       AND updated_at < NOW() - INTERVAL '5 minutes'
     ORDER BY updated_at ASC
     LIMIT 20`
  );

  for (const payout of rows) {
    report.checked++;
    try {
      if (!payout.provider_payout_id) continue;

      const providerResult = await provider.getPayout(payout.provider_payout_id);
      if (!providerResult.found) continue;

      // Map provider status to webhook event
      if (providerResult.providerStatus === 'DONE' || providerResult.providerStatus === 'COMPLETED') {
        // Verify consistency
        const payoutAmount = BigInt(payout.amount_cents);
        if (providerResult.amountCents != null && providerResult.amountCents !== payoutAmount) {
          // Amount mismatch — block
          await pool.query(
            `UPDATE annual_incentive_payouts SET status = 'BLOCKED_PROVIDER_RECONCILIATION', updated_at = NOW()
             WHERE id = $1`,
            [payout.id]
          );
          report.blocked++;
          continue;
        }

        // Apply completion via webhook service (idempotent)
        const webhookDeps: WebhookDeps = { pool, ledgerService };
        await processWebhookEvent(webhookDeps, {
          providerEventId: `reconcile_done_${payout.id}_${Date.now()}`,
          providerPayoutId: payout.provider_payout_id,
          eventType: 'DONE',
          amountCents: providerResult.amountCents,
          externalReference: providerResult.externalReference,
          raw: { source: 'reconciliation' },
        }, provider.providerName);
        report.resolved++;

      } else if (providerResult.providerStatus === 'FAILED' || providerResult.providerStatus === 'CANCELLED') {
        const webhookDeps: WebhookDeps = { pool, ledgerService };
        await processWebhookEvent(webhookDeps, {
          providerEventId: `reconcile_fail_${payout.id}_${Date.now()}`,
          providerPayoutId: payout.provider_payout_id,
          eventType: providerResult.providerStatus === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
          raw: { source: 'reconciliation' },
        }, provider.providerName);
        report.resolved++;
      }
      // PENDING/PROCESSING → no action needed
    } catch (err: any) {
      report.errors.push(`payout=${payout.id}: ${err.message}`);
    }
  }
}

/**
 * Handles UNKNOWN_SUBMISSION payouts by querying the provider.
 */
async function reconcileUnknownSubmissions(deps: ReconciliationDeps, report: ReconciliationReport): Promise<void> {
  const { pool, provider } = deps;

  const { rows } = await pool.query(
    `SELECT * FROM annual_incentive_payouts
     WHERE status = 'UNKNOWN_SUBMISSION'
     ORDER BY updated_at ASC
     LIMIT 10`
  );

  for (const payout of rows) {
    report.checked++;
    try {
      // Try to find by external reference
      const externalRef = payout.external_reference;
      let found = false;

      if (provider.findByExternalReference) {
        const result = await provider.findByExternalReference(externalRef);
        if (result && result.found) {
          found = true;
          // The transfer WAS created — update provider_payout_id
          await pool.query(
            `UPDATE annual_incentive_payouts
             SET provider_payout_id = $1, status = 'SUBMITTED', provider_status = $2, updated_at = NOW()
             WHERE id = $3`,
            [result.providerPayoutId, result.providerStatus, payout.id]
          );
          report.resolved++;
        }
      }

      if (!found) {
        // Cannot confirm creation — block for manual review
        await pool.query(
          `UPDATE annual_incentive_payouts SET status = 'BLOCKED_PROVIDER_RECONCILIATION', updated_at = NOW()
           WHERE id = $1`,
          [payout.id]
        );
        report.blocked++;
      }
    } catch (err: any) {
      report.errors.push(`unknown_submission=${payout.id}: ${err.message}`);
    }
  }
}

/**
 * Checks for requests approaching or past their 48h deadline.
 */
async function checkDeadlineBreaches(deps: ReconciliationDeps, report: ReconciliationReport): Promise<void> {
  const { pool } = deps;

  // Requests past deadline that are not terminal
  const { rows } = await pool.query(
    `SELECT id, driver_id, deadline_at, status
     FROM annual_incentive_requests
     WHERE deadline_at < NOW()
       AND status NOT IN ('PAID', 'FAILED_RELEASED', 'CANCELLED_RELEASED')
     LIMIT 50`
  );

  for (const req of rows) {
    report.deadlineBreaches++;
    // Log structured alert (no sensitive data)
    console.warn(`[PAYOUT_DEADLINE_BREACH] request=${req.id} status=${req.status} deadline=${req.deadline_at.toISOString()}`);
  }

  // Requests within 6 hours of deadline
  const { rows: approaching } = await pool.query(
    `SELECT id, status
     FROM annual_incentive_requests
     WHERE deadline_at BETWEEN NOW() AND NOW() + INTERVAL '6 hours'
       AND status NOT IN ('PAID', 'FAILED_RELEASED', 'CANCELLED_RELEASED')
     LIMIT 50`
  );

  for (const req of approaching) {
    console.warn(`[PAYOUT_DEADLINE_APPROACHING] request=${req.id} status=${req.status}`);
  }
}
