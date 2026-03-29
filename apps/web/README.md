# DreamBoard Web — Editor core v1 (Week 6)

Stage 3 focus: text-card editor + autosave + history + data-loss protection.

## Features
- Login
- Boards list
- Open board
- Add text card
- Edit text card
- Delete text card
- **Autosave with 800ms debounce** (no save on every key/action burst)
- **Undo/Redo history (depth 50)**
- **Dirty state indicator** (Unsaved changes / All changes saved)
- **Before-unload protection** for unsaved changes
- **Save retry UX** on API failure
- History persisted in localStorage per board

## Run
```bash
cd apps/web
npm ci
npm run dev
```
Open http://localhost:3100

API default: `http://localhost:3000` (editable on login screen).

## Build/Test
```bash
cd apps/web
npm run build
npm run test
```

`npm run test` includes:
- history unit tests
- autosave debounce timing test (800ms idle window)
