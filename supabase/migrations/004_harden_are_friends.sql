-- ── 004: close the are_friends() metadata oracle ────────────
--
-- are_friends(a, b) is SECURITY DEFINER (mandatory — see 003: without it the
-- workout_sessions policy recurses through friendships' own RLS) and keeps its
-- default PUBLIC EXECUTE grant (also deliberate — the policies invoke it on
-- every read INCLUDING anon reads, and revoking it would make anonymous
-- queries RAISE instead of returning zero rows).
--
-- Both of those decisions are still correct. What was missing is that the
-- function accepted two ARBITRARY uuids and never required the caller to be
-- one of them. Because PostgREST exposes every executable function as an RPC,
-- that made it a public oracle: an unauthenticated caller could ask whether
-- any two users are friends and get a straight answer. Verified against the
-- live database before writing this migration:
--
--   anon: are_friends(alice, bob) -> true
--
-- The friendship graph is not workout data, but it is not public either.
--
-- The fix is one predicate: the caller must be one of the pair. Every policy
-- in 003 calls this as are_friends(auth.uid(), user_id), so the first argument
-- is always the caller and no policy changes behaviour.
--
-- For the anon role auth.uid() is NULL, so `auth.uid() in (a, b)` evaluates to
-- NULL, the WHERE is never true, and EXISTS returns false. Anonymous reads
-- keep returning zero rows rather than raising — the property 003 wanted.

create or replace function are_friends(a uuid, b uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from friendships
    where status = 'accepted'
      and user_a = least(a, b)
      and user_b = greatest(a, b)
      -- The caller must be one of the pair. Without this the function is a
      -- public oracle for any third party's friendship status.
      and auth.uid() in (a, b)
  );
$$;

-- Hardening pass on the other definers: `set search_path = public` alone still
-- leaves pg_temp searched FIRST for relation names, which is the classic
-- temp-table shadowing vector for a SECURITY DEFINER function. Naming pg_temp
-- explicitly at the end pins it last.
alter function search_profiles(text)  set search_path = public, pg_temp;
alter function request_friend(uuid)   set search_path = public, pg_temp;
alter function accept_friend(uuid)    set search_path = public, pg_temp;
alter function remove_friend(uuid)    set search_path = public, pg_temp;
