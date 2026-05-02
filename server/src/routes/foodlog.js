import { Router } from 'express';
import FoodLog from '../models/FoodLog.js';
import FoodItem from '../models/FoodItem.js';
import UserSettings from '../models/UserSettings.js';
import { touchRecent } from '../services/recentFood.js';
import { childLogger } from '../lib/logger.js';
import { parseLogDate } from '../lib/date.js';
import { NUTRIENT_KEYS, addNutrients, scaleNutrients, roundNutrients } from '../../../shared/nutrients.js';

const log = childLogger('foodlog');
const router = Router();

function cleanPerServing(input) {
  if (!input || typeof input !== 'object') return {};
  const out = {};
  for (const k of NUTRIENT_KEYS) {
    if (input[k] != null && Number.isFinite(Number(input[k]))) {
      out[k] = Number(input[k]);
    }
  }
  return out;
}

async function resolveFoodItemId(body, userId) {
  if (body.foodItemId) return body.foodItemId;

  // Per-user dedup keyed off the source identity (usdaFdcId or offBarcode).
  // Each user keeps their own copy so we can attribute, count, and let users
  // edit fields without leaking changes to other users.
  const sharedSet = {
    name: body.name,
    brand: body.brand,
    servingSize: body.servingSize,
    servingAmount: body.servingAmount != null ? Number(body.servingAmount) : null,
    servingUnit: body.servingUnit || null,
    servingKnown: !!body.servingKnown,
    perServing: cleanPerServing(body.perServing),
    nutrientSource: body.nutrientSource || null,
    nutrientCoverage: body.nutrientCoverage || null,
  };

  if (body.usdaFdcId) {
    const item = await FoodItem.findOneAndUpdate(
      { userId, usdaFdcId: String(body.usdaFdcId) },
      {
        $setOnInsert: { userId, isCustom: false, usdaFdcId: String(body.usdaFdcId) },
        $set: { ...sharedSet, offBarcode: body.offBarcode || null },
      },
      { upsert: true, returnDocument: 'after' },
    );
    return item._id;
  }

  if (body.offBarcode) {
    const item = await FoodItem.findOneAndUpdate(
      { userId, offBarcode: body.offBarcode },
      {
        $setOnInsert: { userId, isCustom: false },
        $set: { ...sharedSet, nutrientSource: sharedSet.nutrientSource || 'openfoodfacts' },
      },
      { upsert: true, returnDocument: 'after' },
    );
    return item._id;
  }

  return null;
}

router.get('/', async (req, res) => {
  const { date } = req.query;
  const dayStart = new Date(date);
  const dayEnd = new Date(date);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const entries = await FoodLog.find({
    userId: req.userId,
    date: { $gte: dayStart, $lt: dayEnd },
  })
    .sort({ createdAt: 1 })
    .populate('foodItemId')
    .populate('mealId', 'name emoji');

  const grouped = { breakfast: [], lunch: [], dinner: [], snack: [] };
  for (const entry of entries) grouped[entry.mealType].push(entry);

  (req.log || log).debug({ date, total: entries.length }, 'foodlog: day fetched');
  res.json({ entries: grouped });
});

router.get('/daily-nutrition', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    (req.log || log).warn({ from, to }, 'daily-nutrition: missing from/to');
    return res.status(400).json({ error: 'from and to required' });
  }

  const rangeStart = new Date(from);
  const rangeEnd = new Date(to);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

  const entries = await FoodLog.find({
    userId: req.userId,
    date: { $gte: rangeStart, $lt: rangeEnd },
  }).populate('foodItemId');

  const byDay = new Map();
  for (const entry of entries) {
    const food = entry.foodItemId;
    if (!food) continue;
    const dayKey = entry.date.toISOString().slice(0, 10);
    const prev = byDay.get(dayKey) || {};
    addNutrients(prev, scaleNutrients(food.perServing, entry.servingCount));
    byDay.set(dayKey, prev);
  }

  const days = [...byDay.entries()]
    .map(([date, totals]) => ({
      date,
      // Flatten each day's nutrients to top-level fields so the daily series
      // can be charted directly. Older clients only consumed the macros.
      ...roundNutrients(totals, 0),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  (req.log || log).debug({ from, to, days: days.length }, 'foodlog: daily-nutrition');
  res.json({ days });
});

router.get('/daily-calories', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) {
    (req.log || log).warn({ from, to }, 'daily-calories: missing from/to');
    return res.status(400).json({ error: 'from and to required' });
  }

  const rangeStart = new Date(from);
  const rangeEnd = new Date(to);
  rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);

  const entries = await FoodLog.find({
    userId: req.userId,
    date: { $gte: rangeStart, $lt: rangeEnd },
  }).populate('foodItemId');

  const byDay = new Map();
  for (const entry of entries) {
    const food = entry.foodItemId;
    if (!food) continue;
    const dayKey = entry.date.toISOString().slice(0, 10);
    const prev = byDay.get(dayKey) || 0;
    const cal = food.perServing?.calories || 0;
    byDay.set(dayKey, prev + cal * entry.servingCount);
  }

  const days = [...byDay.entries()]
    .map(([date, calories]) => ({ date, calories: Math.round(calories) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  (req.log || log).debug({ from, to, days: days.length }, 'foodlog: daily-calories');
  res.json({ days });
});

router.get('/summary', async (req, res) => {
  const { date } = req.query;
  const dayStart = new Date(date);
  const dayEnd = new Date(date);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const entries = await FoodLog.find({
    userId: req.userId,
    date: { $gte: dayStart, $lt: dayEnd },
  }).populate('foodItemId');

  const settings = await UserSettings.findOne({ userId: req.userId });

  const totals = {};
  for (const entry of entries) {
    const food = entry.foodItemId;
    if (!food) continue;
    addNutrients(totals, scaleNutrients(food.perServing, entry.servingCount));
  }

  const rounded = roundNutrients(totals, 0);

  (req.log || log).debug(
    { date, entryCount: entries.length, totalCalories: rounded.calories || 0 },
    'foodlog: day summary',
  );
  res.json({
    summary: {
      // Aggregated totals for every nutrient we have data for.
      perServing: rounded,
      targets: settings?.targets || null,
    },
  });
});

router.post('/', async (req, res) => {
  const rlog = req.log || log;
  const foodItemId = await resolveFoodItemId(req.body, req.userId);
  if (!foodItemId) {
    rlog.warn({ body: { offBarcode: req.body?.offBarcode } }, 'foodlog: cannot resolve foodItem');
    return res.status(400).json({ error: 'Could not resolve food item' });
  }

  const entry = await FoodLog.create({
    userId: req.userId,
    foodItemId,
    date: parseLogDate(req.body.date),
    mealType: req.body.mealType,
    servingCount: req.body.servingCount || 1,
  });

  await touchRecent(req.userId, foodItemId, entry.servingCount, entry.mealType);

  const populated = await entry.populate('foodItemId');
  rlog.info(
    {
      entryId: String(entry._id), foodItemId: String(foodItemId),
      date: req.body.date, mealType: entry.mealType, servingCount: entry.servingCount,
    },
    'foodlog: entry created',
  );
  res.status(201).json({ entry: populated });
});

router.post('/copy', async (req, res) => {
  const rlog = req.log || log;
  const { entryIds, dates } = req.body;
  if (!Array.isArray(entryIds) || !entryIds.length) {
    rlog.warn('foodlog copy: entryIds missing');
    return res.status(400).json({ error: 'entryIds required' });
  }
  if (!Array.isArray(dates) || !dates.length) {
    rlog.warn('foodlog copy: dates missing');
    return res.status(400).json({ error: 'dates required' });
  }

  const sources = await FoodLog.find({ _id: { $in: entryIds }, userId: req.userId });
  if (!sources.length) {
    rlog.warn({ entryIds }, 'foodlog copy: no source entries');
    return res.status(404).json({ error: 'No source entries found' });
  }

  const docs = [];
  for (const src of sources) {
    for (const dateStr of dates) {
      docs.push({
        userId: req.userId,
        foodItemId: src.foodItemId,
        date: parseLogDate(dateStr),
        mealType: src.mealType,
        servingCount: src.servingCount,
        mealId: src.mealId || null,
      });
    }
  }
  const created = await FoodLog.insertMany(docs);
  rlog.info(
    { sourceCount: sources.length, dateCount: dates.length, created: created.length },
    'foodlog: copied',
  );
  res.status(201).json({ created: created.length });
});

router.post('/move', async (req, res) => {
  const rlog = req.log || log;
  const { entryIds, dates } = req.body;
  if (!Array.isArray(entryIds) || !entryIds.length) {
    rlog.warn('foodlog move: entryIds missing');
    return res.status(400).json({ error: 'entryIds required' });
  }
  if (!Array.isArray(dates) || !dates.length) {
    rlog.warn('foodlog move: dates missing');
    return res.status(400).json({ error: 'dates required' });
  }

  const sources = await FoodLog.find({ _id: { $in: entryIds }, userId: req.userId });
  if (!sources.length) {
    rlog.warn({ entryIds }, 'foodlog move: no source entries');
    return res.status(404).json({ error: 'No source entries found' });
  }

  const docs = [];
  for (const src of sources) {
    for (const dateStr of dates) {
      docs.push({
        userId: req.userId,
        foodItemId: src.foodItemId,
        date: parseLogDate(dateStr),
        mealType: src.mealType,
        servingCount: src.servingCount,
        mealId: src.mealId || null,
      });
    }
  }
  const created = await FoodLog.insertMany(docs);
  await FoodLog.deleteMany({ _id: { $in: sources.map((s) => s._id) }, userId: req.userId });
  rlog.info(
    { sourceCount: sources.length, dateCount: dates.length, created: created.length, removed: sources.length },
    'foodlog: moved',
  );
  res.status(201).json({ created: created.length, removed: sources.length });
});

router.put('/:id', async (req, res) => {
  const update = {};
  if (req.body.servingCount != null) update.servingCount = req.body.servingCount;
  if (req.body.mealType) update.mealType = req.body.mealType;
  if (req.body.consumed != null) update.consumed = req.body.consumed;

  const entry = await FoodLog.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    update,
    { returnDocument: 'after' },
  ).populate('foodItemId');

  if (!entry) {
    (req.log || log).warn({ entryId: req.params.id }, 'foodlog update: not found');
    return res.status(404).json({ error: 'Not found' });
  }
  (req.log || log).info({ entryId: req.params.id, fields: Object.keys(update) }, 'foodlog: entry updated');
  res.json({ entry });
});

router.delete('/:id', async (req, res) => {
  const entry = await FoodLog.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!entry) {
    (req.log || log).warn({ entryId: req.params.id }, 'foodlog delete: not found');
    return res.status(404).json({ error: 'Not found' });
  }
  (req.log || log).info({ entryId: req.params.id }, 'foodlog: entry deleted');
  res.status(204).send();
});

export default router;
