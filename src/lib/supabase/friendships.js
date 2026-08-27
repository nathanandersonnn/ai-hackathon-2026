// ─────────────────────────────────────────────
//  Friendships
//  Table: friendships — one row per pair, user_a < user_b.
//  All writes go through SECURITY DEFINER RPCs, which are what
//  enforce that canonical ordering.
// ─────────────────────────────────────────────

import { supabase, currentUserId } from './client'

const TABLE = 'friendships'

function otherId(row, me) {
  return row.user_a === me ? row.user_b : row.user_a
}

async function hydrate(rows, me) {
  const ids = rows.map(r => otherId(r, me))
  if (!ids.length) return []

  const { data, error } = await supabase
    .from('profiles')
    .select('id, handle, display_name')
    .in('id', ids)

  if (error) throw error
  return data ?? []
}

export async function listFriends() {
  const me = await currentUserId()
  const { data, error } = await supabase.from(TABLE).select('*').eq('status', 'accepted')
  if (error) throw error
  return hydrate(data ?? [], me)
}

export async function listPendingRequests() {
  const me = await currentUserId()
  const { data, error } = await supabase.from(TABLE).select('*').eq('status', 'pending')
  if (error) throw error
  // Only requests sent TO me are actionable.
  const incoming = (data ?? []).filter(r => r.requested_by !== me)
  return hydrate(incoming, me)
}

// Requests I sent that are still awaiting the other side. Used to keep a
// target visible in search results with a "Requested" affordance instead of
// it silently vanishing after Add is clicked.
export async function listOutgoingPending() {
  const me = await currentUserId()
  const { data, error } = await supabase.from(TABLE).select('*').eq('status', 'pending')
  if (error) throw error
  const outgoing = (data ?? []).filter(r => r.requested_by === me)
  return hydrate(outgoing, me)
}

export async function requestFriend(userId) {
  const { error } = await supabase.rpc('request_friend', { target: userId })
  if (error) throw error
}

export async function acceptFriend(userId) {
  const { error } = await supabase.rpc('accept_friend', { other: userId })
  if (error) throw error
}

export async function removeFriend(userId) {
  const { error } = await supabase.rpc('remove_friend', { other: userId })
  if (error) throw error
}
