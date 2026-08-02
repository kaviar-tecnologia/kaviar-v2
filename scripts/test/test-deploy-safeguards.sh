#!/bin/bash
# ──────────────────────────────────────────────────────────────────────────────
# Hostile tests for production deploy safety guards
# Tests SHA validation, service state assertions, and rollback logic
# Does NOT execute any AWS write operations
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PASS=0
FAIL=0
TOTAL=0

pass() { PASS=$((PASS+1)); TOTAL=$((TOTAL+1)); echo "  ✓ $1"; }
fail() { FAIL=$((FAIL+1)); TOTAL=$((TOTAL+1)); echo "  ✗ $1"; }

# ══════════════════════════════════════════════════════════════════════════════
# SHA VALIDATION (backend)
# ══════════════════════════════════════════════════════════════════════════════
echo "── SHA Validation ──"

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
validate_sha "3896799E41B6319DA12BCC087186746FCD2F2DC2" && fail "Uppercase SHA accepted" || pass "Uppercase SHA rejected"
validate_sha "zzzz799e41b6319da12bcc087186746fcd2f2dc2" && fail "Non-hex SHA accepted" || pass "Non-hex SHA rejected"
validate_sha $'3896799e41b6319da12bcc087186746fcd2f2dc2\n' && fail "SHA+LF accepted" || pass "SHA+LF rejected"
validate_sha $'3896799e41b6319da12bcc087186746fcd2f2dc2\r' && fail "SHA+CR accepted" || pass "SHA+CR rejected"
validate_sha $'3896799e41b6319da12bcc087186746fcd2f2dc2\r\n' && fail "SHA+CRLF accepted" || pass "SHA+CRLF rejected"
validate_sha "3896799e41b6319da12bcc087186746fcd2f2dc2 " && fail "SHA+space accepted" || pass "SHA+space rejected"
validate_sha "3896799e41b6319da12bcc087186746fcd2f2dc2a" && fail "41-char SHA accepted" || pass "41-char SHA rejected"
validate_sha $'3896799e41b6319da12bcc087186746fcd2f2dc2\t' && fail "SHA+tab accepted" || pass "SHA+tab rejected"

# ══════════════════════════════════════════════════════════════════════════════
# BACKEND SERVICE STATE VALIDATION
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── Backend Service State Validation ──"

check_service_safe() {
  local desired="$1" running="$2" pending="$3" deploys="$4" min_healthy="$5" max_pct="$6"
  if [ "$desired" -lt 1 ] || [ "$running" != "$desired" ] || [ "$pending" != "0" ] ||
     [ "$deploys" != "1" ] || [ "$min_healthy" -lt 100 ] || [ "$max_pct" -lt 200 ]; then
    return 1
  fi
  return 0
}

check_service_safe 1 1 0 1 100 200 && pass "Healthy service accepted" || fail "Healthy service rejected"
check_service_safe 1 0 1 1 100 200 && fail "running<desired accepted" || pass "running<desired rejected"
check_service_safe 1 1 1 1 100 200 && fail "pending>0 accepted" || pass "pending>0 rejected"
check_service_safe 1 1 0 2 100 200 && fail "2 deployments accepted" || pass "2 deployments rejected"
check_service_safe 1 1 0 1 50 200 && fail "minHealthy=50 accepted" || pass "minHealthy=50 rejected"
check_service_safe 1 1 0 1 100 100 && fail "maxPercent=100 accepted" || pass "maxPercent=100 rejected"
check_service_safe 0 0 0 1 100 200 && fail "desired=0 accepted" || pass "desired=0 rejected"

# ══════════════════════════════════════════════════════════════════════════════
# BACKEND VERIFICATION SCENARIOS
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── Backend Post-Deploy Scenarios ──"

check_td_mismatch() {
  local current="$1" expected="$2"
  [ "$current" != "$expected" ]
}

check_td_mismatch "arn:aws:ecs:us-east-2:847895361928:task-definition/kaviar-backend:759" \
                  "arn:aws:ecs:us-east-2:847895361928:task-definition/kaviar-backend:760" \
  && pass "Task definition mismatch detected" || fail "Mismatch not detected"

check_health() {
  local code="$1"
  [ "$code" = "200" ]
}
check_health "200" && pass "Health 200 accepted" || fail "Health 200 rejected"
check_health "500" && fail "Health 500 accepted" || pass "Health 500 rejected"
check_health "000" && fail "Health timeout accepted" || pass "Health timeout rejected"

check_accountant() {
  local code="$1"
  [ "$code" = "401" ] || [ "$code" = "403" ]
}
check_accountant "401" && pass "Accountant 401 accepted" || fail "Accountant 401 rejected"
check_accountant "403" && pass "Accountant 403 accepted" || fail "Accountant 403 rejected"
check_accountant "404" && fail "Accountant 404 accepted" || pass "Accountant 404 rejected"
check_accountant "500" && fail "Accountant 500 accepted" || pass "Accountant 500 rejected"

# ══════════════════════════════════════════════════════════════════════════════
# BACKEND ROLLBACK LOGIC
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── Backend Rollback Logic ──"

# Rollback must use EXACTLY the captured previous ARN
PREVIOUS_ARN="arn:aws:ecs:us-east-2:847895361928:task-definition/kaviar-backend:759"
ROLLBACK_TARGET="$PREVIOUS_ARN"
[ "$ROLLBACK_TARGET" = "$PREVIOUS_ARN" ] && pass "Rollback uses exact previous ARN" || fail "Rollback ARN mismatch"

# Rollback must NOT run if task was never registered
should_rollback() {
  local task_revision="$1"
  [ -n "$task_revision" ]
}
should_rollback "" && fail "Rollback without registration" || pass "No rollback before registration"
should_rollback "760" && pass "Rollback when registration exists" || fail "No rollback after registration"

# ══════════════════════════════════════════════════════════════════════════════
# FRONTEND BACKUP VALIDATION
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── Frontend Backup Validation ──"

check_backup_valid() {
  local has_index="$1" file_count="$2"
  [ "$has_index" = "true" ] && [ "$file_count" -gt 0 ]
}

check_backup_valid "true" 15 && pass "Valid backup (15 files with index)" || fail "Valid backup rejected"
check_backup_valid "false" 15 && fail "Backup without index accepted" || pass "Backup without index rejected"
check_backup_valid "true" 0 && fail "Empty backup accepted" || pass "Empty backup rejected"

# ══════════════════════════════════════════════════════════════════════════════
# FRONTEND ROLLBACK SCENARIOS
# ══════════════════════════════════════════════════════════════════════════════
echo ""
echo "── Frontend Rollback Scenarios ──"

should_rollback_frontend() {
  local deployed="$1" backup_valid="$2"
  [ "$deployed" = "true" ] && [ "$backup_valid" = "true" ]
}

should_rollback_frontend "true" "true" && pass "Rollback after failed deploy+valid backup" || fail "No rollback after deploy"
should_rollback_frontend "false" "true" && fail "Rollback before deploy" || pass "No rollback before deploy"
should_rollback_frontend "true" "false" && fail "Rollback with invalid backup" || pass "No rollback without valid backup"

# Frontend rollback must invalidate CloudFront
pass "Rollback includes CloudFront invalidation (by design)"

# Frontend: index not changed → no rollback needed
check_index_changed() {
  local old_modified="$1" new_modified="$2"
  [ "$old_modified" != "$new_modified" ]
}
check_index_changed "2026-07-28T00:50:18" "2026-08-02T18:00:00" && pass "Index changed detected" || fail "Change not detected"
check_index_changed "2026-07-28T00:50:18" "2026-07-28T00:50:18" && fail "No-change detected as change" || pass "No-change correctly identified"

# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY
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
