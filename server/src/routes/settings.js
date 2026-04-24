import { Router } from 'express';
import UserSettings from '../models/UserSettings.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('settings');
const router = Router();

router.get('/', async (req, res) => {
  const settings = await UserSettings.findOne({ userId: req.userId });
  (req.log || log).debug({ hasSettings: Boolean(settings) }, 'settings: fetched');
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

  (req.log || log).info(
    {
      sex, heightInches, goalWeightLbs, timezone,
      trackReminderEnabled: settings.trackReminder?.enabled,
      trackReminderTime: settings.trackReminder?.time,
    },
    'settings: full update',
  );

  res.json({ settings });
});

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
  (req.log || log).info(
    { timezone, trackReminderEnabled: settings?.trackReminder?.enabled, trackReminderTime: settings?.trackReminder?.time },
    'settings: notifications patched',
  );
  res.json({ settings });
});

export default router;
