# Week 10 — Sharing + Public Web View (View-only)

## Endpoints

- `POST /v1/boards/{boardId}/share-links`
- `GET /v1/boards/{boardId}/share-links`
- `DELETE /v1/boards/{boardId}/share-links/{linkId}`
- `GET /v1/share/{token}` (no auth)

## curl-proof acceptance flow

### 0) Login + create board

```bash
TOKEN=$(curl -s -X POST http://localhost:3000/v1/auth/login \
  -H 'content-type: application/json' \
  -d '{"email":"share@example.com","name":"Share Demo"}' | jq -r .accessToken)

BOARD_ID=$(curl -s -X POST http://localhost:3000/v1/boards \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"title":"Public board","description":"Week 10"}' | jq -r .id)

curl -s -X POST http://localhost:3000/v1/boards/$BOARD_ID/cards \
  -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"text":"hello share"}' | jq .
```

### 1) Create share link

```bash
SHARE=$(curl -s -X POST http://localhost:3000/v1/boards/$BOARD_ID/share-links \
  -H "authorization: Bearer $TOKEN")

echo "$SHARE" | jq .
LINK_ID=$(echo "$SHARE" | jq -r .id)
SHARE_TOKEN=$(echo "$SHARE" | jq -r .token)
```

### 2) List owner links

```bash
curl -s http://localhost:3000/v1/boards/$BOARD_ID/share-links \
  -H "authorization: Bearer $TOKEN" | jq .
```

### 3) Public view-only data by token (no auth)

```bash
curl -s http://localhost:3000/v1/share/$SHARE_TOKEN | jq .
```

### 4) Revoke link

```bash
curl -s -X DELETE http://localhost:3000/v1/boards/$BOARD_ID/share-links/$LINK_ID \
  -H "authorization: Bearer $TOKEN" | jq .
```

### 5) Verify revoked link is inaccessible

```bash
curl -i -s http://localhost:3000/v1/share/$SHARE_TOKEN
```

Expected: `404` with `code = SHARE_LINK_NOT_FOUND`

### 6) Unauthorized private endpoint rejection proof

```bash
curl -i -s http://localhost:3000/v1/boards/$BOARD_ID
```

Expected: `401` (private data remains protected).

## Web

- Editor panel now supports share-link management (create/copy/revoke).
- Public page implemented at `apps/web/pages/share/[token].js` (view-only, no edit controls).
