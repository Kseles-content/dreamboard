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
