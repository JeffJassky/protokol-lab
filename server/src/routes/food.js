import { Router } from 'express';
import FoodItem from '../models/FoodItem.js';
import FavoriteFood from '../models/FavoriteFood.js';
import RecentFood from '../models/RecentFood.js';

const router = Router();

function normalizeOffProduct(p) {
  const n = p.nutriments || {};
  const servingGrams = p.serving_quantity || 100;
  const scale = servingGrams / 100;

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

  return {
    source: 'openfoodfacts',
    offBarcode: p.code || null,
    name: p.product_name || 'Unknown',
    brand: p.brands || '',
    servingSize: p.serving_size || `${servingGrams}g`,
    servingGrams: Math.round(servingGrams),
    caloriesPer: Math.round(caloriesPer),
    proteinPer: Math.round(val(n.proteins_serving, n.proteins_100g)),
    fatPer: Math.round(val(n.fat_serving, n.fat_100g)),
    carbsPer: Math.round(val(n.carbohydrates_serving, n.carbohydrates_100g)),
  };
}

// Search: local + OpenFoodFacts
router.get('/search', async (req, res) => {
  const { q, page = 1 } = req.query;
  if (!q || !q.trim()) return res.json({ results: [] });

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
  try {
    const url = new URL('https://world.openfoodfacts.org/cgi/search.pl');
    url.searchParams.set('search_terms', q);
    url.searchParams.set('search_simple', '1');
    url.searchParams.set('action', 'process');
    url.searchParams.set('json', '1');
    url.searchParams.set('page_size', '25');
    url.searchParams.set('page', String(page));
    url.searchParams.set('fields', 'code,product_name,brands,serving_size,serving_quantity,nutriments');

    const resp = await fetch(url, {
      headers: { 'User-Agent': 'VitalityTracker/0.1 (github.com/JeffJassky/vitality-tracker)' },
    });
    const data = await resp.json();

    // Filter out OFF results that already exist locally (by barcode)
    const localBarcodes = new Set(local.filter((l) => l.offBarcode).map((l) => l.offBarcode));

    off = (data.products || [])
      .map(normalizeOffProduct)
      .filter((item) => item && !localBarcodes.has(item.offBarcode));
  } catch (err) {
    console.error('OpenFoodFacts search failed:', err.message);
  }

  res.json({ results: [...local, ...off] });
});

// Get recents
router.get('/recents', async (req, res) => {
  const recents = await RecentFood.find({ userId: req.userId })
    .sort({ lastUsedAt: -1 })
    .limit(50)
    .populate('foodItemId');
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
    { upsert: true, new: true },
  );
  res.status(201).json({ favorite });
});

// Remove favorite
router.delete('/favorites/:id', async (req, res) => {
  await FavoriteFood.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  res.status(204).send();
});

export default router;
