import { createClient } from '@supabase/supabase-js'

const URL = process.env.VITE_SUPABASE_URL
const KEY = process.env.VITE_SUPABASE_ANON_KEY

function fresh() {
  return createClient(URL, KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export function anonClient() {
  return fresh()
}

// Sign in; if the account does not exist yet, create it. Email confirmation
// is OFF on this project, so signUp returns a usable session immediately.
//
// Only attempt signUp when the sign-in error actually indicates the account
// is absent (Supabase returns "Invalid login credentials" for that case).
// Any other sign-in error (wrong password, rate limit, disabled provider,
// etc.) is a real problem and must not be masked by a signUp attempt.
async function signInOrUp(email, password) {
  const client = fresh()
  let { data, error } = await client.auth.signInWithPassword({ email, password })
  const signInError = error
  if (error) {
    if (!error.message?.includes('Invalid login credentials')) {
      throw error
    }
    ;({ data, error } = await client.auth.signUp({ email, password }))
    if (error) throw error
  }
  if (!data.session) {
    const cause = signInError ? ` (original sign-in error: ${signInError.message})` : ''
    throw new Error(`No session for ${email}${cause}`)
  }
  return { client, userId: data.user.id }
}

// Signing in once per test blows through Supabase's auth rate limit
// (two token requests x every test, all inside a few seconds -> HTTP 429
// over_request_rate_limit, which fails every test after the first handful
// for a reason that has nothing to do with the policies under test).
//
// So sign in once per process and hand every test the same two clients.
// They are still two SEPARATE client objects holding two SEPARATE sessions,
// which is the only property the RLS tests depend on. Nothing is cached in
// the client between calls — persistSession is off and every test reads
// straight from the database — so sharing them across tests is safe.
let clientsPromise = null

export function getTestClients() {
  if (!clientsPromise) {
    clientsPromise = (async () => {
      const a = await signInOrUp(process.env.TEST_ALICE_EMAIL, process.env.TEST_ALICE_PASSWORD)
      const b = await signInOrUp(process.env.TEST_BOB_EMAIL, process.env.TEST_BOB_PASSWORD)
      return { alice: a.client, bob: b.client, aliceId: a.userId, bobId: b.userId }
    })().catch(err => {
      // Don't cache a failure: a transient 429 on the very first test would
      // otherwise poison every later test with the same stale rejection.
      clientsPromise = null
      throw err
    })
  }
  return clientsPromise
}
