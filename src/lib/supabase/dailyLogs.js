// ─────────────────────────────────────────────
//  Daily Logs — weight + steps per day
//  Table: daily_logs
// ─────────────────────────────────────────────

import { supabase, currentUserId } from './client'

const TABLE = 'daily_logs'

/**
 * Fetch the user's daily logs, most recent first.
 * @param {number} limit - optional max rows
 */
export async function getDailyLogs(limit = 30) {
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
 * Insert or update today's log.
 * If a log already exists for that date, it's updated.
 */
export async function upsertDailyLog({ date, weight, steps }) {
  const userId = await currentUserId()
  const { data, error } = await supabase
    .from(TABLE)
    .upsert({
      user_id: userId,
      date,
      weight: weight || null,
      steps:  steps  || null,
    }, { onConflict: 'user_id,date' })
    .select()
    .single()

  if (error) throw error
  return data
}
