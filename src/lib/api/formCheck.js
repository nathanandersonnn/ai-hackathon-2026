// ─────────────────────────────────────────────
//  Form Check API
//  Handles pose analysis and per-set feedback.
//
//  ENV VARS NEEDED (add to your .env file):
//    VITE_FORM_CHECK_API_URL=https://your-backend.com
//    VITE_FORM_CHECK_API_KEY=your_key_here
// ─────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_FORM_CHECK_API_URL ?? ''
const API_KEY  = import.meta.env.VITE_FORM_CHECK_API_KEY

function authHeaders() {
  return API_KEY ? { Authorization: `Bearer ${API_KEY}` } : {}
}

/**
 * Send a completed set to the backend for form analysis.
 *
 * Only the per-rep telemetry summary is sent — raw MediaPipe landmarks stay
 * on the client. The backend can grade form from minAngle + maxTorsoLean
 * extremes without needing every frame.
 *
 * @param {object} setData
 * @param {string} setData.exercise   - e.g. "Squat"
 * @param {number} setData.reps       - detected rep count
 * @param {Array}  setData.telemetry  - per-rep telemetry from exercises.js getTelemetry()
 * @param {number} [setData.targetReps] - optional target; defaults to detected reps
 * @param {object} [opts]
 * @param {(stage: 'sent') => void} [opts.onStage] - fires when the request leaves the client
 *
 * @returns {Promise<{ formScore: number, feedback: { type: 'good'|'warn', text: string }[] }>}
 */
export async function analyzeSet(setData, { onStage } = {}) {
  const telemetry = Array.isArray(setData.telemetry) ? setData.telemetry : []
  const detected = setData.reps ?? telemetry.length
  const payload = {
    exercise: setData.exercise,
    target_reps: setData.targetReps ?? detected,
    detected_reps: detected,
    telemetry_summary: telemetry,
  }

  const body = JSON.stringify(payload)
  console.log('[analyzeSet] payload', payload, `(${body.length} bytes) → ${BASE_URL}/analyze-set`)

  console.log("Sending telemetry:", JSON.stringify(payload, null, 2))

  const request = fetch(`${BASE_URL}/analyze-set`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...authHeaders() },
  body,
  })
  onStage?.('sent')
  const response = await request
  console.log('[analyzeSet] response received, status', response.status)

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
    headers: authHeaders(),
  })

  if (!response.ok) throw new Error(`Form check API error: ${response.status}`)
  return response.json()
}
