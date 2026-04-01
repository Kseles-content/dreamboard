# Day 4 — Release Gate / Demo Evidence

## Goal
Unblock progress when no public staging exists, while keeping proof-based delivery.

## Environment policy
- `NO_STAGING` mode is active for current phase.
- External reachability check is replaced by local demo evidence.

## Done criteria for this phase
1. New commit in active branch.
2. Active PR is open.
3. All PR checks are green.
4. Demo evidence exists and is reproducible locally.

## Demo evidence (local)
Run:

```bash
bash scripts/demo-check.sh
```

Expected:
- API starts locally
- `GET /health` returns `{ "status": "ok" }`
- command exits `0`

## Notes
Once real staging URL is available, switch from `NO_STAGING` back to reachability checks.
