# Week 5 OpenAPI diff (editor core v1)

Added paths for text-card editor operations:

- `GET /v1/boards/{boardId}/cards`
- `POST /v1/boards/{boardId}/cards`
- `PATCH /v1/boards/{boardId}/cards/{cardId}`
- `DELETE /v1/boards/{boardId}/cards/{cardId}`

Server-side validation added:
- max cards per board: **200** (`CARD_LIMIT_REACHED`)
