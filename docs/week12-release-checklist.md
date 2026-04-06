# Week 12 Release Checklist (Controlled RC)

## Pre-release
- [ ] `git pull` on release branch and verify clean working tree
- [ ] Install deps: `npm ci` and `npm --prefix apps/web ci`
- [ ] Build backend: `npm run build`
- [ ] Build web: `npm --prefix apps/web run build`

## Validation gates
- [ ] Unit tests green: `npm test -- --runInBand`
- [ ] E2E tests green: `npm run test:e2e -- --runInBand`
- [ ] Web smoke green: `npm --prefix apps/web run test`
- [ ] Critical smoke flow green: `bash scripts/week12-critical-smoke.sh`
- [ ] Perf baseline report present: `docs/week11-perf-report.md`

## Observability readiness
- [ ] `NEXT_PUBLIC_SENTRY_DSN` configured in target env
- [ ] `NEXT_PUBLIC_POSTHOG_KEY` configured in target env
- [ ] `NEXT_PUBLIC_POSTHOG_HOST` set (or default used)
- [ ] Manual `Test Sentry Error` event appears in Sentry
- [ ] PostHog receives events: login/create_board/create_card/upload_image/create_share_link/export_board

## Release-candidate cut
- [ ] Mark RC commit SHA in report (Week 12)
- [ ] Ensure PR checks are green
- [ ] Freeze scope (no new features)
