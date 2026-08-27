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
