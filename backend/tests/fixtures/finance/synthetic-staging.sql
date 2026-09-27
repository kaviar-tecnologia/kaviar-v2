-- PR #405: TEST DATABASE ONLY. Do not add this SQL to prisma/migrations.
-- These tables are deliberately absent from the production Prisma schema.
-- No synthetic row is a financial_transactions entry, payment or wallet credit.

CREATE TABLE IF NOT EXISTS synthetic_finance_import_batches (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('SUMUP','ASAAS')),
  legal_entity_id TEXT NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
  account_id TEXT NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  source_sha256 TEXT NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  row_count INTEGER NOT NULL CHECK (row_count BETWEEN 0 AND 100),
  staged_count INTEGER NOT NULL CHECK (staged_count BETWEEN 0 AND 100),
  duplicate_count INTEGER NOT NULL CHECK (duplicate_count BETWEEN 0 AND 100),
  conflict_count INTEGER NOT NULL CHECK (conflict_count BETWEEN 0 AND 100),
  rejected_count INTEGER NOT NULL CHECK (rejected_count BETWEEN 0 AND 100),
  mode TEXT NOT NULL DEFAULT 'SYNTHETIC_TEST_ONLY'
    CHECK (mode = 'SYNTHETIC_TEST_ONLY'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS synthetic_finance_batches_scope_idx
  ON synthetic_finance_import_batches(provider, legal_entity_id, account_id, created_at DESC);

CREATE TABLE IF NOT EXISTS synthetic_finance_import_entries (
  id TEXT PRIMARY KEY,
  first_batch_id TEXT NOT NULL REFERENCES synthetic_finance_import_batches(id)
    ON DELETE RESTRICT,
  provider TEXT NOT NULL CHECK (provider IN ('SUMUP','ASAAS')),
  legal_entity_id TEXT NOT NULL REFERENCES legal_entities(id) ON DELETE RESTRICT,
  account_id TEXT NOT NULL REFERENCES financial_accounts(id) ON DELETE RESTRICT,
  external_id TEXT NOT NULL CHECK (external_id ~ '^[A-Za-z0-9_-]{3,100}$'),
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  event_type TEXT NOT NULL CHECK (event_type IN ('CREDIT','PAYOUT','FEE','REFUND','REVERSAL')),
  occurred_on DATE NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('IN','OUT')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents > 0),
  external_reference TEXT CHECK (
    external_reference IS NULL OR external_reference ~ '^[A-Za-z0-9:_-]{1,120}$'
  ),
  preview_status TEXT NOT NULL CHECK (preview_status IN (
    'MISSING_REFERENCE','UNMATCHED','AMBIGUOUS_LEDGER_REFERENCE',
    'AMOUNT_MISMATCH','DIRECTION_MISMATCH','ALREADY_RECONCILED',
    'CANDIDATE_FOR_REVIEW'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT synthetic_finance_event_identity UNIQUE (
    provider, legal_entity_id, account_id, external_id
  ),
  CHECK (event_type <> 'CREDIT' OR direction = 'IN'),
  CHECK (event_type NOT IN ('PAYOUT','FEE') OR direction = 'OUT')
);
CREATE INDEX IF NOT EXISTS synthetic_finance_entries_scope_idx
  ON synthetic_finance_import_entries(provider, legal_entity_id, account_id, occurred_on);

CREATE TABLE IF NOT EXISTS synthetic_finance_import_audit (
  id BIGSERIAL PRIMARY KEY,
  batch_id TEXT NOT NULL REFERENCES synthetic_finance_import_batches(id)
    ON DELETE CASCADE,
  line_number INTEGER NOT NULL CHECK (line_number BETWEEN 2 AND 101),
  external_id TEXT NOT NULL CHECK (external_id ~ '^[A-Za-z0-9_-]{3,100}$'),
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  outcome TEXT NOT NULL CHECK (outcome IN (
    'STAGED','DUPLICATE_PREVIOUS_IMPORT','CONFLICTING_PREVIOUS_IMPORT',
    'DUPLICATE_SOURCE_ID','DUPLICATE_REFERENCE'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT synthetic_finance_audit_once_per_line UNIQUE (batch_id, line_number)
);
CREATE INDEX IF NOT EXISTS synthetic_finance_audit_batch_idx
  ON synthetic_finance_import_audit(batch_id, outcome);
