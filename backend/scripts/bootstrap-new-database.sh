#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOOTSTRAP_ROOT_DIR="$ROOT_DIR/prisma/bootstrap"
BOOTSTRAP_VERSION="${BOOTSTRAP_VERSION:-}"
DRIFT_ONLY="${DRIFT_ONLY:-0}"

fail() {
  echo "ABORT: $*" >&2
  exit 1
}

if [[ -n "$BOOTSTRAP_VERSION" ]]; then
  BOOTSTRAP_DIR="$BOOTSTRAP_ROOT_DIR/$BOOTSTRAP_VERSION"
else
  BOOTSTRAP_DIR="$(find "$BOOTSTRAP_ROOT_DIR" -mindepth 1 -maxdepth 1 -type d -name '*_current' | sort | tail -n 1)"
fi

[[ -n "${BOOTSTRAP_DIR:-}" ]] || fail "no bootstrap baseline directory found under $BOOTSTRAP_ROOT_DIR"
[[ -d "$BOOTSTRAP_DIR" ]] || fail "bootstrap baseline directory not found: $BOOTSTRAP_DIR"

PRE_SQL="$BOOTSTRAP_DIR/pre-bootstrap.sql"
BASELINE_SQL="$BOOTSTRAP_DIR/baseline.sql"
POST_SQL="$BOOTSTRAP_DIR/post-prisma-objects.sql"
CUTOFF_FILE="$BOOTSTRAP_DIR/migration-cutoff.txt"
SCHEMA_FILE="$ROOT_DIR/prisma/schema.prisma"
MIGRATIONS_DIR="$ROOT_DIR/prisma/migrations"

[[ -f "$PRE_SQL" ]] || fail "missing pre-bootstrap.sql in $BOOTSTRAP_DIR"
[[ -f "$BASELINE_SQL" ]] || fail "missing baseline.sql in $BOOTSTRAP_DIR"
[[ -f "$POST_SQL" ]] || fail "missing post-prisma-objects.sql in $BOOTSTRAP_DIR"
[[ -f "$CUTOFF_FILE" ]] || fail "missing migration-cutoff.txt in $BOOTSTRAP_DIR"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || fail "missing command: $1"
}

need_cmd psql
need_cmd npx
need_cmd python3
need_cmd awk
need_cmd sed
need_cmd find
need_cmd mkdir
need_cmd cp

validate_prisma_drift_file() {
  local drift_file="$1"

  [[ -f "$drift_file" ]] || fail "drift file missing: $drift_file"

  python3 - "$drift_file" <<'PY' || exit_code=$?
import re
import sys
from pathlib import Path

if len(sys.argv) != 2:
  print("ABORT: internal drift validator usage error", file=sys.stderr)
  sys.exit(2)

drift_path = Path(sys.argv[1])
if not drift_path.exists():
  print(f"ABORT: drift file missing: {drift_path}", file=sys.stderr)
  sys.exit(3)

text = drift_path.read_text()
if not text.strip() or text.strip() == "-- This is an empty migration.":
  print("DRIFT_VALIDATION_RESULT=PASS")
  print("DRIFT_STATEMENTS_TOTAL=0")
  sys.exit(0)

allowed_drop_tables = {
  "admin_audit_logs",
  "admin_login_history",
  "driver_referral_log",
  "territory_price_floors",
  "retorno_familiar_policy",
  "retorno_familiar_requests",
}

allowed_drop_foreign_keys = {
  "driver_referral_log_driver_id_fkey",
  "territory_price_floors_pricing_profile_id_fkey",
  "retorno_familiar_requests_driver_id_fkey",
  "retorno_familiar_requests_policy_id_fkey",
}

allowed_drop_indexes = {
  "idx_audit_admin_id",
  "idx_audit_created_at",
  "idx_audit_entity",
  "idx_login_email",
  "idx_login_created_at",
  "idx_referral_log_driver",
  "idx_referral_log_referred_by",
  "idx_tpf_territory_active",
  "idx_tpf_origin_dest",
  "idx_tpf_origin_label",
  "idx_tpf_pending_approval",
  "idx_tpf_active_status",
  "idx_rfr_status",
  "idx_rfr_year",
  "idx_rfr_policy",
  "idx_rfr_driver",
  "municipal_regulatory_driver_protocols_case_driver_null_modality",
  "municipal_regulatory_driver_protocols_case_driver_null_modality_cycle_key",
  "municipal_authorizations_open_manual_draft_key",
}

allowed_drop_views = {
  "neighborhood_stats",
}

allowed_uuid_text_defaults = {
  "annual_incentive_ledger",
  "annual_incentive_payout_attempts",
  "annual_incentive_payout_outbox",
  "annual_incentive_payouts",
  "annual_incentive_request_allocations",
  "annual_incentive_requests",
  "annual_incentive_webhook_events",
  "development_jobs",
  "driver_badge_events",
  "driver_payout_destinations",
  "financial_obligation_allocations",
  "financial_obligations",
  "financial_payee_destinations",
  "financial_payees",
  "financial_payment_audit",
  "financial_payout_attempts",
  "financial_payout_outbox",
  "financial_payouts",
  "financial_provider_events",
  "financial_recurring_obligations",
  "knowledge_articles",
}

allowed_add_foreign_keys = set()

statement_re = re.compile(r"(?ms)(.+?;)")
raw_statements = [s.strip() for s in statement_re.findall(text) if s.strip()]

if not raw_statements:
  print("ABORT: drift parser found no SQL statements", file=sys.stderr)
  sys.exit(4)

recognized = []
unknown = []

for stmt in raw_statements:
  clean = re.sub(r"(?m)^--[^\n]*\n", "", stmt).strip()
  if not clean:
    continue

  m = re.match(r'^DROP TABLE\s+"([^"]+)"\s*;$', clean, re.I)
  if m:
    obj = m.group(1)
    if obj in allowed_drop_tables:
      recognized.append(("DROP TABLE", obj))
      continue
    unknown.append(("DROP TABLE", obj, clean))
    continue

  m = re.match(r'^ALTER TABLE\s+"([^"]+)"\s+DROP CONSTRAINT\s+"([^"]+)"\s*;$', clean, re.I)
  if m:
    table_name = m.group(1)
    con_name = m.group(2)
    if con_name in allowed_drop_foreign_keys and table_name in allowed_drop_tables:
      recognized.append(("DROP FOREIGN KEY", f"{table_name}.{con_name}"))
      continue
    unknown.append(("DROP FOREIGN KEY", f"{table_name}.{con_name}", clean))
    continue

  m = re.match(r'^DROP INDEX\s+"([^"]+)"\s*;$', clean, re.I)
  if m:
    obj = m.group(1)
    if obj in allowed_drop_indexes:
      recognized.append(("DROP INDEX", obj))
      continue
    unknown.append(("DROP INDEX", obj, clean))
    continue

  m = re.match(r'^DROP VIEW\s+"([^"]+)"\s*;$', clean, re.I)
  if m:
    obj = m.group(1)
    if obj in allowed_drop_views:
      recognized.append(("DROP VIEW", obj))
      continue
    unknown.append(("DROP VIEW", obj, clean))
    continue

  m = re.match(
    r'^ALTER TABLE\s+"([^"]+)"\s+ALTER COLUMN\s+"id"\s+SET DEFAULT\s+gen_random_uuid\(\)::text(?:,\s*ALTER COLUMN\s+"correlation_id"\s+SET DEFAULT\s+gen_random_uuid\(\)::text)?\s*;$',
    clean,
    re.I | re.S,
  )
  if m:
    table_name = m.group(1)
    if table_name in allowed_uuid_text_defaults:
      recognized.append(("ALTER DEFAULT UUID::TEXT", table_name))
      continue
    unknown.append(("ALTER DEFAULT UUID::TEXT", table_name, clean))
    continue

  m = re.match(r'^ALTER TABLE\s+"([^"]+)"\s+ADD CONSTRAINT\s+"([^"]+)"\s+FOREIGN KEY\s*\(.+\)\s+REFERENCES\s+"[^"]+"\s*\("?[^\)"]+"?\).+;$', clean, re.I | re.S)
  if m:
    table_name = m.group(1)
    con_name = m.group(2)
    key = f"{table_name}.{con_name}"
    if key in allowed_add_foreign_keys:
      recognized.append(("ADD FOREIGN KEY", key))
      continue
    unknown.append(("ADD FOREIGN KEY", key, clean))
    continue

  unknown.append(("UNKNOWN STATEMENT", "n/a", clean))

print(f"DRIFT_STATEMENTS_TOTAL={len(raw_statements)}")
print(f"DRIFT_STATEMENTS_RECOGNIZED={len(recognized)}")
for kind, obj in recognized:
  print(f"DRIFT_ALLOWED::{kind}::{obj}")

if unknown:
  print("DRIFT_VALIDATION_RESULT=ABORT", file=sys.stderr)
  for kind, obj, stmt in unknown:
    print(f"DRIFT_UNKNOWN::{kind}::{obj}", file=sys.stderr)
    print(stmt, file=sys.stderr)
  sys.exit(5)

print("DRIFT_VALIDATION_RESULT=PASS")
PY

  if [[ "${exit_code:-0}" != "0" ]]; then
  fail "unexpected Prisma drift after bootstrap; inspect $drift_file"
  fi
}

TMP_WORK_DIR="$(mktemp -d /tmp/kaviar-dr-prisma-work.XXXXXX)"
trap 'rm -rf "$TMP_WORK_DIR"' EXIT

TMP_SCHEMA_FILE="$TMP_WORK_DIR/schema.prisma"
TMP_MIGRATIONS_DIR="$TMP_WORK_DIR/migrations"

cp "$SCHEMA_FILE" "$TMP_SCHEMA_FILE"
mkdir -p "$TMP_MIGRATIONS_DIR"

while IFS= read -r mig_sql; do
  mig_dir="$(dirname "$mig_sql")"
  mig_name="$(basename "$mig_dir")"
  mkdir -p "$TMP_MIGRATIONS_DIR/$mig_name"
  cp "$mig_sql" "$TMP_MIGRATIONS_DIR/$mig_name/migration.sql"
done < <(find "$MIGRATIONS_DIR" -mindepth 2 -maxdepth 2 -type f -name migration.sql | sort)

[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is required"

PSQL_URL="${DATABASE_URL%%\?*}"

HOST="$(python3 - <<'PY'
import os
from urllib.parse import urlparse
u = urlparse(os.environ['DATABASE_URL'])
print((u.hostname or '').strip())
PY
)"

[[ -n "$HOST" ]] || fail "unable to parse host from DATABASE_URL"

if [[ "$HOST" != "127.0.0.1" && "$HOST" != "localhost" ]]; then
  fail "host must be local (127.0.0.1 or localhost), got: $HOST"
fi

if [[ "$HOST" =~ amazonaws\.com|rds|kaviar ]]; then
  fail "blocked host pattern: $HOST"
fi

echo "Host validated: $HOST"

if [[ "$DRIFT_ONLY" != "1" ]]; then
  USER_TABLE_COUNT="$(psql "$PSQL_URL" -Atqc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name <> '_prisma_migrations';")"
  MIG_TABLE_EXISTS="$(psql "$PSQL_URL" -Atqc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='_prisma_migrations');")"

  [[ "$USER_TABLE_COUNT" == "0" ]] || fail "database is not empty (user tables: $USER_TABLE_COUNT)"
  [[ "$MIG_TABLE_EXISTS" == "f" ]] || fail "_prisma_migrations already exists"

  echo "Database emptiness validated"

  psql "$PSQL_URL" -v ON_ERROR_STOP=1 -f "$PRE_SQL"
  psql "$PSQL_URL" -v ON_ERROR_STOP=1 -f "$BASELINE_SQL"
  psql "$PSQL_URL" -v ON_ERROR_STOP=1 -f "$POST_SQL"

  echo "Bootstrap SQL files applied"

  while IFS= read -r migration; do
    [[ -n "$migration" ]] || continue
    (cd "$ROOT_DIR" && DATABASE_URL="$DATABASE_URL" npx prisma migrate resolve --schema "$TMP_SCHEMA_FILE" --applied "$migration")
  done < "$CUTOFF_FILE"

  echo "Cutoff migrations marked as applied"

  (cd "$ROOT_DIR" && DATABASE_URL="$DATABASE_URL" npx prisma migrate deploy --schema "$TMP_SCHEMA_FILE")
  (cd "$ROOT_DIR" && DATABASE_URL="$DATABASE_URL" npx prisma migrate status --schema "$TMP_SCHEMA_FILE")
fi

DRIFT_FILE="/tmp/kaviar-dr-bootstrap-prisma-diff.sql"
(cd "$ROOT_DIR" && DATABASE_URL="$DATABASE_URL" npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel "$SCHEMA_FILE" --script > "$DRIFT_FILE")

validate_prisma_drift_file "$DRIFT_FILE"

echo "Prisma diff is empty"

IDX1_DEF="$(psql "$PSQL_URL" -Atqc "SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='municipal_regulatory_driver_protocols_case_driver_null_modality';")"
[[ -n "$IDX1_DEF" ]] || fail "missing required index municipal_regulatory_driver_protocols_case_driver_null_modality"
[[ "$IDX1_DEF" == *"driver_id IS NOT NULL"* && "$IDX1_DEF" == *"service_modality IS NULL"* ]] || fail "invalid predicate for municipal_regulatory_driver_protocols_case_driver_null_modality"

IDX2_DEF="$(psql "$PSQL_URL" -Atqc "SELECT indexdef FROM pg_indexes WHERE schemaname='public' AND indexname='municipal_authorizations_open_manual_draft_key';")"
[[ -n "$IDX2_DEF" ]] || fail "missing required index municipal_authorizations_open_manual_draft_key"
[[ "$IDX2_DEF" == *"source_driver_protocol_id IS NULL"* && "$IDX2_DEF" == *"DOCUMENTS_PENDING"* && "$IDX2_DEF" == *"IN_REVIEW_BY_KAVIAR"* && "$IDX2_DEF" == *"READY_FOR_CITY_HALL"* ]] || fail "invalid predicate for municipal_authorizations_open_manual_draft_key"

REQ_TABLES=(
  admin_audit_logs
  admin_login_history
  driver_referral_log
  territory_price_floors
  retorno_familiar_policy
  retorno_familiar_requests
)

for table_name in "${REQ_TABLES[@]}"; do
  table_exists="$(psql "$PSQL_URL" -Atqc "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='${table_name}');")"
  [[ "$table_exists" == "t" ]] || fail "missing required table ${table_name}"
done

REQ_TRIGGERS=(
  update_driver_locations_updated_at
  update_driver_status_updated_at
  update_ride_offers_updated_at
  update_rides_v2_updated_at
  trg_set_updated_at_municipal_authorizations
  trg_set_updated_at_municipal_regulation_requirements
  trg_set_updated_at_municipal_regulations
  set_updated_at_mrcl
  set_updated_at_operational_insurance_coverages
)

for trigger_name in "${REQ_TRIGGERS[@]}"; do
  trigger_exists="$(psql "$PSQL_URL" -Atqc "SELECT EXISTS (SELECT 1 FROM information_schema.triggers WHERE trigger_schema='public' AND trigger_name='${trigger_name}');")"
  [[ "$trigger_exists" == "t" ]] || fail "missing required trigger ${trigger_name}"
done

TPF_STATUS_CHECK="$(psql "$PSQL_URL" -Atqc "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_tpf_status');")"
[[ "$TPF_STATUS_CHECK" == "t" ]] || fail "missing required constraint chk_tpf_status"

echo "Post-prisma required objects validated"

echo "bootstrap success"
