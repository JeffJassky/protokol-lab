// Server-side input loaders for the sim runner. Pulls FoodLog, ExerciseLog,
// and UserSettings → returns the same shapes the client worker consumed.
// The two range routes (`/api/foodlog/range-meals`, `/api/exerciselog/
// range-events`) are kept untouched — these helpers just call the same
// queries directly, no HTTP hop.

import FoodLog from '../models/FoodLog.js';
import ExerciseLog from '../models/ExerciseLog.js';
import DoseLog from '../models/DoseLog.js';
import UserSettings from '../models/UserSettings.js';
import { scaleNutrients, roundNutrients } from '../../../shared/logging/nutrients.js';

// Pull every consumed FoodLog in the window. Each row → one meal event
// at its real timestamp. Mirrors `/api/foodlog/range-meals` exactly.
export async function loadMeals(userId, fromMs, toMs) {
  const rangeStart = new Date(fromMs);
  const rangeEnd = new Date(toMs);
  const entries = await FoodLog.find({
    userId,
    date: { $gte: rangeStart, $lt: rangeEnd },
    consumed: true,
  }).populate('foodItemId').sort({ date: 1 });

  const meals = [];
  for (const entry of entries) {
    const food = entry.foodItemId;
    if (!food) continue;
    const nutrients = roundNutrients(
      scaleNutrients(food.perServing, entry.servingCount),
      1,
    );
    meals.push({
      logId: String(entry._id),
      timestamp: entry.date.toISOString(),
      mealType: entry.mealType,
      nutrients,
    });
  }
  return meals;
}

// Pull DoseLog rows in the window. Canonical doses (those with a
// `coreInterventionKey`) feed straight into the sim engine via the
// matching intervention def in core's intervention library. Custom
// doses (custom Compound rows the user authored) are skipped here —
// the engine doesn't have a generic peptide def to drive them, so we
// leave their visualization to the existing dashboard PK-curve path
// (server/src/routes/doses.js builds those Bateman curves separately).
export async function loadDoses(userId, fromMs, toMs) {
  const rangeStart = new Date(fromMs);
  const rangeEnd = new Date(toMs);
  const entries = await DoseLog.find({
    userId,
    date: { $gte: rangeStart, $lt: rangeEnd },
    // Canonical-only — `coreInterventionKey` set, `compoundId` is
    // null after the migration. Custom doses (with compoundId) are
    // visualized via the dashboard PK route, not the sim engine.
    coreInterventionKey: { $ne: null },
  }).sort({ date: 1 }).select('date value coreInterventionKey');
  return entries.map((d) => ({
    logId: String(d._id),
    timestamp: d.date.toISOString(),
    coreInterventionKey: d.coreInterventionKey,
    value: Number(d.value),
  }));
}

// Pull ExerciseLog rows in the window. Each → one exercise event.
// Mirrors `/api/exerciselog/range-events`.
export async function loadExercises(userId, fromMs, toMs) {
  const rangeStart = new Date(fromMs);
  const rangeEnd = new Date(toMs);
  const entries = await ExerciseLog.find({
    userId,
    date: { $gte: rangeStart, $lt: rangeEnd },
  }).sort({ date: 1 }).select('date durationMin intensity engineClass label');
  return entries.map((e) => ({
    logId: String(e._id),
    timestamp: e.date.toISOString(),
    engineClass: e.engineClass,
    durationMin: e.durationMin,
    intensity: e.intensity,
    label: e.label,
  }));
}

// Read UserSettings and return the subject "partial" the runner expects
// (SI units, normalized cycle params). Mirrors `endoSubjectFromSettings`
// in DashboardPage.vue:849. Anything missing falls through to the
// runner's buildSubject which patches it from DEFAULT_SUBJECT.
export async function buildSubjectFromUser(userId, now = Date.now()) {
  const s = (await UserSettings.findOne({ userId }).lean()) || {};

  const heightCm = s.heightInches != null ? Number(s.heightInches) * 2.54 : undefined;
  const weightKg = s.currentWeightLbs != null
    ? Number(s.currentWeightLbs) * 0.45359237
    : undefined;

  let cycleDay, cycleLengthOut, lutealPhaseLength;
  const m = s.menstruation;
  if (s.sex === 'female' && m?.enabled && m.lastPeriodStart) {
    const start = new Date(m.lastPeriodStart);
    if (!Number.isNaN(start.getTime())) {
      const cl = Math.max(15, Math.min(60, Number(m.cycleLength) || 28));
      const lp = Math.max(7, Math.min(20, Number(m.lutealPhaseLength) || 14));
      const daysSince = Math.floor((now - start.getTime()) / 86400000);
      cycleDay = ((daysSince % cl) + cl) % cl;
      cycleLengthOut = cl;
      lutealPhaseLength = lp;
    }
  }

  const bloodwork = s.bloodwork && typeof s.bloodwork === 'object' ? s.bloodwork : undefined;
  const genetics = s.genetics && typeof s.genetics === 'object' ? s.genetics : undefined;

  return {
    sex: s.sex || undefined,
    ageYears: s.age != null ? Number(s.age) : undefined,
    weightKg: Number.isFinite(weightKg) ? weightKg : undefined,
    heightCm: Number.isFinite(heightCm) ? heightCm : undefined,
    cycleDay,
    cycleLength: cycleLengthOut,
    lutealPhaseLength,
    bloodwork,
    genetics,
    conditions: s.conditions && typeof s.conditions === 'object' ? s.conditions : {},
  };
}
