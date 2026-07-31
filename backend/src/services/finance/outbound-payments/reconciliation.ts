/**
 * Outbound Payment Reconciliation Service.
 *
 * Checks SUBMITTED/PROCESSING payouts against provider.
 * Handles UNKNOWN_SUBMISSION, lost webhooks, deadline breaches.
 */

import { Pool } from 'pg';
import { OutboundPaymentProvider } from './types';
import { processProviderEvent, EventProcessorDeps } from './event-processor';

export interface ReconciliationDeps {
  pool: Pool;
  provider: OutboundPaymentProvider;
  eventProcessorDeps: EventProcessorDeps;
}

export interface OutboundReconciliationReport {
  checked: number;
  resolved: number;
  blocked: number;
  deadlineBreaches: number;
  errors: string[];
}

export async function runOutboundReconciliation(deps: ReconciliationDeps): Promise<OutboundReconciliationReport> {
  const report: OutboundReconciliationReport = { checked: 0, resolved: 0, blocked: 0, deadlineBreaches: 0, errors: [] };

  await reconcileSubmitted(deps, report);
  await reconcileUnknown(deps, report);
  await checkDeadlines(deps, report);

  return report;
}

async function reconcileSubmitted(deps: ReconciliationDeps, report: OutboundReconciliationReport): Promise<void> {
  const { pool, provider, eventProcessorDeps } = deps;

  const { rows } = await pool.query(
    `SELECT * FROM financial_payouts WHERE status IN ('SUBMITTED', 'PROCESSING') AND updated_at < NOW() - INTERVAL '5 minutes' ORDER BY updated_at ASC LIMIT 20`
  );

  for (const payout of rows) {
    report.checked++;
    try {
      if (!payout.provider_payout_id) continue;

      const result = payout.instrument === 'ASAAS_BILL_PAYMENT'
        ? await provider.getBillPayment(payout.provider_payout_id)
        : await provider.getTransfer(payout.provider_payout_id);

      if (!result.found) continue;

      const providerStatus = result.providerStatus?.toUpperCase() ?? '';
      if (['DONE', 'CONFIRMED'].includes(providerStatus)) {
        await processProviderEvent(eventProcessorDeps, {
          providerEventId: `reconcile_done_${payout.id}_${Date.now()}`,
          providerPayoutId: payout.provider_payout_id,
          eventCategory: payout.instrument === 'ASAAS_BILL_PAYMENT' ? 'BILL_PAYMENT' : 'TRANSFER',
          eventType: 'DONE',
          amountCents: result.amountCents,
          externalReference: result.externalReference,
          raw: { source: 'reconciliation' },
        }, provider.providerName);
        report.resolved++;
      } else if (['FAILED', 'CANCELLED', 'ERROR'].includes(providerStatus)) {
        await processProviderEvent(eventProcessorDeps, {
          providerEventId: `reconcile_fail_${payout.id}_${Date.now()}`,
          providerPayoutId: payout.provider_payout_id,
          eventCategory: payout.instrument === 'ASAAS_BILL_PAYMENT' ? 'BILL_PAYMENT' : 'TRANSFER',
          eventType: providerStatus === 'CANCELLED' ? 'CANCELLED' : 'FAILED',
          raw: { source: 'reconciliation' },
        }, provider.providerName);
        report.resolved++;
      }
    } catch (err: any) {
      report.errors.push(`payout=${payout.id}: ${err.message}`);
    }
  }
}

async function reconcileUnknown(deps: ReconciliationDeps, report: OutboundReconciliationReport): Promise<void> {
  const { pool, provider } = deps;

  const { rows } = await pool.query(
    `SELECT * FROM financial_payouts WHERE status = 'UNKNOWN_SUBMISSION' ORDER BY updated_at ASC LIMIT 10`
  );

  for (const payout of rows) {
    report.checked++;
    try {
      let found = false;
      if (provider.findTransferByExternalReference) {
        const result = await provider.findTransferByExternalReference(payout.external_reference);
        if (result?.found) {
          found = true;
          await pool.query(
            `UPDATE financial_payouts SET provider_payout_id = $1, status = 'SUBMITTED', provider_status = $2, updated_at = NOW() WHERE id = $3`,
            [result.providerTransferId, result.providerStatus, payout.id]
          );
          report.resolved++;
        }
      }
      if (!found) {
        await pool.query(`UPDATE financial_payouts SET status = 'BLOCKED_PROVIDER_RECONCILIATION', updated_at = NOW() WHERE id = $1`, [payout.id]);
        report.blocked++;
      }
    } catch (err: any) {
      report.errors.push(`unknown=${payout.id}: ${err.message}`);
    }
  }
}

async function checkDeadlines(deps: ReconciliationDeps, report: OutboundReconciliationReport): Promise<void> {
  const { pool } = deps;
  const { rows } = await pool.query(
    `SELECT id, status FROM financial_obligations WHERE deadline_at IS NOT NULL AND deadline_at < NOW() AND status NOT IN ('PAID', 'FAILED', 'CANCELLED') LIMIT 50`
  );
  report.deadlineBreaches = rows.length;
  for (const r of rows) {
    console.warn(`[OUTBOUND_DEADLINE_BREACH] obligation=${r.id} status=${r.status}`);
  }
}
