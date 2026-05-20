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

export async function currentUserId() {
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error) throw error
  if (!user) throw new Error('Not signed in')
  return user.id
}
