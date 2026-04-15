# QA Strategy Matrix — UX Sprint Day 1

Date: 2026-04-15 (UTC)
Owner: QA
Scope: API contracts + UX flows defined for kickoff

## Test levels

- **Contract tests**: endpoint request/response schema compliance
- **Integration tests**: API + DB behavior (pin/recent/template-derived board)
- **E2E/UI smoke**: onboarding, dashboard, empty-state paths
- **Regression checks**: existing auth/boards CRUD unchanged

## Environment

- Local dev: Node 22 + PostgreSQL
- CI: GitHub Actions with Postgres service for e2e
- Test data: seeded templates (`goal`, `moodboard`, `sprint`)

## Matrix

| Area | Scenario | Type | Priority | Expected result |
|---|---|---|---|---|
| API recent | `GET /v1/boards/recent` with default params | Contract+Integration | P0 | 200 + `items[]` with `isPinned/lastOpenedAt` fields |
| API recent search | `q` filters by title | Integration | P1 | Only matching boards returned |
| Pin board | `POST /v1/boards/{id}/pin` pinned=true | Contract+Integration | P0 | 200 + state persisted |
| Unpin board | pinned=false | Integration | P1 | Board removed from pinned section |
| Templates list | `GET /v1/templates` | Contract | P0 | 200 + scenario enum valid |
| Template filter | `scenario=sprint` | Integration | P1 | Only sprint templates returned |
| Create from template | `POST /v1/boards/from-template` | Contract+Integration | P0 | 201 + board created with template seed |
| Create from bad template | unknown templateId | Integration | P1 | 404 + machine-readable error |
| Onboarding flow | select scenario → template → create | E2E/UI smoke | P0 | Redirect to board without errors |
| Home dashboard | Recent/Pinned/Search interaction | E2E/UI smoke | P0 | Sections consistent with API state |
| Empty state | new board with no cards | UI smoke | P1 | Empty state CTAs visible and actionable |
| Regression | auth + boards CRUD old flow | Regression | P0 | Existing tests remain green |

## Risks and mitigations

1. **Contract drift between FE and BE**
   - Mitigation: OpenAPI v1 source of truth + CI contract check.
2. **Template seed mismatch by env**
   - Mitigation: deterministic seed script used in CI and local.
3. **Pinned ordering inconsistencies**
   - Mitigation: explicit sorting rules in API and FE (pinned first, then recent).

## Exit criteria for Day 1

- OpenAPI contains all 4 endpoint contracts.
- UX flow docs available in `docs/ux/`.
- QA matrix available in `docs/qa/`.
- No regression in baseline CI jobs.
