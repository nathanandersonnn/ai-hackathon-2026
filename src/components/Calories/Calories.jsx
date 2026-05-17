import { useState, useRef } from 'react'
import './Calories.css'

// Mifflin-St Jeor BMR
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

const MOCK_FOODS = [
  { name: '6oz Chicken Breast (plain)', cal: 187, protein: 35, carbs: 0,  fat: 4  },
  { name: 'Brown Rice (1 cup cooked)',  cal: 216, protein: 5,  carbs: 45, fat: 2  },
  { name: 'Banana (medium)',            cal: 105, protein: 1,  carbs: 27, fat: 0  },
]

export default function Calories() {
  // Profile / BMR state
  const [profile, setProfile] = useState({ weightLbs: '', heightFt: '', heightIn: '', age: '', sex: 'male', activity: 1.55 })
  const [bmr, setBmr] = useState(null)
  const [tdee, setTdee] = useState(null)
  const [profileSaved, setProfileSaved] = useState(false)

  // Food log state
  const [foodText, setFoodText] = useState('')
  const [photoPreview, setPhotoPreview] = useState(null)
  const [photoName, setPhotoName] = useState('')
  const [log, setLog] = useState([])
  const [logLoading, setLogLoading] = useState(false)
  const [photoLoading, setPhotoLoading] = useState(false)
  const fileRef = useRef(null)

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
    setProfileSaved(true)
  }

  function addFoodText() {
    if (!foodText.trim()) return
    setLogLoading(true)
    // Placeholder — backend will parse and return macros
    setTimeout(() => {
      const mock = MOCK_FOODS[log.length % MOCK_FOODS.length]
      setLog(prev => [...prev, { ...mock, name: foodText, source: 'text' }])
      setFoodText('')
      setLogLoading(false)
    }, 900)
  }

  function handlePhotoChange(e) {
    const file = e.target.files[0]
    if (!file) return
    setPhotoName(file.name)
    setPhotoPreview(URL.createObjectURL(file))
  }

  function analyzePhoto() {
    if (!photoPreview) return
    setPhotoLoading(true)
    // Placeholder — backend will run vision model and return macros
    setTimeout(() => {
      setLog(prev => [...prev, { name: photoName || 'Food from photo', cal: 320, protein: 22, carbs: 30, fat: 10, source: 'photo' }])
      setPhotoPreview(null)
      setPhotoName('')
      setPhotoLoading(false)
      if (fileRef.current) fileRef.current.value = ''
    }, 1400)
  }

  function removeItem(i) {
    setLog(prev => prev.filter((_, idx) => idx !== i))
  }

  const totalCal     = log.reduce((s, f) => s + f.cal, 0)
  const totalProtein = log.reduce((s, f) => s + f.protein, 0)
  const totalCarbs   = log.reduce((s, f) => s + f.carbs, 0)
  const totalFat     = log.reduce((s, f) => s + f.fat, 0)
  const calGoal      = tdee ?? 2000
  const calPct       = Math.min((totalCal / calGoal) * 100, 100)

  return (
    <div className="calories-view">
      <header className="page-header">
        <div>
          <h1 className="page-title">Calorie Tracker</h1>
          <p className="page-subtitle">Log your food and understand your intake</p>
        </div>
      </header>

      <div className="calories-layout">
        {/* Left column */}
        <div className="calories-left">

          {/* BMR / Profile card */}
          <div className="cal-card">
            <h2 className="card-title">Resting Calories (BMR)</h2>
            <p className="card-sub">Enter your stats to estimate how many calories your body burns at rest.</p>

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
                  <input className="cal-input" type="number" placeholder="25" value={profile.age}
                    onChange={e => handleProfileChange('age', e.target.value)} />
                  <span className="input-unit">yrs</span>
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">Weight</label>
                <div className="input-wrap">
                  <input className="cal-input" type="number" placeholder="175" value={profile.weightLbs}
                    onChange={e => handleProfileChange('weightLbs', e.target.value)} />
                  <span className="input-unit">lbs</span>
                </div>
              </div>

              <div className="field-group">
                <label className="field-label">Height</label>
                <div className="height-row">
                  <div className="input-wrap">
                    <input className="cal-input" type="number" placeholder="5" value={profile.heightFt}
                      onChange={e => handleProfileChange('heightFt', e.target.value)} />
                    <span className="input-unit">ft</span>
                  </div>
                  <div className="input-wrap">
                    <input className="cal-input" type="number" placeholder="10" value={profile.heightIn}
                      onChange={e => handleProfileChange('heightIn', e.target.value)} />
                    <span className="input-unit">in</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="field-group" style={{ marginBottom: 16 }}>
              <label className="field-label">Activity Level</label>
              <select
                className="cal-select"
                value={profile.activity}
                onChange={e => handleProfileChange('activity', parseFloat(e.target.value))}
              >
                {ACTIVITY_MULTIPLIERS.map(a => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>

            <button className="btn-accent" onClick={saveProfile} style={{ width: '100%' }}>
              Calculate
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
              </div>
            )}
          </div>

          {/* Daily summary */}
          {log.length > 0 && (
            <div className="cal-card">
              <h2 className="card-title">Today's Summary</h2>

              <div className="cal-progress-header">
                <span className="cal-progress-label">Calories consumed</span>
                <span className="cal-progress-value">
                  <span style={{ color: calPct >= 100 ? 'var(--red)' : 'var(--accent)' }}>{totalCal}</span>
                  <span style={{ color: 'var(--text-muted)' }}> / {calGoal} kcal</span>
                </span>
              </div>
              <div className="cal-bar-track">
                <div
                  className="cal-bar-fill"
                  style={{ width: `${calPct}%`, background: calPct >= 100 ? 'var(--red)' : 'var(--accent)' }}
                />
              </div>

              <div className="macro-row">
                <MacroChip label="Protein" value={totalProtein} unit="g" color="blue" />
                <MacroChip label="Carbs"   value={totalCarbs}   unit="g" color="orange" />
                <MacroChip label="Fat"     value={totalFat}     unit="g" color="purple" />
              </div>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="calories-right">

          {/* Text entry */}
          <div className="cal-card">
            <h2 className="card-title">Log Food — Text</h2>
            <p className="card-sub">Describe what you ate and the backend will calculate the macros.</p>
            <div className="food-text-row">
              <input
                className="food-text-input"
                placeholder='e.g. "6oz chicken breast, no seasoning"'
                value={foodText}
                onChange={e => setFoodText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addFoodText()}
              />
              <button
                className={`btn-accent add-btn ${logLoading ? 'add-btn--loading' : ''}`}
                onClick={addFoodText}
                disabled={logLoading || !foodText.trim()}
              >
                {logLoading ? '…' : 'Add'}
              </button>
            </div>
          </div>

          {/* Photo entry */}
          <div className="cal-card">
            <h2 className="card-title">Log Food — Photo</h2>
            <p className="card-sub">Take or upload a photo and the backend will identify and estimate the macros.</p>

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

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: 'none' }}
              onChange={handlePhotoChange}
            />

            {photoPreview && (
              <div className="photo-actions">
                <button className="btn-ghost" onClick={() => { setPhotoPreview(null); setPhotoName(''); if (fileRef.current) fileRef.current.value = '' }}>
                  Remove
                </button>
                <button className="btn-accent" onClick={analyzePhoto} disabled={photoLoading}>
                  {photoLoading ? 'Analyzing…' : 'Analyze Photo'}
                </button>
              </div>
            )}
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
                      {item.source === 'photo' && <span className="source-tag">📷</span>}
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

function MacroChip({ label, value, unit, color }) {
  return (
    <div className={`macro-chip macro-chip--${color}`}>
      <span className="macro-val">{value}{unit}</span>
      <span className="macro-label">{label}</span>
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
