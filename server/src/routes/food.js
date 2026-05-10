import { Router } from 'express';
import FoodItem from '../models/FoodItem.js';
import FavoriteFood from '../models/FavoriteFood.js';
import RecentFood from '../models/RecentFood.js';
import Meal from '../models/Meal.js';
import { childLogger, errContext } from '../lib/logger.js';
import { normalizeOffProduct, searchUsda, getUsdaByBarcode } from '../services/nutrition.js';
import { NUTRIENT_KEYS, addNutrients, scaleNutrients, roundNutrients } from '../../../shared/logging/nutrients.js';
import { invalidateAsync } from '../sim/invalidationHooks.js';

// Source priority for /search results. USDA is preferred — Branded items have
// reliable serving sizes (FDA-mandated label data) and Foundation/SR/FNDDS
// have full lab-analyzed micronutrient panels. OFF is fallback for
// international/long-tail products that USDA doesn't cover.
const USDA_MIN_RESULTS = 8;             // below this, top up with OFF
const USDA_MIN_WITH_SERVING = 4;        // or if too few have serving data

const log = childLogger('food');
const router = Router();

// Project a FoodItem doc into the JSON shape the client expects. Strips
// internal Mongoose fields and ensures perServing always renders even when
// empty (so the client can pattern-match on it).
function projectItem(item) {
  return {
    source: 'local',
    _id: item._id,
    offBarcode: item.offBarcode,
    usdaFdcId: item.usdaFdcId,
    name: item.name,
    emoji: item.emoji || '',
    brand: item.brand,
    servingSize: item.servingSize,
    servingAmount: item.servingAmount,
    servingUnit: item.servingUnit,
    servingKnown: item.servingKnown,
    perServing: item.perServing || {},
    nutrientSource: item.nutrientSource,
    nutrientCoverage: item.nutrientCoverage,
  };
}

// Sort known-serving entries before unknown-serving ones inside the same
// source — Nutella-style entries (no portion data) are mostly noise for
// typical users, so we sink them.
function sinkUnknownServing(items) {
  const known = items.filter((i) => i.servingKnown);
  const unknown = items.filter((i) => !i.servingKnown);
  return [...known, ...unknown];
}

function summarizeMeal(meal) {
  const totals = {};
  for (const item of meal.items) {
    const food = item.foodItemId;
    if (!food || typeof food !== 'object') continue;
    addNutrients(totals, scaleNutrients(food.perServing, item.servingCount));
  }
  return { perServing: roundNutrients(totals) };
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
      servingAmount: null,
      servingUnit: null,
      servingKnown: true,
      perServing: totals.perServing,
    };
  });

  const localResults = await FoodItem.find(
    { userId: req.userId, $text: { $search: q } },
    { score: { $meta: 'textScore' } },
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(5);

  const local = localResults.map(projectItem);
  const localBarcodes = new Set(local.filter((l) => l.offBarcode).map((l) => l.offBarcode));
  const localFdcIds = new Set(local.filter((l) => l.usdaFdcId).map((l) => l.usdaFdcId));

  // Fire USDA + OFF in parallel. USDA is preferred but we still query OFF up
  // front so a thin USDA result set can be padded without a second round-trip.
  const usdaPromise = searchUsda(q, { limit: 25 }).catch((err) => ({ results: [], debug: { error: err.message } }));

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
      'code,product_name,brands,serving_size,serving_quantity,serving_quantity_unit,quantity,categories_tags,nutriments',
    );
    url.searchParams.set('langs', 'en');
    offDebug.url = url.toString();
    offDebug.tokens = tokens;

    const t0 = Date.now();
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'ProtokolLab/0.1 (github.com/JeffJassky/protokol-lab)',
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

    const normalized = ranked
      .map(normalizeOffProduct)
      .filter((item) => item && !localBarcodes.has(item.offBarcode));

    off = sinkUnknownServing(normalized);
    offDebug.normalizedCount = off.length;
    offDebug.servingKnownCount = normalized.filter((i) => i.servingKnown).length;

    rlog.debug(offDebug, 'food search: OFF ok');
  } catch (err) {
    rlog.warn({ ...errContext(err), ...offDebug }, 'food search: OFF failed');
  }

  // Resolve USDA promise. Filter dupes against local catalog by either
  // barcode (Branded gtinUpc) or fdcId.
  const { results: usdaRaw, debug: usdaDebug } = await usdaPromise;
  const usda = sinkUnknownServing(
    usdaRaw.filter((item) =>
      !localFdcIds.has(item.usdaFdcId) &&
      (!item.offBarcode || !localBarcodes.has(item.offBarcode)),
    ),
  );
  // Drop OFF rows whose barcode also appears in USDA — USDA wins.
  const usdaBarcodes = new Set(usda.filter((u) => u.offBarcode).map((u) => u.offBarcode));
  const offFiltered = off.filter((o) => !o.offBarcode || !usdaBarcodes.has(o.offBarcode));

  // Use OFF only when USDA is thin. USDA is the priority source.
  const usdaWithServing = usda.filter((i) => i.servingKnown).length;
  const useOff = usda.length < USDA_MIN_RESULTS || usdaWithServing < USDA_MIN_WITH_SERVING;
  const finalOff = useOff ? offFiltered : [];

  rlog.info(
    {
      q, page: Number(page),
      mealCount: meals.length, localCount: local.length,
      usdaCount: usda.length, usdaWithServing,
      offCount: off.length, offReturned: finalOff.length, usedOff: useOff,
      durationMs: Date.now() - searchStart,
      usda: usdaDebug,
    },
    'food search: done',
  );

  res.json({ results: [...meals, ...local, ...usda, ...finalOff] });
});

router.get('/barcode/:code', async (req, res) => {
  const rlog = req.log || log;
  const code = String(req.params.code || '').trim();
  if (!code) {
    rlog.warn('barcode: empty code');
    return res.status(400).json({ error: 'code required' });
  }

  const localItem = await FoodItem.findOne({ userId: req.userId, offBarcode: code });
  if (localItem) {
    rlog.debug({ code, itemId: String(localItem._id) }, 'barcode: local hit');
    return res.json({ result: projectItem(localItem) });
  }

  // USDA Branded first — when present, it has reliable label data.
  try {
    const { result: usdaResult, debug: usdaDebug } = await getUsdaByBarcode(code);
    if (usdaResult) {
      rlog.info({ code, source: 'usda', usda: usdaDebug, name: usdaResult.name }, 'barcode: USDA hit');
      return res.json({ result: usdaResult });
    }
    rlog.debug({ code, usda: usdaDebug }, 'barcode: USDA miss, trying OFF');
  } catch (err) {
    rlog.warn({ ...errContext(err), code }, 'barcode: USDA lookup failed, trying OFF');
  }

  // OFF fallback — handles international + long-tail products.
  try {
    const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,brands,serving_size,serving_quantity,serving_quantity_unit,quantity,categories_tags,nutriments`;
    const t0 = Date.now();
    const resp = await fetch(url, {
      headers: {
        'User-Agent': 'ProtokolLab/0.1 (github.com/JeffJassky/protokol-lab)',
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
    rlog.info({ code, durationMs, name: normalized.name, servingKnown: normalized.servingKnown }, 'barcode: OFF hit');
    return res.json({ result: normalized });
  } catch (err) {
    rlog.error({ ...errContext(err), code }, 'barcode: OFF lookup failed');
    return res.status(502).json({ error: 'Lookup failed' });
  }
});

router.put('/:id', async (req, res) => {
  const {
    name, emoji, brand,
    servingSize, servingAmount, servingUnit, servingKnown,
    perServing,
  } = req.body;

  const update = {};
  if (name != null) update.name = name;
  if (emoji != null) update.emoji = emoji;
  if (brand != null) update.brand = brand;
  if (servingSize != null) update.servingSize = servingSize;
  if (servingAmount != null) update.servingAmount = Number(servingAmount);
  if (servingUnit != null) update.servingUnit = servingUnit;
  if (servingKnown != null) update.servingKnown = !!servingKnown;

  // perServing replaces the whole subdoc when sent — clients send the full
  // shape they want stored. Only known nutrient keys are accepted.
  if (perServing && typeof perServing === 'object') {
    const cleaned = {};
    for (const k of NUTRIENT_KEYS) {
      if (perServing[k] != null && Number.isFinite(Number(perServing[k]))) {
        cleaned[k] = Number(perServing[k]);
      }
    }
    update.perServing = cleaned;
  }

  const item = await FoodItem.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    update,
    { returnDocument: 'after' },
  );
  if (!item) {
    (req.log || log).warn({ itemId: req.params.id }, 'food item update: not found');
    return res.status(404).json({ error: 'Not found' });
  }
  // Editing perServing macros retroactively changes every FoodLog row
  // that references this item. Cache for any past day is wrong.
  if (update.perServing) invalidateAsync(req.userId, 'food-item-perserving-update');
  (req.log || log).info({ itemId: req.params.id, fields: Object.keys(update) }, 'food item updated');
  res.json({ item: projectItem(item) });
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
        servingAmount: null,
        servingUnit: null,
        servingKnown: true,
        perServing: totals.perServing,
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
