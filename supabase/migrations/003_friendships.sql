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
