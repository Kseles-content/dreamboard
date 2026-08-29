#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [ ! -d node_modules ]; then
  npm ci
fi

PORT="${PORT:-3000}"
fuser -k ${PORT}/tcp >/dev/null 2>&1 || true
PORT="$PORT" npm run start:dev >/tmp/dreamboard-api.log 2>&1 &
API_PID=$!

cleanup() {
  kill "$API_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for _ in {1..90}; do
  if curl -fsS "http://127.0.0.1:${PORT}/health" >/tmp/dreamboard-health.json 2>/dev/null; then
    break
  fi
  sleep 1
done

if ! grep -q '"status":"ok"' /tmp/dreamboard-health.json; then
  echo "Health check failed"
  echo "--- health payload ---"
  cat /tmp/dreamboard-health.json || true
  echo "--- api log tail ---"
  tail -n 120 /tmp/dreamboard-api.log || true
  exit 1
fi

echo "DEMO_OK: $(cat /tmp/dreamboard-health.json)"
