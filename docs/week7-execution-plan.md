# Week 7 Execution Plan — Image Uploads + Image Cards

## Objective
Deliver Stage 4 (image cards) with real upload flow, backend-enforced constraints, and end-to-end evidence.

## Scope (frozen for Week 7)
1. Upload constraints and errors on backend:
   - max asset size = 10 MB
   - allowed mime types = `image/jpeg`, `image/png`, `image/webp`
   - error codes: `ASSET_TOO_LARGE`, `UNSUPPORTED_ASSET_TYPE`
2. Image card support:
   - card model supports `type: text | image`
   - API supports image-card creation
   - web renders image cards
   - mobile image rendering if feasible (non-blocking for acceptance)
3. Web upload flow:
   - file picker → upload intent → binary upload → finalize → create image card
   - upload progress indicator
   - preview after successful upload
4. Evidence:
   - README updates
   - API e2e for intent/finalize + constraints
   - integration test for image card creation and persistence
   - curl runbook for full upload flow

---

## Delivery strategy (bottom-up)

### Slice 1 — Backend hardening (constraints + error semantics)
**Goal:** backend is source of truth for upload rules.

**Tasks**
- Enforce size check in upload intent path.
- Enforce mime whitelist in upload intent path.
- Return machine codes:
  - `ASSET_TOO_LARGE`
  - `UNSUPPORTED_ASSET_TYPE`
- Keep behavior isolated to image upload flow (no impact on text cards).

**Files (expected)**
- `src/boards/boards.service.ts`
- `src/boards/dto/create-upload-intent.dto.ts`
- `src/common/http-error.filter.ts` *(if mapping needed)*
- `packages/contracts/openapi/openapi.yaml`
- `test/app.e2e-spec.ts`
- `src/boards/boards.service.spec.ts`

**Done when**
- Intent API rejects oversized and unsupported mime with exact codes.
- Existing tests remain green.

---

### Slice 2 — Image card model + API behavior
**Goal:** cards support `text` and `image` without regression.

**Tasks**
- Expand card shape to include `type`.
- Keep existing text card behavior unchanged.
- Add API path/service function to create image cards from finalized asset metadata.
- Ensure persisted board state keeps image cards after reload.

**Files (expected)**
- `src/boards/boards.service.ts`
- `src/boards/dto/create-card.dto.ts` *(or new dto for image card)*
- `src/boards/dto/update-card.dto.ts` *(if type-safe split needed)*
- `packages/contracts/openapi/openapi.yaml`
- `test/app.e2e-spec.ts`
- `src/boards/boards.service.spec.ts`

**Done when**
- Image card created via API and listed in board cards response.
- Text card flow unchanged and tests still pass.

---

### Slice 3 — Web integration (real upload flow)
**Goal:** user can upload image and see image card in editor.

**Tasks**
- Add `Upload image` action in web editor.
- Implement flow:
  1) select file
  2) request intent
  3) upload binary via intent URL
  4) finalize
  5) create image card bound to finalized asset
- Add upload progress UI and error states.
- Render image cards with preview in card list/editor section.

**Files (expected)**
- `apps/web/pages/index.js`
- `apps/web/lib/*` (upload/client helpers)
- `apps/web/README.md`
- `apps/web/tests/*`

**Done when**
- Image can be uploaded and displayed from real finalized asset URL.
- Reload keeps image cards.

---

## Test plan

### Backend tests
- e2e:
  - intent success
  - finalize success
  - intent fails with `ASSET_TOO_LARGE`
  - intent fails with `UNSUPPORTED_ASSET_TYPE`
- service/unit:
  - card model includes `type`
  - image card creation path
  - no regressions for text card CRUD

### Web tests
- upload helper tests (intent/finalize error mapping)
- integration smoke:
  - image upload flow wires correctly
  - image preview rendering

---

## Daily update format
```
STATUS: IN_PROGRESS|BLOCKED|DONE
COMMIT_SHA: <latest>
PR: <url|NONE>
CHECKS: <green|running|failing>
DEMO: <local|n/a>
TEST_REPORT: <yes|no>
BLOCKER: <details|none>
```

## Friday acceptance target
All items in Week 7 checklist closed, with backend-enforced constraints and real upload evidence.

## Risks and mitigations
- **Risk:** upload URL semantics differ in real storage.
  - **Mitigation:** keep adapter boundary + explicit curl validation.
- **Risk:** card schema change breaks old text cards.
  - **Mitigation:** backward-compatible parser and migration-safe defaults.
- **Risk:** UI complexity in one file (`pages/index.js`).
  - **Mitigation:** split into `lib/upload.js` + `lib/cards.js` incrementally.
