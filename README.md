# DreamBoard Day 2

NestJS backend implementing Day 1 contracts for users and boards.

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

## API

### Auth
- `POST /v1/auth/login`
- `POST /v1/auth/refresh`
- `POST /v1/auth/logout`

### Boards (JWT required)
- `GET /boards`
- `POST /boards`
- `GET /boards/:id`
- `DELETE /boards/:id`

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
curl -s -X POST http://localhost:3000/boards \
  -H 'authorization: Bearer <TOKEN>' \
  -H 'content-type: application/json' \
  -d '{"title":"Roadmap","description":"Q2"}'
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
