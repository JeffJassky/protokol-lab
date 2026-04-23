import { Router } from 'express';
import FoodItem from '../models/FoodItem.js';
import FavoriteFood from '../models/FavoriteFood.js';
import RecentFood from '../models/RecentFood.js';
import Meal from '../models/Meal.js';

const router = Router();

// OFF categories that indicate a liquid product. Nutriments are still stored
// "per 100 g" by OFF convention but the label and mental-model should be ml.
const BEVERAGE_CATEGORY_PATTERNS = [
  'beverages',
  'drinks',
  'beers',
  'wines',
  'spirits',
  'sodas',
  'juices',
  'waters',
  'milks',
  'teas',
  'coffees',
];

function isBeverage(p) {
  const cats = p.categories_tags;
  if (Array.isArray(cats)) {
    for (const tag of cats) {
      if (typeof tag !== 'string') continue;
      const lower = tag.toLowerCase();
      if (BEVERAGE_CATEGORY_PATTERNS.some((pat) => lower.includes(pat))) return true;
    }
  }
  // Fallback: look at the product quantity string ("355 ml", "1 l", "12 fl oz").
  const qty = typeof p.quantity === 'string' ? p.quantity.toLowerCase() : '';
  if (/\b(ml|cl|dl|l|fl\s*oz)\b/.test(qty)) return true;
  return false;
}

function normalizeOffProduct(p) {
  const n = p.nutriments || {};
  const beverage = isBeverage(p);
  const unit = beverage ? 'ml' : 'g';

  // Prefer explicit serving_quantity, else fall back to 100 for "per 100 g/ml".
  const servingQty = p.serving_quantity || 100;
  const scale = servingQty / 100;

  const kcalServing = n['energy-kcal_serving'];
  const kcal100 = n['energy-kcal_100g'];
  const kjServing = n['energy-kj_serving'];
  const kj100 = n['energy-kj_100g'];

  let caloriesPer;
  if (kcalServing != null) caloriesPer = kcalServing;
  else if (kcal100 != null) caloriesPer = kcal100 * scale;
  else if (kjServing != null) caloriesPer = kjServing / 4.184;
  else if (kj100 != null) caloriesPer = (kj100 / 4.184) * scale;
  else return null; // skip items with no calorie data

  const val = (serving, per100) => {
    if (serving != null) return serving;
    if (per100 != null) return per100 * scale;
    return 0;
  };

  // Search-a-licious returns `brands` as an array; the legacy v2 API returned a
  // comma-separated string. Normalize to a string so downstream consumers (UI +
  // Mongoose String schema on FoodItem.brand) get a consistent type.
  const brand = Array.isArray(p.brands)
    ? p.brands.join(', ')
    : p.brands || '';

  // product_name can also arrive as a per-language object on Search-a-licious
  // (e.g. { en: "Happy Farms", fr: "..." }) — pick English first, then any value.
  let name = p.product_name;
  if (name && typeof name === 'object') {
    name = name.en || Object.values(name).find((v) => typeof v === 'string') || 'Unknown';
  }

  // Human-friendly serving label:
  //   - If OFF provided a serving_size string (e.g. "12 fl oz (355 ml)"), use it.
  //   - Else if serving_quantity is known, show "<n> <unit>".
  //   - Else show "per 100 <unit>" so the user knows this is per-100 data, not
  //     a real serving size. Previously this silently showed "100g" for liquids.
  let servingSize;
  if (typeof p.serving_size === 'string' && p.serving_size.trim()) {
    servingSize = p.serving_size.trim();
  } else if (p.serving_quantity) {
    servingSize = `${Math.round(servingQty)} ${unit}`;
  } else {
    servingSize = `per 100 ${unit}`;
  }

  return {
    source: 'openfoodfacts',
    offBarcode: p.code || null,
    name: name || 'Unknown',
    brand,
    servingSize,
    servingGrams: Math.round(servingQty),
    caloriesPer: Math.round(caloriesPer),
    proteinPer: Math.round(val(n.proteins_serving, n.proteins_100g)),
    fatPer: Math.round(val(n.fat_serving, n.fat_100g)),
    carbsPer: Math.round(val(n.carbohydrates_serving, n.carbohydrates_100g)),
  };
}

// Compute meal totals (cal/p/f/c) from its populated items so the client can
// render a summary row without duplicating the math. Returns zeroes for items
// whose food reference has been deleted.
function summarizeMeal(meal) {
  let cal = 0;
  let p = 0;
  let f = 0;
  let c = 0;
  for (const item of meal.items) {
    const food = item.foodItemId;
    if (!food || typeof food !== 'object') continue;
    cal += (food.caloriesPer || 0) * item.servingCount;
    p += (food.proteinPer || 0) * item.servingCount;
    f += (food.fatPer || 0) * item.servingCount;
    c += (food.carbsPer || 0) * item.servingCount;
  }
  return {
    caloriesPer: Math.round(cal),
    proteinPer: Math.round(p),
    fatPer: Math.round(f),
    carbsPer: Math.round(c),
  };
}

// Search: meals (user's own) + local FoodItems + OpenFoodFacts
router.get('/search', async (req, res) => {
  const { q, page = 1 } = req.query;
  if (!q || !q.trim()) return res.json({ results: [] });

  // User meals — simple case-insensitive substring on name. Small result set
  // per user, so no need for a text index.
  const userMeals = await Meal.find({
    userId: req.userId,
    name: { $regex: q.trim(), $options: 'i' },
  })
    .limit(10)
    .populate('items.foodItemId');

  const meals = userMeals.map((m) => {
    const totals = summarizeMeal(m);
    return {
      source: 'meal',
      _id: m._id,
      name: m.name,
      emoji: m.emoji || '',
      brand: `${m.items.length} item${m.items.length === 1 ? '' : 's'}`,
      itemCount: m.items.length,
      servingSize: '1 meal',
      servingGrams: 0,
      ...totals,
    };
  });

  // Local search
  const localResults = await FoodItem.find(
    { $text: { $search: q } },
    { score: { $meta: 'textScore' } },
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(5);

  const local = localResults.map((item) => ({
    source: 'local',
    _id: item._id,
    offBarcode: item.offBarcode,
    name: item.name,
    emoji: item.emoji || '',
    brand: item.brand,
    servingSize: item.servingSize,
    servingGrams: item.servingGrams,
    caloriesPer: item.caloriesPer,
    proteinPer: item.proteinPer,
    fatPer: item.fatPer,
    carbsPer: item.carbsPer,
  }));

  // OpenFoodFacts search
  let off = [];
  const offDebug = { query: q, page: Number(page) };
  try {
    // Use Search-a-licious (search.openfoodfacts.org) instead of the legacy
    // world.openfoodfacts.org/api/v2/search — the main host has been returning
    // 503s for search traffic. Search-a-licious is OFF's dedicated search service.
    //
    // Tokenize so we can both (a) pass a cleaned query to the API and
    // (b) re-rank results client-side based on token coverage. Search-a-licious
    // uses OR-ish multi-field matching, so we can't rely on the API alone for
    // precision when tokens span fields (e.g. brand + product name).
    const tokens = q
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[+\-!(){}[\]^"~*?:\\/]/g, '').trim())
      .filter(Boolean);
    const cleanQuery = tokens.join(' ');
    // Over-fetch so that after re-ranking we still have enough relevant hits.
    const pageSize = 50;

    const url = new URL('https://search.openfoodfacts.org/search');
    url.searchParams.set('q', cleanQuery || q);
    url.searchParams.set('page_size', String(pageSize));
    url.searchParams.set('page', String(page));
    url.searchParams.set(
      'fields',
      'code,product_name,brands,serving_size,serving_quantity,quantity,categories_tags,nutriments',
    );
    // Restrict to products that have English data — without this OFF returns
    // its full global index (French, German, etc. dominate "aldi"-style searches).
    url.searchParams.set('langs', 'en');
    // NOTE: we intentionally do NOT set sort_by. Sorting by popularity overrides
    // Search-a-licious's native relevance scoring and surfaces popular products
    // that only weakly match non-name fields, which is disastrous for multi-token
    // queries like "happy farms" (went from 48/50 full matches to 0/50).
    offDebug.url = url.toString();
    offDebug.tokens = tokens;

    const t0 = Date.now();
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'VitalityTracker/0.1 (github.com/JeffJassky/vitality-tracker)',
        Accept: 'application/json',
      },
    });
    offDebug.status = resp.status;
    offDebug.contentType = resp.headers.get('content-type') || '';
    offDebug.durationMs = Date.now() - t0;

    if (!resp.ok) {
      const bodySnippet = (await resp.text()).slice(0, 200).replace(/\s+/g, ' ');
      throw new Error(`HTTP ${resp.status} ${resp.statusText} — body: ${bodySnippet}`);
    }
    if (!offDebug.contentType.includes('application/json')) {
      const bodySnippet = (await resp.text()).slice(0, 200).replace(/\s+/g, ' ');
      throw new Error(`non-JSON response (${offDebug.contentType || 'unknown'}) — body: ${bodySnippet}`);
    }
    const data = await resp.json();
    // Search-a-licious returns `hits`; legacy v2 returned `products`. Accept either.
    const products = Array.isArray(data.hits)
      ? data.hits
      : Array.isArray(data.products)
      ? data.products
      : [];
    offDebug.productCount = products.length;

    // Log the serving-related fields of the top hit so we can see what the API
    // is actually returning (many OFF products lack serving_size/serving_quantity).
    if (products[0]) {
      const top = products[0];
      offDebug.sampleServing = {
        product_name: top.product_name,
        serving_size: top.serving_size,
        serving_quantity: top.serving_quantity,
        quantity: top.quantity,
        categories_tags: Array.isArray(top.categories_tags)
          ? top.categories_tags.slice(0, 5)
          : top.categories_tags,
      };
    }

    // Filter out OFF results that already exist locally (by barcode)
    const localBarcodes = new Set(local.filter((l) => l.offBarcode).map((l) => l.offBarcode));

    // Score by token coverage across product_name + brands, prefer higher coverage.
    // This compensates for Search-a-licious returning loose OR matches.
    const scoreProduct = (p) => {
      if (!tokens.length) return 0;
      const haystack = `${p.product_name || ''} ${p.brands || ''}`.toLowerCase();
      let matches = 0;
      for (const t of tokens) if (haystack.includes(t)) matches += 1;
      return matches;
    };

    const scored = products
      .map((p) => ({ p, score: scoreProduct(p) }))
      .filter(({ score }) => tokens.length === 0 || score > 0);

    // Require all tokens if we have enough full-coverage hits; otherwise fall back
    // to partial matches so queries like "aldi pork tenderloin" still return something
    // even when the brand isn't indexed in the product text.
    const fullCoverage = scored.filter(({ score }) => score === tokens.length);
    const ranked = (fullCoverage.length >= 5 ? fullCoverage : scored)
      .sort((a, b) => b.score - a.score)
      .slice(0, 25)
      .map(({ p }) => p);

    offDebug.rankedFullCoverage = fullCoverage.length;
    offDebug.rankedKept = ranked.length;

    off = ranked
      .map(normalizeOffProduct)
      .filter((item) => item && !localBarcodes.has(item.offBarcode));
    offDebug.normalizedCount = off.length;

    console.log('[OFF search] ok', offDebug);
  } catch (err) {
    console.error('[OFF search] failed', { ...offDebug, error: err.message });
  }

  // Meals first — they're the user's own saved groupings and should take
  // priority over catalog matches.
  res.json({ results: [...meals, ...local, ...off] });
});

// Update a food item's nutritional data. Changes propagate to every log entry
// that references this item since they all point to the same FoodItem document.
router.put('/:id', async (req, res) => {
  const { name, emoji, brand, servingSize, servingGrams, caloriesPer, proteinPer, fatPer, carbsPer } = req.body;
  const update = {};
  if (name != null) update.name = name;
  if (emoji != null) update.emoji = emoji;
  if (brand != null) update.brand = brand;
  if (servingSize != null) update.servingSize = servingSize;
  if (servingGrams != null) update.servingGrams = Number(servingGrams);
  if (caloriesPer != null) update.caloriesPer = Number(caloriesPer);
  if (proteinPer != null) update.proteinPer = Number(proteinPer);
  if (fatPer != null) update.fatPer = Number(fatPer);
  if (carbsPer != null) update.carbsPer = Number(carbsPer);

  const item = await FoodItem.findByIdAndUpdate(req.params.id, update, { returnDocument: 'after' });
  if (!item) return res.status(404).json({ error: 'Not found' });
  res.json({ item });
});

// Get recents — merged list of recently-used foods and recently-logged meals,
// sorted by timestamp (newest first) so meals logged today surface above older
// individual foods.
router.get('/recents', async (req, res) => {
  const [recentFoods, recentMeals] = await Promise.all([
    RecentFood.find({ userId: req.userId })
      .sort({ lastUsedAt: -1 })
      .limit(50)
      .populate('foodItemId'),
    Meal.find({ userId: req.userId, lastLoggedAt: { $ne: null } })
      .sort({ lastLoggedAt: -1 })
      .limit(20)
      .populate('items.foodItemId'),
  ]);

  const foodEntries = recentFoods
    .filter((r) => r.foodItemId)
    .map((r) => ({
      kind: 'food',
      _id: r._id,
      ts: r.lastUsedAt,
      foodItemId: r.foodItemId,
      lastServingCount: r.lastServingCount,
      lastMealType: r.lastMealType,
    }));

  const mealEntries = recentMeals.map((m) => {
    const totals = summarizeMeal(m);
    return {
      kind: 'meal',
      _id: m._id,
      ts: m.lastLoggedAt,
      meal: {
        source: 'meal',
        _id: m._id,
        name: m.name,
        emoji: m.emoji || '',
        brand: `${m.items.length} item${m.items.length === 1 ? '' : 's'}`,
        itemCount: m.items.length,
        servingSize: '1 meal',
        servingGrams: 0,
        ...totals,
      },
    };
  });

  const recents = [...foodEntries, ...mealEntries].sort(
    (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
  );
  res.json({ recents });
});

// Get favorites
router.get('/favorites', async (req, res) => {
  const favorites = await FavoriteFood.find({ userId: req.userId })
    .sort({ createdAt: -1 })
    .populate('foodItemId');
  res.json({ favorites });
});

// Add favorite
router.post('/favorites', async (req, res) => {
  const { foodItemId, defaultServingCount, defaultMealType } = req.body;
  const favorite = await FavoriteFood.findOneAndUpdate(
    { userId: req.userId, foodItemId },
    { defaultServingCount, defaultMealType },
    { upsert: true, returnDocument: 'after' },
  );
  res.status(201).json({ favorite });
});

// Remove favorite
router.delete('/favorites/:id', async (req, res) => {
  await FavoriteFood.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  res.status(204).send();
});

export default router;
