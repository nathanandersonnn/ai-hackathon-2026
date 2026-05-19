// ─────────────────────────────────────────────
//  Calorie & Nutrition API
//  Text-based food lookup and photo analysis.
//
//  ENV VARS NEEDED (add to your .env file):
//    VITE_NUTRITION_API_URL=https://your-backend.com
//    VITE_NUTRITION_API_KEY=your_key_here
//
//  The photo endpoint expects your backend to run
//  a vision model (e.g. Claude vision, GPT-4o)
//  and return structured nutrition data.
// ─────────────────────────────────────────────

const BASE_URL = import.meta.env.VITE_NUTRITION_API_URL
const API_KEY  = import.meta.env.VITE_NUTRITION_API_KEY

/**
 * Look up nutrition info for a plain-text food description.
 *
 * @param {string} description - e.g. "6oz chicken breast no seasoning"
 *
 * @returns {Promise<NutritionResult>}
 */
export async function lookupFoodText(description) {
  const response = await fetch(`${BASE_URL}/nutrition/text`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ description }),
  })

  if (!response.ok) throw new Error(`Nutrition API error: ${response.status}`)
  return response.json()
}

/**
 * Send a food photo to the backend for vision-based analysis.
 *
 * @param {File} imageFile - The image file from the file picker or camera
 *
 * @returns {Promise<NutritionResult>}
 */
export async function analyzeFoodPhoto(imageFile) {
  const formData = new FormData()
  formData.append('image', imageFile)

  const response = await fetch(`${BASE_URL}/nutrition/photo`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      // Do NOT set Content-Type here — the browser sets it with the correct boundary
    },
    body: formData,
  })

  if (!response.ok) throw new Error(`Nutrition API error: ${response.status}`)
  return response.json()
}

/**
 * @typedef {object} NutritionResult
 * @property {string} name    - Identified food name
 * @property {number} cal     - Calories (kcal)
 * @property {number} protein - Grams of protein
 * @property {number} carbs   - Grams of carbohydrates
 * @property {number} fat     - Grams of fat
 */
