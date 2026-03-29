# Week 4: DreamBoard Mobile Stability (Stage 2)

Mobile app uses **real API data** (no UI mocks).

## Features

- Login (`POST /v1/auth/login`)
- Boards list (`GET /v1/boards`)
- Create board (`POST /v1/boards`)
- Open board (`GET /v1/boards/:id`)
- Delete board (`DELETE /v1/boards/:id`)
- Token persistence (`SharedPreferences`)
- Logout (`POST /v1/auth/logout`)
- UX states: loading / error / empty
- User feedback: snackbars + confirm dialogs
- Unauthorized handling: session clear + back to login
- Request/response debug logging for API calls

## Run

```bash
cd apps/mobile
/opt/flutter/bin/flutter pub get
/opt/flutter/bin/flutter run
```

Default API URL is `http://localhost:3000` and can be changed on login screen.

## Verify

```bash
cd apps/mobile
/opt/flutter/bin/flutter analyze
/opt/flutter/bin/flutter test
```

See full proof pack: `docs/week4-proof.md`.
