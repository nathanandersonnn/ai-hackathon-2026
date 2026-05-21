const API = 'https://world.openfoodfacts.org/cgi/search.pl'

// Searches Open Food Facts (2.8M foods, free, no API key) and returns
// { cal, protein, carbs, fat } scaled to a serving size, or null on miss.
export async function searchFood(query) {
  const params = new URLSearchParams({
    search_terms: query,
    json: '1',
    page_size: '5',
    fields: 'nutriments,serving_quantity,serving_size',
  })

  try {
    const res = await fetch(`${API}?${params}`)
    if (!res.ok) return null
    const data = await res.json()

    for (const product of (data.products ?? [])) {
      const macros = extractMacros(product)
      if (macros) return macros
    }
  } catch {
    return null
  }

  return null
}

function extractMacros(product) {
  const n = product.nutriments
  if (!n) return null

  // Prefer kcal field; fall back to kJ ÷ 4.184
  const cal100 = n['energy-kcal_100g']
    ?? (n['energy_100g'] ? n['energy_100g'] / 4.184 : null)

  if (cal100 == null || cal100 <= 0) return null

  const protein100 = n['proteins_100g'] ?? 0
  const carbs100   = n['carbohydrates_100g'] ?? 0
  const fat100     = n['fat_100g'] ?? 0

  // Use product's serving size in grams when available, else 150 g default
  const servingG = product.serving_quantity || parseGrams(product.serving_size) || 150
  const f = servingG / 100

  return {
    cal:     Math.round(cal100 * f),
    protein: Math.round(protein100 * f),
    carbs:   Math.round(carbs100 * f),
    fat:     Math.round(fat100 * f),
  }
}

// Pulls the gram value out of strings like "30g", "1 cup (240g)", "100 ml"
function parseGrams(str) {
  if (!str) return null
  const m = str.match(/(\d+(?:\.\d+)?)\s*g/i)
  return m ? parseFloat(m[1]) : null
}
