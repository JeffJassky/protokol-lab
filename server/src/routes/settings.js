import { Router } from 'express';
import UserSettings from '../models/UserSettings.js';

const router = Router();

router.get('/', async (req, res) => {
  const settings = await UserSettings.findOne({ userId: req.userId });
  res.json({ settings });
});

router.put('/', async (req, res) => {
  const { sex, heightInches, currentWeightLbs, goalWeightLbs, targets } = req.body;

  const settings = await UserSettings.findOneAndUpdate(
    { userId: req.userId },
    { sex, heightInches, currentWeightLbs, goalWeightLbs, targets, updatedAt: new Date() },
    { upsert: true, new: true, runValidators: true },
  );

  res.json({ settings });
});

export default router;
