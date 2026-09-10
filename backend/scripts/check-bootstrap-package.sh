#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOOTSTRAP_ROOT="$ROOT_DIR/prisma/bootstrap"
MIGRATIONS_DIR="$ROOT_DIR/prisma/migrations"

LATEST_BOOTSTRAP_DIR="$(find "$BOOTSTRAP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '*_current' | sort | tail -n 1)"
[[ -n "${LATEST_BOOTSTRAP_DIR:-}" ]] || {
  echo "ABORT: no *_current bootstrap directory found in $BOOTSTRAP_ROOT" >&2
  exit 1
}

CUTOFF_FILE="$LATEST_BOOTSTRAP_DIR/migration-cutoff.txt"
BASELINE_FILE="$LATEST_BOOTSTRAP_DIR/baseline.sql"

[[ -f "$CUTOFF_FILE" ]] || {
  echo "ABORT: cutoff file not found: $CUTOFF_FILE" >&2
  exit 1
}
[[ -f "$BASELINE_FILE" ]] || {
  echo "ABORT: baseline file not found: $BASELINE_FILE" >&2
  exit 1
}

LATEST_TIMESTAMP_MIGRATION="$(find "$MIGRATIONS_DIR" -mindepth 2 -maxdepth 2 -type f -name migration.sql | grep -E '/[0-9]{8}[^/]*/migration.sql$' | sort | while IFS= read -r p; do basename "$(dirname "$p")"; done | tail -n 1)"
[[ -n "${LATEST_TIMESTAMP_MIGRATION:-}" ]] || {
  echo "ABORT: no timestamped migration.sql found" >&2
  exit 1
}

LAST_CUTOFF_ENTRY="$(tail -n 1 "$CUTOFF_FILE")"
[[ "$LAST_CUTOFF_ENTRY" == "$LATEST_TIMESTAMP_MIGRATION" ]] || {
  echo "ABORT: cutoff mismatch. expected last entry '$LATEST_TIMESTAMP_MIGRATION' but got '$LAST_CUTOFF_ENTRY'" >&2
  exit 1
}

TMP_EXPECTED="$(mktemp /tmp/kaviar-bootstrap-cutoff-expected.XXXXXX)"
trap 'rm -f "$TMP_EXPECTED"' EXIT

find "$MIGRATIONS_DIR" -mindepth 2 -maxdepth 2 -type f -name migration.sql | grep -E '/[0-9]{8}[^/]*/migration.sql$' | sort | while IFS= read -r p; do basename "$(dirname "$p")"; done > "$TMP_EXPECTED"

diff -u "$TMP_EXPECTED" "$CUTOFF_FILE" >/dev/null || {
  echo "ABORT: cutoff entries diverge from timestamped migration.sql directories" >&2
  exit 1
}

POST_CUTOFF_COUNT="$(find "$MIGRATIONS_DIR" -mindepth 2 -maxdepth 2 -type f -name migration.sql | grep -Ev '/[0-9]{8}[^/]*/migration.sql$' | wc -l | tr -d ' ')"

echo "validate-bootstrap-package: PASS"
echo "bootstrap_dir=$LATEST_BOOTSTRAP_DIR"
echo "latest_timestamp_migration=$LATEST_TIMESTAMP_MIGRATION"
echo "post_cutoff_non_timestamp_migration_sql_count=$POST_CUTOFF_COUNT"
