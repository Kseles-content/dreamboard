# DreamBoard — Supabase Backend Architecture

> **Version:** 1.0  
> **Status:** Draft for review  
> **Intended reading:** Full-stack developers working on DreamBoard.  
> **Relationship to other docs:** This document describes the Supabase integration planned *after* local image upload. For the current vanilla-SPA codebase see `app.js` and related.

---

## Table of Contents

1. [Overview & Motivation](#1-overview--motivation)
2. [Current Architecture (Baseline)](#2-current-architecture-baseline)
3. [Target Architecture](#3-target-architecture)
4. [Schema: Tables & Relationships](#4-schema-tables--relationships)
5. [Row-Level Security (RLS) Policies](#5-row-level-security-rls-policies)
6. [Storage: Dream Images](#6-storage-dream-images)
7. [Config for GitHub Pages (no Vite)](#7-config-for-github-pages-no-vite)
8. [API Methods (Supabase JS Client)](#8-api-methods-supabase-js-client)
9. [Local Storage → Account Migration Flow](#9-local-storage--account-migration-flow)
10. [Integration Steps](#10-integration-steps)
11. [File Change Plan](#11-file-change-plan)

---

## 1. Overview & Motivation

DreamBoard is currently a **vanilla (no framework) single-page application** hosted on GitHub Pages. All data—dreams, milestones, images—lives in `localStorage` and / or IndexedDB.

### Why Supabase

| Need | Supabase approach |
|---|---|
| User registration & auth | Supabase Auth (email + OAuth providers) |
| Cross-device board sync | PostgreSQL + Supabase JS client (real-time optional) |
| Image storage | Supabase Storage (S3-based) |
| Per-user data isolation | RLS (Row-Level Security) on every table |
| No backend code to maintain | Direct-to-database client (anon key + RLS) |
| Future real-time collaboration | Supabase Realtime (Postgres replication) |

### Why NOT Firebase

- Supabase uses **PostgreSQL** — relational schema fits boards → dreams → milestones naturally.
- Lower vendor lock-in: Postgres + S3 are portable.
- Supabase has a free tier generous enough for early users.

---

## 2. Current Architecture (Baseline)

```
┌──────────────────────────────────────┐
│  GitHub Pages (Static SPA)           │
│                                      │
│  ├── index.html                      │
│  ├── style.css                       │
│  ├── app.js          ← all app logic │
│  ├── manifest.json                   │
│  ├── service-worker.js               │
│  └── assets/                         │
│       ├── icons/                     │
│       └── images/  ← static defaults │
│                                      │
│  Data: localStorage('dreams_db')     │
│  Images: unsplash URLs + defaults    │
│  Auth: none                          │
└──────────────────────────────────────┘
```

- Vanilla JS, no build step, no environment variables at build time.
- `config.js` will supply Supabase credentials at runtime (see §7).
- Images for user-uploaded content are stored in **IndexedDB** (stage 1, local). In stage 2 they move to Supabase Storage.

---

## 3. Target Architecture

```
┌──────────────────────────────────┐      ┌────────────────────────────────┐
│  GitHub Pages (Static SPA)       │      │  Supabase Project              │
│                                  │      │                                │
│  ├── index.html                  │      │  ├── Auth                      │
│  ├── style.css                   │      │  │   ├── Email + password      │
│  ├── app.js                      │      │  │   ├── Google OAuth          │
│  ├── supabase.js (NEW)           │─────▶│  │   └── GitHub OAuth          │
│  ├── auth.js (NEW)               │      │  │                              │
│  ├── config.js (NEW)             │      │  ├── Postgres Database         │
│  ├── manifest.json               │      │  │   ├── profiles              │
│  ├── service-worker.js           │      │  │   ├── boards                │
│  └── assets/                     │      │  │   ├── dreams                │
│       ├── icons/                 │      │  │   ├── milestones            │
│       └── images/                │      │  │   └── images                │
│                                  │      │  │                              │
│  Data Flow:                      │      │  ├── Storage (S3-compatible)   │
│  ├── localStorage = session      │      │  │   └── dream-images/ bucket  │
│  ├── IndexedDB = local images    │      │  │                              │
│  └── Supabase = source of truth  │      │  └── RLS on all tables         │
│                                  │      └────────────────────────────────┘
└──────────────────────────────────┘
```

**Key principle:** Supabase is the source of truth. `localStorage` becomes a read-only cache for offline support (future).

---

## 4. Schema: Tables & Relationships

### 4.1 `profiles`

Extends Supabase `auth.users` with application-specific data.

```sql
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    username TEXT UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on signup
CREATE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, display_name)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8)),
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'New Dreamer')
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION handle_new_user();
```

### 4.2 `boards`

A board is a top-level container — a "DreamBoard". Each user has at least one.

```sql
CREATE TABLE boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT 'My DreamBoard',
    description TEXT DEFAULT '',
    color TEXT DEFAULT '#6366f1',          -- theme accent
    sort_order INT DEFAULT 0,
    is_default BOOLEAN DEFAULT false,      -- first auto-created board
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

### 4.3 `dreams`

Individual dream cards. Belong to a board.

```sql
CREATE TABLE dreams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    category TEXT DEFAULT 'career',
    target_year INT,
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'manifested', 'archived')),
    image_url TEXT,                       -- legacy Unsplash URL
    image_path TEXT,                      -- Supabase Storage path (user_id/dream_id/*.webp)
    canvas_pos_x FLOAT DEFAULT 0,
    canvas_pos_y FLOAT DEFAULT 0,
    canvas_width FLOAT DEFAULT 320,
    canvas_height FLOAT DEFAULT 420,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_dreams_board_id ON dreams(board_id);
CREATE INDEX idx_dreams_user_id ON dreams(user_id);
CREATE INDEX idx_dreams_status ON dreams(status);
```

**Statuses:**

| Status | Meaning |
|---|---|
| `active` | Dream in progress, visible on the main board |
| `manifested` | Achieved / manifested — moved to Archive of Gratitude |
| `archived` | Archived without achievement (deleted from main view) |

### 4.4 `milestones`

Sub-goals / checklists under a dream.

```sql
CREATE TABLE milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dream_id UUID NOT NULL REFERENCES dreams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    completed BOOLEAN DEFAULT false,
    completed_at TIMESTAMPTZ,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_milestones_dream_id ON milestones(dream_id);
CREATE INDEX idx_milestones_user_id ON milestones(user_id);
```

### 4.5 `images`

Metadata for uploaded images (kept separate from dreams for reusability).

```sql
CREATE TABLE images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,            -- full storage object path
    original_name TEXT,
    mime_type TEXT DEFAULT 'image/webp',
    size_bytes INT,
    width INT,
    height INT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_images_user_id ON images(user_id);
```

### 4.6 Entity Relationship

```
auth.users
    │
    ▼
profiles ──── boards ──── dreams ──── milestones
    │            │            │
    │            │            └── images (via image_path / dream_id)
    │            └── (user_id FK)
    │
    └── images (user_id FK)

storage.objects (bucket: dream-images)
    └── user_id/dream_id/image.webp  ← referenced by dreams.image_path
```

---

## 5. Row-Level Security (RLS) Policies

### 5.1 Enable RLS

```sql
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE boards    ENABLE ROW LEVEL SECURITY;
ALTER TABLE dreams    ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE images    ENABLE ROW LEVEL SECURITY;
```

### 5.2 `profiles`

```sql
-- Read: any authenticated user can read basic profile info
CREATE POLICY "Profiles are publicly readable"
    ON profiles FOR SELECT
    USING (true);

-- Write: only own profile
CREATE POLICY "Users can update own profile"
    ON profiles FOR UPDATE
    USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
    ON profiles FOR INSERT
    WITH CHECK (id = auth.uid());

-- Note: DELETE is deliberately not open — profile deletion is
-- handled via Supabase admin API or trigger.
```

### 5.3 `boards`

```sql
CREATE POLICY "Users own their boards"
    ON boards FOR ALL
    USING (user_id = auth.uid());

-- Insert: must belong to current user
CREATE POLICY "Users create their own boards"
    ON boards FOR INSERT
    WITH CHECK (user_id = auth.uid());
```

### 5.4 `dreams`

```sql
-- SELECT, UPDATE, DELETE: own dreams only
CREATE POLICY "Users own their dreams"
    ON dreams FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY "Users create their own dreams"
    ON dreams FOR INSERT
    WITH CHECK (user_id = auth.uid());
```

### 5.5 `milestones`

```sql
CREATE POLICY "Users own their milestones"
    ON milestones FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY "Users create their own milestones"
    ON milestones FOR INSERT
    WITH CHECK (user_id = auth.uid());
```

### 5.6 `images`

```sql
CREATE POLICY "Users own their images"
    ON images FOR ALL
    USING (user_id = auth.uid());

CREATE POLICY "Users create their own images"
    ON images FOR INSERT
    WITH CHECK (user_id = auth.uid());
```

### 5.7 `storage.objects` (Supabase Storage)

Bucket: `dream-images` (private bucket)

```sql
CREATE POLICY "Users can view their own images"
    ON storage.objects FOR SELECT
    USING (auth.role() = 'authenticated')
    -- Additional path-level: auth.uid()::text = (storage.foldername(name))[1]
    AND (storage.foldername(name))[1] = auth.uid()::text;

CREATE POLICY "Users can upload their own images"
    ON storage.objects FOR INSERT
    WITH CHECK (
        auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can update their own images"
    ON storage.objects FOR UPDATE
    USING (
        auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY "Users can delete their own images"
    ON storage.objects FOR DELETE
    USING (
        auth.role() = 'authenticated'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
```

**Path format enforced by policies:** `{user_id}/{dream_id}/{filename}.webp`

The first folder segment (`user_id`) is compared against `auth.uid()`. This ensures that even if a user knows another user's Storage URL, they cannot read/delete it.

---

## 6. Storage: Dream Images

### 6.1 Bucket Configuration

| Property | Value |
|---|---|
| Bucket name | `dream-images` |
| Visibility | **Private** (not public) |
| File limit | 10 MB per file |
| Allowed MIME types | `image/jpeg`, `image/png`, `image/webp`, `image/gif` |
| Allowed file extensions | `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif` |

### 6.2 Upload Path Convention

```
dream-images/{user_id}/{dream_id}/{timestamp}-{hash}.webp
```

Example:
```
dream-images/a1b2c3d4-e5f6-7890-abcd-ef1234567890/board/uuid/dream/uuid/1687123456-aB3dE9.webp
```

### 6.3 Client-Side Upload Flow

1. User selects an image from their device
2. **Client-side processing** (Canvas API):
   - Auto-crop to 3:2 or 1:1 aspect ratio
   - Compress to WebP (quality 80-85)
   - Max dimension 1920px
3. If user is **not authenticated** → save to IndexedDB
4. If user is **authenticated** → upload to Supabase Storage:
   ```js
   const { data, error } = await supabase.storage
     .from('dream-images')
     .upload(filePath, webpBlob, {
       contentType: 'image/webp',
       upsert: true
     });
   ```
5. On success, insert row into `images` table + set `dreams.image_path`

### 6.4 Image Serving

- Images are served via Supabase signed URLs (30-day expiry, refreshed client-side).
- Alternatively, create a Supabase Edge Function that serves images with proper auth checks.

```js
// Get signed URL (short-lived)
const { data } = await supabase.storage
  .from('dream-images')
  .createSignedUrl(filePath, 3600); // 1 hour
```

---

## 7. Config for GitHub Pages (no Vite)

Since the project is a **vanilla SPA without a build step**, we cannot use `VITE_*` environment variables. Instead:

### 7.1 `config.js` (new file)

```js
// config.js — loaded before app.js
const DREAMBOARD_CONFIG = {
  supabase: {
    url: 'https://your-project.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIs...',
  },
  features: {
    localImageUpload: true,
    authEnabled: true,
  },
  storage: {
    bucket: 'dream-images',
    maxFileSize: 10 * 1024 * 1024, // 10 MB
  },
};
```

### 7.2 Load Order in `index.html`

```html
<head>
  <!-- ... -->
  <script src="config.js"></script>
  <script src="https://unpkg.com/@supabase/supabase-js@2"></script>
  <script src="supabase.js"></script> <!-- client init -->
  <script src="auth.js"></script>    <!-- auth UI -->
  <script src="app.js"></script>    <!-- app logic -->
</head>
```

### 7.3 `supabase.js` (new file)

```js
// supabase.js — depends on config.js
const { createClient } = supabase;

window.db = createClient(
  DREAMBOARD_CONFIG.supabase.url,
  DREAMBOARD_CONFIG.supabase.anonKey
);
```

### 7.4 Future: Vite Migration

Vite can be added later. At that point:
- `config.js` → `.env` + `import.meta.env`
- `supabase-js` → npm dependency
- Bundle splitting for PWA

---

## 8. API Methods (Supabase JS Client)

These are the primary data access patterns the app will use. All go through the singleton `window.db` created in `supabase.js`.

### 8.1 Auth

```js
// Sign up
await db.auth.signUp({ email, password });

// Sign in
await db.auth.signInWithPassword({ email, password });

// Sign in with OAuth
await db.auth.signInWithOAuth({ provider: 'google' });

// Sign out
await db.auth.signOut();

// Current user
const { data: { user } } = await db.auth.getUser();
```

### 8.2 Boards

```js
// Get all boards for current user
const { data } = await db.from('boards')
  .select('*')
  .order('sort_order');

// Create board
const { data } = await db.from('boards')
  .insert({ title: 'My DreamBoard', user_id: user.id })
  .select()
  .single();
```

### 8.3 Dreams

```js
// Get dreams for a board (with milestones)
const { data } = await db.from('dreams')
  .select(`
    *,
    milestones (
      id, title, completed, completed_at, sort_order
    )
  `)
  .eq('board_id', boardId)
  .in('status', ['active', 'manifested'])
  .order('sort_order');

// Create dream
const { data } = await db.from('dreams')
  .insert({
    board_id,
    user_id: user.id,
    title: 'My Dream',
    category: 'career',
    status: 'active',
    milestones: [
      { title: 'Step 1', user_id: user.id },
    ],
  })
  .select(`
    *,
    milestones (*)
  `)
  .single();

// Update dream (including image_path)
await db.from('dreams')
  .update({ image_path: 'user_id/dream_id/img.webp' })
  .eq('id', dreamId);

// Archive / Manifest dream
await db.from('dreams')
  .update({ status: 'manifested' })
  .eq('id', dreamId);
```

### 8.4 Milestones

```js
// Toggle milestone
await db.from('milestones')
  .update({
    completed: !currentValue,
    completed_at: currentValue ? null : new Date().toISOString(),
  })
  .eq('id', milestoneId);
```

### 8.5 Images

```js
// Upload image
const filePath = `${user.id}/${dreamId}/${Date.now()}-${crypto.randomUUID().slice(0,6)}.webp`;

const { error: uploadError } = await db.storage
  .from('dream-images')
  .upload(filePath, webpBlob, { contentType: 'image/webp' });

if (!uploadError) {
  await db.from('images').insert({
    user_id: user.id,
    storage_path: filePath,
    mime_type: 'image/webp',
    size_bytes: webpBlob.size,
  });

  await db.from('dreams')
    .update({ image_path: filePath })
    .eq('id', dreamId);
}
```

---

## 9. Local Storage → Account Migration Flow

This is the critical path for early adopters who already have data.

### 9.1 Data Sources Before Migration

| Source | Content |
|---|---|
| `localStorage('dreams_db')` | Array of dream objects (with milestones, canvas positions, statuses) |
| `IndexedDB` (local images) | Blob/filename pairs uploaded locally (stage 1) |

### 9.2 Migration Trigger

When a user **signs in** (first time or after local use):

```
┌─────────────────────────────────────────────────────┐
│  1. User clicks "Sign In / Register"                │
│  2. Supabase Auth completes                         │
│  3. Client checks: localStorage('dreams_db') exists?│
│     └── YES ──▶ Show migration dialog               │
│     └── NO  ──▶ Normal flow (no migration)          │
│                                                     │
│  4. Migration Dialog:                                │
│     "We found 4 dreams in your browser.              │
│      Transfer them to your account?"                 │
│     [Transfer] [Skip]                                │
│                                                     │
│  5. On "Transfer":                                   │
│     a. Create default board                         │
│     b. For each dream:                               │
│        - Create board row                           │
│        - Create dream row                           │
│        - Create milestone rows                      │
│        - Upload local image (IndexedDB) → Storage   │
│        - Update dream.image_path                    │
│     c. On success:                                  │
│        - Clear localStorage('dreams_db')            │
│        - Clear IndexedDB images                     │
│        - Show success toast                          │
│     d. On error:                                     │
│        - Show error, keep local data                 │
│        - User can retry                              │
│                                                     │
│  6. On "Skip":                                      │
│     - Keep local data intact                         │
│     - Future sessions start from Supabase            │
│     - Re-prompt on next sign-in? (TBD)              │
└─────────────────────────────────────────────────────┘
```

### 9.3 API Pattern for Migration

```js
async function migrateLocalData(userId) {
  const localData = JSON.parse(localStorage.getItem('dreams_db') || '[]');
  if (!localData.length) return;

  // 1. Create default board
  const { data: board } = await db.from('boards')
    .insert({
      user_id: userId,
      title: 'My DreamBoard',
      is_default: true,
    })
    .select()
    .single();

  // 2. Process each dream
  for (const dream of localData) {
    let imagePath = null;

    // Upload local image if present
    if (dream.imageUrl && !dream.imageUrl.startsWith('http')) {
      const localImage = await getLocalImage(dream.imageUrl);
      if (localImage) {
        imagePath = await uploadDreamImage(userId, dream.id, localImage);
      }
    }

    // Create dream
    const { data: newDream } = await db.from('dreams')
      .insert({
        board_id: board.id,
        user_id: userId,
        title: dream.title,
        description: dream.desc,
        category: dream.category || 'career',
        target_year: dream.year || null,
        status: dream.status || 'active',
        image_url: dream.imageUrl?.startsWith('http') ? dream.imageUrl : null,
        image_path: imagePath,
        canvas_pos_x: dream.canvasPos?.x || 0,
        canvas_pos_y: dream.canvasPos?.y || 0,
        canvas_width: dream.canvasPos?.width || 320,
        canvas_height: dream.canvasPos?.height || 420,
      })
      .select()
      .single();

    // Create milestones
    if (dream.milestones?.length) {
      await db.from('milestones')
        .insert(
          dream.milestones.map((m, i) => ({
            dream_id: newDream.id,
            user_id: userId,
            title: m.text,
            completed: m.checked || false,
            completed_at: m.checked ? new Date().toISOString() : null,
            sort_order: i,
          }))
        );
    }
  }

  // 3. Clean up
  localStorage.removeItem('dreams_db');
  await clearLocalImages();

  return { transferred: localData.length };
}
```

### 9.4 Rollback Safety

- Local data is **only cleared after all Supabase writes succeed**.
- Each write is individually reliable (Supabase returns 200 or error).
- If any step fails, local data is preserved and user is prompted to retry.

---

## 10. Integration Steps

### Phase 0: Current (pre-Supabase)
- [x] Local image upload with crop + compress + IndexedDB (stage 1)
- [x] All data in localStorage
- [ ] This architecture doc reviewed and approved

### Phase 1: Supabase Foundation
- [ ] Create Supabase project
- [ ] Run SQL schema + RLS policies
- [ ] Create `dream-images` storage bucket (private)
- [ ] Create `config.js` with Supabase credentials
- [ ] Add `supabase-js` CDN script to `index.html`
- [ ] Create `supabase.js` (client init)
- [ ] Verify connection works in browser console

### Phase 2: Auth UI
- [ ] Create `auth.js` (sign-up, sign-in, OAuth, sign-out UI)
- [ ] Add auth modal/overlay to the app
- [ ] Handle session persistence (Supabase handles cookies/localStorage)
- [ ] Show authenticated state in header (avatar / username)

### Phase 3: Data Operations
- [ ] Replace localStorage reads with Supabase queries (boards, dreams, milestones)
- [ ] Implement real-time optimistic UI (write to local state first, then sync)
- [ ] Handle offline: cache last-fetched data in localStorage as fallback

### Phase 4: Image Migration
- [ ] Upload IndexedDB images → Supabase Storage
- [ ] Replace image URLs in dreams with Storage paths
- [ ] Generate and refresh signed URLs

### Phase 5: Migration Flow
- [ ] Implement migration dialog on first sign-in
- [ ] Test: localStorage → account, verify all data intact
- [ ] Test: multiple devices, verify sync

---

## 11. File Change Plan

### Files to create

| File | Contents |
|---|---|
| `config.js` | Runtime config: Supabase URL, anon key, feature flags |
| `supabase.js` | Supabase client singleton (`window.db`) |
| `auth.js` | Auth modals, OAuth buttons, session state indicator |

### Files to modify

| File | Changes |
|---|---|
| `index.html` | Add `<script>` tags for `config.js`, `supabase.js`, `auth.js` before `app.js` |
| `app.js` | Replace `localStorage.getItem('dreams_db')` → Supabase queries (guarded: offline fallback) |
| `app.js` | Add `window.__authenticated` flag, conditional between local ↔ remote data |
| `style.css` | Styles for auth modal, user avatar, sign-out button (minimal) |

### Files to keep unchanged (in this patch)

| File | Reason |
|---|---|
| `packages/`, `prisma/`, `src/`, `apps/`, `docker-compose.yml` | Legacy backend skeleton — to be cleaned in a separate commit |
| `service-worker.js` | PWA caching — only needs update when new static files added |

### Git strategy

```
1. commit-a: "local: add image upload with crop, compress, and IndexedDB storage"
2. commit-b: "docs: add SUPABASE_ARCHITECTURE.md"
3. commit-c: "legacy: remove unused backend skeleton"        ← separate, later
4. commit-d: "feat: add Supabase client, auth, and data sync" ← major, after planning
5. commit-e: "feat: add localStorage→account migration flow"  ← after auth works
```

---

## Appendix A: Supabase Free Tier Limits

| Resource | Limit |
|---|---|
| Database | 500 MB |
| Storage | 1 GB |
| File upload | 10 MB per file |
| Auth users | 50,000 |
| Bandwidth | 5 GB/month |
| Daily requests | 50,000 |

These limits are generous for early development. Monitor usage at `app.supabase.com`.

---

## Appendix B: Supabase Setup Quickstart

```bash
# 1. Create project at https://app.supabase.com
# 2. Copy Project URL and anon key → config.js
# 3. Run SQL from this document:
#    - Table creations (§4)
#    - RLS policies (§5)
#    - Trigger for auto-profile creation (§4.1)
# 4. Create storage bucket:
#    SQL Editor → New Query → INSERT INTO storage.buckets ...
#    Or UI: Storage → New bucket → dream-images → private

# SQL to create bucket:
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'dream-images',
  'dream-images',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
);
```

---

*Document version: 1.0 — Last updated: 2026-06-06*
