import { Router } from 'express';
import ExerciseLog from '../models/ExerciseLog.js';
import Exercise from '../models/Exercise.js';
import UserSettings from '../models/UserSettings.js';
import { childLogger, errContext } from '../lib/logger.js';

const log = childLogger('exerciselog');
const router = Router();

const ENGINE_CLASSES = ['exercise_cardio', 'exercise_resistance', 'exercise_hiit', 'exercise_recovery'];
const LB_PER_KG = 2.2046226218;

// Derive caloriesBurned from MET × kg × hours × intensity. Intensity
// scales the burn proportionally — 1.5× is roughly 50% more work.
function computeKcal(metValue, weightLbs, durationMin, intensity = 1.0) {
  const kg = Number(weightLbs) > 0 ? Number(weightLbs) / LB_PER_KG : 70;
  const hours = Math.max(0, Number(durationMin) || 0) / 60;
  const met = Math.max(1, Number(metValue) || 1);
  const i = Math.max(0.5, Math.min(1.5, Number(intensity) || 1.0));
  return Math.round(met * kg * hours * i);
}

function dateRange(from, to) {
  return {
    $gte: new Date(`${from}T00:00:00.000Z`),
    $lte: new Date(`${to}T23:59:59.999Z`),
  };
}

// List entries in a date range. Used by the dashboard burn / net-calorie
// series and the log page card. Anchors to YYYY-MM-DD inclusive bounds.
router.get('/', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const entries = await ExerciseLog.find({
    userId: req.userId,
    date: dateRange(from, to),
  }).sort({ date: 1 });
  res.json({ entries });
});

// Per-event entries across a range, shaped for the simulation worker.
// Each ExerciseLog row becomes one TimelineItem at its real timestamp.
// Same call shape as /api/foodlog/range-meals — the composable fetches
// both in parallel and the worker merges them into the per-day chunks.
router.get('/range-events', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const entries = await ExerciseLog.find({
    userId: req.userId,
    date: dateRange(from, to),
  }).sort({ date: 1 }).select('date durationMin intensity engineClass label');
  const events = entries.map((e) => ({
    logId: String(e._id),
    timestamp: e.date.toISOString(),
    engineClass: e.engineClass,
    durationMin: e.durationMin,
    intensity: e.intensity,
    label: e.label,
  }));
  res.json({ events });
});

// Daily aggregates for the dashboard chart. Returns one row per day with
// total kcal burned + total durationMin so the chart can render burn
// alongside calories-in without per-entry detail.
router.get('/daily', async (req, res) => {
  const { from, to } = req.query;
  if (!from || !to) return res.status(400).json({ error: 'from and to required' });
  const entries = await ExerciseLog.find({
    userId: req.userId,
    date: dateRange(from, to),
  }).select('date durationMin caloriesBurned');
  const byDay = new Map();
  for (const e of entries) {
    const day = e.date.toISOString().slice(0, 10);
    const acc = byDay.get(day) || { date: day, caloriesBurned: 0, durationMin: 0, count: 0 };
    acc.caloriesBurned += e.caloriesBurned || 0;
    acc.durationMin += e.durationMin || 0;
    acc.count += 1;
    byDay.set(day, acc);
  }
  const days = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));
  res.json({ days });
});

router.post('/', async (req, res) => {
  const rlog = req.log || log;
  const {
    exerciseId, label, engineClass, date, durationMin, intensity,
    caloriesBurned, distanceKm, sets, reps, weightKg, notes,
  } = req.body;

  let resolvedExercise = null;
  let resolvedClass = engineClass;
  let resolvedLabel = label?.trim();
  let resolvedMet = null;

  if (exerciseId) {
    resolvedExercise = await Exercise.findOne({ _id: exerciseId, userId: req.userId }).lean();
    if (!resolvedExercise) return res.status(404).json({ error: 'exercise not found' });
    resolvedClass = resolvedClass || resolvedExercise.engineClass;
    resolvedLabel = resolvedLabel || resolvedExercise.name;
    resolvedMet = resolvedExercise.metValue;
  }

  if (!resolvedLabel) return res.status(400).json({ error: 'label or exerciseId required' });
  if (!ENGINE_CLASSES.includes(resolvedClass)) {
    return res.status(400).json({ error: 'engineClass must be exercise_cardio/resistance/hiit' });
  }
  const dur = Number(durationMin);
  if (!Number.isFinite(dur) || dur < 1) {
    return res.status(400).json({ error: 'durationMin must be ≥ 1' });
  }

  // If the client didn't pre-compute caloriesBurned, derive from MET.
  // For "Quick" mode entries (no exerciseId) the client should send a
  // caloriesBurned override or accept the engine-class fallback MET.
  let kcal = Number.isFinite(Number(caloriesBurned)) ? Math.max(0, Math.round(Number(caloriesBurned))) : null;
  if (kcal == null) {
    const settings = await UserSettings.findOne({ userId: req.userId }).select('currentWeightLbs').lean();
    const weightLbs = settings?.currentWeightLbs || 165;
    const met = resolvedMet ?? engineClassDefaultMet(resolvedClass);
    kcal = computeKcal(met, weightLbs, dur, intensity);
  }

  try {
    const entry = await ExerciseLog.create({
      userId: req.userId,
      exerciseId: resolvedExercise?._id || null,
      label: resolvedLabel,
      engineClass: resolvedClass,
      date: date ? new Date(date) : new Date(),
      durationMin: Math.round(dur),
      intensity: Math.max(0.5, Math.min(1.5, Number(intensity) || 1.0)),
      caloriesBurned: kcal,
      distanceKm: Number.isFinite(Number(distanceKm)) ? Number(distanceKm) : null,
      sets: Number.isFinite(Number(sets)) ? Number(sets) : null,
      reps: Number.isFinite(Number(reps)) ? Number(reps) : null,
      weightKg: Number.isFinite(Number(weightKg)) ? Number(weightKg) : null,
      notes: typeof notes === 'string' ? notes.slice(0, 500) : '',
    });
    rlog.info({ label: resolvedLabel, durationMin: dur }, 'exerciselog: create');
    res.status(201).json({ entry });
  } catch (err) {
    rlog.error({ ...errContext(err) }, 'exerciselog: create failed');
    res.status(500).json({ error: 'create failed' });
  }
});

router.put('/:id', async (req, res) => {
  const entry = await ExerciseLog.findOne({ _id: req.params.id, userId: req.userId });
  if (!entry) return res.status(404).json({ error: 'not found' });

  const allowed = ['label', 'engineClass', 'date', 'durationMin', 'intensity',
    'caloriesBurned', 'distanceKm', 'sets', 'reps', 'weightKg', 'notes'];
  for (const k of allowed) {
    if (req.body[k] === undefined) continue;
    if (k === 'date') entry.date = new Date(req.body.date);
    else if (k === 'engineClass') {
      if (!ENGINE_CLASSES.includes(req.body.engineClass)) {
        return res.status(400).json({ error: 'invalid engineClass' });
      }
      entry.engineClass = req.body.engineClass;
    } else if (k === 'intensity') {
      entry.intensity = Math.max(0.5, Math.min(1.5, Number(req.body.intensity)));
    } else {
      entry[k] = req.body[k];
    }
  }

  // Recompute caloriesBurned from MET × duration × weight × intensity
  // unless the user explicitly wrote a non-null override in this PUT.
  if (req.body.caloriesBurned == null && (req.body.durationMin != null || req.body.intensity != null || req.body.engineClass != null)) {
    const exercise = entry.exerciseId
      ? await Exercise.findOne({ _id: entry.exerciseId, userId: req.userId }).lean()
      : null;
    const settings = await UserSettings.findOne({ userId: req.userId }).select('currentWeightLbs').lean();
    const weightLbs = settings?.currentWeightLbs || 165;
    const met = exercise?.metValue ?? engineClassDefaultMet(entry.engineClass);
    entry.caloriesBurned = computeKcal(met, weightLbs, entry.durationMin, entry.intensity);
  }

  await entry.save();
  res.json({ entry });
});

router.delete('/:id', async (req, res) => {
  const result = await ExerciseLog.deleteOne({ _id: req.params.id, userId: req.userId });
  if (!result.deletedCount) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// Conservative MET fallbacks when the user picks "Quick" mode (no
// catalog entry). Deliberately mid-of-class so the burn estimate isn't
// wildly off either direction.
function engineClassDefaultMet(engineClass) {
  switch (engineClass) {
    case 'exercise_cardio': return 6.0;
    case 'exercise_resistance': return 5.0;
    case 'exercise_hiit': return 8.0;
    case 'exercise_recovery': return 2.5;
    default: return 5.0;
  }
}

export default router;
