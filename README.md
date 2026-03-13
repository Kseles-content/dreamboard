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

- `GET /users`
- `POST /users`
- `GET /boards?ownerUserId=...`
- `POST /boards`
