// ─────────────────────────────────────────────
//  Supabase client
//
//  ENV VARS NEEDED (in your .env file):
//    VITE_SUPABASE_URL=https://your-project.supabase.co
//    VITE_SUPABASE_ANON_KEY=your_anon_key
// ─────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !key) {
  console.warn('⚠️ Supabase env vars missing. Check your .env file.')
}

export const supabase = createClient(url, key)

// ─────────────────────────────────────────────
//  Until you wire up auth, all data is stored
//  against this single "demo" user_id so the app
//  works without sign-in.
//
//  To switch to real auth later:
//    1. Replace this constant with a function that
//       returns supabase.auth.getUser() id.
//    2. Add an <Auth /> component in App.jsx.
// ─────────────────────────────────────────────

export const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001'

export async function currentUserId() {
  // For now, return the demo user. Swap this when adding auth:
  //   const { data: { user } } = await supabase.auth.getUser()
  //   return user?.id
  return DEMO_USER_ID
}
