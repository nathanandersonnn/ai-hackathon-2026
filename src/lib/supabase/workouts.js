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
