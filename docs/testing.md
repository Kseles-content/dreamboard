# TESTING — DreamBoard v1.0

## Automated tests

### 1) Unit/integration (Jest)
```bash
npm test
```

### 2) End-to-end (API, 14 tests)
```bash
npm run test:e2e -- --runInBand
```

Expected: `14 passed, 14 total`.

### 3) Smoke test (critical API flow)
```bash
bash scripts/smoke-test.sh
```

Checks:
- `/health` responds `200`
- login works
- board creation works
- card creation works

### 4) Demo check
```bash
bash scripts/demo-check.sh
```

---

## CI validation

CI workflow: `.github/workflows/ci.yml`

Includes:
- build checks
- unit tests
- e2e tests
- smoke test step (`scripts/smoke-test.sh`)

---

## Manual critical scenario checklist

Use web (`http://localhost:3100`) + API (`http://localhost:3000`):

1. Login in web app.
2. Create empty board.
3. Create board from template.
4. Add text card; edit card; delete card.
5. Create share link; open public share URL.
6. Export board as PNG and JPG.
7. Use search and filters on boards list.
8. Re-open dashboard and verify resume flow (Continue where you left off).

If all steps pass, critical user flow is accepted.
