import { useState } from 'react'
import './Workouts.css'

const WORKOUTS = [
  {
    id: 'home-fast',
    label: 'Fast At Home',
    icon: '🏠',
    tag: '20 min',
    color: 'accent',
    description: 'No equipment needed. High intensity, full body burn.',
    exercises: [
      { name: 'Jump Squats',       sets: 3, reps: '15',   rest: '30s' },
      { name: 'Push-ups',          sets: 3, reps: '12',   rest: '30s' },
      { name: 'Mountain Climbers', sets: 3, reps: '20',   rest: '30s' },
      { name: 'Glute Bridges',     sets: 3, reps: '15',   rest: '30s' },
      { name: 'Plank',             sets: 3, reps: '45s',  rest: '30s' },
      { name: 'Burpees',           sets: 3, reps: '10',   rest: '45s' },
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
      { name: 'Barbell Squat',       sets: 3, reps: '8',  rest: '60s' },
      { name: 'Bench Press',         sets: 3, reps: '8',  rest: '60s' },
      { name: 'Barbell Row',         sets: 3, reps: '8',  rest: '60s' },
      { name: 'Overhead Press',      sets: 2, reps: '10', rest: '60s' },
      { name: 'Romanian Deadlift',   sets: 2, reps: '10', rest: '60s' },
    ],
  },
  {
    id: 'upper-lower',
    label: 'Upper / Lower Split',
    icon: '🔁',
    tag: '4-day split',
    color: 'purple',
    description: 'Alternate upper and lower days across the week.',
    days: [
      {
        label: 'Upper A',
        exercises: [
          { name: 'Bench Press',     sets: 4, reps: '6',  rest: '90s' },
          { name: 'Barbell Row',     sets: 4, reps: '6',  rest: '90s' },
          { name: 'Overhead Press',  sets: 3, reps: '8',  rest: '75s' },
          { name: 'Pull-ups',        sets: 3, reps: '8',  rest: '75s' },
          { name: 'Tricep Dips',     sets: 3, reps: '10', rest: '60s' },
          { name: 'Bicep Curls',     sets: 3, reps: '10', rest: '60s' },
        ],
      },
      {
        label: 'Lower A',
        exercises: [
          { name: 'Barbell Squat',   sets: 4, reps: '6',  rest: '90s' },
          { name: 'Romanian DL',     sets: 4, reps: '8',  rest: '90s' },
          { name: 'Leg Press',       sets: 3, reps: '10', rest: '75s' },
          { name: 'Leg Curl',        sets: 3, reps: '10', rest: '60s' },
          { name: 'Calf Raises',     sets: 4, reps: '15', rest: '45s' },
        ],
      },
    ],
  },
  {
    id: 'full-body',
    label: 'Full Body',
    icon: '💪',
    tag: '3-day split',
    color: 'orange',
    description: 'Hit everything three times a week. Great for building consistency.',
    exercises: [
      { name: 'Squat',              sets: 3, reps: '8',  rest: '90s' },
      { name: 'Bench Press',        sets: 3, reps: '8',  rest: '90s' },
      { name: 'Deadlift',           sets: 3, reps: '5',  rest: '120s' },
      { name: 'Pull-ups / Lat PD',  sets: 3, reps: '8',  rest: '75s' },
      { name: 'Overhead Press',     sets: 3, reps: '8',  rest: '75s' },
      { name: 'Plank',              sets: 3, reps: '45s', rest: '45s' },
    ],
  },
  {
    id: 'cardio',
    label: 'Cardio',
    icon: '🏃',
    tag: 'Endurance',
    color: 'red',
    description: 'Pick your format — steady state, intervals, or a mix.',
    exercises: [
      { name: 'Warm-up walk/jog',      sets: 1, reps: '5 min',  rest: '—' },
      { name: 'Steady-state run',       sets: 1, reps: '20 min', rest: '—' },
      { name: 'Sprint intervals (20/40s on/off)', sets: 6, reps: '20s', rest: '40s' },
      { name: 'Jump rope',              sets: 3, reps: '2 min',  rest: '60s' },
      { name: 'Cool-down walk',         sets: 1, reps: '5 min',  rest: '—' },
    ],
  },
]

export default function Workouts() {
  const [open, setOpen] = useState(null)
  const [activeDay, setActiveDay] = useState({})

  function toggle(id) {
    setOpen(prev => prev === id ? null : id)
  }

  return (
    <div className="workouts-view">
      <header className="page-header">
        <div>
          <h1 className="page-title">Suggested Workouts</h1>
          <p className="page-subtitle">Pick a format and get moving</p>
        </div>
      </header>

      <div className="workout-cards">
        {WORKOUTS.map(w => {
          const isOpen = open === w.id
          const dayKey = activeDay[w.id] ?? 0
          const exercises = w.days ? w.days[dayKey].exercises : w.exercises

          return (
            <div key={w.id} className={`workout-card workout-card--${w.color} ${isOpen ? 'workout-card--open' : ''}`}>
              <button className="workout-card-header" onClick={() => toggle(w.id)}>
                <div className="workout-card-left">
                  <span className="workout-icon">{w.icon}</span>
                  <div className="workout-title-block">
                    <span className="workout-label">{w.label}</span>
                    <span className="workout-desc">{w.description}</span>
                  </div>
                </div>
                <div className="workout-card-right">
                  <span className={`workout-tag workout-tag--${w.color}`}>{w.tag}</span>
                  <ChevronIcon open={isOpen} />
                </div>
              </button>

              {isOpen && (
                <div className="workout-body">
                  {w.days && (
                    <div className="day-tabs">
                      {w.days.map((d, i) => (
                        <button
                          key={i}
                          className={`day-tab ${(activeDay[w.id] ?? 0) === i ? 'day-tab--active' : ''}`}
                          onClick={() => setActiveDay(prev => ({ ...prev, [w.id]: i }))}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="exercise-table">
                    <div className="ex-table-header">
                      <span>Exercise</span>
                      <span>Sets</span>
                      <span>Reps / Time</span>
                      <span>Rest</span>
                    </div>
                    {exercises.map((ex, i) => (
                      <div key={i} className="ex-row">
                        <span className="ex-name">{ex.name}</span>
                        <span className="ex-sets">{ex.sets}</span>
                        <span className="ex-reps">{ex.reps}</span>
                        <span className="ex-rest">{ex.rest}</span>
                      </div>
                    ))}
                  </div>

                  <div className="workout-actions">
                    <button className="btn-accent">Start Session</button>
                    <button className="btn-ghost">Save to My Workouts</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg
      className={`chevron ${open ? 'chevron--open' : ''}`}
      width="16" height="16" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  )
}
