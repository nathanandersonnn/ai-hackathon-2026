import { useState, useRef, useEffect } from 'react'
import { sendMessage as apiSendMessage, parseMessage } from '../../lib/api/chat'
import { getDailyLogs } from '../../lib/supabase/dailyLogs'
import { getWorkoutSessions } from '../../lib/supabase/workouts'
import { getGoals } from '../../lib/supabase/goals'
import './Chat.css'

const QUICK_PROMPTS = [
  "I'm limited on time",
  "I'm feeling sore today",
  "Suggest a workout for today",
  "How's my progress this week?",
]

function buildGreeting(name) {
  return name
    ? `Hey ${name}! I'm your MyFitBud coach. What are we working on today?`
    : "Hey! I'm your MyFitBud coach. What are we working on today?"
}

export default function Chat({ user, seed, onSeedConsumed }) {
  const username = user?.user_metadata?.username?.trim() || null

  const [messages, setMessages] = useState([{ role: 'assistant', text: buildGreeting(username) }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [context, setContext] = useState({ recentLogs: [], recentSessions: [], goals: {}, name: username })
  const bottomRef = useRef(null)
  const sentSeedRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Update greeting if username changes while on this screen (and no chat has started yet)
  useEffect(() => {
    setMessages(prev => {
      if (prev.length !== 1 || prev[0].role !== 'assistant') return prev
      return [{ role: 'assistant', text: buildGreeting(username) }]
    })
    setContext(c => ({ ...c, name: username }))
  }, [username])

  // Auto-send a seeded question (e.g. from the Form Check "Ask coach" button).
  // Guarded by a ref so the same seed never sends twice — once consumed, parent clears it.
  useEffect(() => {
    if (!seed || sentSeedRef.current === seed) return
    sentSeedRef.current = seed
    sendMessage(seed)
    onSeedConsumed?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed])

  // Load fitness context once on mount so Groq sees real data
  useEffect(() => {
    Promise.all([getDailyLogs(14), getWorkoutSessions(14), getGoals()])
      .then(([logs, sessions, goals]) => {
        setContext(c => ({
          ...c,
          recentLogs: logs,
          recentSessions: sessions,
          goals: goals.reduce((acc, g) => ({ ...acc, [g.label]: g }), {}),
        }))
      })
      .catch(err => console.warn('Could not load chat context:', err))
  }, [])

  async function sendMessage(text) {
    const msg = text ?? input.trim()
    if (!msg) return
    setInput('')
    const updated = [...messages, { role: 'user', text: msg }]
    setMessages(updated)
    setLoading(true)

    try {
      const reply = await apiSendMessage(messages, msg, context)
      setMessages(prev => [...prev, { role: 'assistant', text: reply }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${err.message}` }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div className="chat-view">
      <header className="page-header">
        <div>
          <h1 className="page-title">AI Coach</h1>
          <p className="page-subtitle">Powered by Groq · Knows your history and goals</p>
        </div>
        <div className="coach-status">
          <span className="status-dot" />
          <span>Online</span>
        </div>
      </header>

      <div className="chat-layout">
        <div className="chat-messages">
          {messages.map((msg, i) => {
            const isLast = i === messages.length - 1
            const { text, options } = msg.role === 'assistant'
              ? parseMessage(msg.text)
              : { text: msg.text, options: [] }

            return (
              <div key={i} className={`message message--${msg.role}`}>
                {msg.role === 'assistant' && (
                  <div className="message-avatar">⚡</div>
                )}
                <div className="message-group">
                  <div className="message-bubble">
                    <p>{text}</p>
                  </div>
                  {options.length > 0 && isLast && !loading && (
                    <div className="option-chips">
                      {options.map((opt, j) => (
                        <button
                          key={j}
                          className="option-chip"
                          onClick={() => sendMessage(opt)}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {loading && (
            <div className="message message--assistant">
              <div className="message-avatar">⚡</div>
              <div className="message-bubble message-bubble--typing">
                <span /><span /><span />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="chat-input-area">
          {messages.length <= 1 && (
            <div className="quick-prompts">
              {QUICK_PROMPTS.map(p => (
                <button key={p} className="quick-prompt" onClick={() => sendMessage(p)}>
                  {p}
                </button>
              ))}
            </div>
          )}

          <div className="input-row">
            <textarea
              className="chat-input"
              placeholder="Tell me how you're feeling, ask for a workout, or anything..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
            />
            <button
              className={`send-btn ${input.trim() ? 'send-btn--active' : ''}`}
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
            >
              <SendIcon />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="22" y1="2" x2="11" y2="13"/>
      <polygon points="22 2 15 22 11 13 2 9 22 2"/>
    </svg>
  )
}
