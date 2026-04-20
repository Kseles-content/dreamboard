# DreamBoard v1.0 — Release Notes

## Summary
DreamBoard v1.0 is ready for handoff with stable core functionality, automated test coverage, and deployment/run documentation.

## Key features

### Core product
- Authentication (login, refresh, logout, token revoke).
- Boards CRUD (create/read/update/soft-delete).
- Cards CRUD (create/edit/delete).
- Templates and board creation from template.
- Resume flow (`lastOpenedAt`, recent boards, continue from dashboard).
- Search and filters (`query`, `pinned`, `updatedSince`, cursor pagination).
- Share links with public view-only page.
- Board export from web UI (PNG/JPG).

### Platform and reliability
- Unified API error envelope with machine-readable codes.
- E2E API suite passing (14/14).
- CI includes smoke scenario (`scripts/smoke-test.sh`).
- One-command environment bootstrap via `docker-compose up`.
- Local bootstrap script `scripts/quick-start.sh`.

### Handoff artifacts
- DoD: `docs/dod-v1.0.md`
- Export evidence: `docs/export-evidence.md`
- Runbook: `docs/runbook.md`
- Testing guide: `docs/testing.md`
- Known issues: `docs/known-issues.md`

## Known issues
See: `docs/known-issues.md` (P2/P3 only, non-blocking for release).

## Recommended next steps after handoff
1. Add dedicated staging environment.
2. Add server-side export endpoint (optional) for automation workflows.
3. Keep CI/docs cleanup and naming alignment.
