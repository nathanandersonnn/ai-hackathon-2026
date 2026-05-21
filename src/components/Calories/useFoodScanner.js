import { lookupUSDA } from './usdaLookup'

const OLLAMA_URL = 'http://localhost:11434/api/generate'
const MODEL = 'llava'

// ── Text path: parse quantity + unit ourselves (don't trust LLaVA for units) ──
// Handles: "16 oz chicken", "500g rice", "2 cups oatmeal", "6oz steak", "1.5 lb beef"
const UNIT_PATTERN = 'oz|ounces?|lbs?|pounds?|grams?|g|kg|cups?|tbsp|tablespoons?|tsp|teaspoons?|servings?|pieces?|slices?'
const QUANTITY_RE  = new RegExp(`^([\\d.]+)\\s*(${UNIT_PATTERN})[\\s,]+(.+)$`, 'i')

function parseTextInput(description) {
  const match = description.match(QUANTITY_RE)
  if (match) {
    return { amount: parseFloat(match[1]), unit: match[2], name: match[3].trim() }
  }
  // No leading quantity — treat whole description as food name, 1 serving
  return { amount: 1, unit: 'serving', name: description.trim() }
}

// ── Query cleaning: runs on the food name AFTER quantity/unit are parsed ──────

// Fat-ratio qualifiers like "85/15" or "90/10". The slash breaks sanitizeQuery
// in usdaLookup, so we pull these out first, convert to "85 15", then
// re-append so USDA can still match e.g. "Ground beef, 85% lean meat / 15% fat".
const FAT_RATIO_RE = /\b(\d{1,3})\/(\d{1,3})\b/g

// Phrases that add no value to a USDA query (seasoning/prep language that
// USDA doesn't index). Stripped after quantity is parsed so we never
// accidentally lose the food name itself.
const NOISE_RE = /\b(no\s+\w+|without\s+\w+|plain|unseasoned|raw|cooked|grilled|baked|fried|steamed|boiled|roasted|skinless|boneless)\b/gi

/**
 * Cleans a parsed food name for a USDA query:
 *  1. Extracts fat-ratio qualifiers (e.g. "85/15" → saved as "85 15")
 *  2. Strips noise words/phrases
 *  3. Re-appends the ratio so USDA can match the lean/fat percentage
 *
 * "85/15 ground beef no seasoning" → "ground beef 85 15"
 */
function cleanQueryName(name) {
  const ratios = []
  const withoutRatios = name.replace(FAT_RATIO_RE, (_, a, b) => {
    ratios.push(`${a} ${b}`)
    return ' '
  })

  const cleaned = withoutRatios
    .replace(NOISE_RE, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()

  return ratios.length ? `${cleaned} ${ratios.join(' ')}`.trim() : cleaned
}

// ── Photo path: LLaVA identifies food + estimates weight in grams ─────────────
// Always ask for grams so there's no unit ambiguity.
const IMAGE_IDENTIFY_PROMPT =
  `You are a food identification expert. Look at this food image.
Identify the food as specifically as possible and estimate the total weight in grams.
Respond with ONLY a JSON object — no markdown, no explanation:
{"name":"specific food name","grams":0}
name = be very specific (e.g. "93% lean ground beef cooked" not just "meat").
grams = your best estimate of the total weight of all food visible in grams.`

// ── Fallback: LLaVA estimates nutrition directly (used when USDA lookup fails) ─
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

    // Step 1 — LLaVA identifies food name + estimates grams
    let identified = null
    try {
      const raw = await ollamaRequest({ prompt: IMAGE_IDENTIFY_PROMPT, images: [base64] })
      identified = parseJSON(raw.response)
    } catch {}

    // Step 2 — USDA lookup with the identified name and gram estimate
    if (identified?.name && identified?.grams > 0) {
      const usda = await lookupUSDA(identified.name, identified.grams, 'g')
      if (usda) return { ...usda, source: 'photo' }
    }

    // Fallback — LLaVA estimates nutrition directly
    const fallback = await ollamaRequest({ prompt: IMAGE_NUTRITION_PROMPT, images: [base64] })
    return { ...parseJSON(fallback.response), source: 'photo' }
  }

  async function analyzeText(description) {
    // Step 1 — parse quantity + unit from text ourselves (reliable)
    const { amount, unit, name } = parseTextInput(description)

    // Step 2 — clean the name for USDA: strip noise, preserve fat-ratio qualifiers
    const cleanedName = cleanQueryName(name)

    // Step 3 — USDA lookup with the cleaned name
    const usda = await lookupUSDA(cleanedName, amount, unit)
    if (usda) return { ...usda, source: 'text' }

    // Fallback — LLaVA estimates nutrition directly
    try {
      const fallback = await ollamaRequest({ prompt: TEXT_NUTRITION_PROMPT(description) })
      return { ...parseJSON(fallback.response), source: 'text' }
    } catch (err) {
      throw new Error(`Could not find "${name}" in nutrition database and Ollama is not available.`)
    }
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
