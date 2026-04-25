import { Router } from 'express';
import FoodLog from '../models/FoodLog.js';
import FoodItem from '../models/FoodItem.js';
import RecentFood from '../models/RecentFood.js';
import UserSettings from '../models/UserSettings.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('foodlog');
const router = Router();

async function resolveFoodItemId(body, userId) {
  if (body.foodItemId) return body.foodItemId;

  if (body.offBarcode) {
    // Per-user dedup. Each user keeps their own copy of an OFF product so
    // we can attribute, count, and let users edit fields without leaking
    // changes to other users.
    const item = await FoodItem.findOneAndUpdate(
      { userId, offBarcode: body.offBarcode },
      {
        $setOnInsert: { userId, isCustom: false },
        $set: {
          name: body.name,
          brand: body.brand,
          servingSize: body.servingSize,
          servingGrams: body.servingGrams,
          caloriesPer: body.caloriesPer,
          proteinPer: body.proteinPer,
          fatPer: body.fatPer,
          carbsPer: body.carbsPer,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );
    return item._id;
  }

  return null;
}

async function updateRecent(userId, foodItemId, servingCount, mealType) {
  await RecentFood.findOneAndUpdate(
    { userId, foodItemId },
    { lastServingCount: servingCount, lastMealType: mealType, lastUsedAt: new Date() },
    { upsert: true },
  );

  const count = await RecentFood.countDocuments({ userId });
  if (count > 50) {
    const oldest = await RecentFood.find({ userId })
      .sort({ lastUsedAt: 1 })
      .limit(count - 50)
      .select('_id');
    await RecentFood.deleteMany({ _id: { $in: oldest.map((r) => r._id) } });
    log.debug({ userId: String(userId), pruned: count - 50 }, 'foodlog: pruned recents');
  }
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
    const prev = byDay.get(dayKey) || { calories: 0, protein: 0, fat: 0, carbs: 0 };
    const s = entry.servingCount;
    prev.calories += (food.caloriesPer || 0) * s;
    prev.protein += (food.proteinPer || 0) * s;
    prev.fat += (food.fatPer || 0) * s;
    prev.carbs += (food.carbsPer || 0) * s;
    byDay.set(dayKey, prev);
  }

  const days = [...byDay.entries()]
    .map(([date, n]) => ({
      date,
      calories: Math.round(n.calories),
      protein: Math.round(n.protein),
      fat: Math.round(n.fat),
      carbs: Math.round(n.carbs),
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
    byDay.set(dayKey, prev + (food.caloriesPer || 0) * entry.servingCount);
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

  let totalCalories = 0;
  let totalProtein = 0;
  let totalFat = 0;
  let totalCarbs = 0;

  for (const entry of entries) {
    const food = entry.foodItemId;
    if (!food) continue;
    totalCalories += food.caloriesPer * entry.servingCount;
    totalProtein += food.proteinPer * entry.servingCount;
    totalFat += food.fatPer * entry.servingCount;
    totalCarbs += food.carbsPer * entry.servingCount;
  }

  (req.log || log).debug(
    { date, entryCount: entries.length, totalCalories: Math.round(totalCalories) },
    'foodlog: day summary',
  );
  res.json({
    summary: {
      totalCalories: Math.round(totalCalories),
      totalProtein: Math.round(totalProtein),
      totalFat: Math.round(totalFat),
      totalCarbs: Math.round(totalCarbs),
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
    date: new Date(req.body.date),
    mealType: req.body.mealType,
    servingCount: req.body.servingCount || 1,
  });

  await updateRecent(req.userId, foodItemId, entry.servingCount, entry.mealType);

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
        date: new Date(dateStr),
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
        date: new Date(dateStr),
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
