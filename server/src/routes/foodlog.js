import { Router } from 'express';
import FoodLog from '../models/FoodLog.js';
import FoodItem from '../models/FoodItem.js';
import RecentFood from '../models/RecentFood.js';
import UserSettings from '../models/UserSettings.js';

const router = Router();

// Resolve or create a FoodItem from the request body
async function resolveFoodItemId(body) {
  if (body.foodItemId) return body.foodItemId;

  // OFF item — upsert by barcode
  if (body.offBarcode) {
    const item = await FoodItem.findOneAndUpdate(
      { offBarcode: body.offBarcode },
      {
        name: body.name,
        brand: body.brand,
        servingSize: body.servingSize,
        servingGrams: body.servingGrams,
        caloriesPer: body.caloriesPer,
        proteinPer: body.proteinPer,
        fatPer: body.fatPer,
        carbsPer: body.carbsPer,
      },
      { upsert: true, new: true },
    );
    return item._id;
  }

  return null;
}

// Update recent foods cache
async function updateRecent(userId, foodItemId, servingCount, mealType) {
  await RecentFood.findOneAndUpdate(
    { userId, foodItemId },
    { lastServingCount: servingCount, lastMealType: mealType, lastUsedAt: new Date() },
    { upsert: true },
  );

  // Prune to 50
  const count = await RecentFood.countDocuments({ userId });
  if (count > 50) {
    const oldest = await RecentFood.find({ userId })
      .sort({ lastUsedAt: 1 })
      .limit(count - 50)
      .select('_id');
    await RecentFood.deleteMany({ _id: { $in: oldest.map((r) => r._id) } });
  }
}

// Get food log for a date
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
    .populate('foodItemId');

  const grouped = {
    breakfast: [],
    lunch: [],
    dinner: [],
    snack: [],
  };

  for (const entry of entries) {
    grouped[entry.mealType].push(entry);
  }

  res.json({ entries: grouped });
});

// Get daily summary
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

// Add entry
router.post('/', async (req, res) => {
  const foodItemId = await resolveFoodItemId(req.body);
  if (!foodItemId) {
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
  res.status(201).json({ entry: populated });
});

// Update entry
router.put('/:id', async (req, res) => {
  const update = {};
  if (req.body.servingCount != null) update.servingCount = req.body.servingCount;
  if (req.body.mealType) update.mealType = req.body.mealType;

  const entry = await FoodLog.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    update,
    { new: true },
  ).populate('foodItemId');

  if (!entry) return res.status(404).json({ error: 'Not found' });
  res.json({ entry });
});

// Delete entry
router.delete('/:id', async (req, res) => {
  const entry = await FoodLog.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!entry) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

export default router;
