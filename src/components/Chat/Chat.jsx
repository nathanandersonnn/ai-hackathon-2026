import { useState, useRef, useEffect } from 'react'
import './Chat.css'

const INITIAL_MESSAGES = [
  {
    role: 'assistant',
    text: "Hey Nathan! I've looked at your week — 4 workouts with an 84 avg form score. Solid. Your squat depth has been consistent, though your knees drift in slightly on rep 3+ when fatigued. What are we working on today?",
  },
]

const QUICK_PROMPTS = [
  "I only have 20 minutes",
  "My legs are sore from yesterday",
  "Suggest a workout for today",
  "How's my progress this week?",
]

export default function Chat() {
  const [messages, setMessages] = useState(INITIAL_MESSAGES)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function sendMessage(text) {
    const msg = text ?? input.trim()
    if (!msg) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', text: msg }])
    setLoading(true)

    // Placeholder until Claude API is wired up
    setTimeout(() => {
      setLoading(false)
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: "Got it! Once the Claude API is connected, I'll give you a real response based on your workout history and goals. For now, I'm just a placeholder — but the UI is ready to go.",
        },
      ])
    }, 1200)
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
          <p className="page-subtitle">Powered by Claude · Knows your history and goals</p>
        </div>
        <div className="coach-status">
          <span className="status-dot" />
          <span>Online</span>
        </div>
      </header>

      <div className="chat-layout">
        <div className="chat-messages">
          {messages.map((msg, i) => (
            <div key={i} className={`message message--${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="message-avatar">⚡</div>
              )}
              <div className="message-bubble">
                <p>{msg.text}</p>
              </div>
            </div>
          ))}

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
          <div className="quick-prompts">
            {QUICK_PROMPTS.map(p => (
              <button key={p} className="quick-prompt" onClick={() => sendMessage(p)}>
                {p}
              </button>
            ))}
          </div>

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
