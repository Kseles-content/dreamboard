# DreamBoard v15 — Sandbox validation report (Stage 7A gate)

- **Date:** 2026-08-27
- **Stage:** 7A — Supabase schema/RLS/Storage gate (non-production)
- **Project:** `dreamboard-v15-sandbox` (Central EU / Frankfurt) — status: **Healthy**
- **Source of truth:** `docs/sql/v15-sync-schema.sql` @ main (merge PR #38, `f002dff`)
- **Execution:** manual, via Supabase Dashboard by the customer. No project ref, UUIDs, emails, keys, passwords or tokens are included in this report.

## 1. Schema execution

| Check | Result |
|-------|--------|
| `01-schema.sql` (sections 1–6) — first run | **SUCCESS** |
| `01-schema.sql` — second run (idempotency) | **SUCCESS** (no errors) |
| Tables `sync_documents` / `sync_assets` / `sync_versions` | created |
| Storage bucket `dreamboard-assets` | created, Public = OFF |

## 2. SQL cross-user tests (T1–T13)

- Template: transaction-based, ended with **ROLLBACK** (no test rows persist).
- **Result: T1–T13 PASS** (T2c anon-denied, T7 append-only + stable counts, T8 policy inventory incl. storage guards, T10 CAS concurrency, T12 FK/privilege-denial + no row persisted, T13 negative base rejected).
- **After the SQL suite: documents = 0, assets = 0, versions = 0** (rollback confirmed).

## 3. Real Storage gate (A/B/anon)

- **Overall: 20/20 PASS.**
- **A (owner):** upload, download, create signed URL, update, delete on own path `{user}/{board}/{filename}` — **allowed**.
- **B (other user):** download of A's object, **creation of a signed URL for A's object**, update, delete — **denied**.
- **anon:** any object access — **denied**.
- **Path validation:** invalid board segment (not a UUID) — denied; extra directory (`{A}/{board}/extra/file.webp`) — denied; nonexistent board — denied; foreign board (A's user id + B's board) — denied; other user's first path segment — denied.
- **Signed URL semantics:** the signed URL issued by A opened as a **temporary bearer link** — this is the expected contract (accessible to the recipient until expiry; a URL already issued is not expected to return 403).

## 4. Cleanup & state after the gate

- Test object: **deleted**.
- Two temporary Storage-gate boards: **deleted** (DELETE returned 2 rows).
- Test users A/B: **kept** (needed for subsequent stages).
- No secrets, passwords, tokens, project ref or user UUIDs were published in files or chat.

## 5. Conclusion

**Stage 7A sandbox gate: PASS.** The sandbox project matches the approved schema (idempotent, RLS + RPC-only mutations, hardened Storage policies with `{user_id}/{board_id}/{filename}` path enforcement, explicit privileges) and is ready for Stage 7B planning — **not started until explicitly commanded**. The local one-off QA helper (`storage-gate.html`) was **not** added to the repository.
