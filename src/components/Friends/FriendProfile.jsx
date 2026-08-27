import { useEffect, useState } from 'react'
import { getWorkoutSessionsFor } from '../../lib/supabase/workouts'
import { getWorkoutTemplatesFor, copyTemplateFrom } from '../../lib/supabase/workoutTemplates'
import ErrorBanner from './ErrorBanner'

export default function FriendProfile({ profile, onBack }) {
  const [sessions, setSessions]   = useState([])
  const [templates, setTemplates] = useState([])
  const [copied, setCopied]       = useState({})
  const [error, setError]         = useState('')

  useEffect(() => {
    setError('')
    getWorkoutSessionsFor(profile.id).then(setSessions).catch(e => setError(e.message))
    getWorkoutTemplatesFor(profile.id).then(setTemplates).catch(e => setError(e.message))
  }, [profile.id])

  async function copy(t) {
    try {
      await copyTemplateFrom(t)
      setCopied(c => ({ ...c, [t.id]: true }))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="friends-view">
      <button className="friend-secondary" onClick={onBack}>← Back</button>
      <h1 className="friends-title">@{profile.handle}</h1>
      <ErrorBanner message={error} />

      <section className="friends-section">
        <h2>Presets</h2>
        {templates.length === 0 && <p className="friends-empty">No custom presets.</p>}
        {templates.map(t => (
          <div key={t.id} className="friend-row">
            <span>{t.icon} {t.label}</span>
            <button onClick={() => copy(t)} disabled={copied[t.id]}>
              {copied[t.id] ? 'Copied' : 'Copy to mine'}
            </button>
          </div>
        ))}
      </section>

      <section className="friends-section">
        <h2>Workouts</h2>
        {sessions.length === 0 && <p className="friends-empty">No logged workouts.</p>}
        {sessions.map(s => (
          <details key={s.id} className="friend-session">
            <summary>{s.date} — {s.label}</summary>
            <ul>
              {(s.exercises ?? []).map((ex, i) => (
                <li key={i}>
                  {ex.name}
                  {(ex.sets ?? []).map((set, j) => (
                    <span key={j} className="friend-set"> {set.reps}×{set.weight}</span>
                  ))}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
    </div>
  )
}
