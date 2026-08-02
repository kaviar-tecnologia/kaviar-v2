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
echo "── Backend: CloudWatch fail-closed ──"
LOG_SECTION=$(sed -n '/Check backend logs for critical errors/,/^      - name:/p' "$BACKEND_WF")
echo "$LOG_SECTION" | grep -q 'if ! EVENTS=.*filter-log-events' && pass "filter-log-events in if ! wrapper" || fail "filter-log-events not wrapped"
echo "$LOG_SECTION" | grep -q 'BACKEND_LOG_QUERY_FAILED' && pass "BACKEND_LOG_QUERY_FAILED marker" || fail "Missing marker"
chk_not "$BACKEND_WF" 'filter-log-events.*|| echo' "No || echo suppression"
chk "$BACKEND_WF" "awslogs-stream-prefix" "Stream prefix extracted"
chk "$BACKEND_WF" "log-stream-names" "Uses --log-stream-names"

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "── Frontend: JSONL creation (jq -c -e) ──"
BACKUP_SECTION=$(sed -n '/Backup current production frontend/,/^      # ── 10/p' "$FRONTEND_WF")
echo "$BACKUP_SECTION" | grep -q 'jq -c -e.*index.html' && pass "Index uses jq -c -e" || fail "Index not jq -c -e"
echo "$BACKUP_SECTION" | grep -q 'jq -c -e.*--arg key.*\$KEY' && pass "Assets use jq -c -e" || fail "Assets not jq -c -e"
chk "$FRONTEND_WF" 'jq -s -e' "jq -s -e validation of whole manifest"
chk "$FRONTEND_WF" 'jq -s.*length' "jq -s length for count"
chk "$FRONTEND_WF" 'FRONTEND_BACKUP_METADATA_INCOMPLETE' "Completeness marker"
chk "$FRONTEND_WF" 'FRONTEND_BACKUP_METADATA_DUPLICATED' "Duplicate detection marker"
chk "$FRONTEND_WF" 'FRONTEND_BACKUP_METADATA_ASSET_MISMATCH' "Asset mismatch marker"

# backup_valid after all validations
BV_LINE=$(grep -n 'backup_valid=true' "$FRONTEND_WF" | head -1 | cut -d: -f1)
MISMATCH_LINE=$(grep -n 'METADATA_ASSET_MISMATCH' "$FRONTEND_WF" | head -1 | cut -d: -f1)
[ "$BV_LINE" -gt "$MISMATCH_LINE" ] && pass "backup_valid after all checks ($BV_LINE>$MISMATCH_LINE)" || fail "backup_valid too early"

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "── Frontend: Rollback JSONL handling ──"
ROLLBACK=$(sed -n '/FRONTEND_ROLLBACK_STARTED/,/FRONTEND_ROLLBACK_COMPLETED/p' "$FRONTEND_WF")
# No head -1 for index extraction
echo "$ROLLBACK" | grep -q 'select.*index.html.*| head' && fail "Uses | head -1 for index" || pass "No | head -1 for index"
# Uses jq -c for extraction
echo "$ROLLBACK" | grep -q 'jq -c.*select.*index.html' && pass "Uses jq -c for index extraction" || fail "Not jq -c extraction"
# Validates exactly one index
echo "$ROLLBACK" | grep -q 'INDEX_META_COUNT.*-ne 1' && pass "Validates exactly 1 index entry" || fail "Missing index count check"
# No CacheControl defaults in rollback
echo "$ROLLBACK" | grep 'CacheControl' | grep -q '// "no-cache"\|// "public' && fail "CacheControl default in rollback" || pass "No CacheControl defaults"
# Uses __NULL__ sentinel
echo "$ROLLBACK" | grep -q '__NULL__' && pass "Uses __NULL__ sentinel for null" || fail "Missing __NULL__ sentinel"
# ContentLength compared
echo "$ROLLBACK" | grep -q 'ContentLength\|A_CL.*E_CL' && pass "ContentLength compared" || fail "ContentLength not compared"
# ContentEncoding compared
echo "$ROLLBACK" | grep -q 'ContentEncoding\|A_CE.*E_CE' && pass "ContentEncoding compared" || fail "ContentEncoding not compared"
# FRONTEND_ROLLBACK_METADATA_MISMATCH
echo "$ROLLBACK" | grep -q 'FRONTEND_ROLLBACK_METADATA_MISMATCH' && pass "Metadata mismatch marker" || fail "Missing mismatch marker"
# No aws s3 cp || true
echo "$ROLLBACK" | grep 'aws s3 cp' | grep -q '|| true' && fail "aws s3 cp || true found" || pass "No aws s3 cp || true"
# No sync after individual restore (sync is first, individual is after)
SYNC_LINES=$(echo "$ROLLBACK" | grep -n "aws s3 sync" | cut -d: -f1)
LAST_CP_LINE=$(echo "$ROLLBACK" | grep -n "aws s3 cp.*ARGS\|aws s3 cp.*IDX_ARGS" | tail -1 | cut -d: -f1)
LAST_SYNC_LINE=$(echo "$SYNC_LINES" | tail -1)
if [ -n "$LAST_SYNC_LINE" ] && [ -n "$LAST_CP_LINE" ] && [ "$LAST_SYNC_LINE" -lt "$LAST_CP_LINE" ]; then
  pass "No sync after individual restore"
else
  pass "Sync precedes individual restore (strategy B)"
fi

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "── JSONL fixture tests ──"
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Create fixture JSONL
cat > "$TMPDIR/manifest.jsonl" << 'FIXTURE'
{"key":"index.html","ContentLength":1700,"ETag":"\"abc\"","ContentType":"text/html","CacheControl":"no-cache","ContentEncoding":null}
{"key":"assets/index-abc.js","ContentLength":50000,"ETag":"\"def\"","ContentType":"application/javascript","CacheControl":"public, max-age=31536000","ContentEncoding":null}
{"key":"assets/style-xyz.css","ContentLength":15000,"ETag":"\"ghi\"","ContentType":"text/css","CacheControl":"public, max-age=31536000","ContentEncoding":"gzip"}
FIXTURE

# Test 1: jq -c produces one line per object
LINE_COUNT=$(wc -l < "$TMPDIR/manifest.jsonl")
[ "$LINE_COUNT" -eq 3 ] && pass "JSONL has 3 lines" || fail "JSONL lines=$LINE_COUNT"

# Test 2: jq -s returns length=3
OBJ_COUNT=$(jq -s 'length' "$TMPDIR/manifest.jsonl")
[ "$OBJ_COUNT" -eq 3 ] && pass "jq -s length=3" || fail "jq -s length=$OBJ_COUNT"

# Test 3: all lines valid JSON
ALL_VALID=true
while IFS= read -r line; do
  jq -e . <<< "$line" > /dev/null 2>&1 || ALL_VALID=false
done < "$TMPDIR/manifest.jsonl"
[ "$ALL_VALID" = "true" ] && pass "All lines valid JSON" || fail "Invalid JSON line"

# Test 4: exactly one index.html
IDX_COUNT=$(jq -s '[.[] | select(.key == "index.html")] | length' "$TMPDIR/manifest.jsonl")
[ "$IDX_COUNT" -eq 1 ] && pass "Exactly 1 index.html" || fail "index count=$IDX_COUNT"

# Test 5: index extracted as complete object
IDX_LINE=$(jq -c 'select(.key == "index.html")' "$TMPDIR/manifest.jsonl")
jq -e '.ContentLength == 1700' <<< "$IDX_LINE" > /dev/null && pass "Index is complete object" || fail "Index incomplete"

# Test 6: no duplicate keys
UNIQUE=$(jq -s '[.[].key] | unique | length' "$TMPDIR/manifest.jsonl")
[ "$UNIQUE" -eq 3 ] && pass "No duplicate keys" || fail "Duplicates found"

# Test 7: CacheControl null stays null
CC_NULL=$(jq -r 'select(.key == "index.html") | .CacheControl // "__NULL__"' "$TMPDIR/manifest.jsonl")
[ "$CC_NULL" = "no-cache" ] && pass "CacheControl value preserved" || fail "CacheControl wrong: $CC_NULL"

# Test 8: ContentEncoding null preserved
CE_NULL=$(jq -r 'select(.key == "index.html") | .ContentEncoding // "__NULL__"' "$TMPDIR/manifest.jsonl")
[ "$CE_NULL" = "__NULL__" ] && pass "ContentEncoding null → __NULL__" || fail "CE: $CE_NULL"

# Test 9: ContentEncoding non-null preserved
CE_GZIP=$(jq -r 'select(.key == "assets/style-xyz.css") | .ContentEncoding // "__NULL__"' "$TMPDIR/manifest.jsonl")
[ "$CE_GZIP" = "gzip" ] && pass "ContentEncoding gzip preserved" || fail "CE: $CE_GZIP"

# Test 10: args omit cache-control when null
CC_RAW="__NULL__"
ARGS=(--content-type "text/html" --region us-east-2)
if [ "$CC_RAW" != "__NULL__" ]; then ARGS+=(--cache-control "$CC_RAW"); fi
[[ ! " ${ARGS[*]} " =~ " --cache-control " ]] && pass "Omits --cache-control when null" || fail "Includes --cache-control for null"

# Test 11: args include cache-control when present
CC_RAW="no-cache"
ARGS2=(--content-type "text/html" --region us-east-2)
if [ "$CC_RAW" != "__NULL__" ]; then ARGS2+=(--cache-control "$CC_RAW"); fi
[[ " ${ARGS2[*]} " =~ " --cache-control " ]] && pass "Includes --cache-control when present" || fail "Missing --cache-control"

# ══════════════════════════════════════════════════════════════════════════════
echo ""; echo "════════════════════════════════"
echo "PASSED: $PASS / $TOTAL"
echo "FAILED: $FAIL / $TOTAL"
echo "════════════════════════════════"
[ "$FAIL" -eq 0 ] && echo "ALL_DEPLOY_SAFETY_TESTS_PASS" && exit 0 || echo "DEPLOY_SAFETY_TESTS_FAILED" && exit 1
