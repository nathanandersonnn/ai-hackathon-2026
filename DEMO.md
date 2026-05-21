# MyFitBud.ai — Demo Guide

## Starting the App

```bash
cd ai-hackathon-2026
npm install
npm run dev
```

Open the `localhost` URL printed in your terminal (usually `http://localhost:5173`).

---

## Calories Feature (George's Section)

Located in the **Calories** tab in the left sidebar.

The feature has two modes depending on whether you have Ollama running:

| Mode | Requires | What works |
|------|----------|------------|
| Full AI mode | Ollama + LLaVA running locally | Text description → macros, Photo → macros |
| Manual mode | Nothing extra | Quick Add form, date navigation, all tracking |

---

## Setting Up the AI Image Analyzer (Ollama + LLaVA)

The food photo and text analyzer runs a local AI model through **Ollama** — no API keys, no rate limits, no cost. Everything stays on your machine.

### Step 1 — Install Ollama

Go to **https://ollama.com** and download the app for your OS (Mac, Windows, or Linux).

On Mac: open the downloaded `.dmg` and drag Ollama to your Applications folder, then launch it. You should see the Ollama icon appear in your menu bar.

On Windows/Linux: follow the installer, then make sure `ollama` is available in your terminal.

### Step 2 — Pull the LLaVA model

LLaVA is the vision model that reads food photos and descriptions. Open a terminal and run:

```bash
ollama pull llava
```

This downloads the model (~4 GB). You only need to do this once.

### Step 3 — Start Ollama

If the Ollama desktop app is already running (menu bar icon visible), you're done — it starts the server automatically.

If you're using the CLI instead:

```bash
ollama serve
```

Leave that terminal open while using the app.

### Step 4 — Verify it's working

In a separate terminal:

```bash
curl http://localhost:11434
```

You should see: `Ollama is running`

---

## Using the Calories Tab

### Date Navigation

The date bar at the top lets you move between days. Click the arrows to go forward or back one day, click the date itself to open a calendar picker, or click **Today** to jump back to the current date. Each day's data is saved separately and persists across page reloads.

### Setting Your Calorie & Macro Goals

In the **Summary** card on the left:

1. Click **Edit Goals** next to the Macros section.
2. Enter your daily targets for calories, protein, carbs, and fat.
3. Click **Save**.

Alternatively, fill out the **Calorie Goal (BMR + TDEE)** card at the bottom left with your stats and click **Set My Calorie Goal** — then click **Apply X kcal as my calorie goal** to push your calculated TDEE directly into the goal.

Goals are saved to your browser and persist across sessions.

### Logging Food — Text Description (AI)

> Requires Ollama + LLaVA running (Steps 1–3 above).

1. Find the **Log Food — Describe It** card on the right.
2. Type what you ate, e.g. `6oz grilled chicken breast` or `a bowl of oatmeal with blueberries`.
3. Press Enter or click **Add**.

The AI estimates calories, protein, carbs, and fat and adds the item to your log.

### Logging Food — Photo (AI)

> Requires Ollama + LLaVA running (Steps 1–3 above).

1. Find the **Log Food — Photo** card on the right.
2. Click the upload area and select a photo of your food (JPG, PNG, or HEIC).
3. Click **Analyze Photo**.

The AI identifies the food and estimates its macros. This takes 5–20 seconds depending on your machine.

**Tips for better results:**
- Good lighting and a clear view of the food helps accuracy.
- Single-dish photos work better than a full tray.
- The model works best with common meals — it handles almost anything but exotic dishes may need a text description instead.

### Quick Add (No AI needed)

If Ollama isn't running, use **Quick Add** on the right to manually enter macros:

1. Click **Show** next to Quick Add.
2. Enter the food name, calories (required), and any macros you know.
3. Optionally expand **Add micronutrients** to log fiber, sugar, and sodium.
4. Click **Add Entry**.

### Tracking Water Intake

In the Summary card, use the **+** and **−** buttons next to the water section to log glasses of water. Each day starts at zero.

### Viewing Past Days

The **Past Days** panel at the bottom left shows up to 7 previous days with their total calorie counts. Click **Go →** next to any day to jump to it and see or edit that day's log.

### Exporting Your Data

Click **Export JSON** in the top-right corner of the page to download all your food logs as a JSON file.

---

## Troubleshooting

**"Could not reach Ollama"**
Ollama isn't running. Launch the Ollama desktop app or run `ollama serve` in a terminal.

**"LLaVA model not found. Run: ollama pull llava"**
You haven't downloaded the model yet. Run `ollama pull llava` in a terminal (~4 GB download).

**Analysis takes very long**
LLaVA is running on CPU if you don't have a supported GPU. It will still work but can take 30–60 seconds per request. This is normal.

**Results look inaccurate**
The AI gives estimates, not lab values. For precise tracking, use Quick Add with the nutrition label values from the food packaging.

---

## Other Features

| Tab | What it does |
|-----|-------------|
| **Dashboard** | Weekly step chart, recent workout sessions, and a snapshot of today's stats |
| **AI Coach** | Chat with your fitness coach — knows your recent logs and goals |
| **Workouts** | Browse suggested workout plans; log sessions with sets and reps |
| **Logging** | Track daily weight and step count with a history table |
| **Goals** | Set and track targets for weight, workout frequency, and steps |
| **Camera** | Live form check via webcam using MediaPipe pose estimation |
| **About** | Meet the team |
