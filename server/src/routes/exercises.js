import { Router } from 'express';
import mongoose from 'mongoose';
import Exercise from '../models/Exercise.js';
import ExerciseLog from '../models/ExerciseLog.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('exercises');
const router = Router();

// System-seeded activities. Engine class pins each one to one of core's
// four intervention keys (cardio / resistance / hiit / recovery); MET
// values come from the Compendium of Physical Activities (Ainsworth
// 2011) so every entry parameterizes the burn-math identically to a
// custom row with the same MET. Adding entries here is non-destructive
// — `ensureDefaults` only inserts rows the user doesn't already have.
const SYSTEM_EXERCISES = [
  // ===== Cardio — steady-state aerobic =====
  { name: 'Walking',                 engineClass: 'exercise_cardio',     metValue: 3.5, defaultDurationMin: 30, icon: '🚶', enabledByDefault: true },
  { name: 'Brisk walking',           engineClass: 'exercise_cardio',     metValue: 4.3, defaultDurationMin: 30, icon: '🚶' },
  { name: 'Walking (incline)',       engineClass: 'exercise_cardio',     metValue: 6.0, defaultDurationMin: 30, icon: '🚶' },
  { name: 'Hiking',                  engineClass: 'exercise_cardio',     metValue: 5.3, defaultDurationMin: 60, icon: '🥾' },
  { name: 'Trail running',           engineClass: 'exercise_cardio',     metValue: 9.0, defaultDurationMin: 45, icon: '🏃' },
  { name: 'Running (jog)',           engineClass: 'exercise_cardio',     metValue: 7.0, defaultDurationMin: 30, icon: '🏃', enabledByDefault: true },
  { name: 'Running (fast)',          engineClass: 'exercise_cardio',     metValue: 9.8, defaultDurationMin: 30, icon: '🏃' },
  { name: 'Treadmill (steady)',      engineClass: 'exercise_cardio',     metValue: 7.0, defaultDurationMin: 30, icon: '🏃' },
  { name: 'Cycling (leisure)',       engineClass: 'exercise_cardio',     metValue: 5.8, defaultDurationMin: 45, icon: '🚴' },
  { name: 'Cycling',                 engineClass: 'exercise_cardio',     metValue: 7.5, defaultDurationMin: 45, icon: '🚴', enabledByDefault: true },
  { name: 'Cycling (vigorous)',      engineClass: 'exercise_cardio',     metValue: 10.0, defaultDurationMin: 45, icon: '🚴' },
  { name: 'Spin class',              engineClass: 'exercise_cardio',     metValue: 8.5, defaultDurationMin: 45, icon: '🚴' },
  { name: 'Swimming (freestyle)',    engineClass: 'exercise_cardio',     metValue: 8.0, defaultDurationMin: 30, icon: '🏊' },
  { name: 'Swimming (laps, easy)',   engineClass: 'exercise_cardio',     metValue: 5.8, defaultDurationMin: 30, icon: '🏊' },
  { name: 'Water aerobics',          engineClass: 'exercise_cardio',     metValue: 5.5, defaultDurationMin: 45, icon: '🌊' },
  { name: 'Rowing (machine)',        engineClass: 'exercise_cardio',     metValue: 7.0, defaultDurationMin: 30, icon: '🚣' },
  { name: 'Rowing (water)',          engineClass: 'exercise_cardio',     metValue: 6.0, defaultDurationMin: 45, icon: '🚣' },
  { name: 'Kayaking',                engineClass: 'exercise_cardio',     metValue: 5.0, defaultDurationMin: 60, icon: '🛶' },
  { name: 'Paddleboarding',          engineClass: 'exercise_cardio',     metValue: 6.0, defaultDurationMin: 60, icon: '🌊' },
  { name: 'Surfing',                 engineClass: 'exercise_cardio',     metValue: 5.0, defaultDurationMin: 90, icon: '🏄' },
  { name: 'Snowboarding',            engineClass: 'exercise_cardio',     metValue: 5.3, defaultDurationMin: 90, icon: '🏂' },
  { name: 'Skiing (downhill)',       engineClass: 'exercise_cardio',     metValue: 6.0, defaultDurationMin: 90, icon: '⛷️' },
  { name: 'Cross-country skiing',    engineClass: 'exercise_cardio',     metValue: 9.0, defaultDurationMin: 60, icon: '⛷️' },
  { name: 'Ice skating',             engineClass: 'exercise_cardio',     metValue: 5.5, defaultDurationMin: 60, icon: '⛸️' },
  { name: 'Roller skating',          engineClass: 'exercise_cardio',     metValue: 7.0, defaultDurationMin: 60, icon: '🛼' },
  { name: 'Elliptical',              engineClass: 'exercise_cardio',     metValue: 5.0, defaultDurationMin: 30, icon: '🏃' },
  { name: 'Stairmaster',             engineClass: 'exercise_cardio',     metValue: 8.8, defaultDurationMin: 20, icon: '🏃' },
  { name: 'Stair climbing (real)',   engineClass: 'exercise_cardio',     metValue: 8.0, defaultDurationMin: 20, icon: '🪜' },
  { name: 'Dancing',                 engineClass: 'exercise_cardio',     metValue: 4.8, defaultDurationMin: 45, icon: '💃' },
  { name: 'Zumba',                   engineClass: 'exercise_cardio',     metValue: 7.0, defaultDurationMin: 45, icon: '💃' },
  { name: 'Ballet',                  engineClass: 'exercise_cardio',     metValue: 5.0, defaultDurationMin: 60, icon: '🩰' },
  { name: 'Gardening',               engineClass: 'exercise_cardio',     metValue: 3.5, defaultDurationMin: 60, icon: '🌱' },
  { name: 'Yard work',               engineClass: 'exercise_cardio',     metValue: 4.5, defaultDurationMin: 60, icon: '🍂' },
  { name: 'Manual labor',            engineClass: 'exercise_cardio',     metValue: 5.5, defaultDurationMin: 60, icon: '🔨' },

  // ===== Resistance — load-bearing, hypertrophy, power =====
  { name: 'Strength training (light)',    engineClass: 'exercise_resistance', metValue: 3.5, defaultDurationMin: 45, icon: '🏋️' },
  { name: 'Strength training (vigorous)', engineClass: 'exercise_resistance', metValue: 6.0, defaultDurationMin: 60, icon: '🏋️', enabledByDefault: true },
  { name: 'Powerlifting',                 engineClass: 'exercise_resistance', metValue: 6.0, defaultDurationMin: 75, icon: '🏋️' },
  { name: 'Olympic lifting',              engineClass: 'exercise_resistance', metValue: 6.0, defaultDurationMin: 75, icon: '🏋️' },
  { name: 'Bodybuilding split',           engineClass: 'exercise_resistance', metValue: 5.0, defaultDurationMin: 75, icon: '🏋️' },
  { name: 'Calisthenics',                 engineClass: 'exercise_resistance', metValue: 5.0, defaultDurationMin: 45, icon: '🤸' },
  { name: 'Bodyweight circuit',           engineClass: 'exercise_resistance', metValue: 5.5, defaultDurationMin: 30, icon: '🤸' },
  { name: 'Kettlebell training',          engineClass: 'exercise_resistance', metValue: 6.5, defaultDurationMin: 30, icon: '🏋️' },
  { name: 'Climbing',                     engineClass: 'exercise_resistance', metValue: 8.0, defaultDurationMin: 60, icon: '🧗' },
  { name: 'Bouldering',                   engineClass: 'exercise_resistance', metValue: 7.5, defaultDurationMin: 60, icon: '🧗' },
  { name: 'TRX / suspension training',    engineClass: 'exercise_resistance', metValue: 5.0, defaultDurationMin: 45, icon: '🤸' },

  // ===== HIIT / mixed-modal high-intensity =====
  { name: 'HIIT',                  engineClass: 'exercise_hiit',       metValue: 8.0, defaultDurationMin: 20, icon: '🔥', enabledByDefault: true },
  { name: 'CrossFit',              engineClass: 'exercise_hiit',       metValue: 8.0, defaultDurationMin: 45, icon: '🔥' },
  { name: 'Functional fitness',    engineClass: 'exercise_hiit',       metValue: 7.0, defaultDurationMin: 45, icon: '🔥' },
  { name: 'Bootcamp',              engineClass: 'exercise_hiit',       metValue: 7.5, defaultDurationMin: 45, icon: '🔥' },
  { name: 'Sprints / intervals',   engineClass: 'exercise_hiit',       metValue: 11.0, defaultDurationMin: 20, icon: '⚡' },
  { name: 'Jump rope',             engineClass: 'exercise_hiit',       metValue: 11.0, defaultDurationMin: 15, icon: '🪢' },
  { name: 'Boxing',                engineClass: 'exercise_hiit',       metValue: 7.8, defaultDurationMin: 45, icon: '🥊' },
  { name: 'Kickboxing',            engineClass: 'exercise_hiit',       metValue: 7.5, defaultDurationMin: 45, icon: '🥊' },
  { name: 'Muay Thai',             engineClass: 'exercise_hiit',       metValue: 8.0, defaultDurationMin: 60, icon: '🥊' },
  { name: 'BJJ / grappling',       engineClass: 'exercise_hiit',       metValue: 7.5, defaultDurationMin: 75, icon: '🥋' },
  { name: 'MMA',                   engineClass: 'exercise_hiit',       metValue: 9.0, defaultDurationMin: 60, icon: '🥊' },
  { name: 'Karate / taekwondo',    engineClass: 'exercise_hiit',       metValue: 7.0, defaultDurationMin: 60, icon: '🥋' },
  { name: 'Wrestling',             engineClass: 'exercise_hiit',       metValue: 8.0, defaultDurationMin: 60, icon: '🤼' },
  { name: 'Tennis',                engineClass: 'exercise_hiit',       metValue: 7.3, defaultDurationMin: 60, icon: '🎾' },
  { name: 'Pickleball',            engineClass: 'exercise_hiit',       metValue: 4.5, defaultDurationMin: 60, icon: '🎾' },
  { name: 'Squash',                engineClass: 'exercise_hiit',       metValue: 8.0, defaultDurationMin: 60, icon: '🎾' },
  { name: 'Racquetball',           engineClass: 'exercise_hiit',       metValue: 7.0, defaultDurationMin: 60, icon: '🎾' },
  { name: 'Badminton',             engineClass: 'exercise_hiit',       metValue: 5.5, defaultDurationMin: 60, icon: '🏸' },
  { name: 'Soccer',                engineClass: 'exercise_hiit',       metValue: 7.0, defaultDurationMin: 60, icon: '⚽' },
  { name: 'Basketball',            engineClass: 'exercise_hiit',       metValue: 6.5, defaultDurationMin: 60, icon: '🏀' },
  { name: 'Hockey',                engineClass: 'exercise_hiit',       metValue: 8.0, defaultDurationMin: 60, icon: '🏒' },
  { name: 'Volleyball',            engineClass: 'exercise_hiit',       metValue: 4.0, defaultDurationMin: 60, icon: '🏐' },
  { name: 'Ultimate frisbee',      engineClass: 'exercise_hiit',       metValue: 8.0, defaultDurationMin: 60, icon: '🥏' },

  // ===== Recovery / parasympathetic-dominant =====
  // Mapped to exercise_recovery so the engine drops cortisol/sympathetic
  // tone instead of raising it (the resistance class would do the
  // opposite — backwards for mind-body work).
  { name: 'Yoga',                  engineClass: 'exercise_recovery',   metValue: 2.5, defaultDurationMin: 60, icon: '🧘' },
  { name: 'Hot yoga',              engineClass: 'exercise_recovery',   metValue: 4.0, defaultDurationMin: 60, icon: '🧘' },
  { name: 'Restorative yoga',      engineClass: 'exercise_recovery',   metValue: 2.0, defaultDurationMin: 45, icon: '🧘' },
  { name: 'Yin yoga',              engineClass: 'exercise_recovery',   metValue: 2.0, defaultDurationMin: 60, icon: '🧘' },
  { name: 'Pilates',               engineClass: 'exercise_recovery',   metValue: 3.0, defaultDurationMin: 50, icon: '🧘' },
  { name: 'Tai chi',               engineClass: 'exercise_recovery',   metValue: 3.0, defaultDurationMin: 30, icon: '🥋' },
  { name: 'Qigong',                engineClass: 'exercise_recovery',   metValue: 2.5, defaultDurationMin: 30, icon: '🧘' },
  { name: 'Stretching',            engineClass: 'exercise_recovery',   metValue: 2.3, defaultDurationMin: 20, icon: '🤸' },
  { name: 'Mobility / foam roll',  engineClass: 'exercise_recovery',   metValue: 2.0, defaultDurationMin: 15, icon: '🌀' },
  { name: 'Breathwork',            engineClass: 'exercise_recovery',   metValue: 1.5, defaultDurationMin: 15, icon: '🫁' },
  { name: 'Meditation (seated)',   engineClass: 'exercise_recovery',   metValue: 1.3, defaultDurationMin: 20, icon: '🧘' },
  { name: 'Walking meditation',    engineClass: 'exercise_recovery',   metValue: 2.5, defaultDurationMin: 20, icon: '🚶' },
  { name: 'Sauna',                 engineClass: 'exercise_recovery',   metValue: 1.5, defaultDurationMin: 20, icon: '🔥' },
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

// Recently used exercise IDs in MRU order. Aggregates the last `limit`
// distinct exerciseIds across the user's ExerciseLog entries — the
// typeahead surfaces these above search results so the user's habitual
// activities are one tap away. Free-form entries (no exerciseId) are
// skipped because they have no catalog identity to surface.
router.get('/recent', async (req, res) => {
  const limit = Math.max(1, Math.min(20, Number(req.query.limit) || 8));
  const userId = new mongoose.Types.ObjectId(req.userId);
  const rows = await ExerciseLog.aggregate([
    { $match: { userId, exerciseId: { $ne: null } } },
    { $sort: { date: -1 } },
    { $group: { _id: '$exerciseId', lastUsed: { $first: '$date' } } },
    { $sort: { lastUsed: -1 } },
    { $limit: limit },
  ]);
  res.json({ exerciseIds: rows.map((r) => String(r._id)) });
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
