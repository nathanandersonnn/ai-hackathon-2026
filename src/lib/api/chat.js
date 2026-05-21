// ─────────────────────────────────────────────
//  AI Coach Chat API
//  Sends messages to Groq with user context.
//
//  ENV VARS NEEDED (add to your .env file):
//    VITE_GROQ_API_KEY=your_key_here
//
//  NOTE: In production, proxy this through your own
//  backend so the API key is never exposed in the browser.
// ─────────────────────────────────────────────

const API_KEY  = import.meta.env.VITE_GROQ_CHAT_KEY
const BASE_URL = 'https://api.groq.com/openai/v1'
const MODEL    = 'llama-3.3-70b-versatile'

/**
 * Send a user message to Groq along with their fitness context.
 */
export async function sendMessage(history, userMessage, context = {}) {
  const messages = [
    { role: 'system', content: buildSystemPrompt(context) },
    ...history.map(m => ({ role: m.role, content: m.text })),
    { role: 'user', content: userMessage },
  ]

  const response = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      temperature: 0.6,
      messages,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Chat API error ${response.status}: ${err?.error?.message ?? 'unknown'}`)
  }

  const data = await response.json()
  return data.choices[0].message.content
}

// ─────────────────────────────────────────────
//  Message parser — splits [OPTION] lines out of
//  assistant replies into clickable chip labels.
// ─────────────────────────────────────────────

export function parseMessage(content) {
  if (!content) return { text: '', options: [] }

  const lines = content.split('\n')
  const textLines = []
  const options = []

  for (const line of lines) {
    const match = line.match(/^\s*\[OPTION\]\s*(.+?)\s*$/)
    if (match) {
      const clean = match[1].replace(/\*\*/g, '').replace(/\*/g, '').replace(/`/g, '').trim()
      if (clean) options.push(clean)
    } else {
      textLines.push(line)
    }
  }

  return { text: textLines.join('\n').trim(), options }
}

// ─────────────────────────────────────────────
//  System prompt builder
// ─────────────────────────────────────────────

function buildSystemPrompt({ recentLogs = [], recentSessions = [], goals = {}, name = null }) {
  const profile = summarizeProfile(goals)
  const trainingPatterns = summarizeTrainingPatterns(recentSessions)
  const recovery = summarizeRecovery(recentLogs)
  const exerciseLibrary = extractExerciseLibrary(recentSessions)
  const nameLine = name
    ? `The user's name is ${name}. Address them by name occasionally — not in every reply, just when it feels natural (greetings, encouragement, big moments).`
    : `You don't know the user's name yet. Don't ask for it.`

  return `
You are MyFitBud — a personal fitness coach. You are warm, direct, and practical.
You coach based on what the user actually does, not generic advice.

${nameLine}

═══════════════════════════════════════════
USER PROFILE
═══════════════════════════════════════════
${profile}

═══════════════════════════════════════════
TRAINING PATTERNS (last 14 days)
═══════════════════════════════════════════
${trainingPatterns}

═══════════════════════════════════════════
RECENT EXERCISES THE USER KNOWS
═══════════════════════════════════════════
${exerciseLibrary}

═══════════════════════════════════════════
RECOVERY & READINESS SIGNALS
═══════════════════════════════════════════
${recovery}

═══════════════════════════════════════════
COACHING RULES
═══════════════════════════════════════════

When offering the user a choice, end your message with options on separate lines, each prefixed with [OPTION]. Example:

1. WORKOUT SUGGESTIONS
   • Base every suggested workout on movements the user has done before (see exercise library above).
   • Only introduce a NEW exercise if it's a clear progression, regression, or close variation of something they already do — and explicitly say why you're introducing it.
   • Match sets, reps, and intensity to what they've actually been handling recently. Progress by ~5–10% load or +1 rep, not big jumps.
   • Structure: warm-up (2–3 min) → main work (clearly labeled sets × reps) → cooldown (1–2 min).

2. SORENESS & RECOVERY
   • If the user mentions soreness, fatigue, poor sleep, or low energy:
     – Identify the muscle group affected (ask if unclear).
     – Suggest active recovery: mobility, targeted stretches (hold 30–45s), light cardio, or foam rolling.
     – Recommend skipping or reducing intensity on that muscle group for 24–48h.
     – If soreness is severe or lasts >72h or involves sharp/joint pain, advise rest and seeing a professional.
   • Never push a heavy session when recovery signals are red.

3. ADAPTATION
   • If they've been consistent → push slightly harder or add complexity.
   • If they've missed sessions → suggest a lower-friction restart, not a punishment workout.
   • If their logged calories/sleep/steps suggest under-recovery → flag it kindly before prescribing volume.

4. STYLE
   • Default response length: 2–4 sentences.
   • Full workout plans: use a clean bulleted structure with sets × reps and rest times.
   • Reference the user's actual data when relevant ("Last Tuesday you hit 3×8 at 135 on bench, so let's try 3×8 at 140 today").
   • Never invent data. If something isn't in the context above, ask.

5. SAFETY
   • You are not a doctor or physical therapist. For pain (not soreness), injury, or medical questions, recommend a qualified professional.

6. QUICK-REPLY OPTIONS
   • When asking a question, offering a choice, or proposing next actions, end your message with 2–4 options on separate lines, each prefixed with [OPTION].
   • Use options for: readiness check-ins ("how are you feeling?"), yes/no follow-ups, picking a workout focus, choosing recovery vs training.
   • Do NOT use options when delivering a full workout plan, an explanation, or open-ended encouragement — let the user type freely.
   • Keep option labels short and action-oriented (max ~5 words: "Push through", "Skip today", "Lighter session").

   Example:
   How are you feeling about leg day?
   [OPTION] Ready to push hard
   [OPTION] Tired but can move
   [OPTION] Too sore, suggest recovery
   
`.trim()
}

// ─────────────────────────────────────────────
//  Context summarizers — keep the prompt tight
//  by extracting signal instead of dumping JSON
// ─────────────────────────────────────────────

function summarizeProfile(goals) {
  if (!goals || Object.keys(goals).length === 0) {
    return '(No goals set — ask the user about their goals when relevant.)'
  }
  const lines = []
  if (goals.primary)         lines.push(`Primary goal: ${goals.primary}`)
  if (goals.targetWeight)    lines.push(`Target weight: ${goals.targetWeight}`)
  if (goals.weeklyFrequency) lines.push(`Target frequency: ${goals.weeklyFrequency}x/week`)
  if (goals.experience)      lines.push(`Experience level: ${goals.experience}`)
  if (goals.constraints)     lines.push(`Constraints/injuries: ${goals.constraints}`)
  return lines.join('\n') || '(Goals object is empty.)'
}

function summarizeTrainingPatterns(sessions) {
  if (!sessions?.length) return '(No recent training sessions logged.)'

  const last14 = sessions.filter(s => daysAgo(s.date) <= 14)
  if (!last14.length) return '(No sessions in the last 14 days.)'

  // Count sessions per muscle group / workout type
  const groupCounts = {}
  last14.forEach(s => {
    const group = s.muscleGroup || s.type || 'unspecified'
    groupCounts[group] = (groupCounts[group] || 0) + 1
  })

  const groupSummary = Object.entries(groupCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([g, n]) => `${g}: ${n} session${n > 1 ? 's' : ''}`)
    .join(', ')

  const lastSession = last14[0]
  const lastSessionLine = lastSession
    ? `Most recent session (${daysAgo(lastSession.date)}d ago): ${lastSession.muscleGroup || lastSession.type || 'workout'}`
    : ''

  return [
    `Sessions in last 14 days: ${last14.length}`,
    `Distribution: ${groupSummary}`,
    lastSessionLine,
  ].filter(Boolean).join('\n')
}

function extractExerciseLibrary(sessions) {
  if (!sessions?.length) return '(No exercise history yet — stick to fundamentals.)'

  // Build a map of exercise → most recent performance
  const library = {}
  sessions.forEach(session => {
    (session.exercises || []).forEach(ex => {
      const name = ex.name
      if (!name) return
      const lastSet = (ex.sets || []).slice(-1)[0]
      if (!library[name] || daysAgo(session.date) < library[name].daysAgo) {
        library[name] = {
          daysAgo: daysAgo(session.date),
          sets: ex.sets?.length || 0,
          lastReps: lastSet?.reps,
          lastWeight: lastSet?.weight,
        }
      }
    })
  })

  const entries = Object.entries(library)
    .sort((a, b) => a[1].daysAgo - b[1].daysAgo)
    .slice(0, 20) // cap the list

  if (!entries.length) return '(Sessions logged but no exercise detail available.)'

  return entries.map(([name, info]) => {
    const last = info.lastWeight
      ? `${info.sets}×${info.lastReps} @ ${info.lastWeight}`
      : `${info.sets}×${info.lastReps}`
    return `• ${name} — last done ${info.daysAgo}d ago (${last})`
  }).join('\n')
}

function summarizeRecovery(logs) {
  if (!logs?.length) return '(No recent daily logs.)'

  const recent = logs.filter(l => daysAgo(l.date) <= 7)
  if (!recent.length) return '(No logs in the last 7 days.)'

  const avg = (key) => {
    const vals = recent.map(l => l[key]).filter(v => typeof v === 'number')
    if (!vals.length) return null
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
  }

  const sorenessReports = recent
    .filter(l => l.soreness)
    .map(l => `${daysAgo(l.date)}d ago: ${l.soreness}`)

  const lines = []
  const sleep = avg('sleepHours')
  const energy = avg('energy')
  const steps = avg('steps')

  if (sleep !== null)  lines.push(`Avg sleep (7d): ${sleep}h ${flagLowSleep(sleep)}`)
  if (energy !== null) lines.push(`Avg energy (7d): ${energy}/10 ${flagLowEnergy(energy)}`)
  if (steps !== null)  lines.push(`Avg steps (7d): ${steps}`)
  if (sorenessReports.length) {
    lines.push(`Soreness reports:\n  ${sorenessReports.join('\n  ')}`)
  }

  return lines.join('\n') || '(Logs present but no recovery metrics.)'
}

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────

function daysAgo(dateStr) {
  if (!dateStr) return Infinity
  const ms = Date.now() - new Date(dateStr).getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function flagLowSleep(h)  { return h < 6   ? '⚠️ low'    : '' }
function flagLowEnergy(e) { return e < 5   ? '⚠️ low'    : '' }