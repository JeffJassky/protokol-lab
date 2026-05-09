import { Router } from 'express';
import Exercise from '../models/Exercise.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('exercises');
const router = Router();

// System-seeded activities. Engine class pins each one to one of core's
// three intervention keys (`exercise_cardio` / `exercise_resistance` /
// `exercise_hiit`); MET values come from the Compendium of Physical
// Activities. Kept compact (~25 entries) — covers the long tail well
// enough that custom additions are the exception, not the rule.
const SYSTEM_EXERCISES = [
  // Cardio — endurance / aerobic
  { name: 'Walking',         engineClass: 'exercise_cardio',     metValue: 3.5, defaultDurationMin: 30, icon: '🚶', enabledByDefault: true },
  { name: 'Brisk walking',   engineClass: 'exercise_cardio',     metValue: 4.3, defaultDurationMin: 30, icon: '🚶' },
  { name: 'Hiking',          engineClass: 'exercise_cardio',     metValue: 5.3, defaultDurationMin: 60, icon: '🥾' },
  { name: 'Running (jog)',   engineClass: 'exercise_cardio',     metValue: 7.0, defaultDurationMin: 30, icon: '🏃', enabledByDefault: true },
  { name: 'Running (fast)',  engineClass: 'exercise_cardio',     metValue: 9.8, defaultDurationMin: 30, icon: '🏃' },
  { name: 'Cycling',         engineClass: 'exercise_cardio',     metValue: 7.5, defaultDurationMin: 45, icon: '🚴', enabledByDefault: true },
  { name: 'Swimming',        engineClass: 'exercise_cardio',     metValue: 8.0, defaultDurationMin: 30, icon: '🏊' },
  { name: 'Rowing',          engineClass: 'exercise_cardio',     metValue: 7.0, defaultDurationMin: 30, icon: '🚣' },
  { name: 'Elliptical',      engineClass: 'exercise_cardio',     metValue: 5.0, defaultDurationMin: 30, icon: '🏃' },
  { name: 'Stairmaster',     engineClass: 'exercise_cardio',     metValue: 8.8, defaultDurationMin: 20, icon: '🏃' },
  { name: 'Dancing',         engineClass: 'exercise_cardio',     metValue: 4.8, defaultDurationMin: 45, icon: '💃' },
  // Resistance — load + recovery
  { name: 'Strength training (light)',    engineClass: 'exercise_resistance', metValue: 3.5, defaultDurationMin: 45, icon: '🏋️' },
  { name: 'Strength training (vigorous)', engineClass: 'exercise_resistance', metValue: 6.0, defaultDurationMin: 60, icon: '🏋️', enabledByDefault: true },
  { name: 'Powerlifting',    engineClass: 'exercise_resistance', metValue: 6.0, defaultDurationMin: 75, icon: '🏋️' },
  { name: 'Calisthenics',    engineClass: 'exercise_resistance', metValue: 5.0, defaultDurationMin: 45, icon: '🤸' },
  { name: 'Climbing',        engineClass: 'exercise_resistance', metValue: 8.0, defaultDurationMin: 60, icon: '🧗' },
  // Recovery / parasympathetic-dominant — yoga and pilates are intent-
  // anti-stress activities; mapping them to resistance gets the cortisol
  // and sympathetic curves backwards.
  { name: 'Yoga',                engineClass: 'exercise_recovery',   metValue: 2.5, defaultDurationMin: 60, icon: '🧘' },
  { name: 'Pilates',             engineClass: 'exercise_recovery',   metValue: 3.0, defaultDurationMin: 50, icon: '🧘' },
  { name: 'Restorative yoga',    engineClass: 'exercise_recovery',   metValue: 2.0, defaultDurationMin: 45, icon: '🧘' },
  { name: 'Tai chi',             engineClass: 'exercise_recovery',   metValue: 3.0, defaultDurationMin: 30, icon: '🥋' },
  { name: 'Stretching',          engineClass: 'exercise_recovery',   metValue: 2.3, defaultDurationMin: 20, icon: '🤸' },
  { name: 'Mobility / foam roll', engineClass: 'exercise_recovery',  metValue: 2.0, defaultDurationMin: 15, icon: '🌀' },
  // HIIT / mixed-modal high-intensity
  { name: 'HIIT',            engineClass: 'exercise_hiit',       metValue: 8.0, defaultDurationMin: 20, icon: '🔥', enabledByDefault: true },
  { name: 'CrossFit',        engineClass: 'exercise_hiit',       metValue: 8.0, defaultDurationMin: 45, icon: '🔥' },
  { name: 'Boxing',          engineClass: 'exercise_hiit',       metValue: 7.8, defaultDurationMin: 45, icon: '🥊' },
  { name: 'Tennis',          engineClass: 'exercise_hiit',       metValue: 7.3, defaultDurationMin: 60, icon: '🎾' },
  { name: 'Pickleball',      engineClass: 'exercise_hiit',       metValue: 4.5, defaultDurationMin: 60, icon: '🎾' },
  { name: 'Soccer',          engineClass: 'exercise_hiit',       metValue: 7.0, defaultDurationMin: 60, icon: '⚽' },
  { name: 'Basketball',      engineClass: 'exercise_hiit',       metValue: 6.5, defaultDurationMin: 60, icon: '🏀' },
];

async function ensureDefaults(userId) {
  const existing = await Exercise.find({ userId, isSystem: true })
    .select('name')
    .lean();
  const have = new Set(existing.map((e) => e.name));
  const missing = SYSTEM_EXERCISES.filter((e) => !have.has(e.name));

  if (missing.length) {
    const docs = missing.map((e, i) => ({
      userId,
      name: e.name,
      isSystem: true,
      enabled: e.enabledByDefault === true,
      engineClass: e.engineClass,
      metValue: e.metValue,
      defaultDurationMin: e.defaultDurationMin,
      defaultIntensity: 1.0,
      icon: e.icon || '',
      order: existing.length + i,
    }));
    try {
      await Exercise.insertMany(docs, { ordered: false });
      log.info({ userId: String(userId), count: docs.length }, 'exercises: seeded system');
    } catch (err) {
      if (err.code !== 11000) {
        log.error({ ...errContext(err), userId: String(userId) }, 'exercises: seed failed');
        throw err;
      }
      log.debug({ userId: String(userId) }, 'exercises: seed race (duplicate, ignored)');
    }
  }
}

router.get('/', async (req, res) => {
  await ensureDefaults(req.userId);
  const exercises = await Exercise.find({ userId: req.userId }).sort({ order: 1, createdAt: 1 });
  (req.log || log).debug({ count: exercises.length }, 'exercises: list');
  res.json({ exercises });
});

router.post('/', async (req, res) => {
  const rlog = req.log || log;
  const { name, engineClass, metValue, defaultDurationMin, defaultIntensity, icon, color } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'name required' });
  if (!['exercise_cardio', 'exercise_resistance', 'exercise_hiit', 'exercise_recovery'].includes(engineClass)) {
    return res.status(400).json({ error: 'engineClass must be exercise_cardio/resistance/hiit/recovery' });
  }
  const met = Number(metValue);
  if (!Number.isFinite(met) || met < 1) return res.status(400).json({ error: 'metValue must be ≥ 1' });

  try {
    const exercise = await Exercise.create({
      userId: req.userId,
      name: name.trim(),
      isSystem: false,
      enabled: true,
      engineClass,
      metValue: met,
      defaultDurationMin: Number(defaultDurationMin) || 30,
      defaultIntensity: Math.max(0.5, Math.min(1.5, Number(defaultIntensity) || 1.0)),
      icon: icon || '',
      color: color || '',
    });
    rlog.info({ name }, 'exercises: create');
    res.status(201).json({ exercise });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ error: 'duplicate exercise name' });
    rlog.error({ ...errContext(err) }, 'exercises: create failed');
    res.status(500).json({ error: 'create failed' });
  }
});

router.patch('/:id', async (req, res) => {
  const allowed = ['name', 'enabled', 'engineClass', 'metValue', 'defaultDurationMin', 'defaultIntensity', 'icon', 'color', 'order'];
  const set = {};
  for (const k of allowed) if (req.body[k] !== undefined) set[k] = req.body[k];
  if (set.engineClass && !['exercise_cardio', 'exercise_resistance', 'exercise_hiit', 'exercise_recovery'].includes(set.engineClass)) {
    return res.status(400).json({ error: 'invalid engineClass' });
  }
  if (set.defaultIntensity != null) {
    set.defaultIntensity = Math.max(0.5, Math.min(1.5, Number(set.defaultIntensity)));
  }
  const exercise = await Exercise.findOneAndUpdate(
    { _id: req.params.id, userId: req.userId },
    { $set: set },
    { new: true, runValidators: true },
  );
  if (!exercise) return res.status(404).json({ error: 'not found' });
  res.json({ exercise });
});

router.delete('/:id', async (req, res) => {
  const exercise = await Exercise.findOne({ _id: req.params.id, userId: req.userId });
  if (!exercise) return res.status(404).json({ error: 'not found' });
  // System rows can be disabled (enabled=false) but not deleted — keeps
  // the seed-on-startup contract honest. User-defined rows delete fully.
  if (exercise.isSystem) {
    exercise.enabled = false;
    await exercise.save();
    return res.json({ ok: true, disabled: true });
  }
  await Exercise.deleteOne({ _id: exercise._id });
  res.json({ ok: true, deleted: true });
});

export default router;
