import './Dashboard.css'

const WEEKLY_DATA = [
  { day: 'Mon', steps: 8200, workout: true },
  { day: 'Tue', steps: 6100, workout: false },
  { day: 'Wed', steps: 11400, workout: true },
  { day: 'Thu', steps: 9800, workout: true },
  { day: 'Fri', steps: 7300, workout: false },
  { day: 'Sat', steps: 12500, workout: true },
  { day: 'Sun', steps: 4200, workout: false },
]

const RECENT_SESSIONS = [
  { date: 'Today',      exercise: 'Squats',    sets: 4, reps: 10, score: 87 },
  { date: 'Wed',        exercise: 'Push-ups',  sets: 3, reps: 15, score: 92 },
  { date: 'Mon',        exercise: 'Deadlifts', sets: 3, reps: 8,  score: 74 },
]

const maxSteps = Math.max(...WEEKLY_DATA.map(d => d.steps))

export default function Dashboard() {
  return (
    <div className="dashboard">
      <header className="page-header">
        <div>
          <h1 className="page-title">Good morning, Nathan 👋</h1>
          <p className="page-subtitle">Friday, May 16 · Here's your progress this week</p>
        </div>
        <div className="header-badge">
          <span className="streak-flame">🔥</span>
          <span className="streak-count">5</span>
          <span className="streak-label">day streak</span>
        </div>
      </header>

      <div className="stats-row">
        <StatCard label="Workouts this week" value="4" unit="/ 5 goal" color="accent" />
        <StatCard label="Avg form score"      value="84" unit="/ 100"  color="blue" />
        <StatCard label="Today's steps"       value="7,300" unit="/ 10k goal" color="purple" />
        <StatCard label="Weight"              value="175" unit="lbs"   color="orange" />
      </div>

      <div className="dashboard-grid">
        <div className="card steps-card">
          <h2 className="card-title">Steps This Week</h2>
          <div className="bar-chart">
            {WEEKLY_DATA.map(({ day, steps, workout }) => (
              <div key={day} className="bar-col">
                <div className="bar-wrap">
                  <div
                    className={`bar ${workout ? 'bar--workout' : ''}`}
                    style={{ height: `${(steps / maxSteps) * 100}%` }}
                  />
                </div>
                <span className="bar-label">{day}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card sessions-card">
          <h2 className="card-title">Recent Sessions</h2>
          <div className="session-list">
            {RECENT_SESSIONS.map((s, i) => (
              <div key={i} className="session-row">
                <div className="session-left">
                  <span className="session-date">{s.date}</span>
                  <span className="session-name">{s.exercise}</span>
                  <span className="session-meta">{s.sets}×{s.reps}</span>
                </div>
                <ScorePill score={s.score} />
              </div>
            ))}
          </div>
        </div>

        <div className="card coach-card">
          <h2 className="card-title">Coach Says</h2>
          <div className="coach-bubble">
            <p>
              Nice work this week! You've hit 4 of your 5 workout days with an 84 avg form score.
              Your squat depth has improved since Monday — keep that knee tracking focus for today's session.
            </p>
            <p className="coach-sub">Feeling up for legs today, or should we plan something lighter?</p>
          </div>
          <button className="btn-accent">Open Chat</button>
        </div>
      </div>
    </div>
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

function ScorePill({ score }) {
  const color = score >= 90 ? 'green' : score >= 75 ? 'blue' : 'orange'
  return <span className={`score-pill score-pill--${color}`}>{score}</span>
}
