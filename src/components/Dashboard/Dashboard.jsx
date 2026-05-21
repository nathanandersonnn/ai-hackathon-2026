import { useState, useEffect } from 'react'
import { getDailyLogs } from '../../lib/supabase/dailyLogs'
import { getWorkoutSessions } from '../../lib/supabase/workouts'
import './Dashboard.css'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Count the current consecutive-days-with-a-workout streak.
// If today has no session yet the streak is still alive (they just haven't
// gone yet), so we start counting from yesterday in that case.
function calcWorkoutStreak(sessions) {
  if (sessions.length === 0) return 0

  const sessionDates = new Set(sessions.map(s => s.date))
  const todayIso = new Date().toISOString().slice(0, 10)

  const cursor = new Date()
  if (!sessionDates.has(todayIso)) {
    // today not done yet — start from yesterday so streak stays alive
    cursor.setDate(cursor.getDate() - 1)
  }

  let streak = 0
  while (true) {
    const iso = cursor.toISOString().slice(0, 10)
    if (!sessionDates.has(iso)) break
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

// Build a Mon→Sun array for the current week from raw daily_logs.
function buildWeeklyData(logs, sessions) {
  const today = new Date()
  // Start at Monday of this week
  const day = today.getDay() // 0 (Sun) – 6 (Sat)
  const offsetFromMon = day === 0 ? 6 : day - 1
  const monday = new Date(today)
  monday.setDate(today.getDate() - offsetFromMon)
  monday.setHours(0, 0, 0, 0)

  const sessionDates = new Set(sessions.map(s => s.date))
  const logsByDate = Object.fromEntries(logs.map(l => [l.date, l]))

  return DAYS.map((label, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const iso = d.toISOString().slice(0, 10)
    return {
      day: label,
      steps: logsByDate[iso]?.steps ?? 0,
      workout: sessionDates.has(iso),
    }
  })
}

export default function Dashboard({ user, onSignOut, onNavigate }) {
  const [logs, setLogs]         = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    Promise.all([getDailyLogs(30), getWorkoutSessions(90)])
      .then(([l, s]) => { setLogs(l); setSessions(s) })
      .catch(err => console.error('Dashboard load failed:', err))
      .finally(() => setLoading(false))
  }, [])

  const weeklyData = buildWeeklyData(logs, sessions)
  const todayIso = new Date().toISOString().slice(0, 10)
  const todayLog = logs.find(l => l.date === todayIso)

  // Workouts this week = sessions whose date is >= Monday of this week
  const monday = new Date()
  monday.setDate(monday.getDate() - (monday.getDay() === 0 ? 6 : monday.getDay() - 1))
  monday.setHours(0, 0, 0, 0)
  const workoutsThisWeek = sessions.filter(s => new Date(s.date) >= monday).length

  const stats = {
    workouts: workoutsThisWeek,
    streak:   calcWorkoutStreak(sessions),
    steps:    todayLog?.steps ?? '—',
    weight:   logs.find(l => l.weight)?.weight ?? '—',
  }

  return (
    <div className="dashboard">
      <header className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Your progress at a glance</p>
        </div>
      </header>

      <div className="stats-row">
        <StatCard label="Workouts this week" value={stats.workouts}        unit="this week" color="accent" />
        <StatCard label="Workout streak"      value={stats.streak}          unit={stats.streak === 1 ? 'day' : 'days'} color="blue" />
<StatCard label="Today's steps"       value={typeof stats.steps === 'number' ? stats.steps.toLocaleString() : stats.steps} unit="steps" color="orange" />
        <StatCard label="Weight"              value={stats.weight}          unit="lbs"       color="red" />
      </div>

      <div className="dashboard-grid">
        <div className="card steps-card">
          <h2 className="card-title">Steps This Week</h2>
          <div className="bar-chart">
            {weeklyData.map(({ day, steps, workout }) => {
              const max = Math.max(...weeklyData.map(d => d.steps), 1)
              return (
                <div key={day} className="bar-col">
                  <div className="bar-wrap">
                    <div
                      className={`bar ${workout ? 'bar--workout' : ''}`}
                      style={{ height: `${(steps / max) * 100}%` }}
                    />
                  </div>
                  <span className="bar-label">{day}</span>
                </div>
              )
            })}
          </div>
          {!loading && logs.length === 0 && (
            <p className="card-empty">Start logging daily steps to see your chart.</p>
          )}
        </div>

        <div className="card weight-chart-card">
          <h2 className="card-title">Weight Trend</h2>
          <WeightChart logs={logs} />
        </div>

        <div className="card sessions-card">
          <h2 className="card-title">Recent Sessions</h2>
          {loading ? (
            <p className="card-empty">Loading…</p>
          ) : sessions.length > 0 ? (
            <div className="session-list">
              {sessions.slice(0, 5).map(s => {
                const exCount = s.exercises?.length ?? 0
                const setCount = s.exercises?.reduce((t, e) => t + (e.sets?.length || 0), 0) ?? 0
                return (
                  <div key={s.id} className="session-row">
                    <div className="session-left">
                      <span className="session-date">{formatShortDate(s.date)}</span>
                      <span className="session-name">{s.label}</span>
                      <span className="session-meta">{exCount} ex · {setCount} sets</span>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="card-empty">No sessions logged yet. Head to Workouts to get started.</p>
          )}
        </div>

        <div className="card coach-card">
          <h2 className="card-title">Coach Says</h2>
          <div className="coach-bubble">
            <p>Head to the AI Coach tab to start a conversation. Once you've logged workouts and daily data, your coach will reference it automatically.</p>
            <p className="coach-sub">What are we working on today?</p>
          </div>
          <button className="btn-accent">Open Chat</button>
        </div>
      </div>

      {/* Mobile-only auth CTA, sized to match the cards above */}
      <div className="dashboard-mobile-auth">
        {user ? (
          <button className="dashboard-auth-btn dashboard-auth-btn--signout" onClick={onSignOut}>
            Sign out
          </button>
        ) : (
          <button className="dashboard-auth-btn dashboard-auth-btn--signin" onClick={() => onNavigate?.('auth')}>
            Sign in
          </button>
        )}
      </div>
    </div>
  )
}

function formatShortDate(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatChartDate(iso) {
  if (!iso) return ''
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function WeightChart({ logs }) {
  const data = logs
    .filter(l => l.weight && l.weight > 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))

  if (data.length < 2) {
    return <p className="card-empty">Log weight for 2+ days to see your trend.</p>
  }

  const weights = data.map(l => l.weight)
  const minW    = Math.min(...weights)
  const maxW    = Math.max(...weights)
  const range   = maxW - minW || 1

  const W = 400, H = 140
  const PAD = { top: 16, right: 16, bottom: 28, left: 44 }
  const plotW = W - PAD.left - PAD.right
  const plotH = H - PAD.top  - PAD.bottom

  const xScale = i => PAD.left + (i / Math.max(data.length - 1, 1)) * plotW
  const yScale = w => PAD.top  + plotH - ((w - minW) / range) * plotH

  const polyPoints = data.map((d, i) => `${xScale(i)},${yScale(d.weight)}`).join(' ')

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', overflow: 'visible' }}>
      {/* grid lines */}
      {[0, 0.5, 1].map(f => (
        <line key={f}
          x1={PAD.left} x2={W - PAD.right}
          y1={PAD.top + (1 - f) * plotH} y2={PAD.top + (1 - f) * plotH}
          stroke="var(--border)" strokeWidth="1"
          strokeDasharray={f === 0.5 ? '4 4' : ''} />
      ))}
      {/* trend line */}
      <polyline points={polyPoints} fill="none"
        stroke="var(--accent)" strokeWidth="2.5"
        strokeLinejoin="round" strokeLinecap="round" />
      {/* dots */}
      {data.map((d, i) => (
        <circle key={i} cx={xScale(i)} cy={yScale(d.weight)} r="3.5" fill="var(--accent)" />
      ))}
      {/* y-axis labels */}
      <text x={PAD.left - 6} y={PAD.top + 4}        textAnchor="end" fontSize="10" fill="var(--text-muted)">{maxW} lbs</text>
      <text x={PAD.left - 6} y={PAD.top + plotH + 4} textAnchor="end" fontSize="10" fill="var(--text-muted)">{minW} lbs</text>
      {/* x-axis: first and last dates */}
      <text x={PAD.left}         y={H - 6} textAnchor="start" fontSize="10" fill="var(--text-muted)">{formatChartDate(data[0].date)}</text>
      <text x={W - PAD.right}    y={H - 6} textAnchor="end"   fontSize="10" fill="var(--text-muted)">{formatChartDate(data[data.length - 1].date)}</text>
    </svg>
  )
}

function StatCard({ label, value, unit, color }) {
  return (
    <div className={`stat-card stat-card--${color}`}>
      <div className="stat-value">{value}</div>
      <div className="stat-unit">{unit}</div>
      <div className="stat-label">{label}</div>
    </div>
  )
}
