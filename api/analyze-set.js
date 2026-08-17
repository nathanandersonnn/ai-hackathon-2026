// ─────────────────────────────────────────────
//  POST /api/analyze-set
//
//  Grades a completed set from per-rep telemetry. Runs as a Vercel
//  function in production and behind the express dev server locally —
//  the (req, res) signature is the same in both.
// ─────────────────────────────────────────────

import { groqChat, guard } from './_groq.js'

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

export default async function handler(req, res) {
  const apiKey = process.env.GROQ_FORM_KEY
  if (!guard(req, res, apiKey, 'GROQ_FORM_KEY')) return

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

  try {
    const text = await groqChat(apiKey, {
      max_tokens: 768,
      temperature: 0.3,
      // json_object mode forces the response body to be valid JSON.
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildPrompt({ exercise, target_reps, detected_reps, telemetry_summary }),
        },
      ],
    })

    console.log(`[api] analyze-set ${exercise} ${detected_reps}/${target_reps} in ${Date.now() - t0}ms`)
    res.json(parseFeedback(text))
  } catch (err) {
    console.error('[api] analyze-set failed:', err)
    res.status(500).json({ error: err.message || 'analyze-set failed' })
  }
}

function buildPrompt({ exercise, target_reps, detected_reps, telemetry_summary }) {
  const payload = { exercise, target_reps, detected_reps, telemetry_summary }
  return `Telemetry for this set:
${JSON.stringify(payload, null, 2)}

Each entry in telemetry_summary contains:
- minAngle: minimum primary joint angle reached during the rep, in degrees (knee for Squat/Lunge, elbow for Push-up, hip for Deadlift). Lower = deeper.
- maxTorsoLean: maximum torso lean from vertical during the rep, in degrees (0° upright, 90° horizontal).

Apply the deduction rubric from the system instructions and return JSON matching the required schema.

Write descriptive feedback, not terse cues. Each feedback string is one full, specific sentence (roughly 12-25 words) that cites the actual measured numbers. A "warn" string names what was off, why it matters, and how to fix it, and should explain the issues behind the deductions you applied. A "good" string calls out what was done well and why it counts. Aim for 2-3 strings in each list (fewer only if the data genuinely does not support them).`
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
