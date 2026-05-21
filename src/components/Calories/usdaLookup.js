// USDA FoodData Central — free nutrition database, no auth required.
// https://fdc.nal.usda.gov/
// Set VITE_USDA_API_KEY in .env for higher rate limits (free signup).
// Falls back to DEMO_KEY (30 req/min) if not set.

const API_KEY = import.meta.env.VITE_USDA_API_KEY || 'DEMO_KEY'
const BASE    = 'https://api.nal.usda.gov/fdc/v1'

// Nutrient IDs used by USDA FoodData Central (all values are per 100g)
const NID = {
  cal:     1008,
  protein: 1003,
  carbs:   1005,
  fat:     1004,
  fiber:   1079,
  sugar:   2000,
  sodium:  1093,
}

function getVal(nutrients, id) {
  return nutrients.find(n => n.nutrientId === id)?.value ?? 0
}

function toGrams(amount, unit) {
  const u = (unit || 'g').toLowerCase().trim()
  if (u === 'oz' || u === 'ounce' || u === 'ounces')           return amount * 28.3495
  if (u === 'lb' || u === 'lbs' || u === 'pound' || u === 'pounds') return amount * 453.592
  if (u === 'kg' || u === 'kilogram' || u === 'kilograms')     return amount * 1000
  if (u === 'mg' || u === 'milligram')                         return amount * 0.001
  return amount // g, gram, grams, or unknown → treat as grams
}

/**
 * Look up a food in USDA and return scaled nutrients.
 * Returns null if the food isn't found or the request fails.
 *
 * @param {string} name   - Food name to search (e.g. "93% lean ground beef")
 * @param {number} amount - Quantity (e.g. 16)
 * @param {string} unit   - Unit (e.g. "oz", "g", "lb", "serving")
 */
export async function lookupUSDA(name, amount, unit) {
  const grams = toGrams(amount, unit)

  // "serving" means the USDA per-100g value, which is already a usable reference
  const factor = grams / 100

  let res
  try {
    res = await fetch(
      `${BASE}/foods/search?query=${encodeURIComponent(name)}&api_key=${API_KEY}&pageSize=3&dataType=Foundation,SR%20Legacy,Branded`
    )
  } catch {
    return null
  }
  if (!res.ok) return null

  const data = await res.json()
  const food = data.foods?.[0]
  if (!food) return null

  const n = food.foodNutrients || []
  return {
    name:    food.description,
    cal:     Math.round(getVal(n, NID.cal)     * factor),
    protein: Math.round(getVal(n, NID.protein) * factor),
    carbs:   Math.round(getVal(n, NID.carbs)   * factor),
    fat:     Math.round(getVal(n, NID.fat)     * factor),
    fiber:   Math.round(getVal(n, NID.fiber)   * factor),
    sugar:   Math.round(getVal(n, NID.sugar)   * factor),
    sodium:  Math.round(getVal(n, NID.sodium)  * factor),
  }
}
