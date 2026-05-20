import { useState, useEffect } from 'react'
import { getDailyLogs, upsertDailyLog } from '../../lib/supabase/dailyLogs'
import './Logging.css'

function formatDate(isoDate) {
  return new Date(isoDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function Logging() {
  const todayIso = new Date().toISOString().slice(0, 10)

  const [weight, setWeight]   = useState('')
  const [steps, setSteps]     = useState('')
  const [saved, setSaved]     = useState(false)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  // True if today's row already exists — drives "Update" vs "Save" labeling
  const todayLog = history.find(r => r.date === todayIso)
  const alreadyLogged = !!todayLog

  useEffect(() => {
    getDailyLogs()
      .then(rows => {
        setHistory(rows)
        // Pre-fill inputs with today's existing values if logged
        const t = rows.find(r => r.date === todayIso)
        if (t) {
          setWeight(t.weight != null ? String(t.weight) : '')
          setSteps(t.steps  != null ? String(t.steps)  : '')
        }
      })
      .catch(err => console.error('Failed to load daily logs:', err))
      .finally(() => setLoading(false))
  }, [todayIso])

  async function handleSave() {
    if (!weight && !steps) return
    try {
      const row = await upsertDailyLog({
        date: todayIso,
        weight: weight ? parseFloat(weight) : null,
        steps:  steps  ? parseInt(steps)    : null,
      })
      // One row per day — replace today's row in place
      setHistory(prev => {
        const filtered = prev.filter(r => r.date !== todayIso)
        return [row, ...filtered]
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      console.error('Save failed:', err)
      alert('Could not save — check console for details.')
    }
  }

  return (
    <div className="logging-view">
      <header className="page-header">
        <div>
          <h1 className="page-title">Daily Log</h1>
          <p className="page-subtitle">Track your weight and steps each day</p>
        </div>
        <div className="today-badge">
          {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </div>
      </header>

      <div className="logging-layout">
        <div className="log-form-card">
          <h2 className="card-title">Log Today</h2>

          <div className="log-inputs">
            <div className="log-field">
              <label className="field-label">Weight</label>
              <div className="input-wrap">
                <input
                  type="number"
                  className="log-input"
                  placeholder="0"
                  value={weight}
                  onChange={e => setWeight(e.target.value)}
                  step="0.1"
                />
                <span className="input-unit">lbs</span>
              </div>
            </div>

            <div className="log-field">
              <label className="field-label">Steps</label>
              <div className="input-wrap">
                <input
                  type="number"
                  className="log-input"
                  placeholder="0"
                  value={steps}
                  onChange={e => setSteps(e.target.value)}
                />
                <span className="input-unit">steps</span>
              </div>
            </div>
          </div>

          {steps && (
            <StepsProgressBar steps={parseInt(steps)} goal={10000} />
          )}

          {alreadyLogged && !saved && (
            <p className="already-logged-note">
              You've already logged today. Editing will update your existing entry.
            </p>
          )}

          <button
            className={`btn-accent save-btn ${saved ? 'save-btn--saved' : ''}`}
            onClick={handleSave}
            disabled={saved || (!weight && !steps)}
          >
            {saved
              ? (alreadyLogged ? '✓ Updated!' : '✓ Saved!')
              : (alreadyLogged ? "Update Today's Log" : "Save Today's Log")}
          </button>
        </div>

        <div className="log-history-card">
          <h2 className="card-title">History</h2>
          {loading ? (
            <p className="log-empty">Loading…</p>
          ) : history.length > 0 ? (
            <div className="history-table">
              <div className="table-header">
                <span>Date</span>
                <span>Weight</span>
                <span>Steps</span>
                <span>Steps Goal</span>
              </div>
              {history.map((row, i) => (
                <div key={i} className="table-row">
                  <span className="row-date">{formatDate(row.date)}</span>
                  <span className="row-weight">{row.weight ? `${row.weight} lbs` : '—'}</span>
                  <span className="row-steps">{row.steps ? row.steps.toLocaleString() : '—'}</span>
                  <span>
                    {row.steps ? (
                      <div className="mini-bar-track">
                        <div
                          className="mini-bar-fill"
                          style={{
                            width: `${Math.min((row.steps / 10000) * 100, 100)}%`,
                            background: row.steps >= 10000 ? 'var(--accent)' : 'var(--blue)'
                          }}
                        />
                      </div>
                    ) : '—'}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="log-empty">No logs yet. Start by logging today above.</p>
          )}
        </div>
      </div>
    </div>
  )
}

function StepsProgressBar({ steps, goal }) {
  const pct = Math.min((steps / goal) * 100, 100)
  const met = steps >= goal
  return (
    <div className="steps-progress">
      <div className="steps-progress-header">
        <span className="steps-progress-label">Daily step goal</span>
        <span className={`steps-progress-value ${met ? 'steps-progress-value--met' : ''}`}>
          {steps.toLocaleString()} / {goal.toLocaleString()}
        </span>
      </div>
      <div className="steps-bar-track">
        <div
          className="steps-bar-fill"
          style={{ width: `${pct}%`, background: met ? 'var(--accent)' : 'var(--blue)' }}
        />
      </div>
      {met && <p className="steps-met-msg">Goal met! 🎉</p>}
    </div>
  )
}
