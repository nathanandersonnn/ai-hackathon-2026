// ─────────────────────────────────────────────
//  Workout Sessions
//  Table: workout_sessions
//  exercises is stored as JSONB:
//    [{ name: string, sets: [{ reps: number, weight: number }] }]
// ─────────────────────────────────────────────

import { supabase, currentUserId } from './client'

const TABLE = 'workout_sessions'

/**
 * Fetch the user's workout history, newest first.
 */
export async function getWorkoutSessions(limit = 50) {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data
}

/**
 * Fetch every workout session the user has logged, newest first. Pages
 * through the table so exports aren't capped by the API's row limit.
 */
export async function getAllWorkoutSessions() {
  const userId = await currentUserId()
  const PAGE = 1000
  const all = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('date', { ascending: false })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) throw error
    all.push(...data)
    if (data.length < PAGE) return all
  }
}

/**
 * Save a completed workout session.
 * @param {object} session
 * @param {string} session.label
 * @param {Array}  session.exercises - [{ name, sets: [{ reps, weight }] }]
 */
export async function saveWorkoutSession({ label, exercises }) {
  const userId = await currentUserId()
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      date: today,
      label,
      exercises,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Update a saved session's label and/or exercises in place.
 */
export async function updateWorkoutSession(id, { label, exercises }) {
  const userId = await currentUserId()
  const patch = {}
  if (label !== undefined)     patch.label     = label
  if (exercises !== undefined) patch.exercises = exercises

  const { data, error } = await supabase
    .from(TABLE)
    .update(patch)
    .eq('id', id)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Delete a session by id.
 */
export async function deleteWorkoutSession(id) {
  const userId = await currentUserId()
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw error
}

/**
 * Fetch a friend's workout history. Returns [] for a non-friend — RLS
 * filters the rows out rather than raising an error.
 */
export async function getWorkoutSessionsFor(userId, limit = 50) {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(limit)

  if (error) throw error
  return data
}
