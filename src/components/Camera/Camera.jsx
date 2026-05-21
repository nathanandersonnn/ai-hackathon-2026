import { useEffect, useRef, useState } from 'react'
import { createPoseSession, POSE_CONNECTIONS } from '../../lib/pose/poseDetector'
import { createTracker } from '../../lib/pose/exercises'
import { analyzeSet } from '../../lib/api/formCheck'
import './Camera.css'

const EXERCISES = ['Squat', 'Push-up', 'Deadlift', 'Bicep Curl']

export default function Camera() {
  const [active, setActive] = useState(false)
  const [exercise, setExercise] = useState('Squat')
  const [repCount, setRepCount] = useState(0)
  const [formScore, setFormScore] = useState(null)
  const [cameraError, setCameraError] = useState(null)

  const [liveAngle, setLiveAngle] = useState(null)
  const [angleLabel, setAngleLabel] = useState('')
  const [handsUp, setHandsUp] = useState({ left: false, right: false })
  const [feedback, setFeedback] = useState([])
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState(null)
  const [countdown, setCountdown] = useState(null)
  const [cameraStarting, setCameraStarting] = useState(false)
  const trackingReadyRef = useRef(false)
  const countdownTimerRef = useRef(null)
  const analyzeAbortRef = useRef(null)

  const [analyzeFrames, setAnalyzeFrames] = useState(0)
  const [analyzeSent, setAnalyzeSent] = useState(false)
  const [analyzeElapsed, setAnalyzeElapsed] = useState(0)
  const analyzeTimerRef = useRef(null)
  const analyzeStartRef = useRef(0)

  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const sessionRef = useRef(null)
  const trackerRef = useRef(null)
  const landmarksRef = useRef([])

  useEffect(() => {
    if (!active) {
      stopStream()
      return
    }

    let cancelled = false

    async function start() {
      try {
        setCameraStarting(true)
        console.log('[Camera] requesting getUserMedia')
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
        console.log('[Camera] stream acquired')

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }

        streamRef.current = stream
        const video = videoRef.current
        if (!video) return
        video.srcObject = stream

        await new Promise((resolve) => {
          if (video.readyState >= 2) resolve()
          else video.onloadedmetadata = () => resolve()
        })
        if (cancelled) return

        const canvas = canvasRef.current
        if (canvas) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
        }

        landmarksRef.current = []
        // Always create a fresh tracker so telemetryHistory and rep counts
        // are guaranteed empty at the start of every session.
        trackerRef.current?.reset?.()
        trackerRef.current = createTracker(exercise)
        trackingReadyRef.current = false
        setCameraStarting(false)
        startCountdown()
        console.log('[Camera] pose session starting')
        sessionRef.current = await createPoseSession(video, (result) => {
          const lm = result.landmarks[0]
          drawPose(canvas, lm)

          const tracker = trackerRef.current
          if (tracker && trackingReadyRef.current) {
            landmarksRef.current.push(lm)
            const out = tracker.update(lm)
            if (out.angle != null) setLiveAngle(Math.round(out.angle))
            setAngleLabel(tracker.label)
            setRepCount(out.reps)
          }

          const leftWrist = lm[15]
          const rightWrist = lm[16]
          const leftShoulder = lm[11]
          const rightShoulder = lm[12]
          const leftUp = leftWrist && leftShoulder && (leftWrist.visibility ?? 1) > 0.5 && leftWrist.y < leftShoulder.y
          const rightUp = rightWrist && rightShoulder && (rightWrist.visibility ?? 1) > 0.5 && rightWrist.y < rightShoulder.y
          setHandsUp(prev => (prev.left === leftUp && prev.right === rightUp) ? prev : { left: leftUp, right: rightUp })
        })
      } catch (err) {
        if (cancelled) return
        console.error('[Camera] start failed', err)
        setCameraError(describeCameraError(err))
        setCameraStarting(false)
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
    return () => {
      stopStream()
      stopAnalyzeTimer()
    }
  }, [])

  function startCountdown() {
    setCountdown(3)
    let n = 3
    if (countdownTimerRef.current) clearInterval(countdownTimerRef.current)
    countdownTimerRef.current = setInterval(() => {
      n -= 1
      if (n <= 0) {
        clearInterval(countdownTimerRef.current)
        countdownTimerRef.current = null
        setCountdown(null)
        trackingReadyRef.current = true
      } else {
        setCountdown(n)
      }
    }, 1000)
  }

  function stopStream() {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current)
      countdownTimerRef.current = null
    }
    trackingReadyRef.current = false
    setCountdown(null)
    setCameraStarting(false)
    if (sessionRef.current) {
      sessionRef.current.stop()
      sessionRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    const canvas = canvasRef.current
    if (canvas) {
      const ctx = canvas.getContext('2d')
      ctx?.clearRect(0, 0, canvas.width, canvas.height)
    }
  }

  function startAnalyzeTimer() {
    analyzeStartRef.current = Date.now()
    if (analyzeTimerRef.current) clearInterval(analyzeTimerRef.current)
    analyzeTimerRef.current = setInterval(() => {
      setAnalyzeElapsed((Date.now() - analyzeStartRef.current) / 1000)
    }, 100)
  }

  function stopAnalyzeTimer() {
    if (analyzeTimerRef.current) {
      clearInterval(analyzeTimerRef.current)
      analyzeTimerRef.current = null
    }
  }

  async function toggleCamera() {
    if (active) {
      const capturedExercise = exercise
      const capturedReps = repCount
      const capturedTelemetry = trackerRef.current?.getTelemetry?.() ?? []
      console.log(`[Camera] End Set: reps=${capturedReps} telemetry=${capturedTelemetry.length}`)
      setActive(false)

      if (capturedReps === 0 || capturedTelemetry.length === 0) {
        console.log('[Camera] no reps/telemetry, skipping analyze-set')
        setFeedback([])
        setFormScore(null)
        return
      }

      if (analyzeAbortRef.current) {
        analyzeAbortRef.current.abort()
      }
      const abort = new AbortController()
      analyzeAbortRef.current = abort

      setAnalyzeFrames(capturedTelemetry.length)
      setAnalyzeSent(false)
      setAnalyzeElapsed(0)
      startAnalyzeTimer()

      setAnalyzing(true)
      setAnalyzeError(null)
      setFeedback([])
      setFormScore(null)
      try {
        const result = await analyzeSet(
          {
            exercise: capturedExercise,
            reps: capturedReps,
            telemetry: capturedTelemetry,
          },
          {
            onStage: (stage) => {
              if (stage === 'sent' && !abort.signal.aborted) setAnalyzeSent(true)
            },
          },
        )
        if (abort.signal.aborted) return
        setFormScore(result.formScore)
        setFeedback(result.feedback ?? [])
      } catch (err) {
        if (abort.signal.aborted) return
        console.error('[Camera] analyzeSet failed', err)
        setAnalyzeError(err.message || 'Analysis failed')
      } finally {
        if (analyzeAbortRef.current === abort) {
          analyzeAbortRef.current = null
          setAnalyzing(false)
          stopAnalyzeTimer()
        }
      }
    } else {
      if (analyzeAbortRef.current) {
        console.log('[Camera] aborting in-flight analyzeSet for new session')
        analyzeAbortRef.current.abort()
        analyzeAbortRef.current = null
      }
      stopAnalyzeTimer()
      landmarksRef.current = []
      setCameraError(null)
      setAnalyzeError(null)
      setAnalyzing(false)
      setAnalyzeSent(false)
      setAnalyzeElapsed(0)
      setRepCount(0)
      setLiveAngle(null)
      setAngleLabel('')
      setHandsUp({ left: false, right: false })
      setFormScore(null)
      setFeedback([])
      setActive(true)
    }
  }

  const analyzeProgress = Math.min(0.96, 1 - Math.exp(-analyzeElapsed / 7))

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
            <canvas
              ref={canvasRef}
              className="camera-canvas"
              style={{ display: active ? 'block' : 'none' }}
            />

            {active && (
              <>
                <div className="live-badge">● LIVE</div>
                {cameraStarting && (
                  <div className="countdown-overlay">
                    <span className="countdown-label">Starting camera…</span>
                  </div>
                )}
                {countdown !== null && (
                  <div className="countdown-overlay">
                    <span className="countdown-number">{countdown}</span>
                    <span className="countdown-label">Get into position</span>
                  </div>
                )}
                {(handsUp.left || handsUp.right) && countdown === null && (
                  <div className="pose-test-badge">
                    ✋ {handsUp.left && handsUp.right ? 'Both hands up' : handsUp.left ? 'Left hand up' : 'Right hand up'}
                  </div>
                )}
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
              {active && liveAngle != null && angleLabel && (
                <div className="angle-readout">
                  {angleLabel}: <span>{liveAngle}°</span>
                </div>
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
              <span>Tracking your {exercise.toLowerCase()}…</span>
            </div>
          )}

          {analyzing && (
            <div className="analyze-tracker">
              <div className="analyze-tracker-head">
                <span className="analyze-tracker-title">
                  <span className="pulse-dot" />
                  Analyzing your {exercise.toLowerCase()} set
                </span>
                <span className="analyze-tracker-elapsed">{Math.floor(analyzeElapsed)}s</span>
              </div>

              <div className="analyze-bar-track">
                <div
                  className="analyze-bar-fill"
                  style={{ width: `${Math.round(analyzeProgress * 100)}%` }}
                />
              </div>

              <ul className="analyze-steps">
                <li className="analyze-step analyze-step--done">
                  <span className="analyze-step-icon">✓</span>
                  Captured telemetry for {analyzeFrames} rep{analyzeFrames === 1 ? '' : 's'}
                </li>
                <li className={`analyze-step ${analyzeSent ? 'analyze-step--done' : 'analyze-step--active'}`}>
                  <span className="analyze-step-icon">{analyzeSent ? '✓' : '⟳'}</span>
                  {analyzeSent ? 'Sent to coach' : 'Sending to coach…'}
                </li>
                <li className={`analyze-step ${analyzeSent ? 'analyze-step--active' : 'analyze-step--pending'}`}>
                  <span className="analyze-step-icon">{analyzeSent ? '⟳' : '○'}</span>
                  Groq analyzing your form
                </li>
              </ul>

              {analyzeElapsed > 12 && (
                <p className="analyze-tracker-note">
                  Taking longer than usual — analysis times out at 20s.
                </p>
              )}
            </div>
          )}

          {analyzeError && (
            <div className="feedback-item feedback-item--warn">
              <span className="feedback-icon">!</span>
              <span>{analyzeError}</span>
            </div>
          )}

          <div className="feedback-list">
            {feedback.map((f, i) => (
              <div key={i} className={`feedback-item feedback-item--${f.type}`}>
                <span className="feedback-icon">{f.type === 'good' ? '✓' : '!'}</span>
                <span>{f.text}</span>
              </div>
            ))}

            {feedback.length === 0 && !active && !analyzing && !analyzeError && (
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

function drawPose(canvas, landmarks) {
  if (!canvas || !landmarks) return
  const ctx = canvas.getContext('2d')
  const w = canvas.width
  const h = canvas.height
  ctx.clearRect(0, 0, w, h)

  ctx.strokeStyle = '#a3e635'
  ctx.lineWidth = 3
  for (const [a, b] of POSE_CONNECTIONS) {
    const p1 = landmarks[a]
    const p2 = landmarks[b]
    if (!p1 || !p2) continue
    if ((p1.visibility ?? 1) < 0.5 || (p2.visibility ?? 1) < 0.5) continue
    ctx.beginPath()
    ctx.moveTo(p1.x * w, p1.y * h)
    ctx.lineTo(p2.x * w, p2.y * h)
    ctx.stroke()
  }

  ctx.fillStyle = '#a3e635'
  for (let i = 11; i < landmarks.length; i++) {
    const p = landmarks[i]
    if (!p || (p.visibility ?? 1) < 0.5) continue
    ctx.beginPath()
    ctx.arc(p.x * w, p.y * h, 5, 0, Math.PI * 2)
    ctx.fill()
  }
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
