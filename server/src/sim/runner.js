// Server-side endogenous-signal sim runner. Mirrors
// client/src/workers/endogenous.worker.js — same per-day chunking, same
// state handoff via finalHomeostasisState, same output shape. The two
// implementations must produce identical series for identical inputs;
// any divergence is a regression to investigate.
//
// Entry points:
//   runEndoSim({ meals, exercises, subjectPartial, signals, fromMs, toMs })
//     → low-level: caller supplies inputs, returns { timestamps, series, finalState }
//   runForUser({ userId, signals, fromMs, toMs })
//     → high-level: pulls all inputs from DB, runs sim, returns same shape
//
// Caching (latestSimCheckpoint) is layered in checkpoint.js / route — the
// runner itself is stateless. It does accept `initialState` so the
// caching layer can resume from a stored end-state.

import {
  runOptimizedV2,
  rangeMinutes,
  buildInterventionLibrary,
  buildConditionAdjustments,
  derivePhysiology,
  DEFAULT_SUBJECT,
  SIGNALS_ALL,
  AUXILIARY_DEFINITIONS,
  HUMAN_RESOLVER,
  getAllUnifiedDefinitions,
  getAllReceptorKeys,
  getAllTransporterKeys,
} from '@kyneticbio/core';
import {
  buildSubject,
  buildConditionState,
  foodParamsFromNutrients,
  utcDayKey,
  utcMidnight,
  minuteOfUtcDay,
} from './helpers.js';
import { loadMeals, loadExercises, loadDoses, buildSubjectFromUser } from './inputs.js';
import { runEndoSimInWorker } from './simWorkerPool.js';
import { childLogger } from '../lib/logger.js';

const log = childLogger('sim-runner');

const STEP_MIN = 15;
const DAY_MIN = 1440;

// One-time engine setup. The intervention library + system bundle are
// independent of any subject so they're built once at module load.
// Throws on bad import surface — surfaces fast in `npm start`.
const _initDefs = buildInterventionLibrary(DEFAULT_SUBJECT, derivePhysiology(DEFAULT_SUBJECT));
const FOOD_DEF = _initDefs.find((d) => d.key === 'food');
if (!FOOD_DEF) throw new Error('sim-runner: food intervention not found in core library');
const EXERCISE_DEFS = {
  exercise_cardio: _initDefs.find((d) => d.key === 'exercise_cardio'),
  exercise_resistance: _initDefs.find((d) => d.key === 'exercise_resistance'),
  exercise_hiit: _initDefs.find((d) => d.key === 'exercise_hiit'),
  exercise_recovery: _initDefs.find((d) => d.key === 'exercise_recovery'),
};
for (const [k, v] of Object.entries(EXERCISE_DEFS)) {
  if (!v) throw new Error(`sim-runner: ${k} intervention not found in core library`);
}
// Map every intervention from the library by its key. Lets us look up
// a canonical compound's def in O(1) when building dose timeline items
// (dose.coreInterventionKey → matching def).
const DEFS_BY_KEY = new Map(_initDefs.map((d) => [d.key, d]));

const ALL_DEFS = [FOOD_DEF, ...Object.values(EXERCISE_DEFS), ..._initDefs.filter(
  (d) => !!d?.key && d.key !== 'food' && !d.key.startsWith('exercise_'),
)];
const SYSTEM = {
  signals: SIGNALS_ALL,
  signalDefinitions: getAllUnifiedDefinitions(),
  auxDefinitions: AUXILIARY_DEFINITIONS,
  resolver: HUMAN_RESOLVER,
  receptorKeys: [...getAllReceptorKeys(), ...getAllTransporterKeys()],
};

function buildMealItem(meal, startMin, idx) {
  const params = {
    ...foodParamsFromNutrients(meal.nutrients),
    durationMin: 30,
  };
  const pharm = FOOD_DEF.pharmacology(params);
  return {
    id: `meal_${meal.logId || idx}`,
    startMin,
    durationMin: 30,
    meta: { key: 'food', intensity: 1, params },
    resolvedPharmacology: Array.isArray(pharm) ? pharm : [pharm],
  };
}

function buildExerciseItem(ex, startMin, idx) {
  const def = EXERCISE_DEFS[ex.engineClass];
  if (!def) return null;
  const intensity = Math.max(0.5, Math.min(1.5, Number(ex.intensity) || 1.0));
  const durationMin = Math.max(1, Math.round(Number(ex.durationMin) || 30));
  const params = { intensity, durationMin };
  const pharm = def.pharmacology(params);
  return {
    id: `ex_${ex.logId || idx}`,
    startMin,
    durationMin,
    meta: { key: ex.engineClass, intensity, params },
    resolvedPharmacology: Array.isArray(pharm) ? pharm : [pharm],
  };
}

// Canonical-compound dose → TimelineItem. The engine's intervention
// library already includes every catalog peptide (Tirzepatide,
// Semaglutide, etc.); we just look up the def by key and ask it for
// pharmacology under the user's dose. Returns null for unknown keys
// (intervention removed from the library) so the day-loop filters
// them out cleanly.
function buildDoseItem(dose, startMin, idx) {
  const def = DEFS_BY_KEY.get(dose.coreInterventionKey);
  if (!def) return null;
  const dosageValue = Number(dose.value);
  if (!Number.isFinite(dosageValue) || dosageValue <= 0) return null;
  // Most peptide defs accept `{ massMg }`; the underlying factory in
  // core knows how to convert dose units to its expected param. We
  // pass both `value` and `massMg` so legacy + current factories both
  // resolve.
  const params = { value: dosageValue, massMg: dosageValue };
  const pharm = def.pharmacology(params);
  return {
    id: `dose_${dose.logId || idx}`,
    startMin,
    durationMin: 0,
    meta: { key: dose.coreInterventionKey, params },
    resolvedPharmacology: Array.isArray(pharm) ? pharm : [pharm],
  };
}

// Low-level runner. Caller supplies all inputs. Group events by UTC
// calendar day, run one 24h sim per day, stitch state across days via
// initialHomeostasisState.
//
// `initialState` (optional) seeds the first day's homeostasis. When
// supplied, it should be the `finalHomeostasisState` from a prior run
// — same caching semantics that the response cache + checkpoint use.
//
// `viewFromMs` / `viewToMs` (optional) — when supplied, the runner
// iterates EVERY calendar day in [viewFromMs, viewToMs) so days without
// logged events still emit baseline-state samples (cortisol diurnal,
// melatonin, etc.). Without this flag, output only covers days with
// events — fine for caching state, useless for charting.
//
// Returns { timestamps[], series{}, finalState, computeMs, mealCount, exerciseCount }.
export function runEndoSim({
  meals = [],
  exercises = [],
  doses = [],
  subjectPartial = {},
  conditionsPartial = {},
  signals = [],
  initialState = undefined,
  viewFromMs = null,
  viewToMs = null,
} = {}) {
  const t0 = Date.now();
  const subject = buildSubject(subjectPartial);
  const physiology = derivePhysiology(subject);
  const conditionState = buildConditionState(conditionsPartial);
  const conditionAdjustments = buildConditionAdjustments(conditionState);

  const allEvents = [];
  for (const m of meals) {
    if (!m.timestamp) continue;
    const ts = new Date(m.timestamp).getTime();
    if (!Number.isFinite(ts)) continue;
    allEvents.push({ kind: 'meal', timestampMs: ts, payload: m });
  }
  for (const ex of exercises) {
    if (!ex.timestamp) continue;
    const ts = new Date(ex.timestamp).getTime();
    if (!Number.isFinite(ts)) continue;
    if (!EXERCISE_DEFS[ex.engineClass]) continue;
    allEvents.push({ kind: 'exercise', timestampMs: ts, payload: ex });
  }
  for (const d of doses) {
    if (!d.timestamp || !d.coreInterventionKey) continue;
    const ts = new Date(d.timestamp).getTime();
    if (!Number.isFinite(ts)) continue;
    if (!DEFS_BY_KEY.has(d.coreInterventionKey)) continue;
    allEvents.push({ kind: 'dose', timestampMs: ts, payload: d });
  }
  allEvents.sort((a, b) => a.timestampMs - b.timestampMs);

  const eventsByDay = new Map();
  for (const ev of allEvents) {
    const k = utcDayKey(ev.timestampMs);
    if (!eventsByDay.has(k)) eventsByDay.set(k, []);
    eventsByDay.get(k).push(ev);
  }

  // Build the iteration day list. Three contributions:
  //   (a) every event day (in or out of the view window) so all
  //       logged events drive their day's dynamics
  //   (b) every day in [viewFromMs, viewToMs) — no-event days inside
  //       the view still emit baseline samples
  //   (c) BURN_IN_DAYS days before viewFromMs — propagate state so the
  //       first visible day isn't a cold-start artifact (engine starts
  //       from initialState; rhythmic dynamics need a few days to
  //       stabilize). Route-level trimming strips burn-in samples
  //       before caching, so the cache entry only ever has visible
  //       data.
  // No view supplied → fall back to the historical "event days only"
  // behavior, used by callers that just want the cached end-state.
  const BURN_IN_DAYS = 7;
  const dayKeys = new Set(eventsByDay.keys());
  if (viewFromMs != null && viewToMs != null && viewToMs > viewFromMs) {
    const viewStartDayMs = utcMidnight(utcDayKey(viewFromMs));
    const burnInStartMs = viewStartDayMs - BURN_IN_DAYS * DAY_MIN * 60_000;
    // viewToMs is exclusive, so last full day = viewToMs - 1ms.
    const endDayMs = utcMidnight(utcDayKey(viewToMs - 1));
    for (let cursor = burnInStartMs; cursor <= endDayMs; cursor += DAY_MIN * 60_000) {
      dayKeys.add(utcDayKey(cursor));
    }
  }
  const days = [...dayKeys].sort();

  if (!days.length) {
    return {
      timestamps: [],
      series: Object.fromEntries(signals.map((k) => [k, []])),
      finalState: initialState,
      finalDayMs: null,
      computeMs: 0,
      mealCount: meals.length,
      exerciseCount: exercises.length,
      doseCount: doses.length,
    };
  }

  const outTimestamps = [];
  const outSeries = Object.fromEntries(signals.map((k) => [k, []]));
  const gridMins = rangeMinutes(STEP_MIN, DAY_MIN);

  let homeoState = initialState;

  for (let di = 0; di < days.length; di++) {
    const day = days[di];
    const dayStartMs = utcMidnight(day);
    const todays = eventsByDay.get(day) || [];
    const items = todays
      .map((ev, i) => {
        const startMin = minuteOfUtcDay(ev.timestampMs);
        if (ev.kind === 'meal') return buildMealItem(ev.payload, startMin, i);
        if (ev.kind === 'exercise') return buildExerciseItem(ev.payload, startMin, i);
        if (ev.kind === 'dose') return buildDoseItem(ev.payload, startMin, i);
        return null;
      })
      .filter(Boolean);

    const result = runOptimizedV2(
      {
        gridMins,
        items,
        defs: ALL_DEFS,
        options: {
          subject,
          physiology,
          initialHomeostasisState: homeoState,
          conditionBaselines: conditionAdjustments.baselines,
          conditionCouplings: conditionAdjustments.couplings,
          receptorDensities: conditionAdjustments.receptorDensities,
          receptorSensitivities: conditionAdjustments.receptorSensitivities,
          transporterActivities: conditionAdjustments.transporterActivities,
          enzymeActivities: conditionAdjustments.enzymeActivities,
        },
      },
      SYSTEM,
    );

    // Emit every grid point, but dedupe by timestamp. When the engine's
    // grid INCLUDES the day-end endpoint (minute 1440 == next day's
    // minute 0), the last sample of day N equals the first sample of
    // day N+1; we skip the duplicate. When the grid is [0..1425] step
    // 15 (no overlap), no sample collides — emitting j=0 of every day
    // gives a continuous 15-min cadence across UTC midnight, which is
    // what the user actually sees on the chart.
    for (let j = 0; j < gridMins.length; j++) {
      const ts = dayStartMs + gridMins[j] * 60_000;
      if (outTimestamps.length > 0 && outTimestamps[outTimestamps.length - 1] === ts) {
        continue;
      }
      outTimestamps.push(ts);
      for (const k of signals) {
        const buf = result.series[k] || result.auxiliarySeries[k];
        outSeries[k].push(buf ? buf[j] : 0);
      }
    }
    homeoState = result.finalHomeostasisState;
  }

  // Last day processed = checkpoint anchor. Even when called for a window
  // whose tail has no events, this reflects the last day we actually
  // advanced state through. Caller (route) bumps the checkpoint forward
  // to MAX(this, requestedToDay) so future calls see a current cache.
  const finalDayMs = days.length ? utcMidnight(days[days.length - 1]) : null;

  return {
    timestamps: outTimestamps,
    series: outSeries,
    finalState: homeoState,
    finalDayMs,
    computeMs: Date.now() - t0,
    mealCount: meals.length,
    exerciseCount: exercises.length,
    doseCount: doses.length,
  };
}

// High-level runner. Pulls everything from DB for the given user/window.
//
// `fromMs` / `toMs` define the LOAD window (which logs to fetch). On a
// cold path the route passes fromMs=0 to reconstruct state from the
// user's full event history.
//
// `viewFromMs` / `viewToMs` define the OUTPUT window — every calendar
// day in this range emits samples, regardless of whether the user
// logged anything. Defaults to fromMs/toMs when not supplied so
// non-charting callers still get reasonable output.
export async function runForUser({
  userId,
  signals,
  fromMs,
  toMs,
  viewFromMs = null,
  viewToMs = null,
  initialState,
}) {
  const tLoad = Date.now();
  const [meals, exercises, doses, subjectPartial] = await Promise.all([
    loadMeals(userId, fromMs, toMs),
    loadExercises(userId, fromMs, toMs),
    loadDoses(userId, fromMs, toMs),
    buildSubjectFromUser(userId),
  ]);
  const conditionsPartial = subjectPartial.conditions || {};
  const loadMs = Date.now() - tLoad;

  // Dispatch the engine work to a worker thread so the main Node loop
  // stays responsive during compute. Falls back to inline execution
  // if pool dispatch throws (e.g., worker module fails to spawn) —
  // better to block one request than to fail it entirely.
  let result;
  try {
    result = await runEndoSimInWorker({
      meals,
      exercises,
      doses,
      subjectPartial,
      conditionsPartial,
      signals,
      initialState,
      viewFromMs: viewFromMs != null ? viewFromMs : fromMs,
      viewToMs: viewToMs != null ? viewToMs : toMs,
    });
  } catch (err) {
    log.warn({ err: String(err?.message || err) }, 'sim worker dispatch failed; running inline');
    result = runEndoSim({
      meals,
      exercises,
      doses,
      subjectPartial,
      conditionsPartial,
      signals,
      initialState,
      viewFromMs: viewFromMs != null ? viewFromMs : fromMs,
      viewToMs: viewToMs != null ? viewToMs : toMs,
    });
  }

  log.debug(
    {
      userId: String(userId),
      meals: meals.length,
      exercises: exercises.length,
      signals: signals.length,
      samples: result.timestamps.length,
      loadMs,
      computeMs: result.computeMs,
    },
    'sim: run complete',
  );

  return { ...result, loadMs };
}
