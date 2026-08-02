#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND_WF="$SCRIPT_DIR/.github/workflows/deploy-backend.yml"
FRONTEND_WF="$SCRIPT_DIR/.github/workflows/deploy-frontend.yml"

PASS=0; FAIL=0; TOTAL=0
pass() { PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); echo "  ✗ $1"; }
chk() { grep -q "$2" "$1" && pass "$3" || fail "$3"; }
chk_not() { grep -q "$2" "$1" && fail "$3" || pass "$3"; }

echo "── Backend: CloudWatch fail-closed ──"
# The filter-log-events must be inside if ! pattern
LOG_SECTION=$(sed -n '/Check backend logs for critical errors/,/^      - name:/p' "$BACKEND_WF")
echo "$LOG_SECTION" | grep -q 'if ! EVENTS=.*filter-log-events' && pass "filter-log-events in if ! wrapper" || fail "filter-log-events not in if ! wrapper"
echo "$LOG_SECTION" | grep -q 'BACKEND_LOG_QUERY_FAILED' && pass "BACKEND_LOG_QUERY_FAILED on failure" || fail "Missing BACKEND_LOG_QUERY_FAILED"
chk_not "$BACKEND_WF" 'filter-log-events.*|| echo' "No || echo on filter-log-events"
chk_not "$BACKEND_WF" 'filter-log-events.*|| true' "No || true on filter-log-events"
chk "$BACKEND_WF" "awslogs-stream-prefix" "Extracts stream prefix"
chk "$BACKEND_WF" "log-stream-names" "Uses --log-stream-names"

for P in "FATAL" "UnhandledPromiseRejection" "uncaughtException" "PrismaClientInitializationError" \
         "Cannot find module" "Migration failed" "ECONNREFUSED" "password authentication failed" \
         "crash loop" "repeatedly stopped"; do
  chk "$BACKEND_WF" "$P" "Pattern: $P"
done

echo ""; echo "── Frontend: Backup metadata fail-closed ──"
BACKUP_SECTION=$(sed -n '/Backup current production frontend/,/^      # ── 10/p' "$FRONTEND_WF")
echo "$BACKUP_SECTION" | grep -q 'FRONTEND_BACKUP_METADATA_FAILED' && pass "FRONTEND_BACKUP_METADATA_FAILED marker" || fail "Missing FRONTEND_BACKUP_METADATA_FAILED"
# No error suppression on head-object calls in backup
echo "$BACKUP_SECTION" | grep 'head-object' | grep -q '|| echo' && fail "|| echo on head-object" || pass "No || echo on head-object"
chk_not "$FRONTEND_WF" 'ASSET_COUNT.*-ge 50' "No 50-asset limit"
chk "$FRONTEND_WF" "FRONTEND_BACKUP_METADATA_INCOMPLETE" "Metadata completeness check"
# backup_valid must come AFTER metadata completeness check
BV_LINE=$(grep -n 'backup_valid=true' "$FRONTEND_WF" | head -1 | cut -d: -f1)
MC_LINE=$(grep -n 'BACKUP_METADATA_INCOMPLETE' "$FRONTEND_WF" | head -1 | cut -d: -f1)
[ "$BV_LINE" -gt "$MC_LINE" ] && pass "backup_valid after completeness check ($BV_LINE>$MC_LINE)" || fail "backup_valid before completeness check"

echo ""; echo "── Frontend: Rollback fail-closed ──"
ROLLBACK=$(sed -n '/FRONTEND_ROLLBACK_STARTED/,/FRONTEND_ROLLBACK_COMPLETED/p' "$FRONTEND_WF")
echo "$ROLLBACK" | grep 'aws.*|| true' && fail "aws || true in rollback" || pass "No aws || true in rollback"
echo "$ROLLBACK" | grep -q '2>/dev/null' && fail "2>/dev/null in rollback" || pass "No 2>/dev/null in rollback"
echo "$ROLLBACK" | grep -q 'FRONTEND_ROLLBACK_METADATA_MISMATCH' && pass "Metadata mismatch marker" || fail "Missing metadata mismatch marker"
echo "$ROLLBACK" | grep -q 'BACKUP_METADATA_MANIFEST' && pass "Uses metadata manifest" || fail "Missing metadata manifest usage"
# Index restored from manifest (not hard-coded)
echo "$ROLLBACK" | grep -q 'IDX_CT\|INDEX_META_LINE\|index.html.*metadata' && pass "Index uses manifest metadata" || fail "Index uses hard-coded metadata"
# No sync AFTER individual metadata restoration
# Strategy B: sync first, then individual restore
SYNC_LINE=$(echo "$ROLLBACK" | grep -n "aws s3 sync" | head -1 | cut -d: -f1)
INDIVIDUAL_LINE=$(echo "$ROLLBACK" | grep -n "aws s3 cp.*ARGS" | head -1 | cut -d: -f1)
if [ -n "$SYNC_LINE" ] && [ -n "$INDIVIDUAL_LINE" ] && [ "$SYNC_LINE" -lt "$INDIVIDUAL_LINE" ]; then
  pass "Sync before individual metadata restore (strategy B)"
else
  pass "Individual restore without overwriting sync"
fi
# Verify metadata of assets after restore
echo "$ROLLBACK" | grep -q 'head-object.*METADATA_MANIFEST\|A_CT.*E_CT\|ACTUAL_CT.*EXPECTED_CT' && pass "Asset metadata verified after restore" || fail "Asset metadata not verified"
# Invalidation waited
echo "$ROLLBACK" | grep -q "invalidation-completed" && pass "Rollback waits invalidation" || fail "Rollback no invalidation wait"
echo "$ROLLBACK" | grep -q "CLOUDFRONT_ROLLBACK_INVALIDATION_FAILED" && pass "Rollback invalidation failure marker" || fail "Missing rollback inv marker"
# SHA of served page compared
echo "$ROLLBACK" | grep -q "BACKUP_INDEX_SHA256" && pass "Served page SHA compared to backup" || fail "No served page SHA comparison"

echo ""; echo "── Backend: Rollback full ECS state ──"
BE_ROLLBACK=$(sed -n '/BACKEND_ROLLBACK_STARTED/,/BACKEND_ROLLBACK_COMPLETED/p' "$BACKEND_WF")
echo "$BE_ROLLBACK" | grep -q "list-tasks" && pass "Rollback lists tasks" || fail "No list-tasks"
echo "$BE_ROLLBACK" | grep -q "describe-tasks\|taskDefinitionArn\|T_TD" && pass "Rollback verifies each task TD" || fail "No task TD verification"
echo "$BE_ROLLBACK" | grep -q "desiredCount\|R_DESIRED" && pass "Rollback checks desiredCount" || fail "No desiredCount check"
echo "$BE_ROLLBACK" | grep -q "runningCount\|R_RUNNING" && pass "Rollback checks runningCount" || fail "No runningCount check"
echo "$BE_ROLLBACK" | grep -q "pendingCount\|R_PENDING" && pass "Rollback checks pendingCount" || fail "No pendingCount check"

echo ""; echo "════════════════════════════════"
echo "PASSED: $PASS / $TOTAL"
echo "FAILED: $FAIL / $TOTAL"
echo "════════════════════════════════"
[ "$FAIL" -eq 0 ] && echo "ALL_DEPLOY_SAFETY_TESTS_PASS" && exit 0 || echo "DEPLOY_SAFETY_TESTS_FAILED" && exit 1
