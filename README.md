# MyFitBud.ai

MyFitBud.ai is a web-based fitness companion that combines real-time pose estimation, conversational AI coaching, and daily progress tracking. Instead of just logging numbers, you can tell MyFitBud how you're actually feeling — sore, tired, slammed with work — and get coaching that responds to your real life, not just your schedule.

Point your camera at yourself during a workout and get live feedback on your form. Chat naturally with your coach. Track your weight, steps, and goals over time. MyFitBud ties it all together.

---

## Features

**Camera-Based Form Analysis**
Uses MediaPipe Pose Landmarker to track your joints in real time through your browser's webcam — no app install, no backend pose processing. After each set, joint-angle stats are sent to Claude (via the Agent SDK over OAuth) and you get plain-English feedback. Supported: Squat, Push-up, Deadlift, Lunge.

**Conversational AI Coaching**
Chat with MyFitBud the way you'd text a trainer. It knows your recent workouts, your goals, and how you've been feeling. Powered by Anthropic's Claude.

**Daily Logging**
Log your weight once per day and your step count.

**Goals & Milestones**
Set targets for weight, weekly workout frequency, or daily steps.

---

## Tech Stack

- **React + Vite** — frontend
- **MediaPipe Pose Landmarker** — in-browser pose estimation (33 keypoints @ ~30fps)
- **Express** — Node backend on `localhost:3001`, proxied by Vite
- **@anthropic-ai/claude-agent-sdk** — coaching layer, authenticated via your Claude.ai subscription (OAuth) — no API key needed
- **Supabase** — database, auth, real-time sync (planned)

---

## Getting Started

### Prerequisites

- **Node.js 20+** (the backend uses `--env-file` which needs 20.6+; 22 LTS or newer recommended)
- **A Claude.ai Pro or Max subscription** — the form-check backend uses your subscription via Claude Code's OAuth login, so you don't need a paid API key
- The **Claude Code CLI** installed and logged in (`claude /login`). This stores your OAuth credentials at `~/.claude/.credentials.json`, which the Agent SDK reads.

### Install

```bash
git clone https://github.com/nathanandersonnn/ai-hackathon-2026.git
cd ai-hackathon-2026
npm install
```

### Environment variables

Create a `.env` file in the project root.

For the form-check feature, the backend will use your existing Claude Code login automatically — no env var required. If you want to pin a long-lived token (e.g. for CI), generate one with `claude setup-token` and add:

```env
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-...
```

Supabase + standalone API key are still planned but not required to run the form-check feature today:

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

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
# → {"ok":true,"hasToken":<bool>}
```

If you get a connection refused, the backend didn't start (check the `[server]` lines in the `npm run dev` output).

### Troubleshooting

- **`/analyze-set` hangs indefinitely** — likely a leftover backend from a previous run is still holding port 3001 in a hung state. Find it with `ss -tlnp | grep :3001` (the process may appear as `MainThread`, not `node`). Kill the PID and restart.
- **"Camera permission denied"** — browsers only grant `getUserMedia` on secure origins. `localhost` counts, but a `192.168.x.x` LAN address does not.
- **The pose model takes a few seconds the first time** — MediaPipe downloads a ~5 MB `.task` file and WASM bundle from a CDN on first use.

---

## Project Structure

```
ai-hackathon-2026/
├── server/
│   └── index.js              # Express + Agent SDK form-check API
├── src/
│   ├── components/
│   │   ├── About/            # Team / project info page
│   │   ├── Calories/
│   │   ├── Camera/           # Webcam, MediaPipe overlay, rep counter UI
│   │   ├── Chat/             # AI coaching interface
│   │   ├── Dashboard/
│   │   ├── Goals/
│   │   ├── Logging/
│   │   └── Workouts/
│   ├── lib/
│   │   ├── api/              # Frontend wrappers for backend endpoints
│   │   │   ├── calories.js
│   │   │   ├── chat.js
│   │   │   └── formCheck.js  # POST /analyze-set
│   │   └── pose/             # MediaPipe setup + per-exercise rep counters
│   │       ├── poseDetector.js
│   │       └── exercises.js  # Squat / Push-up / Deadlift / Lunge trackers
│   ├── App.jsx
│   └── main.jsx
├── vite.config.js            # Dev-server proxy for /analyze-set + /health
└── package.json
```

---

## Data Models

```js
// Daily log
{ date: string, weight: number, steps: number }

// Workout session
{
  sessionId: string,
  date: string,
  exercises: [
    { name: string, sets: number, reps: number, formScore: number, feedback: string[] }
  ]
}
```

---

## Roadmap

- [x] Project scaffolding
- [x] Webcam feed with MediaPipe skeleton overlay
- [x] Squat / Push-up / Deadlift / Lunge rep counting + form feedback via Claude
- [ ] Claude API chat with user context
- [ ] Daily logging (weight + steps)
- [ ] Goals and milestones
- [ ] Progress dashboard
- [ ] Persist sessions to Supabase
- [ ] Mobile-responsive layout
- [ ] User authentication

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
