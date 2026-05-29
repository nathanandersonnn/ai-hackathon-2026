# MyFitBud.ai

MyFitBud.ai is a web-based fitness companion that combines real-time pose estimation, conversational AI coaching, calorie tracking, and progress logging. Instead of just logging numbers, you can tell MyFitBud how you're actually feeling — sore, tired, slammed with work — and get coaching that responds to your real life, not just your schedule.

Point your camera at yourself during a workout and get live feedback on your form. Chat naturally with a coach that knows your history. Track your workouts, calories, weight, steps, and goals over time. MyFitBud ties it all together.

---

## Features

**Camera-Based Form Analysis**
Uses MediaPipe Pose Landmarker to track your joints in real time through your browser's webcam — no app install, no backend pose processing. Reps are counted by per-exercise state machines, and after each set the joint-angle telemetry is sent to a local Express endpoint that calls Groq for plain-English form feedback and a 0–100 form score with itemized deductions. Supported exercises: **Squat, Push-up, Deadlift, Bicep Curl, Lunge, Overhead Press, Lateral Raise, Glute Bridge, Sit-up**. Any warning or deduction has an "Ask coach →" button that jumps straight into the chat with a question pre-filled.

**Conversational AI Coaching**
Chat with MyFitBud the way you'd text a trainer. It's seeded with your recent workouts, your goals, and your daily logs so its advice references what you've actually been doing ("Last Tuesday you hit 3×8 at 135, let's try 140"). Powered by Groq (`llama-3.3-70b-versatile`). The coach can also surface quick-reply chips for readiness check-ins and choices.

**Workouts**
- **Browse** built-in templates (Fast At Home, Fast In The Gym, Full Body, Upper/Lower splits, Cardio) or create and save your own custom presets.
- **Log Session** with a searchable 100+ exercise library, per-set reps/weight entry, a rest-timer popup with countdown + beep, a per-exercise "complete" button that moves finished work to the bottom of the list (completion order is preserved on save), and inputs that pre-fill from your last entered data.
- **History** of every saved session — expandable, editable in place, repeatable, and deletable. Click any exercise to see a 1RM progression chart (Epley estimate) plus current and best-ever 1RM.

**Calorie & Nutrition Tracking**
Log food by quick manual entry, plain-text description, or photo. Text/photo lookups draw on the USDA FoodData Central database, Open Food Facts, and a local LLaVA vision model (via Ollama) for photos. Includes a BMR/TDEE calculator, editable macro goals, per-day macro + micronutrient totals, water tracking, and a per-day history.

**Daily Logging**
Log your weight and step count once per day. Feeds the dashboard and the coach's recovery signals.

**Goals & Milestones**
Set targets for weight, weekly workout frequency, daily steps, or anything custom, and track progress toward them.

**Dashboard**
Weekly overview of steps and workouts, plus a current workout streak.

---

## Tech Stack

- **React + Vite** — frontend (state-based view switching, no router)
- **MediaPipe Pose Landmarker** — in-browser pose estimation (33 keypoints @ ~30fps)
- **Groq** (`llama-3.3-70b-versatile`) — form-check feedback and AI coach chat
- **Express** — Node backend on `localhost:3001` (form-check API), proxied by Vite
- **Supabase** — Postgres database + auth (workouts, templates, daily logs, calories, goals)
- **recharts** — 1RM progression charts
- **USDA FoodData Central + Open Food Facts + Ollama/LLaVA** — nutrition lookup

---

## Getting Started

### Prerequisites

- **Node.js 20.6+** (the backend uses `--env-file`; 22 LTS or newer recommended)
- A **Groq API key** — free tier works ([console.groq.com](https://console.groq.com))
- A **Supabase project** for auth and data persistence
- *(Optional)* **Ollama** running locally with the `llava` model pulled, for food-photo analysis
- *(Optional)* A **USDA FoodData Central API key** for text-based nutrition lookup

### Install

```bash
git clone https://github.com/nathanandersonnn/ai-hackathon-2026.git
cd ai-hackathon-2026
npm install
```

### Environment variables

Create a `.env` file in the project root:

```env
# ── Groq (required) ──────────────────────────────
# Server-side key for the form-check endpoint
GROQ_FORM_KEY=gsk_...
# Client-side key for the AI coach chat
VITE_GROQ_CHAT_KEY=gsk_...

# ── Supabase (required for auth + data) ──────────
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key

# ── Nutrition (optional) ─────────────────────────
VITE_USDA_API_KEY=your_usda_key
# Food-photo analysis uses a local Ollama + LLaVA server
# at http://localhost:11434 (no key needed)
```

> The two Groq keys can be the same value. `GROQ_FORM_KEY` is read by the Node server, while `VITE_GROQ_CHAT_KEY` is bundled into the client for the chat feature. In production you'd proxy the chat call through your own backend so the key isn't exposed in the browser.

### Supabase tables

The app expects these user-scoped tables (each with a `user_id` column and row-level security): `daily_logs`, `workout_sessions`, `workout_templates`, `calorie_logs`, `goals`, and `milestones`. Exercise sets, food entries, and template definitions are stored as JSONB so the schema can evolve without migrations.

### Run

```bash
npm run dev
```

This single command starts **both** processes via `concurrently`:
- Vite dev server on `http://localhost:5173` (the app)
- Express backend on `http://localhost:3001` (form-check API)

Vite proxies `/analyze-set` requests to the backend, so the frontend always talks to its own origin.

Open `http://localhost:5173`, go to **Form Check**, pick an exercise, and hit Start Session.

### Quick health check

In a second terminal:

```bash
curl http://localhost:3001/health
# → {"ok":true,"hasKey":<bool>}
```

`hasKey: false` means the server didn't find `GROQ_FORM_KEY` (or `VITE_GROQ_FORM_KEY`) in your `.env`.

### Troubleshooting

- **`/analyze-set` returns an error about a missing key** — set `GROQ_FORM_KEY` in `.env` and restart `npm run dev`.
- **"Camera permission denied"** — browsers only grant `getUserMedia` on secure origins. `localhost` counts, but a `192.168.x.x` LAN address does not.
- **The pose model takes a few seconds the first time** — MediaPipe downloads a `.task` file and WASM bundle from a CDN on first use.
- **Food-photo analysis fails** — make sure Ollama is running (`ollama serve`) and the model is pulled (`ollama pull llava`).

---

## Project Structure

```
ai-hackathon-2026/
├── server/
│   └── index.js              # Express form-check API (calls Groq)
├── src/
│   ├── components/
│   │   ├── About/            # Team / project info page
│   │   ├── Account/          # Profile / username management
│   │   ├── Auth/             # Supabase email auth
│   │   ├── Calories/         # Calorie tracker, BMR/TDEE, food scanner
│   │   ├── Camera/           # Webcam, MediaPipe overlay, rep counter, form feedback
│   │   ├── Chat/             # AI coaching interface
│   │   ├── Dashboard/        # Weekly overview + streak
│   │   ├── Goals/            # Goals & milestones
│   │   ├── Logging/          # Daily weight + steps
│   │   ├── Sidebar.jsx       # Nav
│   │   └── Workouts/         # Browse / Log / History, presets, 1RM charts
│   ├── lib/
│   │   ├── api/              # Frontend wrappers for AI endpoints
│   │   │   ├── calories.js
│   │   │   ├── chat.js       # Groq chat
│   │   │   └── formCheck.js  # POST /analyze-set
│   │   ├── pose/             # MediaPipe setup + per-exercise rep counters
│   │   │   ├── poseDetector.js
│   │   │   └── exercises.js  # Squat / Push-up / Deadlift / Bicep Curl / Lunge / OHP / Lateral Raise / Glute Bridge / Sit-up
│   │   └── supabase/         # Data layer (user-scoped CRUD helpers)
│   │       ├── client.js
│   │       ├── dailyLogs.js
│   │       ├── workouts.js
│   │       ├── workoutTemplates.js
│   │       ├── calories.js
│   │       └── goals.js
│   ├── App.jsx               # View switching + shared state (e.g. chat seed)
│   └── main.jsx
├── vite.config.js            # Dev-server proxy for /analyze-set + /health
└── package.json
```

---

## Data Models

```js
// Daily log (table: daily_logs)
{ date: string, weight: number, steps: number }

// Workout session (table: workout_sessions) — exercises stored as JSONB
{
  id: string,
  date: string,
  label: string,
  exercises: [
    { name: string, sets: [ { reps: number, weight: number } ] }
  ]
}

// Workout template / custom preset (table: workout_templates)
{
  id: string,
  label: string,
  icon: string,
  tag: string,
  color: string,
  description: string,
  exercises: [ { name: string, sets: number, reps: string } ]
}

// Calorie log (table: calorie_logs) — one row per day, JSONB payloads
{
  date: string,
  food_entries: { log: [ { name, cal, protein, carbs, fat, ... } ], water: number },
  macro_goals:  { cal: number, protein: number, carbs: number, fat: number }
}
```

---

## Roadmap

- [x] Project scaffolding
- [x] Webcam feed with MediaPipe skeleton overlay
- [x] Rep counting + form feedback for 9 exercises via Groq
- [x] AI coach chat with user context
- [x] Daily logging (weight + steps)
- [x] Goals and milestones
- [x] Progress dashboard with workout streak
- [x] Persist sessions, calories, and goals to Supabase
- [x] User authentication
- [x] Custom workout presets
- [x] Calorie & nutrition tracking with BMR/TDEE
- [x] 1RM progression charts
- [x] Mobile-responsive layout

---

## Team

| Name | Role |
|---|---|
| Nathan Anderson | Frontend Development & UI |
| Aiden Rubey | AI Chat & Backend |
| George Leyva | UI, Frontend & Integration |

---

## License

MIT
