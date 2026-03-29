# Week 4 Proof Pack — Stage 2 Stability

## Mobile user flows (real API, no mocks)

Base URL: `http://localhost:3000` (editable on login screen for staging URL)

1. **Login**
   - UI: `DreamBoard Login` screen
   - API: `POST /v1/auth/login`
   - Result: access/refresh tokens saved in SharedPreferences

2. **Boards list**
   - UI: `Boards` screen opens after successful login
   - API: `GET /v1/boards?limit=50`
   - States: loading, empty (`No boards yet`), error + retry

3. **Create board**
   - UI: `Create board` dialog
   - API: `POST /v1/boards`
   - Result: snackbar `Board created.` and refreshed list

4. **Open board**
   - UI: tap board row, details dialog opens
   - API: `GET /v1/boards/:id`

5. **Delete board**
   - UI: delete button + confirm dialog
   - API: `DELETE /v1/boards/:id`
   - Result: snackbar `Board deleted.` and refreshed list

6. **Logout**
   - UI: logout action in app bar
   - API: `POST /v1/auth/logout`
   - Result: tokens cleared, app returns to login

## Error handling coverage

- `400` → user message: `Bad request. Please check your input.`
- `401` → session reset + login prompt
- `403` → `Forbidden for this account.`
- `404` → `Resource not found.`
- `500` → `Server error. Please retry later.`

## Request/response logging

- Mobile: `debugPrint` logs on each request/response in `ApiClient._request`.
- Backend: Nest HTTP middleware logs method/url/status/duration/requestId.

## API contract alignment

Frozen contract source: `packages/contracts/openapi/openapi.yaml`

Covered endpoints in mobile code:
- `/v1/auth/login`
- `/v1/auth/logout`
- `/v1/boards` (GET/POST)
- `/v1/boards/{boardId}` (GET/DELETE)

## CLI proof commands

Backend health/demo:

```bash
bash scripts/demo-check.sh
```

Backend e2e:

```bash
npm run test:e2e
```

Mobile static checks:

```bash
cd apps/mobile
/opt/flutter/bin/flutter pub get
/opt/flutter/bin/flutter analyze
/opt/flutter/bin/flutter test
```
