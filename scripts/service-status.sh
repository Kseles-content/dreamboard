#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
elif docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
else
  echo "[service] docker-compose (or docker compose) not found"
  exit 1
fi

cmd="${1:-status}"
service="${2:-}"

case "$cmd" in
  up)
    "${COMPOSE[@]}" up -d
    ;;
  down)
    "${COMPOSE[@]}" down
    ;;
  restart)
    if [[ -n "$service" ]]; then
      "${COMPOSE[@]}" restart "$service"
    else
      "${COMPOSE[@]}" restart
    fi
    ;;
  status)
    "${COMPOSE[@]}" ps
    ;;
  logs)
    if [[ -n "$service" ]]; then
      "${COMPOSE[@]}" logs -f "$service"
    else
      "${COMPOSE[@]}" logs -f
    fi
    ;;
  *)
    cat <<EOF
Usage: bash scripts/service-status.sh <command> [service]

Commands:
  up                 Start all services in background
  down               Stop all services
  restart [service]  Restart all services or one service (api|web|db)
  status             Show service status
  logs [service]     Follow logs for all services or one service
EOF
    exit 1
    ;;
esac
