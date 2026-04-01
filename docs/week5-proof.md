# Week 5 Proof — Web editor core v1

## User flows
1. Login to API from web app.
2. Load boards list from `/v1/boards`.
3. Open selected board and load cards from `/v1/boards/{boardId}/cards`.
4. Add text card via `POST /v1/boards/{boardId}/cards`.
5. Edit text card via `PATCH /v1/boards/{boardId}/cards/{cardId}`.
6. Delete text card via `DELETE /v1/boards/{boardId}/cards/{cardId}`.
7. Refresh/open board again: cards remain persisted.

## Notes
- No mock data in UI.
- Card limit set to 200 on backend.
- Contract updated in `packages/contracts/openapi/openapi.yaml`.

## Suggested screenshot/gif capture
- Login screen
- Boards list
- Open board with cards
- Edit/Delete card action
