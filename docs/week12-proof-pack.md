# Week 12 Final Proof Pack

## Core reports
- Week 9 versions: `docs/week9-versions.md`
- Week 10 sharing: `docs/week10-sharing.md`
- Week 11 performance baseline: `docs/week11-perf-report.md`
- Week 12 test matrix: `docs/week12-test-matrix.md`

## Release controls
- Release checklist: `docs/week12-release-checklist.md`
- Rollback checklist: `docs/week12-rollback-checklist.md`

## Verification scripts
- Demo check: `scripts/demo-check.sh`
- Perf baseline: `scripts/perf-baseline-week11.sh`
- Critical smoke: `scripts/week12-critical-smoke.sh`

## Observability evidence points
- Sentry trigger control: `Test Sentry Error` button in `apps/web/pages/index.js`
- PostHog/Sentry integration module: `apps/web/lib/observability.js`
- Tracked events: login, create_board, create_card, upload_image, create_share_link, export_board

## Final RC pointer
- RC commit is set in Week 12 delivery report (same branch/PR pipeline).
