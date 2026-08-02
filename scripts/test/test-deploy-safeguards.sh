#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND_WF="$SCRIPT_DIR/.github/workflows/deploy-backend.yml"
FRONTEND_WF="$SCRIPT_DIR/.github/workflows/deploy-frontend.yml"

PASS=0; FAIL=0; TOTAL=0
pass() { PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); echo "  ✗ $1"; }

chk() { if grep -q "$2" "$1"; then pass "$3"; else fail "$3"; fi; }
chk_not() { if grep -q "$2" "$1"; then fail "$3"; else pass "$3"; fi; }

# ══════════════════════════════════════════════════════════════════════════════
echo "── SHA Validation Logic ──"
validate_sha() {
  local S="$1"
  [ "${#S}" -eq 40 ] && [[ "$S" =~ ^[0-9a-f]{40}$ ]]
}
validate_sha "3896799e41b6319da12bcc087186746fcd2f2dc2" && pass "Valid SHA" || fail "Valid SHA"
! validate_sha "" && pass "Empty" || fail "Empty"
! validate_sha "abc" && pass "Short" || fail "Short"
! validate_sha "3896799E41B6319DA12BCC087186746FCD2F2DC2" && pass "Upper" || fail "Upper"
! validate_sha $'3896799e41b6319da12bcc087186746fcd2f2dc2\n' && pass "LF" || fail "LF"
! validate_sha $'3896799e41b6319da12bcc087186746fcd2f2dc2\r' && pass "CR" || fail "CR"
! validate_sha "3896799e41b6319da12bcc087186746fcd2f2dc2 " && pass "Space" || fail "Space"

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "── Backend YAML: ECS Preflight ──"
chk "$BACKEND_WF" "PRODUCTION_SERVICE_NOT_SAFE_FOR_ROLLING_DEPLOY" "Preflight blocker marker"
chk "$BACKEND_WF" "desiredCount" "Reads desiredCount"
chk "$BACKEND_WF" "minimumHealthyPercent" "Reads minimumHealthyPercent"
chk "$BACKEND_WF" "maximumPercent" "Reads maximumPercent"
chk "$BACKEND_WF" "deploymentCircuitBreaker" "Reads circuit breaker"

PF=$(grep -n "PRODUCTION_SERVICE_NOT_SAFE" "$BACKEND_WF" | head -1 | cut -d: -f1)
DP=$(grep -n "docker push" "$BACKEND_WF" | head -1 | cut -d: -f1)
[ "$PF" -lt "$DP" ] && pass "Preflight before docker push ($PF<$DP)" || fail "Preflight order"

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "── Backend YAML: Deploy & Rollback ──"
chk "$BACKEND_WF" "ecs_deploy.outputs.update_attempted" "Rollback uses update_attempted"
chk_not "$BACKEND_WF" "register_task.outputs.task_revision != ''" "No old rollback condition"
chk "$BACKEND_WF" "BACKEND_VERSION_MISSING" "Version absence is error"
chk "$BACKEND_WF" "BACKEND_ROLLBACK_STATE_CONFLICT" "Rollback detects conflict"
chk "$BACKEND_WF" "BACKEND_ROLLBACK_NOT_REQUIRED" "Rollback detects already-previous"
chk "$BACKEND_WF" "deploy_started_at_ms" "Deploy timestamp captured"
chk_not "$BACKEND_WF" "cat /tmp/health_response" "Health body not printed"

# Task count compared to desired
chk "$BACKEND_WF" 'TASK_COUNT.*DESIRED\|TASK_COUNT.*ne.*DESIRED' "TASK_COUNT compared to DESIRED"

# Rollback validates full service state
ROLLBACK_SECTION=$(sed -n '/BACKEND_ROLLBACK_STARTED/,/BACKEND_ROLLBACK_COMPLETED/p' "$BACKEND_WF")
echo "$ROLLBACK_SECTION" | grep -q "desiredCount\|describe-services" && pass "Rollback checks service" || fail "Rollback service check"
echo "$ROLLBACK_SECTION" | grep -q "version\|PRODUCTION_SHA" && pass "Rollback validates version" || fail "Rollback version"

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "── Backend YAML: Log Verification ──"
chk "$BACKEND_WF" "filter-log-events" "CloudWatch log query exists"
chk "$BACKEND_WF" "DEPLOY_STARTED_MS\|deploy_started_at_ms" "Log uses deploy timestamp"
chk "$BACKEND_WF" "CRITICAL_BACKEND_ERROR_AFTER_DEPLOY" "Critical log marker"
chk "$BACKEND_WF" "BACKEND_LOG_CONFIGURATION_INVALID" "Log config validation"
chk "$BACKEND_WF" "awslogs-group" "Extracts log group"

# Critical patterns present
for P in "FATAL" "UnhandledPromiseRejection" "PrismaClientInitializationError" "ECONNREFUSED"; do
  chk "$BACKEND_WF" "$P" "Pattern: $P"
done

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "── Frontend YAML: Build Manifest ──"
chk "$FRONTEND_WF" "build_index_sha256" "BUILD_INDEX_SHA256 calculated"
chk "$FRONTEND_WF" "build_asset_manifest" "BUILD_ASSET_MANIFEST exported"
chk "$FRONTEND_WF" "ACCOUNTANT_FRONTEND_BUNDLE_NOT_FOUND" "Bundle absence fails"
chk_not "$FRONTEND_WF" '⚠️' "No warning-only patterns"

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "── Frontend YAML: S3 Verification ──"
chk "$FRONTEND_WF" "FRONTEND_S3_INDEX_MISMATCH" "S3 index SHA comparison"
chk "$FRONTEND_WF" "FRONTEND_S3_ASSET_MISSING" "S3 asset check marker"
chk "$FRONTEND_WF" "FRONTEND_INDEX_METADATA_INVALID" "Index metadata validation"
chk "$FRONTEND_WF" "BUILD_INDEX_SHA256" "Uses build SHA to compare"

# Verify S3 index is downloaded and compared BEFORE invalidation
S3_VERIFY=$(grep -n "S3_INDEX_MISMATCH" "$FRONTEND_WF" | head -1 | cut -d: -f1)
CF_INV=$(grep -n "create-invalidation" "$FRONTEND_WF" | head -1 | cut -d: -f1)
[ "$S3_VERIFY" -lt "$CF_INV" ] && pass "S3 verify before CloudFront ($S3_VERIFY<$CF_INV)" || fail "S3 verify order"

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "── Frontend YAML: CloudFront ──"
chk "$FRONTEND_WF" "invalidation-completed" "Invalidation waited (normal)"
chk "$FRONTEND_WF" "FRONTEND_ASSET_VALIDATION_FAILED" "Asset validation marker"
chk "$FRONTEND_WF" "FRONTEND_EXPECTED_ASSET_NOT_PUBLISHED" "Expected asset marker"
chk "$FRONTEND_WF" "FRONTEND_HTTP_SMOKE_TEST_FAILED" "Smoke test marker"

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "── Frontend YAML: Backup ──"
chk "$FRONTEND_WF" "backup_valid=true" "backup_valid exported"
chk "$FRONTEND_WF" "backup_index_sha256" "backup_index_sha256 calculated"
chk "$FRONTEND_WF" "FRONTEND_BACKUP_INVALID" "Backup validation marker"

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "── Frontend YAML: Deploy & Rollback ──"
WA=$(grep -n 'write_attempted=true' "$FRONTEND_WF" | head -1 | cut -d: -f1)
S3W=$(grep -n 'aws s3 sync frontend-app/dist' "$FRONTEND_WF" | head -1 | cut -d: -f1)
[ "$WA" -lt "$S3W" ] && pass "write_attempted before S3 write ($WA<$S3W)" || fail "write_attempted order"

chk "$FRONTEND_WF" "s3_deploy.outputs.write_attempted" "Rollback uses write_attempted"
chk "$FRONTEND_WF" "backup.outputs.backup_valid" "Rollback uses backup_valid"
chk_not "$FRONTEND_WF" '.index-meta.json.*s3://kaviar-frontend' "Manifest not uploaded"
chk "$FRONTEND_WF" 'exclude.*index-meta' "Manifest excluded from sync"

# Rollback SHA comparison
chk "$FRONTEND_WF" "BACKUP_INDEX_SHA256" "Rollback compares backup SHA"

# Rollback invalidation waited
ROLLBACK_FE=$(sed -n '/FRONTEND_ROLLBACK_STARTED/,/FRONTEND_ROLLBACK_COMPLETED/p' "$FRONTEND_WF")
echo "$ROLLBACK_FE" | grep -q "invalidation-completed" && pass "Rollback waits invalidation" || fail "Rollback invalidation wait"
echo "$ROLLBACK_FE" | grep -q "assets" && pass "Rollback validates assets" || fail "Rollback asset validation"

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "════════════════════════════════"
echo "PASSED: $PASS / $TOTAL"
echo "FAILED: $FAIL / $TOTAL"
echo "════════════════════════════════"
[ "$FAIL" -eq 0 ] && echo "ALL_DEPLOY_SAFETY_TESTS_PASS" && exit 0 || echo "DEPLOY_SAFETY_TESTS_FAILED" && exit 1
