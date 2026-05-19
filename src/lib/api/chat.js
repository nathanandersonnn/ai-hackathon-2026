// ─────────────────────────────────────────────
//  AI Coach Chat API
//  Sends messages to Claude with user context.
//
//  ENV VARS NEEDED (add to your .env file):
//    VITE_ANTHROPIC_API_KEY=your_key_here
//
//  NOTE: In production, proxy this through your own
//  backend so the API key is never exposed in the browser.
// ─────────────────────────────────────────────

const API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY
const MODEL   = 'claude-sonnet-4-6'

/**
 * Send a user message to Claude along with their fitness context.
 *
 * @param {object[]} history        - Prior messages: [{ role: 'user'|'assistant', content: string }]
 * @param {string}   userMessage    - The new message from the user
 * @param {object}   context        - User fitness context passed to Claude
 * @param {object[]} context.recentLogs      - Recent daily logs
 * @param {object[]} context.recentSessions  - Recent workout sessions
 * @param {object}   context.goals           - User goals
 *
 * @returns {Promise<string>} - Claude's reply text
 */
export async function sendMessage(history, userMessage, context = {}) {
  const systemPrompt = buildSystemPrompt(context)

  const messages = [
    ...history.map(m => ({ role: m.role, content: m.text })),
    { role: 'user', content: userMessage },
  ]

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':         'application/json',
      'x-api-key':            API_KEY,
      'anthropic-version':    '2023-06-01',
      'anthropic-dangerous-allow-browser': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    }),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(`Chat API error ${response.status}: ${err?.error?.message ?? 'unknown'}`)
  }

  const data = await response.json()
  return data.content[0].text
}

function buildSystemPrompt({ recentLogs = [], recentSessions = [], goals = {} }) {
  return `
You are MyFitBud, a personal fitness coach. You are encouraging, direct, and adapt your advice
to the user's real life — their schedule, energy levels, and current goals.

USER CONTEXT:
- Recent daily logs: ${JSON.stringify(recentLogs)}
- Recent workout sessions: ${JSON.stringify(recentSessions)}
- Goals: ${JSON.stringify(goals)}

Keep responses concise (2–4 sentences unless a workout plan is requested).
Reference the user's actual data when relevant.
  `.trim()
}
