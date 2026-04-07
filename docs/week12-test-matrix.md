# Week 12 Test Matrix (Release Readiness)

## Critical scenario
- [x] login
- [x] create board
- [x] add text card
- [x] add image card (intent + finalize + create image card)
- [x] create share link
- [x] open public page by token
- [x] export PNG control present in web editor
- [x] revoke share link and confirm public 404

Validation command:

```bash
bash scripts/week12-critical-smoke.sh
```

## Automated suites
- [x] Unit tests: `npm test -- --runInBand`
- [x] E2E tests: `npm run test:e2e -- --runInBand`
- [x] API build: `npm run build`
- [x] Web build: `npm --prefix apps/web run build`
- [x] Web smoke: `npm --prefix apps/web run test`

## Bug status
- P0: 0 open
- P1: none blocking RC
