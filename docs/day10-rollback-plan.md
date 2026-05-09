# Day 10 — Rollback Plan

## Rollback triggers

Initiate rollback if any of the following occur after rollout:
- sustained API 5xx rate >2x baseline for 15+ minutes;
- onboarding completion drops >30% from baseline;
- share/public board view fails for >5% attempts;
- severe dashboard regression blocking board creation/open.

## Rollback strategy

### 1) Code rollback

1. Identify last known good main commit (pre-sprint release point).
2. Revert release range or deploy previous release artifact.
3. Run validation gates:
   - `npm test -- --runInBand`
   - `npm run test:e2e -- --runInBand`
   - `bash scripts/demo-check.sh`
4. Redeploy rollback build.

### 2) Data rollback posture

This release introduced additive schema fields/tables:
- `boards.lastOpenedAt`, `boards.isPinned`, `boards.templateId`
- `templates`
- `users.onboardedAt`

Because changes are additive, emergency rollback should prioritize **application rollback first**.
DB rollback/migration down should be done only with explicit DBA confirmation.

### 3) Operational steps

- Freeze merges to `main` until stability restored.
- Disable rollout progression (if staged rollout in progress).
- Communicate incident + rollback ETA.
- Capture incident notes and root-cause for next sprint.

## Branches/tags to preserve

Keep these refs for traceability:
- `main` (contains merged release state)
- `feature/day-3-api` (contains Days 3–5+ progression history)
- PR merge snapshot: PR #8 merge point

Recommended release tags:
- `release/day10-ready`
- `release/day10-rollback-base`

(If tags are not yet created, create them before production rollout.)
