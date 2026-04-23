<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  LineElement,
  PointElement,
  LinearScale,
  TimeScale,
  Tooltip,
  Filler,
  Legend,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { useWeightStore } from '../stores/weight.js';
import { useFoodLogStore } from '../stores/foodlog.js';
import { useSettingsStore } from '../stores/settings.js';
import { useSymptomsStore } from '../stores/symptoms.js';
import { useNotesStore } from '../stores/notes.js';
import { useCompoundsStore } from '../stores/compounds.js';
import { useDosesStore } from '../stores/doses.js';
import { usePhotosStore } from '../stores/photos.js';
import { computeNutritionScore } from '../utils/nutritionScore.js';
import WeeklyBudgetStrip from '../components/WeeklyBudgetStrip.vue';
import OnboardingChecklist from '../components/OnboardingChecklist.vue';
import PhotoTimelineCard from '../components/PhotoTimelineCard.vue';

ChartJS.register(LineElement, PointElement, LinearScale, TimeScale, Tooltip, Filler, Legend);

const router = useRouter();
const weightStore = useWeightStore();
const foodLogStore = useFoodLogStore();
const settingsStore = useSettingsStore();
const symptomsStore = useSymptomsStore();
const notesStore = useNotesStore();
const compoundsStore = useCompoundsStore();
const dosesStore = useDosesStore();
const photosStore = usePhotosStore();

const bmr = computed(() => settingsStore.settings?.bmr || null);

// ---- Theme-aware color resolution --------------------------------------
// Chart.js can't consume `var(--x)` directly, so we read the computed value
// from <html> whenever the theme attribute changes.
const themeTick = ref(0);
function cssVar(name, fallback = '') {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}
function applyChartFont() {
  const family = getComputedStyle(document.documentElement).getPropertyValue('--font-body').trim();
  if (family) ChartJS.defaults.font.family = family;
}
let themeObserver = null;
onMounted(() => {
  applyChartFont();
  themeObserver = new MutationObserver(() => {
    themeTick.value += 1;
    applyChartFont();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });
});
onUnmounted(() => { themeObserver?.disconnect(); });

// ---- Series definitions -------------------------------------------------

// Color lookups read live from the theme so dark mode re-renders correctly.
const CORE_SERIES = computed(() => {
  themeTick.value; // reactive dependency
  return [
    { id: 'weight', label: 'Weight', unit: 'lbs', color: cssVar('--color-weight', '#4f46e5'), cat: 'Body', axis: 'y', fill: true },
    { id: 'waist', label: 'Waist', unit: 'in', color: cssVar('--color-waist', '#0ea5e9'), cat: 'Body', axis: 'yWaist', fill: false, pills: true },
    { id: 'calories', label: 'Calories', unit: 'kcal', color: cssVar('--color-cal', '#3b82f6'), cat: 'Nutrition', axis: 'yCal', fill: true },
    { id: 'protein', label: 'Protein', unit: 'g', color: cssVar('--color-protein', '#16a34a'), cat: 'Nutrition', axis: 'yGrams', fill: false },
    { id: 'fat', label: 'Fat', unit: 'g', color: cssVar('--color-fat', '#f59e0b'), cat: 'Nutrition', axis: 'yGrams', fill: false, dash: [4, 3] },
    { id: 'carbs', label: 'Carbs', unit: 'g', color: cssVar('--color-carbs', '#ef4444'), cat: 'Nutrition', axis: 'yGrams', fill: false, dash: [4, 3] },
    { id: 'score', label: 'Score', unit: '/100', color: cssVar('--color-score', '#8b5cf6'), cat: 'Nutrition', axis: 'yScore', fill: false },
  ];
});

// One dashboard series per enabled compound. ID is `dosage:<compoundId>` so
// the existing activeSeries Set + popover structure works unchanged.
const DEFAULT_DOSE_COLOR = '#f59e0b';
const compoundSeries = computed(() => {
  themeTick.value; // reactive dep
  return compoundsStore.enabled.map((c) => ({
    id: `dosage:${c._id}`,
    label: c.name,
    unit: c.doseUnit,
    color: c.color || DEFAULT_DOSE_COLOR,
    cat: 'Compounds',
    axis: 'yDose',
    fill: true,
    dash: [4, 3],
    compoundId: c._id,
    doseUnit: c.doseUnit,
  }));
});

const SYMPTOM_COLOR_VARS = [
  '--color-symptom-1', '--color-symptom-2', '--color-symptom-3', '--color-symptom-4',
  '--color-symptom-5', '--color-symptom-6', '--color-symptom-7', '--color-symptom-8',
];

const symptomSeries = computed(() => {
  themeTick.value; // reactive dep
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

const allSeries = computed(() => [
  ...CORE_SERIES.value,
  ...compoundSeries.value,
  ...symptomSeries.value,
]);

// Group series by category for the popover.
const seriesByCategory = computed(() => {
  const groups = new Map();
  for (const s of allSeries.value) {
    if (!groups.has(s.cat)) groups.set(s.cat, []);
    groups.get(s.cat).push(s);
  }
  return groups;
});

// ---- Active series (persisted to localStorage) --------------------------

const STORAGE_KEY = 'dashboard-active-series';
const DEFAULT_ACTIVE = ['weight', 'calories', 'dosage'];

function loadActive() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw));
  } catch { /* ignore */ }
  return new Set(DEFAULT_ACTIVE);
}
function saveActive(s) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...s]));
}

const activeSeries = reactive(loadActive());

function toggleSeries(id) {
  if (activeSeries.has(id)) activeSeries.delete(id);
  else activeSeries.add(id);
  saveActive(activeSeries);
}

const activeSeriesDefs = computed(() =>
  allSeries.value.filter((s) => activeSeries.has(s.id)),
);


// ---- Chart plugins (dose pills, waist pills) ----------------------------

const pillLabelsPlugin = {
  id: 'pillLabels',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;

    // Dose pills — one set per active compound, stacked vertically from the
    // top of the chart area so rows don't overlap when multiple compounds are
    // active at once.
    const compoundDefs = activeSeriesDefs.value.filter((d) => d.compoundId);
    const topBase = chart.chartArea.top + 14;
    compoundDefs.forEach((def, row) => {
      const injLabel = `_injection:${def.compoundId}`;
      const injIdx = chart.data.datasets.findIndex((d) => d?.label === injLabel);
      if (injIdx === -1) return;
      const meta = chart.getDatasetMeta(injIdx);
      const ds = chart.data.datasets[injIdx];
      if (!meta?.data?.length) return;
      const y = topBase + row * 18;
      meta.data.forEach((point, i) => {
        const v = ds.data[i]?.value;
        const u = ds.data[i]?.unit;
        if (v == null) return;
        drawPill(ctx, `${v} ${u}`, point.x, y, def.color, true, chart.chartArea.bottom);
      });
    });

    // Waist pills (at data points).
    if (activeSeries.has('waist')) {
      const wIdx = chart.data.datasets.findIndex((d) => d?.label === 'Waist');
      if (wIdx !== -1) {
        const meta = chart.getDatasetMeta(wIdx);
        const ds = chart.data.datasets[wIdx];
        if (meta?.data?.length) {
          meta.data.forEach((point, i) => {
            const val = ds.data[i]?.y;
            if (val == null) return;
            drawPill(ctx, `${val}"`, point.x, point.y - 14, cssVar('--color-waist', '#0ea5e9'), false, 0);
          });
        }
      }
    }
  },
};

// ---- Note icons under x-axis --------------------------------------------

const noteHitboxes = ref([]);
const hoveredNote = ref(null);

const noteIconsPlugin = {
  id: 'noteIcons',
  afterDraw(chart) {
    const boxes = [];
    const notes = notesStore.rangeNotes;
    const xScale = chart.scales.x;
    if (notes.length && xScale) {
      const ctx = chart.ctx;
      const y = xScale.bottom + 12;
      ctx.save();
      ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const minT = xScale.min;
      const maxT = xScale.max;
      for (const n of notes) {
        const date = parseLocalDate(n.date);
        const t = date.getTime();
        if (t < minT || t > maxT) continue;
        const px = xScale.getPixelForValue(t);
        ctx.fillText('📝', px, y);
        boxes.push({ x: px - 9, y: y - 9, w: 18, h: 18, text: n.text, date: n.date });
      }
      ctx.restore();
    }
    noteHitboxes.value = boxes;
  },
};

function onChartMouseMove(event) {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  for (const box of noteHitboxes.value) {
    if (x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) {
      hoveredNote.value = { x, y: box.y, text: box.text, date: box.date };
      return;
    }
  }
  if (hoveredNote.value) hoveredNote.value = null;
}

function onChartMouseLeave() {
  hoveredNote.value = null;
}

function drawPill(ctx, label, x, y, color, showTick, tickBottom) {
  ctx.save();
  ctx.font = 'bold 9px -apple-system, BlinkMacSystemFont, sans-serif';
  const tw = ctx.measureText(label).width;
  const pad = 5;
  const w = tw + pad * 2;
  const h = 14;
  const px = x - w / 2;
  const py = y - h / 2;

  if (showTick) {
    ctx.strokeStyle = color.replace(')', ', 0.35)').replace('rgb', 'rgba');
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.beginPath();
    ctx.moveTo(x, py + h);
    ctx.lineTo(x, tickBottom);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(px, py, w, h, h / 2);
  ctx.fill();

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, py + h / 2);
  ctx.restore();
}

// ---- Helpers ------------------------------------------------------------

function parseLocalDate(value) {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const s = String(value);
  const datePart = s.slice(0, 10);
  const [y, m, d] = datePart.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function rangeDates(days) {
  const to = new Date();
  const from = new Date();
  if (days) from.setDate(from.getDate() - days);
  else from.setFullYear(from.getFullYear() - 5);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// ---- Range + data loading -----------------------------------------------

const ranges = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '6m', days: 180 },
  { label: '1y', days: 365 },
  { label: 'All', days: null },
];
const selectedRange = ref(ranges[0]);

async function loadRangeData() {
  const { from, to } = rangeDates(selectedRange.value.days);
  await Promise.all([
    foodLogStore.fetchDailyNutrition(from, to),
    symptomsStore.fetchRangeLogs(from, to),
    notesStore.fetchRange(from, to),
  ]);
}

onMounted(async () => {
  await Promise.all([
    weightStore.fetchEntries(),
    weightStore.fetchStats(),
    weightStore.fetchWaistEntries(),
    compoundsStore.fetchAll(),
    dosesStore.fetchEntries(),
    dosesStore.fetchPkCurves(),
    symptomsStore.fetchSymptoms(),
    symptomsStore.fetchLoggedDates(),
    photosStore.fetchAll(),
    loadRangeData(),
    settingsStore.loaded ? Promise.resolve() : settingsStore.fetchSettings(),
  ]);

  if (!settingsStore.settings) {
    router.push('/settings');
  }
});

watch(selectedRange, loadRangeData);

// ---- Filtered data (date-range aware) -----------------------------------

function filterByRange(arr, dateField = 'date') {
  if (!selectedRange.value.days) return [...arr].sort((a, b) =>
    String(a[dateField]).localeCompare(String(b[dateField])),
  );
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - selectedRange.value.days);
  return arr
    .filter((e) => new Date(e[dateField]) >= cutoff)
    .sort((a, b) => String(a[dateField]).localeCompare(String(b[dateField])));
}

const filteredWeight = computed(() => filterByRange(weightStore.entries));
const filteredWaist = computed(() => filterByRange(weightStore.waistEntries));
const filteredNutrition = computed(() => foodLogStore.dailyNutrition || []);
function filteredDosesFor(compoundId) {
  const all = dosesStore.entries.filter((d) => d.compoundId === compoundId);
  if (!selectedRange.value.days) return all;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - selectedRange.value.days);
  return all.filter((d) => new Date(d.date) >= cutoff);
}

function filteredPkFor(compoundId) {
  const entry = dosesStore.curvesByCompound[compoundId];
  if (!entry?.curve?.length) return [];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const cutoff = selectedRange.value.days ? new Date() : null;
  if (cutoff) cutoff.setDate(cutoff.getDate() - selectedRange.value.days);
  return entry.curve.filter((p) => {
    const t = new Date(p.date);
    if (t > todayStart) return false;
    if (cutoff && t < cutoff) return false;
    return true;
  });
}

// Build per-symptom data: Map<symptomId, [{date, severity}]>
const symptomDataById = computed(() => {
  const map = new Map();
  for (const log of symptomsStore.rangeLogs) {
    if (!map.has(log.symptomId)) map.set(log.symptomId, []);
    map.get(log.symptomId).push(log);
  }
  return map;
});

// ---- Dynamic chart data -------------------------------------------------

function getSeriesDataPoints(def) {
  switch (def.id) {
    case 'weight':
      return filteredWeight.value.map((e) => ({ x: parseLocalDate(e.date), y: e.weightLbs }));
    case 'waist':
      return filteredWaist.value.map((e) => ({ x: parseLocalDate(e.date), y: e.waistInches }));
    case 'calories':
      return filteredNutrition.value.map((d) => ({ x: parseLocalDate(d.date), y: d.calories }));
    case 'protein':
      return filteredNutrition.value.map((d) => ({ x: parseLocalDate(d.date), y: d.protein }));
    case 'fat':
      return filteredNutrition.value.map((d) => ({ x: parseLocalDate(d.date), y: d.fat }));
    case 'carbs':
      return filteredNutrition.value.map((d) => ({ x: parseLocalDate(d.date), y: d.carbs }));
    case 'score': {
      const targets = settingsStore.settings?.targets;
      if (!targets) return [];
      return filteredNutrition.value
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
      if (def.compoundId) {
        return filteredPkFor(def.compoundId).map((p) => ({
          x: new Date(p.date),
          y: p.activeValue,
        }));
      }
      if (def.symptomId) {
        const logs = symptomDataById.value.get(def.symptomId) || [];
        return logs.map((l) => ({ x: parseLocalDate(l.date), y: l.severity }));
      }
      return [];
  }
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Rebuild chartData using the clean helper:
const chartDataClean = computed(() => {
  const datasets = [];

  for (const def of activeSeriesDefs.value) {
    const data = getSeriesDataPoints(def);
    if (!data.length) continue;

    const isCompound = !!def.compoundId;
    datasets.push({
      label: def.label,
      data,
      borderColor: def.color,
      backgroundColor: def.fill ? hexToRgba(def.color, 0.06) : 'transparent',
      fill: def.fill || false,
      tension: isCompound ? 0.4 : 0.3,
      pointRadius: isCompound ? 0 : (def.pills ? 4 : 3),
      pointBackgroundColor: def.color,
      borderWidth: 2,
      borderDash: def.dash || [],
      yAxisID: def.axis,
    });

    // Add avg weight loss trend line when weight is active.
    if (def.id === 'weight' && data.length >= 2) {
      const t0 = data[0].x.getTime();
      const n = data.length;
      let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
      for (const pt of data) {
        const x = (pt.x.getTime() - t0) / 86400000; // days from first point
        sumX += x;
        sumY += pt.y;
        sumXY += x * pt.y;
        sumXX += x * x;
      }
      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      const trendData = [
        { x: data[0].x, y: intercept },
        { x: data[data.length - 1].x, y: intercept + slope * ((data[data.length - 1].x.getTime() - t0) / 86400000) },
      ];
      datasets.push({
        label: 'Avg Weight Loss',
        data: trendData,
        borderColor: cssVar('--color-weight', '#4f46e5'),
        backgroundColor: 'transparent',
        fill: false,
        tension: 0,
        pointRadius: 0,
        borderWidth: 2,
        borderDash: [6, 4],
        yAxisID: 'y',
      });
    }
  }

  // Injection markers — one hidden dataset per active compound so the pill
  // plugin can draw the correct value/unit at each dose point.
  for (const def of activeSeriesDefs.value) {
    if (!def.compoundId) continue;
    const doses = filteredDosesFor(def.compoundId);
    if (!doses.length) continue;
    datasets.push({
      label: `_injection:${def.compoundId}`,
      data: doses.map((d) => ({
        x: parseLocalDate(d.date),
        y: 0,
        value: d.value,
        unit: def.doseUnit,
      })),
      borderColor: 'transparent',
      backgroundColor: 'transparent',
      pointRadius: 0,
      showLine: false,
      yAxisID: 'yCal',
    });
  }

  return { datasets };
});

// ---- Dynamic chart options ----------------------------------------------

const hasActiveCompound = computed(() =>
  activeSeriesDefs.value.some((s) => s.compoundId),
);

const chartOptions = computed(() => {
  const usedAxes = new Set(activeSeriesDefs.value.map((s) => s.axis));
  // Injection markers ride on yCal so they stay pinned at y=0 regardless of
  // the dose curve's own y-scale.
  if (hasActiveCompound.value) usedAxes.add('yCal');

  // Reserve vertical headroom for one row of dose pills per active compound.
  const compoundRows = activeSeriesDefs.value.filter((s) => s.compoundId).length;
  const topPadding = compoundRows ? 24 + (compoundRows - 1) * 18 : 4;

  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    layout: {
      padding: {
        top: topPadding,
        bottom: notesStore.rangeNotes.length ? 28 : 4,
      },
    },
    scales: {
      x: {
        type: 'time',
        time: { unit: 'day', tooltipFormat: 'MMM d, yyyy' },
        grid: { display: false },
      },
    },
    plugins: {
      legend: { display: false }, // We use the chip bar instead.
      tooltip: {
        mode: 'index',
        intersect: false,
        filter: (item) => !String(item.dataset?.label || '').startsWith('_injection'),
      },
    },
  };

  // Left axis: weight (visible only when weight is active).
  if (usedAxes.has('y')) {
    opts.scales.y = {
      position: 'left',
      title: { display: true, text: 'lbs', color: cssVar('--chart-axis', '#9ca3af') },
      grid: { color: cssVar('--chart-grid', '#f3f4f6') },
    };
  }

  // Right axis: calories (visible when calories is active).
  if (usedAxes.has('yCal')) {
    opts.scales.yCal = {
      position: 'right',
      title: { display: activeSeries.has('calories'), text: 'Calories', color: cssVar('--color-cal', '#3b82f6') },
      grid: { drawOnChartArea: false },
      min: 0,
    };
    if (bmr.value && activeSeries.has('calories')) {
      const cals = filteredNutrition.value.map((d) => d.calories);
      const maxCal = cals.length ? Math.max(...cals) : 0;
      opts.scales.yCal.max = Math.max(bmr.value + 100, maxCal + 100);
    }
  }

  // Hidden axes for other unit groups.
  if (usedAxes.has('yGrams')) {
    opts.scales.yGrams = { position: 'right', display: false, grid: { drawOnChartArea: false }, min: 0 };
  }
  if (usedAxes.has('yWaist')) {
    opts.scales.yWaist = { position: 'right', display: false, grid: { drawOnChartArea: false } };
  }
  if (usedAxes.has('yDose')) {
    opts.scales.yDose = { position: 'right', display: false, grid: { drawOnChartArea: false }, min: 0 };
  }
  if (usedAxes.has('ySymptom')) {
    opts.scales.ySymptom = { position: 'right', display: false, grid: { drawOnChartArea: false }, min: 0, max: 10 };
  }
  if (usedAxes.has('yScore')) {
    opts.scales.yScore = { position: 'right', display: false, grid: { drawOnChartArea: false }, min: 0, max: 100 };
  }

  return opts;
});

const hasAnyData = computed(() => chartDataClean.value.datasets.length > 0);

// ---- Combined history table ---------------------------------------------

// The table shows one dose column per enabled compound. We track dose values
// by (date, compoundId) in a nested map so a day with multiple compounds
// logged doesn't collide on a single `dose` field.
const tableCompounds = computed(() => compoundsStore.enabled);

const logTableRows = computed(() => {
  const byDate = new Map();
  const ensure = (dateStr) => {
    if (!byDate.has(dateStr)) byDate.set(dateStr, {
      date: dateStr,
      weight: null, waist: null,
      doses: {}, // compoundId → value
      cal: null, protein: null, fat: null, carbs: null, score: null,
      symptoms: false, note: null,
    });
    return byDate.get(dateStr);
  };

  for (const e of weightStore.entries) {
    ensure(String(e.date).slice(0, 10)).weight = e.weightLbs;
  }
  for (const e of weightStore.waistEntries) {
    ensure(String(e.date).slice(0, 10)).waist = e.waistInches;
  }
  for (const e of dosesStore.entries) {
    ensure(String(e.date).slice(0, 10)).doses[e.compoundId] = e.value;
  }
  const targets = settingsStore.settings?.targets;
  for (const d of filteredNutrition.value) {
    const row = ensure(String(d.date).slice(0, 10));
    row.cal = Math.round(d.calories);
    row.protein = Math.round(d.protein);
    row.fat = Math.round(d.fat);
    row.carbs = Math.round(d.carbs);
    row.score = computeNutritionScore(
      { calories: d.calories, protein: d.protein, fat: d.fat, carbs: d.carbs },
      targets,
    );
  }
  for (const d of symptomsStore.loggedDates) {
    ensure(d).symptoms = true;
  }
  for (const n of notesStore.rangeNotes) {
    ensure(n.date).note = n.text;
  }

  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
});

const hoveredTableNote = ref(null);

function onTableNoteEnter(event, row) {
  const rect = event.currentTarget.getBoundingClientRect();
  const parent = event.currentTarget.closest('.table-wrap').getBoundingClientRect();
  hoveredTableNote.value = {
    x: rect.left - parent.left + rect.width / 2,
    y: rect.top - parent.top,
    text: row.note,
    date: row.date,
  };
}
function onTableNoteLeave() {
  hoveredTableNote.value = null;
}

function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
</script>

<template>
  <div class="dashboard">
    <h2>Dashboard</h2>

    <OnboardingChecklist />

    <!-- Weight stats grid -->
    <div v-if="weightStore.stats" class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">Current</span>
        <span class="stat-value">{{ weightStore.stats.currentWeight }} lbs</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Total Change</span>
        <span class="stat-value" :class="weightStore.stats.totalChange < 0 ? 'green' : 'red'">
          {{ weightStore.stats.totalChange > 0 ? '+' : '' }}{{ weightStore.stats.totalChange }} lbs
        </span>
      </div>
      <div class="stat-card">
        <span class="stat-label">BMI</span>
        <span class="stat-value">{{ weightStore.stats.currentBMI }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">% Change</span>
        <span class="stat-value">{{ weightStore.stats.percentChange }}%</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Weekly Avg</span>
        <span class="stat-value">{{ weightStore.stats.weeklyAvg }} lbs/wk</span>
      </div>
      <div v-if="weightStore.stats.toGoal != null" class="stat-card">
        <span class="stat-label">To Goal</span>
        <span class="stat-value">{{ weightStore.stats.toGoal }} lbs</span>
      </div>
    </div>

    <!-- Rolling 7-day budget -->
    <div class="card weekly-card">
      <WeeklyBudgetStrip :default-expanded="true" />
    </div>

    <!-- Chart -->
    <div class="card chart-section">
      <div class="chart-controls">
        <div class="range-buttons">
          <button
            v-for="r in ranges"
            :key="r.label"
            :class="{ active: selectedRange === r }"
            @click="selectedRange = r"
          >
            {{ r.label }}
          </button>
        </div>
      </div>

      <!-- Active series chips -->
      <div class="chip-bar">
        <button
          v-for="def in activeSeriesDefs"
          :key="def.id"
          class="chip"
          @click="toggleSeries(def.id)"
        >
          <span class="chip-dot" :style="{ background: def.color }" />
          {{ def.label }}
          <span class="chip-x">×</span>
        </button>
        <VDropdown placement="bottom-start" :distance="6">
          <button class="chip chip-add">+ Add</button>
          <template #popper>
            <div class="popover">
              <div v-for="[cat, items] in seriesByCategory" :key="cat" class="pop-group">
                <div class="pop-cat">{{ cat }}</div>
                <label
                  v-for="s in items"
                  :key="s.id"
                  class="pop-item"
                >
                  <input
                    type="checkbox"
                    :checked="activeSeries.has(s.id)"
                    @change="toggleSeries(s.id)"
                  />
                  <span class="pop-dot" :style="{ background: s.color }" />
                  {{ s.label }}
                </label>
              </div>
            </div>
          </template>
        </VDropdown>
      </div>

      <div
        class="chart-container"
        @mousemove="onChartMouseMove"
        @mouseleave="onChartMouseLeave"
      >
        <Line v-if="hasAnyData" :data="chartDataClean" :options="chartOptions" :plugins="[pillLabelsPlugin, noteIconsPlugin]" />
        <p v-else class="empty">Select a series above to view data.</p>
        <div
          v-if="hoveredNote"
          class="note-tooltip"
          :style="{ left: hoveredNote.x + 'px', top: hoveredNote.y + 'px' }"
        >
          <div class="note-tooltip-date">{{ formatDate(hoveredNote.date) }}</div>
          <div class="note-tooltip-text">{{ hoveredNote.text }}</div>
        </div>
      </div>
    </div>

    <!-- Progress photos timeline -->
    <PhotoTimelineCard />

    <!-- Combined log history -->
    <div class="card">
      <h3>Log History</h3>
      <div class="table-wrap">
      <table v-if="logTableRows.length" class="log-table">
        <thead>
          <tr>
            <th class="lt-date">Date</th>
            <th class="lt-num">Weight</th>
            <th class="lt-num">Waist</th>
            <th v-for="c in tableCompounds" :key="c._id" class="lt-num" :style="{ color: c.color || '' }">{{ c.name }}</th>
            <th class="lt-num lt-cal">Kcal</th>
            <th class="lt-num lt-pro">Pro</th>
            <th class="lt-num lt-fat">Fat</th>
            <th class="lt-num lt-carb">Carbs</th>
            <th class="lt-num lt-score">Score</th>
            <th class="lt-sym">Symptoms</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in logTableRows" :key="row.date" class="lt-row" @click="router.push(`/?date=${row.date}`)">
            <td class="lt-date">
              {{ formatDate(row.date) }}
              <span
                v-if="row.note"
                class="note-icon"
                @mouseenter="onTableNoteEnter($event, row)"
                @mouseleave="onTableNoteLeave"
                @click.stop
              >📝</span>
            </td>
            <td class="lt-num">{{ row.weight != null ? `${row.weight} lbs` : '' }}</td>
            <td class="lt-num">{{ row.waist != null ? `${row.waist}"` : '' }}</td>
            <td v-for="c in tableCompounds" :key="c._id" class="lt-num" :style="{ color: c.color || '' }">
              {{ row.doses[c._id] != null ? `${row.doses[c._id]} ${c.doseUnit}` : '' }}
            </td>
            <td class="lt-num lt-cal">{{ row.cal != null ? row.cal.toLocaleString() : '' }}</td>
            <td class="lt-num lt-pro">{{ row.protein != null ? `${row.protein}g` : '' }}</td>
            <td class="lt-num lt-fat">{{ row.fat != null ? `${row.fat}g` : '' }}</td>
            <td class="lt-num lt-carb">{{ row.carbs != null ? `${row.carbs}g` : '' }}</td>
            <td class="lt-num lt-score" :class="row.score != null ? (row.score >= 85 ? 'score-good' : row.score >= 60 ? 'score-ok' : 'score-bad') : ''">{{ row.score != null ? row.score : '' }}</td>
            <td class="lt-sym">{{ row.symptoms ? '✓' : '' }}</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">No entries yet.</p>
      <div
        v-if="hoveredTableNote"
        class="note-tooltip"
        :style="{ left: hoveredTableNote.x + 'px', top: hoveredTableNote.y + 'px' }"
      >
        <div class="note-tooltip-date">{{ formatDate(hoveredTableNote.date) }}</div>
        <div class="note-tooltip-text">{{ hoveredTableNote.text }}</div>
      </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard { max-width: 720px; }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-5);
  margin-bottom: var(--space-4);
}
.card h3 { font-size: var(--font-size-m); margin-bottom: var(--space-3); }
.weekly-card { padding: 0; overflow: hidden; }
.weekly-card :deep(.weekly-budget) {
  background: transparent;
  border: none;
  border-radius: 0;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}
@media (max-width: 720px) {
  .stats-grid { grid-template-columns: repeat(2, 1fr); }
}
.stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-3);
  text-align: center;
}
.stat-label {
  display: block;
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-secondary);
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--space-1);
}
.stat-value {
  font-size: var(--font-size-l);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  white-space: nowrap;
}
.stat-value.green { color: var(--success); }
.stat-value.red { color: var(--danger); }

/* Chart controls */
.chart-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}
.range-buttons {
  display: inline-flex;
  gap: 0;
}
.range-buttons button {
  padding: var(--space-1) var(--space-3);
  border: 1px solid var(--border);
  border-radius: 0;
  margin-left: -1px;
  background: var(--bg);
  cursor: pointer;
  font-size: var(--font-size-xs);
  color: var(--text-secondary);
  transition: background var(--transition-base), color var(--transition-base), border-color var(--transition-base);
}
.range-buttons button:first-child { margin-left: 0; }
.range-buttons button.active {
  background: var(--primary);
  color: var(--text-on-primary);
  border-color: var(--primary);
  position: relative;
  z-index: 1;
}

/* Chip bar */
.chip-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
  position: relative;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-small);
  background: var(--border);
  cursor: pointer;
  font-size: var(--font-size-xs);
  color: var(--text);
  transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
  white-space: nowrap;
}
.chip:hover { background: var(--primary-soft); color: var(--primary); border-color: var(--primary); }
.chip:hover .chip-x { color: var(--primary); }
.chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.chip-x {
  color: var(--text-secondary);
  font-size: var(--font-size-s);
  line-height: 1;
  margin-left: 0.1rem;
}
.chip-add {
  border-style: dashed;
  color: var(--text-secondary);
  font-weight: var(--font-weight-medium);
}
.chip-add:hover { color: var(--text); border-color: var(--text-secondary); }

/* Popover */
.popover {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  box-shadow: var(--shadow-m);
  padding: var(--space-3);
  min-width: 240px;
  max-height: 400px;
  overflow-y: auto;
  columns: 2;
  column-gap: var(--space-4);
}
.pop-group {
  break-inside: avoid;
  margin-bottom: var(--space-2);
}
.pop-cat {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-secondary);
  font-weight: var(--font-weight-bold);
  margin-bottom: var(--space-1);
}
.pop-item {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--font-size-s);
  color: var(--text);
  cursor: pointer;
  padding: var(--space-1) 0;
  white-space: nowrap;
}
.pop-item input[type="checkbox"] {
  accent-color: var(--primary);
  width: 14px;
  height: 14px;
  cursor: pointer;
}
.pop-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.chart-container { height: 360px; position: relative; }

.note-tooltip {
  position: absolute;
  transform: translate(-50%, calc(-100% - 14px));
  background: var(--text);
  color: var(--surface);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-small);
  font-size: var(--font-size-xs);
  line-height: 1.35;
  max-width: 280px;
  white-space: pre-wrap;
  pointer-events: none;
  z-index: 20;
  box-shadow: var(--shadow-m);
}
.note-tooltip-date {
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  opacity: 0.7;
  margin-bottom: var(--space-1);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
}
.note-tooltip-text { color: var(--surface); }

.table-wrap { position: relative; }
.note-icon {
  display: inline-block;
  margin-left: var(--space-1);
  cursor: help;
  font-size: var(--font-size-s);
  line-height: 1;
}

/* Log history table */
.log-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-s);
  font-variant-numeric: tabular-nums;
}
.log-table th {
  font-weight: var(--font-weight-medium);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wide);
  color: var(--text-secondary);
  padding: var(--space-1) var(--space-2);
  border-bottom: 1px solid var(--border);
}
.log-table td {
  padding: var(--space-2) var(--space-2);
  border-bottom: 1px solid var(--border);
  color: var(--text);
}
.log-table tbody tr:last-child td { border-bottom: none; }
.lt-row { cursor: pointer; }
.lt-row:hover td { background: var(--bg); }
.lt-date { text-align: left; white-space: nowrap; }
.lt-num { text-align: right; white-space: nowrap; }
.log-table td.lt-cal { color: var(--color-cal); font-weight: var(--font-weight-bold); }
.log-table td.lt-pro { color: var(--color-protein); }
.log-table td.lt-fat { color: var(--color-fat); }
.log-table td.lt-carb { color: var(--color-carbs); }
.log-table th.lt-cal { color: var(--color-cal); }
.log-table th.lt-pro { color: var(--color-protein); }
.log-table th.lt-fat { color: var(--color-fat); }
.log-table th.lt-carb { color: var(--color-carbs); }
.log-table td.lt-score { font-weight: var(--font-weight-bold); }
.log-table th.lt-score { color: var(--color-score); }
.log-table td.score-good { color: var(--success); }
.log-table td.score-ok { color: var(--warning); }
.log-table td.score-bad { color: var(--danger); }
.lt-sym { text-align: center; width: 4rem; color: var(--success); }

.empty { color: var(--text-secondary); font-size: var(--font-size-s); text-align: center; padding: var(--space-6) 0; }
</style>
