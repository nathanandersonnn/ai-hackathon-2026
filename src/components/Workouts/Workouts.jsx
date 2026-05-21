import { useState, useEffect, useRef } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { EXERCISE_LIBRARY, MUSCLE_GROUPS } from './exerciseLibrary'
import { getWorkoutSessions, saveWorkoutSession, updateWorkoutSession, deleteWorkoutSession } from '../../lib/supabase/workouts'
import { getWorkoutTemplates, saveWorkoutTemplate, deleteWorkoutTemplate } from '../../lib/supabase/workoutTemplates'
import './Workouts.css'

// Epley 1RM estimate: weight × (1 + reps / 30). Returns 0 for unweighted/empty sets.
function epley1RM(reps, weight) {
  const r = Number(reps) || 0
  const w = Number(weight) || 0
  if (r <= 0 || w <= 0) return 0
  return w * (1 + r / 30)
}

// Highest estimated 1RM across all sets of a single exercise instance.
function sessionMax1RM(exercise) {
  return Math.max(0, ...(exercise?.sets ?? []).map(s => epley1RM(s.reps, s.weight)))
}

// ── Suggested workout templates ──────────────────────────────
const WORKOUT_TEMPLATES = [
  {
    id: 'home-fast',
    label: 'Fast At Home',
    icon: '🏠',
    tag: '20 min',
    color: 'accent',
    description: 'No equipment needed. High intensity, full body burn.',
    exercises: [
      { name: 'Jump Squats',       sets: 3, reps: '4-8' },
      { name: 'Push-ups',          sets: 3, reps: '4-8' },
      { name: 'Mountain Climbers', sets: 3, reps: '4-8' },
      { name: 'Glute Bridges',     sets: 3, reps: '4-8' },
      { name: 'Plank',             sets: 3, reps: '45s' },
      { name: 'Burpees',           sets: 3, reps: '4-8' },
    ],
  },
  {
    id: 'gym-fast',
    label: 'Fast In The Gym',
    icon: '⚡',
    tag: '30 min',
    color: 'blue',
    description: 'Compound lifts only. In and out, no fluff.',
    exercises: [
      { name: 'Barbell Squat',     sets: 3, reps: '4-8' },
      { name: 'Bench Press',       sets: 3, reps: '4-8' },
      { name: 'Barbell Row',       sets: 3, reps: '4-8' },
      { name: 'Overhead Press',    sets: 2, reps: '4-8' },
      { name: 'Romanian Deadlift', sets: 2, reps: '4-8' },
    ],
  },
  {
    id: 'full-body',
    label: 'Full Body',
    icon: '💪',
    tag: 'Full body',
    color: 'orange',
    description: 'High-variety one-set push: hit every major group in a single session.',
    exercises: [
      { name: 'Lat Pull Downs',              sets: 1, reps: '4-8' },
      { name: 'Kelso Shrug',                 sets: 1, reps: '4-8' },
      { name: 'Single Leg Extensions',       sets: 2, reps: '4-8' },
      { name: 'Lying Leg Curl',              sets: 1, reps: '4-8' },
      { name: 'Cable Flies',                 sets: 1, reps: '4-8' },
      { name: 'Crunches w/ Weight',          sets: 1, reps: '4-8' },
      { name: 'Preacher Curl',               sets: 1, reps: '4-8' },
      { name: 'Single Arm Tricep Extension', sets: 1, reps: '4-8' },
      { name: 'Leg Press',                   sets: 1, reps: '4-8' },
      { name: 'Close Grip Lat Pulldown',     sets: 1, reps: '4-8' },
      { name: 'Shoulder Press',              sets: 1, reps: '4-8' },
      { name: 'Calf Raise',                  sets: 1, reps: '4-8' },
    ],
  },
  {
    id: 'upper-day',
    label: 'Upper Day',
    icon: '🔁',
    tag: 'Upper / Lower',
    color: 'purple',
    description: 'Pull, push, and shoulders. Pairs with Lower Day on the next session.',
    exercises: [
      { name: 'Lat Pull Downs',              sets: 2, reps: '4-8' },
      { name: 'Close Grip Lat Pulldown',     sets: 1, reps: '4-8' },
      { name: 'Shoulder Press',              sets: 2, reps: '4-8' },
      { name: 'Single Arm Tricep Extension', sets: 1, reps: '4-8' },
      { name: 'Smith Machine Bench',         sets: 2, reps: '4-8' },
      { name: 'DB Bicep Curls',              sets: 1, reps: '4-8' },
      { name: 'Kelso Shrug',                 sets: 2, reps: '4-8' },
    ],
  },
  {
    id: 'lower-day',
    label: 'Lower Day',
    icon: '🦵',
    tag: 'Upper / Lower',
    color: 'purple',
    description: 'Quads, hamstrings, glutes, calves, and core. Pairs with Upper Day.',
    exercises: [
      { name: 'Single Leg Extensions',       sets: 2, reps: '4-8' },
      { name: 'Lying Leg Curl',              sets: 2, reps: '4-8' },
      { name: 'Leg Press',                   sets: 2, reps: '4-8' },
      { name: 'Calf Raise',                  sets: 2, reps: '4-8' },
      { name: 'Hip Thrust',                  sets: 1, reps: '4-8' },
      { name: 'Crunches w/ Weight',          sets: 1, reps: '4-8' },
    ],
  },
  {
    id: 'cardio',
    label: 'Cardio',
    icon: '🏃',
    tag: 'Endurance',
    color: 'red',
    description: 'Steady state, intervals, or a mix.',
    exercises: [
      { name: 'Warm-up walk/jog',  sets: 1, reps: '5 min' },
      { name: 'Steady-state run',  sets: 1, reps: '20 min' },
      { name: 'Sprint intervals',  sets: 6, reps: '20s' },
      { name: 'Cool-down walk',    sets: 1, reps: '5 min' },
    ],
  },
]

// TODO: fetch workout history from Supabase workout_sessions table

// ── Empty set / exercise builders ────────────────────────────
const emptySet = () => ({ reps: '', weight: '' })
const emptyExercise = () => ({ name: '', sets: [emptySet()] })

function formatHistoryDate(isoDate) {
  if (!isoDate) return ''
  const d = new Date(isoDate + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function templateToLogSession(template) {
  return {
    label: template.label,
    exercises: template.exercises.map(ex => ({
      name: ex.name,
      sets: Array.from({ length: ex.sets }, () => emptySet()),
    })),
  }
}

function historyToLogSession(entry) {
  return {
    label: entry.label,
    exercises: entry.exercises.map(ex => ({
      name: ex.name,
      sets: ex.sets.map(s => ({ reps: String(s.reps), weight: String(s.weight) })),
    })),
  }
}

// ── Main component ───────────────────────────────────────────
export default function Workouts() {
  const [tab, setTab] = useState('browse')           // 'browse' | 'history' | 'log'
  const [openCard, setOpenCard] = useState(null)
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [userTemplates, setUserTemplates] = useState([])
  const [showCreatePreset, setShowCreatePreset] = useState(false)
  const [expandedHistory, setExpandedHistory] = useState(null)
  const [historyExerciseFocus, setHistoryExerciseFocus] = useState(null) // name of exercise to drill into from History tab
  const [editingId, setEditingId] = useState(null)   // id of history row being edited inline
  const [editDraft, setEditDraft] = useState(null)   // { label, exercises } draft for the edit
  const [editPickerOpen, setEditPickerOpen] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [session, setSession] = useState(null)       // active log session

  useEffect(() => {
    getWorkoutSessions()
      .then(setHistory)
      .catch(err => console.error('Failed to load workouts:', err))
      .finally(() => setHistoryLoading(false))

    getWorkoutTemplates()
      .then(setUserTemplates)
      .catch(err => console.error('Failed to load presets:', err))
  }, [])

  async function handleCreatePreset(template) {
    try {
      const saved = await saveWorkoutTemplate(template)
      setUserTemplates(prev => [saved, ...prev])
      setShowCreatePreset(false)
    } catch (err) {
      console.error('Save preset failed:', err)
      alert('Could not save preset — check console.')
    }
  }

  async function handleDeletePreset(id) {
    if (!confirm('Delete this preset? This cannot be undone.')) return
    try {
      await deleteWorkoutTemplate(id)
      setUserTemplates(prev => prev.filter(t => t.id !== id))
      if (openCard === id) setOpenCard(null)
    } catch (err) {
      console.error('Delete preset failed:', err)
      alert('Could not delete preset — check console.')
    }
  }

  function startFromTemplate(template) {
    setSession(templateToLogSession(template))
    setTab('log')
  }

  function startFromHistory(entry) {
    setSession(historyToLogSession(entry))
    setTab('log')
  }

  function startBlank() {
    setSession({ label: '', exercises: [emptyExercise()] })
    setTab('log')
  }

  function startEdit(entry) {
    setEditingId(entry.id)
    setEditDraft({
      label: entry.label,
      exercises: entry.exercises.map(ex => ({
        name: ex.name,
        sets: ex.sets.map(s => ({ reps: String(s.reps ?? ''), weight: String(s.weight ?? '') })),
      })),
    })
    setExpandedHistory(entry.id)
  }

  function cancelEdit() {
    setEditingId(null)
    setEditDraft(null)
    setEditPickerOpen(false)
  }

  async function saveEdit() {
    if (!editDraft || editSaving) return
    const cleaned = {
      label: editDraft.label || 'Workout',
      exercises: editDraft.exercises
        .filter(ex => ex.name.trim())
        .map(ex => ({
          name: ex.name,
          sets: ex.sets
            .filter(s => s.reps)
            .map(s => ({ reps: Number(s.reps) || 0, weight: Number(s.weight) || 0 })),
        })),
    }
    setEditSaving(true)
    try {
      const updated = await updateWorkoutSession(editingId, cleaned)
      setHistory(prev => prev.map(s => s.id === editingId ? updated : s))
      cancelEdit()
    } catch (err) {
      console.error('Update workout failed:', err)
      alert('Could not save changes — check console.')
    } finally {
      setEditSaving(false)
    }
  }

  async function handleDeleteSession(id) {
    if (!confirm('Delete this workout from your history? This cannot be undone.')) return
    try {
      await deleteWorkoutSession(id)
      setHistory(prev => prev.filter(s => s.id !== id))
      if (expandedHistory === id) setExpandedHistory(null)
    } catch (err) {
      console.error('Delete failed:', err)
      alert('Could not delete workout — check console.')
    }
  }

  async function saveSession() {
    const cleaned = {
      label: session.label || 'Workout',
      exercises: session.exercises
        .filter(ex => ex.name.trim())
        .map(ex => ({
          name: ex.name,
          sets: ex.sets
            .filter(s => s.reps)
            .map(s => ({ reps: Number(s.reps) || 0, weight: Number(s.weight) || 0 })),
        })),
    }
    try {
      const saved = await saveWorkoutSession(cleaned)
      setHistory(prev => [saved, ...prev])
      setSession(null)
      setTab('history')
    } catch (err) {
      console.error('Save workout failed:', err)
      alert('Could not save workout — check console.')
    }
  }

  return (
    <div className="workouts-view">
      <header className="page-header">
        <div>
          <h1 className="page-title">Workouts</h1>
          <p className="page-subtitle">Browse, log, and track your training</p>
        </div>
        {tab !== 'log' && (
          <button className="btn-accent" onClick={startBlank}>+ Log Workout</button>
        )}
      </header>

      <div className="workouts-tabs">
        {[['browse', 'Browse'], ['history', 'History'], ['log', 'Log Session']].map(([id, label]) => (
          (id !== 'log' || tab === 'log') && (
            <button
              key={id}
              className={`workouts-tab ${tab === id ? 'workouts-tab--active' : ''}`}
              onClick={() => { if (id !== 'log') setTab(id) }}
            >
              {label}
            </button>
          )
        ))}
      </div>

      {/* ── BROWSE ── */}
      {tab === 'browse' && (
        <div className="workout-cards">
          <button className="create-preset-btn" onClick={() => setShowCreatePreset(true)}>
            + Create Your Own Preset
          </button>

          {[...userTemplates, ...WORKOUT_TEMPLATES].map(w => {
            const isCustom = !!w.user_id
            const color = w.color || 'accent'
            return (
              <div key={w.id} className={`workout-card workout-card--${color} ${openCard === w.id ? 'workout-card--open' : ''}`}>
                <div className="workout-card-header-row">
                  <button className="workout-card-header" onClick={() => setOpenCard(openCard === w.id ? null : w.id)}>
                    <div className="workout-card-left">
                      <span className="workout-icon">{w.icon || '🎯'}</span>
                      <div className="workout-title-block">
                        <span className="workout-label">{w.label}</span>
                        {w.description && <span className="workout-desc">{w.description}</span>}
                      </div>
                    </div>
                    <div className="workout-card-right">
                      {w.tag && <span className={`workout-tag workout-tag--${color}`}>{w.tag}</span>}
                      {isCustom && <span className="workout-custom-badge">Custom</span>}
                      <ChevronIcon open={openCard === w.id} />
                    </div>
                  </button>
                  {isCustom && (
                    <button
                      className="history-delete-btn workout-delete-btn"
                      onClick={() => handleDeletePreset(w.id)}
                      title="Delete this preset"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {openCard === w.id && (
                  <div className="workout-body">
                    <div className="exercise-table">
                      <div className="ex-table-header">
                        <span>Exercise</span><span>Sets</span><span>Reps / Time</span>
                      </div>
                      {(w.exercises ?? []).map((ex, i) => (
                        <div key={i} className="ex-row">
                          <span className="ex-name">{ex.name}</span>
                          <span className="ex-sets">{ex.sets}</span>
                          <span className="ex-reps">{ex.reps}</span>
                        </div>
                      ))}
                    </div>
                    <div className="workout-actions">
                      <button className="btn-accent" onClick={() => startFromTemplate(w)}>Start Session</button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {showCreatePreset && (
        <CreatePresetModal
          onSave={handleCreatePreset}
          onClose={() => setShowCreatePreset(false)}
        />
      )}

      {/* ── HISTORY ── */}
      {tab === 'history' && (
        <div className="history-list">
          {historyLoading && (
            <p className="empty-state">Loading…</p>
          )}
          {!historyLoading && history.length === 0 && (
            <p className="empty-state">No workouts logged yet. Hit "+ Log Workout" to start.</p>
          )}
          {history.map(entry => (
            <div key={entry.id} className={`history-card ${expandedHistory === entry.id ? 'history-card--open' : ''}`}>
              <button className="history-card-header" onClick={() => setExpandedHistory(expandedHistory === entry.id ? null : entry.id)}>
                <div className="history-card-left">
                  <span className="history-label">{entry.label}</span>
                  <span className="history-meta">
                    {formatHistoryDate(entry.date)} · {entry.exercises.length} exercise{entry.exercises.length !== 1 ? 's' : ''}
                    {' · '}{entry.exercises.reduce((t, e) => t + e.sets.length, 0)} sets
                  </span>
                </div>
                <div className="history-card-right">
                  <button
                    className="btn-ghost repeat-btn"
                    onClick={e => { e.stopPropagation(); startFromHistory(entry) }}
                  >
                    Repeat
                  </button>
                  <button
                    className="btn-ghost repeat-btn"
                    onClick={e => { e.stopPropagation(); startEdit(entry) }}
                    title="Edit this workout"
                  >
                    Edit
                  </button>
                  <button
                    className="history-delete-btn"
                    onClick={e => { e.stopPropagation(); handleDeleteSession(entry.id) }}
                    title="Delete this workout"
                  >
                    ✕
                  </button>
                  <ChevronIcon open={expandedHistory === entry.id} />
                </div>
              </button>

              {expandedHistory === entry.id && editingId === entry.id && editDraft ? (
                <HistoryEditBody
                  draft={editDraft}
                  onChange={setEditDraft}
                  onSave={saveEdit}
                  onCancel={cancelEdit}
                  onOpenPicker={() => setEditPickerOpen(true)}
                  saving={editSaving}
                />
              ) : expandedHistory === entry.id && (
                <div className="history-body">
                  {entry.exercises.map((ex, ei) => (
                    <div key={ei} className="history-exercise">
                      <p
                        className="history-ex-name history-ex-name--clickable"
                        onClick={() => setHistoryExerciseFocus(ex.name)}
                        title="View progression chart and 1RM history"
                      >
                        {ex.name}
                      </p>
                      <div className="history-sets-table">
                        <div className="history-sets-header">
                          <span>Set</span><span>Reps</span><span>Weight</span>
                        </div>
                        {ex.sets.map((s, si) => (
                          <div key={si} className="history-set-row">
                            <span className="set-num">{si + 1}</span>
                            <span>{s.reps} reps</span>
                            <span>{s.weight ? `${s.weight} lbs` : '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editPickerOpen && (
        <ExercisePicker
          onSelect={name => {
            setEditDraft(d => ({ ...d, exercises: [...d.exercises, { name, sets: [emptySet()] }] }))
            setEditPickerOpen(false)
          }}
          onClose={() => setEditPickerOpen(false)}
        />
      )}

      {historyExerciseFocus && (
        <ExerciseHistoryModal
          exerciseName={historyExerciseFocus}
          history={history}
          onClose={() => setHistoryExerciseFocus(null)}
        />
      )}

      {/* ── LOG SESSION ── */}
      {tab === 'log' && session && (
        <LogSession
          session={session}
          onChange={setSession}
          onSave={saveSession}
          onCancel={() => { setSession(null); setTab('browse') }}
          history={history}
        />
      )}
    </div>
  )
}

// ── Progressive overload check ───────────────────────────────
// Returns true when the named exercise shows no weight increase across the
// last 3 sessions that included it (only fires when there are ≥3 sessions).
function checkProgression(exerciseName, history) {
  if (!exerciseName.trim()) return false
  const name = exerciseName.toLowerCase().trim()
  const relevant = history
    .filter(s => s.exercises?.some(e => e.name.toLowerCase().trim() === name))
    .slice(0, 3) // history is already newest-first
  if (relevant.length < 3) return false
  // Max weight per session; index 0 = most recent, 2 = oldest
  const maxWeights = relevant.map(s => {
    const ex = s.exercises.find(e => e.name.toLowerCase().trim() === name)
    return Math.max(0, ...(ex?.sets?.map(st => Number(st.weight) || 0) ?? [0]))
  })
  return maxWeights[0] > 0 && maxWeights[0] <= maxWeights[2]
}

// ── Web Audio beep ───────────────────────────────────────────
function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.frequency.value = 880; osc.type = 'sine'
    gain.gain.setValueAtTime(0.3, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.5)
  } catch (e) { console.warn('Beep failed:', e) }
}

// ── Editable body for a history card (in-place edit) ─────────
function HistoryEditBody({ draft, onChange, onSave, onCancel, onOpenPicker, saving }) {
  function updateLabel(val) {
    onChange(d => ({ ...d, label: val }))
  }
  function updateExerciseName(ei, val) {
    onChange(d => {
      const exercises = [...d.exercises]
      exercises[ei] = { ...exercises[ei], name: val }
      return { ...d, exercises }
    })
  }
  function updateSet(ei, si, field, val) {
    onChange(d => {
      const exercises = [...d.exercises]
      const sets = [...exercises[ei].sets]
      sets[si] = { ...sets[si], [field]: val }
      exercises[ei] = { ...exercises[ei], sets }
      return { ...d, exercises }
    })
  }
  function addSet(ei) {
    onChange(d => {
      const exercises = [...d.exercises]
      exercises[ei] = { ...exercises[ei], sets: [...exercises[ei].sets, emptySet()] }
      return { ...d, exercises }
    })
  }
  function removeSet(ei, si) {
    onChange(d => {
      const exercises = [...d.exercises]
      const sets = exercises[ei].sets.filter((_, i) => i !== si)
      exercises[ei] = { ...exercises[ei], sets }
      return { ...d, exercises }
    })
  }
  function removeExercise(ei) {
    onChange(d => ({ ...d, exercises: d.exercises.filter((_, i) => i !== ei) }))
  }

  return (
    <div className="history-body history-body--edit">
      <input
        className="log-title-input"
        placeholder="Workout name"
        value={draft.label}
        onChange={e => updateLabel(e.target.value)}
      />

      <div className="log-exercises">
        {draft.exercises.map((ex, ei) => (
          <div key={ei} className="log-exercise-card">
            <div className="log-ex-header">
              <input
                className="log-ex-name-input"
                placeholder="Exercise name"
                value={ex.name}
                onChange={e => updateExerciseName(ei, e.target.value)}
              />
              {draft.exercises.length > 1 && (
                <button className="remove-ex-btn" onClick={() => removeExercise(ei)}>Remove</button>
              )}
            </div>

            <div className="log-sets-table">
              <div className="log-sets-header">
                <span>Set</span>
                <span>Reps</span>
                <span>Weight (lbs)</span>
                <span />
              </div>
              {ex.sets.map((s, si) => (
                <div key={si} className="log-set-row log-set-row--edit">
                  <span className="log-set-num">{si + 1}</span>
                  <input
                    className="log-set-input"
                    type="number"
                    placeholder="—"
                    value={s.reps}
                    onChange={e => updateSet(ei, si, 'reps', e.target.value)}
                  />
                  <input
                    className="log-set-input"
                    type="number"
                    placeholder="—"
                    value={s.weight}
                    onChange={e => updateSet(ei, si, 'weight', e.target.value)}
                  />
                  <button
                    className="remove-set-btn"
                    onClick={() => removeSet(ei, si)}
                    disabled={ex.sets.length === 1}
                  >×</button>
                </div>
              ))}
            </div>

            <button className="add-set-btn" onClick={() => addSet(ei)}>+ Add Set</button>
          </div>
        ))}
      </div>

      <button className="add-exercise-btn" onClick={onOpenPicker}>+ Add Exercise</button>

      <div className="log-session-actions">
        <button className="btn-ghost" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="btn-accent" onClick={onSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}

// ── Log Session sub-component ────────────────────────────────
function LogSession({ session, onChange, onSave, onCancel, history = [] }) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [historyForEx, setHistoryForEx] = useState(null)
  const [timer, setTimer] = useState({ active: false, seconds: 90, target: 90, paused: false })
  const intervalRef = useRef(null)

  useEffect(() => {
    if (timer.active && !timer.paused) {
      intervalRef.current = setInterval(() => {
        setTimer(t => {
          if (t.seconds <= 1) {
            clearInterval(intervalRef.current)
            playBeep()
            return { ...t, active: false, seconds: 0 }
          }
          return { ...t, seconds: t.seconds - 1 }
        })
      }, 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [timer.active, timer.paused])

  function startRestTimer() {
    setTimer(t => ({ ...t, active: true, seconds: t.target, paused: false }))
  }
  function pauseTimer()   { setTimer(t => ({ ...t, paused: !t.paused })) }
  function resetTimer()   { setTimer(t => ({ ...t, seconds: t.target, paused: false })) }
  function dismissTimer() { clearInterval(intervalRef.current); setTimer(t => ({ ...t, active: false })) }
  function setTimerTarget(val) {
    const n = Math.max(10, Math.min(600, parseInt(val) || 90))
    setTimer(t => ({ ...t, target: n, seconds: n, active: false }))
  }

  function updateLabel(val) {
    onChange(s => ({ ...s, label: val }))
  }

  function updateExerciseName(ei, val) {
    onChange(s => {
      const exercises = [...s.exercises]
      exercises[ei] = { ...exercises[ei], name: val }
      return { ...s, exercises }
    })
  }

  function updateSet(ei, si, field, val) {
    onChange(s => {
      const exercises = [...s.exercises]
      const sets = [...exercises[ei].sets]
      sets[si] = { ...sets[si], [field]: val }
      exercises[ei] = { ...exercises[ei], sets }
      return { ...s, exercises }
    })
  }

  function addSet(ei) {
    onChange(s => {
      const exercises = [...s.exercises]
      exercises[ei] = { ...exercises[ei], sets: [...exercises[ei].sets, emptySet()] }
      return { ...s, exercises }
    })
  }

  function removeSet(ei, si) {
    onChange(s => {
      const exercises = [...s.exercises]
      const sets = exercises[ei].sets.filter((_, i) => i !== si)
      exercises[ei] = { ...exercises[ei], sets }
      return { ...s, exercises }
    })
  }

  function addExercise(name) {
    onChange(s => ({ ...s, exercises: [...s.exercises, { name, sets: [emptySet()] }] }))
  }

  function removeExercise(ei) {
    onChange(s => ({ ...s, exercises: s.exercises.filter((_, i) => i !== ei) }))
  }

  return (
    <>
      {pickerOpen && (
        <ExercisePicker
          onSelect={name => { addExercise(name); setPickerOpen(false) }}
          onClose={() => setPickerOpen(false)}
        />
      )}

      {historyForEx && (
        <ExerciseHistoryModal
          exerciseName={historyForEx}
          history={history}
          onClose={() => setHistoryForEx(null)}
        />
      )}

      {timer.active && (
        <div
          className="rest-timer-overlay"
          onClick={e => e.target === e.currentTarget && dismissTimer()}
        >
          <div className="rest-timer-popup">
            <div className="rest-timer-popup-header">
              <span className="rest-timer-label">Rest Timer</span>
              <button className="picker-close" onClick={dismissTimer} title="Dismiss">✕</button>
            </div>
            <div className="rest-timer-popup-time">
              {String(Math.floor(timer.seconds / 60)).padStart(2, '0')}:{String(timer.seconds % 60).padStart(2, '0')}
            </div>
            <div className="rest-timer-popup-track">
              <div className="rest-timer-fill" style={{ width: `${(timer.seconds / timer.target) * 100}%` }} />
            </div>
            <div className="rest-timer-popup-controls">
              <button className="btn-ghost" onClick={pauseTimer}>
                {timer.paused ? '▶ Resume' : '⏸ Pause'}
              </button>
              <button className="btn-ghost" onClick={resetTimer}>↺ Reset</button>
              <button className="btn-accent" onClick={dismissTimer}>Done</button>
            </div>
          </div>
        </div>
      )}

      <div className="log-session">
        <div className="log-session-header">
          <input
            className="log-title-input"
            placeholder="Workout name (e.g. Push Day)"
            value={session.label}
            onChange={e => updateLabel(e.target.value)}
          />
        </div>

        <div className="log-exercises">
          {session.exercises.map((ex, ei) => (
            <div key={ei} className="log-exercise-card">
              <div className="log-ex-header">
                <input
                  className="log-ex-name-input"
                  placeholder="Exercise name"
                  value={ex.name}
                  onChange={e => updateExerciseName(ei, e.target.value)}
                />
                <button
                  className="ex-history-btn"
                  onClick={() => setHistoryForEx(ex.name)}
                  disabled={!ex.name.trim()}
                  title="View this exercise's history"
                >
                  History
                </button>
                {session.exercises.length > 1 && (
                  <button className="remove-ex-btn" onClick={() => removeExercise(ei)}>Remove</button>
                )}
              </div>
              {checkProgression(ex.name, history) && (
                <p className="progression-warning">
                  ⚠️ No weight progression in last 3 sessions — consider increasing weight
                </p>
              )}

              <div className="log-sets-table">
                <div className="log-sets-header">
                  <span>Set</span>
                  <span>Reps</span>
                  <span>Weight (lbs)</span>
                  <span />
                  <span />
                </div>
                {ex.sets.map((s, si) => (
                  <div key={si} className="log-set-row">
                    <span className="log-set-num">{si + 1}</span>
                    <input
                      className="log-set-input"
                      type="number"
                      placeholder="—"
                      value={s.reps}
                      onChange={e => updateSet(ei, si, 'reps', e.target.value)}
                    />
                    <input
                      className="log-set-input"
                      type="number"
                      placeholder="—"
                      value={s.weight}
                      onChange={e => updateSet(ei, si, 'weight', e.target.value)}
                    />
                    <button
                      className="rest-set-btn"
                      onClick={startRestTimer}
                      title={`Start ${timer.target}s rest timer`}
                    >⏱</button>
                    <button
                      className="remove-set-btn"
                      onClick={() => removeSet(ei, si)}
                      disabled={ex.sets.length === 1}
                    >×</button>
                  </div>
                ))}
              </div>

              <button className="add-set-btn" onClick={() => addSet(ei)}>+ Add Set</button>
            </div>
          ))}
        </div>

        <button className="add-exercise-btn" onClick={() => setPickerOpen(true)}>+ Add Exercise</button>

        <div className="rest-timer-config">
          <span className="rest-timer-config-label">⏱ Rest duration:</span>
          <input
            type="number"
            className="rest-timer-config-input"
            value={timer.target}
            min="10"
            max="600"
            onChange={e => setTimerTarget(e.target.value)}
          />
          <span className="rest-timer-config-label">s</span>
        </div>

        <div className="log-session-actions">
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
          <button className="btn-accent" onClick={onSave}>Save Workout</button>
        </div>
      </div>
    </>
  )
}

// ── Exercise Picker modal ────────────────────────────────────
function ExercisePicker({ onSelect, onClose }) {
  const [search, setSearch] = useState('')
  const [muscle, setMuscle] = useState('All')
  const [customName, setCustomName] = useState('')
  const [showCustom, setShowCustom] = useState(false)

  const filtered = EXERCISE_LIBRARY.filter(ex => {
    const matchesMuscle = muscle === 'All' || ex.muscle === muscle
    const matchesSearch = ex.name.toLowerCase().includes(search.toLowerCase())
    return matchesMuscle && matchesSearch
  })

  // Group by muscle for display
  const grouped = filtered.reduce((acc, ex) => {
    if (!acc[ex.muscle]) acc[ex.muscle] = []
    acc[ex.muscle].push(ex)
    return acc
  }, {})

  return (
    <div className="picker-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="picker-modal">
        <div className="picker-header">
          <h2 className="picker-title">Add Exercise</h2>
          <button className="picker-close" onClick={onClose}>✕</button>
        </div>

        <div className="picker-search-wrap">
          <SearchIcon />
          <input
            className="picker-search"
            placeholder="Search exercises…"
            value={search}
            onChange={e => { setSearch(e.target.value); setShowCustom(false) }}
            autoFocus
          />
          {search && (
            <button className="picker-clear" onClick={() => setSearch('')}>✕</button>
          )}
        </div>

        <div className="picker-muscle-pills">
          {MUSCLE_GROUPS.map(g => (
            <button
              key={g}
              className={`muscle-pill ${muscle === g ? 'muscle-pill--active' : ''}`}
              onClick={() => setMuscle(g)}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="picker-list">
          {Object.entries(grouped).map(([group, exercises]) => (
            <div key={group} className="picker-group">
              <p className="picker-group-label">{group}</p>
              {exercises.map(ex => (
                <button
                  key={ex.name}
                  className="picker-exercise-row"
                  onClick={() => onSelect(ex.name)}
                >
                  {ex.name}
                </button>
              ))}
            </div>
          ))}

          {filtered.length === 0 && (
            <p className="picker-empty">No matches for "{search}"</p>
          )}
        </div>

        <div className="picker-custom">
          {showCustom ? (
            <div className="custom-input-row">
              <input
                className="custom-name-input"
                placeholder="Exercise name…"
                value={customName}
                onChange={e => setCustomName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && customName.trim() && onSelect(customName.trim())}
                autoFocus
              />
              <button
                className="btn-accent"
                onClick={() => customName.trim() && onSelect(customName.trim())}
                disabled={!customName.trim()}
              >
                Add
              </button>
              <button className="btn-ghost" onClick={() => setShowCustom(false)}>Cancel</button>
            </div>
          ) : (
            <button className="custom-trigger" onClick={() => setShowCustom(true)}>
              + Create custom exercise
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Create Preset modal ──────────────────────────────────────
const PRESET_COLORS = ['accent', 'blue', 'purple', 'orange', 'red']

function CreatePresetModal({ onSave, onClose }) {
  const [draft, setDraft] = useState({
    label: '',
    icon: '🎯',
    tag: 'Custom',
    color: 'accent',
    description: '',
    exercises: [],
  })
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  function update(field, val) {
    setDraft(d => ({ ...d, [field]: val }))
  }

  function addExercise(name) {
    setDraft(d => ({ ...d, exercises: [...d.exercises, { name, sets: 3, reps: '4-8' }] }))
    setPickerOpen(false)
  }

  function updateExercise(i, field, val) {
    setDraft(d => {
      const exercises = [...d.exercises]
      exercises[i] = { ...exercises[i], [field]: val }
      return { ...d, exercises }
    })
  }

  function removeExercise(i) {
    setDraft(d => ({ ...d, exercises: d.exercises.filter((_, idx) => idx !== i) }))
  }

  async function handleSave() {
    if (!draft.label.trim() || draft.exercises.length === 0) return
    setSaving(true)
    await onSave({
      label: draft.label.trim(),
      icon: draft.icon.trim() || '🎯',
      tag: draft.tag.trim() || 'Custom',
      color: draft.color,
      description: draft.description.trim(),
      exercises: draft.exercises.map(ex => ({
        name: ex.name,
        sets: Math.max(1, parseInt(ex.sets) || 1),
        reps: String(ex.reps || '').trim() || '4-8',
      })),
    })
    setSaving(false)
  }

  return (
    <>
      {pickerOpen && (
        <ExercisePicker onSelect={addExercise} onClose={() => setPickerOpen(false)} />
      )}

      <div className="picker-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="picker-modal create-preset-modal">
          <div className="picker-header">
            <h2 className="picker-title">Create Preset</h2>
            <button className="picker-close" onClick={onClose}>✕</button>
          </div>

          <div className="create-preset-body">
            <div className="preset-row">
              <input
                className="log-ex-name-input"
                placeholder="Preset name (e.g. My Push Day)"
                value={draft.label}
                onChange={e => update('label', e.target.value)}
                autoFocus
              />
              <input
                className="log-ex-name-input preset-icon-input"
                placeholder="Icon"
                maxLength={2}
                value={draft.icon}
                onChange={e => update('icon', e.target.value)}
              />
            </div>

            <input
              className="log-ex-name-input"
              placeholder="Short description (optional)"
              value={draft.description}
              onChange={e => update('description', e.target.value)}
            />

            <div className="preset-row">
              <input
                className="log-ex-name-input"
                placeholder="Tag (e.g. 30 min, Custom)"
                value={draft.tag}
                onChange={e => update('tag', e.target.value)}
              />
              <div className="preset-color-pills">
                {PRESET_COLORS.map(c => (
                  <button
                    key={c}
                    className={`preset-color preset-color--${c} ${draft.color === c ? 'preset-color--active' : ''}`}
                    onClick={() => update('color', c)}
                    title={c}
                  />
                ))}
              </div>
            </div>

            <p className="picker-group-label" style={{ padding: '8px 0 0', textAlign: 'left' }}>Exercises</p>

            {draft.exercises.length === 0 && (
              <p className="picker-empty" style={{ padding: '12px 0' }}>
                No exercises yet — tap "+ Add Exercise" below.
              </p>
            )}

            <div className="preset-exercise-list">
              {draft.exercises.map((ex, i) => (
                <div key={i} className="preset-exercise-row">
                  <span className="preset-ex-name">{ex.name}</span>
                  <input
                    className="log-set-input preset-sets-input"
                    type="number"
                    min="1"
                    value={ex.sets}
                    onChange={e => updateExercise(i, 'sets', e.target.value)}
                    title="Sets"
                  />
                  <input
                    className="log-set-input preset-reps-input"
                    value={ex.reps}
                    onChange={e => updateExercise(i, 'reps', e.target.value)}
                    placeholder="4-8"
                    title="Reps or time"
                  />
                  <button className="remove-set-btn" onClick={() => removeExercise(i)}>×</button>
                </div>
              ))}
            </div>

            <button className="add-exercise-btn" onClick={() => setPickerOpen(true)}>
              + Add Exercise
            </button>
          </div>

          <div className="create-preset-actions">
            <button className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
            <button
              className="btn-accent"
              onClick={handleSave}
              disabled={saving || !draft.label.trim() || draft.exercises.length === 0}
            >
              {saving ? 'Saving…' : 'Save Preset'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ── Exercise History modal ───────────────────────────────────
function ExerciseHistoryModal({ exerciseName, history, onClose }) {
  const name = exerciseName.toLowerCase().trim()
  // newest-first, matches how `history` arrives from Supabase
  const entries = history
    .map(s => {
      const exercise = s.exercises?.find(e => e.name.toLowerCase().trim() === name)
      return exercise ? { id: s.id, label: s.label, date: s.date, exercise } : null
    })
    .filter(Boolean)

  // Epley-based stats. Only sessions with a non-zero 1RM contribute.
  const weightedEntries = entries.filter(e => sessionMax1RM(e.exercise) > 0)
  const currentOneRM = weightedEntries[0] ? sessionMax1RM(weightedEntries[0].exercise) : 0
  const bestOneRM    = Math.max(0, ...weightedEntries.map(e => sessionMax1RM(e.exercise)))

  // Chart data is oldest → newest for a left-to-right time axis.
  const chartData = [...weightedEntries].reverse().map(e => ({
    date: e.date,
    label: formatHistoryDate(e.date),
    oneRM: Math.round(sessionMax1RM(e.exercise)),
  }))

  return (
    <div className="picker-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="picker-modal">
        <div className="picker-header">
          <h2 className="picker-title">{exerciseName} — History</h2>
          <button className="picker-close" onClick={onClose}>✕</button>
        </div>

        <div className="ex-history-body">
          {entries.length === 0 ? (
            <p className="picker-empty">No previous sessions logged for "{exerciseName}".</p>
          ) : (
            <>
              {weightedEntries.length > 0 && (
                <div className="one-rm-stats">
                  <div className="one-rm-stat">
                    <span className="one-rm-label">Current 1RM</span>
                    <span className="one-rm-value">{Math.round(currentOneRM)} lbs</span>
                  </div>
                  <div className="one-rm-stat">
                    <span className="one-rm-label">Best Ever</span>
                    <span className="one-rm-value one-rm-value--best">{Math.round(bestOneRM)} lbs</span>
                  </div>
                </div>
              )}

              {chartData.length >= 2 && (
                <div className="one-rm-chart-wrap">
                  <p className="one-rm-chart-title">Estimated 1RM over time</p>
                  <ResponsiveContainer width="100%" height={180}>
                    <LineChart data={chartData} margin={{ top: 8, right: 12, left: -8, bottom: 0 }}>
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
                        axisLine={{ stroke: 'var(--border)' }}
                        tickLine={false}
                        width={36}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--bg-surface)',
                          border: '1px solid var(--border-light)',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        labelStyle={{ color: 'var(--text-muted)' }}
                        formatter={(value) => [`${value} lbs`, '1RM']}
                      />
                      <Line
                        type="monotone"
                        dataKey="oneRM"
                        stroke="var(--accent)"
                        strokeWidth={2}
                        dot={{ fill: 'var(--accent)', r: 3 }}
                        activeDot={{ r: 5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {entries.map(entry => {
                const oneRM = sessionMax1RM(entry.exercise)
                return (
                  <div key={entry.id} className="ex-history-entry">
                    <div className="ex-history-entry-header">
                      <span className="history-label">{entry.label}</span>
                      <span className="history-meta">
                        {formatHistoryDate(entry.date)}
                        {oneRM > 0 ? ` · est. 1RM ${Math.round(oneRM)} lbs` : ''}
                      </span>
                    </div>
                    <div className="history-sets-table">
                      <div className="history-sets-header">
                        <span>Set</span><span>Reps</span><span>Weight</span>
                      </div>
                      {entry.exercise.sets.map((s, si) => (
                        <div key={si} className="history-set-row">
                          <span className="set-num">{si + 1}</span>
                          <span>{s.reps} reps</span>
                          <span>{s.weight ? `${s.weight} lbs` : '—'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg className={`chevron ${open ? 'chevron--open' : ''}`} width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
