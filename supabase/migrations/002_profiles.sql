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
