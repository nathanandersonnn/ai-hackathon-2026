import { useState, useEffect, useRef } from 'react'
import { useFoodScanner } from './useFoodScanner'
import { getCalorieLogs, upsertCalorieLog } from '../../lib/supabase/calories'
import './Calories.css'

// ─── helpers ───────────────────────────────────────────────────
function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function formatDateLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function shiftDate(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  date.setDate(date.getDate() + days)
  return date.toISOString().slice(0, 10)
}

function calcBMR({ weightLbs, heightFt, heightIn, age, sex }) {
  const kg = weightLbs * 0.453592
  const cm = (heightFt * 12 + heightIn) * 2.54
  const base = 10 * kg + 6.25 * cm - 5 * age
  return Math.round(sex === 'male' ? base + 5 : base - 161)
}

const ACTIVITY_MULTIPLIERS = [
  { label: 'Sedentary (desk job, no exercise)', value: 1.2 },
  { label: 'Lightly active (1–3 days/week)',    value: 1.375 },
  { label: 'Moderately active (3–5 days/week)', value: 1.55 },
  { label: 'Very active (6–7 days/week)',        value: 1.725 },
]

const DAILY_VALUES = { fiber: 28, sodium: 2300, sugar: 50 }
const DEFAULT_GOALS = { cal: 2000, protein: 150, carbs: 250, fat: 65 }

// ─── component ─────────────────────────────────────────────────
export default function Calories() {
  const { analyzeImage, analyzeText } = useFoodScanner()

  // ── date state ──────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(todayISO)
  const isToday = selectedDate === todayISO()

  // ── per-date data (Supabase-backed) ──────────────────────────
  const [allLogs, setAllLogs]   = useState([])
  const [logsLoading, setLogsLoading] = useState(true)
  const [log, setLog]           = useState([])
  const [waterGlasses, setWater] = useState(0)
  const loadedFor = useRef(null)

  // Initial fetch — pull recent rows so we can seed goals + populate past days.
  useEffect(() => {
    getCalorieLogs(60)
      .then(setAllLogs)
      .catch(err => console.error('Failed to load calorie logs:', err))
      .finally(() => setLogsLoading(false))
  }, [])

  // Hydrate inputs whenever the selected date (or fetched logs) changes.
  useEffect(() => {
    if (logsLoading) return
    if (loadedFor.current === selectedDate) return
    loadedFor.current = selectedDate
    const row = allLogs.find(r => r.date === selectedDate)
    setLog(row?.food_entries?.log ?? [])
    setWater(row?.food_entries?.water ?? 0)
  }, [selectedDate, allLogs, logsLoading])

  // ── BMR / profile ────────────────────────────────────────────
  const [profile, setProfile] = useState({
    weightLbs: '', heightFt: '', heightIn: '', age: '', sex: 'male', activity: 1.55,
  })
  const [bmr, setBmr]   = useState(null)
  const [tdee, setTdee] = useState(null)

  // ── goals ────────────────────────────────────────────────────
  const [goals, setGoals]           = useState(DEFAULT_GOALS)
  const [showGoalEdit, setShowGoalEdit] = useState(false)
  const [goalDraft, setGoalDraft]   = useState(null)

  // Seed goals from the most recent row that has them.
  useEffect(() => {
    if (logsLoading) return
    const latest = allLogs.find(r => r.macro_goals)
    if (latest) setGoals({ ...DEFAULT_GOALS, ...latest.macro_goals })
  }, [allLogs, logsLoading])

  // Persist the current day's row (food_entries + macro_goals snapshot).
  // Callers pass explicit `next` values because state setters are async.
  async function persistDay({ log: nextLog = log, water: nextWater = waterGlasses, goals: nextGoals = goals } = {}) {
    try {
      const saved = await upsertCalorieLog({
        date: selectedDate,
        food_entries: { log: nextLog, water: nextWater },
        macro_goals:  nextGoals,
      })
      setAllLogs(prev => {
        const filtered = prev.filter(r => r.date !== selectedDate)
        return [saved, ...filtered].sort((a, b) => b.date.localeCompare(a.date))
      })
    } catch (err) {
      console.error('Failed to save calorie log:', err)
    }
  }

  function openGoalEdit() {
    setGoalDraft({ ...goals })
    setShowGoalEdit(true)
  }

  function handleGoalDraft(field, val) {
    setGoalDraft(d => ({ ...d, [field]: val }))
  }

  function saveGoalEdit() {
    const updated = {
      cal:     parseInt(goalDraft.cal)     || DEFAULT_GOALS.cal,
      protein: parseInt(goalDraft.protein) || DEFAULT_GOALS.protein,
      carbs:   parseInt(goalDraft.carbs)   || DEFAULT_GOALS.carbs,
      fat:     parseInt(goalDraft.fat)     || DEFAULT_GOALS.fat,
    }
    setGoals(updated)
    persistDay({ goals: updated })
    setShowGoalEdit(false)
  }

  function applyTDEEAsGoal(tdeeVal) {
    const updated = { ...goals, cal: tdeeVal }
    setGoals(updated)
    persistDay({ goals: updated })
  }

  function handleProfileChange(field, val) {
    setProfile(p => ({ ...p, [field]: val }))
  }

  function saveProfile() {
    const w = parseFloat(profile.weightLbs)
    const ft = parseInt(profile.heightFt)
    const inches = parseInt(profile.heightIn) || 0
    const a = parseInt(profile.age)
    if (!w || !ft || !a) return
    const b = calcBMR({ weightLbs: w, heightFt: ft, heightIn: inches, age: a, sex: profile.sex })
    setBmr(b)
    setTdee(Math.round(b * profile.activity))
  }

  // ── text entry ───────────────────────────────────────────────
  const [foodText, setFoodText]       = useState('')
  const [logLoading, setLogLoading]   = useState(false)
  const [logError, setLogError]       = useState(null)

  async function addFoodText() {
    if (!foodText.trim()) return
    setLogLoading(true)
    setLogError(null)
    try {
      const result = await analyzeText(foodText)
      const next = [...log, { ...result, source: 'text' }]
      setLog(next)
      persistDay({ log: next })
      setFoodText('')
    } catch (err) {
      setLogError(err.message)
    } finally {
      setLogLoading(false)
    }
  }

  // ── photo entry ──────────────────────────────────────────────
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoFile, setPhotoFile]       = useState(null)
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoError, setPhotoError]     = useState(null)
  const fileRef = useRef(null)

  function handlePhotoChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
    setPhotoError(null)
  }

  async function analyzePhoto() {
    if (!photoFile) return
    setPhotoLoading(true)
    setPhotoError(null)
    try {
      const result = await analyzeImage(URL.createObjectURL(photoFile))
      const next = [...log, { ...result, source: 'photo' }]
      setLog(next)
      persistDay({ log: next })
      setPhotoPreview(null)
      setPhotoFile(null)
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setPhotoError(err.message)
    } finally {
      setPhotoLoading(false)
    }
  }

  // ── quick add ────────────────────────────────────────────────
  const [showQA, setShowQA]         = useState(false)
  const [showMicros, setShowMicros] = useState(false)
  const [qa, setQA] = useState({
    name: '', cal: '', protein: '', carbs: '', fat: '',
    fiber: '', sodium: '', sugar: '',
  })

  function handleQA(field, val) {
    setQA(q => ({ ...q, [field]: val }))
  }

  function addQuickEntry() {
    if (!qa.cal) return
    const next = [...log, {
      name:    qa.name || 'Quick entry',
      cal:     parseFloat(qa.cal) || 0,
      protein: parseFloat(qa.protein) || 0,
      carbs:   parseFloat(qa.carbs) || 0,
      fat:     parseFloat(qa.fat) || 0,
      fiber:   parseFloat(qa.fiber) || 0,
      sodium:  parseFloat(qa.sodium) || 0,
      sugar:   parseFloat(qa.sugar) || 0,
      source: 'manual',
    }]
    setLog(next)
    persistDay({ log: next })
    setQA({ name: '', cal: '', protein: '', carbs: '', fat: '', fiber: '', sodium: '', sugar: '' })
    setShowQA(false)
    setShowMicros(false)
  }

  // ── totals ───────────────────────────────────────────────────
  const totalCal     = log.reduce((s, f) => s + (f.cal || 0), 0)
  const totalProtein = log.reduce((s, f) => s + (f.protein || 0), 0)
  const totalCarbs   = log.reduce((s, f) => s + (f.carbs || 0), 0)
  const totalFat     = log.reduce((s, f) => s + (f.fat || 0), 0)
  const totalFiber   = log.reduce((s, f) => s + (f.fiber || 0), 0)
  const totalSodium  = log.reduce((s, f) => s + (f.sodium || 0), 0)
  const totalSugar   = log.reduce((s, f) => s + (f.sugar || 0), 0)
  const netCarbs     = Math.max(0, totalCarbs - totalFiber)

  const calGoal = goals.cal
  const calPct  = Math.min((totalCal / calGoal) * 100, 100)
  const calLeft = calGoal - totalCal

  // ── past dates ───────────────────────────────────────────────
  const pastRows = allLogs
    .filter(r => r.date !== selectedDate && r.date < todayISO())
    .slice(0, 7)

  // ── export ───────────────────────────────────────────────────
  function exportJSON() {
    const data = Object.fromEntries(
      allLogs.map(r => [r.date, { log: r.food_entries?.log ?? [], water: r.food_entries?.water ?? 0 }])
    )
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'myfitbud-calories.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── remove item ──────────────────────────────────────────────
  function removeItem(i) {
    const next = log.filter((_, idx) => idx !== i)
    setLog(next)
    persistDay({ log: next })
  }

  function changeWater(delta) {
    const next = Math.max(0, waterGlasses + delta)
    setWater(next)
    persistDay({ water: next })
  }

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="calories-view">
      <header className="page-header">
        <div>
          <h1 className="page-title">Calorie Tracker</h1>
          <p className="page-subtitle">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <button className="btn-ghost" style={{ fontSize: 12 }} onClick={exportJSON}>
          Export JSON
        </button>
      </header>

      {/* Date navigation */}
      <div className="date-nav">
        <button className="date-arrow" onClick={() => setSelectedDate(d => shiftDate(d, -1))}>‹</button>
        <div className="date-center">
          <label className="date-display">
            {isToday && <span className="date-today-label">Today</span>}
            {formatDateLabel(selectedDate)}
            {!isToday && <span className="date-past-badge">Past</span>}
            <input
              type="date"
              className="date-input-hidden"
              value={selectedDate}
              max={todayISO()}
              onChange={e => e.target.value && setSelectedDate(e.target.value)}
            />
          </label>
        </div>
        <button
          className="date-arrow"
          onClick={() => setSelectedDate(d => shiftDate(d, 1))}
          disabled={isToday}
          style={{ opacity: isToday ? 0.3 : 1 }}
        >›</button>
        {!isToday && (
          <button className="btn-ghost date-today-btn" onClick={() => setSelectedDate(todayISO())}>
            Today
          </button>
        )}
      </div>

      <div className="calories-layout">
        {/* ── LEFT COLUMN ─────────────────────────────────── */}
        <div className="calories-left">

          {/* Always-visible summary */}
          <div className="cal-card">
            <h2 className="card-title">
              {isToday ? "Today's Summary" : `${formatDateLabel(selectedDate)}`}
            </h2>

            {/* Calories */}
            <div className="summary-section">
              <p className="summary-section-label">Calories</p>
              <div className="cal-progress-header">
                <span className="cal-progress-label">Consumed</span>
                <span className="cal-progress-value">
                  <span style={{ color: calPct >= 100 ? 'var(--red)' : 'var(--accent)' }}>
                    {totalCal}
                  </span>
                  <span style={{ color: 'var(--text-muted)' }}> / {calGoal} kcal</span>
                </span>
              </div>
              <div className="cal-bar-track">
                <div
                  className="cal-bar-fill"
                  style={{ width: `${calPct}%`, background: calPct >= 100 ? 'var(--red)' : 'var(--accent)' }}
                />
              </div>
              <p className="cal-remaining">
                {calLeft >= 0
                  ? `${calLeft} kcal remaining`
                  : `${Math.abs(calLeft)} kcal over goal`}
              </p>
            </div>

            {/* Macros */}
            <div className="summary-section">
              <div className="summary-section-header">
                <p className="summary-section-label">Macros</p>
                <button className="goal-edit-btn" onClick={showGoalEdit ? saveGoalEdit : openGoalEdit}>
                  {showGoalEdit ? 'Save' : 'Edit Goals'}
                </button>
                {showGoalEdit && (
                  <button className="goal-cancel-btn" onClick={() => setShowGoalEdit(false)}>Cancel</button>
                )}
              </div>

              {showGoalEdit ? (
                <div className="goal-edit-grid">
                  <GoalField label="Calories" field="cal" draft={goalDraft} onChange={handleGoalDraft} unit="kcal" />
                  <GoalField label="Protein"  field="protein" draft={goalDraft} onChange={handleGoalDraft} unit="g" />
                  <GoalField label="Carbs"    field="carbs"   draft={goalDraft} onChange={handleGoalDraft} unit="g" />
                  <GoalField label="Fat"      field="fat"     draft={goalDraft} onChange={handleGoalDraft} unit="g" />
                </div>
              ) : (
                <div className="macro-bars">
                  <MacroBar label="Protein" value={totalProtein} goal={goals.protein} color="blue" />
                  <MacroBar label="Carbs"   value={totalCarbs}   goal={goals.carbs}   color="orange" />
                  <MacroBar label="Fat"     value={totalFat}     goal={goals.fat}     color="purple" />
                </div>
              )}
            </div>

            {/* Micros */}
            <div className="summary-section">
              <p className="summary-section-label">Micronutrients</p>
              <div className="micro-grid">
                <MicroCell label="Fiber"    value={totalFiber}  unit="g"  rdvPct={Math.round((totalFiber / DAILY_VALUES.fiber) * 100)} />
                <MicroCell label="Net Carbs" value={netCarbs}   unit="g"  rdvPct={null} />
                <MicroCell label="Sugar"    value={totalSugar}  unit="g"  rdvPct={Math.round((totalSugar / DAILY_VALUES.sugar) * 100)} />
                <MicroCell label="Sodium"   value={totalSodium} unit="mg" rdvPct={Math.round((totalSodium / DAILY_VALUES.sodium) * 100)} />
              </div>
            </div>

            {/* Water */}
            <div className="summary-section">
              <p className="summary-section-label">Water</p>
              <div className="water-controls">
                <button className="water-btn" onClick={() => changeWater(-1)}>−</button>
                <span className="water-label">
                  {'💧'.repeat(Math.min(waterGlasses, 8))}
                  {waterGlasses === 0 && <span style={{ color: 'var(--text-muted)' }}>No water logged</span>}
                  <span style={{ marginLeft: 6, color: 'var(--text-secondary)', fontSize: 12 }}>
                    {waterGlasses} glass{waterGlasses !== 1 ? 'es' : ''}
                  </span>
                </span>
                <button className="water-btn" onClick={() => changeWater(1)}>+</button>
              </div>
            </div>
          </div>

          {/* BMR card */}
          <div className="cal-card">
            <h2 className="card-title">Calorie Goal (BMR + TDEE)</h2>
            <p className="card-sub">Enter your stats to set your daily calorie goal.</p>

            <div className="profile-grid">
              <div className="field-group">
                <label className="field-label">Sex</label>
                <div className="toggle-row">
                  {['male', 'female'].map(s => (
                    <button
                      key={s}
                      className={`toggle-btn ${profile.sex === s ? 'toggle-btn--active' : ''}`}
                      onClick={() => handleProfileChange('sex', s)}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">Age</label>
                <div className="input-wrap">
                  <input className="cal-input" type="number" placeholder="25"
                    value={profile.age} onChange={e => handleProfileChange('age', e.target.value)} />
                  <span className="input-unit">yrs</span>
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">Weight</label>
                <div className="input-wrap">
                  <input className="cal-input" type="number" placeholder="175"
                    value={profile.weightLbs} onChange={e => handleProfileChange('weightLbs', e.target.value)} />
                  <span className="input-unit">lbs</span>
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">Height</label>
                <div className="height-row">
                  <div className="input-wrap">
                    <input className="cal-input" type="number" placeholder="5"
                      value={profile.heightFt} onChange={e => handleProfileChange('heightFt', e.target.value)} />
                    <span className="input-unit">ft</span>
                  </div>
                  <div className="input-wrap">
                    <input className="cal-input" type="number" placeholder="10"
                      value={profile.heightIn} onChange={e => handleProfileChange('heightIn', e.target.value)} />
                    <span className="input-unit">in</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="field-group" style={{ marginBottom: 16 }}>
              <label className="field-label">Activity Level</label>
              <select className="cal-select" value={profile.activity}
                onChange={e => handleProfileChange('activity', parseFloat(e.target.value))}>
                {ACTIVITY_MULTIPLIERS.map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>

            <button className="btn-accent" onClick={saveProfile} style={{ width: '100%' }}>
              Set My Calorie Goal
            </button>

            {bmr && (
              <div className="bmr-results">
                <div className="bmr-stat">
                  <span className="bmr-val">{bmr.toLocaleString()}</span>
                  <span className="bmr-label">kcal / day at rest (BMR)</span>
                </div>
                <div className="bmr-divider" />
                <div className="bmr-stat">
                  <span className="bmr-val bmr-val--accent">{tdee.toLocaleString()}</span>
                  <span className="bmr-label">kcal / day with activity (TDEE)</span>
                </div>
                <button
                  className="btn-ghost"
                  style={{ marginTop: 10, width: '100%', fontSize: 12 }}
                  onClick={() => applyTDEEAsGoal(tdee)}
                >
                  Apply {tdee.toLocaleString()} kcal as my calorie goal
                </button>
              </div>
            )}
          </div>

          {/* Past logs */}
          {pastRows.length > 0 && (
            <div className="cal-card">
              <h2 className="card-title">Past Days</h2>
              <div className="food-log-list">
                {pastRows.map(row => {
                  const cal = (row.food_entries?.log ?? []).reduce((s, f) => s + (f.cal || 0), 0)
                  return (
                    <div key={row.date} className="past-day">
                      <div className="past-day-header">
                        <span className="food-log-name">{formatDateLabel(row.date)}</span>
                        <span className="food-log-cal">{cal} kcal</span>
                        <button className="btn-ghost past-jump-btn" onClick={() => setSelectedDate(row.date)}>
                          Go →
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN ────────────────────────────────── */}
        <div className="calories-right">

          {/* Quick Add */}
          <div className="cal-card">
            <div className="card-title-row">
              <h2 className="card-title">Quick Add</h2>
              <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowQA(v => !v)}>
                {showQA ? 'Hide' : 'Show'}
              </button>
            </div>
            {showQA && (
              <>
                <div className="qa-grid">
                  <div className="field-group">
                    <label className="field-label">Food name</label>
                    <input className="cal-input" style={{ width: '100%' }} placeholder="e.g. Greek yogurt"
                      value={qa.name} onChange={e => handleQA('name', e.target.value)} />
                  </div>
                  <div className="field-group">
                    <label className="field-label">Calories *</label>
                    <div className="input-wrap">
                      <input className="cal-input" type="number" placeholder="0"
                        value={qa.cal} onChange={e => handleQA('cal', e.target.value)} />
                      <span className="input-unit">kcal</span>
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Protein</label>
                    <div className="input-wrap">
                      <input className="cal-input" type="number" placeholder="0"
                        value={qa.protein} onChange={e => handleQA('protein', e.target.value)} />
                      <span className="input-unit">g</span>
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Carbs</label>
                    <div className="input-wrap">
                      <input className="cal-input" type="number" placeholder="0"
                        value={qa.carbs} onChange={e => handleQA('carbs', e.target.value)} />
                      <span className="input-unit">g</span>
                    </div>
                  </div>
                  <div className="field-group">
                    <label className="field-label">Fat</label>
                    <div className="input-wrap">
                      <input className="cal-input" type="number" placeholder="0"
                        value={qa.fat} onChange={e => handleQA('fat', e.target.value)} />
                      <span className="input-unit">g</span>
                    </div>
                  </div>
                </div>

                <button className="btn-ghost" style={{ fontSize: 12, marginTop: 8 }}
                  onClick={() => setShowMicros(v => !v)}>
                  {showMicros ? '▲ Hide micronutrients' : '▼ Add micronutrients (optional)'}
                </button>

                {showMicros && (
                  <div className="qa-micro-grid">
                    <div className="field-group">
                      <label className="field-label">Fiber</label>
                      <div className="input-wrap">
                        <input className="cal-input" type="number" placeholder="0"
                          value={qa.fiber} onChange={e => handleQA('fiber', e.target.value)} />
                        <span className="input-unit">g</span>
                      </div>
                    </div>
                    <div className="field-group">
                      <label className="field-label">Sugar</label>
                      <div className="input-wrap">
                        <input className="cal-input" type="number" placeholder="0"
                          value={qa.sugar} onChange={e => handleQA('sugar', e.target.value)} />
                        <span className="input-unit">g</span>
                      </div>
                    </div>
                    <div className="field-group">
                      <label className="field-label">Sodium</label>
                      <div className="input-wrap">
                        <input className="cal-input" type="number" placeholder="0"
                          value={qa.sodium} onChange={e => handleQA('sodium', e.target.value)} />
                        <span className="input-unit">mg</span>
                      </div>
                    </div>
                  </div>
                )}

                <button className="btn-accent" style={{ width: '100%', marginTop: 12 }}
                  onClick={addQuickEntry} disabled={!qa.cal}>
                  Add Entry
                </button>
              </>
            )}
          </div>

          {/* Text entry */}
          <div className="cal-card">
            <h2 className="card-title">Log Food — Describe It</h2>
            <p className="card-sub">Describe what you ate and AI will estimate the macros (requires Ollama + LLaVA running locally).</p>
            <div className="food-text-row">
              <input
                className="food-text-input"
                placeholder='e.g. "6oz grilled chicken breast"'
                value={foodText}
                onChange={e => setFoodText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addFoodText()}
              />
              <button className={`btn-accent add-btn ${logLoading ? 'add-btn--loading' : ''}`}
                onClick={addFoodText} disabled={logLoading || !foodText.trim()}>
                {logLoading ? '…' : 'Add'}
              </button>
            </div>
            {logError && <p className="error-msg">{logError}</p>}
          </div>

          {/* Photo entry */}
          <div className="cal-card">
            <h2 className="card-title">Log Food — Photo</h2>
            <p className="card-sub">Upload a photo and AI will identify the food and estimate macros (requires Ollama + LLaVA).</p>

            <div
              className={`photo-drop ${photoPreview ? 'photo-drop--filled' : ''}`}
              onClick={() => !photoPreview && fileRef.current?.click()}
            >
              {photoPreview ? (
                <img src={photoPreview} alt="Food preview" className="photo-preview" />
              ) : (
                <div className="photo-placeholder">
                  <CameraIcon />
                  <span>Tap to upload a photo</span>
                  <span className="photo-sub">JPG, PNG, HEIC</span>
                </div>
              )}
            </div>

            <input ref={fileRef} type="file" accept="image/*" capture="environment"
              style={{ display: 'none' }} onChange={handlePhotoChange} />

            {photoPreview && (
              <div className="photo-actions">
                <button className="btn-ghost" onClick={() => {
                  setPhotoPreview(null); setPhotoFile(null); setPhotoError(null)
                  if (fileRef.current) fileRef.current.value = ''
                }}>Remove</button>
                <button className="btn-accent" onClick={analyzePhoto} disabled={photoLoading}>
                  {photoLoading ? 'Analyzing…' : 'Analyze Photo'}
                </button>
              </div>
            )}
            {photoError && <p className="error-msg">{photoError}</p>}
          </div>

          {/* Food log */}
          {log.length > 0 && (
            <div className="cal-card">
              <h2 className="card-title">Food Log</h2>
              <div className="food-log-list">
                <div className="food-log-header">
                  <span>Item</span>
                  <span>Cal</span>
                  <span>P</span>
                  <span>C</span>
                  <span>F</span>
                  <span />
                </div>
                {log.map((item, i) => (
                  <div key={i} className="food-log-row">
                    <span className="food-log-name">
                      {item.source === 'photo'  && <span className="source-tag">📷</span>}
                      {item.source === 'manual' && <span className="source-tag">✏️</span>}
                      {item.name}
                    </span>
                    <span className="food-log-cal">{item.cal}</span>
                    <span className="food-log-macro">{item.protein}g</span>
                    <span className="food-log-macro">{item.carbs}g</span>
                    <span className="food-log-macro">{item.fat}g</span>
                    <button className="remove-btn" onClick={() => removeItem(i)}>×</button>
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

// ─── sub-components ────────────────────────────────────────────
function MacroBar({ label, value, goal, color }) {
  const pct = Math.min(Math.round((value / goal) * 100), 100)
  const over = value > goal
  return (
    <div className="macro-bar-row">
      <div className="macro-bar-header">
        <span className="macro-bar-label">{label}</span>
        <span className="macro-bar-value" style={{ color: over ? 'var(--red)' : undefined }}>
          {value}g
        </span>
        <span className="macro-bar-pct">/ {goal}g</span>
      </div>
      <div className="macro-bar-track">
        <div
          className={`macro-bar-fill macro-bar-fill--${color}`}
          style={{ width: `${pct}%`, background: over ? 'var(--red)' : undefined }}
        />
      </div>
    </div>
  )
}

function GoalField({ label, field, draft, onChange, unit }) {
  return (
    <div className="goal-edit-field">
      <label className="field-label">{label}</label>
      <div className="input-wrap">
        <input
          className="cal-input"
          type="number"
          value={draft[field]}
          onChange={e => onChange(field, e.target.value)}
        />
        <span className="input-unit">{unit}</span>
      </div>
    </div>
  )
}

function MicroCell({ label, value, unit, rdvPct }) {
  return (
    <div className="micro-cell">
      <span className="micro-cell-val">
        {value}<span className="micro-unit">{unit}</span>
      </span>
      <span className="micro-cell-label">{label}</span>
      {rdvPct !== null && (
        <span className="micro-cell-rdv">{rdvPct}% DV</span>
      )}
    </div>
  )
}

function CameraIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  )
}
