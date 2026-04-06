#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

DB_PATH="/tmp/dreamboard-perf-week11.sqlite"
PORT=3000
BASE="http://127.0.0.1:${PORT}"
N=40

rm -f "$DB_PATH"

DB_PATH="$DB_PATH" JWT_SECRET="perf-secret" PORT="$PORT" npm run start:dev >/tmp/dreamboard-perf.log 2>&1 &
SERVER_PID=$!
trap 'kill $SERVER_PID >/dev/null 2>&1 || true; rm -f "$DB_PATH"' EXIT

for _ in {1..40}; do
  if curl -fsS "$BASE/health" >/dev/null 2>&1; then break; fi
  sleep 0.5
done

login_json=$(curl -sS -X POST "$BASE/v1/auth/login" -H 'content-type: application/json' -d '{"email":"perf@example.com","name":"Perf"}')
TOKEN=$(python3 - <<'PY' "$login_json"
import json,sys
print(json.loads(sys.argv[1])["accessToken"])
PY
)

board_ids=()
for i in $(seq 1 12); do
  board_json=$(curl -sS -X POST "$BASE/v1/boards" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "{\"title\":\"Perf Board $i\",\"description\":\"Dataset\"}")
  board_id=$(python3 - <<'PY' "$board_json"
import json,sys
print(json.loads(sys.argv[1])["id"])
PY
)
  board_ids+=("$board_id")

  for c in $(seq 1 15); do
    curl -sS -X POST "$BASE/v1/boards/$board_id/cards" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "{\"text\":\"Card $c for board $i\"}" >/dev/null
  done

  for v in $(seq 1 4); do
    curl -sS -X POST "$BASE/v1/boards/$board_id/versions" -H "authorization: Bearer $TOKEN" >/dev/null
  done
done

share_json=$(curl -sS -X POST "$BASE/v1/boards/${board_ids[0]}/share-links" -H "authorization: Bearer $TOKEN")
SHARE_TOKEN=$(python3 - <<'PY' "$share_json"
import json,sys
print(json.loads(sys.argv[1])["token"])
PY
)

measure_endpoint() {
  local url="$1"
  local with_auth="$2"
  local outfile="$3"
  : > "$outfile"
  for _ in $(seq 1 "$N"); do
    if [ "$with_auth" = "1" ]; then
      t=$(curl -o /dev/null -sS -w '%{time_total}' -H "authorization: Bearer $TOKEN" "$url")
    else
      t=$(curl -o /dev/null -sS -w '%{time_total}' "$url")
    fi
    echo "$t" >> "$outfile"
  done
}

calc_percentiles() {
  local file="$1"
  python3 - <<'PY' "$file"
import sys
vals=[float(x.strip()) for x in open(sys.argv[1]) if x.strip()]
vals.sort()
def pct(p):
    if not vals: return 0.0
    idx=max(0,min(len(vals)-1,int(round((p/100)*(len(vals)-1)))))
    return vals[idx]*1000
print(f"{pct(50):.2f} {pct(95):.2f}")
PY
}

measure_endpoint "$BASE/v1/boards?limit=20" 1 /tmp/perf_boards.txt
measure_endpoint "$BASE/v1/boards/${board_ids[0]}" 1 /tmp/perf_board_one.txt
measure_endpoint "$BASE/v1/boards/${board_ids[0]}/versions?limit=20" 1 /tmp/perf_versions.txt
measure_endpoint "$BASE/v1/share/$SHARE_TOKEN" 0 /tmp/perf_share.txt

read p50_boards p95_boards < <(calc_percentiles /tmp/perf_boards.txt)
read p50_board_one p95_board_one < <(calc_percentiles /tmp/perf_board_one.txt)
read p50_versions p95_versions < <(calc_percentiles /tmp/perf_versions.txt)
read p50_share p95_share < <(calc_percentiles /tmp/perf_share.txt)

cat > docs/week11-perf-report.md <<EOF
# Week 11 Performance Baseline

Environment:
- Local machine (single-node), NestJS + SQLite
- Requests per endpoint: $N

Dataset used:
- Boards: 12
- Cards: 180 (15 per board)
- Versions: 48 (4 per board)
- Share links: 1 active token

Latency (ms):

| Endpoint | p50 | p95 |
|---|---:|---:|
| GET /v1/boards | $p50_boards | $p95_boards |
| GET /v1/boards/{boardId} | $p50_board_one | $p95_board_one |
| GET /v1/boards/{boardId}/versions | $p50_versions | $p95_versions |
| GET /v1/share/{token} | $p50_share | $p95_share |

Method:
- Sequential curl sampling against local API
- p50/p95 computed from sorted sample arrays
EOF

echo "Generated docs/week11-perf-report.md"
