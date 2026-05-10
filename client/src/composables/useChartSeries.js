// Shared series catalog + data resolver for SignalChart consumers
// (dashboard + log pages). The composable owns the mapping from "what
// the user can pick on the chart" to "where the data lives in the
// stores" so neither page redeclares it.
//
// Returns:
//   - allSeries: ComputedRef<SeriesDef[]>
//   - seriesByCategory: ComputedRef<Map<string, SeriesDef[]>>
//     (categories include trend variants of each value series)
//   - getDataPoints(def): (def: SeriesDef) => Array<{ x: Date, y: number }>
//   - endoSim: object — exposed so the page can show sim status / kick
//     off runs when endogenous signals are active
//
// Range filtering is the consumer's job (SignalChart already clamps by
// its `fixedRange`/range buttons).

import { computed, ref, watch } from 'vue';
import { useWeightStore } from '../stores/weight.js';
import { useFoodLogStore } from '../stores/foodlog.js';
import { useSettingsStore } from '../stores/settings.js';
import { useSymptomsStore } from '../stores/symptoms.js';
import { useMetricsStore } from '../stores/metrics.js';
import { useCompoundsStore } from '../stores/compounds.js';
import { useDosesStore } from '../stores/doses.js';
import { useExerciseLogStore } from '../stores/exerciselog.js';
import { useEndogenousSim } from './useEndogenousSim.js';
import { defaultUnitFor, unitLabel, fromCanonical } from '../../../shared/units.js';
import { computeNutritionScore } from '../../../shared/logging/nutritionScore.js';
import { getAllUnifiedDefinitions } from '@kyneticbio/core';

// Theme-aware css var read. Re-evaluates whenever `tick.value` is
// touched (e.g. from a MutationObserver on documentElement).
function readCssVar(name, fallback = '') {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const SYMPTOM_COLOR_VARS = [
  '--color-symptom-1', '--color-symptom-2', '--color-symptom-3', '--color-symptom-4',
  '--color-symptom-5', '--color-symptom-6', '--color-symptom-7', '--color-symptom-8',
];

// Endogenous signals worth surfacing in the chart picker. Display
// metadata (label/unit) comes from core's signal definitions; the
// per-key colors here are just UI palette choices.
const ENDO_SIGNALS = [
  { key: 'glucose',      color: '#ef4444' },
  { key: 'insulin',      color: '#06b6d4' },
  { key: 'glp1',         color: '#10b981' },
  { key: 'ghrelin',      color: '#f59e0b' },
  { key: 'leptin',       color: '#8b5cf6' },
  { key: 'cortisol',     color: '#ec4899' },
  { key: 'estrogen',     color: '#d946ef', cyclical: true },
  { key: 'progesterone', color: '#a855f7', cyclical: true },
  { key: 'lh',           color: '#0ea5e9', cyclical: true },
  { key: 'fsh',          color: '#14b8a6', cyclical: true },
  { key: 'ketone',        color: '#16a34a', fasting: true },
  { key: 'glucagon',      color: '#f97316', fasting: true },
  { key: 'growthHormone', color: '#22d3ee', fasting: true },
  { key: 'ampk',          color: '#84cc16', fasting: true },
  { key: 'mtor',          color: '#e11d48', fasting: true },
];

const DEFAULT_DOSE_COLOR = '#f59e0b';

export function useChartSeries(options = {}) {
  // Pages opt into endogenous-signal simulation. When false the
  // composable still publishes the def list (so users can see entries
  // are missing) but skips the worker. Default true preserves existing
  // dashboard behavior.
  const { runEndoSim = true } = options;

  const weightStore = useWeightStore();
  const foodLogStore = useFoodLogStore();
  const settingsStore = useSettingsStore();
  const symptomsStore = useSymptomsStore();
  const metricsStore = useMetricsStore();
  const compoundsStore = useCompoundsStore();
  const dosesStore = useDosesStore();
  const exerciseLogStore = useExerciseLogStore();
  const endoSim = useEndogenousSim();

  const themeTick = ref(0);
  const cssVar = (n, f) => {
    themeTick.value;
    return readCssVar(n, f);
  };

  const SIGNAL_DEFS = getAllUnifiedDefinitions();

  function parseLocalDate(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date(value);
  }

  // ---------- Series defs ----------
  const CORE_SERIES = computed(() => {
    themeTick.value;
    // chartKind: 'bar' for inputs that arrive as discrete daily totals
    // (nutrition macros + score, exercise burn). Bars per day reads
    // more honestly than a smooth line through aggregates. Continuous-
    // state series (weight, dose curves, simulated signals) stay as
    // lines via the default chartKind.
    const out = [
      { id: 'weight', label: 'Weight', unit: 'lbs', color: cssVar('--color-weight', '#4f46e5'), cat: 'Body', axis: 'y', fill: true },
      { id: 'calories', label: 'Calories', unit: 'kcal', color: cssVar('--color-cal', '#3b82f6'), cat: 'Nutrition', axis: 'yCal', chartKind: 'bar' },
      { id: 'protein', label: 'Protein', unit: 'g', color: cssVar('--color-protein', '#16a34a'), cat: 'Nutrition', axis: 'yGrams', chartKind: 'bar' },
      { id: 'fat', label: 'Fat', unit: 'g', color: cssVar('--color-fat', '#f59e0b'), cat: 'Nutrition', axis: 'yGrams', chartKind: 'bar' },
      { id: 'carbs', label: 'Carbs', unit: 'g', color: cssVar('--color-carbs', '#ef4444'), cat: 'Nutrition', axis: 'yGrams', chartKind: 'bar' },
      { id: 'score', label: 'Score', unit: '/100', color: cssVar('--color-score', '#8b5cf6'), cat: 'Nutrition', axis: 'yScore', chartKind: 'bar' },
    ];
    const ex = settingsStore.settings?.exercise;
    if (ex?.enabled && ex?.showOnDashboard) {
      out.push({ id: 'caloriesBurned', label: 'Calories burned', unit: 'kcal', color: cssVar('--color-burn', '#dc2626'), cat: 'Exercise', axis: 'yCal', chartKind: 'bar' });
      out.push({ id: 'caloriesNet', label: 'Net calories', unit: 'kcal', color: cssVar('--color-net', '#0ea5e9'), cat: 'Exercise', axis: 'yCal', fill: false });
      out.push({ id: 'exerciseMinutes', label: 'Exercise minutes', unit: 'min', color: cssVar('--color-burn-time', '#f97316'), cat: 'Exercise', axis: 'yMinutes', chartKind: 'bar' });
    }
    return out;
  });

  const compoundSeries = computed(() => {
    themeTick.value;
    return compoundsStore.enabled.map((c) => {
      const isCanonical = c.source === 'core';
      return {
        id: `dosage:${isCanonical ? `core:${c.coreInterventionKey}` : c._id}`,
        label: c.name,
        unit: c.doseUnit,
        color: c.color || DEFAULT_DOSE_COLOR,
        cat: 'Compounds',
        axis: 'yDose',
        fill: true,
        dash: [4, 3],
        compoundId: isCanonical ? null : c._id,
        coreInterventionKey: isCanonical ? c.coreInterventionKey : null,
        compoundRefKey: isCanonical ? `core:${c.coreInterventionKey}` : c._id,
        doseUnit: c.doseUnit,
      };
    });
  });

  const symptomSeries = computed(() => {
    themeTick.value;
    return symptomsStore.symptoms.map((s, i) => ({
      id: `symptom:${s._id}`,
      label: s.name,
      unit: '/10',
      color: cssVar(SYMPTOM_COLOR_VARS[i % SYMPTOM_COLOR_VARS.length], '#8b5cf6'),
      cat: 'Symptoms',
      axis: 'ySymptom',
      fill: false,
      symptomId: s._id,
    }));
  });

  const metricSeries = computed(() => {
    themeTick.value;
    const system = settingsStore.settings?.unitSystem || 'imperial';
    return metricsStore.metrics
      .filter((m) => m.enabled)
      .sort((a, b) => a.order - b.order)
      .map((m, i) => {
        const unit = m.displayUnit || defaultUnitFor(m.dimension, system);
        return {
          id: `metric:${m._id}`,
          label: m.name,
          unit: unitLabel(unit) || m.dimension,
          color: cssVar(SYMPTOM_COLOR_VARS[i % SYMPTOM_COLOR_VARS.length], '#0ea5e9'),
          cat: 'Metrics',
          axis: 'yMetric',
          fill: false,
          metricId: m._id,
          dimension: m.dimension,
          displayUnit: unit,
        };
      });
  });

  const endoSeries = computed(() => {
    themeTick.value;
    const m = settingsStore.settings?.menstruation;
    const f = settingsStore.settings?.fasting;
    const showCyclical = Boolean(m?.enabled && m?.showOnDashboard);
    const showFasting = Boolean(f?.enabled && f?.showOnDashboard);
    return ENDO_SIGNALS
      .filter((s) => (!s.cyclical || showCyclical) && (!s.fasting || showFasting))
      .map((s) => {
        const def = SIGNAL_DEFS[s.key];
        return {
          id: `endo:${s.key}`,
          label: def?.label || s.key,
          unit: def?.unit || '',
          color: s.color,
          cat: 'Signal Simulations',
          axis: `yEndo_${s.key}`,
          fill: false,
          endoSignal: s.key,
        };
      });
  });

  // Trend companion for each value series — same color/category/axis,
  // dashed best-fit line. Generated by the composable so callers don't
  // have to maintain a parallel list.
  function makeTrendDef(source) {
    return {
      id: `${source.id}-trend`,
      label: `${source.label} trend`,
      color: source.color,
      cat: source.cat,
      axis: source.axis,
      unit: source.unit,
      isTrend: true,
      sourceSeriesId: source.id,
    };
  }

  const allSeries = computed(() => {
    const out = [];
    for (const s of [
      ...CORE_SERIES.value,
      ...metricSeries.value,
      ...compoundSeries.value,
      ...symptomSeries.value,
      ...endoSeries.value,
    ]) {
      out.push(s);
      out.push(makeTrendDef(s));
    }
    return out;
  });

  const seriesByCategory = computed(() => {
    const groups = new Map();
    for (const s of allSeries.value) {
      if (!groups.has(s.cat)) groups.set(s.cat, []);
      groups.get(s.cat).push(s);
    }
    return groups;
  });

  // ---------- Endogenous-sim wiring ----------
  // Calls /api/sim/range. The server reads the user's subject /
  // conditions / bloodwork / genetics from UserSettings + their meal
  // and exercise logs, runs the engine, and serves a checkpoint-cached
  // response. The client just hands over the window + signal list.
  const ENDO_MAX_DAYS = 60;

  function kickEndoSim({ from, to, signals }) {
    if (!runEndoSim) return;
    if (!signals?.length) return;
    endoSim.run({ from, to, signals });
  }

  // ---------- Data resolver ----------
  // Single-day windows (log page) use per-meal entries from
  // foodlogStore.entries so each bar lands at the actual meal time;
  // multi-day windows (dashboard) use daily totals so the bars
  // bucket cleanly per calendar day.
  function isSingleDayRange(range) {
    if (!range) return false;
    const span = range.to.getTime() - range.from.getTime();
    return span > 0 && span < 36 * 60 * 60 * 1000;
  }

  // Flatten per-meal entries into [{ x, y }] points for a given macro.
  function perMealPoints(macroKey) {
    const groups = foodLogStore.entries || {};
    const out = [];
    for (const meals of Object.values(groups)) {
      if (!Array.isArray(meals)) continue;
      for (const m of meals) {
        if (m?.consumed === false) continue;
        const ps = m.foodItemId?.perServing || m.perServing || {};
        const servings = Number(m.servingCount) || 1;
        const value = (Number(ps[macroKey]) || 0) * servings;
        if (!Number.isFinite(value) || value === 0) continue;
        const ts = m.date ? new Date(m.date) : null;
        if (!ts || Number.isNaN(ts.getTime())) continue;
        out.push({ x: ts, y: Math.round(value) });
      }
    }
    return out.sort((a, b) => a.x - b.x);
  }

  function getDataPoints(def, range) {
    themeTick.value;
    const intraDay = isSingleDayRange(range);
    switch (def?.id) {
      case 'weight':
        return weightStore.entries.map((e) => ({ x: parseLocalDate(e.date), y: e.weightLbs }));
      case 'calories':
        return intraDay
          ? perMealPoints('calories')
          : (foodLogStore.dailyNutrition || []).map((d) => ({ x: parseLocalDate(d.date), y: d.calories }));
      case 'protein':
        return intraDay
          ? perMealPoints('protein')
          : (foodLogStore.dailyNutrition || []).map((d) => ({ x: parseLocalDate(d.date), y: d.protein }));
      case 'fat':
        return intraDay
          ? perMealPoints('fat')
          : (foodLogStore.dailyNutrition || []).map((d) => ({ x: parseLocalDate(d.date), y: d.fat }));
      case 'carbs':
        return intraDay
          ? perMealPoints('carbs')
          : (foodLogStore.dailyNutrition || []).map((d) => ({ x: parseLocalDate(d.date), y: d.carbs }));
      case 'caloriesBurned':
        return (exerciseLogStore.dailyBurn || []).map((d) => ({
          x: parseLocalDate(d.date),
          y: Math.round(d.caloriesBurned || 0),
        }));
      case 'caloriesNet': {
        const burnByDay = new Map((exerciseLogStore.dailyBurn || []).map((d) => [d.date, d.caloriesBurned || 0]));
        const calByDay = new Map((foodLogStore.dailyNutrition || []).map((d) => [d.date, d.calories || 0]));
        const dates = new Set([...burnByDay.keys(), ...calByDay.keys()]);
        return [...dates].sort().map((date) => ({
          x: parseLocalDate(date),
          y: Math.round((calByDay.get(date) || 0) - (burnByDay.get(date) || 0)),
        }));
      }
      case 'exerciseMinutes':
        return (exerciseLogStore.dailyBurn || []).map((d) => ({
          x: parseLocalDate(d.date),
          y: Math.round(d.durationMin || 0),
        }));
      case 'score': {
        const targets = settingsStore.settings?.targets;
        if (!targets) return [];
        return (foodLogStore.dailyNutrition || [])
          .map((d) => {
            const val = computeNutritionScore(
              { calories: d.calories, protein: d.protein, fat: d.fat, carbs: d.carbs },
              targets,
            );
            return val != null ? { x: parseLocalDate(d.date), y: val } : null;
          })
          .filter(Boolean);
      }
      default:
        if (def?.compoundRefKey) {
          // PK curve from doses store. Pre-resolved by the server when
          // dose entries change; we cap at today so the projected
          // decay tail doesn't render as the user's future.
          const entry = dosesStore.curvesByCompound[def.compoundRefKey];
          if (!entry?.curve?.length) return [];
          const todayStart = new Date();
          todayStart.setHours(0, 0, 0, 0);
          const out = [];
          for (const p of entry.curve) {
            const x = new Date(p.date);
            if (x > todayStart) continue;
            out.push({ x, y: p.activeValue });
          }
          return out;
        }
        if (def?.symptomId) {
          const logs = symptomsStore.entriesById?.get?.(def.symptomId)
            || (symptomsStore.entries || []).filter((l) => String(l.symptomId) === String(def.symptomId));
          return logs.map((l) => ({ x: parseLocalDate(l.date), y: l.severity }));
        }
        if (def?.metricId) {
          const logs = metricsStore.entriesById?.get?.(String(def.metricId)) || [];
          return logs.map((l) => ({
            x: parseLocalDate(l.date),
            y: fromCanonical(l.value, def.displayUnit),
          }));
        }
        if (def?.endoSignal) {
          const r = endoSim.result.value;
          const arr = r.series?.[def.endoSignal];
          if (!arr || !r.timestamps?.length) return [];
          const pts = new Array(arr.length);
          for (let i = 0; i < arr.length; i++) {
            pts[i] = { x: new Date(r.timestamps[i]), y: arr[i] };
          }
          return pts;
        }
        return [];
    }
  }

  return {
    allSeries,
    seriesByCategory,
    getDataPoints,
    endoSim,
    kickEndoSim,
    ENDO_MAX_DAYS,
  };
}
