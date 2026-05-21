const OLLAMA_URL = 'http://localhost:11434/api/generate'
const MODEL = 'llava'

const IMAGE_PROMPT =
  `You are a nutrition expert. Look at this food image and estimate the nutritional content for the portion visible.
Respond with ONLY a JSON object — no markdown, no explanation, nothing else:
{"name":"food name","cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0}
cal = total kilocalories. protein/carbs/fat/fiber/sugar = grams rounded to nearest integer. sodium = milligrams rounded to nearest integer.`

const TEXT_PROMPT = (description) =>
  `You are a nutrition expert. Estimate the nutritional content of: "${description}".
Assume a typical single serving unless a quantity is specified (e.g. "6oz", "1 cup").
Respond with ONLY a JSON object — no markdown, no explanation, nothing else:
{"name":"food name","cal":0,"protein":0,"carbs":0,"fat":0,"fiber":0,"sugar":0,"sodium":0}
cal = total kilocalories. protein/carbs/fat/fiber/sugar = grams rounded to nearest integer. sodium = milligrams rounded to nearest integer.`

export function useFoodScanner() {
  async function analyzeImage(imageUrl) {
    const { base64 } = await toBase64(imageUrl)
    return ollamaRequest({ prompt: IMAGE_PROMPT, images: [base64] }, 'photo')
  }

  async function analyzeText(description) {
    return ollamaRequest({ prompt: TEXT_PROMPT(description) }, 'text')
  }

  return { analyzeImage, analyzeText }
}

async function ollamaRequest(body, source) {
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

  const data = await res.json()
  const match = data.response?.match(/\{[\s\S]*\}/)
  if (!match) throw new Error('Could not parse model response')

  const result = JSON.parse(match[0])
  return { ...result, source }
}

async function toBase64(url) {
  const res = await fetch(url)
  const blob = await res.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve({ base64: reader.result.split(',')[1], mimeType: blob.type || 'image/jpeg' })
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}
