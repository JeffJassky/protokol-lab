import { Router } from 'express';
import Meal from '../models/Meal.js';
import FoodLog from '../models/FoodLog.js';

const router = Router();

// List all meals for the current user, with items populated so the UI can
// compute totals without a second round-trip per meal.
router.get('/', async (req, res) => {
  const meals = await Meal.find({ userId: req.userId })
    .sort({ updatedAt: -1 })
    .populate('items.foodItemId');
  res.json({ meals });
});

// Get a single meal with populated items.
router.get('/:id', async (req, res) => {
  const meal = await Meal.findOne({ _id: req.params.id, userId: req.userId })
    .populate('items.foodItemId');
  if (!meal) return res.status(404).json({ error: 'Not found' });
  res.json({ meal });
});

// Create a meal. `items` is optional — most creates start empty and get
// populated via the add-item endpoint from the food log flyout.
router.post('/', async (req, res) => {
  const { name, emoji, items } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'name required' });

  const meal = await Meal.create({
    userId: req.userId,
    name: name.trim(),
    emoji: typeof emoji === 'string' ? emoji : '',
    items: Array.isArray(items)
      ? items
          .filter((i) => i?.foodItemId)
          .map((i) => ({ foodItemId: i.foodItemId, servingCount: i.servingCount || 1 }))
      : [],
  });

  const populated = await meal.populate('items.foodItemId');
  res.status(201).json({ meal: populated });
});

// Update meal name.
router.put('/:id', async (req, res) => {
  const update = {};
  if (req.body.name != null) update.name = String(req.body.name).trim();
  if (req.body.emoji != null) update.emoji = String(req.body.emoji);

  const meal = await Meal.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    update,
    { returnDocument: 'after' },
  ).populate('items.foodItemId');

  if (!meal) return res.status(404).json({ error: 'Not found' });
  res.json({ meal });
});

// Delete a meal (FoodLog entries that reference it keep their mealId; the
// diary UI just stops grouping them under a name).
router.delete('/:id', async (req, res) => {
  const result = await Meal.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!result) return res.status(404).json({ error: 'Not found' });
  res.status(204).send();
});

// Add an item to a meal. Body: { foodItemId, servingCount }.
router.post('/:id/items', async (req, res) => {
  const { foodItemId, servingCount = 1 } = req.body;
  if (!foodItemId) return res.status(400).json({ error: 'foodItemId required' });

  const meal = await Meal.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { $push: { items: { foodItemId, servingCount } } },
    { returnDocument: 'after' },
  ).populate('items.foodItemId');

  if (!meal) return res.status(404).json({ error: 'Not found' });
  res.status(201).json({ meal });
});

// Update an item's serving count.
router.put('/:id/items/:itemId', async (req, res) => {
  const { servingCount } = req.body;
  if (servingCount == null) return res.status(400).json({ error: 'servingCount required' });

  const meal = await Meal.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId, 'items._id': req.params.itemId },
    { $set: { 'items.$.servingCount': Number(servingCount) } },
    { returnDocument: 'after' },
  ).populate('items.foodItemId');

  if (!meal) return res.status(404).json({ error: 'Not found' });
  res.json({ meal });
});

// Remove an item from a meal.
router.delete('/:id/items/:itemId', async (req, res) => {
  const meal = await Meal.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { $pull: { items: { _id: req.params.itemId } } },
    { returnDocument: 'after' },
  ).populate('items.foodItemId');

  if (!meal) return res.status(404).json({ error: 'Not found' });
  res.json({ meal });
});

// Log a meal to the diary. Creates one FoodLog entry per item, stamped with
// mealId so the diary UI can group them under the meal's name.
router.post('/:id/log', async (req, res) => {
  const { date, mealType } = req.body;
  if (!date || !mealType) return res.status(400).json({ error: 'date and mealType required' });

  const meal = await Meal.findOne({ _id: req.params.id, userId: req.userId });
  if (!meal) return res.status(404).json({ error: 'Not found' });
  if (!meal.items.length) return res.status(400).json({ error: 'meal has no items' });

  const docs = meal.items.map((item) => ({
    userId: req.userId,
    foodItemId: item.foodItemId,
    date: new Date(date),
    mealType,
    servingCount: item.servingCount,
    mealId: meal._id,
  }));
  const entries = await FoodLog.insertMany(docs);
  meal.lastLoggedAt = new Date();
  await meal.save();
  res.status(201).json({ entries });
});

export default router;
