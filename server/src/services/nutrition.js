// Nutrition normalization service.
//
// Each public function takes a raw payload from a food data source and
// returns a canonical FoodItem-shaped object:
//   {
//     name, brand,
//     servingSize, servingAmount, servingUnit, servingKnown,
//     perServing: { calories, protein, fat, carbs, ... },
//     nutrientSource, nutrientCoverage,
//     // identity fields like offBarcode/usdaFdcId set by caller
//   }
//
// Returning null means the payload is unusable (no calorie data at all).

import { NUTRIENT_KEYS, NUTRIENT_UNITS } from '../../../shared/logging/nutrients.js';

const BEVERAGE_CATEGORY_PATTERNS = [
  'beverages', 'drinks', 'beers', 'wines', 'spirits', 'sodas',
  'juices', 'waters', 'milks', 'teas', 'coffees',
];

function isBeverage(p) {
  const cats = p.categories_tags;
  if (Array.isArray(cats)) {
    for (const tag of cats) {
      if (typeof tag !== 'string') continue;
      if (BEVERAGE_CATEGORY_PATTERNS.some((pat) => tag.toLowerCase().includes(pat))) return true;
    }
  }
  const qty = typeof p.quantity === 'string' ? p.quantity.toLowerCase() : '';
  return /\b(ml|cl|dl|l|fl\s*oz)\b/.test(qty);
}

// OFF stores nutriments either at `_serving` (pre-scaled to one serving) or
// `_100g` (per 100 g/ml). Prefer _serving when present; fall back to _100g
// scaled by servingQty/100.
function pickNutrient(n, servingKey, per100Key, scale) {
  if (n[servingKey] != null) return Number(n[servingKey]);
  if (n[per100Key] != null) return Number(n[per100Key]) * scale;
  return undefined;
}

// kJ → kcal when only kJ is reported.
const KJ_PER_KCAL = 4.184;

// OFF nutriment key map: our canonical key → [serving suffix, 100g suffix]
// (OFF uses kebab-case nutriment keys, often hyphenated.)
const OFF_KEY_MAP = {
  protein: ['proteins_serving', 'proteins_100g'],
  fat: ['fat_serving', 'fat_100g'],
  saturatedFat: ['saturated-fat_serving', 'saturated-fat_100g'],
  carbs: ['carbohydrates_serving', 'carbohydrates_100g'],
  fiber: ['fiber_serving', 'fiber_100g'],
  sugar: ['sugars_serving', 'sugars_100g'],
  addedSugar: ['added-sugars_serving', 'added-sugars_100g'],
  cholesterol: ['cholesterol_serving', 'cholesterol_100g'],

  sodium: ['sodium_serving', 'sodium_100g'],
  potassium: ['potassium_serving', 'potassium_100g'],
  calcium: ['calcium_serving', 'calcium_100g'],
  iron: ['iron_serving', 'iron_100g'],
  magnesium: ['magnesium_serving', 'magnesium_100g'],
  zinc: ['zinc_serving', 'zinc_100g'],
  phosphorus: ['phosphorus_serving', 'phosphorus_100g'],
  copper: ['copper_serving', 'copper_100g'],
  selenium: ['selenium_serving', 'selenium_100g'],

  vitaminA: ['vitamin-a_serving', 'vitamin-a_100g'],
  vitaminC: ['vitamin-c_serving', 'vitamin-c_100g'],
  vitaminD: ['vitamin-d_serving', 'vitamin-d_100g'],
  vitaminE: ['vitamin-e_serving', 'vitamin-e_100g'],
  vitaminK: ['vitamin-k_serving', 'vitamin-k_100g'],
  vitaminB6: ['vitamin-b6_serving', 'vitamin-b6_100g'],
  vitaminB12: ['vitamin-b12_serving', 'vitamin-b12_100g'],
  thiamin: ['vitamin-b1_serving', 'vitamin-b1_100g'],
  riboflavin: ['vitamin-b2_serving', 'vitamin-b2_100g'],
  niacin: ['vitamin-pp_serving', 'vitamin-pp_100g'],
  folate: ['vitamin-b9_serving', 'vitamin-b9_100g'],
  choline: ['choline_serving', 'choline_100g'],

  caffeine: ['caffeine_serving', 'caffeine_100g'],
};

// Some OFF mineral/vitamin nutriments are reported in grams while we want mg
// or µg. OFF gives us *_unit on the same nutriment to disambiguate, but in
// practice for the canonical *_100g/*_serving fields they normalize to the
// SI-standard unit per nutrient (mg for most minerals, µg for selenium and
// most vitamins). Our NUTRIENT_UNITS map matches OFF's normalized choice, so
// no unit conversion needed for these.

function normalizeNutrientName(p) {
  let name = p.product_name;
  if (name && typeof name === 'object') {
    name = name.en || Object.values(name).find((v) => typeof v === 'string') || 'Unknown';
  }
  return name || 'Unknown';
}

function normalizeBrand(p) {
  return Array.isArray(p.brands) ? p.brands.join(', ') : (p.brands || '');
}

// Convert grams or millilitres to a sensible servingAmount/servingUnit
// pair. OFF gives us serving_quantity_unit — prefer that. Fall back to a
// beverage heuristic only when OFF didn't set a unit (rare).
function resolveServingUnit(p) {
  if (typeof p.serving_quantity_unit === 'string') {
    const u = p.serving_quantity_unit.toLowerCase();
    if (u === 'g' || u === 'ml') return u;
  }
  return isBeverage(p) ? 'ml' : 'g';
}

export function normalizeOffProduct(p) {
  const n = p.nutriments || {};

  // Energy is required — without it the entry is useless.
  const servingQtyRaw = p.serving_quantity != null ? Number(p.serving_quantity) : null;
  const servingKnown = servingQtyRaw != null && servingQtyRaw > 0;
  const servingQty = servingKnown ? servingQtyRaw : 100;
  const scale = servingQty / 100;

  let calories;
  if (n['energy-kcal_serving'] != null) calories = Number(n['energy-kcal_serving']);
  else if (n['energy-kcal_100g'] != null) calories = Number(n['energy-kcal_100g']) * scale;
  else if (n['energy-kj_serving'] != null) calories = Number(n['energy-kj_serving']) / KJ_PER_KCAL;
  else if (n['energy-kj_100g'] != null) calories = (Number(n['energy-kj_100g']) / KJ_PER_KCAL) * scale;
  else return null;

  const perServing = { calories };
  let micronutrientCount = 0;
  for (const [ourKey, [servingKey, per100Key]] of Object.entries(OFF_KEY_MAP)) {
    const v = pickNutrient(n, servingKey, per100Key, scale);
    if (v != null && Number.isFinite(v)) {
      perServing[ourKey] = v;
      // anything beyond core macros counts toward "has micros"
      if (!['protein', 'fat', 'carbs'].includes(ourKey)) micronutrientCount += 1;
    }
  }

  const unit = resolveServingUnit(p);

  let servingSize;
  if (typeof p.serving_size === 'string' && p.serving_size.trim()) {
    servingSize = p.serving_size.trim();
  } else if (servingKnown) {
    servingSize = `${Math.round(servingQty)} ${unit}`;
  } else {
    servingSize = '';
  }

  // Coverage classification:
  //   macros_only — only the four basic macros present
  //   label_only  — has a few micros (likely scraped from FDA-mandated label)
  //   partial     — meaningful micro coverage but probably not lab-analyzed
  let nutrientCoverage = 'macros_only';
  if (micronutrientCount >= 8) nutrientCoverage = 'partial';
  else if (micronutrientCount >= 1) nutrientCoverage = 'label_only';

  return {
    source: 'openfoodfacts',
    offBarcode: p.code || null,
    name: normalizeNutrientName(p),
    brand: normalizeBrand(p),
    servingSize,
    servingAmount: servingKnown ? servingQty : null,
    servingUnit: servingKnown ? unit : null,
    servingKnown,
    perServing: roundPerServing(perServing),
    nutrientSource: 'openfoodfacts',
    nutrientCoverage,
  };
}

function roundPerServing(p) {
  const out = {};
  for (const k of NUTRIENT_KEYS) {
    if (p[k] != null) {
      // Calories to integer; everything else 1 decimal.
      out[k] = k === 'calories' ? Math.round(p[k]) : Math.round(p[k] * 10) / 10;
    }
  }
  return out;
}

// Convenience: extract a flat nutrient summary from a populated FoodLog
// entry. Multiplies perServing by entry.servingCount.
export function entryNutrients(entry) {
  const food = entry.foodItemId;
  if (!food || !food.perServing) return {};
  const out = {};
  const s = entry.servingCount;
  for (const k of NUTRIENT_KEYS) {
    if (food.perServing[k] != null) out[k] = food.perServing[k] * s;
  }
  return out;
}

// ============================================================================
// USDA FoodData Central
// ============================================================================
//
// FDC has four datasets we read:
//   Branded         label-pulled, per-100g nutrients + servingSize/Unit + gtinUpc
//   Foundation      lab-analyzed staples, per-100g + foodPortions[] options
//   SR Legacy       legacy lab-analyzed, same shape as Foundation
//   Survey (FNDDS)  prepared foods used in NHANES, multiple portion options
//
// We map FDC nutrient IDs to our canonical names. FDC reports per-100g for
// every dataset, so we always scale by serving / 100.

// FDC nutrient ID → our canonical key. Energy has multiple IDs depending on
// the dataset/method; we pick the first present.
const USDA_NUTRIENT_ID_MAP = {
  1003: 'protein',
  1004: 'fat',
  1005: 'carbs',         // Carbohydrate, by difference
  1008: 'calories',      // Energy (kcal)
  1079: 'fiber',
  1087: 'calcium',
  1089: 'iron',
  1090: 'magnesium',
  1091: 'phosphorus',
  1092: 'potassium',
  1093: 'sodium',
  1095: 'zinc',
  1098: 'copper',
  1103: 'selenium',
  1106: 'vitaminA',
  1109: 'vitaminE',
  1114: 'vitaminD',
  1162: 'vitaminC',
  1165: 'thiamin',
  1166: 'riboflavin',
  1167: 'niacin',
  1175: 'vitaminB6',
  1177: 'folate',
  1178: 'vitaminB12',
  1180: 'choline',
  1185: 'vitaminK',
  1235: 'addedSugar',
  1253: 'cholesterol',
  1258: 'saturatedFat',
  2000: 'sugar',         // Total Sugars (NLEA)
  // Fallback energy variants when 1008 not present.
  2047: 'calories',      // Energy (Atwater General Factors)
  2048: 'calories',      // Energy (Atwater Specific Factors)
  // Caffeine
  1057: 'caffeine',
};

// FDC nutrient unit → our stored unit conversion factor (multiply value by
// this to land in our unit). undefined entries mean "already in our unit".
const USDA_UNIT_FACTOR = {
  G: { g: 1, mg: 1000, µg: 1_000_000 },
  MG: { g: 0.001, mg: 1, µg: 1000 },
  UG: { g: 1e-6, mg: 0.001, µg: 1 },
  KCAL: { kcal: 1 },
  IU: null,  // Intentionally unsupported — we prefer RAE/D2D3 over IU forms.
};

function convertUsdaUnit(value, fromUnitRaw, ourUnit) {
  if (value == null) return undefined;
  const fromUnit = String(fromUnitRaw || '').toUpperCase();
  const table = USDA_UNIT_FACTOR[fromUnit];
  if (!table) return undefined;
  const factor = table[ourUnit];
  if (factor == null) return undefined;
  return value * factor;
}

// Pick the first food portion that's plausibly a single serving. FDC's
// foodPortions[] for Foundation/SR/FNDDS contains things like "1 large",
// "1 cup", "100 g". We prefer the smallest "1 unit" portion since that's
// usually what users mean by "a serving".
function pickFoodPortion(food) {
  const portions = food.foodPortions || food.foodMeasures || [];
  if (!portions.length) return null;
  // Prefer entries with amount=1 and a description (e.g. "1 large").
  const single = portions.find((p) => Number(p.amount || 1) === 1 && (p.portionDescription || p.disseminationText || p.measureUnit?.name));
  return single || portions[0];
}

export function normalizeUsdaFood(food) {
  if (!food || typeof food !== 'object') return null;
  const dataType = food.dataType || '';
  const isBranded = dataType === 'Branded';

  // Build per-100g nutrient map first, then scale to one serving.
  const per100g = {};
  // Track which nutrient keys we've already filled — energy may appear under
  // multiple IDs and we want to keep the first.
  const filled = new Set();
  const nutrients = food.foodNutrients || [];
  for (const fn of nutrients) {
    // Search responses use {nutrientId, value, unitName}. Detail responses
    // nest as {nutrient: {id, unitName}, amount}. Handle both.
    const id = fn.nutrientId ?? fn.nutrient?.id ?? fn.nutrient?.number;
    const ourKey = USDA_NUTRIENT_ID_MAP[id];
    if (!ourKey || filled.has(ourKey)) continue;
    const rawValue = fn.value ?? fn.amount;
    if (rawValue == null) continue;
    const rawUnit = fn.unitName ?? fn.nutrient?.unitName;
    const converted = convertUsdaUnit(Number(rawValue), rawUnit, NUTRIENT_UNITS[ourKey]);
    if (converted == null) continue;
    per100g[ourKey] = converted;
    filled.add(ourKey);
  }

  // Energy required.
  if (per100g.calories == null) return null;

  // Resolve serving.
  let servingAmount = null;
  let servingUnit = null;
  let servingSize = '';
  let servingKnown = false;

  if (isBranded) {
    if (food.servingSize != null && food.servingSizeUnit) {
      const u = String(food.servingSizeUnit).toLowerCase();
      if (u === 'g' || u === 'ml') {
        servingAmount = Number(food.servingSize);
        servingUnit = u;
        servingKnown = true;
        servingSize = food.householdServingFullText
          ? `${food.householdServingFullText} (${Math.round(servingAmount)} ${servingUnit})`
          : `${Math.round(servingAmount)} ${servingUnit}`;
      }
    }
  } else {
    // Foundation / SR / FNDDS — pull a portion if available.
    const p = pickFoodPortion(food);
    if (p && p.gramWeight) {
      servingAmount = Number(p.gramWeight);
      servingUnit = 'g';
      servingKnown = true;
      const desc = p.portionDescription || p.disseminationText || p.measureUnit?.name;
      const amt = Number(p.amount || 1);
      const amtStr = amt === 1 ? '' : `${amt} `;
      servingSize = desc ? `${amtStr}${desc} (${Math.round(servingAmount)} g)` : `${Math.round(servingAmount)} g`;
    }
  }

  // If no usable serving, default to 100g/100ml as the implicit serving but
  // mark servingKnown=false so the UI can prompt.
  const scale = servingKnown ? servingAmount / 100 : 1;
  if (!servingKnown) {
    servingAmount = 100;
    servingUnit = 'g';
  }

  const perServing = {};
  let micronutrientCount = 0;
  for (const [k, v] of Object.entries(per100g)) {
    perServing[k] = v * scale;
    if (!['calories', 'protein', 'fat', 'carbs'].includes(k)) micronutrientCount += 1;
  }

  let nutrientCoverage = 'macros_only';
  if (isBranded) {
    nutrientCoverage = micronutrientCount >= 6 ? 'label_only' : 'macros_only';
  } else if (micronutrientCount >= 15) {
    nutrientCoverage = 'lab_analyzed';
  } else if (micronutrientCount >= 5) {
    nutrientCoverage = 'partial';
  }

  const nutrientSource =
    dataType === 'Branded' ? 'usda_branded'
    : dataType === 'Foundation' ? 'usda_foundation'
    : dataType === 'SR Legacy' ? 'usda_sr'
    : dataType.startsWith('Survey') ? 'usda_fndds'
    : 'usda_branded';

  // Brand string: prefer brandName, fall back to brandOwner.
  const brand = food.brandName || food.brandOwner || '';
  const name = food.description || food.foodName || 'Unknown';

  return {
    source: nutrientSource,
    usdaFdcId: String(food.fdcId),
    offBarcode: food.gtinUpc ? String(food.gtinUpc).replace(/^0+/, '') || String(food.gtinUpc) : null,
    name,
    brand,
    servingSize,
    servingAmount,
    servingUnit,
    servingKnown,
    perServing: roundPerServing(perServing),
    nutrientSource,
    nutrientCoverage,
  };
}

const FDC_BASE = 'https://api.nal.usda.gov/fdc/v1';
const USDA_USER_AGENT = 'ProtokolLab/0.1 (github.com/JeffJassky/protokol-lab)';

function getApiKey() {
  return process.env.USDA_FDC_API_KEY || '';
}

// Search USDA across Branded + Foundation + SR Legacy + Survey, ordered by
// USDA's relevance. Returns canonical-shape results. Returns [] (not error)
// when API key missing or request fails — caller falls back to OFF.
export async function searchUsda(query, { limit = 25, signal } = {}) {
  const key = getApiKey();
  if (!key || !query) return { results: [], debug: { skipped: !key ? 'no_api_key' : 'empty_query' } };

  const url = new URL(`${FDC_BASE}/foods/search`);
  url.searchParams.set('api_key', key);
  url.searchParams.set('query', query);
  url.searchParams.set('dataType', 'Branded,Foundation,SR Legacy,Survey (FNDDS)');
  url.searchParams.set('pageSize', String(limit));
  // Best-match ranking — FDC sorts by relevance by default.

  const t0 = Date.now();
  let resp;
  try {
    resp = await fetch(url, {
      headers: { 'User-Agent': USDA_USER_AGENT, Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    return { results: [], debug: { error: err.message, durationMs: Date.now() - t0 } };
  }

  if (!resp.ok) {
    return { results: [], debug: { status: resp.status, durationMs: Date.now() - t0 } };
  }
  const data = await resp.json();
  const foods = Array.isArray(data.foods) ? data.foods : [];
  const results = foods.map(normalizeUsdaFood).filter(Boolean);
  return {
    results,
    debug: {
      durationMs: Date.now() - t0,
      totalHits: data.totalHits,
      returned: foods.length,
      normalized: results.length,
    },
  };
}

// USDA has no direct barcode endpoint; we search Branded for the GTIN. The
// `gtinUpc` field is indexed and an exact-match search on a numeric query
// returns the matching products.
export async function getUsdaByBarcode(code, { signal } = {}) {
  const key = getApiKey();
  if (!key || !code) return { result: null, debug: { skipped: !key ? 'no_api_key' : 'empty_code' } };

  // Normalize the code (FDC may store with or without leading zeros).
  const trimmed = String(code).replace(/^0+/, '');

  const url = new URL(`${FDC_BASE}/foods/search`);
  url.searchParams.set('api_key', key);
  url.searchParams.set('query', trimmed);
  url.searchParams.set('dataType', 'Branded');
  url.searchParams.set('pageSize', '5');

  const t0 = Date.now();
  let resp;
  try {
    resp = await fetch(url, {
      headers: { 'User-Agent': USDA_USER_AGENT, Accept: 'application/json' },
      signal,
    });
  } catch (err) {
    return { result: null, debug: { error: err.message, durationMs: Date.now() - t0 } };
  }
  if (!resp.ok) return { result: null, debug: { status: resp.status, durationMs: Date.now() - t0 } };

  const data = await resp.json();
  const foods = Array.isArray(data.foods) ? data.foods : [];
  // Exact gtinUpc match wins. FDC's full-text query may pull near-matches.
  const codeNoZeros = trimmed;
  const codeWithZeros = String(code);
  const exact = foods.find((f) => {
    const g = String(f.gtinUpc || '').trim();
    return g === codeNoZeros || g === codeWithZeros || g.replace(/^0+/, '') === codeNoZeros;
  });
  const result = exact ? normalizeUsdaFood(exact) : null;
  return {
    result,
    debug: {
      durationMs: Date.now() - t0,
      totalHits: data.totalHits,
      foodsReturned: foods.length,
      matched: !!exact,
    },
  };
}
