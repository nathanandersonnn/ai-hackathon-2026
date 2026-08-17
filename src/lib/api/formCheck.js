// ─────────────────────────────────────────────
//  Form Check API — client
//
//  Talks to /api/analyze-set, which is a Vercel function in production
//  and the express dev server locally. No API key here on purpose: any
//  key referenced from src/ gets inlined into the browser bundle.
// ─────────────────────────────────────────────

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

  const request = fetch('/api/analyze-set', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      exercise: setData.exercise,
      target_reps: setData.targetReps ?? detected,
      detected_reps: detected,
      telemetry_summary: telemetry,
    }),
  })
  onStage?.('sent')

  const response = await assertJsonOk(await request)
  return response.json()
}

/**
 * The SPA rewrite means a missing route answers 200 with the HTML shell
 * rather than a 404, so a content-type check is what actually catches a
 * misconfigured deploy. Without it the failure surfaces as a confusing
 * "Unexpected token '<'" from response.json().
 */
async function assertJsonOk(response) {
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) {
    throw new Error('Form check API is not deployed — /api/analyze-set did not return JSON')
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error ?? `Form check API error: ${response.status}`)
  }
  return response
}
