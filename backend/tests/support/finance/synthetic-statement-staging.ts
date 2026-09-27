/**
 * PR #405: test-only PostgreSQL staging. This module is outside backend/src,
 * has no HTTP route, and cannot run in production or against remote databases.
 * No ledger writes, payout, wallet credit, provider call or real-money effects.
 */
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { assertSafeFinanceDatabase } from '../../../src/lib/assert-safe-finance-db';
import {
  buildSyntheticImportPreview, parseSyntheticStatement,
  type SyntheticContext, type SyntheticImportReceipt, type SyntheticResultStatus,
} from '../../../src/services/finance/synthetic-statement-import.service';
import { StatementPreviewError, type LedgerCandidate } from '../../../src/services/finance/reconciliation-preview.service';

type StagedOutcome = SyntheticResultStatus | 'STAGED';
type CandidateRow = {
  id: string; external_reference: string | null;
  direction: 'IN' | 'OUT'; net_amount_cents: string | bigint; status: string;
};

function assertLocalTestDatabase(databaseUrl: string): void {
  if (process.env.NODE_ENV !== 'test') {
    throw new StatementPreviewError('SYNTHETIC_STAGING_TEST_ONLY');
  }
  assertSafeFinanceDatabase({ databaseUrl, nodeEnv: process.env.NODE_ENV });
  let url: URL;
  try { url = new URL(databaseUrl); }
  catch { throw new StatementPreviewError('SYNTHETIC_STAGING_UNSAFE_DB'); }
  if (!['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !/test/i.test(url.pathname)) {
    throw new StatementPreviewError('SYNTHETIC_STAGING_LOCAL_TEST_DB_REQUIRED');
  }
}

export function assertSyntheticStagingDatabase(databaseUrl: string): void {
  assertLocalTestDatabase(databaseUrl);
}

async function ledgerCandidates(
  client: PoolClient, context: SyntheticContext, refs: string[],
): Promise<LedgerCandidate[]> {
  if (!refs.length) return [];
  const result = await client.query<CandidateRow>(
    'SELECT id, external_reference, direction, net_amount_cents, status ' +
    'FROM financial_transactions WHERE account_id = $1 AND legal_entity_id = $2 ' +
    'AND UPPER(provider) = $3 AND external_reference = ANY($4::text[]) ' +
    "AND status IN ('POSTED', 'RECONCILED', 'CLOSED')",
    [context.accountId, context.legalEntityId, context.provider, refs],
  );
  return result.rows.map((row) => ({
    id: row.id, external_reference: row.external_reference,
    direction: row.direction, net_amount_cents: BigInt(row.net_amount_cents),
    status: row.status,
  }));
}

async function previousReceipts(
  client: PoolClient, context: SyntheticContext, ids: string[],
): Promise<SyntheticImportReceipt[]> {
  if (!ids.length) return [];
  const result = await client.query<{ external_id: string; fingerprint: string }>(
    'SELECT external_id, fingerprint FROM synthetic_finance_import_entries ' +
    'WHERE provider = $1 AND legal_entity_id = $2 AND account_id = $3 ' +
    'AND external_id = ANY($4::text[])',
    [context.provider, context.legalEntityId, context.accountId, ids],
  );
  return result.rows.map((row) => ({
    ...context, eventId: row.external_id, fingerprint: row.fingerprint,
  }));
}

export async function stageSyntheticStatement(
  databaseUrl: string, context: SyntheticContext, csv: string,
  options: { failAfterAuditLine?: number } = {},
) {
  // Fail before a connection or any database work.
  assertLocalTestDatabase(databaseUrl);
  if (!['SUMUP', 'ASAAS'].includes(context.provider) ||
      !/^[0-9a-f-]{36}$/i.test(context.accountId) ||
      !/^[0-9a-f-]{36}$/i.test(context.legalEntityId)) {
    throw new StatementPreviewError('SYNTHETIC_SCOPE_INVALID');
  }
  const parsed = parseSyntheticStatement(csv);
  const refs = [...new Set(parsed.map((row) => row.externalReference).filter(
    (ref): ref is string => !!ref,
  ))];
  const ids = [...new Set(parsed.map((row) => row.externalId))];
  const pool = new Pool({ connectionString: databaseUrl, max: 1, connectionTimeoutMillis: 5000 });
  let client: PoolClient | null = null;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const scope = await client.query(
      'SELECT a.id FROM financial_accounts a ' +
      'JOIN legal_entities e ON e.id = a.legal_entity_id ' +
      'WHERE a.id = $1 AND a.legal_entity_id = $2 AND a.is_active = true ' +
      "AND e.is_active = true AND a.currency = 'BRL' " +
      "AND a.type IN ('BANK','PIX_WALLET','CLEARING') FOR SHARE OF a, e",
      [context.accountId, context.legalEntityId],
    );
    if (scope.rowCount !== 1) {
      throw new StatementPreviewError('SYNTHETIC_ACCOUNT_SCOPE_NOT_VERIFIED');
    }
    const ledger = await ledgerCandidates(client, context, refs);
    const priorReceipts = await previousReceipts(client, context, ids);
    const preview = buildSyntheticImportPreview(context, csv, ledger, priorReceipts);
    const batchId = randomUUID();
    await client.query(
      'INSERT INTO synthetic_finance_import_batches ' +
      '(id, provider, legal_entity_id, account_id, source_sha256, row_count, ' +
      'staged_count, duplicate_count, conflict_count, rejected_count) ' +
      'VALUES ($1,$2,$3,$4,$5,$6,0,0,0,0)',
      [batchId, context.provider, context.legalEntityId, context.accountId,
        preview.sourceSha256, preview.rows.length],
    );

    let staged = 0, duplicate = 0, conflict = 0, rejected = 0;
    const results: Array<typeof preview.rows[number] & { outcome: StagedOutcome }> = [];
    for (const [index, row] of preview.rows.entries()) {
      const fingerprint = preview.receipts[index].fingerprint;
      let outcome: StagedOutcome = row.status;
      if (row.status === 'DUPLICATE_SOURCE_ID' ||
          row.status === 'DUPLICATE_REFERENCE') {
        rejected++;
      } else if (row.status === 'DUPLICATE_PREVIOUS_IMPORT') {
        duplicate++;
      } else if (row.status === 'CONFLICTING_PREVIOUS_IMPORT') {
        conflict++;
      } else {
        // Unique identity is enforced by PostgreSQL even for concurrent callers.
        const inserted = await client.query(
          'INSERT INTO synthetic_finance_import_entries ' +
          '(id, first_batch_id, provider, legal_entity_id, account_id, ' +
          'external_id, fingerprint, event_type, occurred_on, direction, ' +
          'amount_cents, external_reference, preview_status) ' +
          'VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::date,$10,$11::bigint,$12,$13) ' +
          'ON CONFLICT (provider, legal_entity_id, account_id, external_id) ' +
          'DO NOTHING RETURNING id',
          [randomUUID(), batchId, context.provider, context.legalEntityId,
            context.accountId, row.eventId, fingerprint, row.eventType,
            row.occurredOn, row.direction, row.amountCents,
            row.externalReference, row.status],
        );
        if (inserted.rowCount === 1) {
          outcome = 'STAGED';
          staged++;
        } else {
          // Never overwrite existing payload. Read only the fingerprint.
          const existing = await client.query<{ fingerprint: string }>(
            'SELECT fingerprint FROM synthetic_finance_import_entries ' +
            'WHERE provider = $1 AND legal_entity_id = $2 ' +
            'AND account_id = $3 AND external_id = $4',
            [context.provider, context.legalEntityId, context.accountId, row.eventId],
          );
          if (existing.rowCount !== 1) {
            throw new StatementPreviewError('SYNTHETIC_CONCURRENT_RETRY');
          }
          outcome = existing.rows[0].fingerprint === fingerprint
            ? 'DUPLICATE_PREVIOUS_IMPORT' : 'CONFLICTING_PREVIOUS_IMPORT';
          if (outcome === 'DUPLICATE_PREVIOUS_IMPORT') duplicate++;
          else conflict++;
        }
      }
      await client.query(
        'INSERT INTO synthetic_finance_import_audit ' +
        '(batch_id, line_number, external_id, fingerprint, outcome) ' +
        'VALUES ($1,$2,$3,$4,$5)',
        [batchId, index + 2, row.eventId, fingerprint, outcome],
      );
      // Test-only fault injection: exercise atomic rollback after a staged row
      // and its audit event, without mutating any financial ledger.
      if (options.failAfterAuditLine === index + 2) {
        throw new StatementPreviewError('SYNTHETIC_INJECTED_FAILURE');
      }
      results.push({
        ...row,
        // Only a newly staged candidate can retain a preview suggestion.
        candidateTransactionId: outcome === 'STAGED'
          ? row.candidateTransactionId : null,
        outcome,
      });
    }
    await client.query(
      'UPDATE synthetic_finance_import_batches SET staged_count = $2, ' +
      'duplicate_count = $3, conflict_count = $4, rejected_count = $5 WHERE id = $1',
      [batchId, staged, duplicate, conflict, rejected],
    );
    await client.query('COMMIT');
    return {
      mode: 'SYNTHETIC_TEST_ONLY' as const, batchId,
      sourceSha256: preview.sourceSha256, context, rows: results,
      summary: {
        total: results.length, staged, duplicate, conflict, rejected,
        emptyMonth: results.length === 0,
      },
    };
  } catch (error) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch { /* retain initial failure */ }
    }
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
}
