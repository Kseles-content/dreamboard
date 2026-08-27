# DreamBoard v15 — Sync Architecture Specification (approved)

**Status:** APPROVED (Stage 7A revision accepted 2026-08-27)
**Baseline:** DreamBoard v14 production `main@a7d7c4f`, local-first vanilla SPA (GitHub Pages)
**Scope of this document:** replaces the previous `SUPABASE_ARCHITECTURE.md` draft (v1.0, 2026-06-06) which predates v14 and must not be executed literally.
**Stage:** 7B–7E implementation follows; Stage 7B and the Supabase project are NOT started yet.

---

## 1. Product principles (from DREAMBOARD_V15_PRODUCT_SYNC_PLAN.md)

1. **No account required.** A guest remains fully local. No anonymous cloud user, database row or image upload is created without an explicit choice.
2. **Local-first remains the operating model.** Local state is the working copy, always readable/writable offline. Cloud is an optional encrypted transport/backup and multi-device replica, never a reason to block the UI.
3. **No silent replacement.** Sign-in never overwrites local or cloud data automatically. The user sees what was found and chooses an action.
4. **Collect the minimum.** Email is required only for an account. No display name, avatar, public username, contacts, analytics or social graph in the sync MVP.
5. **Private by default.** Boards, images, trash and journal/gratitude text are private. Sharing is a later explicit feature.
6. **Every server mutation is recoverable.** Keep local state, JSON export and version snapshots. Never clear local data automatically, including after migration.
7. **Useful before clever.** Daily visual focus, next steps and reliable sync outrank AI generation, social feeds and collaboration.

## 2. Approved architecture decisions (binding)

| # | Decision | Value |
|---|----------|-------|
| D1 | Operating model | **Local-first forever.** localStorage/IndexedDB are the working copy before and after sync; never cleared automatically. |
| D2 | Cloud role | Optional voluntary replica/backup, multi-device sync. No UI blocking on cloud state. |
| D3 | MVP data model | **Snapshot-first**: one row per board, `state jsonb` + `trash jsonb` envelope, `revision`, `updated_by_device`. |
| D4 | Conflict control | **CAS** via an atomic SQL/RPC function. No LWW, no auto-merge, no hidden field merge. |
| D5 | Conflict UX | Automatic snapshots; user chooses **local / cloud / save-both (two boards)**. |
| D6 | Local conflict history | Conflict versions stored in a **separate IndexedDB store** on the device (never auto-deleted). |
| D7 | Server-side privacy | **RLS + server-side encryption at rest for MVP.** Schema is encryption-ready, but client-side E2EE is NOT enabled. |
| D8 | Region | **EU** project region. |
| D9 | Auth MVP | Email + password, email confirmation, password reset. Magic link later (after custom SMTP). |
| D10 | Abuse protection | **Cloudflare Turnstile** for signup, login and recovery. Generic auth errors, rate limits. |
| D11 | SMTP | **Resend only after a verified sender domain.** Built-in Supabase SMTP is not production-usable (team addresses only, ~2 msg/h, no SLA). |
| D12 | Guests | Fully local. No Supabase anonymous account, no rows in `auth.users`, no uploads until explicit opt-in. |
| D13 | Profiles | **No `profiles`/username/avatar table.** FK directly on `auth.users(id)` is sufficient for the MVP. |
| D14 | SDK supply | **Self-hosted pinned Supabase JS SDK** and **self-hosted pinned html2canvas** (vendored, integrity-checked, precached). No runtime CDN dependencies. |
| D15 | Frontend security | CSP, XSS and session-token threat model enforced (see `docs/v15-sync-threat-model.md`). |
| D16 | Service role | `service_role` key never enters GitHub Pages, the repository or any client bundle. Only the publishable anon key is public, behind strict RLS. |
| D17 | Legacy backend | Neither root NestJS (`src/`) nor `apps/api` mock is used for production auth. One stack: Supabase. Legacy code untouched until PR-F. |

## 3. Data inventory (what syncs)

| Source | Key / store | Notes |
|--------|-------------|-------|
| State | `dreamboard_app_state` (schemaVersion 2, + `_recovery`) | `dreams[] {id,title,category,year,desc,imageUrl,milestones[{id,text,checked}],status,canvasPos,gratitudeNote}`, `settings`, `uiState` |
| Legacy safety | `dreams_db` (v13) | Read-only fallback; never cleared |
| Viewport | `canvas_pan_x/y`, `canvas_zoom` | Part of board-level state |
| Trash | `dreamboard_trash_v1` | Items `{dream, trashedAt, id}`, MAX_ITEMS; envelope `{formatVersion:1, items:[]}` |
| Images | IndexedDB `dreamboard-local-images`/`images` | Local blobs; external Unsplash URLs are referenced, not uploaded |
| Conflict history (new) | IndexedDB store (e.g. `dreamboard-sync-conflicts`) | Automatic snapshots of every conflict resolution |

## 4. Sync schema (snapshot-first)

Authoritative SQL: `docs/sql/v15-sync-schema.sql` (tables, constraints, RLS, Storage policies, CAS RPC, append-only versions, retention, cross-user tests, rollback).

### 4.1 `sync_documents` — one row per board

- `user_id uuid` — FK `auth.users(id)`, RLS-bound;
- `board_id uuid` — PK component;
- `format_version int` — v14 state contract;
- `schema_version int` — `schemaVersion` from state (2);
- `revision bigint` — CAS counter;
- `state jsonb` — normalized board state;
- `trash jsonb` — envelope `{"formatVersion":1,"items":[]}`;
- `deleted_at timestamptz` — soft-delete marker (tombstone), API contract name `deletedAt`;
- `updated_at timestamptz`;
- `updated_by_device text` — opaque random device id (no fingerprinting);
- PK `(user_id, board_id)`.

### 4.2 `sync_assets` — image metadata only

- `user_id`, `board_id`, `image_id` (logical id from state), private `storage_path`, `mime_type`, `size_bytes`, `content_hash` (dedup), timestamps; UNIQUE `(user_id, board_id, image_id)`. No public URLs; signed URLs only.

### 4.3 `sync_versions` — append-only snapshots

- immutable rows around first migration, conflicts and manual restore; `reason` ∈ `first_migration | conflict_local | conflict_cloud | manual_restore`; `retention_until` (default +30 days) is a **hint only** — no automatic deletion until a separate server-side job exists.

## 5. Conflict protocol

1. Client stores per board `{baseRevision, payload}`.
2. Push calls atomic RPC `sync_push_document(...)` with `base_revision`; the function updates only when `revision = base_revision`, then increments; mismatch or missing row → explicit **conflict** result. Never silent LWW.
3. On conflict: automatic snapshot locally (IndexedDB conflict store + `dreamboard_app_state_recovery`) and in cloud (`sync_versions` via `sync_snapshot()`).
4. UI shows timestamps, device labels, dream counts; user picks **«Оставить локальную» / «Загрузить облачную» / «Сохранить обе как две доски»** (second board = new `board_id` with a copy).
5. Pull by `updated_at > watermark`; `deleted_at` tombstones replicate; physical cleanup is a later server-side job (never automatic in MVP).

## 6. Auth experience

- Guest: «Локально на этом устройстве»; all v14 features unchanged; non-blocking entry «Синхронизировать устройства».
- Registration/sign-in MVP: email + password (min 10 chars), email confirmation, password reset; Turnstile on signup/login/recovery; PKCE via official SDK; «Выйти на этом устройстве»; account & cloud-data deletion flow before public launch.
- Later (not MVP): magic link after custom SMTP; Google login; «Выйти на всех устройствах».

## 7. First sign-in / migration (4 deterministic cases, plan §6)

1. Explicit «Включить синхронизацию» → 2. auth → 3. local safety snapshot (export-compatible) → 4. inspect local board + cloud document **without writing** → 5. present case:
   - **local only** → «Загрузить копию в облако» (push rev=1 + assets with progress/retry/cancel);
   - **cloud only** → «Скачать на это устройство»;
   - **neither** → start empty/onboarding;
   - **both** → compare and choose local/cloud/save-both (no merge).
6. Upload images (dedup by `content_hash`, progress, retry, cancellation) → 7. verify round-trip hashes/counts → 8. mark sync enabled only after verification. **Local data and the safety snapshot are always kept.**

## 8. Delivery stages and gates (from plan §7)

- **7A (done):** audit + approved spec. Gate: User A cannot read/write User B documents/assets; `service_role` absent from frontend.
- **7B (not started):** optional Auth UI, no board upload; feature flag off in production. Gate: guest behavior and 264+ v14 regression unchanged; auth abuse/error/a11y tests pass.
- **7C:** snapshot API/RLS, CAS RPC, version snapshots; local sync adapter + outbox (IndexedDB) behind a feature flag; text-only round trip; offline/reconnect and conflict tests with two simulated devices. Gate: no silent loss; deterministic conflict UI; local editing usable with network disabled.
- **7D:** explicit migration (4 cases) + image sync (dedup, progress, retry, partial-failure recovery), trash semantics; never delete local blobs. Gate: desktop↔Android round trip, hash/count verification, export/import compatibility, quota behavior.
- **7E:** account lifecycle & privacy release (download all data, disable sync without deleting local data, delete account with reauth + grace, privacy notice, retention policy, operational metrics only — no dream content in logs/analytics).

## 9. Frontend security baseline (details in threat model)

- Self-hosted pinned Supabase JS SDK and html2canvas; integrity hashes; precached by service worker; CSP `script-src`/`connect-src` allow only same-origin + `https://<project>.supabase.co` (EU) + Turnstile.
- Session tokens: PKCE; short-lived; revoke-all; CSP mitigates XSS token theft; no third-party scripts at runtime.
- Service worker: new files must join PRECACHE_URLS; bump CACHE_NAME v14 → v15; `skipWaiting`/`clients.claim` already present in v14 SW.
- Secrets: anon key in `config.js` is public by design; `service_role` never in repo/Pages.

## 10. Metrics (no dream content)

Aggregate, consented: guest → first dream completed; sync opt-in rate after value explanation; successful second-device recovery; sync error/conflict rate; weekly return to Today's Dream; milestone completion; wallpaper export counts; deletion/export completion rate. Never collect titles, descriptions, journal text, image URLs/content or canvas contents.

## 11. Open questions for the customer (from 7A audit)

1. E2EE later? (schema is encryption-ready; MVP = RLS + at-rest by decision D7.)
2. Magic link timing (needs custom SMTP with verified domain).
3. Manual cleanup: legacy `apps/api`, `apps/web`, `apps/mobile`, `src/migrations` (TypeORM/SQLite) — removal in PR-F.
4. Render drift (`/health` 404 on live while main has health) — separate investigation, outside sync scope.
