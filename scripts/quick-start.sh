#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[quick-start] DreamBoard bootstrap"

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[quick-start] Missing dependency: $1"
    exit 1
  fi
}

need_cmd node
need_cmd npm
need_cmd docker

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD="docker-compose"
else
  echo "[quick-start] Missing docker compose (docker compose / docker-compose)."
  exit 1
fi

echo "[quick-start] Using compose command: $COMPOSE_CMD"

if [[ ! -f .env ]]; then
  echo "[quick-start] .env not found; creating from .env.example"
  cp .env.example .env
fi

echo "[quick-start] Starting PostgreSQL via compose..."
$COMPOSE_CMD up -d db

echo "[quick-start] Waiting for PostgreSQL to be ready..."
for _ in {1..60}; do
  if $COMPOSE_CMD exec -T db pg_isready -U dreamboard -d dreamboard >/dev/null 2>&1; then
    break
  fi
  sleep 1
done

if ! $COMPOSE_CMD exec -T db pg_isready -U dreamboard -d dreamboard >/dev/null 2>&1; then
  echo "[quick-start] PostgreSQL is not ready."
  exit 1
fi

echo "[quick-start] Installing backend dependencies..."
npm install

echo "[quick-start] Installing web dependencies..."
(
  cd apps/web
  npm install
)

echo "[quick-start] Running migrations..."
npm run migrate:prod

echo "[quick-start] Seeding templates/data..."
npm run seed

echo "[quick-start] Starting API (http://localhost:3000)..."
nohup npm run start:dev >/tmp/dreamboard-api.log 2>&1 &
API_PID=$!

echo "[quick-start] Starting Web (http://localhost:3100)..."
(
  cd apps/web
  nohup npm run dev >/tmp/dreamboard-web.log 2>&1 &
)

sleep 2

echo "[quick-start] API PID: $API_PID"
echo "[quick-start] Logs: /tmp/dreamboard-api.log, /tmp/dreamboard-web.log"
echo "[quick-start] Done. Open http://localhost:3100"
