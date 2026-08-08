# Day 10 Follow-up — CI Visibility & Staging Plan

## Why
Current heartbeat reports show:
- no active checks on `feature/day-2`;
- no confirmed staging environment;
- reliance on local demo evidence only.

This follow-up defines concrete steps to remove the BLOCKED signal in operational updates.

## 1) CI visibility hardening

1. Ensure pull_request workflows trigger on all active branches:
   - `main`
   - `feature/**`
2. Require status checks in branch protection for main:
   - contracts-check
   - api-build
   - api-unit-tests
   - api-e2e-tests
   - web-build
   - mobile-analyze-build
3. Add a lightweight `heartbeat-smoke` check that always runs on PRs and executes:
   - `bash scripts/demo-check.sh`

## 2) Staging baseline

1. Provision one persistent staging URL.
2. Add env docs:
   - where API URL is configured
   - how to rotate secrets
   - who owns staging uptime
3. Add a simple uptime probe endpoint check to CI (non-blocking first, then blocking after burn-in).

## 3) Definition of DONE for operational updates

Operational status can be reported as DONE only when all are true:
1. Fresh commit exists in active work block.
2. Active PR exists and is updated.
3. CI checks are reported and green (or explicitly acknowledged flaky with owner).
4. Demo evidence exists (`DEMO_OK`), and staging check is either:
   - reachable, or
   - explicitly marked NO_STAGING with local demo evidence attached.

## Owner checklist (next session)
- [ ] Add/update CI workflow triggers for PR branches.
- [ ] Configure required checks on main.
- [ ] Add `heartbeat-smoke` workflow job.
- [ ] Create staging runbook and endpoint ownership note.
