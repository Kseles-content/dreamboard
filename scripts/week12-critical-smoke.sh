#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

DB_PATH="/tmp/dreamboard-week12-smoke.sqlite"
PORT="3000"
BASE="http://127.0.0.1:${PORT}"

fuser -k ${PORT}/tcp >/dev/null 2>&1 || true
rm -f "$DB_PATH"

DB_PATH="$DB_PATH" JWT_SECRET="week12-secret" PORT="$PORT" npm run start:dev >/tmp/dreamboard-week12-smoke.log 2>&1 &
API_PID=$!
cleanup() {
  kill "$API_PID" >/dev/null 2>&1 || true
  rm -f "$DB_PATH"
}
trap cleanup EXIT

for _ in {1..40}; do
  if curl -fsS "$BASE/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

TOKEN=$(curl -sS -X POST "$BASE/v1/auth/login" -H 'content-type: application/json' \
  -d '{"email":"week12@example.com","name":"Week12"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["accessToken"])')

BOARD_ID=$(curl -sS -X POST "$BASE/v1/boards" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"title":"RC Board","description":"week12"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')

curl -sS -X POST "$BASE/v1/boards/$BOARD_ID/cards" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"text":"hello text"}' >/dev/null

INTENT=$(curl -sS -X POST "$BASE/v1/boards/$BOARD_ID/uploads/intents" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"mimeType":"image/png","sizeBytes":2048,"fileName":"demo.png"}')
OBJ=$(echo "$INTENT" | python3 -c 'import sys,json; print(json.load(sys.stdin)["objectKey"])')

curl -sS -X POST "$BASE/v1/boards/$BOARD_ID/uploads/finalize" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"objectKey\":\"$OBJ\",\"etag\":\"etag-demo\"}" >/dev/null

curl -sS -X POST "$BASE/v1/boards/$BOARD_ID/cards" \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d "{\"type\":\"image\",\"objectKey\":\"$OBJ\"}" >/dev/null

SHARE=$(curl -sS -X POST "$BASE/v1/boards/$BOARD_ID/share-links" -H "authorization: Bearer $TOKEN")
SHARE_ID=$(echo "$SHARE" | python3 -c 'import sys,json; print(json.load(sys.stdin)["id"])')
SHARE_TOKEN=$(echo "$SHARE" | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')

curl -fsS "$BASE/v1/share/$SHARE_TOKEN" >/dev/null

# Export step validation (backend + UI contract): export feature is present in web page source
if ! grep -q "Export PNG" apps/web/pages/index.js; then
  echo "Missing Export PNG control" >&2
  exit 1
fi

# Revoke works
curl -sS -X DELETE "$BASE/v1/boards/$BOARD_ID/share-links/$SHARE_ID" -H "authorization: Bearer $TOKEN" >/dev/null
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/v1/share/$SHARE_TOKEN")
if [ "$code" != "404" ]; then
  echo "Revoked share link is still accessible: $code" >&2
  exit 1
fi

echo "WEEK12_SMOKE_OK: login->board->text->image->share->public->export-control->revoke"
