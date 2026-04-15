# DreamBoard MVP (Day 5 scope freeze)

NestJS backend with stable MVP scope: **Auth + Boards CRUD**.

## Run locally

```bash
cp .env.example .env
npm install
npm run build
npm run migrate:prod
npm run start
```

## Test

```bash
npm test
npm run test:e2e
```

## Contracts / Specs

- `packages/contracts/json-schema/board-state-v1.schema.json`
- `packages/contracts/json-schema/board-state-v2.schema.json` *(prepared for next stage, not in Day 5 MVP scope)*
- `docs/day3-interactive-board-spec.md` *(next stage input)*
- `docs/day4-release-gate.md`
- `docs/week9-versions.md`
- `docs/week10-sharing.md`
- `docs/week11-perf-report.md`
- `docs/week12-test-matrix.md`
- `docs/week12-release-checklist.md`
- `docs/week12-rollback-checklist.md`
- `docs/week12-proof-pack.md`

## S3 / MinIO upload configuration

Set these variables in `.env`:

- `S3_BUCKET`
- `S3_REGION`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `STORAGE_UPLOAD_BASE_URL` (base URL used for presigned upload intents)
- `STORAGE_PUBLIC_BASE_URL` (base URL for public asset links)
- `PUBLIC_WEB_BASE_URL`

Upload flow:
1. `POST /v1/boards/:boardId/uploads/intents` creates DB record in `upload_assets` with `INTENT_CREATED` and returns upload URL.
2. Client uploads binary directly to storage via returned URL.
3. `POST /v1/boards/:boardId/uploads/finalize` marks asset as `READY`.

Cleanup orphan/stale uploads:

```bash
npm run cleanup:uploads
```

This removes:
- stale intents (`INTENT_CREATED` older than 24h and not finalized)
- READY assets that are not referenced by any image card

## API

### Auth
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`

### Boards (JWT required)
- `GET /v1/boards` (cursor pagination: `?limit=<n>&cursor=<id>`)
- `POST /v1/boards`
- `GET /v1/boards/:boardId`
- `PATCH /v1/boards/:boardId`
- `DELETE /v1/boards/:boardId` (soft delete)
- `POST /v1/boards/:boardId/uploads/intents` (image upload pre-sign intent)
- `POST /v1/boards/:boardId/uploads/finalize` (mark upload as READY and persist metadata)
- `GET /v1/boards/:boardId/versions` (stable cursor pagination)
- `POST /v1/boards/:boardId/versions` (create snapshot from current live state)
- `POST /v1/boards/:boardId/versions/:versionId/restore` (restore live state from snapshot)
- `GET /v1/boards/:boardId/share-links` (owner: list share links)
- `POST /v1/boards/:boardId/share-links` (owner: create public view-only link)
- `DELETE /v1/boards/:boardId/share-links/:linkId` (owner: revoke link)
- `GET /v1/share/:token` (public view-only board data, no auth)

Limit: max 50 boards per user. On overflow API returns:
- `code: BOARD_LIMIT_REACHED`
- `message`
- `requestId`

## Demo (Day 2)

1) Start server

```bash
npm install
npm run migration:run
npm run start
```

2) Login and get token

```bash
curl -s -X POST http://localhost:3000/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"demo@example.com","name":"Demo"}'
```

3) Create board (replace `<TOKEN>`)

```bash
curl -s -X POST http://localhost:3000/v1/boards \
  -H 'authorization: Bearer <TOKEN>' \
  -H 'content-type: application/json' \
  -d '{"title":"Roadmap","description":"Q2"}'
```

4) List with cursor pagination


5) Create upload intent (replace `<BOARD_ID>`)

```bash
curl -s -X POST http://localhost:3000/v1/boards/<BOARD_ID>/uploads/intents \
  -H 'authorization: Bearer <TOKEN>' \
  -H 'content-type: application/json' \
  -d '{"mimeType":"image/png","sizeBytes":2048,"fileName":"cover.png"}'
```

6) Finalize upload (replace `<BOARD_ID>`)

```bash
curl -s -X POST http://localhost:3000/v1/boards/<BOARD_ID>/uploads/finalize \
  -H 'authorization: Bearer <TOKEN>' \
  -H 'content-type: application/json' \
  -d '{"objectKey":"<OBJECT_KEY>","etag":"etag-demo"}'
```


```bash
curl -s "http://localhost:3000/v1/boards?limit=2" \
  -H 'authorization: Bearer <TOKEN>'
```

4) Health check

```bash
curl -s http://localhost:3000/health
# {"status":"ok"}
```

5) Run tests

```bash
npm test
npm run test:e2e
```

6) Local demo evidence (NO_STAGING mode)

```bash
bash scripts/demo-check.sh
```

7) Heartbeat audit snapshot (commit + PR + checks + demo)

```bash
# optional: export GH_TOKEN to include PR/check status in output
bash scripts/heartbeat-audit.sh
```

## Week 2 status

✅ Auth + Boards реализованы, тесты проходят, CI зелёный, демо доступно через scripts/demo-check.sh


## Week 6 status

✅ Web editor now includes autosave (800ms debounce), undo/redo history (depth 50), dirty-state + before-unload warning, and save-retry UX.

Week 7 progress: backend supports image-card creation from finalized uploads (`type=image`, `objectKey`).

See: `apps/web/README.md` for runbook and tests.

## Week 11 Export (Web)

In web editor (`apps/web/pages/index.js`):
- `Export PNG` button
- `Export JPG` button

Both exports are generated from the current in-editor state (visible cards snapshot).

## Week 11 Observability

Set in `apps/web` environment:

- `NEXT_PUBLIC_SENTRY_DSN` — Sentry DSN (browser error capture)
- `NEXT_PUBLIC_POSTHOG_KEY` — PostHog project key (event capture)
- `NEXT_PUBLIC_POSTHOG_HOST` — optional (default `https://app.posthog.com`)

Key tracked events:
- `login`
- `create_board`
- `create_card`
- `upload_image`
- `create_share_link`
- `export_board`

Manual Sentry smoke check:
- Use `Test Sentry Error` button in web editor.

## Week 11 Performance Baseline

Generate perf report:

```bash
bash scripts/perf-baseline-week11.sh
```

Report output:
- `docs/week11-perf-report.md`

## Week 12 Stabilization (Final RC)

Critical scenario smoke:

```bash
bash scripts/week12-critical-smoke.sh
```

Release controls:
- `docs/week12-release-checklist.md`
- `docs/week12-rollback-checklist.md`

Final proof pack:
- `docs/week12-proof-pack.md`
