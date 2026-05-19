// ─────────────────────────────────────────────
//  Form Check API
//  Handles pose analysis and per-set feedback.
//
//  ENV VARS NEEDED (add to your .env file):
//    VITE_FORM_CHECK_API_URL=https://your-backend.com
//    VITE_FORM_CHECK_API_KEY=your_key_here
// ─────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_FORM_CHECK_API_URL
const API_KEY  = import.meta.env.VITE_FORM_CHECK_API_KEY

/**
 * Send a completed set to the backend for form analysis.
 *
 * @param {object} setData
 * @param {string} setData.exercise  - e.g. "Squat"
 * @param {number} setData.reps      - rep count
 * @param {Array}  setData.landmarks - MediaPipe pose landmark frames
 *
 * @returns {Promise<{ formScore: number, feedback: { type: 'good'|'warn', text: string }[] }>}
 */
export async function analyzeSet(setData) {
  const response = await fetch(`${BASE_URL}/analyze-set`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(setData),
  })

  if (!response.ok) throw new Error(`Form check API error: ${response.status}`)
  return response.json()
}

/**
 * Fetch exercise-specific form rules/tips for the UI.
 *
 * @param {string} exercise - e.g. "Squat"
 * @returns {Promise<{ tips: string[] }>}
 */
export async function getExerciseTips(exercise) {
  const response = await fetch(`${BASE_URL}/exercise-tips/${encodeURIComponent(exercise)}`, {
    headers: { 'Authorization': `Bearer ${API_KEY}` },
  })

  if (!response.ok) throw new Error(`Form check API error: ${response.status}`)
  return response.json()
}
