import { Router } from 'express';
import UserSettings from '../models/UserSettings.js';
import WeightLog from '../models/WeightLog.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('settings');
const router = Router();

const ACTIVITY = ['sedentary', 'light', 'moderate', 'very', 'athlete'];

router.get('/', async (req, res) => {
  const settings = await UserSettings.findOne({ userId: req.userId });

  // One-shot migration: the legacy `bmr` field was overloaded — users were
  // entering their TDEE there because the calorie-delta math (calories - bmr)
  // only makes sense against daily burn. Move that value to `tdee` and clear
  // `bmr` so a fresh Mifflin BMR can be auto-computed from sex/age/h/w later.
  // Idempotent: skipped once `tdee` is populated.
  if (settings && settings.tdee == null && settings.bmr != null) {
    settings.tdee = settings.bmr;
    settings.bmr = null;
    await settings.save();
    (req.log || log).info(
      { userId: String(req.userId), tdee: settings.tdee },
      'settings: migrated legacy bmr value to tdee',
    );
  }

  (req.log || log).debug({ hasSettings: Boolean(settings) }, 'settings: fetched');
  res.json({ settings });
});

// Upsert. Sets only fields that are explicitly provided so that callers which
// don't know about every field (legacy Settings form vs. wizard) don't wipe
// fields they didn't touch. Equivalent to the PATCH below — kept on PUT for
// the legacy client.
router.put('/', async (req, res) => {
  const allowed = [
    'sex', 'age', 'heightInches', 'currentWeightLbs', 'goalWeightLbs', 'bmr', 'tdee',
    'activityLevel', 'goalRateLbsPerWeek', 'targets', 'timezone',
  ];
  const set = { updatedAt: new Date() };
  for (const k of allowed) {
    if (req.body[k] !== undefined) set[k] = req.body[k];
  }
  if (set.activityLevel && !ACTIVITY.includes(set.activityLevel)) {
    return res.status(400).json({ error: 'invalid activityLevel' });
  }
  if (req.body.trackReminder !== undefined) {
    set.trackReminder = {
      enabled: Boolean(req.body.trackReminder.enabled),
      time: req.body.trackReminder.time || '20:00',
    };
  }

  const settings = await UserSettings.findOneAndUpdate(
    { userId: req.userId },
    { $set: set, $setOnInsert: { userId: req.userId } },
    { upsert: true, returnDocument: 'after', runValidators: true },
  );

  (req.log || log).info(
    { fields: Object.keys(set).filter((k) => k !== 'updatedAt') },
    'settings: full update',
  );
  res.json({ settings });
});

// Partial upsert. Used by the onboarding wizard so each step persists only
// the fields it touched without clearing fields the user hasn't reached yet.
router.patch('/', async (req, res) => {
  const allowed = [
    'sex', 'age', 'heightInches', 'currentWeightLbs', 'goalWeightLbs', 'bmr', 'tdee',
    'activityLevel', 'goalRateLbsPerWeek', 'targets', 'timezone',
  ];
  const set = { updatedAt: new Date() };
  for (const k of allowed) {
    if (req.body[k] !== undefined) set[k] = req.body[k];
  }
  if (set.activityLevel && !ACTIVITY.includes(set.activityLevel)) {
    return res.status(400).json({ error: 'invalid activityLevel' });
  }
  if (req.body.trackReminder !== undefined) {
    set.trackReminder = {
      enabled: Boolean(req.body.trackReminder.enabled),
      time: req.body.trackReminder.time || '20:00',
    };
  }

  const settings = await UserSettings.findOneAndUpdate(
    { userId: req.userId },
    { $set: set, $setOnInsert: { userId: req.userId } },
    { upsert: true, new: true, runValidators: true },
  );

  // When the wizard's "basics" step writes the user's current weight, also
  // drop a WeightLog for today if they don't have one yet — gives them a real
  // first data point so the dashboard isn't empty on day one. Idempotent: a
  // pre-existing today entry (e.g. user manually logged before finishing the
  // wizard, or revisits the basics step) is left alone.
  if (req.body.currentWeightLbs !== undefined) {
    const w = Number(req.body.currentWeightLbs);
    if (Number.isFinite(w) && w > 0) {
      const dayStart = new Date();
      dayStart.setUTCHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);
      const existing = await WeightLog.findOne({
        userId: req.userId,
        date: { $gte: dayStart, $lt: dayEnd },
      });
      if (!existing) {
        await WeightLog.create({
          userId: req.userId,
          weightLbs: w,
          date: new Date(),
        });
        (req.log || log).info(
          { userId: String(req.userId), weightLbs: w },
          'settings: auto-logged weight from currentWeightLbs',
        );
      }
    }
  }

  (req.log || log).info(
    { fields: Object.keys(set).filter((k) => k !== 'updatedAt') },
    'settings: patched',
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
