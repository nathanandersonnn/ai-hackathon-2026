import { lookupUSDA } from './usdaLookup'

const OLLAMA_URL = 'http://localhost:11434/api/generate'
const MODEL = 'llava'

// ── Step 1 prompts: identify food + portion only ──────────────────────────────
// LLaVA is asked to identify, NOT to estimate nutrition.
// Nutrition comes from USDA (accurate) with LLaVA nutrition as fallback.

const IMAGE_IDENTIFY_PROMPT =
  `You are a food identification expert. Look at this food image.
Identify the food as specifically as possible and estimate the portion weight.
Respond with ONLY a JSON object — no markdown, no explanation:
{"name":"specific food name","amount":0,"unit":"g"}
name = be specific (e.g. "93% lean ground beef cooked" not just "meat").
amount = estimated grams visible in the image.
unit = always "g".`

const TEXT_PARSE_PROMPT = (description) =>
  `Extract the food item and portion from this description: "${description}".
Respond with ONLY a JSON object — no markdown, no explanation:
{"name":"specific food name","amount":0,"unit":"oz or g or lb or cup or serving"}
name = be specific for nutrition lookup (e.g. "93% lean ground beef raw").
amount = the number only. unit = the measurement unit.`

// ── Step 2 fallback prompt: LLaVA estimates nutrition directly ────────────────
// Used only when USDA lookup fails (food not in database).

const IMAGE_NUTRITION_PROMPT =
  `You are a nutrition expert. Estimate the nutritional content of the food visible in this image.
Respond with ONLY a JSON object — no markdown, no explanation:
{"name":"food name","cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0}
cal = kcal. protein/carbs/fat/fiber/sugar = grams. sodium = milligrams. All rounded to nearest integer.`

const TEXT_NUTRITION_PROMPT = (description) =>
  `You are a nutrition expert. Estimate nutritional content of: "${description}".
Assume a typical single serving unless quantity is specified.
Respond with ONLY a JSON object — no markdown, no explanation:
{"name":"food name","cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0}
cal = kcal. protein/carbs/fat/fiber/sugar = grams. sodium = milligrams. All rounded to nearest integer.`

// ─────────────────────────────────────────────────────────────────────────────

export function useFoodScanner() {
  async function analyzeImage(imageUrl) {
    const { base64 } = await toBase64(imageUrl)

    // Step 1 — identify food + portion
    let identified = null
    try {
      const raw = await ollamaRequest({ prompt: IMAGE_IDENTIFY_PROMPT, images: [base64] })
      identified = parseJSON(raw.response)
    } catch {}

    // Step 2 — USDA lookup if we got a name and amount
    if (identified?.name && identified?.amount) {
      const usda = await lookupUSDA(identified.name, identified.amount, identified.unit || 'g')
      if (usda) return { ...usda, source: 'photo' }
    }

    // Fallback — let LLaVA estimate nutrition directly
    const fallback = await ollamaRequest({ prompt: IMAGE_NUTRITION_PROMPT, images: [base64] })
    return { ...parseJSON(fallback.response), source: 'photo' }
  }

  async function analyzeText(description) {
    // Step 1 — parse food name + portion from text
    let identified = null
    try {
      const raw = await ollamaRequest({ prompt: TEXT_PARSE_PROMPT(description) })
      identified = parseJSON(raw.response)
    } catch {}

    // Step 2 — USDA lookup
    if (identified?.name && identified?.amount) {
      const usda = await lookupUSDA(identified.name, identified.amount, identified.unit || 'g')
      if (usda) return { ...usda, source: 'text' }
    }

    // Fallback — let LLaVA estimate nutrition directly
    const fallback = await ollamaRequest({ prompt: TEXT_NUTRITION_PROMPT(description) })
    return { ...parseJSON(fallback.response), source: 'text' }
  }

  return { analyzeImage, analyzeText }
}

// ── helpers ───────────────────────────────────────────────────────────────────

async function ollamaRequest(body) {
  let res
  try {
    res = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, stream: false, format: 'json', ...body }),
    })
  } catch {
    throw new Error('Could not reach Ollama. Make sure it is running: ollama serve')
  }

  if (res.status === 404) throw new Error('LLaVA model not found. Run: ollama pull llava')
  if (!res.ok) throw new Error(`Ollama error: ${res.status}`)

  return res.json()
}

function parseJSON(text) {
  const match = (text || '').match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Could not parse model response')
  return JSON.parse(match[0])
}

async function toBase64(url) {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve({ base64: reader.result.split(',')[1] })
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
