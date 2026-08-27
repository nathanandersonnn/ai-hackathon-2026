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
    await alice.from('profiles').upsert({ id: aliceId, handle: 'alice_rls' })
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
    await bob.from('profiles').upsert({ id: bobId, handle: 'bob_rls' })
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
    await alice.from('profiles').upsert({ id: aliceId, handle: 'myqhandle' })
    const { data, error } = await bob.rpc('search_profiles', { prefix: 'my_h' })
    assert.equal(error, null)
    assert.ok(!data.some(r => r.handle === 'myqhandle'),
      'a literal "_" in the prefix must not wildcard-match other characters')
  } finally {
    await alice.from('profiles').delete().eq('id', aliceId)
  }
})
