import { useState } from 'react'
import './Logging.css'

const HISTORY = [
  { date: 'May 15', weight: 175.2, steps: 9800 },
  { date: 'May 14', weight: 175.6, steps: 7200 },
  { date: 'May 13', weight: 174.8, steps: 11400 },
  { date: 'May 12', weight: 175.0, steps: 8600 },
  { date: 'May 11', weight: 175.4, steps: 6100 },
  { date: 'May 10', weight: 176.0, steps: 9200 },
  { date: 'May 9',  weight: 176.2, steps: 10500 },
]

export default function Logging() {
  const [weight, setWeight]   = useState('')
  const [steps, setSteps]     = useState('')
  const [saved, setSaved]     = useState(false)
  const [history, setHistory] = useState(HISTORY)

  function handleSave() {
    if (!weight && !steps) return
    const today = 'May 16'
    setHistory(prev => [{ date: today, weight: parseFloat(weight) || null, steps: parseInt(steps) || null }, ...prev])
    setWeight('')
    setSteps('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
    <div className="logging-view">
      <header className="page-header">
        <div>
          <h1 className="page-title">Daily Log</h1>
          <p className="page-subtitle">Track your weight and steps each day</p>
        </div>
        <div className="today-badge">Today — May 16</div>
      </header>

      <div className="logging-layout">
        <div className="log-form-card">
          <h2 className="card-title">Log Today</h2>

          <div className="log-inputs">
            <div className="log-field">
              <label className="field-label">
                <WeightIcon />
                Weight
              </label>
              <div className="input-wrap">
                <input
                  type="number"
                  className="log-input"
                  placeholder="175"
                  value={weight}
                  onChange={e => setWeight(e.target.value)}
                  step="0.1"
                />
                <span className="input-unit">lbs</span>
              </div>
            </div>

            <div className="log-field">
              <label className="field-label">
                <StepsIcon />
                Steps
              </label>
              <div className="input-wrap">
                <input
                  type="number"
                  className="log-input"
                  placeholder="10000"
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

          <button
            className={`btn-accent save-btn ${saved ? 'save-btn--saved' : ''}`}
            onClick={handleSave}
            disabled={saved}
          >
            {saved ? '✓ Saved!' : 'Save Today\'s Log'}
          </button>
        </div>

        <div className="log-history-card">
          <h2 className="card-title">History</h2>
          <div className="history-table">
            <div className="table-header">
              <span>Date</span>
              <span>Weight</span>
              <span>Steps</span>
              <span>Steps Goal</span>
            </div>
            {history.map((row, i) => (
              <div key={i} className="table-row">
                <span className="row-date">{row.date}</span>
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

function WeightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="3"/><path d="M6.5 8a2 2 0 0 0-1.905 2.608l1.705 5.684A3 3 0 0 0 9.169 18h5.662a3 3 0 0 0 2.87-2.119l1.704-5.683A2 2 0 0 0 17.5 8z"/>
    </svg>
  )
}

function StepsIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 5c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z"/><path d="M9 19c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2z"/>
      <path d="M15 7l-3 5-4 1 3 4-1 4"/>
    </svg>
  )
}
