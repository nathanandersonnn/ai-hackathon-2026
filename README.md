# ai-hackathon-2026
# MyFitBud.ai

MyFitBud.ai is a web-based fitness companion that combines real-time pose estimation, conversational AI coaching, and daily progress tracking. Instead of just logging numbers, you can tell MyFitBud how you're actually feeling — sore, tired, slammed with work — and get coaching that responds to your real life, not just your schedule.

Point your camera at yourself during a workout and get live feedback on your form. Chat naturally with your coach. Track your weight, steps, and goals over time. MyFitBud ties it all together.

---

## Features

**Camera-Based Form Analysis**  
Uses MediaPipe Pose Landmarker to track your joints in real time through your browser's webcam — no app install, no backend processing. After each set, you get plain-English feedback on what to fix, like knee alignment, back posture, or squat depth.

**Conversational AI Coaching**  
Chat with MyFitBud the way you'd text a trainer. It knows your recent workouts, your goals, and how you've been feeling. Tell it you're exhausted and it'll adjust. Tell it you only have 20 minutes and it'll plan accordingly. Powered by the Anthropic Claude API.

**Daily Logging**  
Log your weight once per day and your step count. Simple, low-friction, consistent.

**Goals & Milestones**  
Set targets for weight, weekly workout frequency, or daily steps. MyFitBud tracks your progress and references your goals in coaching conversations so nothing feels disconnected.

---

## Tech Stack

- **React** — frontend UI
- **MediaPipe Pose Landmarker** — in-browser pose estimation and joint angle detection
- **Anthropic Claude API** — conversational coaching layer
- **Supabase** — database, auth, and real-time sync

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project
- An [Anthropic API key](https://console.anthropic.com)

### Install

```bash
git clone https://github.com/your-org/myfitbud-ai.git
cd myfitbud-ai
npm install
```

### Environment Variables

Create a `.env` file in the root of the project:

```env
VITE_ANTHROPIC_API_KEY=your_key_here
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Run

```bash
npm run dev
```

---

## Project Structure

```
myfitbud-ai/
├── src/
│   ├── components/
│   │   ├── Camera/         # Webcam feed, skeleton overlay, form feedback
│   │   ├── Chat/           # AI coaching interface
│   │   ├── Dashboard/      # Progress charts and stats
│   │   ├── Logging/        # Weight and steps input
│   │   └── Goals/          # Goal setting and milestone tracking
│   ├── lib/
│   │   ├── pose/           # MediaPipe setup, joint angle logic, exercise rules
│   │   ├── ai/             # Claude API calls and context assembly
│   │   └── supabase/       # Database client and data queries
│   ├── App.jsx
│   └── main.jsx
├── .env.example
└── README.md
```

---

## Data Models

These are the core shapes shared across the camera, chat, and logging layers. Agreeing on these early keeps the pieces from fighting each other at integration time.

```js
// Daily log
{
  date: string,        // ISO date string
  weight: number,      // lbs or kg
  steps: number
}

// Workout session
{
  sessionId: string,
  date: string,
  exercises: [
    {
      name: string,        // e.g. "squat"
      sets: number,
      reps: number,
      formScore: number,   // 0–100
      feedback: string[]   // e.g. ["knees caving inward", "good depth"]
    }
  ]
}

// Context object sent to Claude on each message
{
  recentLogs: DailyLog[],
  recentSessions: WorkoutSession[],
  goals: UserGoals,
  userMessage: string
}
```

---

## Roadmap

- [x] Project scaffolding
- [ ] Webcam feed with MediaPipe skeleton overlay
- [ ] Squat form detection and feedback
- [ ] Claude API chat with user context
- [ ] Daily logging (weight + steps)
- [ ] Goals and milestones
- [ ] Progress dashboard
- [ ] More exercises (deadlift, push-up, lunge)
- [ ] Mobile-responsive layout
- [ ] User authentication

---

## Team

| Name | Role |
|---|---|
| — | Camera & Pose Estimation |
| — | AI Chat & Backend |
| — | UI, Frontend & Integration |

---

## License

MIT