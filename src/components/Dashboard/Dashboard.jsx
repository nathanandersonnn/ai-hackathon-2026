import { useState, useEffect } from 'react'
import { getDailyLogs } from '../../lib/supabase/dailyLogs'
import { getWorkoutSessions } from '../../lib/supabase/workouts'
import './Dashboard.css'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Dates in Supabase are plain YYYY-MM-DD with no zone. toISOString() converts
// to UTC first, so west of Greenwich it reports tomorrow's date all evening
// and a session logged today lands outside "this week". Read and write local
// calendar days throughout.
function localIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Same reason: `new Date('2026-08-17')` is UTC midnight, which is the previous
// evening locally. The T00:00:00 suffix pins it to local midnight.
function localDate(iso) {
  return new Date(iso + 'T00:00:00')
}

// Count the current consecutive-days-with-a-workout streak.
// If today has no session yet the streak is still alive (they just haven't
// gone yet), so we start counting from yesterday in that case.
function calcWorkoutStreak(sessions) {
  if (sessions.length === 0) return 0

  const sessionDates = new Set(sessions.map(s => s.date))
  const todayIso = localIso()

  const cursor = new Date()
  if (!sessionDates.has(todayIso)) {
    // today not done yet — start from yesterday so streak stays alive
    cursor.setDate(cursor.getDate() - 1)
  }

  let streak = 0
  while (true) {
    const iso = localIso(cursor)
    if (!sessionDates.has(iso)) break
    streak++
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

function countSets(session) {
  return session.exercises?.reduce((t, e) => t + (e.sets?.length || 0), 0) ?? 0
}

// Build a Mon→Sun array for the current week from raw daily_logs.
// `sets` drives the height of each column on the rack, so the hero of the
// page is real training volume rather than a decorative bar.
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

  const setsByDate = {}
  const labelByDate = {}
  for (const s of sessions) {
    setsByDate[s.date] = (setsByDate[s.date] ?? 0) + countSets(s)
    if (!labelByDate[s.date]) labelByDate[s.date] = s.label
  }

  return DAYS.map((label, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const iso = localIso(d)
    return {
      day: label,
      date: iso,
      steps: logsByDate[iso]?.steps ?? 0,
      workout: sessionDates.has(iso),
      sets: setsByDate[iso] ?? 0,
      title: labelByDate[iso] ?? null,
    }
  })
}

// ISO week number — lifters count in weeks of a block, so the week is the
// unit the page is titled by.
function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = t.getUTCDay() || 7
  t.setUTCDate(t.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1))
  return Math.ceil(((t - yearStart) / 86400000 + 1) / 7)
}

export default function Dashboard({ user, onSignOut, onNavigate }) {
  const [logs, setLogs]         = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location.search.includes('demo')) {
      const iso = n => { const d = new Date(); d.setDate(d.getDate() - n); return localIso(d) }
      const mk = (n, sets) => ({ sets: Array.from({ length: sets }, () => ({})) })
      setLogs([
        { date: iso(0), steps: 8420, weight: 183 }, { date: iso(1), steps: 11230, weight: 183.5 },
        { date: iso(2), steps: 6100, weight: 184 }, { date: iso(3), steps: 12800, weight: 184.2 },
        { date: iso(4), steps: 9500, weight: 185 }, { date: iso(5), steps: 4300, weight: 185.4 },
        { date: iso(6), steps: 10100, weight: 186 },
      ])
      setSessions([
        { id: 1, date: iso(0), label: 'Push A', exercises: [mk(0,4), mk(0,4), mk(0,3), mk(0,3), mk(0,4)] },
        { id: 2, date: iso(2), label: 'Pull A', exercises: [mk(0,4), mk(0,4), mk(0,3), mk(0,3)] },
        { id: 3, date: iso(3), label: 'Legs',   exercises: [mk(0,5), mk(0,4), mk(0,4), mk(0,3), mk(0,3), mk(0,3)] },
        { id: 4, date: iso(5), label: 'Push B', exercises: [mk(0,4), mk(0,3), mk(0,3)] },
      ])
      setLoading(false)
      return
    }
    Promise.all([getDailyLogs(30), getWorkoutSessions(90)])
      .then(([l, s]) => { setLogs(l); setSessions(s) })
      .catch(err => console.error('Dashboard load failed:', err))
      .finally(() => setLoading(false))
  }, [])

  const weeklyData = buildWeeklyData(logs, sessions)
  const todayIso = localIso()
  const todayLog = logs.find(l => l.date === todayIso)

  // Workouts this week = sessions whose date is >= Monday of this week
  const monday = new Date()
  monday.setDate(monday.getDate() - (monday.getDay() === 0 ? 6 : monday.getDay() - 1))
  monday.setHours(0, 0, 0, 0)
  const workoutsThisWeek = sessions.filter(s => localDate(s.date) >= monday).length

  const stats = {
    workouts: workoutsThisWeek,
    streak:   calcWorkoutStreak(sessions),
    steps:    todayLog?.steps ?? '—',
    weight:   logs.find(l => l.weight)?.weight ?? '—',
  }

  const todayIdx  = new Date().getDay() === 0 ? 6 : new Date().getDay() - 1
  const weekSets  = weeklyData.reduce((t, d) => t + d.sets, 0)
  const weekNo    = isoWeek(new Date())

  return (
    <div className="dash">
      {/* ── Status column: the answer to "am I on track?", always in view ── */}
      <section className="dash-status">
        <div className="status-head">
          <span className="eyebrow">Week {weekNo}</span>
          <span className="eyebrow">{formatRange(weeklyData)}</span>
        </div>

        <Rack days={weeklyData} todayIdx={todayIdx} loading={loading} />

        <div className="tally">
          <div className="tally-figure">
            <span className="tally-done">{stats.workouts}</span>
            <span className="tally-of">/7</span>
          </div>
          <div className="tally-meta">
            <span className="tally-label">days trained</span>
            <span className="tally-sub">
              {weekSets > 0 ? `${weekSets} sets logged` : 'nothing logged yet'}
            </span>
          </div>
        </div>

        <dl className="status-facts">
          <Fact label="Streak"  value={stats.streak} unit={stats.streak === 1 ? 'day' : 'days'} />
          <Fact label="Steps today" value={typeof stats.steps === 'number' ? stats.steps.toLocaleString() : stats.steps} unit="steps" />
          <Fact label="Weight"  value={stats.weight} unit="lbs" />
        </dl>

        {/* The primary action follows the week: train first, ask questions
            once there's something to ask about. */}
        {stats.workouts === 0 ? (
          <button className="status-cta status-cta--go" onClick={() => onNavigate?.('workouts')}>
            Start a workout
          </button>
        ) : (
          <button className="status-cta" onClick={() => onNavigate?.('chat')}>
            Open coach
          </button>
        )}

        {/* Mobile-only auth control; on desktop this lives in the sidebar. */}
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
      </section>

      {/* ── Ledger: the detail, scrolls past the status column ── */}
      <section className="dash-ledger">
        <Block label="Steps this week">
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
                  <span className="bar-label">{day[0]}</span>
                </div>
              )
            })}
          </div>
          {!loading && logs.length === 0 && (
            <Empty
              line="No steps logged this week."
              action="Log today"
              onAct={() => onNavigate?.('logging')}
            />
          )}
        </Block>

        <Block label="Body weight">
          <WeightChart logs={logs} onNavigate={onNavigate} />
        </Block>

        <Block label="Recent sessions">
          {loading ? (
            <p className="block-empty">Loading…</p>
          ) : sessions.length > 0 ? (
            <div className="session-list">
              {sessions.slice(0, 6).map(s => (
                <div key={s.id} className="session-row">
                  <span className="session-date">{formatShortDate(s.date)}</span>
                  <span className="session-name">{s.label}</span>
                  <span className="session-meta">
                    {s.exercises?.length ?? 0} ex · {countSets(s)} sets
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              line="No sessions yet."
              action="Start a workout"
              onAct={() => onNavigate?.('workouts')}
            />
          )}
        </Block>
      </section>
    </div>
  )
}

// An empty block is an invitation, not an apology: say what's missing and
// give the control that fixes it.
function Empty({ line, action, onAct }) {
  return (
    <div className="empty">
      <p className="empty-line">{line}</p>
      <button className="empty-action" onClick={onAct}>{action}</button>
    </div>
  )
}

function Block({ label, children }) {
  return (
    <div className="block">
      <h2 className="block-label">{label}</h2>
      {children}
    </div>
  )
}

function Fact({ label, value, unit }) {
  return (
    <div className="fact">
      <dt className="fact-label">{label}</dt>
      <dd className="fact-value">
        {value}<span className="fact-unit">{unit}</span>
      </dd>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// The Rack — the page's thesis.
// Seven columns, one per day. Height is sets completed, so the shape of
// the week is the shape of the work. Filled means you trained; the
// sodium outline is today.
// ──────────────────────────────────────────────────────────────
function Rack({ days, todayIdx, loading }) {
  const maxSets = Math.max(...days.map(d => d.sets), 1)

  return (
    <div className="rack" role="img" aria-label={rackSummary(days)}>
      {days.map((d, i) => {
        // A logged session with no sets still deserves presence on the rack.
        const pct = d.sets > 0 ? Math.max((d.sets / maxSets) * 100, 12)
                  : d.workout ? 12
                  : 0
        return (
          <div
            key={d.day}
            className={
              'rack-slot' +
              (d.workout ? ' rack-slot--loaded' : '') +
              (i === todayIdx ? ' rack-slot--today' : '')
            }
          >
            <div className="rack-bore">
              <div
                className="rack-load"
                style={{
                  height: loading ? '0%' : `${pct}%`,
                  transitionDelay: `${i * 45}ms`,
                }}
              />
            </div>
            <div className="rack-foot">
              <span className="rack-day">{d.day[0]}</span>
              <span className="rack-sets">{d.sets > 0 ? d.sets : '·'}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function rackSummary(days) {
  const trained = days.filter(d => d.workout)
  if (trained.length === 0) return 'No days trained this week'
  return `Trained ${trained.map(d => d.day).join(', ')} — ` +
         days.reduce((t, d) => t + d.sets, 0) + ' sets this week'
}

function formatRange(days) {
  if (days.length === 0) return ''
  const fmt = iso => localDate(iso)
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  return `${fmt(days[0].date)} – ${fmt(days[days.length - 1].date)}`
}

function formatShortDate(iso) {
  if (!iso) return ''
  return localDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatChartDate(iso) {
  if (!iso) return ''
  return localDate(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function WeightChart({ logs, onNavigate }) {
  const data = logs
    .filter(l => l.weight && l.weight > 0)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))

  if (data.length < 2) {
    return (
      <Empty
        line={data.length === 1
          ? 'One weigh-in so far. Log another day to draw the trend.'
          : 'No weigh-ins yet.'}
        action="Log weight"
        onAct={() => onNavigate?.('logging')}
      />
    )
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
        stroke="var(--accent)" strokeWidth="2"
        strokeLinejoin="round" strokeLinecap="round" />
      {/* dots */}
      {data.map((d, i) => (
        <circle key={i} cx={xScale(i)} cy={yScale(d.weight)} r="2.5" fill="var(--accent)" />
      ))}
      {/* y-axis labels */}
      <text x={PAD.left - 6} y={PAD.top + 4}        textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill="var(--text-muted)">{maxW}</text>
      <text x={PAD.left - 6} y={PAD.top + plotH + 4} textAnchor="end" fontSize="9" fontFamily="var(--font-mono)" fill="var(--text-muted)">{minW}</text>
      {/* x-axis: first and last dates */}
      <text x={PAD.left}         y={H - 6} textAnchor="start" fontSize="9" fontFamily="var(--font-mono)" fill="var(--text-muted)">{formatChartDate(data[0].date)}</text>
      <text x={W - PAD.right}    y={H - 6} textAnchor="end"   fontSize="9" fontFamily="var(--font-mono)" fill="var(--text-muted)">{formatChartDate(data[data.length - 1].date)}</text>
    </svg>
  )
}
