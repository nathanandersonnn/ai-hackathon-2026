# Friends Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users find each other by a unique handle, send and accept friend requests, and view a friend's full workout history and custom presets (with one-click copy) — while every other table stays private.

**Architecture:** Authorization lives in Postgres Row Level Security, not in application code. Existing owner-only `FOR ALL` policies are never modified; friend access is added as separate permissive `FOR SELECT` policies that OR with them, so writes stay owner-only automatically. A `SECURITY DEFINER` helper (`are_friends`) breaks the RLS recursion that a direct subquery on `friendships` would cause.

**Tech Stack:** React 18, Vite 5, `@supabase/supabase-js` v2, Postgres (Supabase). Tests use Node's built-in `node:test` runner — no new dependencies.

**Spec:** `docs/superpowers/specs/2026-08-26-friends-feature-design.md`

## Global Constraints

- Handle format: `^[a-z0-9_]{3,20}$` — lowercase only, enforced by a DB CHECK constraint AND client-side before submit.
- `search_profiles` requires a prefix of **at least 3 characters** and returns **at most 10 rows**.
- Never modify an existing RLS policy. Friend access is added as new `FOR SELECT` policies only.
- Every `SECURITY DEFINER` function MUST include `SET search_path = public`. Without it the function is a privilege-escalation vector.
- `daily_logs`, `calorie_logs`, `user_goals`, `milestones` are NEVER made friend-visible.
- Supabase env vars are `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Never add a `VITE_`-prefixed secret — that prefix inlines the value into the browser bundle.
- Migrations are `.sql` files in `supabase/migrations/`. They are applied by pasting into the Supabase Dashboard SQL Editor. There is no Supabase CLI link in this repo.
- Follow the existing `src/lib/supabase/*.js` module shape: a `const TABLE = '...'`, exported async functions, `if (error) throw error`, return `data`.

## File Structure

**Created:**
- `supabase/migrations/001_workout_templates.sql` — the missing presets table
- `supabase/migrations/002_profiles.sql` — handles + search RPC
- `supabase/migrations/003_friendships.sql` — friendships, `are_friends`, friend policies
- `tests/helpers/accounts.js` — signs two fixed test accounts in, returns two Supabase clients
- `tests/rls.test.js` — the RLS assertions
- `src/lib/supabase/profiles.js` — handle read/write/search
- `src/lib/supabase/friendships.js` — request/accept/remove/list
- `src/components/Handle/HandleSetup.jsx` + `.css` — the first-login handle gate
- `src/components/Friends/Friends.jsx` + `.css` — search, inbox, friends list
- `src/components/Friends/FriendProfile.jsx` — a friend's workouts and presets

**Modified:**
- `package.json` — add a `test` script
- `src/App.jsx` — mount the handle gate and the Friends route
- `src/components/Sidebar.jsx:7-15` — add the Friends nav entry
- `src/components/Account/Account.jsx` — edit handle alongside the existing username
- `src/lib/supabase/workoutTemplates.js` — add `copyTemplateFrom`
- `supabase/schema.sql` — bring the stale file back in line with reality

---

### Task 1: Test harness

Nothing else in this plan can be verified without two authenticated clients. This task builds that and proves it works.

**Files:**
- Create: `tests/helpers/accounts.js`
- Create: `tests/rls.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `getTestClients()` → `Promise<{ alice, bob, aliceId, bobId }>` where `alice`/`bob` are authenticated `SupabaseClient` instances and the ids are uuid strings. Also `anonClient()` → an unauthenticated `SupabaseClient`.

- [ ] **Step 1: Add test credentials to `.env`**

Append to `.env` (no `VITE_` prefix — these are for the test runner, not the browser):

```
TEST_ALICE_EMAIL=rls-alice@myfitbud.test
TEST_ALICE_PASSWORD=rls-test-pw-alice-1
TEST_BOB_EMAIL=rls-bob@myfitbud.test
TEST_BOB_PASSWORD=rls-test-pw-bob-1
```

These are two throwaway accounts in your real Supabase project. They are created on first run and reused after, so the auth table does not grow with every run.

- [ ] **Step 2: Write the helper**

Create `tests/helpers/accounts.js`:

```js
import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY

function fresh() {
  return createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function anonClient() {
  return fresh()
}

// Sign in; if the account does not exist yet, create it. Email confirmation
// is OFF on this project, so signUp returns a usable session immediately.
async function signInOrUp(email, password) {
  const client = fresh()
  let { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) {
    ;({ data, error } = await client.auth.signUp({ email, password }))
    if (error) throw error
  }
  if (!data.session) throw new Error(`No session for ${email}`)
  return { client, userId: data.user.id }
}

export async function getTestClients() {
  const a = await signInOrUp(process.env.TEST_ALICE_EMAIL, process.env.TEST_ALICE_PASSWORD)
  const b = await signInOrUp(process.env.TEST_BOB_EMAIL, process.env.TEST_BOB_PASSWORD)
  return { alice: a.client, bob: b.client, aliceId: a.userId, bobId: b.userId }
}
```

- [ ] **Step 3: Write the failing test**

Create `tests/rls.test.js`:

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getTestClients, anonClient } from './helpers/accounts.js'

test('two distinct authenticated clients are available', async () => {
  const { aliceId, bobId } = await getTestClients()
  assert.ok(aliceId)
  assert.ok(bobId)
  assert.notEqual(aliceId, bobId)
})

test('an anonymous client cannot read workout_sessions', async () => {
  const { data, error } = await anonClient().from('workout_sessions').select('*')
  assert.equal(error, null)
  assert.deepEqual(data, [], 'anon must see zero rows, not an error')
})
```

The second test encodes something easy to get wrong: RLS does not error for an
unauthorized reader, it returns an empty set. A test asserting `error !== null`
would pass for the wrong reason.

- [ ] **Step 4: Add the test script**

In `package.json`, add to `"scripts"`:

```json
"test": "node --env-file=.env --test tests/"
```

- [ ] **Step 5: Run and verify**

Run: `npm test`
Expected: both tests PASS. If `signInOrUp` throws `Email signups are disabled`, enable email signups in Supabase Dashboard → Authentication → Providers → Email.

- [ ] **Step 6: Commit**

```bash
git add tests/ package.json
git commit -m "test: add RLS test harness with two authenticated clients"
```

Do NOT commit `.env` — it is gitignored at `.gitignore:2`.

---

### Task 2: Create the missing `workout_templates` table

`src/lib/supabase/workoutTemplates.js:9` targets this table and it does not exist. Presets fail silently today because `src/components/Workouts/Workouts.jsx:260` swallows the error into `console.error`.

**Files:**
- Create: `supabase/migrations/001_workout_templates.sql`
- Modify: `tests/rls.test.js`

**Interfaces:**
- Consumes: `getTestClients` from Task 1.
- Produces: table `workout_templates` with columns `id`, `user_id`, `label`, `icon`, `tag`, `color`, `description`, `exercises` (jsonb), `created_at`.

- [ ] **Step 1: Write the failing test**

Append to `tests/rls.test.js`:

```js
test('a user can insert and read back their own workout_template', async () => {
  const { alice, aliceId } = await getTestClients()
  const { data, error } = await alice.from('workout_templates')
    .insert({ user_id: aliceId, label: 'Push Day', exercises: [] })
    .select().single()
  assert.equal(error, null)
  assert.equal(data.label, 'Push Day')
  await alice.from('workout_templates').delete().eq('id', data.id)
})

test('bob cannot read alice\'s workout_templates', async () => {
  const { alice, bob, aliceId } = await getTestClients()
  const { data: made } = await alice.from('workout_templates')
    .insert({ user_id: aliceId, label: 'Private Day', exercises: [] })
    .select().single()
  const { data } = await bob.from('workout_templates').select('*').eq('id', made.id)
  assert.deepEqual(data, [], 'bob must not see alice rows')
  await alice.from('workout_templates').delete().eq('id', made.id)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — the insert errors with `relation "public.workout_templates" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/001_workout_templates.sql`:

```sql
create table if not exists workout_templates (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text not null,
  icon        text default '🏋️',
  tag         text,
  color       text default 'accent',
  description text,
  exercises   jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists workout_templates_user_idx
  on workout_templates (user_id, created_at desc);

alter table workout_templates enable row level security;

create policy "Users access own workout_templates"
  on workout_templates for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

- [ ] **Step 4: Apply it**

Supabase Dashboard → SQL Editor → New query → paste the file → Run.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Verify presets work in the real app**

Run `npm run dev`, go to Workouts, save a custom preset, reload the page, and confirm it is still listed. Open the browser console and confirm no `Failed to load presets` line appears.

This step is not optional. The unit test proves the table exists; only the app proves the feature the user asked to share actually works.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/001_workout_templates.sql tests/rls.test.js
git commit -m "fix: create missing workout_templates table"
```

---

### Task 3: `profiles` table, policy, and search RPC

**Files:**
- Create: `supabase/migrations/002_profiles.sql`
- Modify: `tests/rls.test.js`

**Interfaces:**
- Produces: table `profiles` (`id`, `handle`, `display_name`, `created_at`) and RPC `search_profiles(prefix text)` returning rows of (`id` uuid, `handle` text, `display_name` text).

- [ ] **Step 1: Write the failing test**

Append to `tests/rls.test.js`:

```js
test('a user can claim a handle and read their own profile', async () => {
  const { alice, aliceId } = await getTestClients()
  await alice.from('profiles').upsert({ id: aliceId, handle: 'alice_rls', display_name: 'Alice' })
  const { data, error } = await alice.from('profiles').select('*').eq('id', aliceId).single()
  assert.equal(error, null)
  assert.equal(data.handle, 'alice_rls')
})

test('handles must be lowercase and 3-20 chars', async () => {
  const { alice, aliceId } = await getTestClients()
  const { error } = await alice.from('profiles')
    .upsert({ id: aliceId, handle: 'BadHandle' })
  assert.notEqual(error, null, 'uppercase handle must be rejected by the CHECK constraint')
})

test('bob cannot read alice\'s profile row directly when not friends', async () => {
  const { alice, bob, aliceId } = await getTestClients()
  await alice.from('profiles').upsert({ id: aliceId, handle: 'alice_rls' })
  const { data } = await bob.from('profiles').select('*').eq('id', aliceId)
  assert.deepEqual(data, [], 'profiles must not be openly readable')
})

test('search_profiles finds a handle by prefix', async () => {
  const { alice, bob, aliceId } = await getTestClients()
  await alice.from('profiles').upsert({ id: aliceId, handle: 'alice_rls' })
  const { data, error } = await bob.rpc('search_profiles', { prefix: 'ali' })
  assert.equal(error, null)
  assert.ok(data.some(r => r.handle === 'alice_rls'))
})

test('search_profiles rejects prefixes shorter than 3 characters', async () => {
  const { bob } = await getTestClients()
  const { data } = await bob.rpc('search_profiles', { prefix: 'al' })
  assert.deepEqual(data, [], 'short prefixes must return nothing, to make enumeration expensive')
})

test('search_profiles never returns the caller', async () => {
  const { bob, bobId } = await getTestClients()
  await bob.from('profiles').upsert({ id: bobId, handle: 'bob_rls' })
  const { data } = await bob.rpc('search_profiles', { prefix: 'bob' })
  assert.ok(!data.some(r => r.id === bobId))
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `relation "public.profiles" does not exist`.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/002_profiles.sql`:

```sql
create table if not exists profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  handle       text not null unique,
  display_name text,
  created_at   timestamptz not null default now(),
  constraint handle_format check (handle ~ '^[a-z0-9_]{3,20}$')
);

alter table profiles enable row level security;

-- Own row: full control.
create policy "Users manage own profile"
  on profiles for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Discovery is deliberately NOT a policy. See search_profiles below.
-- Task 7 adds the policy that lets you read a profile you have a
-- friendship row with, in any state.

create or replace function search_profiles(prefix text)
returns table (id uuid, handle text, display_name text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.handle, p.display_name
  from profiles p
  where length(prefix) >= 3
    and p.handle like lower(prefix) || '%'
    and p.id <> auth.uid()
  order by p.handle
  limit 10;
$$;

revoke all on function search_profiles(text) from public;
grant execute on function search_profiles(text) to authenticated;
```

`security definer` is what lets this function see rows the caller's own policy
would hide. The `length(prefix) >= 3` and `limit 10` are inside the function
precisely because a policy cannot express them.

- [ ] **Step 4: Apply it**

Supabase Dashboard → SQL Editor → paste → Run.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/002_profiles.sql tests/rls.test.js
git commit -m "feat: add profiles table with handle search RPC"
```

---

### Task 4: Profiles client module

**Files:**
- Create: `src/lib/supabase/profiles.js`

**Interfaces:**
- Consumes: table and RPC from Task 3; `supabase`, `currentUserId` from `src/lib/supabase/client.js`.
- Produces:
  - `getMyProfile()` → `Promise<{id, handle, display_name, created_at} | null>` (null when no row yet)
  - `claimHandle(handle, displayName)` → `Promise<profile>`, throws `Error('That handle is taken.')` on conflict
  - `searchProfiles(prefix)` → `Promise<Array<{id, handle, display_name}>>`
  - `isHandleValid(handle)` → `boolean`

- [ ] **Step 1: Write the module**

Create `src/lib/supabase/profiles.js`:

```js
// ─────────────────────────────────────────────
//  Profiles — the public identity behind a handle
//  Table: profiles
// ─────────────────────────────────────────────

import { supabase, currentUserId } from './client'

const TABLE = 'profiles'

export const HANDLE_RE = /^[a-z0-9_]{3,20}$/

export function isHandleValid(handle) {
  return HANDLE_RE.test(handle ?? '')
}

export async function getMyProfile() {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function claimHandle(handle, displayName) {
  const userId = await currentUserId()
  const clean = (handle ?? '').trim().toLowerCase()
  if (!isHandleValid(clean)) {
    throw new Error('Handles are 3-20 characters: lowercase letters, numbers, underscores.')
  }

  const { data, error } = await supabase
    .from(TABLE)
    .upsert({ id: userId, handle: clean, display_name: displayName ?? null })
    .select()
    .single()

  // 23505 is the Postgres unique-violation code.
  if (error?.code === '23505') throw new Error('That handle is taken.')
  if (error) throw error
  return data
}

export async function searchProfiles(prefix) {
  const clean = (prefix ?? '').trim().toLowerCase()
  if (clean.length < 3) return []

  const { data, error } = await supabase.rpc('search_profiles', { prefix: clean })
  if (error) throw error
  return data ?? []
}
```

- [ ] **Step 2: Verify it loads**

Run: `npm run build`
Expected: build succeeds with no import errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/profiles.js
git commit -m "feat: add profiles client module"
```

---

### Task 5: Handle setup gate

After sign-in, a user without a profile row must pick a handle before using the app. This is what backfills existing accounts — no migration script needed.

**Files:**
- Create: `src/components/Handle/HandleSetup.jsx`
- Create: `src/components/Handle/HandleSetup.css`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `getMyProfile`, `claimHandle`, `isHandleValid` from Task 4.
- Produces: default export `HandleSetup({ user, onDone })`. Calls `onDone()` after the handle is successfully claimed.

- [ ] **Step 1: Read the existing auth gate**

Run: `grep -n "Auth\|session\|user" src/App.jsx | head -30`

You must place the handle gate AFTER the sign-in check and BEFORE the main app renders. Match the conditional-render pattern already used for `Auth`.

- [ ] **Step 2: Write the component**

Create `src/components/Handle/HandleSetup.jsx`:

```jsx
import { useState } from 'react'
import { claimHandle, isHandleValid } from '../../lib/supabase/profiles'
import './HandleSetup.css'

export default function HandleSetup({ user, onDone }) {
  // Seed from the free-text username the user may already have set in
  // Account. It is a display name, not a handle, so it only suggests.
  const seed = (user?.user_metadata?.username ?? user?.email?.split('@')[0] ?? '')
    .toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20)

  const [handle, setHandle]   = useState(seed)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState('')

  const valid = isHandleValid(handle)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await claimHandle(handle, user?.user_metadata?.username ?? null)
      onDone()
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="handle-view">
      <div className="handle-card">
        <h1 className="handle-title">Pick your handle</h1>
        <p className="handle-sub">This is how friends find you. You can change it later.</p>
        <form onSubmit={submit}>
          <label className="handle-field">
            <span>Handle</span>
            <div className="handle-input-wrap">
              <span className="handle-at">@</span>
              <input
                value={handle}
                onChange={e => setHandle(e.target.value.toLowerCase())}
                autoFocus
                maxLength={20}
              />
            </div>
          </label>
          <p className="handle-hint">3-20 characters: lowercase letters, numbers, underscores.</p>
          {error && <div className="handle-error">{error}</div>}
          <button type="submit" className="handle-submit" disabled={!valid || loading}>
            {loading ? '…' : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Write the stylesheet**

Create `src/components/Handle/HandleSetup.css` by copying the structure of
`src/components/Auth/Auth.css` and renaming `.auth-*` to `.handle-*`. Read that
file first; reuse its colors and spacing so the gate looks like it belongs to
the same app. Add one rule Auth.css does not have:

```css
.handle-input-wrap { display: flex; align-items: center; gap: 4px; }
.handle-at { opacity: 0.5; }
.handle-hint { font-size: 0.8rem; opacity: 0.6; margin: 4px 0 12px; }
```

- [ ] **Step 4: Wire it into `src/App.jsx`**

Add state for the profile, load it when a session exists, and render the gate
when the profile is missing:

```jsx
import { getMyProfile } from './lib/supabase/profiles'
import HandleSetup from './components/Handle/HandleSetup'

// inside the component, alongside the existing session state:
const [profile, setProfile] = useState(undefined) // undefined = still loading

useEffect(() => {
  if (!session) { setProfile(undefined); return }
  getMyProfile().then(setProfile).catch(() => setProfile(null))
}, [session])
```

Then, after the existing "not signed in → render `Auth`" branch:

```jsx
if (profile === undefined) return null            // still loading, render nothing
if (profile === null) {
  return <HandleSetup user={session.user} onDone={() => getMyProfile().then(setProfile)} />
}
```

The three-state `undefined | null | object` matters: without it the gate flashes
on screen for a moment on every page load before the profile finishes loading.

- [ ] **Step 5: Verify in the app**

Run `npm run dev`. You will be shown the handle gate, because your own account
has no profile row yet. Claim a handle. Reload — you should go straight to the
dashboard, not back to the gate.

- [ ] **Step 6: Commit**

```bash
git add src/components/Handle/ src/App.jsx
git commit -m "feat: gate the app on picking a handle"
```

---

### Task 6: Edit your handle from Account

**Files:**
- Modify: `src/components/Account/Account.jsx`

**Interfaces:**
- Consumes: `getMyProfile`, `claimHandle` from Task 4.

`Account.jsx:26` already saves `user_metadata.username`. Leave that alone —
`Chat.jsx:22` and `Sidebar.jsx:22` read it. Add the handle as a second field.

- [ ] **Step 1: Read the file**

Run: `cat src/components/Account/Account.jsx`

- [ ] **Step 2: Add handle state and load it**

```jsx
import { getMyProfile, claimHandle, isHandleValid } from '../../lib/supabase/profiles'

const [handle, setHandle] = useState('')

useEffect(() => {
  getMyProfile().then(p => setHandle(p?.handle ?? '')).catch(() => {})
}, [])
```

- [ ] **Step 3: Save the handle alongside the username**

Inside the existing save handler, after the `updateUser` call succeeds:

```jsx
if (handle && isHandleValid(handle)) {
  await claimHandle(handle, username.trim() || null)
}
```

- [ ] **Step 4: Add the input**

Mirror the existing username field's markup, with `value={handle}` and
`onChange={e => setHandle(e.target.value.toLowerCase())}`.

- [ ] **Step 5: Verify**

Run `npm run dev` → Account → change your handle → save → reload → confirm it persisted. Then try a handle you know is taken (the test account `alice_rls`) and confirm you see "That handle is taken." rather than a silent failure.

- [ ] **Step 6: Commit**

```bash
git add src/components/Account/Account.jsx
git commit -m "feat: edit handle from the account screen"
```

**Phase A ends here.** The app is publicly reachable, presets work, everyone has a handle, and handles are searchable. This is independently shippable.

---

### Task 7: `friendships`, `are_friends`, and the friend policies

This is the highest-risk task in the plan. A mistake here leaks other users' data silently. Write the tests first and do not skip Step 2.

**Files:**
- Create: `supabase/migrations/003_friendships.sql`
- Modify: `tests/rls.test.js`

**Interfaces:**
- Produces: table `friendships` (`user_a`, `user_b`, `requested_by`, `status`, `created_at`, `responded_at`), function `are_friends(a uuid, b uuid) → boolean`, and RPCs `request_friend(target uuid)`, `accept_friend(other uuid)`, `remove_friend(other uuid)`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/rls.test.js`:

```js
async function clearFriendship(client, otherId) {
  await client.rpc('remove_friend', { other: otherId })
}

test('a pending request does NOT expose workouts', async () => {
  const { alice, bob, aliceId, bobId } = await getTestClients()
  await clearFriendship(alice, bobId)
  await alice.from('profiles').upsert({ id: aliceId, handle: 'alice_rls' })
  const { data: session } = await alice.from('workout_sessions')
    .insert({ user_id: aliceId, date: '2026-01-01', label: 'Secret', exercises: [] })
    .select().single()

  await bob.rpc('request_friend', { target: aliceId })

  const { data } = await bob.from('workout_sessions').select('*').eq('id', session.id)
  assert.deepEqual(data, [], 'pending must not grant read access')

  await clearFriendship(alice, bobId)
  await alice.from('workout_sessions').delete().eq('id', session.id)
})

test('an accepted friendship exposes workouts and templates', async () => {
  const { alice, bob, aliceId, bobId } = await getTestClients()
  await clearFriendship(alice, bobId)
  const { data: session } = await alice.from('workout_sessions')
    .insert({ user_id: aliceId, date: '2026-01-02', label: 'Shared', exercises: [] })
    .select().single()
  const { data: tmpl } = await alice.from('workout_templates')
    .insert({ user_id: aliceId, label: 'Shared Preset', exercises: [] })
    .select().single()

  await bob.rpc('request_friend', { target: aliceId })
  await alice.rpc('accept_friend', { other: bobId })

  const { data: seenS } = await bob.from('workout_sessions').select('*').eq('id', session.id)
  assert.equal(seenS.length, 1, 'friend must see the session')
  const { data: seenT } = await bob.from('workout_templates').select('*').eq('id', tmpl.id)
  assert.equal(seenT.length, 1, 'friend must see the template')

  await clearFriendship(alice, bobId)
  await alice.from('workout_sessions').delete().eq('id', session.id)
  await alice.from('workout_templates').delete().eq('id', tmpl.id)
})

test('a friend can never write to your rows', async () => {
  const { alice, bob, aliceId, bobId } = await getTestClients()
  await clearFriendship(alice, bobId)
  const { data: session } = await alice.from('workout_sessions')
    .insert({ user_id: aliceId, date: '2026-01-03', label: 'ReadOnly', exercises: [] })
    .select().single()
  await bob.rpc('request_friend', { target: aliceId })
  await alice.rpc('accept_friend', { other: bobId })

  await bob.from('workout_sessions').update({ label: 'Hacked' }).eq('id', session.id)
  const { data: after } = await alice.from('workout_sessions').select('label').eq('id', session.id).single()
  assert.equal(after.label, 'ReadOnly', 'friend writes must not land')

  await bob.from('workout_sessions').delete().eq('id', session.id)
  const { data: still } = await alice.from('workout_sessions').select('id').eq('id', session.id)
  assert.equal(still.length, 1, 'friend deletes must not land')

  await clearFriendship(alice, bobId)
  await alice.from('workout_sessions').delete().eq('id', session.id)
})

test('friends can NEVER read private tables', async () => {
  const { alice, bob, aliceId, bobId } = await getTestClients()
  await clearFriendship(alice, bobId)
  await alice.from('daily_logs').upsert({ user_id: aliceId, date: '2026-01-04', weight: 180 })
  await bob.rpc('request_friend', { target: aliceId })
  await alice.rpc('accept_friend', { other: bobId })

  for (const table of ['daily_logs', 'calorie_logs', 'user_goals', 'milestones']) {
    const { data } = await bob.from(table).select('*').eq('user_id', aliceId)
    assert.deepEqual(data, [], `${table} must stay private even between friends`)
  }

  await clearFriendship(alice, bobId)
  await alice.from('daily_logs').delete().eq('user_id', aliceId).eq('date', '2026-01-04')
})

test('a friendship row exists only once regardless of direction', async () => {
  const { alice, bob, aliceId, bobId } = await getTestClients()
  await clearFriendship(alice, bobId)
  await bob.rpc('request_friend', { target: aliceId })
  await alice.rpc('request_friend', { target: bobId })
  const { data } = await bob.from('friendships').select('*')
  const pair = data.filter(r =>
    (r.user_a === aliceId && r.user_b === bobId) || (r.user_a === bobId && r.user_b === aliceId))
  assert.equal(pair.length, 1, 'canonical ordering must collapse both directions to one row')
  await clearFriendship(alice, bobId)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test`
Expected: FAIL — `could not find the function public.request_friend`.

Confirm the failures are for the missing function, not something else. A test
that fails for the wrong reason will pass for the wrong reason later.

- [ ] **Step 3: Write the migration**

Create `supabase/migrations/003_friendships.sql`:

```sql
create table if not exists friendships (
  user_a       uuid not null references auth.users(id) on delete cascade,
  user_b       uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (user_a, user_b),
  constraint ordered_pair check (user_a < user_b)
);

alter table friendships enable row level security;

create policy "Users see their own friendships"
  on friendships for select
  using (auth.uid() = user_a or auth.uid() = user_b);

-- All writes go through the RPCs below, which enforce canonical ordering.
-- No insert/update/delete policy is granted directly.

-- ── are_friends ────────────────────────────────────────
-- SECURITY DEFINER is mandatory: without it, a policy on workout_sessions
-- that calls this function would query friendships, invoking friendships'
-- own RLS, and recurse forever.
-- SET search_path is mandatory: a SECURITY DEFINER function without it is
-- a privilege-escalation vector.
create or replace function are_friends(a uuid, b uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
      and user_a = least(a, b)
      and user_b = greatest(a, b)
  );
$$;

create or replace function request_friend(target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target = auth.uid() then
    raise exception 'Cannot friend yourself';
  end if;
  insert into friendships (user_a, user_b, requested_by, status)
  values (least(auth.uid(), target), greatest(auth.uid(), target), auth.uid(), 'pending')
  on conflict (user_a, user_b) do nothing;
end;
$$;

create or replace function accept_friend(other uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update friendships
     set status = 'accepted', responded_at = now()
   where user_a = least(auth.uid(), other)
     and user_b = greatest(auth.uid(), other)
     and status = 'pending'
     -- Only the recipient may accept. Without this a requester could
     -- accept their own request and grant themselves access.
     and requested_by <> auth.uid();
end;
$$;

create or replace function remove_friend(other uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from friendships
   where user_a = least(auth.uid(), other)
     and user_b = greatest(auth.uid(), other)
     and (auth.uid() = user_a or auth.uid() = user_b);
end;
$$;

revoke all on function request_friend(uuid), accept_friend(uuid), remove_friend(uuid) from public;
grant execute on function request_friend(uuid), accept_friend(uuid), remove_friend(uuid) to authenticated;

-- ── Friend read access (added, never modifying existing policies) ──
create policy "Friends read workouts"
  on workout_sessions for select
  using (are_friends(auth.uid(), user_id));

create policy "Friends read templates"
  on workout_templates for select
  using (are_friends(auth.uid(), user_id));

-- Any friendship state, so a pending request inbox can show a handle
-- rather than a bare UUID.
create policy "Read profiles you have a friendship row with"
  on profiles for select
  using (exists (
    select 1 from friendships f
    where (f.user_a = least(auth.uid(), profiles.id) and f.user_b = greatest(auth.uid(), profiles.id))
  ));
```

- [ ] **Step 4: Apply it**

Supabase Dashboard → SQL Editor → paste → Run.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test`
Expected: all tests PASS, including the four from Tasks 1-3.

If `a friendship row exists only once` fails with a check-constraint violation
on `ordered_pair`, the `least`/`greatest` calls were dropped from an insert.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/003_friendships.sql tests/rls.test.js
git commit -m "feat: add friendships with RLS-enforced friend read access"
```

---

### Task 8: Friendships client module

**Files:**
- Create: `src/lib/supabase/friendships.js`

**Interfaces:**
- Consumes: RPCs from Task 7.
- Produces:
  - `listFriends()` → `Promise<Array<{id, handle, display_name}>>` (accepted only)
  - `listPendingRequests()` → `Promise<Array<{id, handle, display_name}>>` (incoming only)
  - `requestFriend(userId)` → `Promise<void>`
  - `acceptFriend(userId)` → `Promise<void>`
  - `removeFriend(userId)` → `Promise<void>`

- [ ] **Step 1: Write the module**

Create `src/lib/supabase/friendships.js`:

```js
// ─────────────────────────────────────────────
//  Friendships
//  Table: friendships — one row per pair, user_a < user_b.
//  All writes go through SECURITY DEFINER RPCs, which are what
//  enforce that canonical ordering.
// ─────────────────────────────────────────────

import { supabase, currentUserId } from './client'

const TABLE = 'friendships'

function otherId(row, me) {
  return row.user_a === me ? row.user_b : row.user_a
}

async function hydrate(rows, me) {
  const ids = rows.map(r => otherId(r, me))
  if (!ids.length) return []

  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle, display_name')
    .in('id', ids)

  if (error) throw error
  return data ?? []
}

export async function listFriends() {
  const me = await currentUserId()
  const { data, error } = await supabase.from(TABLE).select('*').eq('status', 'accepted')
  if (error) throw error
  return hydrate(data ?? [], me)
}

export async function listPendingRequests() {
  const me = await currentUserId()
  const { data, error } = await supabase.from(TABLE).select('*').eq('status', 'pending')
  if (error) throw error
  // Only requests sent TO me are actionable.
  const incoming = (data ?? []).filter(r => r.requested_by !== me)
  return hydrate(incoming, me)
}

export async function requestFriend(userId) {
  const { error } = await supabase.rpc('request_friend', { target: userId })
  if (error) throw error
}

export async function acceptFriend(userId) {
  const { error } = await supabase.rpc('accept_friend', { other: userId })
  if (error) throw error
}

export async function removeFriend(userId) {
  const { error } = await supabase.rpc('remove_friend', { other: userId })
  if (error) throw error
}
```

- [ ] **Step 2: Verify it builds**

Run: `npm run build`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase/friendships.js
git commit -m "feat: add friendships client module"
```

---

### Task 9: Read a friend's workouts and copy their presets

**Files:**
- Modify: `src/lib/supabase/workouts.js`
- Modify: `src/lib/supabase/workoutTemplates.js`

**Interfaces:**
- Produces:
  - `getWorkoutSessionsFor(userId, limit)` → `Promise<Array<session>>`
  - `getWorkoutTemplatesFor(userId)` → `Promise<Array<template>>`
  - `copyTemplateFrom(template)` → `Promise<template>` — inserts a clone under the caller's own `user_id`

- [ ] **Step 1: Add the friend read to `src/lib/supabase/workouts.js`**

```js
/**
 * Fetch a friend's workout history. Returns [] for a non-friend — RLS
 * filters the rows out rather than raising an error.
 */
export async function getWorkoutSessionsFor(userId, limit = 50) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data
}
```

Note there is no `currentUserId()` call and no ownership filter. That is
deliberate: the policy decides what comes back, not this function.

- [ ] **Step 2: Add the friend read and the copy to `src/lib/supabase/workoutTemplates.js`**

```js
export async function getWorkoutTemplatesFor(userId) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

/**
 * Clone a friend's preset into your own list. The copy is yours outright —
 * editing it never touches theirs.
 */
export async function copyTemplateFrom(template) {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id:     userId,
      label:       template.label,
      icon:        template.icon,
      tag:         template.tag,
      color:       template.color,
      description: template.description,
      exercises:   template.exercises,
    })
    .select()
    .single()

  if (error) throw error
  return data
}
```

`id` and `created_at` are deliberately not copied — the clone gets its own.

- [ ] **Step 3: Verify it builds**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/lib/supabase/workouts.js src/lib/supabase/workoutTemplates.js
git commit -m "feat: read friend workouts and copy friend presets"
```

---

### Task 10: Friends screen

**Files:**
- Create: `src/components/Friends/Friends.jsx`
- Create: `src/components/Friends/Friends.css`

**Interfaces:**
- Consumes: `searchProfiles` (Task 4); `listFriends`, `listPendingRequests`, `requestFriend`, `acceptFriend`, `removeFriend` (Task 8).
- Produces: default export `Friends({ onOpenFriend })` where `onOpenFriend(profile)` opens the profile view built in Task 11.

- [ ] **Step 1: Write the component**

Create `src/components/Friends/Friends.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { searchProfiles } from '../../lib/supabase/profiles'
import {
  listFriends, listPendingRequests,
  requestFriend, acceptFriend, removeFriend,
} from '../../lib/supabase/friendships'
import './Friends.css'

export default function Friends({ onOpenFriend }) {
  const [query, setQuery]     = useState('')
  const [results, setResults] = useState([])
  const [friends, setFriends] = useState([])
  const [pending, setPending] = useState([])
  const [error, setError]     = useState('')

  async function refresh() {
    try {
      setFriends(await listFriends())
      setPending(await listPendingRequests())
    } catch (err) {
      setError(err.message)
    }
  }

  useEffect(() => { refresh() }, [])

  // Debounced so typing a handle does not fire a request per keystroke.
  useEffect(() => {
    if (query.trim().length < 3) { setResults([]); return }
    const t = setTimeout(() => {
      searchProfiles(query).then(setResults).catch(err => setError(err.message))
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  async function act(fn, id) {
    try {
      await fn(id)
      await refresh()
      setResults(r => r.filter(p => p.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  const friendIds = new Set(friends.map(f => f.id))

  return (
    <div className="friends-view">
      <h1 className="friends-title">Friends</h1>
      {error && <div className="friends-error">{error}</div>}

      <input
        className="friends-search"
        placeholder="Search by handle…"
        value={query}
        onChange={e => setQuery(e.target.value)}
      />
      {query.trim().length > 0 && query.trim().length < 3 && (
        <p className="friends-hint">Type at least 3 characters.</p>
      )}

      {results.length > 0 && (
        <section className="friends-section">
          <h2>Results</h2>
          {results.map(p => (
            <div key={p.id} className="friend-row">
              <span className="friend-handle">@{p.handle}</span>
              {friendIds.has(p.id)
                ? <span className="friend-tag">Friends</span>
                : <button onClick={() => act(requestFriend, p.id)}>Add</button>}
            </div>
          ))}
        </section>
      )}

      {pending.length > 0 && (
        <section className="friends-section">
          <h2>Requests</h2>
          {pending.map(p => (
            <div key={p.id} className="friend-row">
              <span className="friend-handle">@{p.handle}</span>
              <button onClick={() => act(acceptFriend, p.id)}>Accept</button>
              <button className="friend-secondary" onClick={() => act(removeFriend, p.id)}>Decline</button>
            </div>
          ))}
        </section>
      )}

      <section className="friends-section">
        <h2>Your friends</h2>
        {friends.length === 0 && <p className="friends-empty">No friends yet. Search for a handle above.</p>}
        {friends.map(p => (
          <div key={p.id} className="friend-row">
            <button className="friend-handle friend-link" onClick={() => onOpenFriend(p)}>@{p.handle}</button>
            <button className="friend-secondary" onClick={() => act(removeFriend, p.id)}>Remove</button>
          </div>
        ))}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Write the stylesheet**

Create `src/components/Friends/Friends.css`. Read `src/components/Goals/Goals.css`
first and reuse its card, heading, and button treatments so this screen matches
the rest of the app. Required classes: `.friends-view`, `.friends-title`,
`.friends-error`, `.friends-search`, `.friends-hint`, `.friends-section`,
`.friends-empty`, `.friend-row`, `.friend-handle`, `.friend-link`,
`.friend-tag`, `.friend-secondary`.

- [ ] **Step 3: Commit**

```bash
git add src/components/Friends/
git commit -m "feat: add friends screen with search, requests and list"
```

---

### Task 11: Friend profile view

**Files:**
- Create: `src/components/Friends/FriendProfile.jsx`
- Modify: `src/components/Friends/Friends.css`

**Interfaces:**
- Consumes: `getWorkoutSessionsFor`, `getWorkoutTemplatesFor`, `copyTemplateFrom` (Task 9).
- Produces: default export `FriendProfile({ profile, onBack })`.

- [ ] **Step 1: Write the component**

Create `src/components/Friends/FriendProfile.jsx`:

```jsx
import { useEffect, useState } from 'react'
import { getWorkoutSessionsFor } from '../../lib/supabase/workouts'
import { getWorkoutTemplatesFor, copyTemplateFrom } from '../../lib/supabase/workoutTemplates'

export default function FriendProfile({ profile, onBack }) {
  const [sessions, setSessions]   = useState([])
  const [templates, setTemplates] = useState([])
  const [copied, setCopied]       = useState({})
  const [error, setError]         = useState('')

  useEffect(() => {
    getWorkoutSessionsFor(profile.id).then(setSessions).catch(e => setError(e.message))
    getWorkoutTemplatesFor(profile.id).then(setTemplates).catch(e => setError(e.message))
  }, [profile.id])

  async function copy(t) {
    try {
      await copyTemplateFrom(t)
      setCopied(c => ({ ...c, [t.id]: true }))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="friends-view">
      <button className="friend-secondary" onClick={onBack}>← Back</button>
      <h1 className="friends-title">@{profile.handle}</h1>
      {error && <div className="friends-error">{error}</div>}

      <section className="friends-section">
        <h2>Presets</h2>
        {templates.length === 0 && <p className="friends-empty">No custom presets.</p>}
        {templates.map(t => (
          <div key={t.id} className="friend-row">
            <span>{t.icon} {t.label}</span>
            <button onClick={() => copy(t)} disabled={copied[t.id]}>
              {copied[t.id] ? 'Copied' : 'Copy to mine'}
            </button>
          </div>
        ))}
      </section>

      <section className="friends-section">
        <h2>Workouts</h2>
        {sessions.length === 0 && <p className="friends-empty">No logged workouts.</p>}
        {sessions.map(s => (
          <details key={s.id} className="friend-session">
            <summary>{s.date} — {s.label}</summary>
            <ul>
              {(s.exercises ?? []).map((ex, i) => (
                <li key={i}>
                  {ex.name}
                  {(ex.sets ?? []).map((set, j) => (
                    <span key={j} className="friend-set"> {set.reps}×{set.weight}</span>
                  ))}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
    </div>
  )
}
```

The `exercises` shape is documented at `src/lib/supabase/workouts.js:4`:
`[{ name, sets: [{ reps, weight }] }]`.

- [ ] **Step 2: Add the two new classes to `Friends.css`**

```css
.friend-session { padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.08); }
.friend-set { opacity: 0.7; margin-left: 6px; }
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Friends/
git commit -m "feat: view a friend's workouts and copy their presets"
```

---

### Task 12: Navigation, schema cleanup, and end-to-end verification

**Files:**
- Modify: `src/components/Sidebar.jsx:7-15`
- Modify: `src/App.jsx`
- Modify: `supabase/schema.sql`

- [ ] **Step 1: Add the nav entry**

In `src/components/Sidebar.jsx`, add to `NAV_ITEMS` after the `goals` entry:

```jsx
{ id: 'friends', label: 'Friends', icon: FriendsIcon },
```

It is deliberately not `primary: true`. The comment at `Sidebar.jsx:4-6`
explains that mobile promotes only the five destinations used mid-session, and
Friends is not one of them, so it belongs behind More.

Define `FriendsIcon` alongside the existing icon components in the same file,
following their exact shape (an SVG-returning function component).

- [ ] **Step 2: Route it in `src/App.jsx`**

Add state for the open friend and render either the list or the profile:

```jsx
const [openFriend, setOpenFriend] = useState(null)
```

In the view switch, for `'friends'`:

```jsx
openFriend
  ? <FriendProfile profile={openFriend} onBack={() => setOpenFriend(null)} />
  : <Friends onOpenFriend={setOpenFriend} />
```

Reset `openFriend` to `null` whenever the active view changes away from
`friends`, or navigating away and back will land on a stale profile.

- [ ] **Step 3: Bring `supabase/schema.sql` back in line with reality**

The file is stale — it omits `calorie_logs`, `workout_templates`, `profiles`,
and `friendships`, which is what caused this whole feature to start from a
wrong picture of the database. Rebuild it so that never happens again:

```bash
{
  echo "-- Generated file. Source of truth is supabase/migrations/."
  echo "-- Regenerate: cat supabase/migrations/*.sql >> supabase/schema.sql"
  echo ""
  cat supabase/schema.sql | sed '1,8d'
  echo ""
  cat supabase/migrations/*.sql
} > supabase/schema.sql.new && mv supabase/schema.sql.new supabase/schema.sql
```

Then add the `calorie_logs` block by hand, since no migration file created it:

```sql
create table if not exists calorie_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  date        date not null,
  food_entries jsonb,
  macro_goals  jsonb,
  created_at  timestamptz not null default now()
);

alter table calorie_logs enable row level security;
create policy "Users manage own calorie logs"
  on calorie_logs for all using (auth.uid() = user_id);
```

Those columns and that policy are transcribed from the live database as
inspected on 2026-08-26, not invented.

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: every test passes. This is the gate — do not proceed past a failure.

- [ ] **Step 5: Verify end-to-end with two real accounts**

Run `npm run dev`. In a normal window sign in as yourself; in an incognito
window sign up as a second account. Then:

1. Both pick handles.
2. Search for your own handle from the second account — confirm it appears.
3. Send a request. Confirm it appears in the first account's Requests.
4. Before accepting, open the second account and confirm you cannot see any
   workouts.
5. Accept. Confirm the friend now appears in both friend lists.
6. Open the friend, confirm workouts and presets render.
7. Copy a preset, go to Workouts, confirm the copy is in your own list.
8. Remove the friend. Confirm their workouts are no longer reachable.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/components/Sidebar.jsx supabase/schema.sql
git commit -m "feat: add friends navigation and refresh schema.sql"
```

---

## Notes for the executor

**The three questions the user never answered.** The plan takes the spec's
defaults. If the user says otherwise mid-execution:
- Presets never worked → investigate what dropped the table before Task 2.
- Skip the RLS tests → Tasks 1, and the test steps of 2, 3, 7, become no-ops.
  Say plainly that friend access then ships unverified.
- Share more tables → add `FOR SELECT` policies mirroring Task 7, and update
  the `friends can NEVER read private tables` test, which will start failing
  by design.

**There is an unrelated uncommitted change** in
`src/components/Workouts/Workouts.jsx` (7 insertions, 2 deletions) that
predates this work. Do not commit it as part of any task. Ask the user.

**Migrations are applied by hand.** There is no Supabase CLI link. Every
migration step means pasting into the Dashboard SQL Editor. A task is not done
until the SQL has actually been run — the tests are what prove it.
