-- Baseline schema for the live DB, hand-maintained alongside supabase/migrations/.
-- This file holds the original base tables (daily_logs, workout_sessions,
-- user_goals, milestones, calorie_logs) that predate the migrations
-- directory and are not defined in any migration. New schema changes go in
-- supabase/migrations/ as their own files; this file is not regenerated
-- from them and should be updated by hand if it drifts from the live DB.

create extension if not exists "pgcrypto";

-- ── daily_logs ──────────────────────────────────────────
create table if not exists daily_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  date        date not null,
  weight      numeric,
  steps       integer,
  created_at  timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists daily_logs_user_date_idx on daily_logs (user_id, date desc);

-- ── workout_sessions ────────────────────────────────────
create table if not exists workout_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  date        date not null,
  label       text not null,
  exercises   jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists workout_sessions_user_date_idx on workout_sessions (user_id, date desc);

-- ── user_goals ──────────────────────────────────────────
create table if not exists user_goals (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null,
  label       text not null,
  icon        text default '🎯',
  current     numeric default 0,
  target      numeric not null,
  unit        text default '',
  direction   text default 'up' check (direction in ('up', 'down')),
  color       text default 'accent',
  created_at  timestamptz not null default now()
);

create index if not exists user_goals_user_idx on user_goals (user_id);

-- ── milestones ──────────────────────────────────────────
create table if not exists milestones (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  label        text not null,
  earned       boolean not null default false,
  earned_date  date,
  created_at   timestamptz not null default now()
);

create index if not exists milestones_user_idx on milestones (user_id);

-- ─────────────────────────────────────────────
--  Row Level Security
--  RLS is enabled on every table. Each policy restricts
--  reads + writes so users only ever see their own rows.
-- ─────────────────────────────────────────────

alter table daily_logs enable row level security;
create policy "Users access own daily_logs"
  on daily_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table workout_sessions enable row level security;
create policy "Users access own workout_sessions"
  on workout_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table user_goals enable row level security;
create policy "Users access own user_goals"
  on user_goals for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table milestones enable row level security;
create policy "Users access own milestones"
  on milestones for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────
--  001 — workout_templates
--
--  This table was referenced by src/lib/supabase/workoutTemplates.js but had
--  never been created, so custom presets failed silently: the error was
--  swallowed by the .catch() at src/components/Workouts/Workouts.jsx:260 and
--  the UI just rendered an empty list.
--
--  Apply in: Supabase Dashboard → SQL Editor → New query → paste → Run
-- ─────────────────────────────────────────────

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
-- ─────────────────────────────────────────────
--  002 — profiles (handles) + search RPC
--
--  A handle is the searchable public identity. It is NOT the same thing as
--  the free-text `user_metadata.username` that Account.jsx already writes —
--  that one is non-unique and lives in auth.users, which other users cannot
--  read. The handle is unique, lives in a table, and is discoverable.
--
--  Apply AFTER 001. Supabase Dashboard → SQL Editor → New query → Run.
-- ─────────────────────────────────────────────

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

-- NOTE: there is deliberately no open SELECT policy here. An open policy
-- would let any signed-in user page the entire handle list through the REST
-- API. Discovery goes through search_profiles() below, which caps both the
-- minimum query length and the result count — neither of which a policy can
-- express. Migration 003 adds the one extra read path: profiles you have a
-- friendship row with.

-- ── search_profiles ────────────────────────────────────
--  security definer: lets this function see rows the caller's own policy
--  hides. That is the entire point — discovery must reach strangers.
--  set search_path: mandatory hardening. A security definer function
--  without it is a privilege-escalation vector.
create or replace function search_profiles(prefix text)
returns table (id uuid, handle text, display_name text)
language sql
security definer
stable
set search_path = public
as $$
  select p.id, p.handle, p.display_name
  from profiles p
  -- starts_with(), not LIKE. Underscore is a valid handle character AND a
  -- single-character wildcard in LIKE, so `like 'my_h%'` would also match
  -- "myXh…". starts_with has no wildcard semantics at all.
  where length(prefix) >= 3
    and starts_with(p.handle, lower(prefix))
    and p.id <> auth.uid()
  order by p.handle
  limit 10;
$$;

revoke all on function search_profiles(text) from public;
grant execute on function search_profiles(text) to authenticated;
-- ─────────────────────────────────────────────
--  003 — friendships, are_friends(), and friend read access
--
--  This is the migration that changes who can see whose data. Read the
--  comments before running it.
--
--  Apply AFTER 001 and 002. Supabase Dashboard → SQL Editor → New query → Run.
-- ─────────────────────────────────────────────

create table if not exists friendships (
  user_a       uuid not null references auth.users(id) on delete cascade,
  user_b       uuid not null references auth.users(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (user_a, user_b),
  -- Canonical ordering. This constraint is what guarantees ONE row per pair:
  -- it makes A→B and B→A the same row, so duplicate friendships and the
  -- two-people-request-each-other-simultaneously race are both impossible.
  constraint ordered_pair check (user_a < user_b)
);

alter table friendships enable row level security;

create policy "Users see their own friendships"
  on friendships for select
  using (auth.uid() = user_a or auth.uid() = user_b);

-- No insert/update/delete policy is granted. Every write goes through the
-- security definer RPCs below, which are what enforce the canonical ordering.

-- ── are_friends ────────────────────────────────────────
--  security definer is MANDATORY: without it, the workout_sessions policy
--  below would query friendships, which invokes friendships' own RLS, which
--  invokes this function again — infinite recursion.
--  set search_path is MANDATORY: security definer without it is a
--  privilege-escalation vector.
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

-- EXECUTE is deliberately left with its default PUBLIC grant. The policies
-- below call this function on EVERY read of workout_sessions, including reads
-- by the anon role. Revoking public EXECUTE would make anonymous queries
-- raise an error instead of returning zero rows, which is both a worse
-- failure mode and a behaviour change for existing callers.

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
     -- Only the RECIPIENT may accept. Without this line a requester could
     -- accept their own request and grant themselves read access.
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

-- ── Friend read access ─────────────────────────────────
--  These are ADDED policies. No existing policy is modified. Postgres ORs
--  permissive policies per command, so SELECT now passes when you are the
--  owner OR an accepted friend — while INSERT/UPDATE/DELETE remain
--  owner-only, because these policies are FOR SELECT and nothing else.
create policy "Friends read workouts"
  on workout_sessions for select
  using (are_friends(auth.uid(), user_id));

create policy "Friends read templates"
  on workout_templates for select
  using (are_friends(auth.uid(), user_id));

-- Any friendship state, not just accepted: a pending-request inbox has to
-- show the requester's handle, and at that moment you are not yet friends.
-- Restricting this to accepted would render the inbox as a list of UUIDs.
create policy "Read profiles you have a friendship row with"
  on profiles for select
  using (exists (
    select 1 from friendships f
    where f.user_a = least(auth.uid(), profiles.id)
      and f.user_b = greatest(auth.uid(), profiles.id)
  ));

-- NOTE: daily_logs, calorie_logs, user_goals and milestones are deliberately
-- absent from this migration. They stay owner-only, in every friendship state.

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
