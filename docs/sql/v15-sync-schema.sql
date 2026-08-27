-- ============================================================================
-- DreamBoard v15 — Sync schema (snapshot-first, local-first)
-- Approved spec: docs/SUPABASE_ARCHITECTURE.md (decisions D1–D17)
-- Target: Supabase (Postgres) project in EU region, NON-PRODUCTION sandbox
-- first. Execute via Supabase SQL editor as the project owner.
--
-- Contents:
--   1. Tables + constraints (sync_documents, sync_assets, sync_versions)
--   2. RLS policies (per-user isolation, append-only versions)
--   3. Private Storage bucket + object policies
--   4. Atomic CAS RPC (sync_push_document) + snapshot RPC (sync_snapshot)
--   5. Retention (hint only — NO automatic deletion in MVP)
--   6. Cross-user tests (A/B/anon) — sandbox only
--   7. Rollback / down section
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
    constraint sync_documents_trash_format check (trash ? 'formatVersion'),
    constraint sync_documents_revision_positive check (revision >= 1)
);

comment on table public.sync_documents is
    'Snapshot-first board documents. One row per (user, board). CAS via sync_push_document RPC only.';

create table if not exists public.sync_assets (
    id            uuid primary key default gen_random_uuid(),
    user_id       uuid not null references auth.users(id) on delete cascade,
    board_id      uuid not null,
    image_id      text not null,                         -- logical image id referenced from state
    storage_path  text not null,                         -- dream-images/{user_id}/{board_id}/...
    mime_type     text not null default 'image/webp',
    size_bytes    int check (size_bytes >= 0),
    content_hash  text not null,                         -- dedup key
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    constraint sync_assets_unique_image unique (user_id, board_id, image_id),
    constraint sync_assets_hash_not_empty check (length(content_hash) > 0)
);

comment on table public.sync_assets is
    'Image metadata only. Binary lives in the private Storage bucket; no public URLs, signed URLs only.';

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
    retention_until  timestamptz not null default (now() + interval '30 days')
);

create index if not exists idx_sync_versions_board
    on public.sync_versions (user_id, board_id, revision desc);
create index if not exists idx_sync_assets_board
    on public.sync_assets (user_id, board_id);
create index if not exists idx_sync_documents_updated
    on public.sync_documents (user_id, updated_at);

comment on table public.sync_versions is
    'Append-only immutable snapshots (first migration, conflicts, manual restore). '
    'retention_until is a hint ONLY — no automatic deletion until a separate server-side job exists.';

-- ============================================================================
-- 2. RLS POLICIES
-- ============================================================================

alter table public.sync_documents enable row level security;
alter table public.sync_documents force row level security;
alter table public.sync_assets     enable row level security;
alter table public.sync_assets     force row level security;
alter table public.sync_versions   enable row level security;
alter table public.sync_versions   force row level security;

-- sync_documents: full owner access
drop policy if exists sync_documents_select on public.sync_documents;
create policy sync_documents_select on public.sync_documents
    for select using (user_id = auth.uid());

drop policy if exists sync_documents_insert on public.sync_documents;
create policy sync_documents_insert on public.sync_documents
    for insert with check (user_id = auth.uid());

drop policy if exists sync_documents_update on public.sync_documents;
create policy sync_documents_update on public.sync_documents
    for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists sync_documents_delete on public.sync_documents;
create policy sync_documents_delete on public.sync_documents
    for delete using (user_id = auth.uid());

-- sync_assets: full owner access
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

-- sync_versions: SELECT + INSERT only (append-only). No update/delete policies
-- -> RLS default-deny for those operations. This is intentional.
drop policy if exists sync_versions_select on public.sync_versions;
create policy sync_versions_select on public.sync_versions
    for select using (user_id = auth.uid());

drop policy if exists sync_versions_insert on public.sync_versions;
create policy sync_versions_insert on public.sync_versions
    for insert with check (user_id = auth.uid());

-- ============================================================================
-- 3. PRIVATE STORAGE (bucket + object policies)
-- ============================================================================

-- Private bucket (public = false). Signed URLs only, issued per request.
insert into storage.buckets (id, name, public)
values ('dreamboard-assets', 'dreamboard-assets', false)
on conflict (id) do nothing;

-- Object path convention: dream-images/{user_id}/{board_id}/...
-- First path segment must equal the authenticated user id.

drop policy if exists dreamboard_assets_insert on storage.objects;
create policy dreamboard_assets_insert on storage.objects
    for insert with check (
        bucket_id = 'dreamboard-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists dreamboard_assets_select on storage.objects;
create policy dreamboard_assets_select on storage.objects
    for select using (
        bucket_id = 'dreamboard-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists dreamboard_assets_update on storage.objects;
create policy dreamboard_assets_update on storage.objects
    for update using (
        bucket_id = 'dreamboard-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
    ) with check (
        bucket_id = 'dreamboard-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists dreamboard_assets_delete on storage.objects;
create policy dreamboard_assets_delete on storage.objects
    for delete using (
        bucket_id = 'dreamboard-assets'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

-- ============================================================================
-- 4. ATOMIC CAS RPC + SNAPSHOT RPC
-- ============================================================================

-- sync_push_document(board_id, base_revision, state, trash, device, deleted_at,
--                    format_version, schema_version)
--   base_revision = 0 -> insert new document (revision becomes 1).
--   base_revision = N -> update only if current revision = N, then increment.
-- Returns jsonb:
--   {"ok":true,"revision":N,"updatedAt":"..."}
--   {"ok":false,"conflict":true,"currentRevision":N,"updatedAt":"..."}
--   {"ok":false,"error":"not_found"}
-- SECURITY INVOKER: executes with the caller's rights, RLS still applies.
-- Single SQL statement per branch -> atomic.
create or replace function public.sync_push_document(
    p_board_id        uuid,
    p_base_revision   bigint,
    p_state           jsonb,
    p_trash           jsonb default '{"formatVersion":1,"items":[]}'::jsonb,
    p_device          text,
    p_deleted_at      timestamptz default null,
    p_format_version  int default 1,
    p_schema_version  int default 2
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_revision bigint;
    v_updated  timestamptz;
    v_current  record;
begin
    if auth.uid() is null then
        return jsonb_build_object('ok', false, 'error', 'unauthenticated');
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

    -- CAS update path: atomic conditional update.
    update public.sync_documents
       set revision = revision + 1,
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

-- sync_snapshot(board_id, revision, reason, state, trash)
-- Append-only version snapshot (first migration, conflicts, manual restore).
create or replace function public.sync_snapshot(
    p_board_id uuid,
    p_revision bigint,
    p_reason   text,
    p_state    jsonb,
    p_trash    jsonb default '{"formatVersion":1,"items":[]}'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    v_id bigint;
begin
    if auth.uid() is null then
        return jsonb_build_object('ok', false, 'error', 'unauthenticated');
    end if;
    insert into public.sync_versions
        (user_id, board_id, revision, reason, state, trash)
    values
        (auth.uid(), p_board_id, p_revision, p_reason, p_state, p_trash)
    returning id into v_id;
    return jsonb_build_object('ok', true, 'versionId', v_id);
end;
$$;

revoke all on function public.sync_push_document(uuid, bigint, jsonb, jsonb, text, timestamptz, int, int) from public;
revoke all on function public.sync_snapshot(uuid, bigint, text, jsonb, jsonb) from public;
grant execute on function public.sync_push_document(uuid, bigint, jsonb, jsonb, text, timestamptz, int, int) to authenticated;
grant execute on function public.sync_snapshot(uuid, bigint, text, jsonb, jsonb) to authenticated;

-- ============================================================================
-- 5. RETENTION
-- ============================================================================
-- retention_until on sync_versions is a hint for a FUTURE server-side job.
-- MVP intentionally has NO automatic deletion: no triggers, no cron, no
-- pg_cron jobs. Data is removed only by the user (account/board deletion)
-- or by an explicitly approved maintenance job in a later stage.

-- ============================================================================
-- 6. CROSS-USER TESTS (A / B / anon) — SANDBOX ONLY
-- ============================================================================
-- Run in the NON-PRODUCTION sandbox project. Creates two throwaway users in
-- auth.users. Do NOT run against any production project.
--
-- Test matrix (asserted below):
--   T1  A creates a document (base=0)                    -> ok, revision 1
--   T2  A sees own document; B sees nothing; anon sees nothing
--   T3  A push with correct base (1)                     -> ok, revision 2
--   T4  A push with stale base (1 again)                 -> conflict
--   T5  B direct UPDATE of A's row                       -> 0 rows (RLS)
--   T6  B direct INSERT with user_id = A                 -> denied (42501)
--   T7  sync_versions: snapshot ok; UPDATE/DELETE denied (append-only)
--   T8  Storage policies present for dreamboard-assets   -> >= 4 policies
--   T9  CAS insert conflict (A push base=0 again)        -> conflict

begin;

-- Seed two sandbox users (A, B). Emails are throwaway; no mail is sent.
insert into auth.users
    (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
     created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
    ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
     'authenticated', 'authenticated', 'sync-test-a@example.test',
     crypt('password-123456', gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{}'),
    ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
     'authenticated', 'authenticated', 'sync-test-b@example.test',
     crypt('password-123456', gen_salt('bf')), now(), now(), now(),
     '{"provider":"email","providers":["email"]}', '{}')
on conflict (id) do nothing;

-- T1: A creates a document (CAS insert path).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
do $$
declare r jsonb;
begin
    r := public.sync_push_document(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 0,
        '{"dreams":[],"settings":{},"uiState":{}}'::jsonb,
        '{"formatVersion":1,"items":[]}'::jsonb,
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
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true);
do $$
declare n int;
begin
    select count(*) into n from public.sync_documents;
    assert n = 0, 'T2b failed: B should see 0 rows, got ' || n;
    raise notice 'T2b PASS: B sees nothing';
end $$;

-- T2c: anon sees nothing.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare n int;
begin
    select count(*) into n from public.sync_documents;
    assert n = 0, 'T2c failed: anon should see 0 rows, got ' || n;
    raise notice 'T2c PASS: anon sees nothing';
end $$;

-- T3: A push with correct base revision (1 -> 2).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
do $$
declare r jsonb;
begin
    r := public.sync_push_document(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 1,
        '{"dreams":[{"id":"d1"}]}'::jsonb,
        '{"formatVersion":1,"items":[]}'::jsonb,
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
        '{"formatVersion":1,"items":[]}'::jsonb,
        'device-a-test');
    assert (r->>'ok') = 'false', 'T4 failed: expected not ok: ' || r::text;
    assert (r->>'conflict') = 'true', 'T4 failed: expected conflict: ' || r::text;
    assert (r->>'currentRevision') = '2', 'T4 failed: currentRevision != 2: ' || r::text;
    raise notice 'T4 PASS: stale base -> conflict, currentRevision=2';
end $$;

-- T5: B direct UPDATE of A's row -> 0 rows affected (RLS filter).
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', true);
do $$
declare n int;
begin
    update public.sync_documents
       set state = '{"hacked":true}'::jsonb
     where board_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
    get diagnostics n = row_count;
    assert n = 0, 'T5 failed: B updated ' || n || ' rows of A';
    raise notice 'T5 PASS: B update of A row affected 0 rows';
end $$;

-- T6: B direct INSERT with user_id = A -> RLS WITH CHECK violation (42501).
do $$
begin
    begin
        insert into public.sync_documents
            (user_id, board_id, revision, state, trash, updated_by_device)
        values
            ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
             'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb9', 1,
             '{}'::jsonb, '{"formatVersion":1,"items":[]}'::jsonb, 'device-b-test');
        raise exception 'T6 FAILED: insert as A from B session was allowed';
    exception
        when insufficient_privilege then
            raise notice 'T6 PASS: insert with foreign user_id denied (42501)';
    end;
end $$;

-- T7: sync_versions append-only: snapshot ok, UPDATE/DELETE denied.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
do $$
declare r jsonb; n int;
begin
    r := public.sync_snapshot(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 2, 'conflict_local',
        '{"dreams":[{"id":"d1"}]}'::jsonb, '{"formatVersion":1,"items":[]}'::jsonb);
    assert (r->>'ok') = 'true', 'T7 snapshot failed: ' || r::text;
    select count(*) into n from public.sync_versions;
    assert n = 1, 'T7: expected 1 version row, got ' || n;
    begin
        update public.sync_versions set reason = 'manual_restore';
        raise exception 'T7 FAILED: version update was allowed';
    exception
        when insufficient_privilege then
            raise notice 'T7 PASS: sync_versions UPDATE denied';
    end;
    begin
        delete from public.sync_versions;
        raise exception 'T7 FAILED: version delete was allowed';
    exception
        when insufficient_privilege then
            raise notice 'T7 PASS: sync_versions DELETE denied (append-only)';
    end;
end $$;

-- T8: Storage policies present for dreamboard-assets.
do $$
declare n int;
begin
    select count(*) into n
    from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'dreamboard_assets_%';
    assert n >= 4, 'T8 failed: expected >=4 storage policies, got ' || n;
    raise notice 'T8 PASS: % dreamboard storage policies present', n;
end $$;

-- T9: CAS insert conflict (A push base=0 for existing board) -> conflict.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', true);
do $$
declare r jsonb;
begin
    r := public.sync_push_document(
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1', 0,
        '{"dreams":[]}'::jsonb, '{"formatVersion":1,"items":[]}'::jsonb,
        'device-a-test');
    assert (r->>'ok') = 'false', 'T9 failed: expected not ok: ' || r::text;
    assert (r->>'conflict') = 'true', 'T9 failed: expected conflict: ' || r::text;
    raise notice 'T9 PASS: CAS insert conflict detected';
end $$;

reset role;
commit;

-- Expected outcome: 10 PASS notices, 0 FAILED.
-- (T1, T2a, T2b, T2c, T3, T4, T5, T6, T7, T8, T9 = 11 checks; T7 contains 3 asserts.)

-- ============================================================================
-- 7. ROLLBACK / DOWN
-- ============================================================================
-- Execute ONLY to tear down the sandbox schema. Order matters.

-- drop policy if exists sync_documents_select  on public.sync_documents;
-- drop policy if exists sync_documents_insert  on public.sync_documents;
-- drop policy if exists sync_documents_update  on public.sync_documents;
-- drop policy if exists sync_documents_delete  on public.sync_documents;
-- drop policy if exists sync_assets_select     on public.sync_assets;
-- drop policy if exists sync_assets_insert     on public.sync_assets;
-- drop policy if exists sync_assets_update     on public.sync_assets;
-- drop policy if exists sync_assets_delete     on public.sync_assets;
-- drop policy if exists sync_versions_select   on public.sync_versions;
-- drop policy if exists sync_versions_insert   on public.sync_versions;
-- drop policy if exists dreamboard_assets_insert on storage.objects;
-- drop policy if exists dreamboard_assets_select on storage.objects;
-- drop policy if exists dreamboard_assets_update on storage.objects;
-- drop policy if exists dreamboard_assets_delete on storage.objects;

-- drop function if exists public.sync_push_document(uuid, bigint, jsonb, jsonb, text, timestamptz, int, int);
-- drop function if exists public.sync_snapshot(uuid, bigint, text, jsonb, jsonb);

-- drop table if exists public.sync_versions cascade;
-- drop table if exists public.sync_assets    cascade;
-- drop table if exists public.sync_documents cascade;

-- delete from storage.buckets where id = 'dreamboard-assets';  -- objects inside are deleted with the bucket

-- Test users (sandbox): auth.users rows for sync-test-a/b@example.test may be deleted via
-- delete from auth.users where id in ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2');
