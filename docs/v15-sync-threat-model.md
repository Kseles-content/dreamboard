# DreamBoard v15 — Sync Threat Model

**Status:** approved with Stage 7A (2026-08-27)
**Applies to:** sync MVP (stages 7B–7E), GitHub Pages SPA + Supabase (EU) as voluntary cloud replica.
**Binding decisions:** D7 (RLS + at-rest; no E2EE in MVP), D14 (self-hosted pinned SDK/html2canvas), D15 (CSP/XSS/token model), D16 (service_role never in Pages/repo).

---

## 1. Assets

| Asset | Sensitivity | Location |
|-------|-------------|----------|
| Board state (dreams, milestones, canvas, settings) | High (intimate personal goals) | localStorage + Supabase `sync_documents.state` |
| Trash envelope (deleted dreams) | High | localStorage + `sync_documents.trash` |
| Images (personal photos) | High | IndexedDB + Supabase Storage (private) |
| Gratitude/journal text | High | in state jsonb |
| Auth session (access/refresh via Supabase Auth PKCE) | Critical | Supabase Auth (httpOnly cookies or localStorage depending on SDK mode) |
| Device id (`updated_by_device`) | Low (opaque random) | localStorage + `sync_documents` |
| Version snapshots | Medium | IndexedDB conflict store + `sync_versions` |

## 2. Trust boundaries

1. **Client (browser)** — trusted with plaintext data; untrusted as an execution environment (XSS risk).
2. **GitHub Pages origin** — static host, no server code; content is public (the SPA itself).
3. **Supabase (EU)** — semi-trusted: RLS+at-rest per D7; operator can read plaintext data (accepted for MVP; E2EE excluded).
4. **External services** — Resend (SMTP), Cloudflare Turnstile. Only verified-domain mail; CAPTCHA keys.
5. **Legacy backend (Nest/Render)** — **out of trust boundary**: not used by the SPA (0 network calls today); do not introduce dependencies on it.

## 3. Threats and mitigations

### T1 — XSS (highest priority)
- **Vector:** injected HTML/JS via dream content, image metadata, imported JSON/backup files, or third-party scripts.
- **Mitigations:**
  - CSP (meta or header): `default-src 'self'`; `script-src 'self'` (self-hosted SDK/html2canvas — no CDN origins); `connect-src 'self' https://<project>.supabase.co https://challenges.cloudflare.com`; `img-src 'self' data: blob: https://images.unsplash.com`; `style-src 'self' 'unsafe-inline'` (v14 uses inline styles — verify and minimize).
  - No third-party runtime scripts (D14: html2canvas vendored, pinned, integrity-checked).
  - All user content rendered via `textContent`/DOM APIs, never `innerHTML` with untrusted data (v14 viewer already uses `textContent`; enforce in sync-rendered views too).
  - Import/backup parser: strict schema validation (storage.js `normalize*` pattern), reject unknown keys/scripts; no `eval`/`new Function` on imported data.
  - Service worker precaches only known same-origin files; SW file itself integrity-pinned at deploy time (CI check).

### T2 — Session token theft / replay
- **Vector:** access token stolen via XSS, shoulder-surfing, browser extension, localStorage scrape.
- **Mitigations:**
  - PKCE for all OAuth/email flows (official SDK default).
  - Short-lived sessions; `refresh` rotation; `revoke-all` on «Выйти на всех устройствах» (later) and on account deletion.
  - CSP blocks exfiltration endpoints not in `connect-src`.
  - Tokens never logged (http-logging of auth endpoints forbidden; no dream content in logs, plan §9).
  - Turnstile + rate limits slow brute-force of refresh endpoints.
  - Do not store the refresh token in a place readable by injected scripts beyond SDK defaults; document chosen SDK storage mode (prefer `persistSession` with PKCE; consider httpOnly cookie mode if supported by supabase-js auth flow for the static host).

### T3 — Service-role key exposure (catastrophic)
- **Vector:** `service_role`/`SUPABASE_SERVICE_ROLE_KEY` committed to repo, bundled into `config.js`, or uploaded to Pages.
- **Mitigations:**
  - **Never** in repository, GitHub Actions secrets are the only allowed storage for CI; never in frontend bundles.
  - `config.js` contains only the publishable anon key + project URL (public by design, harmless behind RLS).
  - CI secrets scan (below) greps for `service_role`, `eyJ` JWTs, `sbp_`, private keys — fails the build on match.
  - GitHub Pages cannot read repository secrets; there is no server-side env — anon key is inherently public; RLS is the real gate (verified by cross-user tests in `docs/sql/v15-sync-schema.sql`).

### T4 — RLS bypass / cross-user access
- **Vector:** SQL injection in RPC args, missing policies, table-owner bypass, storage path traversal.
- **Mitigations:**
  - `FORCE ROW LEVEL SECURITY` on all three tables as defense-in-depth for SELECT visibility (note: it does not reliably constrain a SECURITY DEFINER owner with BYPASSRLS — see below).
  - **RPC-only mutations**: clients have SELECT-only policies on `sync_documents`/`sync_versions`, plus explicit `REVOKE INSERT/UPDATE/DELETE` and no mutation grants for `anon`/`authenticated`; every write goes through `sync_push_document`/`sync_snapshot` (SECURITY DEFINER, `search_path = pg_catalog, public` pinned, fully qualified objects, `auth.uid()` null-rejection, owner checks inside, **no caller-supplied user_id**).
  - Storage path **`{user_id}/{board_id}/{image_id-or-file}`** with policies enforcing ALL of: segment 1 = `auth.uid()`, segment 2 = valid UUID **and an existing `sync_documents` board owned by the caller** (foreign/nonexistent boards rejected), segment 3 = non-empty file name; `WITH CHECK` on insert/update; signed URLs only (short TTL).
  - Composite FK `(user_id, board_id) → sync_documents ON DELETE CASCADE` on assets/versions keeps rows attached to a board owned by the same user.
  - Cross-user tests T1–T13 in the SQL file (A/B/anon isolation; T12 expects FK violation/42501 only and confirms no row persisted; T2c confirms anon has no access at all) are part of the 7A gate; re-run in sandbox before 7C.
  - RPC arguments are typed (uuid/bigint/jsonb) — no dynamic SQL inside functions (verify at code review).

### T5 — Supply chain (SDK/CDN compromise)
- **Vector:** compromised unpkg/jsdelivr package or CDN → injected code with full data access.
- **Mitigations (D14):**
  - Self-host pinned `supabase-js` (exact version, vendored under `assets/vendor/`, sha256 recorded, verified at CI) — no CDN at runtime.
  - Same for html2canvas (currently cdnjs in v14; move to vendored pinned copy in 7B/7D PR).
  - Version bumps are explicit commits with changelog + regression run (264+ tests).
  - CSP `script-src 'self'` makes any injected external script fail closed.

### T6 — MITM / transport
- **Mitigations:** TLS everywhere (Pages + Supabase); PKCE prevents token interception replay; HSTS header for Pages is GitHub-managed; Supabase EU region endpoints enforced in `connect-src`.

### T7 — Brute force / account enumeration / spam signups
- **Mitigations:** Turnstile on signup/login/recovery (D10); generic auth errors («invalid credentials» — never «email not found»); Supabase rate limits; leaked-password check where supported; min 10-char password policy (plan §3).

### T8 — Data loss / destructive sync
- **Vector:** buggy merge, silent LWW, accidental overwrite, client bug deleting local data.
- **Mitigations:** no auto-merge (D4); CAS conflicts surfaced; automatic local snapshots to a **separate IndexedDB conflict store** (D6); `dreamboard_app_state_recovery` retained; local data never cleared automatically (D1); export-compatible safety snapshot before migration (plan §6); delete flows require explicit user action + reauth (7E).

### T9 — Retention / over-retention
- **Mitigations:** `retention_until` hint only; no automatic deletion (append-only versions); server-side cleanup job is a separate approved stage; user-initiated deletion (account/board) removes rows (FK `ON DELETE CASCADE`) and storage objects.

### T10 — Privacy leakage via logs/analytics
- **Mitigations:** operational metrics only (plan §9); never log titles/descriptions/journal/images; Sentry/PostHog not wired in v14 frontend — keep it that way; HTTP logging middleware (legacy Nest) must not receive sync traffic (sync traffic goes to Supabase directly, not through Nest).

### T11 — Phishing / spoofed auth emails
- **Mitigations:** Resend with **verified sender domain** (D11): sending subdomain `mail.kseles.ru`, From `DreamBoard <no-reply@mail.kseles.ru>`, SPF/DKIM verified and confirmation/reset test passed BEFORE enabling production SMTP; consistent sender name; no links to non-app domains in auth emails; Turnstile reduces bot-driven signups that abuse the sending reputation.

## 4. Residual risks (accepted for MVP, revisit at 7E)

1. **Operator plaintext access** (Supabase can read state/images) — accepted by D7; E2EE is the escape hatch later (schema is encryption-ready: `state jsonb` is opaque to the server when encrypted client-side; add `enc_version`/`enc_salt` fields at that stage, plus key management per audit §8).
2. **Client-side compromise** (malware/extensions) — out of scope; no additional server-side protection possible for a static SPA.
3. **GitHub Pages content integrity** — repository compromise implies app compromise; mitigated by repo protection (branch rules, no direct pushes to main, CI secrets scan).

## 5. Security checklist per stage

- **7B:** CSP baseline in place; no third-party scripts; auth UI renders via textContent; Turnstile integrated; generic error messages; tests: XSS-injection attempt on auth fields, a11y, abuse.
- **7C:** RLS cross-user suite re-run (T1–T13); CAS RPC fuzz (bad types, huge payloads, missing args); offline/reconnect; two-device conflict; token revocation test.
- **7D:** image upload path traversal test; dedup hash collision handling; partial-failure recovery; trash round-trip.
- **7E:** account deletion cascade (rows + storage objects + versions); export completeness; reauth grace period; incident rollback drill (plan §7 gate).

## 6. Secrets scan rules (CI, all PRs touching frontend)

Reject if any of (case-insensitive):
- `service_role`, `SUPABASE_SERVICE_ROLE`, `sbp_` followed by 30+ chars
- `eyJ` JWT-shaped tokens (45+ chars, two dots)
- `BEGIN (RSA | EC | OPENSSH) PRIVATE KEY`
- AWS-style `AKIA[0-9A-Z]{16}`, generic `(password|secret|token)\s*=\s*['"][^'"]{8,}`
- `.env`-style files with real values (allow only `.env.example` with placeholders)
- **Resend API keys** shaped `re_[a-zA-Z0-9]{20,}`
- DNS/SPF/DKIM tokens or TXT values supplied by Resend (e.g. SPF-record payloads starting with `v=spf1`, DKIM selector values under `dkim._domainkey`), i.e. any actual record VALUE, not the record name
- Supabase dashboard/service tokens (`sbp_`, `sb_secret_`)
