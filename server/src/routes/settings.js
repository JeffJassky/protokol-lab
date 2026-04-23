import { Router } from 'express';
import UserSettings from '../models/UserSettings.js';

const router = Router();

router.get('/', async (req, res) => {
  const settings = await UserSettings.findOne({ userId: req.userId });
  res.json({ settings });
});

router.put('/', async (req, res) => {
  const {
    sex, heightInches, currentWeightLbs, goalWeightLbs, bmr, targets,
    timezone, trackReminder,
  } = req.body;

  const update = { sex, heightInches, currentWeightLbs, goalWeightLbs, bmr, targets, updatedAt: new Date() };
  if (timezone !== undefined) update.timezone = timezone;
  if (trackReminder !== undefined) {
    update.trackReminder = {
      enabled: Boolean(trackReminder.enabled),
      time: trackReminder.time || '20:00',
    };
  }

  const settings = await UserSettings.findOneAndUpdate(
    { userId: req.userId },
    update,
    { upsert: true, returnDocument: 'after', runValidators: true },
  );

  res.json({ settings });
});

// Lightweight endpoint for the client to push just timezone / reminder prefs
// without having to round-trip the full profile. Used by the onboarding flow
// when the user enables notifications.
router.patch('/notifications', async (req, res) => {
  const { timezone, trackReminder } = req.body || {};
  const update = {};
  if (timezone !== undefined) update.timezone = timezone;
  if (trackReminder !== undefined) {
    update.trackReminder = {
      enabled: Boolean(trackReminder.enabled),
      time: trackReminder.time || '20:00',
    };
  }
  const settings = await UserSettings.findOneAndUpdate(
    { userId: req.userId },
    { $set: update },
    { new: true },
  );
  res.json({ settings });
});

export default router;
