// Continuous endogenous-signal simulation across the dashboard window.
// Ingests two event streams — food (FoodLog) and exercise (ExerciseLog)
// — at their *real recorded timestamps*. Per-day chunks merge both,
// state stitched across days via initialHomeostasisState so cortisol /
// growth-hormone curves carry recovery dynamics forward. Snacks count;
// every entry's timestamp is what determines the simulation event time.

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
} from './endogenous.helpers.js';

// Solver step. 15 min keeps post-meal spikes visible without paying
// for 5-min resolution across multi-week windows.
const STEP_MIN = 15;

// One sim call per calendar day. Engine setup cost (createInitialState,
// vector layout, PK lookup tables) dominates per-call cost, so batching
// all of a day's meals into a single 24h sim is much cheaper than
// per-meal chunks. The engine duplicates items across days when the
// last grid sample crosses 1440, so we cap at exactly 1440 min — last
// sample is 1425 (with 15-min step), keeping numDays=1.
const DAY_MIN = 1440;

// Subject + physiology are now derived per-run from the message payload
// (so user profile changes flow through). Only the system-definition
// bundle is constant — it's independent of any subject.
let FOOD_DEF, EXERCISE_DEFS, SYSTEM, ALL_DEFS;
let initError = null;
try {
  const defs = buildInterventionLibrary(DEFAULT_SUBJECT, derivePhysiology(DEFAULT_SUBJECT));
  FOOD_DEF = defs.find((d) => d.key === 'food');
  if (!FOOD_DEF) throw new Error('food intervention not found in core library');
  // The four exercise classes — keys match ExerciseLog.engineClass values
  // exactly so a log row can map directly without a translation table.
  EXERCISE_DEFS = {
    exercise_cardio: defs.find((d) => d.key === 'exercise_cardio'),
    exercise_resistance: defs.find((d) => d.key === 'exercise_resistance'),
    exercise_hiit: defs.find((d) => d.key === 'exercise_hiit'),
    exercise_recovery: defs.find((d) => d.key === 'exercise_recovery'),
  };
  for (const [k, v] of Object.entries(EXERCISE_DEFS)) {
    if (!v) throw new Error(`${k} intervention not found in core library`);
  }
  // The full def list runOptimizedV2 needs to look up items by meta.key.
  ALL_DEFS = [FOOD_DEF, ...Object.values(EXERCISE_DEFS)];
  SYSTEM = {
    signals: SIGNALS_ALL,
    signalDefinitions: getAllUnifiedDefinitions(),
    auxDefinitions: AUXILIARY_DEFINITIONS,
    resolver: HUMAN_RESOLVER,
    receptorKeys: [...getAllReceptorKeys(), ...getAllTransporterKeys()],
  };
  console.debug('[endo-worker] initialized', {
    signalCount: SIGNALS_ALL.length,
    foodParamCount: FOOD_DEF?.params?.length,
  });
} catch (err) {
  initError = String(err?.stack || err?.message || err);
  console.error('[endo-worker] init failed', err);
}

function buildMealItem(meal, startMin, idx) {
  const params = {
    ...foodParamsFromNutrients(meal.nutrients),
    durationMin: 30,
  };
  // Pre-resolve the dynamic pharmacology factory — runOptimizedV2 reads
  // `resolvedPharmacology` first when present.
  const pharm = FOOD_DEF.pharmacology(params);
  return {
    id: `meal_${meal.logId || idx}`,
    startMin,
    durationMin: 30,
    meta: {
      key: 'food',
      intensity: 1,
      params,
    },
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
    meta: {
      key: ex.engineClass,
      intensity,
      params,
    },
    resolvedPharmacology: Array.isArray(pharm) ? pharm : [pharm],
  };
}

self.onmessage = (event) => {
  const t0 = performance.now();
  if (initError) {
    self.postMessage({ error: `worker init failed: ${initError}` });
    return;
  }
  const {
    meals = [],
    exercises = [],
    signals: signalKeys = [],
    subject: subjectPartial,
    conditions: conditionsPartial,
  } = event.data || {};
  const subject = buildSubject(subjectPartial);
  const physiology = derivePhysiology(subject);
  // Conditions feed into engine options, not subject. They modulate
  // receptor/transporter/enzyme activities and signal baselines via
  // the engine's profile-adjustments hook.
  const conditionState = buildConditionState(conditionsPartial);
  const conditionAdjustments = buildConditionAdjustments(conditionState);
  console.debug('[endo-worker] run', {
    mealCount: meals.length,
    exerciseCount: exercises.length,
    signals: signalKeys,
    subject: { sex: subject.sex, age: subject.age, weight: subject.weight, height: subject.height },
  });

  // Normalize both event streams to a common shape: { kind, timestampMs, ... }.
  // Each entry carries its own real timestamp — no synthesized meal-type
  // offsets. The engine just needs minute-of-day; we derive that per-day.
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
    if (!EXERCISE_DEFS[ex.engineClass]) continue; // unknown class; skip
    allEvents.push({ kind: 'exercise', timestampMs: ts, payload: ex });
  }
  allEvents.sort((a, b) => a.timestampMs - b.timestampMs);

  if (!allEvents.length) {
    self.postMessage({ timestamps: [], series: {}, computeTimeMs: 0, mealCount: 0, exerciseCount: 0 });
    return;
  }

  // Group by UTC calendar day. Each day becomes one 24h sim chunk
  // containing every food + exercise event with that day's date key,
  // each placed at its real minute-of-day.
  const eventsByDay = new Map();
  for (const ev of allEvents) {
    const k = utcDayKey(ev.timestampMs);
    if (!eventsByDay.has(k)) eventsByDay.set(k, []);
    eventsByDay.get(k).push(ev);
  }
  const days = [...eventsByDay.keys()].sort();

  const outTimestamps = [];
  const outSeries = Object.fromEntries(signalKeys.map((k) => [k, []]));
  const gridMins = rangeMinutes(STEP_MIN, DAY_MIN);

  let homeoState = undefined;

  for (let di = 0; di < days.length; di++) {
    const day = days[di];
    const dayStartMs = utcMidnight(day);
    const todays = eventsByDay.get(day) || [];
    const items = todays
      .map((ev, i) => {
        const startMin = minuteOfUtcDay(ev.timestampMs);
        if (ev.kind === 'meal') return buildMealItem(ev.payload, startMin, i);
        if (ev.kind === 'exercise') return buildExerciseItem(ev.payload, startMin, i);
        return null;
      })
      .filter(Boolean);

    let result;
    try {
      result = runOptimizedV2(
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
    } catch (err) {
      self.postMessage({ error: String(err?.message || err) });
      return;
    }

    // Skip the zero-th sample on every chunk after the first — its
    // value is identical to the previous chunk's final sample by
    // construction of state handoff.
    const startJ = di === 0 ? 0 : 1;
    for (let j = startJ; j < gridMins.length; j++) {
      outTimestamps.push(dayStartMs + gridMins[j] * 60_000);
      for (const k of signalKeys) {
        const buf = result.series[k] || result.auxiliarySeries[k];
        outSeries[k].push(buf ? buf[j] : 0);
      }
    }

    homeoState = result.finalHomeostasisState;
  }

  console.debug('[endo-worker] done', {
    samples: outTimestamps.length,
    ms: Math.round(performance.now() - t0),
    mealCount: meals.length,
    exerciseCount: exercises.length,
  });
  self.postMessage({
    timestamps: outTimestamps,
    series: outSeries,
    computeTimeMs: performance.now() - t0,
    mealCount: meals.length,
    exerciseCount: exercises.length,
  });
};
