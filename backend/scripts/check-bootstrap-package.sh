#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOOTSTRAP_ROOT="${BOOTSTRAP_ROOT:-$ROOT_DIR/prisma/bootstrap}"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$ROOT_DIR/prisma/migrations}"
BOOTSTRAP_DIR_OVERRIDE="${BOOTSTRAP_DIR:-}"

if [[ -n "$BOOTSTRAP_DIR_OVERRIDE" ]]; then
  LATEST_BOOTSTRAP_DIR="$BOOTSTRAP_DIR_OVERRIDE"
else
  LATEST_BOOTSTRAP_DIR="$(find "$BOOTSTRAP_ROOT" -mindepth 1 -maxdepth 1 -type d -name '*_current' | sort | tail -n 1)"
fi

[[ -n "${LATEST_BOOTSTRAP_DIR:-}" ]] || {
  echo "ABORT: no *_current bootstrap directory found in $BOOTSTRAP_ROOT" >&2
  exit 1
}
[[ -d "$LATEST_BOOTSTRAP_DIR" ]] || {
  echo "ABORT: bootstrap directory not found: $LATEST_BOOTSTRAP_DIR" >&2
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

TMP_ALL="$(mktemp /tmp/kaviar-bootstrap-all-migrations.XXXXXX)"
TMP_CUTOFF="$(mktemp /tmp/kaviar-bootstrap-cutoff.XXXXXX)"
trap 'rm -f "$TMP_ALL" "$TMP_CUTOFF"' EXIT

find "$MIGRATIONS_DIR" -mindepth 2 -maxdepth 2 -type f -name migration.sql \
  | { grep -E '/[0-9]{8}[^/]*/migration.sql$' || true; } \
  | sort \
  | while IFS= read -r p; do basename "$(dirname "$p")"; done > "$TMP_ALL"

{ grep -E '^[[:space:]]*[0-9]{8}[^[:space:]]*[[:space:]]*$' "$CUTOFF_FILE" || true; } \
  | sed 's/^[[:space:]]*//; s/[[:space:]]*$//' > "$TMP_CUTOFF"

ALL_COUNT="$(wc -l < "$TMP_ALL" | tr -d ' ')"
CUTOFF_COUNT="$(wc -l < "$TMP_CUTOFF" | tr -d ' ')"

[[ "$ALL_COUNT" -gt 0 ]] || {
  echo "ABORT: no timestamped migration.sql found" >&2
  exit 1
}
[[ "$CUTOFF_COUNT" -gt 0 ]] || {
  echo "ABORT: cutoff has no timestamped entries: $CUTOFF_FILE" >&2
  exit 1
}

while IFS= read -r cutoff_entry; do
  if ! grep -Fxq "$cutoff_entry" "$TMP_ALL"; then
    echo "ABORT: cutoff contains unknown migration: $cutoff_entry" >&2
    exit 1
  fi
done < "$TMP_CUTOFF"

index=1
while IFS= read -r cutoff_entry; do
  expected_entry="$(sed -n "${index}p" "$TMP_ALL")"
  if [[ "$cutoff_entry" != "$expected_entry" ]]; then
    echo "ABORT: cutoff is not a continuous prefix at line $index (expected '$expected_entry', got '$cutoff_entry')" >&2
    exit 1
  fi
  index=$((index + 1))
done < "$TMP_CUTOFF"

LAST_CUTOFF_ENTRY="$(tail -n 1 "$TMP_CUTOFF")"
LATEST_TIMESTAMP_MIGRATION="$(tail -n 1 "$TMP_ALL")"

POST_CUTOFF_TIMESTAMPED_COUNT=$((ALL_COUNT - CUTOFF_COUNT))
POST_CUTOFF_TMP="$(mktemp /tmp/kaviar-bootstrap-post-cutoff.XXXXXX)"
trap 'rm -f "$TMP_ALL" "$TMP_CUTOFF" "$POST_CUTOFF_TMP"' EXIT
if [[ "$POST_CUTOFF_TIMESTAMPED_COUNT" -gt 0 ]]; then
  sed -n "$((CUTOFF_COUNT + 1)),\$p" "$TMP_ALL" > "$POST_CUTOFF_TMP"
else
  : > "$POST_CUTOFF_TMP"
fi

POST_CUTOFF_COUNT="$(find "$MIGRATIONS_DIR" -mindepth 2 -maxdepth 2 -type f -name migration.sql | { grep -Ev '/[0-9]{8}[^/]*/migration.sql$' || true; } | wc -l | tr -d ' ')"

echo "validate-bootstrap-package: PASS"
echo "bootstrap_dir=$LATEST_BOOTSTRAP_DIR"
echo "cutoff_last_migration=$LAST_CUTOFF_ENTRY"
echo "latest_timestamp_migration=$LATEST_TIMESTAMP_MIGRATION"
echo "post_cutoff_timestamped_migration_count=$POST_CUTOFF_TIMESTAMPED_COUNT"
echo "post_cutoff_timestamped_migrations=$(tr '\n' ',' < "$POST_CUTOFF_TMP" | sed 's/,$//')"
echo "post_cutoff_non_timestamp_migration_sql_count=$POST_CUTOFF_COUNT"
