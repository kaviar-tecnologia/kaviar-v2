/**
 * Offline demonstration only; reads static synthetic fixtures, no DB or provider.
 * Command (in backend): NODE_ENV=test npx tsx scripts/finance/synthetic-statement-demo.ts
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildSyntheticImportPreview } from '../../src/services/finance/synthetic-statement-import.service';
import type { LedgerCandidate } from '../../src/services/finance/reconciliation-preview.service';

if (process.env.NODE_ENV !== 'test') {
  throw new Error('SYNTHETIC_IMPORT_TEST_ONLY');
}

const source = (filename: string) => readFileSync(
  resolve(process.cwd(), 'tests/fixtures/finance', filename), 'utf8',
);
const candidate = (
  id: string, reference: string, direction: 'IN' | 'OUT', cents: number,
): LedgerCandidate => ({
  id, external_reference: reference, direction,
  net_amount_cents: BigInt(cents), status: 'POSTED',
});
const legalEntityId = 'synthetic-entity-a';
const sumupContext = { provider: 'SUMUP' as const, accountId: 'synthetic-su', legalEntityId };
const asaasContext = { provider: 'ASAAS' as const, accountId: 'synthetic-as', legalEntityId };
const sumup = source('synthetic-sumup-2026-09.csv');
const sumupLedger = [
  candidate('synthetic-su-credit', 'sim:su:credit:001', 'IN', 10000),
  candidate('synthetic-su-fee', 'sim:su:fee:001', 'OUT', 300),
  candidate('synthetic-su-wrong', 'sim:su:credit:002', 'IN', 6000),
];
const asaasLedger = [
  candidate('synthetic-as-payout', 'sim:as:payout:001', 'OUT', 7000),
  candidate('synthetic-as-fee', 'sim:as:fee:001', 'OUT', 150),
];
const first = buildSyntheticImportPreview(sumupContext, sumup, sumupLedger);
const repeat = buildSyntheticImportPreview(sumupContext, sumup, sumupLedger, first.receipts);
const outbound = buildSyntheticImportPreview(
  asaasContext, source('synthetic-asaas-2026-09.csv'), asaasLedger,
);
const empty = buildSyntheticImportPreview(
  sumupContext, source('synthetic-empty-month.csv'), [],
);

for (const [name, report] of [
  ['SUMUP_SYNTHETIC', first], ['SUMUP_SECOND_IMPORT', repeat],
  ['ASAAS_SYNTHETIC', outbound], ['ZERO_MOVEMENT_MONTH', empty],
] as const) {
  // No raw CSV, production data, beneficiary/CPF, bank details or provider keys.
  console.log(JSON.stringify({
    scenario: name, mode: report.mode,
    summary: report.summary,
    classifications: report.rows.map((r) => ({
      eventId: r.eventId, eventType: r.eventType,
      direction: r.direction, status: r.status,
    })),
  }, null, 2));
}
