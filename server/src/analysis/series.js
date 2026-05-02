// Domain-aware series fetching + daily alignment.
//
// Bridges the analysis math (primitives.js) and the user's stored data
// (FoodLog, WeightLog, DoseLog, etc.). Every supported "series" the
// dashboard can plot is mapped here to a single shape:
//
//   { values: Map<isoDate, number>, unit, label, kind }
//
// Callers compose two of these via `alignDaily(...)` to get matched x/y
// arrays that the math primitives can consume.

import FoodLog from '../models/FoodLog.js';
import WeightLog from '../models/WeightLog.js';
import DoseLog from '../models/DoseLog.js';
import Compound from '../models/Compound.js';
import Symptom from '../models/Symptom.js';
import SymptomLog from '../models/SymptomLog.js';
import Metric from '../models/Metric.js';
import MetricLog from '../models/MetricLog.js';
import UserSettings from '../models/UserSettings.js';
import { defaultUnitFor, fromCanonical, unitLabel } from '../../../shared/units.js';

// PK math copied from /routes/doses.js — should be deduped into a shared
// /lib/pk.js eventually, but kept inline here to avoid a refactor in the
// analysis-engine PR.
const ABSORPTION_HALF_LIFE_DAYS = { subq: 0.25, depot: 1 };
function activeAmount(dose, halfLifeDays, shape, daysSince) {
  if (daysSince < 0 || halfLifeDays <= 0) return 0;
  const ke = Math.LN2 / halfLifeDays;
  if (shape === 'bolus') return dose * Math.exp(-ke * daysSince);
  const absH = ABSORPTION_HALF_LIFE_DAYS[shape] ?? ABSORPTION_HALF_LIFE_DAYS.subq;
  const ka = Math.LN2 / absH;
  if (Math.abs(ka - ke) < 1e-6) {
    return dose * ke * daysSince * Math.exp(-ke * daysSince);
  }
  return dose * (ka / (ka - ke)) * (Math.exp(-ke * daysSince) - Math.exp(-ka * daysSince));
}

// Format a Date (treated as UTC) as YYYY-MM-DD.
function isoDay(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

// Inclusive UTC date range for $gte/$lte Mongo queries.
function dateRange(fromDate, toDate) {
  return {
    $gte: new Date(`${fromDate}T00:00:00.000Z`),
    $lte: new Date(`${toDate}T23:59:59.999Z`),
  };
}

// Iterate days in [from, to] inclusive, yielding YYYY-MM-DD strings.
export function eachDay(fromDate, toDate) {
  const out = [];
  const [fy, fm, fd] = fromDate.split('-').map(Number);
  const [ty, tm, td] = toDate.split('-').map(Number);
  let cur = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  while (cur <= end) {
    out.push(isoDay(cur));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

// ---- Per-series fetchers -------------------------------------------------

async function fetchWeightDaily(uid, fromDate, toDate) {
  const entries = await WeightLog.find({
    userId: uid, date: dateRange(fromDate, toDate),
  }).sort({ date: 1 }).lean();
  // Latest entry per day wins (in case of multiple weigh-ins same day).
  const values = new Map();
  for (const e of entries) values.set(isoDay(e.date), e.weightLbs);
  return { values, unit: 'lbs', label: 'Weight', kind: 'measured' };
}

// Fetch a user-defined Metric series. Values are stored canonically in the
// metric's dimension; the chart unit reflects whatever the user picked
// (per-metric `displayUnit`, falling back to their unitSystem default).
async function fetchMetricDaily(uid, metricId, fromDate, toDate) {
  const metric = await Metric.findOne({ _id: metricId, userId: uid }).lean();
  if (!metric) return { values: new Map(), unit: '', label: '', kind: 'unknown' };
  const settings = await UserSettings.findOne({ userId: uid }).select('unitSystem').lean();
  const system = settings?.unitSystem || 'imperial';
  const unit = metric.displayUnit || defaultUnitFor(metric.dimension, system);
  const entries = await MetricLog.find({
    userId: uid, metricId, date: dateRange(fromDate, toDate),
  }).sort({ date: 1 }).lean();
  const values = new Map();
  for (const e of entries) values.set(isoDay(e.date), fromCanonical(e.value, unit));
  return { values, unit: unitLabel(unit), label: metric.name, kind: 'measured' };
}

const NUTRITION_SERIES = new Set(['calories', 'protein', 'fat', 'carbs']);

async function fetchNutritionDaily(uid, fromDate, toDate) {
  // Fetches all macros at once so a single Mongo round-trip serves
  // calories/protein/fat/carbs/score requests via the cache below.
  const entries = await FoodLog.find({
    userId: uid, date: dateRange(fromDate, toDate),
  }).populate('foodItemId').lean();
  const byDay = new Map();
  for (const e of entries) {
    const day = isoDay(e.date);
    let acc = byDay.get(day);
    if (!acc) {
      acc = { calories: 0, protein: 0, fat: 0, carbs: 0 };
      byDay.set(day, acc);
    }
    const f = e.foodItemId;
    if (!f) continue;
    const ps = f.perServing || {};
    const s = e.servingCount || 0;
    acc.calories += (ps.calories || 0) * s;
    acc.protein += (ps.protein || 0) * s;
    acc.fat += (ps.fat || 0) * s;
    acc.carbs += (ps.carbs || 0) * s;
  }
  return byDay;
}

async function fetchCompoundDaily(uid, compoundId, fromDate, toDate) {
  const compound = await Compound.findOne({ _id: compoundId, userId: uid }).lean();
  if (!compound) return { values: new Map(), unit: '', label: 'Compound', kind: 'modeled' };
  // PK at noon UTC each day — anchor at the same time-of-day so day-to-day
  // values aren't biased by sample-time drift.
  const allDoses = await DoseLog.find({ userId: uid, compoundId }).sort({ date: 1 }).lean();
  const shape = compound.kineticsShape || 'subq';
  const values = new Map();
  for (const day of eachDay(fromDate, toDate)) {
    const sampleAt = new Date(`${day}T12:00:00.000Z`);
    let active = 0;
    for (const dose of allDoses) {
      const daysSince = (sampleAt - dose.date) / 86400000;
      if (daysSince < 0) continue;
      active += activeAmount(dose.value, compound.halfLifeDays, shape, daysSince);
    }
    // Don't emit zeros for days entirely before the first dose — those are
    // genuinely "no data" rather than "zero active level we measured".
    if (active > 0 || allDoses.some((d) => d.date <= sampleAt)) {
      values.set(day, Number(active.toFixed(4)));
    }
  }
  return {
    values,
    unit: compound.doseUnit || 'mg',
    label: compound.name || 'Compound',
    kind: 'modeled',
  };
}

async function fetchSymptomDaily(uid, symptomId, fromDate, toDate) {
  const symptom = await Symptom.findOne({ _id: symptomId, userId: uid }).lean();
  const entries = await SymptomLog.find({
    userId: uid, symptomId, date: dateRange(fromDate, toDate),
  }).sort({ date: 1 }).lean();
  const values = new Map();
  // Multiple logs per day → keep the max severity. Accurate to "worst part
  // of the day" which is what the user typically remembers.
  for (const e of entries) {
    const day = isoDay(e.date);
    const prev = values.get(day);
    values.set(day, prev == null ? e.severity : Math.max(prev, e.severity));
  }
  return {
    values,
    unit: '/10',
    label: symptom?.name || 'Symptom',
    kind: 'measured',
  };
}

// ---- Public dispatch ----------------------------------------------------

// Series ID conventions match the dashboard (DashboardPage.vue CORE_SERIES):
//   - 'weight'
//   - 'calories', 'protein', 'fat', 'carbs', 'score'
//   - 'dosage:<compoundId>'
//   - 'symptom:<symptomId>'
//   - 'metric:<metricId>'   (waist, arm, body fat, custom — anything in /api/metrics)
//
// `cache` lets callers batch multiple nutrition-derived series (calories +
// protein + score) without re-querying FoodLog. Pass an empty object for a
// single fetch.
export async function fetchSeriesDaily(uid, seriesId, fromDate, toDate, cache = {}) {
  if (seriesId === 'weight') return fetchWeightDaily(uid, fromDate, toDate);
  if (seriesId.startsWith('metric:')) {
    return fetchMetricDaily(uid, seriesId.slice('metric:'.length), fromDate, toDate);
  }

  if (NUTRITION_SERIES.has(seriesId) || seriesId === 'score') {
    if (!cache.nutrition) cache.nutrition = await fetchNutritionDaily(uid, fromDate, toDate);
    if (seriesId === 'score') {
      if (!cache.targets) {
        const settings = await UserSettings.findOne({ userId: uid }).lean();
        cache.targets = settings?.targets || null;
      }
      const targets = cache.targets;
      const values = new Map();
      if (targets) {
        for (const [day, m] of cache.nutrition) {
          values.set(day, computeNutritionScore(m, targets));
        }
      }
      return { values, unit: '/100', label: 'Score', kind: 'derived' };
    }
    const macroKey = seriesId; // calories | protein | fat | carbs
    const values = new Map();
    for (const [day, m] of cache.nutrition) values.set(day, m[macroKey]);
    const labelMap = { calories: 'Calories', protein: 'Protein', fat: 'Fat', carbs: 'Carbs' };
    const unitMap = { calories: 'kcal', protein: 'g', fat: 'g', carbs: 'g' };
    return { values, unit: unitMap[macroKey], label: labelMap[macroKey], kind: 'measured' };
  }

  if (seriesId.startsWith('dosage:')) {
    return fetchCompoundDaily(uid, seriesId.slice('dosage:'.length), fromDate, toDate);
  }
  if (seriesId.startsWith('symptom:')) {
    return fetchSymptomDaily(uid, seriesId.slice('symptom:'.length), fromDate, toDate);
  }
  return { values: new Map(), unit: '', label: seriesId, kind: 'unknown' };
}

// Mirror of client-side computeNutritionScore — kept inline so the engine
// has no client dep. If the scoring formula evolves on the client, we can
// reuse it here either by extracting to /shared or by re-implementing.
function computeNutritionScore({ calories, protein, fat, carbs }, targets) {
  if (!targets) return null;
  const cap = (v) => Math.max(0, Math.min(100, v));
  const closeness = (actual, target) => {
    if (!target) return null;
    const diff = Math.abs(actual - target) / target;
    return cap(100 * (1 - diff));
  };
  const parts = [
    closeness(calories, targets.calories),
    closeness(protein, targets.proteinGrams),
    closeness(fat, targets.fatGrams),
    closeness(carbs, targets.carbsGrams),
  ].filter((v) => v != null);
  if (!parts.length) return null;
  const avg = parts.reduce((s, v) => s + v, 0) / parts.length;
  return Math.round(avg);
}

// ---- Alignment ----------------------------------------------------------

// Take two series (each {values: Map<isoDate, number>}), find dates where
// both have a non-null value, and return parallel arrays plus the dates.
// Optionally apply a lag — in days, > 0 means "B lags A" (B[i] paired with
// A[i-lag]). Caller can also pass `dayIndex: true` to receive a numeric x
// axis (days from common-window start) for trend / regression / change-point.
export function alignDaily(seriesA, seriesB, { lag = 0, dayIndex = false } = {}) {
  const days = [];
  const aValues = [];
  const bValues = [];
  // Iterate dates in order — Maps preserve insertion order, which is iso
  // date if both fetchers emitted in chronological order. Otherwise we
  // re-sort the union of keys.
  const allDays = new Set([...seriesA.values.keys(), ...seriesB.values.keys()]);
  const sorted = [...allDays].sort();
  for (const day of sorted) {
    const a = seriesA.values.get(day);
    if (a == null || !Number.isFinite(a)) continue;
    // For a positive lag, B's value at day+lag pairs with A's value at day.
    const bDay = lag === 0 ? day : addDays(day, lag);
    const b = seriesB.values.get(bDay);
    if (b == null || !Number.isFinite(b)) continue;
    days.push(day);
    aValues.push(a);
    bValues.push(b);
  }
  const result = { days, aValues, bValues, n: days.length, lag };
  if (dayIndex && days.length) {
    const t0 = new Date(`${days[0]}T00:00:00.000Z`).getTime();
    result.xs = days.map((d) =>
      Math.round((new Date(`${d}T00:00:00.000Z`).getTime() - t0) / 86400000),
    );
  }
  return result;
}

function addDays(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return isoDay(dt);
}

// ---- Default candidate set -----------------------------------------------

// Returns every series id this user could meaningfully chart — used by the
// insights aggregator when it scans for top correlations.
export async function listAvailableSeriesIds(uid) {
  const ids = ['weight', 'calories', 'protein', 'fat', 'carbs', 'score'];
  const [compounds, symptoms, metrics] = await Promise.all([
    Compound.find({ userId: uid, enabled: true }).select('_id name').lean(),
    Symptom.find({ userId: uid }).select('_id name').lean(),
    Metric.find({ userId: uid, enabled: true }).select('_id name').lean(),
  ]);
  for (const c of compounds) ids.push(`dosage:${c._id}`);
  for (const s of symptoms) ids.push(`symptom:${s._id}`);
  for (const m of metrics) ids.push(`metric:${m._id}`);
  return ids;
}
