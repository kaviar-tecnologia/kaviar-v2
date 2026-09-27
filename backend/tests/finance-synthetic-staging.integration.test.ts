/**
 * PR #405 — genuine disposable PostgreSQL checks; NO production DB and
 * NO mock provider payments or fabricated financial_transactions.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/lib/prisma';
import {
  assertSyntheticStagingDatabase, stageSyntheticStatement,
} from './support/finance/synthetic-statement-staging';

const DATABASE_URL = process.env.DATABASE_URL || '';
const uid = randomUUID().slice(0, 8);
const entityA = randomUUID(), entityB = randomUUID();
const sumupAccount = randomUUID(), asaasAccount = randomUUID();
const sameEntityOtherAccount = randomUUID(), otherEntityAccount = randomUUID();
const accountIds = [sumupAccount, asaasAccount, sameEntityOtherAccount, otherEntityAccount];
const ledgerIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID(), randomUUID()];
const cnpj = () => (BigInt('0x' + randomUUID().replace(/-/g, '').slice(0, 12))
  % 10_000_000_000_000n).toString().padStart(14, '0');
const context = { provider: 'SUMUP' as const, accountId: sumupAccount, legalEntityId: entityA };
const accountContext = { ...context, accountId: sameEntityOtherAccount };
const entityContext = { ...context, accountId: otherEntityAccount, legalEntityId: entityB };
const asaasContext = { provider: 'ASAAS' as const, accountId: asaasAccount, legalEntityId: entityA };
const fixture = (name: string) => readFileSync(
  resolve(process.cwd(), 'tests/fixtures/finance', name), 'utf8',
);
const sumup = fixture('synthetic-sumup-2026-09.csv');
const asaas = fixture('synthetic-asaas-2026-09.csv');
const zero = fixture('synthetic-empty-month.csv');
const header = 'event_id,occurred_on,event_type,direction,amount_cents,currency,external_reference';
const newRow = 'new_event_001,2026-09-26,CREDIT,IN,4567,BRL,sim:new:001';
let pool: Pool;
let ready = false;

beforeAll(async () => {
  assertSyntheticStagingDatabase(DATABASE_URL);
  // No migration or production Prisma schema: create test-only staging tables.
  pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  await pool.query(fixture('synthetic-staging.sql'));

  await prisma.legal_entities.createMany({ data: [
    { id: entityA, razao_social: 'Synthetic Test A', cnpj: cnpj(), entity_type: 'MATRIZ' },
    { id: entityB, razao_social: 'Synthetic Test B', cnpj: cnpj(), entity_type: 'FILIAL' },
  ] });
  await prisma.financial_accounts.createMany({ data: accountIds.map((id, index) => ({
    id, code: 'SYNT-' + uid + '-' + index, name: 'Synthetic-only ' + index,
    type: 'BANK' as const, legal_entity_id: index === 3 ? entityB : entityA,
    currency: 'BRL', is_active: true,
  })) });

  const rows = [
    ['SUMUP', sumupAccount, entityA, 'sim:su:credit:001', 'IN', 10000],
    ['SUMUP', sumupAccount, entityA, 'sim:su:fee:001', 'OUT', 300],
    ['SUMUP', sumupAccount, entityA, 'sim:su:credit:002', 'IN', 6000],
    ['ASAAS', asaasAccount, entityA, 'sim:as:payout:001', 'OUT', 7000],
    ['ASAAS', asaasAccount, entityA, 'sim:as:fee:001', 'OUT', 150],
  ] as const;
  await prisma.financial_transactions.createMany({
    data: rows.map(([provider, account_id, legal_entity_id, external_reference,
      direction, cents], index) => ({
      id: ledgerIds[index], account_id, legal_entity_id, provider,
      external_reference, source_type: 'MANUAL' as const,
      origin_type: 'MANUAL' as const,
      transaction_type: 'ADJUSTMENT' as const, status: 'POSTED' as const,
      direction, competence_date: new Date('2026-09-26T00:00:00.000Z'),
      transaction_date: new Date('2026-09-26T00:00:00.000Z'),
      gross_amount_cents: BigInt(cents), net_amount_cents: BigInt(cents),
      description: 'SYNTHETIC TEST FIXTURE — NEVER PRODUCTION',
    })),
  });
  ready = true;
});

afterAll(async () => {
  if (!pool) return;
  // Scoped cleanup; entries first because they retain batch IDs.
  await pool.query(
    'DELETE FROM synthetic_finance_import_entries WHERE account_id = ANY($1::text[])',
    [accountIds],
  );
  await pool.query(
    'DELETE FROM synthetic_finance_import_batches WHERE account_id = ANY($1::text[])',
    [accountIds],
  );
  await prisma.financial_transactions.deleteMany({ where: { id: { in: ledgerIds } } });
  await prisma.financial_accounts.deleteMany({ where: { id: { in: accountIds } } });
  await prisma.legal_entities.deleteMany({ where: { id: { in: [entityA, entityB] } } });
  await pool.end();
  await prisma.$disconnect();
});

describe('PR #405: synthetic-only persistence and immutable audit', () => {
  it('saves the batch, one row per event, and a separate audit record', async () => {
    const before = await prisma.financial_transactions.findMany({
      where: { id: { in: ledgerIds } },
      select: { id: true, status: true, net_amount_cents: true, updated_at: true },
      orderBy: { id: 'asc' },
    });
    const r = await stageSyntheticStatement(DATABASE_URL, context, sumup);
    expect(r.mode).toBe('SYNTHETIC_TEST_ONLY');
    expect(r.summary).toEqual({
      total: 4, staged: 4, duplicate: 0, conflict: 0, rejected: 0,
      emptyMonth: false,
    });
    expect(r.rows.map((x) => x.status)).toEqual([
      'CANDIDATE_FOR_REVIEW', 'CANDIDATE_FOR_REVIEW',
      'UNMATCHED', 'AMOUNT_MISMATCH',
    ]);
    const entries = await pool.query(
      'SELECT external_id, preview_status, fingerprint FROM synthetic_finance_import_entries ' +
      'WHERE first_batch_id=$1 ORDER BY external_id', [r.batchId],
    );
    const audits = await pool.query(
      'SELECT outcome, line_number FROM synthetic_finance_import_audit ' +
      'WHERE batch_id=$1 ORDER BY line_number', [r.batchId],
    );
    expect(entries.rows).toHaveLength(4);
    expect(entries.rows.every((x) => /^[a-f0-9]{64}$/.test(x.fingerprint))).toBe(true);
    expect(audits.rows).toHaveLength(4);
    expect(audits.rows.every((x) => x.outcome === 'STAGED')).toBe(true);
    const after = await prisma.financial_transactions.findMany({
      where: { id: { in: ledgerIds } },
      select: { id: true, status: true, net_amount_cents: true, updated_at: true },
      orderBy: { id: 'asc' },
    });
    expect(after).toEqual(before); // staging does not alter the real ledger.
  });

  it('records re-import attempts but never inserts a second entry', async () => {
    const r = await stageSyntheticStatement(DATABASE_URL, context, sumup);
    expect(r.summary).toMatchObject({ staged: 0, duplicate: 4, conflict: 0 });
    const audit = await pool.query(
      'SELECT outcome FROM synthetic_finance_import_audit WHERE batch_id=$1',
      [r.batchId],
    );
    expect(audit.rows).toHaveLength(4);
    expect(audit.rows.every((x) => x.outcome === 'DUPLICATE_PREVIOUS_IMPORT'))
      .toBe(true);
    const entryCount = await pool.query(
      'SELECT count(*)::int AS n FROM synthetic_finance_import_entries ' +
      'WHERE provider=$1 AND legal_entity_id=$2 AND account_id=$3',
      ['SUMUP', entityA, sumupAccount],
    );
    expect(entryCount.rows[0].n).toBe(4);
  });

  it('rejects a changed payload for a previously staged event without overwriting it', async () => {
    const modified = sumup.replace(
      'su_credit_001,2026-09-26,CREDIT,IN,10000',
      'su_credit_001,2026-09-26,CREDIT,IN,10001',
    );
    const r = await stageSyntheticStatement(DATABASE_URL, context, modified);
    expect(r.summary).toMatchObject({ staged: 0, conflict: 1, duplicate: 3 });
    expect(r.rows[0].outcome).toBe('CONFLICTING_PREVIOUS_IMPORT');
    expect(r.rows[0].candidateTransactionId).toBeNull();
    const original = await pool.query(
      'SELECT amount_cents FROM synthetic_finance_import_entries ' +
      "WHERE account_id=$1 AND external_id='su_credit_001'", [sumupAccount],
    );
    expect(BigInt(original.rows[0].amount_cents)).toBe(10000n);
  });

  it('stages an Asaas scenario independently and never claims a payout was paid', async () => {
    const r = await stageSyntheticStatement(DATABASE_URL, asaasContext, asaas);
    expect(r.summary).toMatchObject({ total: 3, staged: 3, conflict: 0 });
    expect(r.rows.map((x) => x.status)).toEqual([
      'CANDIDATE_FOR_REVIEW', 'CANDIDATE_FOR_REVIEW', 'UNMATCHED',
    ]);
    const ledger = await prisma.financial_transactions.findMany({
      where: { id: { in: ledgerIds.slice(3) } }, select: { id: true, status: true },
    });
    expect(ledger.every((x) => x.status === 'POSTED')).toBe(true);
  });

  it('separates idempotency between accounts, CNPJs and providers', async () => {
    const alt = await stageSyntheticStatement(DATABASE_URL, accountContext, sumup);
    const other = await stageSyntheticStatement(DATABASE_URL, entityContext, sumup);
    const provider = await stageSyntheticStatement(DATABASE_URL,
      { ...context, provider: 'ASAAS' }, sumup);
    for (const r of [alt, other, provider]) {
      expect(r.summary).toMatchObject({ total: 4, staged: 4, duplicate: 0 });
    }
    expect(alt.rows[0].status).toBe('UNMATCHED');
    expect(other.rows[0].status).toBe('UNMATCHED');
    expect(provider.rows[0].status).toBe('UNMATCHED');
  });

  it('records a zero-movement month as empty, without inventing an entry', async () => {
    const r = await stageSyntheticStatement(DATABASE_URL, asaasContext, zero);
    expect(r.summary).toEqual({
      total: 0, staged: 0, duplicate: 0, conflict: 0,
      rejected: 0, emptyMonth: true,
    });
    const entries = await pool.query(
      'SELECT count(*)::int AS n FROM synthetic_finance_import_entries ' +
      'WHERE first_batch_id=$1', [r.batchId],
    );
    expect(entries.rows[0].n).toBe(0);
  });

  it('audits in-file duplicate IDs without staging either copy', async () => {
    const bad = [header,
      'double_001,2026-09-26,CREDIT,IN,2500,BRL,sim:double:001',
      'double_001,2026-09-26,CREDIT,IN,2500,BRL,sim:double:001',
    ].join('\n');
    const r = await stageSyntheticStatement(DATABASE_URL, context, bad);
    expect(r.summary).toMatchObject({ staged: 0, rejected: 2 });
    const audit = await pool.query(
      'SELECT outcome FROM synthetic_finance_import_audit WHERE batch_id=$1',
      [r.batchId],
    );
    expect(audit.rows.map((x) => x.outcome))
      .toEqual(['DUPLICATE_SOURCE_ID', 'DUPLICATE_SOURCE_ID']);
  });

  it('rolls back both staging row and audit if a failure occurs inside a transaction', async () => {
    const csv = [header, newRow].join('\n');
    const before = await pool.query(
      'SELECT count(*)::int AS n FROM synthetic_finance_import_batches ' +
      'WHERE account_id=$1', [sumupAccount],
    );
    await expect(stageSyntheticStatement(DATABASE_URL, context, csv, {
      failAfterAuditLine: 2,
    })).rejects.toThrow('SYNTHETIC_INJECTED_FAILURE');
    const after = await pool.query(
      'SELECT count(*)::int AS n FROM synthetic_finance_import_batches ' +
      'WHERE account_id=$1', [sumupAccount],
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
    const entry = await pool.query(
      "SELECT id FROM synthetic_finance_import_entries WHERE external_id='new_event_001'",
    );
    expect(entry.rows).toHaveLength(0);
    const ok = await stageSyntheticStatement(DATABASE_URL, context, csv);
    expect(ok.summary).toMatchObject({ staged: 1, duplicate: 0 });
  });

  it('blocks wrong CNPJ/account combination without inserting an import batch', async () => {
    const before = await pool.query(
      'SELECT count(*)::int AS n FROM synthetic_finance_import_batches',
    );
    await expect(stageSyntheticStatement(DATABASE_URL,
      { ...context, accountId: otherEntityAccount }, sumup))
      .rejects.toThrow('SYNTHETIC_ACCOUNT_SCOPE_NOT_VERIFIED');
    const after = await pool.query(
      'SELECT count(*)::int AS n FROM synthetic_finance_import_batches',
    );
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  it('deduplicates concurrent imports through the unique database constraint', async () => {
    const csv = [header,
      'parallel_001,2026-09-26,CREDIT,IN,8000,BRL,sim:parallel:001',
    ].join('\n');
    const [a, b] = await Promise.all([
      stageSyntheticStatement(DATABASE_URL, context, csv),
      stageSyntheticStatement(DATABASE_URL, context, csv),
    ]);
    expect([a.summary.staged, b.summary.staged].sort()).toEqual([0, 1]);
    expect([a.summary.duplicate, b.summary.duplicate].sort()).toEqual([0, 1]);
    const count = await pool.query(
      "SELECT count(*)::int AS n FROM synthetic_finance_import_entries " +
      "WHERE account_id=$1 AND external_id='parallel_001'", [sumupAccount],
    );
    expect(count.rows[0].n).toBe(1);
  });

  it('refuses production or nonlocal DB before any request or fake financial mutation', async () => {
    const localNoTest = DATABASE_URL.replace('/kaviar_e2e_test', '/kaviar_prod');
    expect(() => assertSyntheticStagingDatabase(localNoTest)).toThrow();
    expect(() => assertSyntheticStagingDatabase(
      'postgresql://x:y@company-prod.rds.amazonaws.com:5432/kaviar_test',
    )).toThrow();
    vi.stubEnv('NODE_ENV', 'production');
    try {
      await expect(stageSyntheticStatement(DATABASE_URL, context, sumup))
        .rejects.toThrow('SYNTHETIC_STAGING_TEST_ONLY');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
