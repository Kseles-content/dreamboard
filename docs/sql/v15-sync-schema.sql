-- ============================================================================
-- DreamBoard v15 — Sync schema (snapshot-first, local-first) — REV 3
-- Approved spec: docs/SUPABASE_ARCHITECTURE.md (decisions D1–D17)
-- Target: Supabase (Postgres) project in EU region (eu-central-1, Frankfurt),
-- NON-PRODUCTION sandbox first. Execute via Supabase SQL editor as project
-- owner.
--
-- IDEMPOTENCY SCOPE (important):
--   * Sections 1–5 (schema/DDL) are idempotent and safe to run twice:
--     CREATE ... IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT DO NOTHING /
--     DROP POLICY IF EXISTS / guarded DO $$ ... $$ blocks for constraints,
--     plus an explicit DROP of the rev 1 RPC signature before CREATE OR
--     REPLACE (Postgres cannot replace a function with a different argument
--     list via CREATE OR REPLACE).
--   * Section 6 (sandbox cross-user tests) is SINGLE-USE: it is wrapped in a
--     transaction that ROLLS BACK at the end, so no test rows persist. To
--     re-run, re-execute section 6 as a whole. Do NOT call the whole file
--     idempotent — only sections 1–5 are.
--
-- Contents:
--   1. Tables + constraints (sync_documents, sync_assets, sync_versions)
--   2. RLS policies: SELECT only for clients; mutations are RPC-only
--   3. Private Storage bucket + object policies (path {user_id}/{board_id}/file)
--   4. Atomic CAS RPC (sync_push_document) + snapshot RPC (sync_snapshot),
--      both SECURITY DEFINER with pinned search_path and qualified objects
--   5. Explicit privileges (anon: nothing; authenticated: SELECT docs/versions,
--      full assets, RPC EXECUTE)
--   6. Retention (hint only, no automatic deletion in MVP)
--   7. Cross-user tests (A/B/anon) — SANDBOX ONLY, TEMPLATE, ROLLED BACK
--   8. Rollback / down section
--
-- NOTE on naming: SQL uses snake_case columns; the client API contract
-- exposes them as camelCase (e.g. deleted_at -> deletedAt).
-- ============================================================================

-- ============================================================================
-- 1. TABLES + CONSTRAINTS
-- ============================================================================

-- No `profiles` table by decision D13: FK directly on auth.users(id).

create table if not exists public.sync_documents (
    user_id            uuid not null references auth.users(id) on delete cascade,
    board_id           uuid not null default gen_random_uuid(),
    format_version     int  not null default 1,          -- v14 state contract
    schema_version     int  not null default 2,          -- schemaVersion from state
    revision           bigint not null default 1,        -- CAS counter (starts at 1)
    state              jsonb not null,                   -- normalized board state (dreams/settings/uiState)
    trash              jsonb not null default '{"formatVersion":1,"items":[]}'::jsonb,
    deleted_at         timestamptz,                      -- soft-delete tombstone (contract: deletedAt)
    updated_at         timestamptz not null default now(),
    updated_by_device  text not null,                    -- opaque random device id (no fingerprinting)
    constraint sync_documents_pk primary key (user_id, board_id),
    constraint sync_documents_trash_valid check (
        jsonb_typeof(trash) = 'object'
        and trash->>'formatVersion' = '1'
        and jsonb_typeof(trash->'items') = 'array'
    ),
    constraint sync_documents_revision_positive check (revision >= 1),
    constraint sync_documents_format_version check (format_version = 1),
    constraint sync_documents_schema_version check (schema_version = 2),
    constraint sync_documents_state_object check (jsonb_typeof(state) = 'object'),
    constraint sync_documents_device_ok check (length(updated_by_device) between 1 and 64)
);

comment on table public.sync_documents is
    'Snapshot-first board documents. One row per (user, board). Client has SELECT only; '
    'mutations exclusively through sync_push_document RPC (atomic CAS).';

create table if not exists public.sync_assets (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users(id) on delete cascade,
    board_id      uuid not null,
    image_id      text not null,                         -- logical image id referenced from state
    storage_path  text not null,                         -- {user_id}/{board_id}/{image_id-or-file}
    mime_type     text not null default 'image/webp',
    size_bytes    int check (size_bytes >= 0),
    content_hash  text not null,                         -- dedup key
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    constraint sync_assets_unique_image unique (user_id, board_id, image_id),
    constraint sync_assets_hash_not_empty check (length(content_hash) > 0)
);

comment on table public.sync_assets is
    'Image metadata only. Binary lives in the private Storage bucket at '
    '{user_id}/{board_id}/{image_id-or-file}; no public URLs, signed URLs only.';

create table if not exists public.sync_versions (
    id               bigint generated always as identity primary key,
    user_id          uuid not null references auth.users(id) on delete cascade,
    board_id         uuid not null,
    revision         bigint not null,
    reason           text not null check (reason in (
                         'first_migration', 'conflict_local', 'conflict_cloud', 'manual_restore'
                     )),
    state            jsonb not null,
    trash            jsonb not null default '{"formatVersion":1,"items":[]}'::jsonb,
    created_at       timestamptz not null default now(),
    retention_until  timestamptz not null default (now() + interval '30 days'),
    constraint sync_versions_trash_valid check (
        jsonb_typeof(trash) = 'object'
        and trash->>'formatVersion' = '1'
        and jsonb_typeof(trash->'items') = 'array'
    ),
    constraint sync_versions_state_object check (jsonb_typeof(state) = 'object')
);

-- Composite FK: assets and versions belong to a (user, board) document row.
-- ON DELETE CASCADE: removing a board document removes its assets/versions.
-- Guarded by pg_constraint so re-running sections 1–5 is safe.
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'sync_assets_board_fk'
          and conrelid = 'public.sync_assets'::regclass
    ) then
        alter table public.sync_assets add constraint sync_assets_board_fk
            foreign key (user_id, board_id)
            references public.sync_documents (user_id, board_id)
            on delete cascade;
    end if;
end $$;

do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'sync_versions_board_fk'
          and conrelid = 'public.sync_versions'::regclass
    ) then
        alter table public.sync_versions add constraint sync_versions_board_fk
            foreign key (user_id, board_id)
            references public.sync_documents (user_id, board_id)
            on delete cascade;
    end if;
end $$;

create index if not exists idx_sync_versions_board
    on public.sync_versions (user_id, board_id, revision desc);
create index if not exists idx_sync_assets_board
    on public.sync_assets (user_id, board_id);
create index if not exists idx_sync_documents_updated
    on public.sync_documents (user_id, updated_at);

comment on table public.sync_versions is
    'Append-only immutable snapshots (first migration, conflicts, manual restore). '
    'Client has SELECT only; writes exclusively through sync_snapshot RPC. '
    'retention_until is a hint ONLY — no automatic deletion until a separate '
    'server-side job exists.';

-- ============================================================================
-- 2. RLS POLICIES — SELECT only for clients; mutations are RPC-only
-- ============================================================================

alter table public.sync_documents enable row level security;
alter table public.sync_documents force row level security;
alter table public.sync_assets     enable row level security;
alter table public.sync_assets     force row level security;
alter table public.sync_versions   enable row level security;
alter table public.sync_versions   force row level security;

-- Rev 1 leftovers (if any) must not survive: old documents/versions mutation
-- policies are dropped before the SELECT-only set is (re)created.
drop policy if exists sync_documents_insert on public.sync_documents;
drop policy if exists sync_documents_update on public.sync_documents;
drop policy if exists sync_documents_delete on public.sync_documents;
drop policy if exists sync_versions_insert  on public.sync_versions;

-- sync_documents: SELECT on own rows ONLY. No INSERT/UPDATE/DELETE policies:
-- all mutations go through sync_push_document (SECURITY DEFINER).
drop policy if exists sync_documents_select on public.sync_documents;
create policy sync_documents_select on public.sync_documents
    for select using (user_id = auth.uid());

-- sync_assets: full owner access (image metadata lifecycle stays client-side).
drop policy if exists sync_assets_select on public.sync_assets;
create policy sync_assets_select on public.sync_assets
    for select using (user_id = auth.uid());

drop policy if exists sync_assets_insert on public.sync_assets;
create policy sync_assets_insert on public.sync_assets
    for insert with check (user_id = auth.uid());

drop policy if exists sync_assets_update on public.sync_assets;
create policy sync_assets_update on public.sync_assets
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists sync_assets_delete on public.sync_assets;
create policy sync_assets_delete on public.sync_assets
    for delete using (user_id = auth.uid());

-- sync_versions: SELECT on own rows ONLY. No INSERT/UPDATE/DELETE policies:
-- writes exclusively through sync_snapshot RPC (append-only).
drop policy if exists sync_versions_select on public.sync_versions;
create policy sync_versions_select on public.sync_versions
    for select using (user_id = auth.uid());

-- ============================================================================
-- 3. PRIVATE STORAGE (bucket + object policies)
-- ============================================================================

-- Private bucket (public = false). Signed URLs only, issued per request.
insert into storage.buckets (id, name, public)
values ('dreamboard-assets', 'dreamboard-assets', false)
on conflict (id) do nothing;

-- Object path convention (approved): {user_id}/{board_id}/{image_id-or-file}
-- Every policy (select/insert/update/delete) enforces ALL of:
--   * segment 1 == auth.uid()::text        (object belongs to caller)
--   * segment 2 is a valid UUID            (board id shape)
--   * a sync_documents row exists for      (user_id = auth.uid(), board_id = segment 2)
--   * segment 3 is a non-empty file name
-- The CASE guard prevents an invalid-UUID cast error before the regex check.
-- No fixed prefix segments (the path starts directly with the user id).

drop policy if exists dreamboard_assets_insert on storage.objects;
create policy dreamboard_assets_insert on storage.objects
    for insert with check (
        bucket_id = 'dreamboard-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists (
            select 1 from public.sync_documents d
            where d.user_id = auth.uid()
              and d.board_id = case
                    when (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    then (storage.foldername(name))[2]::uuid
                    else null end
        )
        and coalesce(length((storage.foldername(name))[3]), 0) > 0
    );

drop policy if exists dreamboard_assets_select on storage.objects;
create policy dreamboard_assets_select on storage.objects
    for select using (
        bucket_id = 'dreamboard-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists (
            select 1 from public.sync_documents d
            where d.user_id = auth.uid()
              and d.board_id = case
                    when (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    then (storage.foldername(name))[2]::uuid
                    else null end
        )
        and coalesce(length((storage.foldername(name))[3]), 0) > 0
    );

drop policy if exists dreamboard_assets_update on storage.objects;
create policy dreamboard_assets_update on storage.objects
    for update using (
        bucket_id = 'dreamboard-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists (
            select 1 from public.sync_documents d
            where d.user_id = auth.uid()
              and d.board_id = case
                    when (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    then (storage.foldername(name))[2]::uuid
                    else null end
        )
        and coalesce(length((storage.foldername(name))[3]), 0) > 0
    ) with check (
        bucket_id = 'dreamboard-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists (
            select 1 from public.sync_documents d
            where d.user_id = auth.uid()
              and d.board_id = case
                    when (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    then (storage.foldername(name))[2]::uuid
                    else null end
        )
        and coalesce(length((storage.foldername(name))[3]), 0) > 0
    );

drop policy if exists dreamboard_assets_delete on storage.objects;
create policy dreamboard_assets_delete on storage.objects
    for delete using (
        bucket_id = 'dreamboard-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
        and (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists (
            select 1 from public.sync_documents d
            where d.user_id = auth.uid()
              and d.board_id = case
                    when (storage.foldername(name))[2] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                    then (storage.foldername(name))[2]::uuid
                    else null end
        )
        and coalesce(length((storage.foldername(name))[3]), 0) > 0
    );

-- ============================================================================
-- 4. ATOMIC CAS RPC + SNAPSHOT RPC (SECURITY DEFINER, pinned search_path)
-- ============================================================================

-- SECURITY DEFINER honest note:
--   We do NOT claim that FORCE RLS reliably constrains the definer: the
--   function owner (typically postgres) usually has BYPASSRLS, and FORCE RLS
--   does not override BYPASSRLS. Actual safety of these RPCs comes from:
--     * explicit auth.uid() null-rejection at the top of each function;
--     * every statement filters on auth.uid() (owner checks inside);
--     * pinned search_path = pg_catalog, public (no pg_temp) and fully
--       qualified object references (public.*, auth.uid());
--     * no user-supplied user_id parameter (the caller can never pick a
--       victim); and
--     * strict grants (client roles cannot mutate the tables directly).
-- RLS + FORCE remain valuable as defense-in-depth for SELECT visibility.

-- Drop the rev 1 signature (jsonb, jsonb, text order) BEFORE creating the
-- rev 2/3 one — CREATE OR REPLACE cannot change a function argument list.
drop function if exists public.sync_push_document(uuid, bigint, jsonb, jsonb, text, timestamptz, int, int);

-- sync_push_document(board_id, base_revision, state, device[, trash, deleted_at,
--                    format_version, schema_version])
--   Required params first (board_id, base_revision, state, device); all
--   remaining params are optional with defaults.
--   base_revision = 0 -> insert new document (revision becomes 1).
--   base_revision = N -> update only if current revision = N, then increment.
--   Negative base_revision -> rejected (invalid_base_revision).
-- Returns jsonb:
--   {"ok":true,"revision":N,"updatedAt":"..."}
--   {"ok":false,"conflict":true,"currentRevision":N,"updatedAt":"..."}
--   {"ok":false,"error":"not_found" | "unauthenticated" | "invalid_base_revision"}
create or replace function public.sync_push_document(
    p_board_id        uuid,
    p_base_revision   bigint,
    p_state           jsonb,
    p_device          text,
    p_trash           jsonb default '{"formatVersion":1,"items":[]}'::jsonb,
    p_deleted_at      timestamptz default null,
    p_format_version  int default 1,
    p_schema_version  int default 2
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_revision bigint;
    v_updated  timestamptz;
    v_current  record;
begin
    if auth.uid() is null then
        return jsonb_build_object('ok', false, 'error', 'unauthenticated');
    end if;

    if p_base_revision < 0 then
        return jsonb_build_object('ok', false, 'error', 'invalid_base_revision');
    end if;

    if p_base_revision = 0 then
        -- Insert path: fails silently on conflict (row already exists).
        insert into public.sync_documents
            (user_id, board_id, format_version, schema_version, revision,
             state, trash, deleted_at, updated_by_device)
        values
            (auth.uid(), p_board_id, p_format_version, p_schema_version, 1,
             p_state, p_trash, p_deleted_at, p_device)
        on conflict (user_id, board_id) do nothing
        returning revision, updated_at into v_revision, v_updated;

        if v_revision is null then
            -- Row exists -> real conflict (current revision >= 1).
            select revision, updated_at into v_current
            from public.sync_documents
            where user_id = auth.uid() and board_id = p_board_id;
            if not found then
                return jsonb_build_object('ok', false, 'error', 'not_found');
            end if;
            return jsonb_build_object(
                'ok', false, 'conflict', true,
                'currentRevision', v_current.revision,
                'updatedAt', v_current.updated_at
            );
        end if;
        return jsonb_build_object('ok', true, 'revision', v_revision, 'updatedAt', v_updated);
    end if;

    -- CAS update path: atomic conditional update. format/schema versions are
    -- written from the (defaulted) parameters and enforced by CHECKs (= 1 / = 2).
    update public.sync_documents
       set revision = revision + 1,
           format_version = p_format_version,
           schema_version = p_schema_version,
           state = p_state,
           trash = p_trash,
           deleted_at = p_deleted_at,
           updated_at = now(),
           updated_by_device = p_device
     where user_id = auth.uid()
       and board_id = p_board_id
       and revision = p_base_revision
     returning revision, updated_at into v_revision, v_updated;

    if v_revision is not null then
        return jsonb_build_object('ok', true, 'revision', v_revision, 'updatedAt', v_updated);
    end if;

    -- 0 rows: either missing or revision mismatch -> conflict with current state.
    select revision, updated_at into v_current
    from public.sync_documents
    where user_id = auth.uid() and board_id = p_board_id;
    if not found then
        return jsonb_build_object('ok', false, 'error', 'not_found');
    end if;
    return jsonb_build_object(
        'ok', false, 'conflict', true,
        'currentRevision', v_current.revision,
        'updatedAt', v_current.updated_at
    );
end;
$$;

-- sync_snapshot(board_id, revision, reason, state[, trash])
-- Append-only version snapshot (first migration, conflicts, manual restore).
-- Verifies the board exists and belongs to the caller BEFORE writing.
create or replace function public.sync_snapshot(
    p_board_id uuid,
    p_revision bigint,
    p_reason   text,
    p_state    jsonb,
    p_trash    jsonb default '{"formatVersion":1,"items":[]}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
    v_id      bigint;
    v_owner   uuid;
begin
    if auth.uid() is null then
        return jsonb_build_object('ok', false, 'error', 'unauthenticated');
    end if;

    -- Board must exist AND belong to the caller.
    select user_id into v_owner
    from public.sync_documents
    where user_id = auth.uid() and board_id = p_board_id;
    if not found then
        return jsonb_build_object('ok', false, 'error', 'board_not_found');
    end if;

    insert into public.sync_versions
        (user_id, board_id, revision, reason, state, trash)
    values
        (auth.uid(), p_board_id, p_revision, p_reason, p_state, p_trash)
    returning id into v_id;
    return jsonb_build_object('ok', true, 'versionId', v_id);
end;
$$;

-- ============================================================================
-- 5. EXPLICIT PRIVILEGES
-- ============================================================================
-- anon:           NO privileges on sync tables and NO RPC EXECUTE.
-- authenticated:  SELECT on sync_documents / sync_versions; full
--                 SELECT/INSERT/UPDATE/DELETE on sync_assets; EXECUTE on both
--                 RPCs. Direct INSERT/UPDATE/DELETE on documents/versions is
--                 impossible (no grant, explicit REVOKE).
-- Public schema grants are stripped first so leftovers from earlier revs or
-- Supabase defaults cannot widen access.

revoke all on public.sync_documents from anon, authenticated;
revoke all on public.sync_assets     from anon, authenticated;
revoke all on public.sync_versions   from anon, authenticated;
revoke all on function public.sync_push_document(uuid, bigint, jsonb, text, jsonb, timestamptz, int, int) from public, anon, authenticated;
revoke all on function public.sync_snapshot(uuid, bigint, text, jsonb, jsonb) from public, anon, authenticated;

grant select on public.sync_documents to authenticated;
grant select on public.sync_versions  to authenticated;
grant select, insert, update, delete on public.sync_assets to authenticated;
grant execute on function public.sync_push_document(uuid, bigint, jsonb, text, jsonb, timestamptz, int, int) to authenticated;
grant execute on function public.sync_snapshot(uuid, bigint, text, jsonb, jsonb) to authenticated;

-- ============================================================================
-- 6. RETENTION
-- ============================================================================
-- retention_until on sync_versions is a hint for a FUTURE server-side job.
-- MVP intentionally has NO automatic deletion: no triggers, no cron, no
-- pg_cron jobs. Data is removed only by the user (account/board deletion)
-- or by an explicitly approved maintenance job in a later stage.

-- ============================================================================
-- 7. CROSS-USER TESTS (A / B / anon) — SANDBOX ONLY, TEMPLATE, ROLLED BACK
-- ============================================================================
-- Run in the NON-PRODUCTION sandbox project. Do NOT run against production.
--
-- SINGLE-USE: this whole section runs inside a transaction that ROLLS BACK
-- at the end, so no test rows persist. Re-running = re-execute this section
-- (or the full file — sections 1–5 are idempotent, section 6 is safe to
-- re-run because of the rollback).
--
-- IMPORTANT: users A and B are created via the sandbox Auth Dashboard
-- (Authentication -> Users -> Add user) or the Auth Admin API — NOT via a
-- direct INSERT into auth.users (see docs/v15-supabase-sandbox-runbook.md).
-- Replace the placeholders below with the real UUIDs before running:
--   USER_A_UUID = uuid of user A (e.g. sync-test-a@example.test)
--   USER_B_UUID = uuid of user B (e.g. sync-test-b@example.test)
--
-- Test matrix (asserted below):
--   T1   A creates a document via RPC (base=0)             -> ok, revision 1
--   T2a  A sees own document; T2b B sees nothing; T2c anon has NO access
--   T3   A push with correct base (1)                      -> ok, revision 2
--   T4   A push with stale base (1 again)                  -> conflict
--   T5   B direct UPDATE of A's row                        -> denied (42501)
--   T6   B direct INSERT (incl. with user_id = A)          -> denied (42501)
--   T7   versions: RPC snapshot ok; direct INSERT/UPDATE/DELETE denied;
--        row/version counts unchanged after denied attempts
--   T8   Policy inventory: documents SELECT-only, versions SELECT-only,
--        storage 4/4 with required expressions (bucket, foldername,
--        auth.uid(), sync_documents board check) in qual/with_check —
--        normalized marker check, not brittle string equality
--   T9   CAS insert conflict (A push base=0 again)         -> conflict
--   T10  CAS concurrency: two pushes with same baseRevision —
--        exactly one success, the second conflict
--   T11  sync_snapshot for foreign/nonexistent board       -> board_not_found
--   T12  sync_assets for foreign/nonexistent board         -> expected
--        foreign_key_violation / insufficient_privilege ONLY; asset absent
--   T13  negative baseRevision rejected                    -> invalid_base_revision

begin;

-- T1: A creates a document (CAS insert path).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'USER_A_UUID', true);
do $$
declare r jsonb;
begin
    r := public.sync_push_document(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 0,
        '{"dreams":[],"settings":{},"uiState":{}}'::jsonb,
        'device-a-test');
    assert (r->>'ok') = 'true', 'T1 failed: ' || r::text;
    assert (r->>'revision') = '1', 'T1 revision != 1: ' || r::text;
    raise notice 'T1 PASS: insert ok revision=1';
end $$;

-- T2a: A sees own document.
do $$
declare n int;
begin
    select count(*) into n from public.sync_documents;
    assert n = 1, 'T2a failed: A should see exactly 1 row, got ' || n;
    raise notice 'T2a PASS: A sees own document';
end $$;

-- T2b: B sees nothing.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'USER_B_UUID', true);
do $$
declare n int;
begin
    select count(*) into n from public.sync_documents;
    assert n = 0, 'T2b failed: B should see 0 rows, got ' || n;
    raise notice 'T2b PASS: B sees nothing';
end $$;

-- T2c: anon has NO access at all (revoked) -> permission denied, not 0 rows.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare n int;
begin
    begin
        select count(*) into n from public.sync_documents;
        raise exception 'T2c FAILED: anon SELECT was allowed';
    exception
        when insufficient_privilege then
            raise notice 'T2c PASS: anon SELECT denied (42501)';
    end;
end $$;

-- T3: A push with correct base revision (1 -> 2).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'USER_A_UUID', true);
do $$
declare r jsonb;
begin
    r := public.sync_push_document(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 1,
        '{"dreams":[{"id":"d1"}]}'::jsonb,
        'device-a-test');
    assert (r->>'ok') = 'true', 'T3 failed: ' || r::text;
    assert (r->>'revision') = '2', 'T3 revision != 2: ' || r::text;
    raise notice 'T3 PASS: CAS update ok revision=2';
end $$;

-- T4: A push with stale base (1 again) -> conflict.
do $$
declare r jsonb;
begin
    r := public.sync_push_document(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 1,
        '{"dreams":[{"id":"d1"}]}'::jsonb,
        'device-a-test');
    assert (r->>'ok') = 'false', 'T4 failed: expected not ok: ' || r::text;
    assert (r->>'conflict') = 'true', 'T4 failed: expected conflict: ' || r::text;
    assert (r->>'currentRevision') = '2', 'T4 failed: currentRevision != 2: ' || r::text;
    raise notice 'T4 PASS: stale base -> conflict, currentRevision=2';
end $$;

-- T5: B direct UPDATE of A's row -> denied (42501). No update policy + revoked.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'USER_B_UUID', true);
do $$
begin
    begin
        update public.sync_documents
           set state = '{"hacked":true}'::jsonb
         where board_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
        raise exception 'T5 FAILED: B direct UPDATE was allowed';
    exception
        when insufficient_privilege then
            raise notice 'T5 PASS: B direct UPDATE denied (42501)';
    end;
end $$;

-- T6: B direct INSERT (incl. with user_id = A) -> denied (42501).
do $$
begin
    begin
        insert into public.sync_documents
            (user_id, board_id, revision, state, trash, updated_by_device)
        values
            ('USER_A_UUID',
             'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9', 1,
             '{}'::jsonb, '{"formatVersion":1,"items":[]}'::jsonb, 'device-b-test');
        raise exception 'T6 FAILED: B direct INSERT was allowed';
    exception
        when insufficient_privilege then
            raise notice 'T6 PASS: B direct INSERT denied (42501)';
    end;
end $$;

-- T7: sync_versions append-only via RPC; direct mutations denied; counts stable.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'USER_A_UUID', true);
do $$
declare r jsonb; n int;
begin
    r := public.sync_snapshot(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 2, 'conflict_local',
        '{"dreams":[{"id":"d1"}]}'::jsonb);
    assert (r->>'ok') = 'true', 'T7 snapshot failed: ' || r::text;
    select count(*) into n from public.sync_versions;
    assert n = 1, 'T7: expected 1 version row, got ' || n;

    begin
        insert into public.sync_versions
            (user_id, board_id, revision, reason, state)
        values (auth.uid(), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 99,
                'manual_restore', '{}'::jsonb);
        raise exception 'T7 FAILED: direct version INSERT was allowed';
    exception
        when insufficient_privilege then
            raise notice 'T7 PASS: direct version INSERT denied (42501)';
    end;

    begin
        update public.sync_versions set reason = 'manual_restore';
        raise exception 'T7 FAILED: direct version UPDATE was allowed';
    exception
        when insufficient_privilege then
            raise notice 'T7 PASS: direct version UPDATE denied (42501)';
    end;

    begin
        delete from public.sync_versions;
        raise exception 'T7 FAILED: direct version DELETE was allowed';
    exception
        when insufficient_privilege then
            raise notice 'T7 PASS: direct version DELETE denied (42501)';
    end;

    -- Counts unchanged after all denied attempts.
    select count(*) into n from public.sync_versions;
    assert n = 1, 'T7: version count changed after denied mutations: ' || n;
    select count(*) into n from public.sync_documents;
    assert n = 1, 'T7: document count changed: ' || n;
    raise notice 'T7 PASS: counts stable after denied mutations';
end $$;

-- T8: exact policy inventory. Documents/versions: SELECT-only with
-- auth.uid() qual, no mutation policies. Storage: exactly 4 policies, each
-- carrying the required expressions (bucket id, foldername, auth.uid(),
-- sync_documents board ownership) in qual / with_check as applicable.
-- Marker-based (lower(...) LIKE) so it survives PostgreSQL formatting.
do $$
declare
    v_docs_ins int; v_docs_upd int; v_docs_del int; v_docs_sel int;
    v_ver_ins int; v_ver_upd int; v_ver_del int; v_ver_sel int;
    v_st_cnt int; v_st_ins int; v_st_sel int; v_st_upd int; v_st_del int;
begin
    select count(*) into v_docs_ins from pg_policies
      where schemaname='public' and tablename='sync_documents' and cmd='INSERT';
    select count(*) into v_docs_upd from pg_policies
      where schemaname='public' and tablename='sync_documents' and cmd='UPDATE';
    select count(*) into v_docs_del from pg_policies
      where schemaname='public' and tablename='sync_documents' and cmd='DELETE';
    select count(*) into v_docs_sel from pg_policies
      where schemaname='public' and tablename='sync_documents' and cmd='SELECT'
        and lower(qual) like '%auth.uid()%';
    assert v_docs_sel = 1, 'T8: sync_documents SELECT policy missing/mismatched';
    assert v_docs_ins = 0 and v_docs_upd = 0 and v_docs_del = 0,
           'T8: sync_documents must have SELECT-only policies (RPC-only mutations)';

    select count(*) into v_ver_ins from pg_policies
      where schemaname='public' and tablename='sync_versions' and cmd='INSERT';
    select count(*) into v_ver_upd from pg_policies
      where schemaname='public' and tablename='sync_versions' and cmd='UPDATE';
    select count(*) into v_ver_del from pg_policies
      where schemaname='public' and tablename='sync_versions' and cmd='DELETE';
    select count(*) into v_ver_sel from pg_policies
      where schemaname='public' and tablename='sync_versions' and cmd='SELECT'
        and lower(qual) like '%auth.uid()%';
    assert v_ver_sel = 1, 'T8: sync_versions SELECT policy missing/mismatched';
    assert v_ver_ins = 0 and v_ver_upd = 0 and v_ver_del = 0,
           'T8: sync_versions must be SELECT-only (append-only via RPC)';

    -- Storage: exactly 4 dreamboard_assets_* policies, each with all four
    -- required guards (bucket, foldername, auth.uid(), sync_documents).
    select count(*) into v_st_cnt from pg_policies
      where schemaname='storage' and tablename='objects'
        and policyname like 'dreamboard_assets_%';
    assert v_st_cnt = 4, 'T8: expected exactly 4 storage policies, got ' || v_st_cnt;

    select count(*) into v_st_ins from pg_policies
      where schemaname='storage' and tablename='objects'
        and policyname='dreamboard_assets_insert' and cmd='INSERT'
        and lower(with_check) like '%dreamboard-assets%'
        and lower(with_check) like '%foldername%'
        and lower(with_check) like '%auth.uid()%'
        and lower(with_check) like '%sync_documents%';
    select count(*) into v_st_sel from pg_policies
      where schemaname='storage' and tablename='objects'
        and policyname='dreamboard_assets_select' and cmd='SELECT'
        and lower(qual) like '%dreamboard-assets%'
        and lower(qual) like '%foldername%'
        and lower(qual) like '%auth.uid()%'
        and lower(qual) like '%sync_documents%';
    select count(*) into v_st_upd from pg_policies
      where schemaname='storage' and tablename='objects'
        and policyname='dreamboard_assets_update' and cmd='UPDATE'
        and lower(qual) like '%dreamboard-assets%'
        and lower(qual) like '%foldername%'
        and lower(qual) like '%auth.uid()%'
        and lower(qual) like '%sync_documents%'
        and lower(with_check) like '%dreamboard-assets%'
        and lower(with_check) like '%foldername%'
        and lower(with_check) like '%auth.uid()%'
        and lower(with_check) like '%sync_documents%';
    select count(*) into v_st_del from pg_policies
      where schemaname='storage' and tablename='objects'
        and policyname='dreamboard_assets_delete' and cmd='DELETE'
        and lower(qual) like '%dreamboard-assets%'
        and lower(qual) like '%foldername%'
        and lower(qual) like '%auth.uid()%'
        and lower(qual) like '%sync_documents%';
    assert v_st_ins = 1, 'T8: storage INSERT policy guards missing';
    assert v_st_sel = 1, 'T8: storage SELECT policy guards missing';
    assert v_st_upd = 1, 'T8: storage UPDATE policy guards missing (qual+with_check)';
    assert v_st_del = 1, 'T8: storage DELETE policy guards missing';
    raise notice 'T8 PASS: docs SELECT-only, versions SELECT-only, storage 4/4 with guards';
end $$;

-- T9: CAS insert conflict (A push base=0 for existing board) -> conflict.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'USER_A_UUID', true);
do $$
declare r jsonb;
begin
    r := public.sync_push_document(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 0,
        '{"dreams":[]}'::jsonb,
        'device-a-test');
    assert (r->>'ok') = 'false', 'T9 failed: expected not ok: ' || r::text;
    assert (r->>'conflict') = 'true', 'T9 failed: expected conflict: ' || r::text;
    raise notice 'T9 PASS: CAS insert conflict detected';
end $$;

-- T10: CAS concurrency — two pushes with the same baseRevision:
-- exactly one success, the second conflicts. (Simulated sequentially here;
-- a true parallel check is described in the runbook with two psql sessions.)
do $$
declare r1 jsonb; r2 jsonb;
begin
    r1 := public.sync_push_document(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 2,
        '{"dreams":[{"id":"d1"}],"seq":"first"}'::jsonb,
        'device-a-test');
    assert (r1->>'ok') = 'true', 'T10: first concurrent push failed: ' || r1::text;
    assert (r1->>'revision') = '3', 'T10: first push revision != 3: ' || r1::text;

    r2 := public.sync_push_document(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 2,
        '{"dreams":[{"id":"d1"}],"seq":"second"}'::jsonb,
        'device-a-test');
    assert (r2->>'ok') = 'false' and (r2->>'conflict') = 'true',
           'T10: second concurrent push must conflict: ' || r2::text;
    assert (r2->>'currentRevision') = '3', 'T10: currentRevision != 3: ' || r2::text;
    raise notice 'T10 PASS: same baseRevision -> exactly one success, one conflict';
end $$;

-- T11: sync_snapshot for foreign/nonexistent board -> board_not_found.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'USER_B_UUID', true);
do $$
declare r jsonb;
begin
    r := public.sync_snapshot(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 1, 'manual_restore', '{}'::jsonb);
    assert (r->>'ok') = 'false' and (r->>'error') = 'board_not_found',
           'T11 failed: expected board_not_found: ' || r::text;
    raise notice 'T11 PASS: snapshot for foreign board -> board_not_found';
end $$;

-- T12: sync_assets insert for foreign/nonexistent board -> expected
-- foreign_key_violation (23503) or insufficient_privilege (42501) ONLY.
-- Any other error propagates and fails the test. After the attempt we
-- separately confirm no asset row was created.
do $$
declare n int;
begin
    begin
        insert into public.sync_assets
            (user_id, board_id, image_id, storage_path, content_hash)
        values
            ('USER_B_UUID', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
             'img1', 'USER_B_UUID/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1/img1', 'abc');
        raise exception 'T12 FAILED: asset insert for foreign board was allowed';
    exception
        when foreign_key_violation then
            raise notice 'T12 PASS: asset insert for foreign board -> FK violation';
        when insufficient_privilege then
            raise notice 'T12 PASS: asset insert for foreign board -> denied (42501)';
    end;

    select count(*) into n from public.sync_assets;
    assert n = 0, 'T12 FAILED: asset row appeared despite denial: ' || n;
    raise notice 'T12 PASS: no asset row persisted';
end $$;

-- T13: negative baseRevision -> invalid_base_revision.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'USER_A_UUID', true);
do $$
declare r jsonb;
begin
    r := public.sync_push_document(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', -1,
        '{"dreams":[]}'::jsonb,
        'device-a-test');
    assert (r->>'ok') = 'false' and (r->>'error') = 'invalid_base_revision',
           'T13 failed: expected invalid_base_revision: ' || r::text;
    raise notice 'T13 PASS: negative baseRevision rejected';
end $$;

reset role;
rollback;

-- Expected outcome: PASS notices for T1, T2a, T2b, T2c, T3, T4, T5, T6, T7
-- (3 asserts), T8 (4 asserts), T9, T10, T11, T12 (2 asserts), T13; no
-- FAILED. All test rows are rolled back.

-- ============================================================================
-- 8. ROLLBACK / DOWN
-- ============================================================================
-- Execute ONLY to tear down the sandbox schema. Order matters.

-- drop policy if exists sync_documents_select on public.sync_documents;
-- drop policy if exists sync_assets_select     on public.sync_assets;
-- drop policy if exists sync_assets_insert     on public.sync_assets;
-- drop policy if exists sync_assets_update     on public.sync_assets;
-- drop policy if exists sync_assets_delete     on public.sync_assets;
-- drop policy if exists sync_versions_select   on public.sync_versions;
-- drop policy if exists dreamboard_assets_insert on storage.objects;
-- drop policy if exists dreamboard_assets_select on storage.objects;
-- drop policy if exists dreamboard_assets_update on storage.objects;
-- drop policy if exists dreamboard_assets_delete on storage.objects;

-- alter table public.sync_assets   drop constraint if exists sync_assets_board_fk;
-- alter table public.sync_versions drop constraint if exists sync_versions_board_fk;

-- drop function if exists public.sync_push_document(uuid, bigint, jsonb, jsonb, text, timestamptz, int, int);
-- drop function if exists public.sync_push_document(uuid, bigint, jsonb, text, jsonb, timestamptz, int, int);
-- drop function if exists public.sync_snapshot(uuid, bigint, text, jsonb, jsonb);

-- drop table if exists public.sync_versions cascade;
-- drop table if exists public.sync_assets    cascade;
-- drop table if exists public.sync_documents cascade;

-- delete from storage.buckets where id = 'dreamboard-assets';  -- objects inside are deleted with the bucket

-- Sandbox test users created via Auth Dashboard/Admin API (see runbook);
-- delete them in Dashboard (Authentication -> Users), not via SQL.
