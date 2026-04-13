#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

LAST_COMMIT_SHA="$(git log -1 --pretty=format:'%H' || true)"
LAST_COMMIT_AT="$(git log -1 --pretty=format:'%ci' || true)"
LAST_COMMIT_SUBJECT="$(git log -1 --pretty=format:'%s' || true)"

ORIGIN_URL="$(git remote get-url origin 2>/dev/null || true)"
GH_TOKEN_FROM_REMOTE="$(printf '%s' "$ORIGIN_URL" | sed -n 's#https://\([^@]*\)@github.com/.*#\1#p')"
GH_TOKEN_EFFECTIVE="${GH_TOKEN:-$GH_TOKEN_FROM_REMOTE}"

PR_JSON='[]'
if [[ -n "$GH_TOKEN_EFFECTIVE" ]]; then
  PR_JSON="$(GH_TOKEN="$GH_TOKEN_EFFECTIVE" gh pr list --limit 1 --state open --json number,title,updatedAt,url,headRefName 2>/dev/null || echo '[]')"
fi

ACTIVE_PR_NUMBER="$(printf '%s' "$PR_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["number"] if d else "")')"
ACTIVE_PR_URL="$(printf '%s' "$PR_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d[0]["url"] if d else "")')"

CHECKS_SUMMARY="UNAVAILABLE"
if [[ -n "$ACTIVE_PR_NUMBER" && -n "$GH_TOKEN_EFFECTIVE" ]]; then
  CHECKS_JSON="$(GH_TOKEN="$GH_TOKEN_EFFECTIVE" gh pr view "$ACTIVE_PR_NUMBER" --json statusCheckRollup 2>/dev/null || echo '{}')"
  CHECKS_SUMMARY="$(printf '%s' "$CHECKS_JSON" | python3 -c 'import json,sys
j=json.load(sys.stdin)
checks=j.get("statusCheckRollup") or []
if not checks:
    print("NO_CHECKS")
else:
    ok=fail=pending=0
    for c in checks:
        state=(c.get("conclusion") or c.get("state") or "").upper()
        if state in ("SUCCESS","NEUTRAL","SKIPPED"):
            ok+=1
        elif state in ("FAILURE","ERROR","TIMED_OUT","CANCELLED","ACTION_REQUIRED"):
            fail+=1
        else:
            pending+=1
    print(f"ok={ok}, fail={fail}, pending={pending}")')"
fi

# NO_STAGING unless explicitly configured with a real URL.
STAGING_URL="${STAGING_URL:-${API_BASE_URL:-}}"
if [[ -z "$STAGING_URL" && -f .env ]]; then
  STAGING_URL="$(grep -E '^(STAGING_URL|API_BASE_URL)=' .env | tail -n 1 | cut -d'=' -f2- | tr -d '"' || true)"
fi

if [[ -n "$STAGING_URL" ]] && [[ "$STAGING_URL" != *"example.com"* ]] && [[ "$STAGING_URL" != *"localhost"* ]] && [[ "$STAGING_URL" != "http://127.0.0.1"* ]]; then
  STAGING_STATUS="FOUND"
else
  STAGING_STATUS="NO_STAGING"
fi

DEMO_STATUS="SKIPPED"
if [[ "$STAGING_STATUS" == "NO_STAGING" ]]; then
  if bash scripts/demo-check.sh >/tmp/dreamboard-demo-check.log 2>&1; then
    DEMO_STATUS="PASS"
  else
    DEMO_STATUS="FAIL"
  fi
fi

STATUS="BLOCKED"
FAIL_COUNT="$(printf '%s' "$CHECKS_SUMMARY" | sed -n 's/.*fail=\([0-9]\+\).*/\1/p')"
PENDING_COUNT="$(printf '%s' "$CHECKS_SUMMARY" | sed -n 's/.*pending=\([0-9]\+\).*/\1/p')"

if [[ -n "$LAST_COMMIT_SHA" && -n "$ACTIVE_PR_NUMBER" && "$CHECKS_SUMMARY" != "UNAVAILABLE" && "$CHECKS_SUMMARY" != "NO_CHECKS" && "${FAIL_COUNT:-1}" == "0" && "${PENDING_COUNT:-1}" == "0" && "$DEMO_STATUS" == "PASS" ]]; then
  STATUS="DONE"
fi

printf 'STATUS: %s\n' "$STATUS"
printf 'COMMIT: %s %s %s\n' "$LAST_COMMIT_SHA" "$LAST_COMMIT_AT" "$LAST_COMMIT_SUBJECT"
printf 'PR: %s %s\n' "${ACTIVE_PR_NUMBER:-NONE}" "${ACTIVE_PR_URL:-NONE}"
printf 'CHECKS: %s\n' "$CHECKS_SUMMARY"
printf 'STAGING: %s\n' "$STAGING_STATUS"
printf 'DEMO: %s\n' "$DEMO_STATUS"
