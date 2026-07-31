-- ═══════════════════════════════════════════════════════════════
-- Marco 3.2A — Schema Expansion (expand-only, retrocompatível)
-- Nenhuma constraint que dependa de dados históricos.
-- Nenhum backfill. Nenhum trigger sobre tabelas existentes.
-- ═══════════════════════════════════════════════════════════════

-- ═══ 1. EXPAND ride_fee_splits ═══

ALTER TABLE ride_fee_splits
  ADD COLUMN IF NOT EXISTS manager_assignment_id TEXT,
  ADD COLUMN IF NOT EXISTS recognized_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recognized_at_source TEXT,
  ADD COLUMN IF NOT EXISTS platform_fee_rate_bps INT NOT NULL DEFAULT 1800,
  ADD COLUMN IF NOT EXISTS manager_commission_rate_bps INT NOT NULL DEFAULT 4000;

-- ═══ 2. EXPAND territory_ledger ═══

ALTER TABLE territory_ledger
  ADD COLUMN IF NOT EXISTS manager_assignment_id TEXT;

-- ═══ 3. CREATE TABLE territory_payout_cycles ═══

CREATE TABLE territory_payout_cycles (
  id                              TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  territory_id                    TEXT NOT NULL,
  manager_id                      TEXT,
  reference_month                 TEXT NOT NULL,
  policy_version                  TEXT NOT NULL,
  commission_rate_basis_points    INT NOT NULL DEFAULT 4000,
  platform_fee_rate_basis_points  INT NOT NULL DEFAULT 1800,
  competence_timezone             TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  cycle_type                      TEXT NOT NULL DEFAULT 'REGULAR',
  parent_cycle_id                 TEXT,
  sequence_number                 INT NOT NULL DEFAULT 1,
  gross_platform_fee_cents        BIGINT NOT NULL DEFAULT 0,
  gross_manager_commission_cents  BIGINT NOT NULL DEFAULT 0,
  approved_adjustments_cents      BIGINT NOT NULL DEFAULT 0,
  approved_amount_cents           BIGINT NOT NULL DEFAULT 0,
  status                          TEXT NOT NULL DEFAULT 'OPEN',
  fiscal_document_required        BOOLEAN NOT NULL DEFAULT false,
  fiscal_document_type            TEXT,
  fiscal_document_status          TEXT DEFAULT 'NOT_REQUIRED',
  fiscal_document_reference       TEXT,
  fiscal_document_url             TEXT,
  calculated_at                   TIMESTAMPTZ,
  recognized_at                   TIMESTAMPTZ,
  submitted_for_review_at         TIMESTAMPTZ,
  approved_at                     TIMESTAMPTZ,
  approved_by                     TEXT,
  cancelled_at                    TIMESTAMPTZ,
  cancelled_by                    TEXT,
  cancel_reason                   TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  idempotency_key                 TEXT NOT NULL,
  CONSTRAINT territory_payout_cycles_pkey PRIMARY KEY (id),
  CONSTRAINT territory_payout_cycles_parent_fk
    FOREIGN KEY (parent_cycle_id) REFERENCES territory_payout_cycles(id) ON DELETE RESTRICT
);

-- ═══ 4. CREATE TABLE territory_cycle_allocations ═══

CREATE TABLE territory_cycle_allocations (
  id                    TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  cycle_id              TEXT NOT NULL,
  ledger_entry_id       BIGINT NOT NULL,
  ride_id               TEXT NOT NULL,
  entry_type            TEXT NOT NULL,
  amount_cents          BIGINT NOT NULL,
  manager_assignment_id TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT territory_cycle_allocations_pkey PRIMARY KEY (id),
  CONSTRAINT territory_cycle_allocations_cycle_fk
    FOREIGN KEY (cycle_id) REFERENCES territory_payout_cycles(id) ON DELETE RESTRICT,
  CONSTRAINT territory_cycle_allocations_ledger_fk
    FOREIGN KEY (ledger_entry_id) REFERENCES territory_ledger(id) ON DELETE RESTRICT
);

-- ═══ 5. IMMUTABILITY: territory_cycle_allocations (new table, no legacy) ═══

CREATE OR REPLACE FUNCTION territory_cycle_allocations_immutable()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'TERRITORY_CYCLE_ALLOCATIONS_IMMUTABLE: UPDATE, DELETE and TRUNCATE are forbidden.';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER territory_cycle_allocations_immutable_trg
  BEFORE UPDATE OR DELETE ON territory_cycle_allocations
  FOR EACH ROW EXECUTE FUNCTION territory_cycle_allocations_immutable();

CREATE TRIGGER territory_cycle_allocations_immutable_truncate_trg
  BEFORE TRUNCATE ON territory_cycle_allocations
  FOR EACH STATEMENT EXECUTE FUNCTION territory_cycle_allocations_immutable();

-- ═══ 6. INDEXES territory_payout_cycles ═══

-- Only one active REGULAR per (territory, manager, month) excluding CANCELLED
CREATE UNIQUE INDEX territory_payout_cycles_regular_assigned_idx
  ON territory_payout_cycles (territory_id, manager_id, reference_month)
  WHERE cycle_type = 'REGULAR' AND manager_id IS NOT NULL AND status <> 'CANCELLED';

CREATE UNIQUE INDEX territory_payout_cycles_regular_unassigned_idx
  ON territory_payout_cycles (territory_id, reference_month)
  WHERE cycle_type = 'REGULAR' AND manager_id IS NULL AND status <> 'CANCELLED';

-- Unique sequence per parent (SUPPLEMENTAL only)
CREATE UNIQUE INDEX territory_payout_cycles_parent_sequence_idx
  ON territory_payout_cycles (parent_cycle_id, sequence_number)
  WHERE parent_cycle_id IS NOT NULL;

-- Idempotency
ALTER TABLE territory_payout_cycles
  ADD CONSTRAINT territory_payout_cycles_idempotency_key_unique UNIQUE (idempotency_key);

-- ═══ 7. INDEXES territory_cycle_allocations ═══

-- Each ledger entry allocated to exactly one cycle
CREATE UNIQUE INDEX territory_cycle_allocations_entry_unique_idx
  ON territory_cycle_allocations (ledger_entry_id);

-- Query by cycle
CREATE INDEX territory_cycle_allocations_cycle_idx
  ON territory_cycle_allocations (cycle_id);

-- ═══ 8. CHECK CONSTRAINTS territory_payout_cycles ═══

ALTER TABLE territory_payout_cycles ADD CONSTRAINT territory_payout_cycles_reference_month_chk
  CHECK (reference_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

ALTER TABLE territory_payout_cycles ADD CONSTRAINT territory_payout_cycles_commission_rate_chk
  CHECK (commission_rate_basis_points >= 0 AND commission_rate_basis_points <= 10000);

ALTER TABLE territory_payout_cycles ADD CONSTRAINT territory_payout_cycles_platform_rate_chk
  CHECK (platform_fee_rate_basis_points >= 0 AND platform_fee_rate_basis_points <= 10000);

ALTER TABLE territory_payout_cycles ADD CONSTRAINT territory_payout_cycles_cycle_type_chk
  CHECK (cycle_type IN ('REGULAR', 'SUPPLEMENTAL'));

ALTER TABLE territory_payout_cycles ADD CONSTRAINT territory_payout_cycles_sequence_number_pos_chk
  CHECK (sequence_number >= 1);

ALTER TABLE territory_payout_cycles ADD CONSTRAINT territory_payout_cycles_parent_required_chk
  CHECK (
    (cycle_type = 'REGULAR' AND parent_cycle_id IS NULL AND sequence_number = 1)
    OR (cycle_type = 'SUPPLEMENTAL' AND parent_cycle_id IS NOT NULL AND sequence_number >= 2)
  );

ALTER TABLE territory_payout_cycles ADD CONSTRAINT territory_payout_cycles_status_chk
  CHECK (status IN (
    'OPEN', 'CALCULATED', 'UNDER_REVIEW', 'APPROVED',
    'OBLIGATION_CREATED', 'PAYMENT_PROCESSING', 'PAID',
    'BLOCKED', 'BLOCKED_NEGATIVE_ADJUSTMENT', 'CANCELLED'
  ));

ALTER TABLE territory_payout_cycles ADD CONSTRAINT territory_payout_cycles_gross_fee_nonneg_chk
  CHECK (gross_platform_fee_cents >= 0);

ALTER TABLE territory_payout_cycles ADD CONSTRAINT territory_payout_cycles_gross_commission_nonneg_chk
  CHECK (gross_manager_commission_cents >= 0);

ALTER TABLE territory_payout_cycles ADD CONSTRAINT territory_payout_cycles_approved_nonneg_chk
  CHECK (approved_amount_cents >= 0);

ALTER TABLE territory_payout_cycles ADD CONSTRAINT territory_payout_cycles_fiscal_status_chk
  CHECK (fiscal_document_status IN ('NOT_REQUIRED', 'PENDING', 'RECEIVED', 'VALIDATED', 'REJECTED'));

-- Query indexes
CREATE INDEX territory_payout_cycles_territory_idx ON territory_payout_cycles (territory_id);
CREATE INDEX territory_payout_cycles_manager_idx ON territory_payout_cycles (manager_id) WHERE manager_id IS NOT NULL;
CREATE INDEX territory_payout_cycles_status_idx ON territory_payout_cycles (status);
CREATE INDEX territory_payout_cycles_month_idx ON territory_payout_cycles (reference_month);
