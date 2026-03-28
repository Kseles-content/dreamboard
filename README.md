# DreamBoard MVP (Day 5 scope freeze)

NestJS backend with stable MVP scope: **Auth + Boards CRUD**.

## Run locally

```bash
npm install
npm run build
npm run migration:run
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

## Week 2 status

✅ Auth + Boards реализованы, тесты проходят, CI зелёный, демо доступно через scripts/demo-check.sh


## Week 6 status

✅ Web editor now includes autosave (800ms debounce), undo/redo history (depth 50), dirty-state + before-unload warning, and save-retry UX.

See: `apps/web/README.md` for runbook and tests.
