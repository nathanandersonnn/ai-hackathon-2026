import { useState, useEffect } from 'react'
import { getGoals, addGoal as apiAddGoal, updateGoal, getMilestones } from '../../lib/supabase/goals'
import './Goals.css'

export default function Goals() {
  const [goals, setGoals]             = useState([])
  const [milestones, setMilestones]   = useState([])
  const [loading, setLoading]         = useState(true)
  const [editing, setEditing]         = useState(null)
  const [draftTarget, setDraftTarget] = useState('')
  const [showAdd, setShowAdd]         = useState(false)
  const [newGoal, setNewGoal]         = useState({ label: '', icon: '🎯', current: '', target: '', unit: 'lbs', direction: 'up', color: 'accent' })

  useEffect(() => {
    Promise.all([getGoals(), getMilestones()])
      .then(([g, m]) => { setGoals(g); setMilestones(m) })
      .catch(err => console.error('Failed to load goals:', err))
      .finally(() => setLoading(false))
  }, [])

  function startEdit(goal) {
    setEditing(goal.id)
    setDraftTarget(String(goal.target))
  }

  async function saveEdit(id) {
    const target = parseFloat(draftTarget)
    if (isNaN(target)) { setEditing(null); return }
    try {
      const updated = await updateGoal(id, { target })
      setGoals(prev => prev.map(g => g.id === id ? updated : g))
    } catch (err) {
      console.error('Update failed:', err)
    } finally {
      setEditing(null)
    }
  }

  async function addGoal() {
    if (!newGoal.label || !newGoal.target) return
    try {
      const created = await apiAddGoal({
        ...newGoal,
        current: parseFloat(newGoal.current) || 0,
        target:  parseFloat(newGoal.target),
      })
      setGoals(prev => [...prev, created])
      setNewGoal({ label: '', icon: '🎯', current: '', target: '', unit: 'lbs', direction: 'up', color: 'accent' })
      setShowAdd(false)
    } catch (err) {
      console.error('Add goal failed:', err)
      alert('Could not save goal — check console.')
    }
  }

  return (
    <div className="goals-view">
      <header className="page-header">
        <div>
          <h1 className="page-title">Goals & Milestones</h1>
          <p className="page-subtitle">Track your targets and celebrate wins</p>
        </div>
        <button className="btn-accent" onClick={() => setShowAdd(s => !s)}>
          {showAdd ? 'Cancel' : '+ Add Goal'}
        </button>
      </header>

      <div className="goals-layout">
        <div className="goals-section">
          <h2 className="section-title">Active Goals</h2>

          {showAdd && (
            <div className="add-goal-card">
              <div className="add-goal-row">
                <input className="goal-input" placeholder="Goal name (e.g. Target Weight)"
                  value={newGoal.label} onChange={e => setNewGoal(g => ({ ...g, label: e.target.value }))} />
                <input className="goal-input goal-input--sm" placeholder="Icon" maxLength={2}
                  value={newGoal.icon} onChange={e => setNewGoal(g => ({ ...g, icon: e.target.value }))} />
              </div>
              <div className="add-goal-row">
                <input className="goal-input" type="number" placeholder="Current value"
                  value={newGoal.current} onChange={e => setNewGoal(g => ({ ...g, current: e.target.value }))} />
                <input className="goal-input" type="number" placeholder="Target value"
                  value={newGoal.target} onChange={e => setNewGoal(g => ({ ...g, target: e.target.value }))} />
                <input className="goal-input goal-input--sm" placeholder="Unit"
                  value={newGoal.unit} onChange={e => setNewGoal(g => ({ ...g, unit: e.target.value }))} />
              </div>
              <div className="add-goal-row">
                <label className="goal-radio-label">
                  Direction:
                  {['up', 'down'].map(d => (
                    <button key={d}
                      className={`toggle-btn ${newGoal.direction === d ? 'toggle-btn--active' : ''}`}
                      onClick={() => setNewGoal(g => ({ ...g, direction: d }))}>
                      {d === 'up' ? '↑ Increase' : '↓ Decrease'}
                    </button>
                  ))}
                </label>
              </div>
              <button className="btn-accent" onClick={addGoal}>Save Goal</button>
            </div>
          )}

          {goals.length === 0 && !showAdd ? (
            <p className="goals-empty">No goals set yet. Hit "+ Add Goal" to create one.</p>
          ) : (
            <div className="goals-list">
              {goals.map(goal => {
                const progressPct = goal.direction === 'down'
                  ? Math.max(0, 100 - ((goal.current - goal.target) / Math.max(1, goal.current - goal.target + 1)) * 100)
                  : Math.min(100, (goal.current / goal.target) * 100)
                const met = goal.direction === 'down' ? goal.current <= goal.target : goal.current >= goal.target

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
                        <span className="goal-current-val">{Number(goal.current).toLocaleString()}</span>
                        <span className="goal-unit">{goal.unit}</span>
                      </div>
                      <div className="goal-arrow">{goal.direction === 'down' ? '↓' : '↑'}</div>
                      <div className="goal-target">
                        {editing === goal.id ? (
                          <div className="inline-edit">
                            <input className="inline-input" value={draftTarget}
                              onChange={e => setDraftTarget(e.target.value)} type="number" autoFocus />
                            <button className="inline-save" onClick={() => saveEdit(goal.id)}>Save</button>
                          </div>
                        ) : (
                          <>
                            <span className="goal-target-val">{Number(goal.target).toLocaleString()}</span>
                            <span className="goal-unit">{goal.unit}</span>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="goal-progress">
                      <div className="goal-bar-track">
                        <div className={`goal-bar-fill goal-bar-fill--${goal.color}`}
                          style={{ width: `${progressPct}%` }} />
                      </div>
                      <span className="goal-pct">{Math.round(progressPct)}%</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="milestones-section">
          <h2 className="section-title">Milestones</h2>
          {milestones.length === 0 ? (
            <p className="goals-empty" style={{ padding: '12px 0' }}>
              Milestones will appear as you hit your goals.
            </p>
          ) : (
            <div className="milestones-list">
              {milestones.map((m, i) => (
                <div key={i} className={`milestone-row ${m.earned ? 'milestone-row--earned' : ''}`}>
                  <div className="milestone-icon">{m.earned ? '🏅' : '○'}</div>
                  <div className="milestone-body">
                    <span className="milestone-label">{m.label}</span>
                    {m.earned && <span className="milestone-date">Earned {m.date}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
