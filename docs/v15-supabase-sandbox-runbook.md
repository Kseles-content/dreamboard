# DreamBoard v15 — Supabase Sandbox Runbook (manual, customer-executed)

**Status:** reference only. **Nothing in this runbook is executed yet** — Stage 7B and the Supabase project are NOT started (customer decision 2026-08-27).
This runbook lists the manual actions the **customer** performs, in order, when the sandbox is approved. It creates no resources by itself.

Target environment: one **non-production sandbox project** (EU region). Never point this runbook at a production project.

---

## 0. Pre-flight (before touching Supabase)

- [ ] Confirm Stage 7B command from the architect (this runbook is inert until then).
- [ ] Confirm decisions D1–D17 (docs/SUPABASE_ARCHITECTURE.md) — no open questions blocking sandbox.
- [ ] Have ready: an email address for the Supabase account; a phone for 2FA (recommended); a domain for Resend verification (later, D11).
- [ ] Reminder: `service_role` key exists ONLY in the Supabase dashboard; it must never be copied into the repo, `config.js`, GitHub Pages, or any client bundle.

## 1. Create the sandbox project (EU)

1. Open https://supabase.com/dashboard → New project.
2. Organization: (customer's org). Project name: `dreamboard-sandbox` (or similar, clearly non-production).
3. **Region: `eu-central-1` (Frankfurt, EU)** — decision D8; do not pick US or another region.
4. Database password: generate a strong one; store in the team password manager; **do not** commit it anywhere.
5. Plan: Free tier is sufficient for the sandbox (500 MB DB, 1 GB storage). Note: free projects pause after 1 week of inactivity — keep the sandbox active or accept re-wake.
6. After creation, copy two values into the (future) `config.js` **only**:
   - Project URL: `https://<project-ref>.supabase.co`
   - **anon** public key (Settings → API). This key is public by design (RLS is the gate). The `service_role` key on the same page is **not** for the frontend.

## 2. Auth configuration

1. Dashboard → Authentication → Providers → enable **Email**:
   - Confirm email: **ON** (email confirmation required, plan §3).
   - Double-confirm / secure email change: on (defaults).
2. Authentication → Sign In / Up:
   - **Anonymous sign-ins: OFF** (guests stay fully local — D12; default is off, verify).
   - Password min length: **10** (plan §3). Enable leaked-password protection if shown.
3. Authentication → Rate Limits: keep sensible defaults (signup/login); adjust only if the abuse tests demand.
4. Bot and Abuse Protection → **Enable CAPTCHA protection** (D10):
   - Provider: **Cloudflare Turnstile**.
   - Create a Turnstile widget at https://dash.cloudflare.com (Sitekey + Secret key).
   - Paste secret key into Supabase; keep the sitekey for the frontend `config.js`.
5. SMTP in the sandbox: leave the **built-in** SMTP (team addresses only, ~2 msg/h — fine for testing templates). **Production SMTP (Resend) is NOT configured yet**: the customer decision (2026-08-27) is Resend with sending subdomain `mail.kseles.ru` and From `DreamBoard <no-reply@mail.kseles.ru>` (domain `kseles.ru` verified), but **DNS must not be changed and no Resend project created until the docs-only Stage 7A PR (#38) is complete**. When that happens, the production SMTP gate is: (1) add SPF/DKIM records for `mail.kseles.ru` per Resend's instructions, (2) verify domain in Resend, (3) run a successful confirmation/reset email test, (4) only then enable custom SMTP in Supabase Auth. Passwords, DNS tokens and API keys never enter the repo.

## 3. Storage bucket

Run in SQL editor (or via Storage UI):

```sql
insert into storage.buckets (id, name, public)
values ('dreamboard-assets', 'dreamboard-assets', false)
on conflict (id) do nothing;
```

Verify in Storage UI: bucket exists, **Public bucket = OFF**. All access is via signed URLs only (object policies come from the schema file, §4).

## 4. Create test users A/B (Auth Dashboard / Admin API — NOT direct INSERT)

Users for the cross-user suite are created through the sandbox **Auth Dashboard** (Authentication → Users → Add user) or the **Auth Admin API** — never via a direct `INSERT INTO auth.users` and never with `service_role` keys in files/chats.

1. Dashboard → Authentication → Users → **Add user**: create `sync-test-a@example.test` (auto-generated or chosen password).
2. Copy the user's UUID (id) from the Users table → it replaces `USER_A_UUID` in the test template.
3. Repeat for `sync-test-b@example.test` → `USER_B_UUID`.
4. Confirm both emails if confirmation is enabled (Dashboard → user → confirm) so they can authenticate.

## 5. Execute the schema

1. Open Dashboard → SQL Editor → New query.
2. Paste the full contents of `docs/sql/v15-sync-schema.sql` (sections 1–5: tables, RLS, storage policies, CAS RPC, retention hint).
3. Run. Expected: no errors; tables `sync_documents`, `sync_assets`, `sync_versions` appear in Table Editor.
4. **Idempotency:** run the same script once more — it must succeed again with no errors (`IF NOT EXISTS`/`CREATE OR REPLACE`/`ON CONFLICT DO NOTHING`/`DROP POLICY IF EXISTS`).

## 6. Run the cross-user tests

1. In SQL Editor, paste section 6 of `docs/sql/v15-sync-schema.sql` and **replace `USER_A_UUID` / `USER_B_UUID` with the real UUIDs** from §5.
2. Run. Expected: **PASS notices for T1, T2a/b/c, T3, T4, T5, T6, T7, T8, T9, T10, T11, T12; no FAILED**.
3. Screenshot or copy the output; attach to the stage report as 7A-gate evidence.
4. **Real concurrent CAS check (optional but recommended):** open two psql/psql sessions against the sandbox as user A; in both run `BEGIN; SELECT public.sync_push_document('<board>', <current_rev>, '{}'::jsonb, 'dev-1');` — commit the first; the second must return `conflict:true`. Exactly one success.
5. **Real Storage API checks (A/B, per approved path `{user_id}/{board_id}/{image_id-or-file}`):**
   - As A: upload to `{A}/{board}/{img1}` → **success**; select own object → OK; create signed URL → opens; update/delete own object → OK.
   - As A: upload to `{B}/...` (other user's path) → **rejected** (policy on first path segment).
   - As B: read A's object / open A's signed URL → **403**; update/delete A's object → **rejected**.
   - As anon: any object access → **denied**.
6. Table Editor as `anon` → no rows visible.

## 7. Security verification

- [ ] `config.js` (future) contains only project URL + **anon** key; grep for `service_role`/`eyJ`/`sbp_` across the repo returns nothing (CI enforces too).
- [ ] RLS enabled + forced on all three tables (`pg_policies` shows the 10 table policies + 4 storage policies).
- [ ] `sync_versions` append-only: UPDATE/DELETE denied (covered by T7).
- [ ] No automatic deletion configured (no triggers/cron; `retention_until` is a hint only).

## 8. Sandbox teardown / rollback

Run the rollback section of `docs/sql/v15-sync-schema.sql` (§7), then delete the project in Dashboard (Settings → Delete project) if the sandbox is no longer needed. Teardown is only after explicit approval.

## 9. Do NOT (hard rules)

- Do not create the sandbox or any resource until the architect commands Stage 7B.
- Do not copy `service_role` (or any secret) into the repo, `.env`, `config.js`, GitHub Actions, Pages, or chat.
- Do not run the schema/tests against any production project.
- Do not enable anonymous sign-ins, public buckets, or profiles/username/avatar (D12/D13).
- Do not add custom SMTP without a verified sender domain (D11).
- Do not merge the docs PR (this runbook ships with it) — the docs PR stays OPEN until the architecture is accepted.

## 10. Deliverables after customer execution

Return to the architect: project URL (non-secret), anon key (public), SQL execution log, T1–T12 output, storage policy listing, and any deviations. The architect then proceeds to Stage 7B planning (auth UI behind a feature flag, no board upload).
