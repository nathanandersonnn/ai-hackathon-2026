// ─────────────────────────────────────────────
//  AI Coach Chat — client
//
//  Talks to /api/chat, which is a Vercel function in production and the
//  express dev server locally. The Groq key and the coaching prompt
//  both live server-side now; this file only ships the request and the
//  reply parser the UI needs.
// ─────────────────────────────────────────────

/**
 * Send a user message to the coach along with their fitness context.
 *
 * @param {{role: 'user'|'assistant', text: string}[]} history
 * @param {string} userMessage
 * @param {object} context - { recentLogs, recentSessions, goals, name }
 * @returns {Promise<string>} the assistant's reply
 */
export async function sendMessage(history, userMessage, context = {}) {
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ history, userMessage, context }),
  })

  // The SPA rewrite answers a missing route with the HTML shell at 200,
  // so check the content type before trusting the status.
  const type = response.headers.get('content-type') ?? ''
  if (!type.includes('application/json')) {
    throw new Error('Coach is not deployed — /api/chat did not return JSON')
  }
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error ?? `Chat API error ${response.status}`)
  }

  const data = await response.json()
  return data.reply
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
