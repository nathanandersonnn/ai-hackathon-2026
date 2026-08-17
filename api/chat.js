// ─────────────────────────────────────────────
//  POST /api/chat
//
//  AI Coach. The Groq key stays here; the browser only ever sees the
//  reply text. Before this existed the key was inlined into the client
//  bundle by Vite, which made it readable by anyone who opened the JS.
// ─────────────────────────────────────────────

import { groqChat, guard } from './_groq.js'
import { buildSystemPrompt } from './_chatPrompt.js'

// A long history is the easiest way to run up a bill on a leaked
// endpoint, so cap what we forward regardless of what the client sends.
const MAX_HISTORY = 20

export default async function handler(req, res) {
  const apiKey = process.env.GROQ_CHAT_KEY
  if (!guard(req, res, apiKey, 'GROQ_CHAT_KEY')) return

  const { history, userMessage, context } = req.body ?? {}
  if (typeof userMessage !== 'string' || !userMessage.trim()) {
    return res.status(400).json({ error: 'Expected { userMessage } as a non-empty string' })
  }

  const trimmedHistory = (Array.isArray(history) ? history : [])
    .slice(-MAX_HISTORY)
    .filter(m => m && typeof m.text === 'string' && (m.role === 'user' || m.role === 'assistant'))
    .map(m => ({ role: m.role, content: m.text }))

  try {
    const reply = await groqChat(apiKey, {
      max_tokens: 1024,
      temperature: 0.6,
      messages: [
        { role: 'system', content: buildSystemPrompt(context ?? {}) },
        ...trimmedHistory,
        { role: 'user', content: userMessage },
      ],
    })

    res.json({ reply })
  } catch (err) {
    console.error('[api] chat failed:', err)
    res.status(500).json({ error: err.message || 'chat failed' })
  }
}
