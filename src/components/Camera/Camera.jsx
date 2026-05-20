import { useState } from 'react'
import './Camera.css'

const EXERCISES = ['Squat', 'Push-up', 'Deadlift', 'Lunge']

// TODO: feedback will come from the form-check API after a set is analyzed

export default function Camera() {
  const [active, setActive] = useState(false)
  const [exercise, setExercise] = useState('Squat')
  const [repCount, setRepCount] = useState(0)
  const [formScore, setFormScore] = useState(null)
  const [weight, setWeight] = useState('')
  const [weightUnit, setWeightUnit] = useState('lbs')
  const [setLog, setSetLog] = useState([])
  const [feedback, setFeedback] = useState([]) // TODO: populate from form-check API after a set ends

  function toggleCamera() {
    if (active) {
      setActive(false)
      setFormScore(Math.floor(Math.random() * 20) + 78)
    } else {
      setActive(true)
      setRepCount(0)
      setFormScore(null)
    }
  }

  function saveSet() {
    if (formScore === null) return
    setSetLog(prev => [...prev, {
      exercise,
      reps: repCount,
      weight: weight ? `${weight} ${weightUnit}` : '—',
      score: formScore,
    }])
    setFormScore(null)
    setRepCount(0)
    setWeight('')
  }

  function simulateRep() {
    setRepCount(r => r + 1)
  }

  return (
    <div className="camera-view">
      <header className="page-header">
        <div>
          <h1 className="page-title">Form Check</h1>
          <p className="page-subtitle">Point your camera at yourself and get live feedback</p>
        </div>
      </header>

      <div className="camera-layout">
        <div className="camera-panel">
          <div className={`camera-feed ${active ? 'camera-feed--active' : ''}`}>
            {active ? (
              <>
                <div className="skeleton-overlay">
                  <SkeletonFigure />
                </div>
                <div className="live-badge">● LIVE</div>
                <div className="rep-overlay">
                  <span className="rep-number">{repCount}</span>
                  <span className="rep-label">reps</span>
                </div>
              </>
            ) : (
              <div className="camera-placeholder">
                <CameraOffIcon />
                <p>Camera is off</p>
                <p className="placeholder-sub">Press Start to begin your session</p>
              </div>
            )}
          </div>

          <div className="camera-controls">
            <div className="exercise-pills">
              {EXERCISES.map(ex => (
                <button
                  key={ex}
                  className={`exercise-pill ${exercise === ex ? 'exercise-pill--active' : ''}`}
                  onClick={() => setExercise(ex)}
                >
                  {ex}
                </button>
              ))}
            </div>

            <div className="weight-row">
              <input
                className="weight-input"
                type="number"
                placeholder="Weight"
                value={weight}
                onChange={e => setWeight(e.target.value)}
                disabled={active}
              />
              <button
                className={`unit-toggle ${weightUnit === 'lbs' ? 'unit-toggle--active' : ''}`}
                onClick={() => setWeightUnit('lbs')}
                disabled={active}
              >lbs</button>
              <button
                className={`unit-toggle ${weightUnit === 'kg' ? 'unit-toggle--active' : ''}`}
                onClick={() => setWeightUnit('kg')}
                disabled={active}
              >kg</button>
            </div>

            <div className="control-btns">
              {active && (
                <button className="btn-secondary" onClick={simulateRep}>
                  + Rep
                </button>
              )}
              <button
                className={active ? 'btn-stop' : 'btn-accent'}
                onClick={toggleCamera}
              >
                {active ? 'End Set' : 'Start Session'}
              </button>
            </div>
          </div>
        </div>

        <div className="feedback-panel">
          <h2 className="panel-title">Feedback</h2>

          {formScore !== null && (
            <div className="form-score-card">
              <span className="form-score-label">Form Score</span>
              <span className="form-score-value">{formScore}</span>
              <ScoreBar score={formScore} />
            </div>
          )}

          {active && (
            <div className="live-status">
              <div className="pulse-dot" />
              <span>Analyzing your {exercise.toLowerCase()}…</span>
            </div>
          )}

          <div className="feedback-list">
            {feedback.map((f, i) => (
              <div key={i} className={`feedback-item feedback-item--${f.type}`}>
                <span className="feedback-icon">{f.type === 'good' ? '✓' : '!'}</span>
                <span>{f.text}</span>
              </div>
            ))}

            {feedback.length === 0 && (
              <p className="feedback-empty">
                {active ? 'Collecting data…' : 'Start a session to see real-time form feedback here.'}
              </p>
            )}
          </div>

          {formScore !== null && (
            <div className="post-session">
              <p className="post-title">Set Complete</p>
              <p className="post-sub">
                {exercise} · {repCount} reps
                {weight ? ` · ${weight} ${weightUnit}` : ''} · Score: {formScore}/100
              </p>
              <button className="btn-accent" style={{ marginTop: 12 }} onClick={saveSet}>
                Save Set
              </button>
            </div>
          )}

          {setLog.length > 0 && (
            <div className="set-log">
              <p className="set-log-title">Session Log</p>
              <div className="set-log-table">
                <div className="set-log-header">
                  <span>Exercise</span>
                  <span>Reps</span>
                  <span>Weight</span>
                  <span>Score</span>
                </div>
                {setLog.map((s, i) => (
                  <div key={i} className="set-log-row">
                    <span>{s.exercise}</span>
                    <span>{s.reps}</span>
                    <span>{s.weight}</span>
                    <ScorePill score={s.score} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ScorePill({ score }) {
  const color = score >= 90 ? 'var(--accent)' : score >= 75 ? 'var(--blue)' : 'var(--orange)'
  return (
    <span style={{
      fontSize: 12, fontWeight: 700, color,
      fontFamily: 'var(--font-display)',
    }}>{score}</span>
  )
}

function ScoreBar({ score }) {
  const color = score >= 90 ? 'var(--accent)' : score >= 75 ? 'var(--blue)' : 'var(--orange)'
  return (
    <div className="score-bar-track">
      <div className="score-bar-fill" style={{ width: `${score}%`, background: color }} />
    </div>
  )
}

function SkeletonFigure() {
  return (
    <svg className="skeleton-svg" viewBox="0 0 200 360" fill="none">
      <circle cx="100" cy="40" r="22" stroke="#a3e635" strokeWidth="2.5" strokeDasharray="4 2" />
      <line x1="100" y1="62" x2="100" y2="160" stroke="#a3e635" strokeWidth="2.5" />
      <line x1="100" y1="85" x2="50" y2="130" stroke="#a3e635" strokeWidth="2.5" />
      <line x1="50" y1="130" x2="45" y2="175" stroke="#a3e635" strokeWidth="2" />
      <line x1="100" y1="85" x2="150" y2="130" stroke="#a3e635" strokeWidth="2.5" />
      <line x1="150" y1="130" x2="155" y2="175" stroke="#a3e635" strokeWidth="2" />
      <line x1="100" y1="160" x2="72" y2="235" stroke="#a3e635" strokeWidth="2.5" />
      <line x1="72" y1="235" x2="68" y2="310" stroke="#a3e635" strokeWidth="2.5" />
      <line x1="100" y1="160" x2="128" y2="235" stroke="#a3e635" strokeWidth="2.5" />
      <line x1="128" y1="235" x2="132" y2="310" stroke="#a3e635" strokeWidth="2.5" />
      {[50,150,45,155,72,128,68,132].map((_, i) => null)}
      {[[50,130],[150,130],[45,175],[155,175],[72,235],[128,235],[68,310],[132,310],[100,160]].map(([x,y], i) => (
        <circle key={i} cx={x} cy={y} r="4" fill="#a3e635" opacity="0.9" />
      ))}
    </svg>
  )
}

function CameraOffIcon() {
  return (
    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="1" y1="1" x2="23" y2="23"/>
      <path d="M21 21H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3m3-3h6l2 3h4a2 2 0 0 1 2 2v9.34m-7.72-2.06A4 4 0 1 1 7.72 7.72"/>
    </svg>
  )
}
