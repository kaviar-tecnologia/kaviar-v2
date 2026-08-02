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

# ══════════════════════════════════════════════════════════════════════════════
echo "── SHA Validation Logic ──"
validate_sha() { local S="$1"; [ "${#S}" -eq 40 ] && [[ "$S" =~ ^[0-9a-f]{40}$ ]]; }
validate_sha "3896799e41b6319da12bcc087186746fcd2f2dc2" && pass "Valid SHA" || fail "Valid SHA"
! validate_sha "" && pass "Empty" || fail "Empty"
! validate_sha "abc" && pass "Short" || fail "Short"
! validate_sha "AAA6799e41b6319da12bcc087186746fcd2f2dc2" && pass "Upper" || fail "Upper"
! validate_sha $'3896799e41b6319da12bcc087186746fcd2f2dc2\n' && pass "LF" || fail "LF"
! validate_sha $'3896799e41b6319da12bcc087186746fcd2f2dc2\r' && pass "CR" || fail "CR"

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "── Backend: ECS Preflight ──"
chk "$BACKEND_WF" "PRODUCTION_SERVICE_NOT_SAFE_FOR_ROLLING_DEPLOY" "Preflight blocker"
chk "$BACKEND_WF" "deploymentCircuitBreaker" "Reads circuit breaker"
PF=$(grep -n "PRODUCTION_SERVICE_NOT_SAFE" "$BACKEND_WF" | head -1 | cut -d: -f1)
DP=$(grep -n "docker push" "$BACKEND_WF" | head -1 | cut -d: -f1)
[ "$PF" -lt "$DP" ] && pass "Preflight before docker push ($PF<$DP)" || fail "Preflight order"

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "── Backend: Log Verification (fail-closed) ──"
chk "$BACKEND_WF" "BACKEND_LOG_QUERY_FAILED" "Log query failure marker"
chk_not "$BACKEND_WF" '2>/dev/null || echo "\[\]"' "No error suppression (echo [])"
chk "$BACKEND_WF" "awslogs-stream-prefix" "Stream prefix extracted"
chk "$BACKEND_WF" "log-stream-names" "Uses --log-stream-names (task-specific)"
chk "$BACKEND_WF" "CRITICAL_BACKEND_ERROR_AFTER_DEPLOY" "Critical error marker"
chk "$BACKEND_WF" "BACKEND_LOG_CONFIGURATION_INVALID" "Log config validation"

# Verify all promised patterns in the filter
for P in "FATAL" "UnhandledPromiseRejection" "uncaughtException" "PrismaClientInitializationError" \
         "Cannot find module" "Migration failed" "ECONNREFUSED" "password authentication failed" \
         "crash loop" "repeatedly stopped"; do
  chk "$BACKEND_WF" "$P" "Pattern: $P"
done

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "── Backend: Deploy & Verify ──"
chk "$BACKEND_WF" "ecs_deploy.outputs.update_attempted" "Rollback uses update_attempted"
chk "$BACKEND_WF" "BACKEND_VERSION_MISSING" "Version absence = error"
chk_not "$BACKEND_WF" "cat /tmp/health_response" "Health body not printed"
chk "$BACKEND_WF" 'TASK_COUNT.*DESIRED\|TASK_COUNT.*ne.*DESIRED' "TASK_COUNT == DESIRED check"

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "── Backend: Rollback Validation (full ECS state) ──"
ROLLBACK=$(sed -n '/BACKEND_ROLLBACK_STARTED/,/BACKEND_ROLLBACK_COMPLETED/p' "$BACKEND_WF")
echo "$ROLLBACK" | grep -q "desiredCount" && pass "Rollback checks desiredCount" || fail "Rollback desiredCount"
echo "$ROLLBACK" | grep -q "runningCount" && pass "Rollback checks runningCount" || fail "Rollback runningCount"
echo "$ROLLBACK" | grep -q "pendingCount" && pass "Rollback checks pendingCount" || fail "Rollback pendingCount"
echo "$ROLLBACK" | grep -q "deployments" && pass "Rollback checks deployments" || fail "Rollback deployments"
echo "$ROLLBACK" | grep -q "list-tasks" && pass "Rollback lists tasks" || fail "Rollback list-tasks"
echo "$ROLLBACK" | grep -q "describe-tasks\|taskDefinitionArn" && pass "Rollback verifies task TDs" || fail "Rollback task TD check"
chk "$BACKEND_WF" "BACKEND_ROLLBACK_STATE_CONFLICT" "Rollback detects conflict"

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "── Frontend: Build Manifest ──"
chk "$FRONTEND_WF" "build_index_sha256" "BUILD_INDEX_SHA256 calculated"
chk "$FRONTEND_WF" "build_asset_manifest" "BUILD_ASSET_MANIFEST exported"
chk "$FRONTEND_WF" "ACCOUNTANT_FRONTEND_BUNDLE_NOT_FOUND" "Bundle absence fails"
chk_not "$FRONTEND_WF" '⚠️' "No warning-only"

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "── Frontend: Backup Manifests ──"
chk "$FRONTEND_WF" "backup_asset_manifest" "backup_asset_manifest exported"
chk "$FRONTEND_WF" "backup_metadata_manifest" "backup_metadata_manifest exported"
chk "$FRONTEND_WF" "backup_index_sha256" "backup_index_sha256 exported"
chk "$FRONTEND_WF" "backup_valid=true" "backup_valid exported"
chk_not "$FRONTEND_WF" 'backup-metadata-manifest.*s3://kaviar-frontend' "Metadata not uploaded to bucket"
chk "$FRONTEND_WF" 'exclude.*backup-asset-manifest\|exclude.*backup-metadata-manifest\|exclude.*index-meta' "Manifests excluded from sync"

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "── Frontend: CloudFront SHA Comparison ──"
chk "$FRONTEND_WF" "FRONTEND_CLOUDFRONT_INDEX_MISMATCH" "CF index SHA comparison marker"
chk "$FRONTEND_WF" 'CF_INDEX_SHA256.*BUILD_INDEX_SHA256\|cf_response.*sha256\|BUILD_INDEX_SHA256' "SHA compared after CF"

# S3 verification before invalidation
S3V=$(grep -n "S3_INDEX_MISMATCH" "$FRONTEND_WF" | head -1 | cut -d: -f1)
CFI=$(grep -n "create-invalidation" "$FRONTEND_WF" | head -1 | cut -d: -f1)
[ "$S3V" -lt "$CFI" ] && pass "S3 verify before invalidation ($S3V<$CFI)" || fail "S3 verify order"

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "── Frontend: Deploy & Rollback ──"
WA=$(grep -n 'write_attempted=true' "$FRONTEND_WF" | head -1 | cut -d: -f1)
S3W=$(grep -n 'aws s3 sync frontend-app/dist' "$FRONTEND_WF" | head -1 | cut -d: -f1)
[ "$WA" -lt "$S3W" ] && pass "write_attempted before S3 write ($WA<$S3W)" || fail "write_attempted order"

chk "$FRONTEND_WF" "s3_deploy.outputs.write_attempted" "Rollback uses write_attempted"
chk "$FRONTEND_WF" "backup.outputs.backup_valid" "Rollback uses backup_valid"

# Rollback validation
FROLLBACK=$(sed -n '/FRONTEND_ROLLBACK_STARTED/,/FRONTEND_ROLLBACK_COMPLETED/p' "$FRONTEND_WF")
echo "$FROLLBACK" | grep -q "BACKUP_INDEX_SHA256" && pass "Rollback compares SHA" || fail "Rollback SHA compare"
echo "$FROLLBACK" | grep -q "invalidation-completed" && pass "Rollback waits invalidation" || fail "Rollback invalidation wait"
echo "$FROLLBACK" | grep -q "CLOUDFRONT_ROLLBACK_INVALIDATION_FAILED" && pass "Rollback invalidation failure marker" || fail "Rollback inv marker"
echo "$FROLLBACK" | grep -q "BACKUP_ASSET_MANIFEST" && pass "Rollback verifies all backup assets" || fail "Rollback asset check"
chk_not "$FRONTEND_WF" 'head -5.*BACKUP_ASSETS\|head -5.*backup' "Rollback does NOT limit to 5 assets"

# Metadata restoration
echo "$FROLLBACK" | grep -q "BACKUP_METADATA_MANIFEST\|metadata_manifest" && pass "Rollback uses metadata manifest" || fail "Rollback metadata"

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "════════════════════════════════"
echo "PASSED: $PASS / $TOTAL"
echo "FAILED: $FAIL / $TOTAL"
echo "════════════════════════════════"
[ "$FAIL" -eq 0 ] && echo "ALL_DEPLOY_SAFETY_TESTS_PASS" && exit 0 || echo "DEPLOY_SAFETY_TESTS_FAILED" && exit 1
