import express from 'express'
import { query } from '@anthropic-ai/claude-agent-sdk'

const PORT = process.env.PORT || 3001

if (!process.env.CLAUDE_CODE_OAUTH_TOKEN) {
  console.warn(
    '\n[server] CLAUDE_CODE_OAUTH_TOKEN is not set. ' +
    'Run `claude setup-token` and add the value to .env before calling /analyze-set.\n'
  )
}

const app = express()
app.use(express.json({ limit: '8mb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true, hasToken: Boolean(process.env.CLAUDE_CODE_OAUTH_TOKEN) })
})

app.post('/analyze-set', async (req, res) => {
  const { exercise, reps, landmarks } = req.body ?? {}
  if (!exercise || typeof reps !== 'number' || !Array.isArray(landmarks)) {
    return res.status(400).json({ error: 'Expected { exercise, reps, landmarks }' })
  }

  const t0 = Date.now()
  console.log(`[server] /analyze-set start exercise=${exercise} reps=${reps} frames=${landmarks.length}`)

  const abortController = new AbortController()
  const timeout = setTimeout(() => {
    console.warn('[server] aborting Claude query after 45s')
    abortController.abort()
  }, 45000)

  try {
    const summary = summarizeSet(exercise, reps, landmarks)
    const prompt = buildPrompt(summary)

    let assistantText = ''
    for await (const msg of query({
      prompt,
      options: {
        model: 'claude-sonnet-4-6',
        maxTurns: 1,
        allowedTools: [],
        systemPrompt: 'You are a strength coach giving punchy cues. Every feedback item must be under 8 words, imperative voice, like a trainer yelling across the gym. Respond ONLY with valid JSON. No prose, no markdown fences.',
        permissionMode: 'dontAsk',
        abortController,
      },
    })) {
      if (msg.type === 'assistant') {
        for (const block of msg.message.content ?? []) {
          if (block.type === 'text') assistantText += block.text
        }
      } else if (msg.type === 'result') {
        console.log(`[server] result message after ${Date.now() - t0}ms`)
      }
    }

    console.log(`[server] Claude responded in ${Date.now() - t0}ms; text length=${assistantText.length}`)
    if (!assistantText) throw new Error('Claude returned no text')

    const parsed = parseFeedbackJson(assistantText)
    res.json(parsed)
  } catch (err) {
    console.error('[server] /analyze-set failed:', err)
    const message = abortController.signal.aborted ? 'Claude timed out (45s)' : (err.message || 'analyze-set failed')
    res.status(500).json({ error: message })
  } finally {
    clearTimeout(timeout)
  }
})

app.listen(PORT, () => {
  console.log(`[server] Form check API listening on http://localhost:${PORT}`)
})

function summarizeSet(exercise, reps, landmarkFrames) {
  const n = landmarkFrames.length
  if (n === 0) return { exercise, reps, frames: 0, stats: null }

  const knee = [], hip = [], elbow = [], shoulder = []
  for (const lm of landmarkFrames) {
    const k = bilateral(lm, [23, 25, 27], [24, 26, 28])
    if (k != null) knee.push(k)

    const h = bilateral(lm, [11, 23, 25], [12, 24, 26])
    if (h != null) hip.push(h)

    const e = bilateral(lm, [11, 13, 15], [12, 14, 16])
    if (e != null) elbow.push(e)

    const s = bilateral(lm, [13, 11, 23], [14, 12, 24])
    if (s != null) shoulder.push(s)
  }

  const stats = {}
  if (exercise === 'Squat') {
    if (knee.length) stats.knee_angle = statTriplet(knee)
    if (hip.length) stats.hip_angle = statTriplet(hip)
  } else if (exercise === 'Push-up') {
    if (elbow.length) stats.elbow_angle = statTriplet(elbow)
    if (shoulder.length) stats.shoulder_angle = statTriplet(shoulder)
  } else if (exercise === 'Deadlift') {
    if (hip.length) stats.hip_angle = statTriplet(hip)
    if (knee.length) stats.knee_angle = statTriplet(knee)
  } else if (exercise === 'Lunge') {
    if (knee.length) stats.knee_angle = statTriplet(knee)
    if (hip.length) stats.hip_angle = statTriplet(hip)
  } else {
    if (knee.length) stats.knee_angle = statTriplet(knee)
    if (elbow.length) stats.elbow_angle = statTriplet(elbow)
  }

  return { exercise, reps, frames: n, stats }
}

function bilateral(lm, leftTriple, rightTriple) {
  const l = angle(lm[leftTriple[0]], lm[leftTriple[1]], lm[leftTriple[2]])
  const r = angle(lm[rightTriple[0]], lm[rightTriple[1]], lm[rightTriple[2]])
  if (l == null || r == null) return null
  return (l + r) / 2
}

function statTriplet(arr) {
  let min = Infinity, max = -Infinity, sum = 0
  for (const v of arr) {
    if (v < min) min = v
    if (v > max) max = v
    sum += v
  }
  return { min: round(min), max: round(max), mean: round(sum / arr.length) }
}

function angle(a, b, c) {
  if (!a || !b || !c) return null
  const v1x = a.x - b.x, v1y = a.y - b.y
  const v2x = c.x - b.x, v2y = c.y - b.y
  const m1 = Math.hypot(v1x, v1y), m2 = Math.hypot(v2x, v2y)
  if (!m1 || !m2) return null
  const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (m1 * m2)))
  return (Math.acos(cos) * 180) / Math.PI
}

function round(v) {
  return Math.round(v * 10) / 10
}

function buildPrompt({ exercise, reps, frames, stats }) {
  return `Analyze this ${exercise} set.

Reps: ${reps}
Frames: ${frames}
Joint angles (degrees): ${JSON.stringify(stats)}

Reference ranges:
- Squat: knee 80–100° at bottom, 170–180° at top
- Push-up: elbow 70–90° at bottom, 160–180° at top
- Deadlift: hip 80–110° at bottom (hinge), 165–180° at top (lockout)
- Lunge: front knee 85–95° at bottom, both knees 165–180° at top

Return ONLY this JSON (no markdown):
{"formScore": <0-100 integer>, "feedback": [{"type": "good"|"warn", "text": "<cue>"}]}

Rules:
- Exactly 3 feedback items
- Each "text" UNDER 8 WORDS
- Imperative voice, no hedging
- Good examples: "Drop two inches deeper", "Keep heels planted", "Solid depth", "Lock out elbows fully"
- Bad examples: "Your squat depth was good but could improve" (too long, hedged)`
}

function parseFeedbackJson(text) {
  const trimmed = text.trim()
  const match = trimmed.match(/\{[\s\S]*\}/)
  if (!match) throw new Error(`Could not find JSON in model output: ${trimmed.slice(0, 200)}`)
  const parsed = JSON.parse(match[0])
  if (typeof parsed.formScore !== 'number' || !Array.isArray(parsed.feedback)) {
    throw new Error('Model returned invalid shape')
  }
  return parsed
}
