import { Router } from 'express';
import FoodItem from '../models/FoodItem.js';
import FavoriteFood from '../models/FavoriteFood.js';
import RecentFood from '../models/RecentFood.js';
import Meal from '../models/Meal.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('food');
const router = Router();

const BEVERAGE_CATEGORY_PATTERNS = [
  'beverages', 'drinks', 'beers', 'wines', 'spirits', 'sodas',
  'juices', 'waters', 'milks', 'teas', 'coffees',
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
  const qty = typeof p.quantity === 'string' ? p.quantity.toLowerCase() : '';
  if (/\b(ml|cl|dl|l|fl\s*oz)\b/.test(qty)) return true;
  return false;
}

function normalizeOffProduct(p) {
  const n = p.nutriments || {};
  const beverage = isBeverage(p);
  const unit = beverage ? 'ml' : 'g';
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
  else return null;

  const val = (serving, per100) => {
    if (serving != null) return serving;
    if (per100 != null) return per100 * scale;
    return 0;
  };

  const brand = Array.isArray(p.brands) ? p.brands.join(', ') : p.brands || '';

  let name = p.product_name;
  if (name && typeof name === 'object') {
    name = name.en || Object.values(name).find((v) => typeof v === 'string') || 'Unknown';
  }

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

router.get('/search', async (req, res) => {
  const rlog = req.log || log;
  const { q, page = 1 } = req.query;
  if (!q || !q.trim()) {
    rlog.debug('food search: empty query');
    return res.json({ results: [] });
  }

  const searchStart = Date.now();

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

  let off = [];
  const offDebug = { query: q, page: Number(page) };
  try {
    const tokens = q
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[+\-!(){}[\]^"~*?:\\/]/g, '').trim())
      .filter(Boolean);
    const cleanQuery = tokens.join(' ');
    const pageSize = 50;

    const url = new URL('https://search.openfoodfacts.org/search');
    url.searchParams.set('q', cleanQuery || q);
    url.searchParams.set('page_size', String(pageSize));
    url.searchParams.set('page', String(page));
    url.searchParams.set(
      'fields',
      'code,product_name,brands,serving_size,serving_quantity,quantity,categories_tags,nutriments',
    );
    url.searchParams.set('langs', 'en');
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
    const products = Array.isArray(data.hits)
      ? data.hits
      : Array.isArray(data.products)
      ? data.products
      : [];
    offDebug.productCount = products.length;

    const localBarcodes = new Set(local.filter((l) => l.offBarcode).map((l) => l.offBarcode));

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

    rlog.debug(offDebug, 'food search: OFF ok');
  } catch (err) {
    rlog.warn({ ...errContext(err), ...offDebug }, 'food search: OFF failed');
  }

  rlog.info(
    {
      q, page: Number(page),
      mealCount: meals.length, localCount: local.length, offCount: off.length,
      durationMs: Date.now() - searchStart,
    },
    'food search: done',
  );

  res.json({ results: [...meals, ...local, ...off] });
});

router.get('/barcode/:code', async (req, res) => {
  const rlog = req.log || log;
  const code = String(req.params.code || '').trim();
  if (!code) {
    rlog.warn('barcode: empty code');
    return res.status(400).json({ error: 'code required' });
  }

  const localItem = await FoodItem.findOne({ offBarcode: code });
  if (localItem) {
    rlog.debug({ code, itemId: String(localItem._id) }, 'barcode: local hit');
    return res.json({
      result: {
        source: 'local',
        _id: localItem._id,
        offBarcode: localItem.offBarcode,
        name: localItem.name,
        emoji: localItem.emoji || '',
        brand: localItem.brand,
        servingSize: localItem.servingSize,
        servingGrams: localItem.servingGrams,
        caloriesPer: localItem.caloriesPer,
        proteinPer: localItem.proteinPer,
        fatPer: localItem.fatPer,
        carbsPer: localItem.carbsPer,
      },
    });
  }

  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,brands,serving_size,serving_quantity,quantity,categories_tags,nutriments`;
    const t0 = Date.now();
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'VitalityTracker/0.1 (github.com/JeffJassky/vitality-tracker)',
        Accept: 'application/json',
      },
    });
    const durationMs = Date.now() - t0;
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (data.status !== 1 || !data.product) {
      rlog.info({ code, durationMs }, 'barcode: OFF product not found');
      return res.status(404).json({ error: 'Product not found' });
    }
    const normalized = normalizeOffProduct(data.product);
    if (!normalized) {
      rlog.warn({ code, durationMs }, 'barcode: OFF product missing nutrition');
      return res.status(404).json({ error: 'Product missing nutrition data' });
    }
    rlog.info({ code, durationMs, name: normalized.name }, 'barcode: OFF hit');
    return res.json({ result: normalized });
  } catch (err) {
    rlog.error({ ...errContext(err), code }, 'barcode: OFF lookup failed');
    return res.status(502).json({ error: 'Lookup failed' });
  }
});

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
  if (!item) {
    (req.log || log).warn({ itemId: req.params.id }, 'food item update: not found');
    return res.status(404).json({ error: 'Not found' });
  }
  (req.log || log).info({ itemId: req.params.id, fields: Object.keys(update) }, 'food item updated');
  res.json({ item });
});

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
  (req.log || log).debug(
    { foodCount: foodEntries.length, mealCount: mealEntries.length },
    'food: recents fetched',
  );
  res.json({ recents });
});

router.get('/favorites', async (req, res) => {
  const favorites = await FavoriteFood.find({ userId: req.userId })
    .sort({ createdAt: -1 })
    .populate('foodItemId');
  (req.log || log).debug({ count: favorites.length }, 'food: favorites fetched');
  res.json({ favorites });
});

router.post('/favorites', async (req, res) => {
  const { foodItemId, defaultServingCount, defaultMealType } = req.body;
  const favorite = await FavoriteFood.findOneAndUpdate(
    { userId: req.userId, foodItemId },
    { defaultServingCount, defaultMealType },
    { upsert: true, returnDocument: 'after' },
  );
  (req.log || log).info({ foodItemId, favoriteId: String(favorite._id) }, 'food: favorite added');
  res.status(201).json({ favorite });
});

router.delete('/favorites/:id', async (req, res) => {
  await FavoriteFood.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  (req.log || log).info({ favoriteId: req.params.id }, 'food: favorite removed');
  res.status(204).send();
});

export default router;
