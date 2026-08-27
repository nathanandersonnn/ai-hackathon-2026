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
    const { data } = await bob.from('workout_templates').select('*').eq('id', made.id)
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
  const { alice, bob, aliceId } = await getTestClients()
  try {
    const { error: seedErr } = await alice.from('profiles').upsert({ id: aliceId, handle: 'alice_rls' })
    assert.equal(seedErr, null, 'seed must land, or the negative assertion below proves nothing')
    const { data } = await bob.from('profiles').select('*').eq('id', aliceId)
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
  const { data } = await bob.rpc('search_profiles', { prefix: 'al' })
  assert.deepEqual(data, [], 'short prefixes must return nothing, to make enumeration expensive')
})

test('search_profiles never returns the caller', async () => {
  const { bob, bobId } = await getTestClients()
  try {
    const { error: seedErr } = await bob.from('profiles').upsert({ id: bobId, handle: 'bob_rls' })
    assert.equal(seedErr, null, 'seed must land, or the negative assertion below proves nothing')
    const { data } = await bob.rpc('search_profiles', { prefix: 'bob' })
    assert.ok(!data.some(r => r.id === bobId))
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
//  call below has its error captured and asserted null BEFORE any downstream
//  assertion is trusted. A negative assertion after a silently-failed setup
//  proves nothing. Every test clears any alice<->bob friendship both at the
//  start (in case a prior failed run left one behind) and in a finally block
//  (so a failing assertion cannot leak state into later tests), and cleans
//  up every row it creates the same way.
// ─────────────────────────────────────────────

async function clearFriendship(client, otherId) {
  await client.rpc('remove_friend', { other: otherId })
}

test('a pending request does NOT expose workouts', async () => {
  const { alice, bob, aliceId, bobId } = await getTestClients()
  await clearFriendship(alice, bobId)
  let session
  try {
    const { error: profileErr } = await alice.from('profiles').upsert({ id: aliceId, handle: 'alice_rls' })
    assert.equal(profileErr, null, 'profile seed must land, or this test proves nothing')

    const { data, error: seedErr } = await alice.from('workout_sessions')
      .insert({ user_id: aliceId, date: '2026-01-01', label: 'Secret', exercises: [] })
      .select().single()
    assert.equal(seedErr, null, 'seed row must be created, or this test proves nothing')
    session = data

    const { error: reqErr } = await bob.rpc('request_friend', { target: aliceId })
    assert.equal(reqErr, null, 'request_friend must succeed, or the pending state is not actually established')

    const { data: seen } = await bob.from('workout_sessions').select('*').eq('id', session.id)
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

    const { error: reqErr } = await bob.rpc('request_friend', { target: aliceId })
    assert.equal(reqErr, null, 'request_friend must succeed, or the friendship is not actually established')
    const { error: acceptErr } = await alice.rpc('accept_friend', { other: bobId })
    assert.equal(acceptErr, null, 'accept_friend must succeed, or the friendship is not actually accepted')

    const { data: seenS } = await bob.from('workout_sessions').select('*').eq('id', session.id)
    assert.equal(seenS.length, 1, 'friend must see the session')
    const { data: seenT } = await bob.from('workout_templates').select('*').eq('id', tmpl.id)
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

    const { error: reqErr } = await bob.rpc('request_friend', { target: aliceId })
    assert.equal(reqErr, null, 'request_friend must succeed, or the friendship is not actually established')
    const { error: acceptErr } = await alice.rpc('accept_friend', { other: bobId })
    assert.equal(acceptErr, null, 'accept_friend must succeed, or the friendship is not actually accepted')

    await bob.from('workout_sessions').update({ label: 'Hacked' }).eq('id', session.id)
    const { data: after, error: afterErr } = await alice.from('workout_sessions')
      .select('label').eq('id', session.id).single()
    assert.equal(afterErr, null, 'alice must still be able to read her own row after the attempted write')
    assert.equal(after.label, 'ReadOnly', 'friend writes must not land')

    await bob.from('workout_sessions').delete().eq('id', session.id)
    const { data: still } = await alice.from('workout_sessions').select('id').eq('id', session.id)
    assert.equal(still.length, 1, 'friend deletes must not land')
  } finally {
    await clearFriendship(alice, bobId)
    if (session) await alice.from('workout_sessions').delete().eq('id', session.id)
  }
})

test('friends can NEVER read private tables', async () => {
  const { alice, bob, aliceId, bobId } = await getTestClients()
  await clearFriendship(alice, bobId)
  let seeded = false
  try {
    // Clear first: daily_logs is unique on (user_id, date), so a row left
    // behind by an earlier failed run would make the seed below fail with a
    // unique violation and wedge this test permanently.
    await alice.from('daily_logs').delete().eq('user_id', aliceId).eq('date', '2026-01-04')

    const { error: seedErr } = await alice.from('daily_logs')
      .insert({ user_id: aliceId, date: '2026-01-04', weight: 180 })
    assert.equal(seedErr, null, 'daily_logs seed must land, or this test proves nothing')
    seeded = true

    const { error: reqErr } = await bob.rpc('request_friend', { target: aliceId })
    assert.equal(reqErr, null, 'request_friend must succeed, or the friendship is not actually established')
    const { error: acceptErr } = await alice.rpc('accept_friend', { other: bobId })
    assert.equal(acceptErr, null, 'accept_friend must succeed, or the friendship is not actually accepted')

    for (const table of ['daily_logs', 'calorie_logs', 'user_goals', 'milestones']) {
      const { data } = await bob.from(table).select('*').eq('user_id', aliceId)
      assert.deepEqual(data, [], `${table} must stay private even between friends`)
    }
  } finally {
    await clearFriendship(alice, bobId)
    if (seeded) await alice.from('daily_logs').delete().eq('user_id', aliceId).eq('date', '2026-01-04')
  }
})

test('a friendship row exists only once regardless of direction', async () => {
  const { alice, bob, aliceId, bobId } = await getTestClients()
  await clearFriendship(alice, bobId)
  try {
    const { error: bobReqErr } = await bob.rpc('request_friend', { target: aliceId })
    assert.equal(bobReqErr, null, 'bob->alice request must succeed, or this test proves nothing')
    const { error: aliceReqErr } = await alice.rpc('request_friend', { target: bobId })
    assert.equal(aliceReqErr, null, 'the reverse-direction request must not error (on conflict do nothing)')

    const { data, error } = await bob.from('friendships').select('*')
    assert.equal(error, null, 'bob must be able to read his own friendships row(s)')
    const pair = data.filter(r =>
      (r.user_a === aliceId && r.user_b === bobId) || (r.user_a === bobId && r.user_b === aliceId))
    assert.equal(pair.length, 1, 'canonical ordering must collapse both directions to one row')
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

    const { error: reqErr } = await bob.rpc('request_friend', { target: aliceId })
    assert.equal(reqErr, null, 'bob must be able to send the request, or this test proves nothing')

    // Bob (the requester) tries to accept his own request.
    const { error: selfAcceptErr } = await bob.rpc('accept_friend', { other: aliceId })
    // The RPC itself does not have to error (its WHERE clause simply matches
    // zero rows) — what matters is that the friendship must NOT become
    // accepted as a result, which the read-access check below proves.
    void selfAcceptErr

    const { data: seen } = await bob.from('workout_sessions').select('*').eq('id', session.id)
    assert.deepEqual(seen, [], 'a self-accepted request must not grant read access')

    const { data: friendship, error: readErr } = await bob.from('friendships').select('*')
      .eq('status', 'accepted')
    assert.equal(readErr, null)
    assert.deepEqual(friendship, [], 'the friendship must still be pending, not accepted')
  } finally {
    await clearFriendship(alice, bobId)
    if (session) await alice.from('workout_sessions').delete().eq('id', session.id)
  }
})
