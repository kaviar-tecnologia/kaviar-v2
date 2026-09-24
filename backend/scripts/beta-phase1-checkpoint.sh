#!/bin/bash
# Beta Phase 1 Checkpoint Script
# Usage: ./beta-phase1-checkpoint.sh [T+6h|T+12h|T+24h|T+48h]

set -e

ADMIN_EMAIL="${ADMIN_EMAIL:-suporte@kaviar.com.br}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:?Set ADMIN_PASSWORD env var}"
LOGIN_PAYLOAD=$(jq -n --arg email "$ADMIN_EMAIL" --arg password "$ADMIN_PASSWORD" '{email:$email,password:$password}')

CHECKPOINT=$1
if [ -z "$CHECKPOINT" ]; then
  echo "Usage: $0 [T+6h|T+12h|T+24h|T+48h]"
  exit 1
fi

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TIMESTAMP_BRT=$(date +"%Y-%m-%d %H:%M:%S BRT")

echo "========================================="
echo "CHECKPOINT: $CHECKPOINT"
echo "Time: $TIMESTAMP_BRT"
echo "========================================="
echo ""

# Get admin token
TOKEN=$(curl -s -X POST "https://api.kaviar.com.br/api/admin/auth/login" \
  -H "Content-Type: application/json" \
  -d "$LOGIN_PAYLOAD" | jq -r '.token')

# 1. Feature Flag State
echo "1. FEATURE FLAG STATE"
echo "---------------------"
FLAG_STATE=$(curl -s "https://api.kaviar.com.br/api/admin/feature-flags/passenger_favorites_matching" \
  -H "Authorization: Bearer $TOKEN")

ENABLED=$(echo $FLAG_STATE | jq -r '.flag.enabled')
ROLLOUT=$(echo $FLAG_STATE | jq -r '.flag.rolloutPercentage')

ALLOWLIST_COUNT=$(curl -s "https://api.kaviar.com.br/api/admin/feature-flags/passenger_favorites_matching/allowlist" \
  -H "Authorization: Bearer $TOKEN" | jq -r '.pagination.total')

echo "  enabled: $ENABLED"
echo "  rollout_percentage: $ROLLOUT"
echo "  allowlist_count: $ALLOWLIST_COUNT"

# Validation
if [ "$ENABLED" != "true" ] || [ "$ROLLOUT" != "0" ] || [ "$ALLOWLIST_COUNT" != "10" ]; then
  echo "  ⚠️  WARNING: Configuration drift detected!"
fi
echo ""

# 2. Metrics
echo "2. METRICS (vs Baseline T0)"
echo "----------------------------"

# API requests (last 6h)
WINDOW_MS=$((6 * 60 * 60 * 1000))
START_TIME=$(($(date +%s) * 1000 - $WINDOW_MS))

# Total requests
TOTAL_REQUESTS=$(aws logs filter-log-events \
  --log-group-name /ecs/kaviar-backend \
  --start-time $START_TIME \
  --region us-east-1 \
  --filter-pattern "Request:" 2>/dev/null | jq -r '.events | length')
TOTAL_REQUESTS=${TOTAL_REQUESTS:-0}

echo "  Total requests (6h): $TOTAL_REQUESTS"

# HTTP status breakdown
STATUS_2XX=$(aws logs filter-log-events \
  --log-group-name /ecs/kaviar-backend \
  --start-time $START_TIME \
  --region us-east-1 \
  --filter-pattern "\"status\":2" 2>/dev/null | jq -r '.events | length')
STATUS_2XX=${STATUS_2XX:-0}

STATUS_3XX=$(aws logs filter-log-events \
  --log-group-name /ecs/kaviar-backend \
  --start-time $START_TIME \
  --region us-east-1 \
  --filter-pattern "\"status\":3" 2>/dev/null | jq -r '.events | length')
STATUS_3XX=${STATUS_3XX:-0}

STATUS_4XX=$(aws logs filter-log-events \
  --log-group-name /ecs/kaviar-backend \
  --start-time $START_TIME \
  --region us-east-1 \
  --filter-pattern "\"status\":4" 2>/dev/null | jq -r '.events | length')
STATUS_4XX=${STATUS_4XX:-0}

STATUS_5XX=$(aws logs filter-log-events \
  --log-group-name /ecs/kaviar-backend \
  --start-time $START_TIME \
  --region us-east-1 \
  --filter-pattern "\"status\":5" 2>/dev/null | jq -r '.events | length')
STATUS_5XX=${STATUS_5XX:-0}

echo "  Status breakdown:"
echo "    2xx: $STATUS_2XX"
echo "    3xx: $STATUS_3XX"
echo "    4xx: $STATUS_4XX"
echo "    5xx: $STATUS_5XX"

# 4xx detailed
STATUS_401=$(aws logs filter-log-events \
  --log-group-name /ecs/kaviar-backend \
  --start-time $START_TIME \
  --region us-east-1 \
  --filter-pattern "\"status\":401" 2>/dev/null | jq -r '.events | length')
STATUS_401=${STATUS_401:-0}

STATUS_403=$(aws logs filter-log-events \
  --log-group-name /ecs/kaviar-backend \
  --start-time $START_TIME \
  --region us-east-1 \
  --filter-pattern "\"status\":403" 2>/dev/null | jq -r '.events | length')
STATUS_403=${STATUS_403:-0}

STATUS_429=$(aws logs filter-log-events \
  --log-group-name /ecs/kaviar-backend \
  --start-time $START_TIME \
  --region us-east-1 \
  --filter-pattern "\"status\":429" 2>/dev/null | jq -r '.events | length')
STATUS_429=${STATUS_429:-0}

echo "  4xx detail:"
echo "    401 (auth): $STATUS_401"
echo "    403 (forbidden): $STATUS_403"
echo "    429 (rate limit): $STATUS_429"
echo "    other 4xx: $((STATUS_4XX - STATUS_401 - STATUS_403 - STATUS_429))"

# Error rates
if [ $TOTAL_REQUESTS -gt 0 ]; then
  ERROR_RATE_TOTAL=$(awk "BEGIN {printf \"%.2f\", ($STATUS_4XX + $STATUS_5XX) * 100.0 / $TOTAL_REQUESTS}")
  ERROR_RATE_5XX=$(awk "BEGIN {printf \"%.2f\", $STATUS_5XX * 100.0 / $TOTAL_REQUESTS}")
else
  ERROR_RATE_TOTAL="0.00"
  ERROR_RATE_5XX="0.00"
fi

echo "  Error rates:"
echo "    Total (4xx+5xx): ${ERROR_RATE_TOTAL}%"
echo "    5xx only: ${ERROR_RATE_5XX}%"

# Feature flag requests
FF_REQUESTS=$(aws logs filter-log-events \
  --log-group-name /ecs/kaviar-backend \
  --start-time $START_TIME \
  --region us-east-1 \
  --filter-pattern "feature-flags" 2>/dev/null | jq -r '.events | length')
FF_REQUESTS=${FF_REQUESTS:-0}

echo "  Feature flag requests: $FF_REQUESTS"

# Matching metrics (if available)
MATCHING_REQUESTS=$(aws logs filter-log-events \
  --log-group-name /ecs/kaviar-backend \
  --start-time $START_TIME \
  --region us-east-1 \
  --filter-pattern "matching" 2>/dev/null | jq -r '.events | length')
MATCHING_REQUESTS=${MATCHING_REQUESTS:-0}

echo "  Matching requests: $MATCHING_REQUESTS"

# Baseline comparison and rollback triggers
BASELINE_5XX_RATE=0.00
BASELINE_LATENCY_P95=100

ROLLBACK_TRIGGERED=false

if (( $(echo "$ERROR_RATE_5XX > $BASELINE_5XX_RATE + 0.10" | bc -l) )); then
  echo "  🚨 ROLLBACK TRIGGER: 5xx rate ${ERROR_RATE_5XX}% > baseline +10%"
  ROLLBACK_TRIGGERED=true
fi

# Note: Latency p95 check requires CloudWatch metrics or custom instrumentation
# Placeholder for now
echo "  Latency p95: [manual review required]"

echo ""

# 3. Determinism Test
echo "3. DETERMINISM VALIDATION"
echo "-------------------------"

# Test 2 beta passengers - verify allowlist presence
TEST_ID_1="pass_beta_001_2026"
TEST_ID_2="pass_beta_005_2026"

echo "  Allowlist check:"
# Use actual token but don't log it
ALLOWLIST_DATA=$(curl -s "https://api.kaviar.com.br/api/admin/feature-flags/passenger_favorites_matching/allowlist" \
  -H "Authorization: Bearer $TOKEN" 2>/dev/null)

if [ -z "$ALLOWLIST_DATA" ] || [ "$ALLOWLIST_DATA" == "null" ]; then
  echo "    ⚠️  Failed to fetch allowlist data"
  RESULT_1=""
  RESULT_2=""
else
  RESULT_1=$(echo "$ALLOWLIST_DATA" | jq -r ".allowlist[]? | select(.passengerId==\"$TEST_ID_1\") | .passengerId" 2>/dev/null)
  RESULT_2=$(echo "$ALLOWLIST_DATA" | jq -r ".allowlist[]? | select(.passengerId==\"$TEST_ID_2\") | .passengerId" 2>/dev/null)
fi

if [ "$RESULT_1" == "$TEST_ID_1" ]; then
  echo "    ✓ $TEST_ID_1: IN ALLOWLIST (expected: ON)"
else
  echo "    ✗ $TEST_ID_1: NOT IN ALLOWLIST (unexpected)"
fi

if [ "$RESULT_2" == "$TEST_ID_2" ]; then
  echo "    ✓ $TEST_ID_2: IN ALLOWLIST (expected: ON)"
else
  echo "    ✗ $TEST_ID_2: NOT IN ALLOWLIST (unexpected)"
fi

# Test resolver consistency (if resolver endpoint available)
# Note: This requires a dedicated test endpoint or feature flag evaluation API
echo "  Resolver consistency:"
echo "    [manual validation required - call resolver 2x for same ID]"
echo "    Expected: Same result (ON/OFF) for same passenger_id"

echo ""

# 4. Operational Signals
echo "4. OPERATIONAL SIGNALS"
echo "----------------------"
echo "  Total requests (6h): $TOTAL_REQUESTS"
echo "  5xx errors: $STATUS_5XX (${ERROR_RATE_5XX}%)"
echo "  4xx errors: $STATUS_4XX (expected: auth/RBAC)"
echo "  Critical errors: [manual review required]"
echo "  Beta complaints: [manual review required]"
echo ""

# 5. Decision
echo "5. CHECKPOINT DECISION"
echo "----------------------"

GO_CRITERIA=true

if [ "$ENABLED" != "true" ] || [ "$ROLLOUT" != "0" ] || [ "$ALLOWLIST_COUNT" != "10" ]; then
  GO_CRITERIA=false
  echo "  ✗ Configuration drift detected"
fi

if [ "$ROLLBACK_TRIGGERED" = true ]; then
  GO_CRITERIA=false
  echo "  ✗ Rollback trigger activated"
fi

if [ "$STATUS_5XX" -gt 0 ]; then
  if (( $(echo "$ERROR_RATE_5XX > 0.10" | bc -l) )); then
    GO_CRITERIA=false
    echo "  ✗ 5xx error rate too high: ${ERROR_RATE_5XX}%"
  fi
fi

if [ "$GO_CRITERIA" = true ]; then
  echo "  ✅ All automated checks PASS"
  echo "  ⏭️  Manual review required for:"
  echo "     - Matching success rate ≥ baseline"
  echo "     - Time-to-match p50/p95 < baseline +20%"
  echo "     - API latency p95 < baseline +50%"
  echo "     - Beta passenger feedback"
  echo "     - Resolver determinism (2+ calls same ID)"
else
  echo "  ⚠️  ISSUES DETECTED - Review required"
fi
echo ""

# 6. Append to doc
echo "========================================="
echo "APPENDING TO BETA_PHASE1_2026-02-01.md"
echo "========================================="

cat >> /home/goes/kaviar/docs/BETA_PHASE1_2026-02-01.md << EOF

---

## Checkpoint: $CHECKPOINT ($TIMESTAMP)

### Feature Flag State
- **enabled:** $ENABLED
- **rollout_percentage:** $ROLLOUT%
- **allowlist_count:** $ALLOWLIST_COUNT

### Metrics (6h window)
**Requests:**
- Total: $TOTAL_REQUESTS
- Feature flag: $FF_REQUESTS
- Matching: $MATCHING_REQUESTS

**Status Breakdown:**
- 2xx: $STATUS_2XX
- 3xx: $STATUS_3XX
- 4xx: $STATUS_4XX (401: $STATUS_401, 403: $STATUS_403, 429: $STATUS_429)
- 5xx: $STATUS_5XX

**Error Rates:**
- Total (4xx+5xx): ${ERROR_RATE_TOTAL}%
- 5xx only: ${ERROR_RATE_5XX}%

**Baseline Comparison:**
- 5xx rate: $([ "$STATUS_5XX" -eq 0 ] && echo "✅ 0% (no increase)" || echo "⚠️ ${ERROR_RATE_5XX}%")

### Determinism Validation
- **$TEST_ID_1:** $([ "$RESULT_1" == "$TEST_ID_1" ] && echo "✅ IN ALLOWLIST" || echo "✗ NOT FOUND")
- **$TEST_ID_2:** $([ "$RESULT_2" == "$TEST_ID_2" ] && echo "✅ IN ALLOWLIST" || echo "✗ NOT FOUND")
- **Resolver consistency:** [manual validation required]

### Operational Signals
- **Total requests (6h):** $TOTAL_REQUESTS
- **5xx errors:** $STATUS_5XX (${ERROR_RATE_5XX}%)
- **4xx errors:** $STATUS_4XX (expected: auth/RBAC)
- **Critical errors:** [manual review]
- **Beta complaints:** [manual review]

### Decision
$([ "$GO_CRITERIA" = true ] && echo "✅ **PASS** - All automated checks passed" || echo "⚠️ **REVIEW REQUIRED** - Issues detected")

**Manual Review Required:**
- [ ] Matching success rate ≥ baseline
- [ ] Time-to-match p50/p95 < baseline +20%
- [ ] API latency p95 < baseline +50%
- [ ] Zero critical complaints from beta passengers
- [ ] Resolver determinism confirmed (2+ calls same ID)

EOF

echo "✅ Checkpoint data appended to documentation"
echo ""

# 7. Rollback check
if [ "$ROLLBACK_TRIGGERED" = true ]; then
  echo "========================================="
  echo "🚨 ROLLBACK TRIGGER DETECTED"
  echo "========================================="
  echo ""
  echo "Issues detected:"
  [ "$STATUS_5XX" -gt 0 ] && echo "  • 5xx errors: $STATUS_5XX (${ERROR_RATE_5XX}%)"
  [ "$ENABLED" != "true" ] && echo "  • Configuration drift: enabled=$ENABLED"
  [ "$ROLLOUT" != "0" ] && echo "  • Configuration drift: rollout=$ROLLOUT"
  [ "$ALLOWLIST_COUNT" != "10" ] && echo "  • Configuration drift: allowlist=$ALLOWLIST_COUNT"
  echo ""
  echo "Recommended action:"
  echo "  1. Review CloudWatch logs for root cause"
  echo "  2. If critical, execute rollback:"
  echo ""
  echo "     # Level 1: Disable feature (immediate)"
  echo "     curl -X PUT https://api.kaviar.com.br/api/admin/feature-flags/passenger_favorites_matching \\"
  echo "       -H \"Authorization: Bearer [TOKEN]\" \\"
  echo "       -H \"Content-Type: application/json\" \\"
  echo "       -d '{\"enabled\":false,\"rolloutPercentage\":0}'"
  echo ""
  echo "     # OR Level 1b: Clear allowlist (keep enabled=true, rollout=0)"
  echo "     # Via UI: Remove all passengers from allowlist"
  echo ""
fi

echo "========================================="
echo "Checkpoint $CHECKPOINT complete"
echo "========================================="
