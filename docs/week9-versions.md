# Week 9 — Board Versions (Snapshots + Restore)

## Endpoints

- `GET /v1/boards/{boardId}/versions?limit=<n>&cursor=<id>`
- `POST /v1/boards/{boardId}/versions`
- `POST /v1/boards/{boardId}/versions/{versionId}/restore`

## curl-proof acceptance flow

### 0) Login

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"versions@example.com","name":"Versions Demo"}' | jq -r .accessToken)
```

### 1) Create board + initial card

```bash
BOARD_ID=$(curl -s -X POST http://localhost:3000/v1/boards \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"title":"Versioned board","description":"initial"}' | jq -r .id)

curl -s -X POST http://localhost:3000/v1/boards/$BOARD_ID/cards \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"text":"v1 text"}'
```

### 2) Create snapshot version (v1)

```bash
VERSION_1=$(curl -s -X POST http://localhost:3000/v1/boards/$BOARD_ID/versions \
  -H "authorization: Bearer $TOKEN" | jq -r .id)
```

### 3) Mutate live board

```bash
curl -s -X PATCH http://localhost:3000/v1/boards/$BOARD_ID \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"title":"Changed title"}'

curl -s -X POST http://localhost:3000/v1/boards/$BOARD_ID/cards \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"text":"v2 text"}'
```

### 4) Create one more version, then list versions (stable pagination)

```bash
curl -s -X POST http://localhost:3000/v1/boards/$BOARD_ID/versions \
  -H "authorization: Bearer $TOKEN"

PAGE1=$(curl -s "http://localhost:3000/v1/boards/$BOARD_ID/versions?limit=1" \
  -H "authorization: Bearer $TOKEN")

echo "$PAGE1" | jq .
CURSOR=$(echo "$PAGE1" | jq -r .nextCursor)

curl -s "http://localhost:3000/v1/boards/$BOARD_ID/versions?limit=1&cursor=$CURSOR" \
  -H "authorization: Bearer $TOKEN" | jq .
```

### 5) Restore old snapshot and verify board is rolled back

```bash
curl -s -X POST http://localhost:3000/v1/boards/$BOARD_ID/versions/$VERSION_1/restore \
  -H "authorization: Bearer $TOKEN" | jq .

curl -s http://localhost:3000/v1/boards/$BOARD_ID \
  -H "authorization: Bearer $TOKEN" | jq .

curl -s http://localhost:3000/v1/boards/$BOARD_ID/cards \
  -H "authorization: Bearer $TOKEN" | jq .
```

Expected: title returns to `Versioned board`, cards return to `v1` set.

### 6) VERSION_NOT_FOUND proof (404)

```bash
curl -i -s -X POST http://localhost:3000/v1/boards/$BOARD_ID/versions/999999/restore \
  -H "authorization: Bearer $TOKEN"
```

Expected body includes:

```json
{
  "code": "VERSION_NOT_FOUND"
}
```
