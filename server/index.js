import express from 'express'

const PORT = process.env.PORT || 3001

// Groq — OpenAI-compatible API, free tier, no per-use billing, no SDK.
// The key already lives in .env as VITE_GROQ_API_KEY (used by the chat
// feature). GROQ_API_KEY (un-prefixed) is preferred and checked first.
const GROQ_API_KEY = process.env.GROQ_FORM_KEY || process.env.VITE_GROQ_FORM_KEY
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.3-70b-versatile'

const SYSTEM_PROMPT = `You are an elite, strict strength-and-conditioning coach. Analyze the provided JSON telemetry data for this set. You must calculate the final form_score using a strict deduction model starting from 100 points:
- Missing Depth (Squats knee angle > 100°): Deduct 15 points per occurrence.
- Excessive Torso Lean (Torso angle > 35°): Deduct 10 points per occurrence.
- Asymmetry: Deduct 10 points if noted.
Do not hallucinate a generic score. Only output JSON matching this exact schema:
{
  "deductions_applied": [ { "reason": "string", "points_deducted": number } ],
  "form_score": number,
  "feedback": { "good": ["string"], "warn": ["string"] }
}`

if (!GROQ_API_KEY) {
  console.warn(
    '\n[server] GROQ_FORM_KEY / VITE_GROQ_FORM_KEY is not set. ' +
    'Add it to .env before calling /analyze-set.\n'
  )
}

const app = express()
app.use(express.json({ limit: '1mb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true, hasKey: Boolean(GROQ_API_KEY) })
})

app.post('/analyze-set', async (req, res) => {
  const { exercise, target_reps, detected_reps, telemetry_summary } = req.body ?? {}
  if (
    !exercise ||
    typeof target_reps !== 'number' ||
    typeof detected_reps !== 'number' ||
    !Array.isArray(telemetry_summary)
  ) {
    return res.status(400).json({
      error: 'Expected { exercise, target_reps, detected_reps, telemetry_summary }',
    })
  }

  const t0 = Date.now()
  console.log(
    `[server] /analyze-set start exercise=${exercise} ` +
    `detected=${detected_reps}/${target_reps} reps_with_telemetry=${telemetry_summary.length}`
  )

  const abort = new AbortController()
  const timeout = setTimeout(() => abort.abort(), 20000)

  try {
    const prompt = buildPrompt({ exercise, target_reps, detected_reps, telemetry_summary })

    // Plain fetch to Groq's OpenAI-compatible endpoint — no SDK, free tier.
    // json_object mode forces the response body to be valid JSON.
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 512,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
      }),
      signal: abort.signal,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Groq API ${response.status}: ${detail.slice(0, 200)}`)
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content
    console.log(`[server] Groq responded in ${Date.now() - t0}ms`)
    if (!text) throw new Error('Groq returned no content')

    res.json(parseFeedback(text))
  } catch (err) {
    console.error('[server] /analyze-set failed:', err)
    const message = abort.signal.aborted ? 'Analysis timed out (20s)' : (err.message || 'analyze-set failed')
    res.status(500).json({ error: message })
  } finally {
    clearTimeout(timeout)
  }
})

app.listen(PORT, () => {
  console.log(`[server] Form check API listening on http://localhost:${PORT}`)
})

function buildPrompt({ exercise, target_reps, detected_reps, telemetry_summary }) {
  const payload = {
    exercise,
    target_reps,
    detected_reps,
    telemetry_summary,
  }
  return `Telemetry for this set:
${JSON.stringify(payload, null, 2)}

Each entry in telemetry_summary contains:
- minAngle: minimum primary joint angle reached during the rep, in degrees (knee for Squat/Lunge, elbow for Push-up, hip for Deadlift). Lower = deeper.
- maxTorsoLean: maximum torso lean from vertical during the rep, in degrees (0° upright, 90° horizontal).

Apply the deduction rubric from the system instructions and return JSON matching the required schema. Feedback strings should be punchy coaching cues under 8 words each, imperative voice.`
}

// json_object mode guarantees valid JSON but not the right shape. Groq returns
// { deductions_applied, form_score, feedback: { good, warn } } — validate it,
// then flatten feedback into the {type, text}[] shape the existing UI consumes.
function parseFeedback(text) {
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) throw new Error('Model did not return JSON')
    parsed = JSON.parse(match[0])
  }

  const score = parsed.form_score
  const fb = parsed.feedback
  if (typeof score !== 'number' || !fb || typeof fb !== 'object') {
    throw new Error('Model returned an unexpected shape')
  }

  const good = Array.isArray(fb.good) ? fb.good : []
  const warn = Array.isArray(fb.warn) ? fb.warn : []
  const flatFeedback = [
    ...good.filter(t => typeof t === 'string').map(t => ({ type: 'good', text: t })),
    ...warn.filter(t => typeof t === 'string').map(t => ({ type: 'warn', text: t })),
  ]

  const deductions = Array.isArray(parsed.deductions_applied) ? parsed.deductions_applied : []

  return {
    formScore: Math.max(0, Math.min(100, Math.round(score))),
    feedback: flatFeedback,
    deductionsApplied: deductions
      .filter(d => d && typeof d.reason === 'string' && typeof d.points_deducted === 'number')
      .map(d => ({ reason: d.reason, pointsDeducted: d.points_deducted })),
  }
}
