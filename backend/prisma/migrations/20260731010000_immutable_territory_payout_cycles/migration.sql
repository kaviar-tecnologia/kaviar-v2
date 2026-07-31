BEGIN;

-- ═══════════════════════════════════════════════════════════════
-- territory_payout_cycles: immutable financial snapshot enforcement
-- ═══════════════════════════════════════════════════════════════

-- UPDATE trigger: reject changes to financial/identity fields
CREATE OR REPLACE FUNCTION territory_payout_cycles_immutable_snapshot()
RETURNS TRIGGER AS $$
DECLARE
  mutable_fields TEXT[] := ARRAY[
    'status',
    'fiscal_document_type',
    'fiscal_document_status',
    'fiscal_document_reference',
    'fiscal_document_url',
    'submitted_for_review_at',
    'approved_at',
    'approved_by',
    'cancelled_at',
    'cancelled_by',
    'cancel_reason',
    'updated_at'
  ];
  old_snapshot JSONB;
  new_snapshot JSONB;
BEGIN
  old_snapshot := to_jsonb(OLD) - mutable_fields;
  new_snapshot := to_jsonb(NEW) - mutable_fields;

  IF old_snapshot IS DISTINCT FROM new_snapshot THEN
    RAISE EXCEPTION 'TERRITORY_PAYOUT_CYCLE_FINANCIAL_SNAPSHOT_IMMUTABLE: Cannot modify financial identity fields of territory_payout_cycles (id=%)', OLD.id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER territory_payout_cycles_immutable_snapshot_trg
  BEFORE UPDATE ON territory_payout_cycles
  FOR EACH ROW
  EXECUTE FUNCTION territory_payout_cycles_immutable_snapshot();

-- DELETE trigger: forbid all deletes
CREATE OR REPLACE FUNCTION territory_payout_cycles_delete_forbidden()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'TERRITORY_PAYOUT_CYCLES_DELETE_FORBIDDEN: DELETE is not permitted on territory_payout_cycles'
    USING ERRCODE = 'P0001';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER territory_payout_cycles_delete_forbidden_trg
  BEFORE DELETE ON territory_payout_cycles
  FOR EACH ROW
  EXECUTE FUNCTION territory_payout_cycles_delete_forbidden();

-- TRUNCATE trigger: forbid all truncates
CREATE OR REPLACE FUNCTION territory_payout_cycles_truncate_forbidden()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'TERRITORY_PAYOUT_CYCLES_TRUNCATE_FORBIDDEN: TRUNCATE is not permitted on territory_payout_cycles'
    USING ERRCODE = 'P0001';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER territory_payout_cycles_truncate_forbidden_trg
  BEFORE TRUNCATE ON territory_payout_cycles
  FOR EACH STATEMENT
  EXECUTE FUNCTION territory_payout_cycles_truncate_forbidden();

COMMIT;
