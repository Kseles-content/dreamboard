#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

command -v curl >/dev/null 2>&1 || { echo "[smoke] curl is required"; exit 1; }
command -v jq >/dev/null 2>&1 || { echo "[smoke] jq is required"; exit 1; }

PORT="${PORT:-3000}"
BASE_URL="${BASE_URL:-http://127.0.0.1:${PORT}}"

if command -v fuser >/dev/null 2>&1; then
  fuser -k "${PORT}/tcp" >/dev/null 2>&1 || true
fi
PORT="$PORT" npm run start:dev >/tmp/dreamboard-smoke-api.log 2>&1 &
API_PID=$!

cleanup() {
  kill "$API_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in {1..45}; do
  if curl -fsS "${BASE_URL}/health" >/tmp/dreamboard-smoke-health.json 2>/dev/null; then
    break
  fi
  sleep 1
done

curl -fsS "${BASE_URL}/health" | jq -e '.status == "ok"' >/dev/null

LOGIN_JSON=$(curl -fsS -X POST "${BASE_URL}/v1/auth/login" \
  -H 'content-type: application/json' \
  -d '{"email":"smoke@example.com","name":"Smoke User"}')

TOKEN=$(echo "$LOGIN_JSON" | jq -r '.accessToken')
[[ -n "$TOKEN" && "$TOKEN" != "null" ]] || { echo "[smoke] missing token"; exit 1; }

BOARD_JSON=$(curl -fsS -X POST "${BASE_URL}/v1/boards" \
  -H "authorization: Bearer ${TOKEN}" \
  -H 'content-type: application/json' \
  -d '{"title":"Smoke Board","description":"CI smoke"}')

BOARD_ID=$(echo "$BOARD_JSON" | jq -r '.id')
[[ -n "$BOARD_ID" && "$BOARD_ID" != "null" ]] || { echo "[smoke] board create failed"; exit 1; }

CARD_JSON=$(curl -fsS -X POST "${BASE_URL}/v1/boards/${BOARD_ID}/cards" \
  -H "authorization: Bearer ${TOKEN}" \
  -H 'content-type: application/json' \
  -d '{"text":"Smoke card"}')

echo "$CARD_JSON" | jq -e '.created.id != null' >/dev/null

echo "SMOKE_OK: health/create-board/add-card"
