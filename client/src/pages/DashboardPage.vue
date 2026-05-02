<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  Interaction,
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
import { useMetricsStore } from '../stores/metrics.js';
import { usePhotoTypesStore } from '../stores/photoTypes.js';
import {
  defaultUnitFor,
  unitLabel,
  fromCanonical,
} from '../../../shared/units.js';
import { useNotesStore } from '../stores/notes.js';
import { useCompoundsStore } from '../stores/compounds.js';
import { useDosesStore } from '../stores/doses.js';
import { usePhotosStore } from '../stores/photos.js';
import { useWaterStore, mlToUnit } from '../stores/water.js';
import { computeNutritionScore } from '../utils/nutritionScore.js';
import { contrastText } from '../utils/contrast.js';
import WeeklyBudgetStrip from '../components/WeeklyBudgetStrip.vue';
import InsightsCard from '../components/InsightsCard.vue';
import PhotoTimelineCard from '../components/PhotoTimelineCard.vue';
import UpgradeBadge from '../components/UpgradeBadge.vue';
import FastingBanner from '../components/FastingBanner.vue';
import { usePlanLimits } from '../composables/usePlanLimits.js';
import { useUpgradeModalStore } from '../stores/upgradeModal.js';
import { localYmd } from '../utils/date.js';

ChartJS.register(LineElement, PointElement, LinearScale, TimeScale, Tooltip, Filler, Legend);

// Custom interaction mode: for each dataset, find the single point whose
// x-coordinate is closest to the cursor. Built-in modes don't handle our
// mixed cadence well — `mode: 'index'` assumes a shared x array (breaks
// with dense PK curves alongside sparse weigh-ins), and `mode: 'x'` returns
// all points intersecting the x band (duplicates from dense series, drops
// sparse series with no point in range). This guarantees one item per
// dataset, regardless of cadence.
Interaction.modes.nearestX = function nearestX(chart, e, options, useFinalPosition) {
  const eventX = e?.x ?? 0;
  const items = [];
  chart.data.datasets.forEach((_ds, datasetIndex) => {
    if (!chart.isDatasetVisible(datasetIndex)) return;
    const meta = chart.getDatasetMeta(datasetIndex);
    if (!meta?.data?.length) return;
    let closestIndex = -1;
    let minDist = Infinity;
    meta.data.forEach((el, i) => {
      const props = el.getProps(['x'], useFinalPosition);
      const d = Math.abs(props.x - eventX);
      if (d < minDist) {
        minDist = d;
        closestIndex = i;
      }
    });
    if (closestIndex >= 0) {
      items.push({
        element: meta.data[closestIndex],
        datasetIndex,
        index: closestIndex,
      });
    }
  });
  return items;
};

const router = useRouter();
const weightStore = useWeightStore();
const foodLogStore = useFoodLogStore();
const settingsStore = useSettingsStore();
const symptomsStore = useSymptomsStore();
const metricsStore = useMetricsStore();
const photoTypesStore = usePhotoTypesStore();

const photosVisibleOnDashboard = computed(() => {
  const p = settingsStore.settings?.photos;
  if (!p || !p.enabled) return false;
  return p.showOnDashboard !== false;
});
const notesStore = useNotesStore();
const compoundsStore = useCompoundsStore();
const dosesStore = useDosesStore();
const photosStore = usePhotosStore();
const waterStore = useWaterStore();

// Today's hydration summary card. Conditional on settings.water.enabled
// AND settings.water.showOnDashboard.
const waterSettings = computed(() => settingsStore.settings?.water || {});
const waterCardVisible = computed(
  () => Boolean(waterSettings.value.enabled) && Boolean(waterSettings.value.showOnDashboard),
);
const waterTodayKey = computed(() => localYmd());
const waterTodayMl = computed(() => waterStore.totalMlFor(waterTodayKey.value));
const waterTargetMl = computed(() => Number(waterSettings.value.dailyTargetMl) || 2000);
const waterUnit = computed(() => waterSettings.value.unit || 'fl_oz');
const waterUnitLabel = computed(() => (waterUnit.value === 'fl_oz' ? 'fl oz' : 'ml'));
const waterTodayDisplay = computed(() => Math.round(mlToUnit(waterTodayMl.value, waterUnit.value)));
const waterTargetDisplay = computed(() => Math.round(mlToUnit(waterTargetMl.value, waterUnit.value)));
const waterPct = computed(() => {
  if (!waterTargetMl.value) return 0;
  return Math.min(100, Math.round((waterTodayMl.value / waterTargetMl.value) * 100));
});
const waterGoalHit = computed(() => waterTodayMl.value >= waterTargetMl.value);
const planLimits = usePlanLimits();
const upgradeModal = useUpgradeModalStore();

const rolling7DayUpgradeTier = computed(() => {
  const target = planLimits.planRequiredFor({ feature: 'rolling7DayTargets' });
  return target?.id || null;
});

// Used to scale the calorie-axis range so the user's daily-burn baseline is
// always visible on the chart. `bmr` here is a misnomer kept from a prior
// schema — the value compared against calorie intake is total daily burn.
const tdee = computed(() => settingsStore.settings?.tdee || null);

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

// Mobile breakpoint drives chart-axis behavior: on mobile we hide y-axis
// tick columns and draw first/last value labels inline (see
// endpointLabelsPlugin) to recover plot width.
const isMobile = ref(false);
let mobileMql = null;
function syncMobile() {
  if (typeof window === 'undefined') return;
  isMobile.value = window.matchMedia('(max-width: 768px)').matches;
}

onMounted(() => {
  applyChartFont();
  themeObserver = new MutationObserver(() => {
    themeTick.value += 1;
    applyChartFont();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style'] });

  if (typeof window !== 'undefined' && window.matchMedia) {
    mobileMql = window.matchMedia('(max-width: 768px)');
    syncMobile();
    mobileMql.addEventListener('change', syncMobile);
  }
});
onUnmounted(() => {
  themeObserver?.disconnect();
  mobileMql?.removeEventListener('change', syncMobile);
});

// ---- Series definitions -------------------------------------------------

// Color lookups read live from the theme so dark mode re-renders correctly.
const CORE_SERIES = computed(() => {
  themeTick.value; // reactive dependency
  return [
    { id: 'weight', label: 'Weight', unit: 'lbs', color: cssVar('--color-weight', '#4f46e5'), cat: 'Body', axis: 'y', fill: true },
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

// Metric series: one per enabled user-tracked metric (waist, arms, body fat,
// custom, etc.). Reuses the symptom palette for visual consistency. All
// metrics share `yMetric` even though their dimensions differ — same
// trade-off as compounds sharing yDose: the per-axis scale is hidden so
// the visual overlap is by design.
const metricSeries = computed(() => {
  themeTick.value; // reactive dep
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
        // Carried so getSeriesDataPoints can resolve display unit without
        // re-looking up the metric def.
        dimension: m.dimension,
        displayUnit: unit,
      };
    });
});

// For any series, build a sibling "trend" def — same color/category/axis,
// dashed best-fit line. Compounds get one too even though their PK curve
// is modeled rather than measured — the regression slope still tells the
// user whether their average active level is trending up or down across
// the selected range.
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

// Interleave each value series with its trend companion so the popover
// groups them adjacent within their category ("Weight, Weight trend, …").
const allSeries = computed(() => {
  const out = [];
  for (const s of [
    ...CORE_SERIES.value,
    ...metricSeries.value,
    ...compoundSeries.value,
    ...symptomSeries.value,
  ]) {
    out.push(s);
    out.push(makeTrendDef(s));
  }
  return out;
});

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
const LAYOUT_KEY = 'dashboard-chart-layout';
const DEFAULT_ACTIVE = ['weight', 'weight-trend', 'calories', 'dosage'];
const LAYOUTS = ['overlay', 'stacked'];

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

function loadLayout() {
  try {
    const raw = localStorage.getItem(LAYOUT_KEY);
    if (raw && LAYOUTS.includes(raw)) return raw;
  } catch { /* ignore */ }
  return 'overlay';
}
const chartLayout = ref(loadLayout());
watch(chartLayout, (v) => {
  try { localStorage.setItem(LAYOUT_KEY, v); } catch { /* ignore */ }
});

const activeSeries = reactive(loadActive());

// Cap for simultaneously-selected chart series. Free=2, paid=∞. The cap
// only applies to ADDING — removing is always allowed even past cap (so a
// user who somehow holds more than the cap can prune back down).
const seriesCap = computed(() => planLimits.storageCap('maxCorrelationMetrics'));
const seriesUpgradeTier = computed(() => {
  const target = planLimits.planRequiredFor({ storageKey: 'maxCorrelationMetrics' });
  return target?.id || null;
});
const atSeriesCap = computed(
  () => Number.isFinite(seriesCap.value) && activeSeries.size >= seriesCap.value,
);

function toggleSeries(id) {
  if (activeSeries.has(id)) {
    activeSeries.delete(id);
    saveActive(activeSeries);
    return;
  }
  // Adding a new series — gate against the cap.
  if (atSeriesCap.value) {
    upgradeModal.openForGate({
      limitKey: 'maxCorrelationMetrics',
      used: activeSeries.size,
    });
    return;
  }
  activeSeries.add(id);
  saveActive(activeSeries);
}

const activeSeriesDefs = computed(() =>
  allSeries.value.filter((s) => activeSeries.has(s.id)),
);


// ---- Chart plugins (dose pills) -----------------------------------------

const pillLabelsPlugin = {
  id: 'pillLabels',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;

    // Dose pills — one set per active compound, stacked vertically from the
    // top of the chart area. In stacked layout each chart only contains one
    // compound's `_injection` dataset, so we filter to only those defs whose
    // dataset is actually in this chart — otherwise rows would offset based
    // on the global compound count and pills would float in empty space.
    const allCompoundDefs = activeSeriesDefs.value.filter((d) => d.compoundId);
    const compoundDefs = allCompoundDefs.filter((def) =>
      chart.data.datasets.some((d) => d?.label === `_injection:${def.compoundId}`),
    );
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
        drawPill(ctx, `${v}${u}`, point.x, y, def.color, true, chart.chartArea.bottom);
      });
    });

  },
};

// ---- Note icons under x-axis --------------------------------------------

const noteHitboxes = ref([]);
const hoveredNote = ref(null);

// Lucide pencil SVG paths (viewBox 24×24). Drawn into the chart canvas via
// Path2D so the icon matches the table's note column.
const PENCIL_BODY = new Path2D('M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z');
const PENCIL_CAP = new Path2D('M15 5 19 9');
function drawPencil(ctx, cx, cy, size, color) {
  const s = size / 24;
  ctx.save();
  ctx.translate(cx - size / 2, cy - size / 2);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2 / s; // keep stroke ~2px after scaling
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke(PENCIL_BODY);
  ctx.stroke(PENCIL_CAP);
  ctx.restore();
}

const noteIconsPlugin = {
  id: 'noteIcons',
  afterDraw(chart) {
    const boxes = [];
    const notes = notesStore.rangeNotes;
    const xScale = chart.scales.x;
    if (notes.length && xScale) {
      const ctx = chart.ctx;
      const y = xScale.bottom + 12;
      const color = cssVar('--text-tertiary', '#7a9a8a');
      const minT = xScale.min;
      const maxT = xScale.max;
      const ICON = 14;
      for (const n of notes) {
        const date = parseLocalDate(n.date);
        const t = date.getTime();
        if (t < minT || t > maxT) continue;
        const px = xScale.getPixelForValue(t);
        drawPencil(ctx, px, y, ICON, color);
        const half = ICON / 2;
        boxes.push({ x: px - half, y: y - half, w: ICON, h: ICON, text: n.text, date: n.date });
      }
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

// On mobile, the y-axis tick columns (left=weight, right=calories) are
// hidden to recover plot width. This plugin replaces them with a single
// pill at the first and last point of each axis-bearing series so users
// still get an absolute reference at the start + end of the visible range.
const endpointLabelsPlugin = {
  id: 'endpointLabels',
  afterDatasetsDraw(chart) {
    if (!isMobile.value) return;

    // Only the series whose y-axis we hid get inline endpoint labels.
    // Other series (dosage, symptoms) already have their own datapoint
    // annotations.
    const SERIES = [
      { label: 'Weight', unit: ' lbs', fmt: (v) => `${v} lbs` },
      { label: 'Calories', unit: ' kcal', fmt: (v) => `${Math.round(v).toLocaleString()} kcal` },
    ];

    for (const s of SERIES) {
      const idx = chart.data.datasets.findIndex((d) => d?.label === s.label);
      if (idx === -1) return;
      const meta = chart.getDatasetMeta(idx);
      const ds = chart.data.datasets[idx];
      if (!meta?.data?.length) continue;

      // First non-null and last non-null point — skip nulls so a series
      // with leading/trailing gaps still gets meaningful endpoints.
      let firstI = -1;
      let lastI = -1;
      for (let i = 0; i < ds.data.length; i += 1) {
        if (ds.data[i]?.y != null) {
          if (firstI === -1) firstI = i;
          lastI = i;
        }
      }
      if (firstI === -1) continue;

      const color = ds.borderColor || ds.backgroundColor || '#999';
      const firstPt = meta.data[firstI];
      const lastPt = meta.data[lastI];
      if (!firstPt || !lastPt) continue;

      // Anchor pills at the chart edges so they never clip when the line
      // hugs the start/end of the range. Vertical position tracks each
      // endpoint so the label visually attaches to the line.
      const left = chart.chartArea.left + 24;
      const right = chart.chartArea.right - 24;
      drawPill(chart.ctx, s.fmt(ds.data[firstI].y), left, firstPt.y, color, false, 0);
      if (lastI !== firstI) {
        drawPill(chart.ctx, s.fmt(ds.data[lastI].y), right, lastPt.y, color, false, 0);
      }
    }
  },
};

// ---- Synchronized crosshair across charts -------------------------------
// Tracks one shared time value (ms since epoch) so that hovering or tapping
// any chart draws a vertical reference line at the same x on every chart in
// stacked layout, and propagates the tooltip activation to peer charts so
// the user sees readouts for every series at the same date — not just the
// chart they're directly hovering. The plugin tracks chart instances in a
// Set; when the shared value changes we manually call draw() on each peer
// (Chart.js doesn't auto-redraw siblings on a reactive change).
const crosshairTime = ref(null);
const crosshairCharts = new Set();

// Find the index in each visible dataset whose x is closest to time `t`.
// Used to drive peer-chart tooltips programmatically. Skips hidden helper
// datasets (`_injection:`) since the tooltip would filter them anyway.
function nearestItemsAtTime(chart, t) {
  const items = [];
  chart.data.datasets.forEach((ds, datasetIndex) => {
    if (!chart.isDatasetVisible(datasetIndex)) return;
    if (String(ds?.label || '').startsWith('_injection')) return;
    if (!ds.data?.length) return;
    let closestIndex = -1;
    let minDist = Infinity;
    ds.data.forEach((pt, i) => {
      const ptT = pt?.x instanceof Date ? pt.x.getTime() : pt?.x;
      if (!Number.isFinite(ptT)) return;
      const d = Math.abs(ptT - t);
      if (d < minDist) {
        minDist = d;
        closestIndex = i;
      }
    });
    if (closestIndex >= 0) items.push({ datasetIndex, index: closestIndex });
  });
  return items;
}

// Activate (or clear) a peer chart's tooltip at the shared crosshair time.
// The originating chart is left alone — Chart.js's native interaction
// resolves its own tooltip from the actual mouse event, and overwriting
// active elements there fights with that handler.
function syncPeerTooltip(chart, t) {
  if (!chart.tooltip?.setActiveElements) return;
  if (t == null) {
    chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    return;
  }
  const items = nearestItemsAtTime(chart, t);
  const xScale = chart.scales.x;
  if (!items.length || !xScale) {
    chart.tooltip.setActiveElements([], { x: 0, y: 0 });
    return;
  }
  const px = xScale.getPixelForValue(t);
  const firstMeta = chart.getDatasetMeta(items[0].datasetIndex);
  const firstEl = firstMeta?.data?.[items[0].index];
  const py = firstEl?.y ?? chart.chartArea.top + 20;
  chart.tooltip.setActiveElements(items, { x: px, y: py });
}

function setCrosshair(t, origin) {
  if (crosshairTime.value === t) return;
  crosshairTime.value = t;
  // Schedule peer updates so the originating chart's event handler can
  // finish before re-entering its render cycle. Peers use `update('none')`
  // (no animation, but a full update pass) — `draw()` alone only repaints
  // the current state and doesn't drive the tooltip controller through
  // show/move/hide, which causes peer tooltips to:
  //   - not appear on the first hover (controller never kicks in)
  //   - drift out of sync after the cursor pauses (caret never refreshes)
  //   - fail to clear on mouseout (hidden state never renders)
  // The originating chart only needs a redraw — Chart.js's native event
  // flow has already updated its tooltip from the real mouse event.
  requestAnimationFrame(() => {
    for (const c of crosshairCharts) {
      if (c === origin) {
        c.draw();
      } else {
        syncPeerTooltip(c, t);
        c.update('none');
      }
    }
  });
}

const crosshairPlugin = {
  id: 'crosshair',
  install(chart) {
    crosshairCharts.add(chart);
  },
  uninstall(chart) {
    crosshairCharts.delete(chart);
  },
  afterEvent(chart, args) {
    const event = args.event;
    if (!event) return;
    const xScale = chart.scales.x;
    if (!xScale) return;
    const move = ['mousemove', 'touchmove', 'touchstart', 'pointermove', 'pointerdown'];
    const exit = ['mouseout', 'mouseleave', 'touchend', 'touchcancel', 'pointerleave'];
    if (move.includes(event.type)) {
      // event.x is canvas-relative; clamp to plot area so the cursor doesn't
      // produce a value outside the chart bounds.
      const px = Math.max(chart.chartArea.left, Math.min(chart.chartArea.right, event.x));
      const v = xScale.getValueForPixel(px);
      if (Number.isFinite(v)) setCrosshair(v, chart);
    } else if (exit.includes(event.type)) {
      setCrosshair(null, chart);
    }
  },
  afterDraw(chart) {
    if (crosshairTime.value == null) return;
    const xScale = chart.scales.x;
    if (!xScale) return;
    const px = xScale.getPixelForValue(crosshairTime.value);
    if (!Number.isFinite(px)) return;
    if (px < chart.chartArea.left || px > chart.chartArea.right) return;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = cssVar('--text-tertiary', '#9ca3af');
    ctx.setLineDash([4, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, chart.chartArea.top);
    ctx.lineTo(px, chart.chartArea.bottom);
    ctx.stroke();
    ctx.restore();
  },
};

function drawPill(ctx, label, x, y, color, showTick, tickBottom) {
  ctx.save();
  const monoFamily = cssVar('--font-mono', 'ui-monospace, SFMono-Regular, Menlo, monospace');
  ctx.font = `bold 9px ${monoFamily}`;
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
  ctx.fillRect(px, py, w, h);

  ctx.fillStyle = contrastText(color);
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
  return { from: localYmd(from), to: localYmd(to) };
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
    metricsStore.fetchRangeLogs(from, to),
    notesStore.fetchRange(from, to),
  ]);
}

// Gate the chart on the first data load so we don't paint cached store
// values, then animate again when fresh data arrives. The chart only
// renders after every fetch in the Promise.all below has resolved.
const dataReady = ref(false);

onMounted(async () => {
  await Promise.all([
    weightStore.fetchEntries(),
    weightStore.fetchStats(),
    compoundsStore.fetchAll(),
    dosesStore.fetchEntries(),
    dosesStore.fetchPkCurves(),
    symptomsStore.fetchSymptoms(),
    symptomsStore.fetchLoggedDates(),
    metricsStore.fetchMetrics(),
    photosStore.fetchAll(),
    photoTypesStore.fetchPhotoTypes(),
    loadRangeData(),
    settingsStore.loaded ? Promise.resolve() : settingsStore.fetchSettings(),
    waterStore.fetchDay(localYmd()),
  ]);
  dataReady.value = true;

  if (!settingsStore.settings) {
    router.push('/profile');
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

// Build per-metric data: Map<metricId, [{date, value}]>. Stored in canonical
// units; conversion to display unit happens in getSeriesDataPoints so the
// per-metric `displayUnit` override is honored.
const metricDataById = computed(() => {
  const map = new Map();
  for (const log of metricsStore.rangeLogs) {
    const id = String(log.metricId);
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(log);
  }
  return map;
});

// Map<date, [{symptomId, name, severity}]> for the log-table symptom popover.
// Severity 0 means "explicitly none" — useful for charting trends but noisy
// in the popover, so filter those out and treat days with only-zero logs as
// having no symptoms at all (no dot).
const symptomsByDate = computed(() => {
  const nameById = new Map(symptomsStore.symptoms.map((s) => [String(s._id), s.name]));
  const map = new Map();
  for (const log of symptomsStore.rangeLogs) {
    if (log.severity < 1) continue;
    if (!map.has(log.date)) map.set(log.date, []);
    map.get(log.date).push({
      symptomId: log.symptomId,
      name: nameById.get(String(log.symptomId)) || 'Unknown',
      severity: log.severity,
    });
  }
  // Sort each day's list by descending severity so the worst items lead.
  for (const list of map.values()) list.sort((a, b) => b.severity - a.severity);
  return map;
});
function symptomsForDate(date) {
  return symptomsByDate.value.get(date) || [];
}
function severityColor(sev) {
  return `var(--palette-sev-${Math.max(0, Math.min(10, sev))})`;
}

// ---- Dynamic chart data -------------------------------------------------

function getSeriesDataPoints(def) {
  switch (def.id) {
    case 'weight':
      return filteredWeight.value.map((e) => ({ x: parseLocalDate(e.date), y: e.weightLbs }));
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
      if (def.metricId) {
        const logs = metricDataById.value.get(String(def.metricId)) || [];
        const unit = def.displayUnit;
        return logs.map((l) => ({
          x: parseLocalDate(l.date),
          y: fromCanonical(l.value, unit),
        }));
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

// Magnitude-aware rounding so trend tooltip values aren't drowning in
// decimals. Larger magnitudes get fewer decimals; small values keep two.
//   ≥ 1000  → 0 decimals (e.g., 2,480)
//   ≥ 100   → 1 decimal  (e.g., 215.3)
//   <  100  → 2 decimals (e.g., 12.34)
function smartRoundForTooltip(v) {
  if (!Number.isFinite(v)) return '';
  const abs = Math.abs(v);
  if (abs >= 1000) return Math.round(v).toLocaleString();
  if (abs >= 100) return v.toFixed(1);
  return v.toFixed(2);
}

// Linear-regression best-fit line across the series data, returned as a
// Chart.js dataset configured with a dashed style. Returns null if there
// aren't enough points to fit a line.
//
// We emit a trend point at every x in the source series (not just the two
// endpoints) so Chart.js's index-mode tooltip can pair a trend value with
// every hover position. With `tension: 0` the line is straight, so this is
// visually identical to a two-endpoint version.
function buildTrendLineDataset(data, { color, label, yAxisID }) {
  if (data.length < 2) return null;
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
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null; // all x identical → no slope
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const trendData = data.map((pt) => {
    const x = (pt.x.getTime() - t0) / 86400000;
    return { x: pt.x, y: intercept + slope * x };
  });
  return {
    label,
    data: trendData,
    borderColor: color,
    backgroundColor: 'transparent',
    fill: false,
    tension: 0,
    pointRadius: 0,
    borderWidth: 2,
    borderDash: [6, 4],
    yAxisID,
  };
}

// Build datasets for the given list of series defs. Trend defs render as
// dashed best-fit lines pulled from their source series's data; value defs
// render as the standard line/area dataset. Compound injection markers
// follow at the end so the pill plugin can find their data.
function buildChartData(defs) {
  const datasets = [];

  for (const def of defs) {
    if (def.isTrend) {
      const source = allSeries.value.find((s) => s.id === def.sourceSeriesId);
      if (!source) continue;
      const data = getSeriesDataPoints(source);
      const trend = buildTrendLineDataset(data, {
        color: def.color,
        label: `${source.label} trend`,
        yAxisID: def.axis,
      });
      if (trend) datasets.push(trend);
      continue;
    }

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
  }

  // Injection markers — one hidden dataset per compound so the pill plugin
  // can draw value/unit annotations at each dose point.
  for (const def of defs) {
    if (def.isTrend) continue;
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
}

const chartDataClean = computed(() => buildChartData(activeSeriesDefs.value));

// ---- Dynamic chart options ----------------------------------------------

const hasActiveCompound = computed(() =>
  activeSeriesDefs.value.some((s) => s.compoundId),
);

// Build chart options for the given list of series defs. Like buildChartData
// this is callable per-series (stacked layout) or with the full active list
// (overlay). `hideXAxis` skips x-axis ticks/border so stacked charts can hide
// duplicate date labels and only show them on the bottom chart. `stacked`
// switches the y-axis to a single right-aligned axis with grid + ticks
// (regardless of which series uses which `axis` id internally).
function buildChartOptions(defs, { hideXAxis = false, stacked = false } = {}) {
  const usedAxes = new Set(defs.map((s) => s.axis));
  const hasCompoundLocal = defs.some((s) => s.compoundId);
  const hasCaloriesLocal = defs.some((s) => s.id === 'calories');
  // Injection markers ride on yCal so they stay pinned at y=0 regardless of
  // the dose curve's own y-scale.
  if (hasCompoundLocal) usedAxes.add('yCal');

  // Reserve vertical headroom for one row of dose pills per compound IN THIS
  // CHART (in stacked layout each chart gets its own headroom).
  const compoundRows = defs.filter((s) => s.compoundId).length;
  const topPadding = compoundRows ? 24 + (compoundRows - 1) * 18 : 4;

  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    // Custom `nearestX` mode (registered above): one point per dataset,
    // nearest by x. Built-in `'index'` breaks with mismatched cadences
    // (dense PK curve indices outrun sparse weigh-in indices), and `'x'`
    // returns multiple points from dense series while skipping sparse ones
    // entirely.
    interaction: { mode: 'nearestX', intersect: false },
    // Multi-series time chart animation: snap x immediately so range/series
    // toggles don't slide points sideways (the default 1s easeOutQuart on x
    // makes lines warp as some points move horizontally before others). Only
    // y interpolates, with a short color tween for theme swaps. Hover and
    // resize stay instant.
    //
    // Stagger by datasetIndex so series cascade in instead of animating all
    // at once. Animation order = dataset order in `chartDataClean`, which
    // follows `activeSeriesDefs` order (driven by CORE_SERIES → compound →
    // symptom). To make a different series animate first, reorder CORE_SERIES
    // in this file. The stagger only applies to data updates (`mode:
    // 'default'`) — hover, resize, and theme color tweens stay synchronous.
    animation: {
      duration: 400,
      easing: 'easeOutQuart',
    },
    animations: {
      x: { duration: 0 },
      y: {
        duration: 400,
        easing: 'easeOutQuart',
        // Two-axis stagger: dataset-level (Cal → Pro → Fat → ...) plus
        // point-level so each series waves in left-to-right rather than
        // all points snapping together. Per-point step is capped so dense
        // PK curves (~150 points) don't drag past ~500ms total wave time;
        // short series (a few weigh-ins) still get a noticeable cascade.
        delay: (ctx) => {
          if (ctx.type !== 'data' || ctx.mode !== 'default') return 0;
          const n = ctx.chart.data.datasets[ctx.datasetIndex]?.data?.length || 1;
          const perPoint = Math.min(15, 500 / n);
          // Overlay needs more space between series so the cascade reads as
          // distinct lines arriving one after another. Stacked charts each
          // contain just a main + trend dataset, so a small stagger is plenty.
          const datasetStagger = stacked ? 40 : 200;
          return ctx.datasetIndex * datasetStagger + ctx.dataIndex * perPoint;
        },
      },
      colors: { duration: 250 },
    },
    transitions: {
      active: { animation: { duration: 0 } },
      resize: { animation: { duration: 0 } },
    },
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
        ticks: {
          display: !hideXAxis,
          // Cap tick density so the x-axis doesn't read as a wall of dates.
          // Mobile is tighter (4) since labels are rotated and plot width is
          // already constrained.
          maxTicksLimit: isMobile.value ? 4 : 8,
          autoSkipPadding: 16,
        },
        border: { display: !hideXAxis },
      },
    },
    plugins: {
      legend: { display: false }, // We use the chip bar instead.
      tooltip: {
        mode: 'nearestX',
        intersect: false,
        filter: (item) => !String(item.dataset?.label || '').startsWith('_injection'),
        callbacks: {
          // Smart-round trend lines so the regression's full-precision
          // floating-point output doesn't blow up the tooltip ("215.4837..."
          // → "215.5"). Real-data series keep the default localized format
          // since their values are already rounded by the store/server.
          label(item) {
            const label = String(item.dataset?.label || '');
            const v = item.parsed?.y;
            if (v == null) return label;
            const isTrend = label.endsWith('trend');
            const formatted = isTrend
              ? smartRoundForTooltip(v)
              : (typeof v === 'number' ? v.toLocaleString() : String(v));
            return `${label}: ${formatted}`;
          },
        },
      },
    },
  };

  const monoFamily = cssVar('--font-mono', 'ui-monospace, SFMono-Regular, Menlo, monospace');

  // ===== STACKED MODE =====
  // Single primary y-axis on the right with tick labels rendered INSIDE the
  // chart area so the line/area can extend edge-to-edge. `mirror: true` flips
  // labels from outside-right to inside-right; we hide the border and tick
  // marks so there's no axis "rail" visible. Title suppressed — each chart
  // has its own labeled heading above it.
  if (stacked && defs[0]) {
    const primary = defs[0].axis;
    const primaryAxisConfig = {
      position: 'right',
      title: { display: false },
      ticks: {
        display: !isMobile.value,
        font: { family: monoFamily },
        maxTicksLimit: 6,
        mirror: true,
        padding: 6,
        z: 1,
      },
      grid: {
        color: cssVar('--chart-grid', '#f3f4f6'),
        drawTicks: false,
        drawOnChartArea: true,
      },
      border: { display: false },
    };
    // y (weight) and yMetric (body measurements) auto-fit so small variations
    // around a high baseline (e.g. 90cm waist trending to 88cm) aren't visually
    // squashed against a hard zero.
    if (primary !== 'y' && primary !== 'yMetric') primaryAxisConfig.min = 0;
    if (primary === 'ySymptom') primaryAxisConfig.max = 10;
    if (primary === 'yScore') primaryAxisConfig.max = 100;
    if (primary === 'yCal' && tdee.value) {
      const cals = filteredNutrition.value.map((d) => d.calories);
      const maxCal = cals.length ? Math.max(...cals) : 0;
      primaryAxisConfig.max = Math.max(tdee.value + 100, maxCal + 100);
    }
    opts.scales[primary] = primaryAxisConfig;

    // Auxiliary axes — hidden, just there to satisfy datasets that reference
    // them (e.g., injection markers pinned to yCal at y=0).
    for (const ax of usedAxes) {
      if (ax === primary) continue;
      const aux = { position: 'right', display: false, grid: { drawOnChartArea: false } };
      if (ax !== 'y' && ax !== 'yMetric') aux.min = 0;
      if (ax === 'ySymptom') aux.max = 10;
      if (ax === 'yScore') aux.max = 100;
      opts.scales[ax] = aux;
    }
    return opts;
  }

  // ===== OVERLAY MODE =====
  // Left axis: weight (visible only when weight is active). On mobile, hide
  // the tick column + title; endpointLabelsPlugin draws first/last values
  // inline to free up horizontal plot width.
  if (usedAxes.has('y')) {
    opts.scales.y = {
      position: 'left',
      title: { display: !isMobile.value, text: 'lbs', color: cssVar('--chart-axis', '#9ca3af') },
      ticks: { display: !isMobile.value, font: { family: monoFamily }, maxTicksLimit: 6 },
      grid: { color: cssVar('--chart-grid', '#f3f4f6'), drawTicks: !isMobile.value },
      border: { display: !isMobile.value },
    };
  }

  // Right axis: calories (visible when calories is in this chart).
  if (usedAxes.has('yCal')) {
    opts.scales.yCal = {
      position: 'right',
      title: {
        display: !isMobile.value && hasCaloriesLocal,
        text: 'Calories',
        color: cssVar('--color-cal', '#3b82f6'),
      },
      ticks: { display: !isMobile.value, font: { family: monoFamily }, maxTicksLimit: 6 },
      grid: { drawOnChartArea: false, drawTicks: !isMobile.value },
      border: { display: !isMobile.value },
      min: 0,
    };
    if (tdee.value && hasCaloriesLocal) {
      const cals = filteredNutrition.value.map((d) => d.calories);
      const maxCal = cals.length ? Math.max(...cals) : 0;
      opts.scales.yCal.max = Math.max(tdee.value + 100, maxCal + 100);
    }
  }

  // Hidden axes for other unit groups.
  if (usedAxes.has('yGrams')) {
    opts.scales.yGrams = { position: 'right', display: false, grid: { drawOnChartArea: false }, min: 0 };
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
}

const chartOptions = computed(() => buildChartOptions(activeSeriesDefs.value));

// Stacked layout: one chart per active series, with x-axis labels only on
// the bottom-most chart so the dates don't repeat through the column.
// Stacked layout grouping: an active trend pairs onto its source series's
// chart so they render together (just like the previous auto-trend
// behavior). Trends whose source isn't active become their own chart.
const stackedCharts = computed(() => {
  const defs = activeSeriesDefs.value;
  const valueDefs = defs.filter((d) => !d.isTrend);
  const trendDefs = defs.filter((d) => d.isTrend);
  const valueIds = new Set(valueDefs.map((d) => d.id));

  const charts = [];
  for (const def of valueDefs) {
    const trend = trendDefs.find((t) => t.sourceSeriesId === def.id);
    charts.push({ def, defs: trend ? [def, trend] : [def] });
  }
  for (const trend of trendDefs) {
    if (!valueIds.has(trend.sourceSeriesId)) {
      charts.push({ def: trend, defs: [trend] });
    }
  }

  return charts.map((c, i) => ({
    def: c.def,
    data: buildChartData(c.defs),
    options: buildChartOptions([c.def], {
      stacked: true,
      hideXAxis: i < charts.length - 1,
    }),
  }));
});

const hasAnyData = computed(() => chartDataClean.value.datasets.length > 0);

// ---- Combined history table ---------------------------------------------

// The table shows one dose column per enabled compound. We track dose values
// by (date, compoundId) in a nested map so a day with multiple compounds
// logged doesn't collide on a single `dose` field.
const tableCompounds = computed(() => compoundsStore.enabled);

const LOG_INITIAL = 7;
const LOG_STEP = 15;
const logRowLimit = ref(LOG_INITIAL);

const allLogRows = computed(() => {
  const byDate = new Map();
  const ensure = (dateStr) => {
    if (!byDate.has(dateStr)) byDate.set(dateStr, {
      date: dateStr,
      weight: null,
      doses: {}, // compoundId → value
      cal: null, protein: null, fat: null, carbs: null, score: null,
      symptoms: false, note: null,
    });
    return byDate.get(dateStr);
  };

  for (const e of weightStore.entries) {
    ensure(String(e.date).slice(0, 10)).weight = e.weightLbs;
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

  return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date));
});

const logTableRows = computed(() => allLogRows.value.slice(0, logRowLimit.value));
const hasMoreLogRows = computed(() => allLogRows.value.length > logRowLimit.value);
function showMoreLogRows() {
  logRowLimit.value += LOG_STEP;
}


function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

// ETA to goal weight based on measured trend (regression) or weekly avg as
// fallback. Returns a display label + direction flag.
const etaToGoal = computed(() => {
  const stats = weightStore.stats;
  if (!stats || stats.toGoal == null) return null;
  const rate = stats.trendLbsPerWeek != null ? stats.trendLbsPerWeek : stats.weeklyAvg;
  const toGoal = Number(stats.toGoal);
  if (Math.abs(toGoal) < 0.1) return { label: 'At goal', good: true };
  if (rate == null || Math.abs(rate) < 0.05) return { label: 'Steady', good: false };
  // toGoal: + means need to lose, - means need to gain.
  const needLoss = toGoal > 0;
  const losing = rate < 0;
  if (needLoss !== losing) return { label: 'Wrong way', good: false };
  const weeks = Math.abs(toGoal) / Math.abs(rate);
  const days = weeks * 7;
  let label;
  if (days < 30) {
    const n = Math.round(days);
    label = `${n} ${n === 1 ? 'day' : 'days'}`;
  } else if (weeks < 10) {
    const n = weeks.toFixed(1);
    label = `${n} ${n === '1.0' ? 'week' : 'weeks'}`;
  } else {
    const n = (weeks / (52 / 12)).toFixed(1);
    label = `${n} ${n === '1.0' ? 'month' : 'months'}`;
  }
  return { label, good: true };
});

// Color helpers for the stat cards. Direction-sensitive stats (Total Change,
// % Change, Weekly Avg, Trend) compare to the user's goal direction so green
// = toward goal regardless of whether they're losing or gaining.
function goalDirectionClass(value) {
  if (value == null) return '';
  const toGoal = weightStore.stats?.toGoal;
  if (toGoal == null || Math.abs(Number(toGoal)) < 0.1) return '';
  if (Math.abs(value) < 0.05) return '';
  const needLoss = Number(toGoal) > 0;
  const moving = value < 0 ? 'lose' : 'gain';
  return (needLoss && moving === 'lose') || (!needLoss && moving === 'gain')
    ? 'green'
    : 'red';
}
function bmiClass(bmi) {
  const n = Number(bmi);
  if (!Number.isFinite(n)) return '';
  return n >= 18.5 && n < 25 ? 'green' : 'red';
}
</script>

<template>
  <div class="dashboard">
    <FastingBanner surface="dashboard" />

    <!-- Hydration summary -->
    <div v-if="waterCardVisible" class="water-summary-card" :class="{ hit: waterGoalHit }">
      <div class="water-summary-head">
        <span class="water-summary-label">Hydration today</span>
        <span class="water-summary-status">
          {{ waterGoalHit ? 'Goal hit ✓' : `${waterPct}%` }}
        </span>
      </div>
      <div class="water-summary-value">
        {{ waterTodayDisplay }}
        <span class="water-summary-target">/ {{ waterTargetDisplay }} {{ waterUnitLabel }}</span>
      </div>
      <div class="water-summary-bar">
        <div class="water-summary-bar-fill" :style="{ width: `${waterPct}%` }"></div>
      </div>
    </div>
    <!-- Weight stats grid -->
    <div v-if="weightStore.stats" class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">Current</span>
        <span class="stat-value"
          >{{ weightStore.stats.currentWeight }} lbs</span
        >
      </div>
      <div class="stat-card">
        <span class="stat-label">BMI</span>
        <span
          class="stat-value"
          :class="bmiClass(weightStore.stats.currentBMI)"
          >{{ weightStore.stats.currentBMI }}</span
        >
      </div>
      <div class="stat-card">
        <span class="stat-label">Total Change</span>
        <span
          class="stat-value"
          :class="goalDirectionClass(weightStore.stats.totalChange)"
        >
          {{ weightStore.stats.totalChange > 0 ? '+' : ''













          }}{{ weightStore.stats.totalChange }} lbs
        </span>
      </div>
      <div class="stat-card">
        <span class="stat-label">% Change</span>
        <span
          class="stat-value"
          :class="goalDirectionClass(weightStore.stats.percentChange)"
          >{{ weightStore.stats.percentChange }}%</span
        >
      </div>
      <div class="stat-card">
        <span class="stat-label">Weekly Avg</span>
        <span
          class="stat-value"
          :class="goalDirectionClass(weightStore.stats.weeklyAvg)"
          >{{ weightStore.stats.weeklyAvg }} lbs/wk</span
        >
      </div>
      <div v-if="weightStore.stats.trendLbsPerWeek != null" class="stat-card">
        <span
          class="stat-label"
          v-tooltip="'Best-fit slope across all weigh-ins (linear regression)'"
          >Trend</span
        >
        <span
          class="stat-value"
          :class="goalDirectionClass(weightStore.stats.trendLbsPerWeek)"
        >
          {{ weightStore.stats.trendLbsPerWeek > 0 ? '+' : ''













          }}{{ weightStore.stats.trendLbsPerWeek }} lbs/wk
        </span>
      </div>
      <div v-if="etaToGoal" class="stat-card">
        <span
          class="stat-label"
          v-tooltip="'Estimated time to goal at current trend'"
          >ETA</span
        >
        <span class="stat-value" :class="etaToGoal.good ? 'green' : ''">
          {{ etaToGoal.label }}
        </span>
      </div>
      <div v-if="weightStore.stats.toGoal != null" class="stat-card">
        <span class="stat-label">To Goal</span>
        <span class="stat-value">{{ weightStore.stats.toGoal }} lbs</span>
      </div>
    </div>

    <!-- Rolling 7-day budget -->
    <div
      v-if="planLimits.hasFeature('rolling7DayTargets')"
      class="card weekly-card"
    >
      <WeeklyBudgetStrip :default-expanded="true" />
    </div>
    <button
      v-else-if="rolling7DayUpgradeTier"
      type="button"
      class="card weekly-upsell"
      @click="upgradeModal.openForGate({ featureKey: 'rolling7DayTargets' })"
    >
      <span class="weekly-upsell-label">
        Rolling 7-day macro targets
        <UpgradeBadge :tier="rolling7DayUpgradeTier" />
      </span>
      <span class="weekly-upsell-sub">
        Smooth out weekly variance — over today, under tomorrow, still on plan.
      </span>
    </button>

    <!-- Chart -->
    <div class="card chart-section">
      <div class="chart-controls">
        <div class="range-buttons">
          <button
            v-for="r in ranges"
            :key="r.label"
            :class="{ active: selectedRange.label === r.label }"
            @click="selectedRange = r"
          >
            {{ r.label }}
          </button>
        </div>
        <div class="range-buttons layout-toggle">
          <button
            :class="{ active: chartLayout === 'overlay' }"
            title="Show all series on a single chart"
            @click="chartLayout = 'overlay'"
          >
            Overlay
          </button>
          <button
            :class="{ active: chartLayout === 'stacked' }"
            title="Show each series on its own chart"
            @click="chartLayout = 'stacked'"
          >
            Stacked
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
          <span
            class="chip-dot"
            :class="{ 'chip-dot-trend': def.isTrend }"
            :style="def.isTrend
              ? { borderColor: def.color }
              : { background: def.color }"
          />
          {{ def.label }}
          <span class="chip-x">×</span>
        </button>
        <VDropdown placement="bottom-start" :distance="6">
          <button class="chip chip-add">+ Add</button>
          <template #popper>
            <div class="popover">
              <div
                v-if="Number.isFinite(seriesCap)"
                class="pop-cap-note"
                :class="{ 'at-cap': atSeriesCap }"
              >
                {{ activeSeries.size }} / {{ seriesCap }} series
                <UpgradeBadge
                  v-if="seriesUpgradeTier"
                  :tier="seriesUpgradeTier"
                  limit-key="maxCorrelationMetrics"
                  clickable
                />
              </div>
              <div
                v-for="[cat, items] in seriesByCategory"
                :key="cat"
                class="pop-group"
              >
                <div class="pop-cat">{{ cat }}</div>
                <label
                  v-for="s in items"
                  :key="s.id"
                  class="pop-item"
                  :class="{ disabled: atSeriesCap && !activeSeries.has(s.id) }"
                >
                  <input
                    type="checkbox"
                    :checked="activeSeries.has(s.id)"
                    @change="toggleSeries(s.id)"
                  />
                  <span
                    class="pop-dot"
                    :class="{ 'pop-dot-trend': s.isTrend }"
                    :style="s.isTrend
                      ? { borderColor: s.color }
                      : { background: s.color }"
                  />
                  {{ s.label }}
                </label>
              </div>
            </div>
          </template>
        </VDropdown>
      </div>

      <!-- Overlay: single multi-series chart. -->
      <div
        v-if="chartLayout === 'overlay'"
        class="chart-container"
        @mousemove="onChartMouseMove"
        @mouseleave="onChartMouseLeave"
      >
        <Line
          v-if="dataReady && hasAnyData"
          :data="chartDataClean"
          :options="chartOptions"
          :plugins="[pillLabelsPlugin, noteIconsPlugin, endpointLabelsPlugin, crosshairPlugin]"
        />
        <p v-else-if="!dataReady" class="empty">Loading…</p>
        <p v-else class="empty">Select a series above to view data.</p>
        <div
          v-if="hoveredNote"
          class="popover note-popover note-chart-popover"
          :style="{ left: hoveredNote.x + 'px', top: hoveredNote.y + 'px' }"
        >
          <div class="note-pop-title">
            Note · {{ formatDate(hoveredNote.date) }}
          </div>
          <div class="note-pop-text">{{ hoveredNote.text }}</div>
        </div>
      </div>

      <!-- Stacked: one chart per active series, sharing the date range. -->
      <div v-else class="stacked-charts">
        <p v-if="!dataReady" class="empty">Loading…</p>
        <p v-else-if="!stackedCharts.length" class="empty">
          Select a series above to view data.
        </p>
        <div
          v-for="(c, i) in stackedCharts"
          :key="c.def.id"
          v-show="dataReady"
          class="stacked-chart"
        >
          <div class="stacked-chart-head">
            <span class="chip-dot" :style="{ background: c.def.color }" />
            <span class="stacked-chart-title">{{ c.def.label }}</span>
          </div>
          <div
            class="chart-container chart-container-small"
            :class="{ 'chart-container-tail': i === stackedCharts.length - 1 }"
          >
            <Line
              :data="c.data"
              :options="c.options"
              :plugins="[pillLabelsPlugin, noteIconsPlugin, endpointLabelsPlugin, crosshairPlugin]"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- Insights — engine-default 90d window. Each finding renders its
         own isolated chart in-place when expanded, so the user sees the
         exact two series and range backing the claim without us having
         to mutate the main chart above. Always rendered so users get the
         "need more data" empty state on day 1 instead of a missing
         surface. -->
    <InsightsCard />

    <!-- Progress photos timeline -->
    <PhotoTimelineCard v-if="photosVisibleOnDashboard" />

    <!-- Combined log history -->
    <div class="card">
      <h3>Log History</h3>
      <div class="table-wrap">
        <table v-if="logTableRows.length" class="log-table">
          <thead>
            <tr>
              <th class="lt-date"></th>
              <th class="lt-num">Weight</th>
              <th
                v-for="c in tableCompounds"
                :key="c._id"
                class="lt-num"
                :style="{ color: c.color || '' }"
              >
                {{ c.name }}
              </th>
              <th class="lt-num lt-cal">Kcal</th>
              <th class="lt-num lt-pro">Pro</th>
              <th class="lt-num lt-fat">Fat</th>
              <th class="lt-num lt-carb">Carbs</th>
              <th class="lt-num lt-score">Score</th>
              <th class="lt-sym">Symptoms</th>
              <th class="lt-note">Note</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in logTableRows"
              :key="row.date"
              class="lt-row"
              @click="router.push(`/?date=${row.date}`)"
            >
              <td class="lt-date">{{ formatDate(row.date) }}</td>
              <td class="lt-num">
                {{ row.weight != null ? `${row.weight} lb` : '' }}
              </td>
              <td
                v-for="c in tableCompounds"
                :key="c._id"
                class="lt-num lt-dose"
              >
                <span
                  v-if="row.doses[c._id] != null"
                  class="dose-tag"
                  :style="{ background: c.color || 'var(--border)', color: contrastText(c.color) }"
                  >{{ row.doses[c._id] }}{{ c.doseUnit }}</span
                >
              </td>
              <td class="lt-num lt-cal">
                {{ row.cal != null ? row.cal.toLocaleString() : '' }}
              </td>
              <td class="lt-num lt-pro">
                {{ row.protein != null ? `${row.protein}g` : '' }}
              </td>
              <td class="lt-num lt-fat">
                {{ row.fat != null ? `${row.fat}g` : '' }}
              </td>
              <td class="lt-num lt-carb">
                {{ row.carbs != null ? `${row.carbs}g` : '' }}
              </td>
              <td
                class="lt-num lt-score"
                :class="row.score != null ? (row.score >= 85 ? 'score-good' : row.score >= 60 ? 'score-ok' : 'score-bad') : ''"
              >
                {{ row.score != null ? row.score : '' }}
              </td>
              <td class="lt-sym">
                <VDropdown
                  v-if="symptomsForDate(row.date).length"
                  :triggers="['hover', 'focus']"
                  :popper-triggers="['hover']"
                  :delay="{ show: 100, hide: 100 }"
                  placement="left"
                  :distance="8"
                >
                  <span
                    class="sym-dot"
                    :style="{ background: severityColor(symptomsForDate(row.date)[0].severity) }"
                  />
                  <template #popper>
                    <div class="popover sym-popover">
                      <div class="sym-pop-title">
                        Symptoms · {{ formatDate(row.date) }}
                      </div>
                      <ul class="sym-pop-list">
                        <li
                          v-for="s in symptomsForDate(row.date)"
                          :key="s.symptomId"
                        >
                          <span
                            class="sym-pop-sev"
                            :style="{ color: severityColor(s.severity) }"
                            >{{ s.severity }}</span
                          >
                          <span class="sym-pop-name">{{ s.name }}</span>
                        </li>
                      </ul>
                    </div>
                  </template>
                </VDropdown>
              </td>
              <td class="lt-note">
                <VDropdown
                  v-if="row.note"
                  :triggers="['hover', 'focus']"
                  :popper-triggers="['hover']"
                  :delay="{ show: 100, hide: 100 }"
                  placement="left"
                  :distance="8"
                >
                  <span class="note-icon" @click.stop>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-label="Note"
                    >
                      <path
                        d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"
                      />
                      <path d="m15 5 4 4" />
                    </svg>
                  </span>
                  <template #popper>
                    <div class="popover note-popover">
                      <div class="note-pop-title">
                        Note · {{ formatDate(row.date) }}
                      </div>
                      <div class="note-pop-text">{{ row.note }}</div>
                    </div>
                  </template>
                </VDropdown>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="empty">No entries yet.</p>
      </div>
      <div v-if="hasMoreLogRows" class="log-more-wrap">
        <button type="button" class="log-more-btn" @click="showMoreLogRows">
          Show more
        </button>
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
/* Wrapper deliberately renders no padding — the inner WeeklyBudgetStrip
   header/body provide their own. The mobile global .card rule otherwise
   bumps padding to var(--space-5), which would nest with the inner padding. */
.weekly-card { padding: 0 !important; overflow: hidden; }
.weekly-upsell {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  width: 100%;
  text-align: left;
  font-family: inherit;
  cursor: pointer;
  color: var(--text-secondary);
  border: 1px dashed var(--border);
  background: var(--surface);
  padding: 14px 18px;
  transition: border-color 0.15s ease;
}
.weekly-upsell:hover { border-color: var(--primary); }
.weekly-upsell-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: 0.02em;
}
.weekly-upsell-sub { font-size: 12px; }
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
  .stats-grid {
    grid-template-columns: repeat(2, 1fr);
    /* Section cards above/below this grid go edge-to-edge on mobile,
       so the stat tiles need their own horizontal inset to avoid hugging
       the screen edges. */
    padding: 0 var(--space-4);
  }
}
.stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-3) var(--space-4);
}
.stat-label {
  display: block;
  font-family: var(--font-display);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.stat-value {
  display: block;
  font-family: var(--font-display);
  font-size: var(--font-size-l);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
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
  flex-wrap: wrap;
  gap: var(--space-2);
  margin-bottom: var(--space-2);
}
.range-buttons {
  display: inline-flex;
  border: 1px solid var(--border);
  background: var(--bg);
  padding: 2px;
  gap: 2px;
  font-family: var(--font-display);
}
.range-buttons button {
  padding: 0.25rem 0.65rem;
  background: none;
  border: none;
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast);
}
.range-buttons button:hover { color: var(--text); }
.range-buttons button.active {
  background: var(--surface-raised);
  color: var(--text);
  font-weight: var(--font-weight-medium);
  box-shadow: var(--shadow-s);
}

/* Chip bar */
.chip-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-1);
  margin-bottom: var(--space-3);
  position: relative;
  font-family: var(--font-display);
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-2);
  border: 1px solid transparent;
  border-radius: var(--radius-small);
  background: var(--surface-raised);
  cursor: pointer;
  font-size: var(--font-size-xs);
  color: var(--text);
  transition: background var(--transition-fast), color var(--transition-fast), border-color var(--transition-fast);
  white-space: nowrap;
}
.chip:hover { background: var(--primary-soft); color: var(--text); border-color: var(--text-secondary); }
.chip:hover .chip-x { color: var(--text); }
.chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
/* Trend variant: hollow circle with a dashed border in the source's color,
   echoing the dashed line style. */
.chip-dot-trend {
  background: transparent !important;
  border: 1.5px dashed currentColor;
  width: 10px;
  height: 10px;
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
.pop-cap-note {
  font-size: 11px;
  color: var(--text-tertiary);
  padding: 4px 6px 8px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}
.pop-cap-note.at-cap { color: var(--primary); }
.pop-item.disabled {
  opacity: 0.45;
}
.pop-item.disabled:hover { background: transparent; }
.popover {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  box-shadow: var(--shadow-m);
  padding: var(--space-3);
  min-width: 240px;
  /* Two-column layout via CSS `columns: 2` was clipping items past the
     overflow boundary once each value series got a trend companion (~2x
     the item count). Switch to a single-column scrollable list — taller
     popover, but every category is reachable. */
  max-height: 70vh;
  overflow-y: auto;
}
.pop-group {
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
.pop-dot-trend {
  background: transparent !important;
  border: 1.5px dashed currentColor;
  width: 9px;
  height: 9px;
}

.chart-container { height: 360px; position: relative; }

/* Stacked layout — one chart per active series. Each chart has a small
   colored heading + a shorter container. The bottom-most chart keeps its
   x-axis ticks (set via :hideXAxis in the options builder); the rest hide
   theirs to avoid date-label repetition. */
.stacked-charts { display: flex; flex-direction: column; gap: var(--space-3); }
.stacked-chart-head {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-bottom: var(--space-1);
}
.stacked-chart-title {
  font-family: var(--font-display);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-secondary);
  font-weight: var(--font-weight-bold);
}
.chart-container-small { height: 180px; }
/* The bottom chart shows the x-axis labels, which need an extra ~24px so
   they don't get clipped. */
.chart-container-tail { height: 200px; }

/* Right-align the layout (Overlay / Stacked) toggle next to the range
   buttons. The chart-controls flex container already has space-between, so
   pushing the toggle to its right edge just needs a left margin to absorb
   any remaining space. */
.layout-toggle { margin-left: auto; }

.note-chart-popover {
  position: absolute;
  transform: translate(-50%, calc(-100% - 14px));
  pointer-events: none;
  z-index: 20;
}

.table-wrap {
  position: relative;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
.table-wrap .log-table { min-width: max-content; }
.log-more-wrap {
  display: flex;
  justify-content: center;
  margin-top: var(--space-3);
}
.log-more-btn {
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--font-size-s);
  padding: var(--space-2) var(--space-4);
  transition: border-color var(--transition-fast), color var(--transition-fast);
}
.log-more-btn:hover {
  border-color: var(--primary);
  color: var(--text);
}
.note-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: help;
  color: var(--text-tertiary);
  transition: color var(--transition-fast);
}
.note-icon:hover { color: var(--text); }
.note-icon svg { width: 14px; height: 14px; display: block; }

/* Log history table */
.log-table {
  width: 100%;
  border-collapse: collapse;
  font-size: var(--font-size-xs);
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
.log-table td.lt-date { text-align: left; white-space: nowrap; color: var(--text-tertiary); text-transform: uppercase; letter-spacing: var(--tracking-wide); font-weight: var(--font-weight-medium); font-family: var(--font-display); }
.lt-num { text-align: right; white-space: nowrap; }
.dose-tag {
  display: inline-block;
  padding: 1px 6px;
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums;
  letter-spacing: var(--tracking-tight);
  line-height: 1.4;
}
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
.lt-sym { text-align: center; width: 4rem; }
.lt-note { text-align: center; width: 3rem; }
.sym-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-secondary);
  cursor: default;
}
.sym-popover {
  min-width: 200px;
  padding: var(--space-3) var(--space-4);
  background: var(--surface-raised);
  border: 1px solid var(--border);
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--font-size-s);
  box-shadow: var(--shadow-m);
  columns: auto;
}
.sym-pop-title {
  font-family: var(--font-display);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  margin-bottom: var(--space-2);
}
.sym-pop-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sym-pop-list li {
  font-size: var(--font-size-s);
  line-height: 1.4;
}
.sym-pop-sev {
  font-family: var(--font-mono);
  font-weight: var(--font-weight-bold);
  font-variant-numeric: tabular-nums;
  margin-right: 6px;
  background: none;
  padding: 0;
}
.sym-pop-name { color: var(--text); }

.note-popover {
  min-width: 220px;
  max-width: 320px;
  padding: var(--space-3) var(--space-4);
  background: var(--surface-raised);
  border: 1px solid var(--border);
  color: var(--text);
  font-family: var(--font-body);
  font-size: var(--font-size-s);
  box-shadow: var(--shadow-m);
  columns: auto;
}
.note-pop-title {
  font-family: var(--font-display);
  font-size: var(--font-size-xs);
  font-weight: var(--font-weight-bold);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  color: var(--text-tertiary);
  margin-bottom: var(--space-2);
}
.note-pop-text {
  color: var(--text);
  line-height: 1.5;
  white-space: pre-wrap;
}

.empty { color: var(--text-secondary); font-size: var(--font-size-s); text-align: center; padding: var(--space-6) 0; }

/* Hydration summary card on the dashboard. Mirrors stat-card spacing but
   foregrounds a progress bar since hydration is a cumulative-toward-goal
   metric, not a discrete value. */
.water-summary-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  padding: var(--space-4) var(--space-5);
  margin-bottom: var(--space-3);
}
.water-summary-card.hit {
  border-color: color-mix(in srgb, var(--success, #16a34a) 60%, var(--border));
}
.water-summary-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: var(--space-2);
}
.water-summary-label {
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-widest);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-bold);
}
.water-summary-status {
  font-size: var(--font-size-s);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.water-summary-card.hit .water-summary-status {
  color: var(--success, #16a34a);
  font-weight: var(--font-weight-bold);
}
.water-summary-value {
  font-size: var(--font-size-xxl, 1.75rem);
  font-weight: var(--font-weight-bold);
  color: var(--text);
  font-variant-numeric: tabular-nums;
  margin-bottom: var(--space-2);
}
.water-summary-target {
  font-size: var(--font-size-s);
  color: var(--text-tertiary);
  font-weight: var(--font-weight-medium);
  margin-left: 4px;
}
.water-summary-bar {
  height: 6px;
  background: var(--bg);
  border-radius: 999px;
  overflow: hidden;
}
.water-summary-bar-fill {
  height: 100%;
  background: var(--water, #06b6d4);
  border-radius: 999px;
  transition: width 240ms ease;
}
</style>
