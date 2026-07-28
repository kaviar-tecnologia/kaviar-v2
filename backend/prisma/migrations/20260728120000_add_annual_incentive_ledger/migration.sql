-- Annual Incentive Ledger (Gratificação Anual de Incentivo KAVIAR)
-- Append-only immutable ledger for annual incentive events.
-- This table replaces the legacy family_return_accruals system.
--
-- Design principles:
-- 1. Immutable: no UPDATE or DELETE allowed (enforced by trigger)
-- 2. Idempotent: unique idempotency_key prevents duplicate inserts
-- 3. Auditable: every event has source traceability
-- 4. Versionable: policy_version tracks which rules generated the event
-- 5. Reversible: corrections are new REVERSAL events, never edits

-- ═══════════════════════════════════════════════════════════════════
-- TABLE
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "annual_incentive_ledger" (
  "id"                TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "driver_id"         TEXT NOT NULL,
  "program_year"      INTEGER NOT NULL,
  "event_type"        TEXT NOT NULL,
  "amount_cents"      BIGINT NOT NULL,
  "base_amount_cents" BIGINT,
  "rate_basis_points" INTEGER,
  "policy_version"    TEXT NOT NULL,
  "source_type"       TEXT NOT NULL,
  "source_id"         TEXT,
  "source_event_id"   TEXT,
  "request_id"        TEXT,
  "correlation_id"    TEXT,
  "reversal_of_id"    TEXT,
  "idempotency_key"   TEXT NOT NULL,
  "metadata"          JSONB NOT NULL DEFAULT '{}',
  "occurred_at"       TIMESTAMPTZ NOT NULL,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "annual_incentive_ledger_pkey" PRIMARY KEY ("id")
);

-- ═══════════════════════════════════════════════════════════════════
-- FOREIGN KEYS
-- ═══════════════════════════════════════════════════════════════════

-- Driver must exist; RESTRICT prevents deleting driver with financial history
ALTER TABLE "annual_incentive_ledger"
  ADD CONSTRAINT "annual_incentive_ledger_driver_id_fkey"
  FOREIGN KEY ("driver_id") REFERENCES "drivers"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Self-referencing FK for reversals; RESTRICT prevents deleting the original event
ALTER TABLE "annual_incentive_ledger"
  ADD CONSTRAINT "annual_incentive_ledger_reversal_of_id_fkey"
  FOREIGN KEY ("reversal_of_id") REFERENCES "annual_incentive_ledger"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ═══════════════════════════════════════════════════════════════════
-- CHECK CONSTRAINTS
-- ═══════════════════════════════════════════════════════════════════

-- amount_cents must never be zero (can be positive for ACCRUAL or negative for REVERSAL)
ALTER TABLE "annual_incentive_ledger"
  ADD CONSTRAINT "annual_incentive_ledger_amount_cents_nonzero_chk"
  CHECK ("amount_cents" != 0);

-- base_amount_cents must be non-negative when provided
ALTER TABLE "annual_incentive_ledger"
  ADD CONSTRAINT "annual_incentive_ledger_base_amount_cents_nonneg_chk"
  CHECK ("base_amount_cents" IS NULL OR "base_amount_cents" >= 0);

-- rate_basis_points must be non-negative when provided
ALTER TABLE "annual_incentive_ledger"
  ADD CONSTRAINT "annual_incentive_ledger_rate_basis_points_nonneg_chk"
  CHECK ("rate_basis_points" IS NULL OR "rate_basis_points" >= 0);

-- program_year must be in a reasonable range
ALTER TABLE "annual_incentive_ledger"
  ADD CONSTRAINT "annual_incentive_ledger_program_year_range_chk"
  CHECK ("program_year" >= 2026 AND "program_year" <= 2200);

-- event_type must be one of the allowed values
ALTER TABLE "annual_incentive_ledger"
  ADD CONSTRAINT "annual_incentive_ledger_event_type_enum_chk"
  CHECK ("event_type" IN (
    'ACCRUAL',
    'REVERSAL',
    'REQUEST_RESERVATION',
    'RELEASE',
    'PAYMENT',
    'CARRY_FORWARD_IN',
    'CARRY_FORWARD_OUT'
  ));

-- REVERSAL must have reversal_of_id
ALTER TABLE "annual_incentive_ledger"
  ADD CONSTRAINT "annual_incentive_ledger_reversal_requires_ref_chk"
  CHECK (
    ("event_type" = 'REVERSAL' AND "reversal_of_id" IS NOT NULL)
    OR
    ("event_type" != 'REVERSAL' AND "reversal_of_id" IS NULL)
  );

-- reversal_of_id cannot point to itself
ALTER TABLE "annual_incentive_ledger"
  ADD CONSTRAINT "annual_incentive_ledger_reversal_not_self_chk"
  CHECK ("reversal_of_id" IS NULL OR "reversal_of_id" != "id");

-- idempotency_key must not be empty or whitespace-only
ALTER TABLE "annual_incentive_ledger"
  ADD CONSTRAINT "annual_incentive_ledger_idempotency_key_notempty_chk"
  CHECK (length(regexp_replace("idempotency_key", '\s', '', 'g')) > 0);

-- policy_version must not be empty or whitespace-only
ALTER TABLE "annual_incentive_ledger"
  ADD CONSTRAINT "annual_incentive_ledger_policy_version_notempty_chk"
  CHECK (length(regexp_replace("policy_version", '\s', '', 'g')) > 0);

-- source_type must not be empty or whitespace-only
ALTER TABLE "annual_incentive_ledger"
  ADD CONSTRAINT "annual_incentive_ledger_source_type_notempty_chk"
  CHECK (length(regexp_replace("source_type", '\s', '', 'g')) > 0);

-- metadata must be a JSON object (not array, string, number, or boolean)
ALTER TABLE "annual_incentive_ledger"
  ADD CONSTRAINT "annual_incentive_ledger_metadata_is_object_chk"
  CHECK (jsonb_typeof("metadata") = 'object');

-- ═══════════════════════════════════════════════════════════════════
-- UNIQUE CONSTRAINTS
-- ═══════════════════════════════════════════════════════════════════

-- Global idempotency
ALTER TABLE "annual_incentive_ledger"
  ADD CONSTRAINT "annual_incentive_ledger_idempotency_key_unique"
  UNIQUE ("idempotency_key");

-- Prevent duplicate events from the same source event (partial unique: only when source_event_id is not null)
CREATE UNIQUE INDEX "annual_incentive_ledger_source_event_unique_idx"
  ON "annual_incentive_ledger" ("source_type", "source_event_id", "event_type")
  WHERE "source_event_id" IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════════════════════════

CREATE INDEX "annual_incentive_ledger_driver_year_idx"
  ON "annual_incentive_ledger" ("driver_id", "program_year");

CREATE INDEX "annual_incentive_ledger_driver_occurred_idx"
  ON "annual_incentive_ledger" ("driver_id", "occurred_at" DESC);

CREATE INDEX "annual_incentive_ledger_event_type_idx"
  ON "annual_incentive_ledger" ("event_type");

CREATE INDEX "annual_incentive_ledger_source_type_source_id_idx"
  ON "annual_incentive_ledger" ("source_type", "source_id")
  WHERE "source_id" IS NOT NULL;

CREATE INDEX "annual_incentive_ledger_request_id_idx"
  ON "annual_incentive_ledger" ("request_id")
  WHERE "request_id" IS NOT NULL;

CREATE INDEX "annual_incentive_ledger_correlation_id_idx"
  ON "annual_incentive_ledger" ("correlation_id")
  WHERE "correlation_id" IS NOT NULL;

CREATE INDEX "annual_incentive_ledger_reversal_of_id_idx"
  ON "annual_incentive_ledger" ("reversal_of_id")
  WHERE "reversal_of_id" IS NOT NULL;

CREATE INDEX "annual_incentive_ledger_created_at_idx"
  ON "annual_incentive_ledger" ("created_at" DESC);

-- ═══════════════════════════════════════════════════════════════════
-- IMMUTABILITY TRIGGER (APPEND-ONLY)
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION annual_incentive_ledger_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'ANNUAL_INCENTIVE_LEDGER_IMMUTABLE: UPDATE and DELETE are forbidden on annual_incentive_ledger. Use REVERSAL events for corrections.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "annual_incentive_ledger_immutable_trg"
  BEFORE UPDATE OR DELETE ON "annual_incentive_ledger"
  FOR EACH ROW
  EXECUTE FUNCTION annual_incentive_ledger_immutable();
