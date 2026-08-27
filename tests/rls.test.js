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
