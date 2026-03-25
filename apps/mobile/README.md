# Week 3: Flutter mobile app for DreamBoard

Implemented real API flow (no mocks in UI):

- Login (`POST /v1/auth/login`)
- Boards list (`GET /v1/boards`)
- Create board (`POST /v1/boards`)
- Open board (`GET /v1/boards/:id`)
- Delete board (`DELETE /v1/boards/:id`)
- Token persistence (SharedPreferences)
- Logout flow (`POST /v1/auth/logout`)
- Loading / error / empty states

Base URL is editable on login screen (default `http://localhost:3000`).

## Run

```bash
cd apps/mobile
flutter pub get
flutter run
```

Backend should run locally (or point Base URL to staging).
