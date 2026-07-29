-- Territory Payout Cycles (Marco 3.2A)
-- Formal cycle-based commission management for territorial managers.
--
-- Design:
-- 1. Cycles are calculated from territory_ledger (immutable source)
-- 2. All monetary values in BIGINT cents
-- 3. One cycle per (territory, manager, month, policy) — unique constraint
-- 4. Cycle flows: OPEN → CALCULATED → UNDER_REVIEW → APPROVED
-- 5. Corrections via REVERSAL/ADJUSTMENT entries, never mutations
-- 6. territory_ledger gets immutability trigger

-- ═══════════════════════════════════════════════════════════════════
-- 1. IMMUTABILITY TRIGGER FOR TERRITORY LEDGER
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION territory_ledger_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'TERRITORY_LEDGER_IMMUTABLE: UPDATE and DELETE are forbidden on territory_ledger. Use REVERSAL or ADJUSTMENT entries for corrections.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "territory_ledger_immutable_trg"
  BEFORE UPDATE OR DELETE ON "territory_ledger"
  FOR EACH ROW
  EXECUTE FUNCTION territory_ledger_immutable();

-- ═══════════════════════════════════════════════════════════════════
-- 2. TERRITORY PAYOUT CYCLES
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE "territory_payout_cycles" (
  "id"                          TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "territory_id"                TEXT NOT NULL,
  "manager_id"                  TEXT,
  "manager_assignment_id"       TEXT,
  "reference_month"             TEXT NOT NULL,
  "policy_version"              TEXT NOT NULL,
  "commission_rate_basis_points" INT NOT NULL DEFAULT 4000,

  "gross_platform_fee_cents"    BIGINT NOT NULL DEFAULT 0,
  "gross_manager_commission_cents" BIGINT NOT NULL DEFAULT 0,
  "approved_adjustments_cents"  BIGINT NOT NULL DEFAULT 0,
  "approved_amount_cents"       BIGINT NOT NULL DEFAULT 0,

  "status"                      TEXT NOT NULL DEFAULT 'OPEN',

  "fiscal_document_required"    BOOLEAN NOT NULL DEFAULT false,
  "fiscal_document_type"        TEXT,
  "fiscal_document_status"      TEXT DEFAULT 'NOT_REQUIRED',
  "fiscal_document_reference"   TEXT,
  "fiscal_document_url"         TEXT,

  "calculated_at"               TIMESTAMPTZ,
  "submitted_for_review_at"     TIMESTAMPTZ,
  "approved_at"                 TIMESTAMPTZ,
  "approved_by"                 TEXT,
  "cancelled_at"                TIMESTAMPTZ,
  "cancelled_by"                TEXT,
  "cancel_reason"               TEXT,

  "created_at"                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "idempotency_key"             TEXT NOT NULL,

  CONSTRAINT "territory_payout_cycles_pkey" PRIMARY KEY ("id")
);

-- One cycle per territory+manager+month+policy
CREATE UNIQUE INDEX "territory_payout_cycles_unique_idx"
  ON "territory_payout_cycles" ("territory_id", "manager_id", "reference_month", "policy_version");

ALTER TABLE "territory_payout_cycles"
  ADD CONSTRAINT "territory_payout_cycles_idempotency_key_unique"
  UNIQUE ("idempotency_key");

ALTER TABLE "territory_payout_cycles"
  ADD CONSTRAINT "territory_payout_cycles_status_chk"
  CHECK ("status" IN (
    'OPEN', 'CALCULATED', 'UNDER_REVIEW', 'APPROVED',
    'OBLIGATION_CREATED', 'PAYMENT_PROCESSING', 'PAID',
    'BLOCKED', 'CANCELLED', 'REVERSED'
  ));

ALTER TABLE "territory_payout_cycles"
  ADD CONSTRAINT "territory_payout_cycles_gross_fee_nonneg_chk"
  CHECK ("gross_platform_fee_cents" >= 0);

ALTER TABLE "territory_payout_cycles"
  ADD CONSTRAINT "territory_payout_cycles_gross_commission_nonneg_chk"
  CHECK ("gross_manager_commission_cents" >= 0);

ALTER TABLE "territory_payout_cycles"
  ADD CONSTRAINT "territory_payout_cycles_approved_nonneg_chk"
  CHECK ("approved_amount_cents" >= 0);

ALTER TABLE "territory_payout_cycles"
  ADD CONSTRAINT "territory_payout_cycles_fiscal_status_chk"
  CHECK ("fiscal_document_status" IN ('NOT_REQUIRED', 'PENDING', 'RECEIVED', 'VALIDATED', 'REJECTED'));

CREATE INDEX "territory_payout_cycles_territory_idx" ON "territory_payout_cycles" ("territory_id");
CREATE INDEX "territory_payout_cycles_manager_idx" ON "territory_payout_cycles" ("manager_id") WHERE "manager_id" IS NOT NULL;
CREATE INDEX "territory_payout_cycles_status_idx" ON "territory_payout_cycles" ("status");
CREATE INDEX "territory_payout_cycles_month_idx" ON "territory_payout_cycles" ("reference_month");
