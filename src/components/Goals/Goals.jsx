import { useState } from 'react'
import './Goals.css'

const DEFAULT_GOALS = [
  {
    id: 1,
    label: 'Target Weight',
    icon: '⚖️',
    current: 175,
    target: 165,
    unit: 'lbs',
    direction: 'down',
    color: 'orange',
  },
  {
    id: 2,
    label: 'Weekly Workouts',
    icon: '🏋️',
    current: 4,
    target: 5,
    unit: 'sessions',
    direction: 'up',
    color: 'accent',
  },
  {
    id: 3,
    label: 'Daily Steps',
    icon: '👟',
    current: 8600,
    target: 10000,
    unit: 'steps',
    direction: 'up',
    color: 'blue',
  },
]

const MILESTONES = [
  { label: '5-day workout streak', earned: true,  date: 'May 14' },
  { label: 'Hit 10k steps in a day', earned: true,  date: 'May 13' },
  { label: 'Squat form score > 90', earned: false, date: null },
  { label: '10 workouts this month', earned: false, date: null },
  { label: 'Reach 170 lbs', earned: false, date: null },
]

export default function Goals() {
  const [goals, setGoals] = useState(DEFAULT_GOALS)
  const [editing, setEditing] = useState(null)
  const [draftTarget, setDraftTarget] = useState('')

  function startEdit(goal) {
    setEditing(goal.id)
    setDraftTarget(String(goal.target))
  }

  function saveEdit(id) {
    setGoals(prev => prev.map(g =>
      g.id === id ? { ...g, target: parseFloat(draftTarget) || g.target } : g
    ))
    setEditing(null)
  }

  return (
    <div className="goals-view">
      <header className="page-header">
        <div>
          <h1 className="page-title">Goals & Milestones</h1>
          <p className="page-subtitle">Track your targets and celebrate wins</p>
        </div>
      </header>

      <div className="goals-layout">
        <div className="goals-section">
          <h2 className="section-title">Active Goals</h2>
          <div className="goals-list">
            {goals.map(goal => {
              const pct = goal.direction === 'down'
                ? Math.max(0, Math.min(100, ((goal.current - goal.target) / (175 - goal.target + 1)) * 100))
                : Math.min(100, (goal.current / goal.target) * 100)

              const progressPct = goal.direction === 'down'
                ? Math.max(0, 100 - ((goal.current - goal.target) / Math.max(1, 175 - goal.target)) * 100)
                : Math.min(100, (goal.current / goal.target) * 100)

              const met = goal.direction === 'down'
                ? goal.current <= goal.target
                : goal.current >= goal.target

              return (
                <div key={goal.id} className={`goal-card goal-card--${goal.color}`}>
                  <div className="goal-header">
                    <div className="goal-title-row">
                      <span className="goal-icon">{goal.icon}</span>
                      <span className="goal-label">{goal.label}</span>
                      {met && <span className="goal-met-badge">✓ Met</span>}
                    </div>
                    <button className="goal-edit-btn" onClick={() => startEdit(goal)}>Edit</button>
                  </div>

                  <div className="goal-values">
                    <div className="goal-current">
                      <span className="goal-current-val">{goal.current.toLocaleString()}</span>
                      <span className="goal-unit">{goal.unit}</span>
                    </div>
                    <div className="goal-arrow">{goal.direction === 'down' ? '↓' : '↑'}</div>
                    <div className="goal-target">
                      {editing === goal.id ? (
                        <div className="inline-edit">
                          <input
                            className="inline-input"
                            value={draftTarget}
                            onChange={e => setDraftTarget(e.target.value)}
                            type="number"
                            autoFocus
                          />
                          <button className="inline-save" onClick={() => saveEdit(goal.id)}>Save</button>
                        </div>
                      ) : (
                        <>
                          <span className="goal-target-val">{goal.target.toLocaleString()}</span>
                          <span className="goal-unit">{goal.unit}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="goal-progress">
                    <div className="goal-bar-track">
                      <div
                        className={`goal-bar-fill goal-bar-fill--${goal.color}`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <span className="goal-pct">{Math.round(progressPct)}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="milestones-section">
          <h2 className="section-title">Milestones</h2>
          <div className="milestones-list">
            {MILESTONES.map((m, i) => (
              <div key={i} className={`milestone-row ${m.earned ? 'milestone-row--earned' : ''}`}>
                <div className="milestone-icon">{m.earned ? '🏅' : '○'}</div>
                <div className="milestone-body">
                  <span className="milestone-label">{m.label}</span>
                  {m.earned && <span className="milestone-date">Earned {m.date}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
