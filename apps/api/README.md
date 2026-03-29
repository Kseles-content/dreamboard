# DreamBoard API (NestJS)

## Run locally

```bash
cd apps/api
npm install
npm run start:dev
```

API starts on `http://localhost:3000` by default.

## Health check

```bash
curl http://localhost:3000/health
```

Expected response:

```json
{ "status": "ok" }
```
