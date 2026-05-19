import { useEffect, useRef, useState } from 'react'
import './Camera.css'

const EXERCISES = ['Squat', 'Push-up', 'Deadlift', 'Lunge']

const MOCK_FEEDBACK = [
  { type: 'warn',  text: 'Knees tracking slightly inward — push them out over your toes' },
  { type: 'good',  text: 'Good squat depth — hitting parallel consistently' },
  { type: 'good',  text: 'Back is neutral throughout the movement' },
  { type: 'warn',  text: 'Heels rising slightly at the bottom — work on ankle mobility' },
]

export default function Camera() {
  const [active, setActive] = useState(false)
  const [exercise, setExercise] = useState('Squat')
  const [repCount, setRepCount] = useState(0)
  const [formScore, setFormScore] = useState(null)
  const [cameraError, setCameraError] = useState(null)

  const videoRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    if (!active) {
      stopStream()
      return
    }

    let cancelled = false

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }

        streamRef.current = stream
        if (videoRef.current) {
          videoRef.current.srcObject = stream
        }
      } catch (err) {
        if (cancelled) return
        setCameraError(describeCameraError(err))
        setActive(false)
      }
    }

    start()

    return () => {
      cancelled = true
      stopStream()
    }
  }, [active])

  useEffect(() => {
    return () => stopStream()
  }, [])

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
  }

  function toggleCamera() {
    if (active) {
      setActive(false)
      setFormScore(Math.floor(Math.random() * 20) + 78)
    } else {
      setCameraError(null)
      setRepCount(0)
      setFormScore(null)
      setActive(true)
    }
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
            <video
              ref={videoRef}
              className="camera-video"
              autoPlay
              playsInline
              muted
              style={{ display: active ? 'block' : 'none' }}
            />

            {active && (
              <>
                <div className="live-badge">● LIVE</div>
                <div className="rep-overlay">
                  <span className="rep-number">{repCount}</span>
                  <span className="rep-label">reps</span>
                </div>
              </>
            )}

            {!active && (
              <div className="camera-placeholder">
                <CameraOffIcon />
                <p>{cameraError ? cameraError : 'Camera is off'}</p>
                <p className="placeholder-sub">
                  {cameraError ? 'Check permissions and try again' : 'Press Start to begin your session'}
                </p>
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
            {(formScore !== null || active) && MOCK_FEEDBACK.map((f, i) => (
              <div key={i} className={`feedback-item feedback-item--${f.type}`}>
                <span className="feedback-icon">{f.type === 'good' ? '✓' : '!'}</span>
                <span>{f.text}</span>
              </div>
            ))}

            {formScore === null && !active && (
              <p className="feedback-empty">Start a session to see real-time form feedback here.</p>
            )}
          </div>

          {formScore !== null && (
            <div className="post-session">
              <p className="post-title">Set Complete</p>
              <p className="post-sub">{exercise} · {repCount} reps · Score: {formScore}/100</p>
              <button className="btn-accent" style={{ marginTop: 12 }}>Save to Log</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function describeCameraError(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera permission denied'
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera found on this device'
    case 'NotReadableError':
      return 'Camera is in use by another app'
    default:
      return 'Could not start camera'
  }
}

function ScoreBar({ score }) {
  const color = score >= 90 ? 'var(--accent)' : score >= 75 ? 'var(--blue)' : 'var(--orange)'
  return (
    <div className="score-bar-track">
      <div className="score-bar-fill" style={{ width: `${score}%`, background: color }} />
    </div>
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
