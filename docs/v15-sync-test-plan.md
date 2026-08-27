# DreamBoard v15 — Sync Test Plan

**Status:** approved with Stage 7A (2026-08-27)
**Canonical test runner:** `node --test *.test.js` (TAP; jest is NOT used for these suites — see project lesson from v14).
**Regression baseline:** 264/264 passing on `main@a7d7c4f`; every stage PR must keep 264+ green and CI 6/6 (workflow triggers on `pull_request` to `main`).

---

## 1. Test layers

| Layer | Tooling | Where |
|-------|---------|-------|
| L1 static | `node --check`, markdown/SQL static checks, secrets scan | CI + local |
| L2 unit (client) | `node --test *.test.js` (node:test) | repo root |
| L3 SQL/RLS | `docs/sql/v15-sync-schema.sql` §6 (T1–T9), executed in sandbox | Supabase SQL editor / psql |
| L4 integration | sandbox project (non-production, EU) + browser | Stage 7C+ |
| L5 E2E/device | preview deployment + real devices (TCL 30, desktop) | Stage 7D gates |

## 2. L1 static checks (every docs/ or runtime PR)

- `node --check` on all touched `.js` files.
- Markdown: code fences balanced (even count), no stray control chars, links to referenced files exist.
- SQL: parse-fence balance, sections present (tables/RLS/storage/RPC/retention/tests/rollback), no `DROP` outside the rollback section, no secrets.
- Secrets scan per threat-model §6 (service_role, `eyJ`, private keys, real env values). Fails CI on match.
- Diff checks: only expected files touched (docs PRs: only `docs/**`).

## 3. L2 unit suites (client, local-first)

### 3.1 Existing regression (unchanged)
- `mobile-ux.test.js`, `storage.js`/`storage-status`, `backup-export`, `import`, `performance-lite`, `trash`, `release` — **264 tests, all must stay green**; guest behavior must be byte-identical (no cloud calls, no new storage keys except the new conflict store).

### 3.2 New suites (added with 7B–7D)
- `sync-config.test.js` — config.js loads anon key + project URL; refuses service_role-shaped values; feature flag off by default.
- `sync-auth.test.js` — auth state machine (guest → sign-in → signed-out); no Supabase calls while feature flag off; Turnstile token passed; generic errors (no account enumeration); session persist/restore.
- `sync-cas.test.js` — client CAS bookkeeping: `baseRevision` tracked per board; push sequence; conflict object shape `{conflict:true,currentRevision}`; local snapshot written to the **separate IndexedDB conflict store** (D6) on conflict; no auto-merge branch exists in code (static assert: no LWW/merge functions).
- `sync-migration.test.js` — the four deterministic cases:
  1. local only → «Загрузить копию в облако» (push rev=1);
  2. cloud only → «Скачать на это устройство» (pull, no local writes beyond cache);
  3. neither → onboarding;
  4. both → compare UI offers exactly three actions: local / cloud / save-both (two boards), and no fourth hidden merge path.
  Assert local state + safety snapshot preserved in every case (D1).
- `sync-images.test.js` — dedup by `content_hash`; upload queue with progress/retry/cancel; partial-failure recovery (retry only failed items); path convention `dream-images/{user_id}/...`; no public URLs (only signed).
- `sync-offline.test.js` — offline edits queue to outbox (IndexedDB); reconnect flush; watermark pull; two simulated devices conflict → deterministic UI, no silent loss (7C gate).
- `sync-trash.test.js` — trash envelope `{formatVersion:1,items:[]}` round-trip; `deletedAt` tombstone replication; MAX_ITEMS preserved.
- `sync-security.test.js` — XSS attempts through import/backup/dream content (rendered via textContent only); CSP directive presence; no `eval`/`new Function` on untrusted data; SDK/html2canvas vendored with pinned versions (no CDN origins in `script-src`).

## 4. L3 SQL/RLS cross-user suite (A/B/anon)

Executed in the **sandbox project only** (never production). Source: `docs/sql/v15-sync-schema.sql` §6.

| Test | Assertion |
|------|-----------|
| T1 | A creates document (base=0) → ok, revision 1 |
| T2a/b/c | A sees 1 row; B sees 0; anon sees 0 |
| T3 | A push base=1 → ok, revision 2 |
| T4 | A push stale base=1 → conflict, currentRevision=2 |
| T5 | B UPDATE of A row → 0 rows |
| T6 | B INSERT with user_id=A → denied (42501) |
| T7 | versions: snapshot ok; UPDATE/DELETE denied (append-only) |
| T8 | ≥4 Storage policies present for `dreamboard-assets` |
| T9 | CAS insert conflict (base=0 on existing board) → conflict |

Additional manual checks (sandbox): upload as A to `dream-images/B-...` → rejected; signed URL for A's object rendered by B → 403; `service_role` used only from SQL editor/CI (not from any client).

## 5. L4/L5 integration & device gates

- **7C gate:** text-only round trip desktop↔simulated-device; offline editing usable with network disabled; conflict UI deterministic; no silent loss.
- **7D gate:** desktop↔Android (TCL 30) round trip with images; image hashes/counts match; export/import compatibility; quota behavior (IndexedDB pressure); trash and shared-image reference semantics preserved; local blobs never deleted.
- **7E gate:** download-all-data complete; disable sync keeps local data; account deletion with reauth + grace; export/security review; incident rollback drill.
- **SMTP production gate (D11, before any production email):** SPF/DKIM records for `mail.kseles.ru` verified (`dig TXT mail.kseles.ru`, Resend domain status = verified); a real confirmation email and a password-reset email are received and clicked successfully; sender shows `DreamBoard <no-reply@mail.kseles.ru>`; only then is custom SMTP enabled in Supabase Auth. No passwords/DNS tokens/API keys in the repo (secrets scan covers `re_…` keys and DNS values).

## 6. CI

- Workflow: existing `on: pull_request: branches: [main]` — docs PRs and stage PRs both run it; expect 6/6 (contracts, api-build, api-unit, api-e2e, web-build, mobile-analyze-build).
- Secrets scan step added to CI for frontend PRs (threat-model §6).
- SQL static check step (L1) added for `docs/sql/**` changes.

## 7. Definition of done for this PR (docs only)

- [ ] 5 files present and internally consistent (spec ↔ SQL ↔ threat model ↔ test plan ↔ runbook).
- [ ] Markdown fences balanced; SQL sections complete; secrets scan clean.
- [ ] CI 6/6 green on the PR.
- [ ] PR OPEN, not merged; production/preview/Render untouched.
