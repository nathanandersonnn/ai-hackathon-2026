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
async function signInOrUp(email, password) {
  const client = fresh()
  let { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error) {
    ;({ data, error } = await client.auth.signUp({ email, password }))
    if (error) throw error
  }
  if (!data.session) throw new Error(`No session for ${email}`)
  return { client, userId: data.user.id }
}

export async function getTestClients() {
  const a = await signInOrUp(process.env.TEST_ALICE_EMAIL, process.env.TEST_ALICE_PASSWORD)
  const b = await signInOrUp(process.env.TEST_BOB_EMAIL, process.env.TEST_BOB_PASSWORD)
  return { alice: a.client, bob: b.client, aliceId: a.userId, bobId: b.userId }
}
