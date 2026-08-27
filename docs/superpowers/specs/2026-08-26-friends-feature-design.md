# Friends Feature — Design

Date: 2026-08-26
Status: Approved, pending implementation plan

## Problem

Two separate requests:

1. Reaching the deployed app required a GitHub sign-in before the app's own
   login screen appeared.
2. Users cannot find each other or see each other's training. The app is
   entirely single-player.

## Part 1 — GitHub sign-in (RESOLVED, no code)

The GitHub prompt was not application code. `src/components/Auth/Auth.jsx`
has always been email/password against Supabase; the codebase contains no
OAuth call. The prompt came from **Vercel Deployment Protection**
(`ssoProtection`) on project `ai-hackathon-2026`
(`prj_QbMdcBVyJ8VgkhwymKxWXgPbmyd0`), which gates the deployment URL behind a
Vercel account, and that account authenticates with GitHub.

`ssoProtection` was disabled on 2026-08-26. Verified in the API response:
`ssoProtection.enabled: false`.

Consequence: `ai-hackathon-2026-lac.vercel.app` is now publicly reachable and
anyone with the URL can create an account. This is a prerequisite for the
friends feature, not a side effect.

No further work in this part.

## Discovered state of the database

`supabase/schema.sql` is stale and is not ground truth. The live database was
inspected directly on 2026-08-26.

Tables that exist: `calorie_logs`, `daily_logs`, `milestones`, `user_goals`,
`workout_sessions`.

**`workout_templates` does not exist.** `src/lib/supabase/workoutTemplates.js`
targets it and `src/components/Workouts/Workouts.jsx:5` imports its helpers,
but `Workouts.jsx:260` swallows the resulting error:

```js
.catch(err => console.error('Failed to load presets:', err))
```

Custom presets therefore fail silently and render as an empty list. Creating
this table is a prerequisite of the friends feature, since sharing presets is
half the requirement.

Every existing policy has the same shape:

```
FOR ALL  USING (auth.uid() = user_id)  roles={public}
```

This matters: PostgreSQL combines permissive policies with OR *per command*.
Adding a `FOR SELECT` friend policy widens reads only. Writes remain
owner-only with no edit to any existing policy.

## Decisions

| Decision | Choice |
|---|---|
| Search identifier | Unique user-chosen handle |
| Friendship model | Request + accept, symmetric |
| Workout visibility | Full detail, entire history, read-only |
| Preset visibility | Visible, and copyable into own presets |
| Other tables | `daily_logs`, `calorie_logs`, `user_goals`, `milestones` stay private |
| Enforcement | RLS policies with a `SECURITY DEFINER` helper |

### Enforcement: why RLS over the alternatives

Rejected — `SECURITY DEFINER` RPCs for every read: trades declarative policies
for imperative checks. Each new friend-visible surface needs a new function,
and one missing check inside one function silently exposes everything.

Rejected — server-side `api/` routes with a service-role key: ships a key that
bypasses RLS entirely and reimplements authorization in JavaScript. Most code,
weakest guarantee.

Chosen — policies. Postgres enforces the rule; the frontend keeps calling
`supabase.from(...)` unchanged.

## Schema

### `workout_templates` (Phase A)

Columns match what `src/lib/supabase/workoutTemplates.js` already writes:
`id`, `user_id`, `label`, `icon`, `tag`, `color`, `description`,
`exercises` (jsonb), `created_at`. Owner-only `FOR ALL` policy identical to
the existing tables.

### `profiles` (Phase A)

- `id` uuid PK, FK to `auth.users(id)` ON DELETE CASCADE
- `handle` text, unique, CHECK `^[a-z0-9_]{3,20}$`
- `display_name` text
- `created_at` timestamptz

SELECT policy: own row, or a row belonging to a user with whom a `friendships`
row exists in **any** state — pending or accepted.
INSERT/UPDATE: own row only. No open read.

The pending state must be included. A request inbox has to display the handle
of whoever sent the request, and at that moment the friendship is not yet
accepted. Restricting the policy to accepted friends would render the inbox
as a list of opaque UUIDs.

Discovery goes through `search_profiles(prefix text)`, a `SECURITY DEFINER`
function requiring at least 3 characters and returning at most 10 rows of
(`id`, `handle`, `display_name`), excluding the caller's own row.

A policy cannot express a minimum query length or a result cap. An open SELECT
policy on `profiles` would let any signed-in user page the entire table through
the REST API. The RPC is what makes enumeration expensive.

### `friendships` (Phase B)

- `user_a` uuid, `user_b` uuid, both FK to `auth.users(id)` ON DELETE CASCADE
- `requested_by` uuid — records direction
- `status` text CHECK IN ('pending', 'accepted')
- `created_at`, `responded_at`
- PRIMARY KEY (`user_a`, `user_b`)
- CHECK (`user_a` < `user_b`)

The ordering constraint is what guarantees one row per pair. It removes
duplicate A-to-B / B-to-A rows and the race where two users request each other
at the same moment. Declining deletes the row.

Out of scope: blocking, and a `declined` status that would prevent re-requests.

### `are_friends(a uuid, b uuid)` (Phase B)

`SECURITY DEFINER`, `STABLE`, `SET search_path = public`. Returns whether an
accepted row exists for `least(a,b) / greatest(a,b)`.

Both properties are required, for different reasons:

- Without `SECURITY DEFINER`, the friend policy queries `friendships`, which
  invokes `friendships`' own RLS, which recurses infinitely.
- Without `SET search_path`, a `SECURITY DEFINER` function is a
  privilege-escalation vector.

### Friend policies (Phase B)

```sql
create policy "Friends read workouts" on workout_sessions
  for select using (are_friends(auth.uid(), user_id));
create policy "Friends read templates" on workout_templates
  for select using (are_friends(auth.uid(), user_id));
```

Added, never modifying existing policies. For an unauthenticated caller
`auth.uid()` is null and `are_friends` returns false.

## UI

- **Handle setup gate** — after sign-in, if no `profiles` row exists, block the
  app on a "pick your handle" screen. This covers pre-existing accounts; no
  backfill script is needed.
- **Friends view** — new `Sidebar.jsx` entry: search box, pending-request
  inbox, friends list.
- **Friend profile view** — their workout history, reusing the existing history
  rendering; their presets, each with "Copy to my presets", which inserts a
  clone under the viewer's own `user_id`.

## Testing

The repository has no test infrastructure — no test script in `package.json`,
no test files. RLS is not something to verify by looking at the UI; a policy
bug leaks other users' data silently and invisibly.

Phase B includes a Node script that signs two throwaway accounts in with the
anon key, through the real client, and asserts:

1. B cannot read A's `workout_sessions` or `workout_templates` while the
   request is pending.
2. B can read both once A accepts.
3. B can never INSERT, UPDATE, or DELETE A's rows.
4. B can never read A's `daily_logs`, `calorie_logs`, `user_goals`, or
   `milestones`, in any friendship state.
5. An unauthenticated client can read none of it.

This is part of Phase B, not optional.

## Sequencing

**Phase A** — create `workout_templates`; confirm presets save and load;
`profiles`; handle gate; `search_profiles`.

**Phase B** — `friendships`; `are_friends`; friend policies; friends UI;
preset copy; RLS test script.

Phase A is independently shippable and independently useful. Splitting them
keeps the change in reachability separate from the change in data visibility,
so a regression in either has an unambiguous cause.
