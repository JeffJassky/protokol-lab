import { Router } from 'express';
import Meal from '../models/Meal.js';
import FoodLog from '../models/FoodLog.js';
import { childLogger } from '../lib/logger.js';
import { evaluateStorageCap } from '../lib/planLimits.js';
import { parseLogDate } from '../lib/date.js';

const log = childLogger('meals');
const router = Router();

router.get('/', async (req, res) => {
  const meals = await Meal.find({ userId: req.userId })
    .sort({ updatedAt: -1 })
    .populate('items.foodItemId');
  (req.log || log).debug({ count: meals.length }, 'meals: list');
  res.json({ meals });
});

router.get('/:id', async (req, res) => {
  const meal = await Meal.findOne({ _id: req.params.id, userId: req.userId })
    .populate('items.foodItemId');
  if (!meal) {
    (req.log || log).warn({ mealId: req.params.id }, 'meals: get not found');
    return res.status(404).json({ error: 'Not found' });
  }
  res.json({ meal });
});

router.post('/', async (req, res) => {
  const rlog = req.log || log;
  const { name, emoji, items } = req.body;
  if (!name || !name.trim()) {
    rlog.warn('meals create: missing name');
    return res.status(400).json({ error: 'name required' });
  }

  // Plan cap: every Meal doc belongs to one user; no system/built-in meals
  // exist (verified against Meal.js schema), so a raw count is the cap baseline.
  const used = await Meal.countDocuments({ userId: req.userId });
  const denial = evaluateStorageCap(req.user, 'savedMeals', used);
  if (denial) {
    rlog.warn(
      { userId: String(req.userId), used: denial.used, limit: denial.limit, plan: denial.currentPlan },
      'meals create: plan cap reached',
    );
    return res.status(403).json({
      ...denial,
      message: denial.upgradePlanId
        ? `Your ${denial.currentPlan} plan allows ${denial.limit} saved meal${denial.limit === 1 ? '' : 's'}. Upgrade to save more.`
        : `You've reached the ${denial.limit}-meal limit for your plan.`,
    });
  }

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
  (req.log || log).info(
    { mealId: String(meal._id), name: meal.name, itemCount: meal.items.length },
    'meals: created',
  );
  res.status(201).json({ meal: populated });
});

router.put('/:id', async (req, res) => {
  const update = {};
  if (req.body.name != null) update.name = String(req.body.name).trim();
  if (req.body.emoji != null) update.emoji = String(req.body.emoji);

  const meal = await Meal.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    update,
    { returnDocument: 'after' },
  ).populate('items.foodItemId');

  if (!meal) {
    (req.log || log).warn({ mealId: req.params.id }, 'meals update: not found');
    return res.status(404).json({ error: 'Not found' });
  }
  (req.log || log).info({ mealId: req.params.id, fields: Object.keys(update) }, 'meals: updated');
  res.json({ meal });
});

router.delete('/:id', async (req, res) => {
  const result = await Meal.findOneAndDelete({ _id: req.params.id, userId: req.userId });
  if (!result) {
    (req.log || log).warn({ mealId: req.params.id }, 'meals delete: not found');
    return res.status(404).json({ error: 'Not found' });
  }
  (req.log || log).info({ mealId: req.params.id }, 'meals: deleted');
  res.status(204).send();
});

router.post('/:id/items', async (req, res) => {
  const { foodItemId, servingCount = 1 } = req.body;
  if (!foodItemId) {
    (req.log || log).warn({ mealId: req.params.id }, 'meals add-item: missing foodItemId');
    return res.status(400).json({ error: 'foodItemId required' });
  }

  const meal = await Meal.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { $push: { items: { foodItemId, servingCount } } },
    { returnDocument: 'after' },
  ).populate('items.foodItemId');

  if (!meal) {
    (req.log || log).warn({ mealId: req.params.id }, 'meals add-item: meal not found');
    return res.status(404).json({ error: 'Not found' });
  }
  (req.log || log).info(
    { mealId: req.params.id, foodItemId, servingCount },
    'meals: item added',
  );
  res.status(201).json({ meal });
});

router.put('/:id/items/:itemId', async (req, res) => {
  const { servingCount } = req.body;
  if (servingCount == null) {
    (req.log || log).warn({ mealId: req.params.id, itemId: req.params.itemId }, 'meals item update: missing servingCount');
    return res.status(400).json({ error: 'servingCount required' });
  }

  const meal = await Meal.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId, 'items._id': req.params.itemId },
    { $set: { 'items.$.servingCount': Number(servingCount) } },
    { returnDocument: 'after' },
  ).populate('items.foodItemId');

  if (!meal) {
    (req.log || log).warn({ mealId: req.params.id, itemId: req.params.itemId }, 'meals item update: not found');
    return res.status(404).json({ error: 'Not found' });
  }
  (req.log || log).info(
    { mealId: req.params.id, itemId: req.params.itemId, servingCount },
    'meals: item updated',
  );
  res.json({ meal });
});

router.delete('/:id/items/:itemId', async (req, res) => {
  const meal = await Meal.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { $pull: { items: { _id: req.params.itemId } } },
    { returnDocument: 'after' },
  ).populate('items.foodItemId');

  if (!meal) {
    (req.log || log).warn({ mealId: req.params.id, itemId: req.params.itemId }, 'meals item delete: not found');
    return res.status(404).json({ error: 'Not found' });
  }
  (req.log || log).info({ mealId: req.params.id, itemId: req.params.itemId }, 'meals: item removed');
  res.json({ meal });
});

router.post('/:id/log', async (req, res) => {
  const rlog = req.log || log;
  const { date, mealType } = req.body;
  if (!date || !mealType) {
    rlog.warn({ mealId: req.params.id, date, mealType }, 'meals log: missing date/mealType');
    return res.status(400).json({ error: 'date and mealType required' });
  }

  const meal = await Meal.findOne({ _id: req.params.id, userId: req.userId });
  if (!meal) {
    rlog.warn({ mealId: req.params.id }, 'meals log: meal not found');
    return res.status(404).json({ error: 'Not found' });
  }
  if (!meal.items.length) {
    rlog.warn({ mealId: req.params.id }, 'meals log: empty meal');
    return res.status(400).json({ error: 'meal has no items' });
  }

  const docs = meal.items.map((item) => ({
    userId: req.userId,
    foodItemId: item.foodItemId,
    date: parseLogDate(date),
    mealType,
    servingCount: item.servingCount,
    mealId: meal._id,
  }));
  const entries = await FoodLog.insertMany(docs);
  meal.lastLoggedAt = new Date();
  await meal.save();

  rlog.info(
    { mealId: req.params.id, date, mealType, itemCount: entries.length },
    'meals: logged to diary',
  );
  res.status(201).json({ entries });
});

export default router;
