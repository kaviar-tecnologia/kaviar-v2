-- ═══════════════════════════════════════════════════════════════
-- Marco 3.2A — Backfill + Hardening
-- PRÉ-REQUISITO: SETTLEMENT_PAUSED=true deployado e ativo
-- PRÉ-REQUISITO: scripts/finance/preflight-territory-cycles.ts PASSED
-- PRÉ-REQUISITO: Zero transações financeiras em voo confirmado
--
-- Transacionalidade: PostgreSQL executa DDL dentro de transação.
-- Se qualquer statement falhar, a transação inteira faz rollback.
-- ═══════════════════════════════════════════════════════════════

-- ═══ 1. PREFLIGHT: assignments ativos duplicados ═══
DO $$ DECLARE c INT; BEGIN
  SELECT COUNT(*) INTO c FROM (
    SELECT territory_id FROM territory_manager_assignments
    WHERE status = 'active' GROUP BY territory_id HAVING COUNT(*) > 1
  ) d;
  IF c > 0 THEN
    RAISE EXCEPTION 'MIGRATION_BLOCKED: % territories have duplicate active assignments. Run scripts/finance/preflight-territory-cycles.ts', c;
  END IF;
END $$;

-- ═══ 2. PREFLIGHT: financial_payees duplicados ═══
DO $$ DECLARE c INT; BEGIN
  SELECT COUNT(*) INTO c FROM (
    SELECT reference_id FROM financial_payees
    WHERE payee_type = 'MANAGER' AND reference_id IS NOT NULL
    GROUP BY reference_id HAVING COUNT(*) > 1
  ) d;
  IF c > 0 THEN
    RAISE EXCEPTION 'MIGRATION_BLOCKED: % duplicate MANAGER payees. Run scripts/finance/audit-duplicate-payees.ts', c;
  END IF;
END $$;

-- ═══ 3. PREFLIGHT: no incremental keys (settlement atômico not yet deployed) ═══
DO $$ DECLARE c INT; BEGIN
  SELECT COUNT(*) INTO c FROM territory_ledger
  WHERE idempotency_key LIKE '%:partial%' OR idempotency_key LIKE '%:resolve:%';
  IF c > 0 THEN
    RAISE EXCEPTION 'MIGRATION_BLOCKED: % incremental territory_ledger keys found. Backfill must run before settlement atomico.', c;
  END IF;
END $$;

-- ═══ 4. PREFLIGHT: idempotency consistency of existing territory_ledger ═══
DO $$ DECLARE c INT; BEGIN
  SELECT COUNT(*) INTO c FROM (
    SELECT tl.id FROM territory_ledger tl
    JOIN ride_fee_splits rfs ON tl.idempotency_key = 'territory_platform_fee:' || rfs.ride_id
    WHERE rfs.territory_id IS NOT NULL AND rfs.fee_collected_cents > 0
      AND (
        tl.entry_type IS DISTINCT FROM 'platform_fee'
        OR tl.territory_id IS DISTINCT FROM rfs.territory_id
        OR tl.manager_id IS DISTINCT FROM rfs.manager_id
        OR tl.manager_assignment_id IS DISTINCT FROM rfs.manager_assignment_id
        OR tl.reference_month IS DISTINCT FROM rfs.reference_month
        OR tl.amount_cents IS DISTINCT FROM rfs.fee_collected_cents
        OR tl.reference_id IS DISTINCT FROM rfs.ride_id
        OR tl.reference_type IS DISTINCT FROM 'ride'
      )
    UNION ALL
    SELECT tl.id FROM territory_ledger tl
    JOIN ride_fee_splits rfs ON tl.idempotency_key = 'territory_fee_share:' || rfs.ride_id
    WHERE rfs.territory_id IS NOT NULL AND rfs.fee_collected_cents > 0
      AND (
        tl.entry_type IS DISTINCT FROM 'fee_share'
        OR tl.territory_id IS DISTINCT FROM rfs.territory_id
        OR tl.manager_id IS DISTINCT FROM rfs.manager_id
        OR tl.manager_assignment_id IS DISTINCT FROM rfs.manager_assignment_id
        OR tl.reference_month IS DISTINCT FROM rfs.reference_month
        OR tl.amount_cents IS DISTINCT FROM (rfs.fee_collected_cents * rfs.manager_commission_rate_bps + 5000) / 10000
        OR tl.reference_id IS DISTINCT FROM rfs.ride_id
        OR tl.reference_type IS DISTINCT FROM 'ride'
      )
  ) x;
  IF c > 0 THEN
    RAISE EXCEPTION 'MIGRATION_BLOCKED: TERRITORY_LEDGER_IDEMPOTENCY_MISMATCH on % entries. Existing keys have divergent data.', c;
  END IF;
END $$;

-- ═══ 5. BACKFILL recognized_at from created_at ═══
UPDATE ride_fee_splits
SET recognized_at = created_at,
    recognized_at_source = 'BACKFILL_SPLIT_CREATED_AT'
WHERE recognized_at IS NULL;

-- For rows where recognized_at was set by settlement code before this migration
-- (between commit 5 deploy and this backfill — should be zero during maintenance)
UPDATE ride_fee_splits
SET recognized_at_source = 'DB_SETTLEMENT_CLOCK'
WHERE recognized_at IS NOT NULL AND recognized_at_source IS NULL;

-- ═══ 6. BACKFILL territory_ledger: platform_fee ═══
INSERT INTO territory_ledger (
  territory_id, manager_id, manager_assignment_id, reference_month,
  entry_type, amount_cents, description, reference_type, reference_id, idempotency_key
)
SELECT
  rfs.territory_id,
  rfs.manager_id,
  rfs.manager_assignment_id,
  rfs.reference_month,
  'platform_fee',
  rfs.fee_collected_cents,
  'Taxa plataforma arrecadada',
  'ride',
  rfs.ride_id,
  'territory_platform_fee:' || rfs.ride_id
FROM ride_fee_splits rfs
WHERE rfs.territory_id IS NOT NULL
  AND rfs.fee_collected_cents > 0
  AND NOT EXISTS (
    SELECT 1 FROM territory_ledger tl
    WHERE tl.idempotency_key = 'territory_platform_fee:' || rfs.ride_id
  );

-- ═══ 7. BACKFILL territory_ledger: fee_share ═══
INSERT INTO territory_ledger (
  territory_id, manager_id, manager_assignment_id, reference_month,
  entry_type, amount_cents, description, reference_type, reference_id, idempotency_key
)
SELECT
  rfs.territory_id,
  rfs.manager_id,
  rfs.manager_assignment_id,
  rfs.reference_month,
  'fee_share',
  (rfs.fee_collected_cents * rfs.manager_commission_rate_bps + 5000) / 10000,
  CASE WHEN rfs.manager_id IS NOT NULL
    THEN 'Parcela contratual gestor'
    ELSE 'Parcela territorial reservada'
  END,
  'ride',
  rfs.ride_id,
  'territory_fee_share:' || rfs.ride_id
FROM ride_fee_splits rfs
WHERE rfs.territory_id IS NOT NULL
  AND rfs.fee_collected_cents > 0
  AND NOT EXISTS (
    SELECT 1 FROM territory_ledger tl
    WHERE tl.idempotency_key = 'territory_fee_share:' || rfs.ride_id
  );

-- ═══ 8. ENFORCE NOT NULL + defaults for new records ═══
ALTER TABLE ride_fee_splits ALTER COLUMN recognized_at SET NOT NULL;
ALTER TABLE ride_fee_splits ALTER COLUMN recognized_at SET DEFAULT clock_timestamp();
ALTER TABLE ride_fee_splits ALTER COLUMN recognized_at_source SET NOT NULL;
ALTER TABLE ride_fee_splits ALTER COLUMN recognized_at_source SET DEFAULT 'DB_SETTLEMENT_CLOCK';

-- ═══ 9. CHECK constraint on recognized_at_source ═══
ALTER TABLE ride_fee_splits ADD CONSTRAINT ride_fee_splits_recognized_at_source_chk
  CHECK (recognized_at_source IN ('DB_SETTLEMENT_CLOCK', 'BACKFILL_SPLIT_CREATED_AT'));

-- ═══ 10. UNIQUE INDEX: one active assignment per territory ═══
CREATE UNIQUE INDEX territory_manager_assignments_active_unique_idx
  ON territory_manager_assignments (territory_id)
  WHERE status = 'active';

-- ═══ 11. UNIQUE INDEX: one MANAGER payee per reference ═══
CREATE UNIQUE INDEX financial_payees_manager_reference_unique_idx
  ON financial_payees (payee_type, reference_id)
  WHERE payee_type = 'MANAGER' AND reference_id IS NOT NULL;

-- ═══ 12. TRIGGER: territory_ledger immutability ═══
CREATE OR REPLACE FUNCTION territory_ledger_immutable()
RETURNS TRIGGER AS $fn$
BEGIN
  RAISE EXCEPTION 'TERRITORY_LEDGER_IMMUTABLE: UPDATE, DELETE and TRUNCATE are forbidden. Use REVERSAL or ADJUSTMENT entries.';
END;
$fn$ LANGUAGE plpgsql;

CREATE TRIGGER territory_ledger_immutable_trg
  BEFORE UPDATE OR DELETE ON territory_ledger
  FOR EACH ROW EXECUTE FUNCTION territory_ledger_immutable();

CREATE TRIGGER territory_ledger_immutable_truncate_trg
  BEFORE TRUNCATE ON territory_ledger
  FOR EACH STATEMENT EXECUTE FUNCTION territory_ledger_immutable();
