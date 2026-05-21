// ─────────────────────────────────────────────
//  Workout Templates — user-defined presets
//  Table: workout_templates
//    exercises (JSONB): [{ name, sets, reps }] — same shape as built-in templates
// ─────────────────────────────────────────────

import { supabase, currentUserId } from './client'

const TABLE = 'workout_templates'

export async function getWorkoutTemplates() {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

export async function saveWorkoutTemplate({ label, icon, tag, color, description, exercises }) {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      user_id: userId,
      label,
      icon,
      tag,
      color,
      description,
      exercises,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteWorkoutTemplate(id) {
  const userId = await currentUserId()
  const { error } = await supabase
    .from(TABLE)
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) throw error
}
