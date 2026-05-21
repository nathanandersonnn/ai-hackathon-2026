// ─────────────────────────────────────────────
//  Calorie Logs — one row per (user_id, date)
//  Table: calorie_logs
//    food_entries (JSONB): { log: [{ name, cal, protein, ... }], water: number }
//    macro_goals  (JSONB): { cal, protein, carbs, fat }
// ─────────────────────────────────────────────

import { supabase, currentUserId } from './client'

const TABLE = 'calorie_logs'

/**
 * Fetch the user's calorie logs, most recent first.
 * @param {number} limit - optional max rows
 */
export async function getCalorieLogs(limit = 30) {
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
 * Fetch a single day's row. Returns null if no row exists for that date.
 */
export async function getCalorieLog(date) {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('date', date)
    .maybeSingle()

  if (error) throw error
  return data
}

/**
 * Insert or update a day's calorie log. food_entries and macro_goals are
 * stored as JSONB so the UI can evolve without schema changes.
 */
export async function upsertCalorieLog({ date, food_entries, macro_goals }) {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from(TABLE)
    .upsert({
      user_id: userId,
      date,
      food_entries: food_entries ?? { log: [], water: 0 },
      macro_goals:  macro_goals  ?? null,
    }, { onConflict: 'user_id,date' })
    .select()
    .single()

  if (error) throw error
  return data
}
