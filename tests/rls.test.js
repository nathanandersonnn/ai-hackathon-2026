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
  const { alice, aliceId } = await getTestClients()
  const { data: seeded, error: seedErr } = await alice.from('workout_sessions')
    .insert({ user_id: aliceId, date: '2026-01-05', label: 'AnonProbe', exercises: [] })
    .select().single()
  assert.equal(seedErr, null, 'seed row must be created, or this test proves nothing')

  try {
    const { data, error } = await anonClient()
      .from('workout_sessions').select('*').eq('id', seeded.id)
    assert.equal(error, null, 'RLS filters rows; it does not raise for anon')
    assert.deepEqual(data, [], 'anon must not see a row that definitely exists')
  } finally {
    await alice.from('workout_sessions').delete().eq('id', seeded.id)
  }
})

// ─────────────────────────────────────────────
//  Task 2 — workout_templates
// ─────────────────────────────────────────────

test('a user can insert and read back their own workout_template', async () => {
  const { alice, aliceId } = await getTestClients()
  const { data, error } = await alice.from('workout_templates')
    .insert({ user_id: aliceId, label: 'Push Day', exercises: [] })
    .select().single()
  try {
    assert.equal(error, null)
    assert.equal(data.label, 'Push Day')
  } finally {
    if (data) await alice.from('workout_templates').delete().eq('id', data.id)
  }
})

test('bob cannot read alice\'s workout_templates', async () => {
  const { alice, bob, aliceId } = await getTestClients()
  const { data: made, error: seedErr } = await alice.from('workout_templates')
    .insert({ user_id: aliceId, label: 'Private Day', exercises: [] })
    .select().single()
  assert.equal(seedErr, null, 'seed row must be created, or this test proves nothing')
  try {
    const { data, error } = await bob.from('workout_templates').select('*').eq('id', made.id)
    assert.equal(error, null, 'RLS filters rows; a raised error here would be a different failure')
    assert.deepEqual(data, [], 'bob must not see alice rows')
  } finally {
    await alice.from('workout_templates').delete().eq('id', made.id)
  }
})

// ─────────────────────────────────────────────
//  Task 3 — profiles + search_profiles
// ─────────────────────────────────────────────

test('a user can claim a handle and read their own profile', async () => {
  const { alice, aliceId } = await getTestClients()
  try {
    await alice.from('profiles').upsert({ id: aliceId, handle: 'alice_rls', display_name: 'Alice' })
    const { data, error } = await alice.from('profiles').select('*').eq('id', aliceId).single()
    assert.equal(error, null)
    assert.equal(data.handle, 'alice_rls')
  } finally {
    await alice.from('profiles').delete().eq('id', aliceId)
  }
})

test('handles must be lowercase and 3-20 chars', async () => {
  const { alice, aliceId } = await getTestClients()
  const { error } = await alice.from('profiles')
    .upsert({ id: aliceId, handle: 'BadHandle' })
  assert.notEqual(error, null, 'uppercase handle must be rejected by the CHECK constraint')
  // The CHECK constraint rejects the whole statement, so no row was written;
  // nothing to clean up.
})

test('bob cannot read alice\'s profile row directly when not friends', async () => {
  const { alice, bob, aliceId, bobId } = await getTestClients()
  // 003 grants a profile read to anyone holding a friendship row in ANY
  // state, so a row left behind by an earlier failed run would make this
  // negative assertion pass for the wrong reason — or fail outright.
  await clearFriendship(alice, bobId)
  try {
    const { error: seedErr } = await alice.from('profiles').upsert({ id: aliceId, handle: 'alice_rls' })
    assert.equal(seedErr, null, 'seed must land, or the negative assertion below proves nothing')
    const { data, error } = await bob.from('profiles').select('*').eq('id', aliceId)
    assert.equal(error, null, 'RLS filters rows; it does not raise')
    assert.deepEqual(data, [], 'profiles must not be openly readable')
  } finally {
    await alice.from('profiles').delete().eq('id', aliceId)
  }
})

test('search_profiles finds a handle by prefix', async () => {
  const { alice, bob, aliceId } = await getTestClients()
  try {
    await alice.from('profiles').upsert({ id: aliceId, handle: 'alice_rls' })
    const { data, error } = await bob.rpc('search_profiles', { prefix: 'ali' })
    assert.equal(error, null)
    assert.ok(data.some(r => r.handle === 'alice_rls'))
  } finally {
    await alice.from('profiles').delete().eq('id', aliceId)
  }
})

test('search_profiles rejects prefixes shorter than 3 characters', async () => {
  const { bob } = await getTestClients()
  const { data, error } = await bob.rpc('search_profiles', { prefix: 'al' })
  assert.equal(error, null, 'the RPC must return an empty set, not raise')
  assert.deepEqual(data, [], 'short prefixes must return nothing, to make enumeration expensive')
})

test('search_profiles never returns the caller', async () => {
  const { bob, bobId } = await getTestClients()
  try {
    const { error: seedErr } = await bob.from('profiles').upsert({ id: bobId, handle: 'bob_rls' })
    assert.equal(seedErr, null, 'seed must land, or the negative assertion below proves nothing')
    const { data, error } = await bob.rpc('search_profiles', { prefix: 'bob' })
    assert.equal(error, null)
    assert.ok(!data.some(r => r.id === bobId),
      'the caller must be filtered out of their own search results')
  } finally {
    await bob.from('profiles').delete().eq('id', bobId)
  }
})

// The applied migration deliberately uses starts_with(p.handle, lower(prefix))
// rather than the `like lower(prefix) || '%'` shown in the task-3 brief,
// because '_' is both a valid handle character (handle_format check allows
// [a-z0-9_]) and a single-character LIKE wildcard. Under LIKE, a prefix
// containing a literal underscore would also match handles that have some
// other character in that position. starts_with() has no wildcard semantics,
// so it must not do that.
test('search_profiles treats underscore in the prefix literally, not as a wildcard', async () => {
  const { alice, bob, aliceId } = await getTestClients()
  try {
    // Under `like 'my_h%'`, this handle WOULD wrongly match a search for
    // 'my_h' because '_' matches any single character in LIKE.
    const { error: seedErr } = await alice.from('profiles').upsert({ id: aliceId, handle: 'myqhandle' })
    assert.equal(seedErr, null, 'seed must land, or the negative assertion below proves nothing')
    const { data, error } = await bob.rpc('search_profiles', { prefix: 'my_h' })
    assert.equal(error, null)
    assert.ok(!data.some(r => r.handle === 'myqhandle'),
      'a literal "_" in the prefix must not wildcard-match other characters')
  } finally {
    await alice.from('profiles').delete().eq('id', aliceId)
  }
})

// ─────────────────────────────────────────────
//  Task 7 — friendships, are_friends(), and friend read access
//
//  Every seeding insert/upsert and every request_friend/accept_friend RPC
//  call below has its result asserted BEFORE any downstream assertion is
//  trusted. RLS answers an unauthorized reader with an EMPTY SET, never an
//  error, so a negative assertion that follows a silently-failed setup
//  proves nothing at all — it would pass just as happily against a database
//  with no policies and no rows.
//
//  All three friendship RPCs are `returns void`, and all three do their work
//  in a WHERE clause that simply matches zero rows when a guard rejects the
//  call. A null error from them is therefore NOT evidence of a state change.
//  becomeFriends()/requestFriendship() below read the friendship row back and
//  assert its actual status and direction, and every test needing a
//  particular friendship state goes through them.
//
//  Every test clears any alice<->bob friendship both at the start (in case a
//  prior failed run left one behind) and in a finally block (so a failing
//  assertion cannot leak state into later tests), and cleans up every row it
//  creates the same way.
// ─────────────────────────────────────────────

async function clearFriendship(client, otherId) {
  await client.rpc('remove_friend', { other: otherId })
}

// Returns the single friendship row for a pair as `client` sees it, or null.
// friendships stores one canonically-ordered row per pair (user_a < user_b),
// so which uuid lands in which column depends on how the two sort — match on
// both orderings rather than assuming.
async function friendshipRow(client, idA, idB) {
  const { data, error } = await client.from('friendships').select('*')
  assert.equal(error, null, 'a participant must be able to read their own friendship rows')
  const rows = data.filter(r =>
    (r.user_a === idA && r.user_b === idB) || (r.user_a === idB && r.user_b === idA))
  assert.ok(rows.length <= 1,
    'the ordered_pair constraint must collapse both directions to a single row')
  return rows[0] ?? null
}

// request_friend uses `on conflict (user_a, user_b) do nothing`, so a null
// error proves neither that a row now exists, nor that it is pending, nor
// that the caller is the requester. Read it back and assert all three.
async function requestFriendship(requester, requesterId, targetId) {
  const { error } = await requester.rpc('request_friend', { target: targetId })
  assert.equal(error, null, 'request_friend must not error')

  const row = await friendshipRow(requester, requesterId, targetId)
  assert.notEqual(row, null,
    'request_friend does `on conflict do nothing`; the pending row must actually exist')
  assert.equal(row.status, 'pending', 'a fresh request must be pending')
  assert.equal(row.requested_by, requesterId,
    'requested_by must be the caller — the accept guard is built entirely on this column')
  return row
}

// accept_friend is a void SECURITY DEFINER function whose UPDATE matches zero
// rows when the `requested_by <> auth.uid()` guard rejects the call. So
// `assert.equal(acceptErr, null)` is satisfied by a call that changed nothing,
// and any test resting on it would quietly degrade into a stranger-test.
// Positively prove the row is readable and accepted before returning.
async function becomeFriends(requester, accepter, requesterId, accepterId) {
  await requestFriendship(requester, requesterId, accepterId)

  const { error: acceptErr } = await accepter.rpc('accept_friend', { other: requesterId })
  assert.equal(acceptErr, null, 'accept_friend must not error')

  const row = await friendshipRow(requester, requesterId, accepterId)
  assert.notEqual(row, null, 'the friendship row must still exist after accept_friend')
  assert.equal(row.status, 'accepted',
    'accept_friend returns void and silently matches zero rows when its guard rejects — '
    + 'the friendship must ACTUALLY be accepted, or every assertion below is vacuous')
  return row
}

test('a pending request does NOT expose workouts', async () => {
  const { alice, bob, aliceId, bobId } = await getTestClients()
  await clearFriendship(alice, bobId)
  let session
  try {
    const { data, error: seedErr } = await alice.from('workout_sessions')
      .insert({ user_id: aliceId, date: '2026-01-01', label: 'Secret', exercises: [] })
      .select().single()
    assert.equal(seedErr, null, 'seed row must be created, or this test proves nothing')
    session = data

    await requestFriendship(bob, bobId, aliceId)

    const { data: seen, error: seenErr } = await bob.from('workout_sessions')
      .select('*').eq('id', session.id)
    assert.equal(seenErr, null, 'RLS filters rows; it does not raise')
    assert.deepEqual(seen, [], 'pending must not grant read access')
  } finally {
    await clearFriendship(alice, bobId)
    if (session) await alice.from('workout_sessions').delete().eq('id', session.id)
  }
})

test('an accepted friendship exposes workouts and templates', async () => {
  const { alice, bob, aliceId, bobId } = await getTestClients()
  await clearFriendship(alice, bobId)
  let session, tmpl
  try {
    const { data: sessionData, error: sessionErr } = await alice.from('workout_sessions')
      .insert({ user_id: aliceId, date: '2026-01-02', label: 'Shared', exercises: [] })
      .select().single()
    assert.equal(sessionErr, null, 'session seed must land, or this test proves nothing')
    session = sessionData

    const { data: tmplData, error: tmplErr } = await alice.from('workout_templates')
      .insert({ user_id: aliceId, label: 'Shared Preset', exercises: [] })
      .select().single()
    assert.equal(tmplErr, null, 'template seed must land, or this test proves nothing')
    tmpl = tmplData

    await becomeFriends(bob, alice, bobId, aliceId)

    const { data: seenS, error: seenSErr } = await bob.from('workout_sessions')
      .select('*').eq('id', session.id)
    assert.equal(seenSErr, null)
    assert.equal(seenS.length, 1, 'friend must see the session')
    const { data: seenT, error: seenTErr } = await bob.from('workout_templates')
      .select('*').eq('id', tmpl.id)
    assert.equal(seenTErr, null)
    assert.equal(seenT.length, 1, 'friend must see the template')
  } finally {
    await clearFriendship(alice, bobId)
    if (session) await alice.from('workout_sessions').delete().eq('id', session.id)
    if (tmpl) await alice.from('workout_templates').delete().eq('id', tmpl.id)
  }
})

test('a friend can never write to your rows', async () => {
  const { alice, bob, aliceId, bobId } = await getTestClients()
  await clearFriendship(alice, bobId)
  let session
  try {
    const { data, error: seedErr } = await alice.from('workout_sessions')
      .insert({ user_id: aliceId, date: '2026-01-03', label: 'ReadOnly', exercises: [] })
      .select().single()
    assert.equal(seedErr, null, 'seed row must be created, or this test proves nothing')
    session = data

    await becomeFriends(bob, alice, bobId, aliceId)

    // Bob really is an accepted friend at this point — becomeFriends proved
    // it — so a failed write below is the FOR SELECT-only policy at work,
    // not a stranger being turned away.
    const { data: canRead, error: canReadErr } = await bob.from('workout_sessions')
      .select('id').eq('id', session.id)
    assert.equal(canReadErr, null)
    assert.equal(canRead.length, 1, 'the friend read path must be live for the write denial to mean anything')

    await bob.from('workout_sessions').update({ label: 'Hacked' }).eq('id', session.id)
    const { data: after, error: afterErr } = await alice.from('workout_sessions')
      .select('label').eq('id', session.id).single()
    assert.equal(afterErr, null, 'alice must still be able to read her own row after the attempted write')
    assert.equal(after.label, 'ReadOnly', 'friend writes must not land')

    await bob.from('workout_sessions').delete().eq('id', session.id)
    const { data: still, error: stillErr } = await alice.from('workout_sessions')
      .select('id').eq('id', session.id)
    assert.equal(stillErr, null)
    assert.equal(still.length, 1, 'friend deletes must not land')
  } finally {
    await clearFriendship(alice, bobId)
    if (session) await alice.from('workout_sessions').delete().eq('id', session.id)
  }
})

test('friends can NEVER read private tables', async () => {
  const { alice, bob, aliceId, bobId } = await getTestClients()
  await clearFriendship(alice, bobId)

  // Every table the loop asserts over must hold a real alice row, or the
  // empty result below would only prove alice owns nothing there — and the
  // test would keep passing if a friend-read policy were added to that table,
  // which is the exact thing it exists to prevent.
  //
  // daily_logs and calorie_logs are both unique on (user_id, date), so a row
  // left behind by an earlier failed run would make the seed fail with a
  // unique violation and wedge this test permanently. user_goals and
  // milestones have no such constraint, but are cleared by label for the same
  // reason: so a leak cannot accumulate.
  const PROBE_DATE = '2026-01-04'
  const PROBE_LABEL = 'RlsPrivateProbe'
  const seeds = [
    {
      table: 'daily_logs',
      row: { user_id: aliceId, date: PROBE_DATE, weight: 180 },
      clear: () => alice.from('daily_logs').delete().eq('user_id', aliceId).eq('date', PROBE_DATE),
    },
    {
      table: 'calorie_logs',
      row: { user_id: aliceId, date: PROBE_DATE, food_entries: { log: [], water: 0 } },
      clear: () => alice.from('calorie_logs').delete().eq('user_id', aliceId).eq('date', PROBE_DATE),
    },
    {
      table: 'user_goals',
      row: { user_id: aliceId, label: PROBE_LABEL, target: 100 },
      clear: () => alice.from('user_goals').delete().eq('user_id', aliceId).eq('label', PROBE_LABEL),
    },
    {
      table: 'milestones',
      row: { user_id: aliceId, label: PROBE_LABEL },
      clear: () => alice.from('milestones').delete().eq('user_id', aliceId).eq('label', PROBE_LABEL),
    },
  ]

  try {
    for (const seed of seeds) {
      await seed.clear()
      const { data, error } = await alice.from(seed.table).insert(seed.row).select().single()
      assert.equal(error, null, `${seed.table} seed must land, or its assertion below proves nothing`)
      assert.ok(data?.id, `${seed.table} seed must be readable back by its owner`)
    }

    await becomeFriends(bob, alice, bobId, aliceId)

    for (const seed of seeds) {
      // Re-confirm the row is there RIGHT NOW, from the owner's side, so the
      // empty read that follows can only be the policy talking.
      const { data: mine, error: mineErr } = await alice.from(seed.table)
        .select('id').eq('user_id', aliceId)
      assert.equal(mineErr, null)
      assert.ok(mine.length >= 1, `alice must own a ${seed.table} row for the negative below to mean anything`)

      const { data, error } = await bob.from(seed.table).select('*').eq('user_id', aliceId)
      assert.equal(error, null, `${seed.table} must filter rows, not raise`)
      assert.deepEqual(data, [], `${seed.table} must stay private even between friends`)
    }
  } finally {
    await clearFriendship(alice, bobId)
    for (const seed of seeds) await seed.clear()
  }
})

test('a friendship row exists only once regardless of direction', async () => {
  const { alice, bob, aliceId, bobId } = await getTestClients()
  await clearFriendship(alice, bobId)
  try {
    await requestFriendship(bob, bobId, aliceId)

    const { error: aliceReqErr } = await alice.rpc('request_friend', { target: bobId })
    assert.equal(aliceReqErr, null, 'the reverse-direction request must not error (on conflict do nothing)')

    // friendshipRow asserts at most one row matches the pair in either column
    // ordering; assert it is present, and that the reverse request did not
    // flip ownership of the original.
    const row = await friendshipRow(bob, bobId, aliceId)
    assert.notEqual(row, null, 'canonical ordering must collapse both directions to one row')
    assert.equal(row.requested_by, bobId,
      'the second, reverse-direction request must not overwrite the original requester')
    assert.equal(row.status, 'pending',
      'requesting back must not be treated as accepting — that would bypass accept_friend entirely')
  } finally {
    await clearFriendship(alice, bobId)
  }
})

// The applied accept_friend includes `and requested_by <> auth.uid()` — only
// the recipient of a request may accept it. Without this guard, a requester
// could call accept_friend on their own outstanding request and grant
// themselves read access without the target ever consenting. This is a
// privilege-escalation guard, so it gets its own test.
test('a requester cannot accept their own friend request', async () => {
  const { alice, bob, aliceId, bobId } = await getTestClients()
  await clearFriendship(alice, bobId)
  let session
  try {
    const { data, error: seedErr } = await alice.from('workout_sessions')
      .insert({ user_id: aliceId, date: '2026-01-05', label: 'SelfAcceptProbe', exercises: [] })
      .select().single()
    assert.equal(seedErr, null, 'seed row must be created, or this test proves nothing')
    session = data

    // The DIRECTION of the request is the entire point of this test, and
    // request_friend's `on conflict do nothing` means a null error would not
    // establish it. requestFriendship asserts requested_by === bobId.
    await requestFriendship(bob, bobId, aliceId)

    // Bob (the requester) tries to accept his own request. The RPC's own
    // error is not the assertion that matters: accept_friend returns void and
    // its WHERE clause simply matches zero rows when the guard rejects, so it
    // reports success either way. What matters is the state afterwards.
    await bob.rpc('accept_friend', { other: aliceId })

    const row = await friendshipRow(bob, bobId, aliceId)
    assert.notEqual(row, null, 'the request must still be on file')
    assert.equal(row.status, 'pending', 'the friendship must still be pending, not accepted')
    assert.equal(row.responded_at, null, 'nothing may have responded to the request')

    const { data: seen, error: seenErr } = await bob.from('workout_sessions')
      .select('*').eq('id', session.id)
    assert.equal(seenErr, null)
    assert.deepEqual(seen, [], 'a self-accepted request must not grant read access')
  } finally {
    await clearFriendship(alice, bobId)
    if (session) await alice.from('workout_sessions').delete().eq('id', session.id)
  }
})

// 003 deliberately grants friendships SELECT only — no insert/update/delete
// policy exists, because the SECURITY DEFINER RPCs are the sole write path
// and they are where the `requested_by <> auth.uid()` guard lives. A direct
// PostgREST write would route straight around that guard: a requester who can
// `update friendships set status='accepted'` has no need for accept_friend at
// all. So the absence of those policies is a load-bearing security property.
test('friendships cannot be written directly through PostgREST', async () => {
  const { alice, bob, aliceId, bobId } = await getTestClients()
  await clearFriendship(alice, bobId)
  let session
  try {
    const { data, error: seedErr } = await alice.from('workout_sessions')
      .insert({ user_id: aliceId, date: '2026-01-06', label: 'DirectWriteProbe', exercises: [] })
      .select().single()
    assert.equal(seedErr, null, 'seed row must be created, or this test proves nothing')
    session = data

    const pending = await requestFriendship(bob, bobId, aliceId)

    // 1. Bob tries to flip his own pending request to accepted. With no
    //    UPDATE policy the row is simply invisible to the update, so this
    //    reports no error and changes nothing — read the row back rather
    //    than trusting the (absent) error.
    const { error: updErr } = await bob.from('friendships')
      .update({ status: 'accepted' })
      .eq('user_a', pending.user_a).eq('user_b', pending.user_b)
    assert.equal(updErr, null, 'no UPDATE policy means zero rows match, which is not an error')

    const afterUpdate = await friendshipRow(bob, bobId, aliceId)
    assert.notEqual(afterUpdate, null, 'the row must still exist')
    assert.equal(afterUpdate.status, 'pending',
      'a direct UPDATE must not be able to accept a friendship the RPC guard would refuse')

    // 2. Bob tries to insert a fresh accepted row for the pair.
    const { error: insErr } = await bob.from('friendships').insert({
      user_a: pending.user_a,
      user_b: pending.user_b,
      requested_by: bobId,
      status: 'accepted',
    })
    assert.notEqual(insErr, null, 'friendships must have no INSERT policy at all')
    assert.equal(insErr.code, '42501',
      'the insert must be refused by row-level security, not by some incidental constraint')

    const afterInsert = await friendshipRow(bob, bobId, aliceId)
    assert.notEqual(afterInsert, null, 'the row must still exist')
    assert.equal(afterInsert.status, 'pending', 'the pending row must be untouched')

    // 3. And prove the escalation did not land where it would actually hurt.
    const { data: seen, error: seenErr } = await bob.from('workout_sessions')
      .select('*').eq('id', session.id)
    assert.equal(seenErr, null)
    assert.deepEqual(seen, [], 'a direct write to friendships must not grant read access')
  } finally {
    await clearFriendship(alice, bobId)
    if (session) await alice.from('workout_sessions').delete().eq('id', session.id)
  }
})

// Unfriending has to actually revoke access, not merely hide the friend from
// the UI. are_friends() is evaluated on every read, so deleting the row is
// what does it — but nothing proved that until now: remove_friend was only
// ever used as teardown plumbing, with its error discarded.
test('remove_friend revokes read access to workouts', async () => {
  const { alice, bob, aliceId, bobId } = await getTestClients()
  await clearFriendship(alice, bobId)
  let session
  try {
    const { data, error: seedErr } = await alice.from('workout_sessions')
      .insert({ user_id: aliceId, date: '2026-01-07', label: 'RevokeProbe', exercises: [] })
      .select().single()
    assert.equal(seedErr, null, 'seed row must be created, or this test proves nothing')
    session = data

    await becomeFriends(bob, alice, bobId, aliceId)

    const { data: before, error: beforeErr } = await bob.from('workout_sessions')
      .select('*').eq('id', session.id)
    assert.equal(beforeErr, null)
    assert.equal(before.length, 1,
      'bob must be able to read the row FIRST, or losing it afterwards proves nothing')

    const { error: removeErr } = await alice.rpc('remove_friend', { other: bobId })
    assert.equal(removeErr, null, 'remove_friend must not error')

    const gone = await friendshipRow(bob, bobId, aliceId)
    assert.equal(gone, null, 'remove_friend must actually delete the row, not just mark it')

    const { data: after, error: afterErr } = await bob.from('workout_sessions')
      .select('*').eq('id', session.id)
    assert.equal(afterErr, null)
    assert.deepEqual(after, [], 'unfriending must revoke read access, not just hide the friend')
  } finally {
    await clearFriendship(alice, bobId)
    if (session) await alice.from('workout_sessions').delete().eq('id', session.id)
  }
})

// 003's "Read profiles you have a friendship row with" policy is satisfied by
// a friendship row in ANY state, pending included. That is deliberate: the
// incoming-request inbox has to show the requester's handle, and at that
// moment the two are not yet friends. Restricting it to accepted would render
// the inbox as a list of raw UUIDs.
//
// (The no-friendship case is already covered by "bob cannot read alice's
// profile row directly when not friends" above.)
test('a pending request exposes the profile row, so the inbox can render handles', async () => {
  const { alice, bob, aliceId, bobId } = await getTestClients()
  await clearFriendship(alice, bobId)
  try {
    const { error: seedErr } = await alice.from('profiles')
      .upsert({ id: aliceId, handle: 'alice_rls', display_name: 'Alice' })
    assert.equal(seedErr, null, 'profile seed must land, or this test proves nothing')

    await requestFriendship(bob, bobId, aliceId)

    const { data, error } = await bob.from('profiles').select('*').eq('id', aliceId)
    assert.equal(error, null)
    assert.equal(data.length, 1, 'a pending friendship row must expose the counterparty profile')
    assert.equal(data[0].handle, 'alice_rls', 'the handle must be readable, not just the id')
  } finally {
    await clearFriendship(alice, bobId)
    await alice.from('profiles').delete().eq('id', aliceId)
  }
})

test('an accepted friendship exposes the profile row, and remove_friend takes it away', async () => {
  const { alice, bob, aliceId, bobId } = await getTestClients()
  await clearFriendship(alice, bobId)
  try {
    const { error: seedErr } = await alice.from('profiles')
      .upsert({ id: aliceId, handle: 'alice_rls', display_name: 'Alice' })
    assert.equal(seedErr, null, 'profile seed must land, or this test proves nothing')

    await becomeFriends(bob, alice, bobId, aliceId)

    const { data: seen, error: seenErr } = await bob.from('profiles').select('*').eq('id', aliceId)
    assert.equal(seenErr, null)
    assert.equal(seen.length, 1, 'an accepted friendship must expose the counterparty profile')
    assert.equal(seen[0].handle, 'alice_rls')

    const { error: removeErr } = await alice.rpc('remove_friend', { other: bobId })
    assert.equal(removeErr, null, 'remove_friend must not error')
    assert.equal(await friendshipRow(bob, bobId, aliceId), null,
      'remove_friend must actually delete the row')

    // The profile row still exists — alice can read it — so an empty result
    // for bob is the policy, not a missing row.
    const { data: mine, error: mineErr } = await alice.from('profiles')
      .select('*').eq('id', aliceId)
    assert.equal(mineErr, null)
    assert.equal(mine.length, 1, 'alice\'s profile must still exist for the negative below to mean anything')

    const { data: after, error: afterErr } = await bob.from('profiles').select('*').eq('id', aliceId)
    assert.equal(afterErr, null)
    assert.deepEqual(after, [], 'unfriending must revoke profile visibility too')
  } finally {
    await clearFriendship(alice, bobId)
    await alice.from('profiles').delete().eq('id', aliceId)
  }
})
