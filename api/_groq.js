// ─────────────────────────────────────────────
//  Groq client — server-side only.
//
//  Lives under api/ so the key never reaches the browser. Nothing in
//  this file may be imported from src/; Vite would inline it into the
//  bundle and we would be back where we started.
// ─────────────────────────────────────────────

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'

// llama-3.3-70b-versatile was decommissioned by Groq; requests for it now
// 404. Override with GROQ_MODEL when this one is retired in turn —
// `curl https://api.groq.com/openai/v1/models -H "Authorization: Bearer $KEY"`
// lists what the key can currently reach.
export const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b'

/**
 * POST to Groq's OpenAI-compatible chat endpoint.
 *
 * @param {string} apiKey
 * @param {object} body            - model/messages/etc, merged over defaults
 * @param {number} [timeoutMs]     - aborts the request after this long
 * @returns {Promise<string>} the assistant message content
 */
export async function groqChat(apiKey, body, timeoutMs = 20000) {
  const abort = new AbortController()
  const timeout = setTimeout(() => abort.abort(), timeoutMs)

  try {
    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model: GROQ_MODEL, ...body }),
      signal: abort.signal,
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Groq API ${response.status}: ${detail.slice(0, 200)}`)
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content
    if (!text) throw new Error('Groq returned no content')
    return text
  } catch (err) {
    if (abort.signal.aborted) throw new Error(`Request timed out (${timeoutMs / 1000}s)`)
    throw err
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Shared guard for both handlers: rejects non-POST and missing keys with
 * the same shape the client's error path already understands.
 *
 * @returns {boolean} true if the request may proceed
 */
export function guard(req, res, apiKey, keyName) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Use POST' })
    return false
  }
  if (!apiKey) {
    console.error(`[api] ${keyName} is not set`)
    res.status(500).json({ error: 'Server is missing its API key' })
    return false
  }
  return true
}
