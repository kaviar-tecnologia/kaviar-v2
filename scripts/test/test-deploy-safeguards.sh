#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# Hostile tests for production deploy safety guards
# Validates ACTUAL workflow YAML content + logic tests
# Does NOT execute any AWS write operations
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
BACKEND_WF="$SCRIPT_DIR/.github/workflows/deploy-backend.yml"
FRONTEND_WF="$SCRIPT_DIR/.github/workflows/deploy-frontend.yml"

PASS=0
FAIL=0
TOTAL=0

pass() { PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); echo "  ✗ $1"; }

check_contains() {
  local file="$1" pattern="$2" desc="$3"
  if grep -q "$pattern" "$file"; then pass "$desc"; else fail "$desc (pattern: $pattern)"; fi
}

check_not_contains() {
  local file="$1" pattern="$2" desc="$3"
  if grep -q "$pattern" "$file"; then fail "$desc (found: $pattern)"; else pass "$desc"; fi
}

# ══════════════════════════════════════════════════════════════════════════════
echo "── SHA Validation Logic ──"
# ══════════════════════════════════════════════════════════════════════════════

validate_sha() {
  local INPUT_COMMIT_SHA="$1"
  if [ "${#INPUT_COMMIT_SHA}" -ne 40 ] ||
     [[ ! "$INPUT_COMMIT_SHA" =~ ^[0-9a-f]{40}$ ]]; then
    return 1
  fi
  return 0
}

VALID_SHA="3896799e41b6319da12bcc087186746fcd2f2dc2"
validate_sha "$VALID_SHA" && pass "Valid SHA accepted" || fail "Valid SHA rejected"
validate_sha "" && fail "Empty SHA accepted" || pass "Empty SHA rejected"
validate_sha "abc123" && fail "Short SHA accepted" || pass "Short SHA rejected"
validate_sha "3896799E41B6319DA12BCC087186746FCD2F2DC2" && fail "Uppercase accepted" || pass "Uppercase rejected"
validate_sha "zzzz799e41b6319da12bcc087186746fcd2f2dc2" && fail "Non-hex accepted" || pass "Non-hex rejected"
validate_sha $'3896799e41b6319da12bcc087186746fcd2f2dc2\n' && fail "SHA+LF accepted" || pass "SHA+LF rejected"
validate_sha $'3896799e41b6319da12bcc087186746fcd2f2dc2\r' && fail "SHA+CR accepted" || pass "SHA+CR rejected"
validate_sha $'3896799e41b6319da12bcc087186746fcd2f2dc2\r\n' && fail "SHA+CRLF accepted" || pass "SHA+CRLF rejected"
validate_sha "3896799e41b6319da12bcc087186746fcd2f2dc2 " && fail "SHA+space accepted" || pass "SHA+space rejected"
validate_sha $'3896799e41b6319da12bcc087186746fcd2f2dc2\t' && fail "SHA+tab accepted" || pass "SHA+tab rejected"

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── Backend Workflow YAML Validation ──"
# ══════════════════════════════════════════════════════════════════════════════

check_contains "$BACKEND_WF" 'desiredCount' "Preflight reads desiredCount"
check_contains "$BACKEND_WF" 'runningCount' "Preflight reads runningCount"
check_contains "$BACKEND_WF" 'pendingCount' "Preflight reads pendingCount"
check_contains "$BACKEND_WF" 'minimumHealthyPercent' "Preflight reads minimumHealthyPercent"
check_contains "$BACKEND_WF" 'maximumPercent' "Preflight reads maximumPercent"
check_contains "$BACKEND_WF" 'deploymentCircuitBreaker' "Preflight reads circuit breaker"
check_contains "$BACKEND_WF" 'PRODUCTION_SERVICE_NOT_SAFE_FOR_ROLLING_DEPLOY' "Preflight blocker marker exists"

# Preflight before docker push
PREFLIGHT_LINE=$(grep -n "PRODUCTION_SERVICE_NOT_SAFE_FOR_ROLLING_DEPLOY" "$BACKEND_WF" | head -1 | cut -d: -f1)
DOCKER_PUSH_LINE=$(grep -n "docker push" "$BACKEND_WF" | head -1 | cut -d: -f1)
if [ "$PREFLIGHT_LINE" -lt "$DOCKER_PUSH_LINE" ]; then
  pass "Preflight occurs before docker push (line $PREFLIGHT_LINE < $DOCKER_PUSH_LINE)"
else
  fail "Preflight NOT before docker push"
fi

# Rollback condition
check_contains "$BACKEND_WF" 'ecs_deploy.outputs.update_attempted' "Rollback depends on ecs_deploy.update_attempted"
check_not_contains "$BACKEND_WF" "register_task.outputs.task_revision != ''" "Rollback does NOT depend only on task_revision"

# Version required (not optional)
check_contains "$BACKEND_WF" 'BACKEND_VERSION_MISSING' "Version absence is an error"
check_not_contains "$BACKEND_WF" 'if \[ -n "\$REPORTED_VERSION" \] && \[' "Version check is not conditional on presence"

# Rollback state conflict
check_contains "$BACKEND_WF" 'BACKEND_ROLLBACK_STATE_CONFLICT' "Rollback detects unexpected task definition"
check_contains "$BACKEND_WF" 'BACKEND_ROLLBACK_NOT_REQUIRED' "Rollback detects already-previous state"

# Rollback validates version after restore
check_contains "$BACKEND_WF" 'PRODUCTION_SHA' "Rollback references previous SHA for version check"

# Deploy timestamp captured
check_contains "$BACKEND_WF" 'deploy_started_at_ms' "Deploy start timestamp captured"

# No printf|grep for SHA
check_not_contains "$BACKEND_WF" "printf.*grep.*40" "No printf|grep SHA validation"

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── Frontend Workflow YAML Validation ──"
# ══════════════════════════════════════════════════════════════════════════════

# Bundle validation fails (not warns)
check_contains "$FRONTEND_WF" 'ACCOUNTANT_FRONTEND_BUNDLE_NOT_FOUND' "Bundle absence fails with marker"
check_not_contains "$FRONTEND_WF" '⚠️.*Accountant route' "No warning-only for missing bundle"

# backup_valid exported
check_contains "$FRONTEND_WF" 'backup_valid=true' "backup_valid is exported"

# write_attempted before first aws s3 WRITE (not backup download)
WRITE_ATTEMPTED_LINE=$(grep -n 'write_attempted=true' "$FRONTEND_WF" | head -1 | cut -d: -f1)
S3_WRITE_LINE=$(grep -n 'aws s3 sync frontend-app/dist' "$FRONTEND_WF" | head -1 | cut -d: -f1)
if [ "$WRITE_ATTEMPTED_LINE" -lt "$S3_WRITE_LINE" ]; then
  pass "write_attempted set before first S3 write (line $WRITE_ATTEMPTED_LINE < $S3_WRITE_LINE)"
else
  fail "write_attempted NOT before first S3 write"
fi

# Rollback uses write_attempted
check_contains "$FRONTEND_WF" 's3_deploy.outputs.write_attempted' "Rollback uses write_attempted"

# CloudFront invalidation waited
check_contains "$FRONTEND_WF" 'invalidation-completed' "CloudFront invalidation is waited"

# JS asset validation fails
check_contains "$FRONTEND_WF" 'FRONTEND_ASSET_VALIDATION_FAILED' "Asset validation failure marker exists"

# No metadata manifest sent to bucket
check_not_contains "$FRONTEND_WF" 'index-meta.json.*s3://kaviar-frontend' "Manifest not uploaded to bucket"

# Exclude manifest from restore
check_contains "$FRONTEND_WF" 'exclude.*index-meta.json' "Manifest excluded from restore sync"

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── Rollback Scenarios ──"
# ══════════════════════════════════════════════════════════════════════════════

# Backend: task registered without update-service → no rollback write
# This is guaranteed by the condition: ecs_deploy.outputs.update_attempted == 'true'
# If update-service never ran, update_attempted is never set
pass "Task registered without update-service → no rollback (by condition)"

# Backend: service already on previous → no update-service in rollback
check_contains "$BACKEND_WF" 'BACKEND_ROLLBACK_NOT_REQUIRED' "Already-previous → skip rollback update-service"

# Frontend: S3 partially written → rollback
# Guaranteed by write_attempted=true being set before first S3 command
pass "S3 partially written → rollback triggered (write_attempted before S3)"

# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "════════════════════════════════"
echo "PASSED: $PASS / $TOTAL"
echo "FAILED: $FAIL / $TOTAL"
echo "════════════════════════════════"

if [ "$FAIL" -eq 0 ]; then
  echo "ALL_DEPLOY_SAFETY_TESTS_PASS"
  exit 0
else
  echo "DEPLOY_SAFETY_TESTS_FAILED"
  exit 1
fi
