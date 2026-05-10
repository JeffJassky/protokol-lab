// Canonical nutrient definitions for the app. Every food source
// (OpenFoodFacts, USDA, manual entry, agent) normalizes into this shape.
//
// Adding a new nutrient: add the key here, the unit, the label, then run
// the migration script (idempotent — it only fills missing keys).

// Macronutrients tracked per serving on every FoodItem.
export const MACRO_KEYS = [
  'calories',
  'protein',
  'fat',
  'saturatedFat',
  'carbs',
  'fiber',
  'sugar',
  'addedSugar',
  'cholesterol',
];

// Minerals.
export const MINERAL_KEYS = [
  'sodium',
  'potassium',
  'calcium',
  'iron',
  'magnesium',
  'zinc',
  'phosphorus',
  'copper',
  'selenium',
];

// Vitamins.
export const VITAMIN_KEYS = [
  'vitaminA',
  'vitaminC',
  'vitaminD',
  'vitaminE',
  'vitaminK',
  'vitaminB6',
  'vitaminB12',
  'thiamin',
  'riboflavin',
  'niacin',
  'folate',
  'choline',
];

// Other compounds we surface (caffeine for coffee/energy drinks, etc.)
export const OTHER_KEYS = ['caffeine'];

export const NUTRIENT_KEYS = [
  ...MACRO_KEYS,
  ...MINERAL_KEYS,
  ...VITAMIN_KEYS,
  ...OTHER_KEYS,
];

// Display unit for each nutrient. Values are stored in these units; we never
// store unit alongside value.
export const NUTRIENT_UNITS = {
  calories: 'kcal',
  protein: 'g',
  fat: 'g',
  saturatedFat: 'g',
  carbs: 'g',
  fiber: 'g',
  sugar: 'g',
  addedSugar: 'g',
  cholesterol: 'mg',

  sodium: 'mg',
  potassium: 'mg',
  calcium: 'mg',
  iron: 'mg',
  magnesium: 'mg',
  zinc: 'mg',
  phosphorus: 'mg',
  copper: 'mg',
  selenium: 'µg',

  vitaminA: 'µg',   // RAE
  vitaminC: 'mg',
  vitaminD: 'µg',
  vitaminE: 'mg',
  vitaminK: 'µg',
  vitaminB6: 'mg',
  vitaminB12: 'µg',
  thiamin: 'mg',
  riboflavin: 'mg',
  niacin: 'mg',
  folate: 'µg',     // DFE
  choline: 'mg',

  caffeine: 'mg',
};

export const NUTRIENT_LABELS = {
  calories: 'Calories',
  protein: 'Protein',
  fat: 'Fat',
  saturatedFat: 'Saturated Fat',
  carbs: 'Carbs',
  fiber: 'Fiber',
  sugar: 'Sugar',
  addedSugar: 'Added Sugar',
  cholesterol: 'Cholesterol',

  sodium: 'Sodium',
  potassium: 'Potassium',
  calcium: 'Calcium',
  iron: 'Iron',
  magnesium: 'Magnesium',
  zinc: 'Zinc',
  phosphorus: 'Phosphorus',
  copper: 'Copper',
  selenium: 'Selenium',

  vitaminA: 'Vitamin A',
  vitaminC: 'Vitamin C',
  vitaminD: 'Vitamin D',
  vitaminE: 'Vitamin E',
  vitaminK: 'Vitamin K',
  vitaminB6: 'Vitamin B6',
  vitaminB12: 'Vitamin B12',
  thiamin: 'Thiamin (B1)',
  riboflavin: 'Riboflavin (B2)',
  niacin: 'Niacin (B3)',
  folate: 'Folate',
  choline: 'Choline',

  caffeine: 'Caffeine',
};

// Empty perServing object with all keys present and 0 — useful as a
// reduce() initial value for daily/weekly totals.
export function emptyNutrients() {
  const out = {};
  for (const k of NUTRIENT_KEYS) out[k] = 0;
  return out;
}

// Multiply each present nutrient by a serving count. Missing keys stay
// missing (we don't fabricate zeros — that would imply we know the food
// has none of that nutrient when really we just don't have data).
export function scaleNutrients(perServing, servings) {
  if (!perServing) return {};
  const out = {};
  for (const k of NUTRIENT_KEYS) {
    if (perServing[k] != null) out[k] = perServing[k] * servings;
  }
  return out;
}

// Add `add` into `acc` in place. Adds a key only when `add` has it set;
// if `acc` doesn't have it yet, treats as 0.
export function addNutrients(acc, add) {
  if (!add) return acc;
  for (const k of NUTRIENT_KEYS) {
    if (add[k] != null) acc[k] = (acc[k] || 0) + add[k];
  }
  return acc;
}

// Round each value in a perServing object to N decimals (default 1).
export function roundNutrients(perServing, decimals = 1) {
  const factor = 10 ** decimals;
  const out = {};
  for (const k of NUTRIENT_KEYS) {
    if (perServing?.[k] != null) {
      out[k] = Math.round(perServing[k] * factor) / factor;
    }
  }
  return out;
}
