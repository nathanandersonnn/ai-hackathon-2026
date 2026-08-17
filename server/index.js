// ─────────────────────────────────────────────
//  Local dev server
//
//  In production these routes are Vercel functions under api/. This
//  express app exists only so `npm run dev` serves the same handlers
//  at the same paths — Vercel's (req, res) signature is express's, so
//  the handlers are mounted directly with no adapter.
//
//  Add a route here whenever you add a file under api/.
// ─────────────────────────────────────────────

import express from 'express'
import analyzeSet from '../api/analyze-set.js'
import chat from '../api/chat.js'

const PORT = process.env.PORT || 3001

const app = express()
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    hasFormKey: Boolean(process.env.GROQ_FORM_KEY),
    hasChatKey: Boolean(process.env.GROQ_CHAT_KEY),
  })
})

app.post('/api/analyze-set', analyzeSet)
app.post('/api/chat', chat)

for (const [name, value] of [
  ['GROQ_FORM_KEY', process.env.GROQ_FORM_KEY],
  ['GROQ_CHAT_KEY', process.env.GROQ_CHAT_KEY],
]) {
  if (!value) console.warn(`[server] ${name} is not set — add it to .env`)
}

app.listen(PORT, () => {
  console.log(`[server] API listening on http://localhost:${PORT}`)
})
