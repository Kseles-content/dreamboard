# DreamBoard Web — Editor core v1 (Week 7)

Stage 4 focus: image uploads + image cards (with autosave/undo-redo preserved).

## Features
- Login
- Boards list
- Open board
- Add/Edit/Delete text card
- Upload image and create image card
- Upload flow: intent → binary PUT → finalize → image card create via autosave queue
- Upload progress indicator
- Image preview in editor
- Autosave 800ms debounce
- Undo/Redo history depth 50
- Dirty-state and before-unload warning

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
