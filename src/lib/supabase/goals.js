// ─────────────────────────────────────────────
//  Goals + Milestones
//  Tables: user_goals, milestones
// ─────────────────────────────────────────────

import { supabase, currentUserId } from './client'

/* ─── user_goals ─── */

export async function getGoals() {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('user_goals')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data
}

export async function addGoal({ label, icon, current, target, unit, direction, color }) {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('user_goals')
    .insert({
      user_id: userId,
      label, icon, current, target, unit, direction, color,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateGoal(id, patch) {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('user_goals')
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteGoal(id) {
  const userId = await currentUserId()
  const { error } = await supabase
    .from('user_goals')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw error
}

/* ─── milestones ─── */

export async function getMilestones() {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from('milestones')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data
}
