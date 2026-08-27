// ─────────────────────────────────────────────
//  Profiles — the public identity behind a handle
//  Table: profiles
// ─────────────────────────────────────────────

import { supabase, currentUserId } from './client'

const TABLE = 'profiles'

export const HANDLE_RE = /^[a-z0-9_]{3,20}$/

export function isHandleValid(handle) {
  return HANDLE_RE.test(handle ?? '')
}

export async function getMyProfile() {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function claimHandle(handle, displayName) {
  const userId = await currentUserId()
  const clean = (handle ?? '').trim().toLowerCase()
  if (!isHandleValid(clean)) {
    throw new Error('Handles are 3-20 characters: lowercase letters, numbers, underscores.')
  }

  const { data, error } = await supabase
    .from(TABLE)
    .upsert({ id: userId, handle: clean, display_name: displayName ?? null })
    .select()
    .single()

  // 23505 is the Postgres unique-violation code.
  if (error?.code === '23505') throw new Error('That handle is taken.')
  if (error) throw error
  return data
}

export async function searchProfiles(prefix) {
  const clean = (prefix ?? '').trim().toLowerCase()
  if (clean.length < 3) return []

  const { data, error } = await supabase.rpc('search_profiles', { prefix: clean })
  if (error) throw error
  return data ?? []
}
