#!/bin/bash
# Go/No-Go Decision Script for Phase 2
# Usage: ./beta-phase1-go-nogo.sh

set -e

ADMIN_EMAIL="${ADMIN_EMAIL:-suporte@kaviar.com.br}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Set ADMIN_PASSWORD env var}"
LOGIN_PAYLOAD=$(jq -n --arg email "$ADMIN_EMAIL" --arg password "$ADMIN_PASSWORD" '{email:$email,password:$password}')

echo "========================================="
echo "PHASE 1 → PHASE 2 GO/NO-GO DECISION"
echo "Time: $(date +"%Y-%m-%d %H:%M:%S BRT")"
echo "========================================="
echo ""

# Get admin token
TOKEN=$(curl -s -X POST "https://api.kaviar.com.br/api/admin/auth/login" \
  -H "Content-Type: application/json" \
  -d "$LOGIN_PAYLOAD" | jq -r '.token')

# Check current state
FLAG_STATE=$(curl -s "https://api.kaviar.com.br/api/admin/feature-flags/passenger_favorites_matching" \
  -H "Authorization: Bearer $TOKEN")

ENABLED=$(echo $FLAG_STATE | jq -r '.flag.enabled')
ROLLOUT=$(echo $FLAG_STATE | jq -r '.flag.rolloutPercentage')

echo "Current State:"
echo "  enabled: $ENABLED"
echo "  rollout_percentage: $ROLLOUT%"
echo ""

# Automated checks
echo "AUTOMATED CHECKS:"
echo "-----------------"

GO=true

# Check 1: 5xx errors
WINDOW_MS=$((24 * 60 * 60 * 1000))
START_TIME=$(($(date +%s) * 1000 - $WINDOW_MS))

ERROR_5XX=$(aws logs filter-log-events \
  --log-group-name /ecs/kaviar-backend \
  --start-time $START_TIME \
  --region us-east-1 \
  --filter-pattern "500" 2>/dev/null | jq -r '.events | length')

if [ $ERROR_5XX -eq 0 ]; then
  echo "✅ 5xx errors: 0 (no increase)"
else
  echo "✗ 5xx errors: $ERROR_5XX (FAIL)"
  GO=false
fi

# Check 2: Configuration stable
if [ "$ENABLED" == "true" ] && [ "$ROLLOUT" == "0" ]; then
  echo "✅ Configuration: stable (enabled=true, rollout=0%)"
else
  echo "✗ Configuration: drift detected (FAIL)"
  GO=false
fi

# Check 3: Allowlist intact
ALLOWLIST_COUNT=$(curl -s "https://api.kaviar.com.br/api/admin/feature-flags/passenger_favorites_matching/allowlist" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.pagination.total')

if [ "$ALLOWLIST_COUNT" == "10" ]; then
  echo "✅ Allowlist: 10 passengers (intact)"
else
  echo "✗ Allowlist: $ALLOWLIST_COUNT passengers (expected 10, FAIL)"
  GO=false
fi

echo ""
echo "MANUAL REVIEW REQUIRED:"
echo "-----------------------"
echo "[ ] Matching success rate ≥ baseline"
echo "[ ] Time-to-match p50/p95 < baseline +20%"
echo "[ ] API latency p95 < 100ms"
echo "[ ] Zero critical complaints from beta passengers"
echo "[ ] Deterministic behavior confirmed"
echo ""

if [ "$GO" = true ]; then
  echo "========================================="
  echo "✅ AUTOMATED CHECKS: PASS"
  echo "========================================="
  echo ""
  echo "Decision: GO for Phase 2 (pending manual review)"
  echo ""
  echo "Next steps:"
  echo "  1. Complete manual review checklist above"
  echo "  2. If all manual checks pass, execute Phase 2:"
  echo ""
  echo "     cd /home/goes/kaviar/backend"
  echo "     ./scripts/beta-phase2-activate.sh"
  echo ""
else
  echo "========================================="
  echo "✗ AUTOMATED CHECKS: FAIL"
  echo "========================================="
  echo ""
  echo "Decision: NO-GO for Phase 2"
  echo ""
  echo "Actions required:"
  echo "  1. Review failures above"
  echo "  2. Investigate root cause"
  echo "  3. Consider rollback if issues persist"
  echo "  4. Extend Phase 1 monitoring if needed"
  echo ""
fi
