<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import SignalChart from '../components/SignalChart.vue';
// SignalChart registers Chart.js elements + the custom nearestX
// interaction mode internally; the dashboard inherits both via the
// component import.
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
import { useExerciseLogStore } from '../stores/exerciselog.js';
import { usePhotosStore } from '../stores/photos.js';
import { useWaterStore, mlToUnit } from '../stores/water.js';
import { computeNutritionScore } from '../../../shared/logging/nutritionScore.js';
import { contrastText } from '../utils/contrast.js';
import WeeklyBudgetStrip from '../components/WeeklyBudgetStrip.vue';
import InsightsCard from '../components/InsightsCard.vue';
import PhotoTimelineCard from '../components/PhotoTimelineCard.vue';
import UpgradeBadge from '../components/UpgradeBadge.vue';
import FastingBanner from '../components/FastingBanner.vue';
import { usePlanLimits } from '../composables/usePlanLimits.js';
import { useUpgradeModalStore } from '../stores/upgradeModal.js';
import { useEndogenousSim } from '../composables/useEndogenousSim.js';
import { useChartSeries } from '../composables/useChartSeries.js';
import { localYmd } from '../utils/date.js';
import { getAllUnifiedDefinitions } from '@kyneticbio/core';

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
const insightsEnabled = computed(
  () => settingsStore.settings?.insights?.enabled !== false,
);
const notesStore = useNotesStore();
const compoundsStore = useCompoundsStore();
const dosesStore = useDosesStore();
const exerciseLogStore = useExerciseLogStore();
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
// Chart.js font registration now lives inside SignalChart, so the
// dashboard only needs to track the theme tick (for chip colors etc.)
// and the mobile breakpoint (still used by the endpointLabelsPlugin).
let themeObserver = null;

const isMobile = ref(false);
let mobileMql = null;
function syncMobile() {
  if (typeof window === 'undefined') return;
  isMobile.value = window.matchMedia('(max-width: 768px)').matches;
}

onMounted(() => {
  themeObserver = new MutationObserver(() => {
    themeTick.value += 1;
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
//
// Series catalog + per-def data resolution live in the shared composable
// (client/src/composables/useChartSeries.js) so the dashboard, the log
// page, and the agent share one source of truth. The dashboard wraps
// the resolver with its own range filter (filterByRange) for backward
// compatibility with the inline chart code below; once that chart is
// also migrated to <SignalChart>, range filtering moves into the
// component and this wrapper goes away.
const chartSeries = useChartSeries();
const allSeries = chartSeries.allSeries;
const seriesByCategory = chartSeries.seriesByCategory;

// ---- Active series (persisted to localStorage) --------------------------

// Default active series for the dashboard chart. SignalChart manages
// the active-series Set + layout + range internally now and persists
// them under `dashboard-chart:*` localStorage keys.
const DEFAULT_ACTIVE_DASHBOARD = ['weight', 'weight-trend', 'calories', 'dosage'];

// Cap for simultaneously-selected chart series. Free=2, paid=∞.
const seriesCap = computed(() => planLimits.storageCap('maxCorrelationMetrics'));
const seriesUpgradeTier = computed(() => {
  const target = planLimits.planRequiredFor({ storageKey: 'maxCorrelationMetrics' });
  return target?.id || null;
});

// Mirror of SignalChart's active set so derivations (activeEndoSignals)
// remain reactive without poking at localStorage.
const localActiveSeries = ref(new Set(DEFAULT_ACTIVE_DASHBOARD));
function onChartActiveChange(ids) {
  localActiveSeries.value = new Set(ids);
}

// Plugins shown alongside the chart's built-in tooltip / interaction.
// Wrapped in a computed because the plugin consts are declared later in
// this file — referencing them at module scope here would TDZ.
// crosshairPlugin is now built into SignalChart (used on every page),
// so the dashboard only contributes its page-specific annotation
// plugins here.
const dashboardChartPlugins = computed(() => [
  pillLabelsPlugin,
  noteIconsPlugin,
  endpointLabelsPlugin,
]);

// Build invisible injection-marker datasets for compounds the user
// has on the chart. The pillLabelsPlugin renders dose pills against
// these (via `_injection:` label prefix). Color carried via
// `pillColor` so the plugin stays self-contained.
function injectDashboardDatasets(activeDefs) {
  const datasets = [];
  for (const def of activeDefs) {
    if (def.isTrend) continue;
    if (!def.compoundRefKey) continue;
    const doses = filteredDosesFor(def.compoundRefKey);
    if (!doses.length) continue;
    datasets.push({
      label: `_injection:${def.compoundRefKey}`,
      pillColor: def.color,
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
  return datasets;
}

// Dashboard-only axis tweak: cap yCal high enough to expose TDEE +
// the largest logged-calorie day, so the calorie line never grazes
// the top edge.
function dashboardAxisCustomizer(opts, defs, { stacked }) {
  if (stacked) return;
  const tdeeVal = settingsStore.settings?.tdee;
  const hasCalories = defs.some((d) => d.id === 'calories');
  if (!tdeeVal || !hasCalories || !opts.scales.yCal) return;
  const cals = (foodLogStore.dailyNutrition || []).map((d) => d.calories);
  const maxCal = cals.length ? Math.max(...cals) : 0;
  opts.scales.yCal.max = Math.max(tdeeVal + 100, maxCal + 100);
}

// Bridge SignalChart's range to the dashboard's loadRangeData /
// filterByRange / endo-sim. SignalChart emits the {from, to} window;
// we translate to the matching `ranges[]` option (by day-span match)
// so the existing day-based filters keep working unchanged.
function onChartRangeChange(range) {
  if (!range) return;
  const days = Math.round(
    (range.to.getTime() - range.from.getTime()) / 86_400_000,
  );
  const match = ranges.find((r) => r.days === days);
  if (match && selectedRange.value !== match) {
    selectedRange.value = match;
  }
}


// ---- Chart plugins (dose pills) -----------------------------------------

// Self-contained: reads `_injection:*` datasets straight off the chart
// (the inject-datasets prop on SignalChart is what puts them there) so
// the plugin doesn't depend on the page's reactive state. Color +
// dose value/unit travel on the dataset/point themselves.
const pillLabelsPlugin = {
  id: 'pillLabels',
  afterDatasetsDraw(chart) {
    const ctx = chart.ctx;
    const injectionDatasets = [];
    chart.data.datasets.forEach((ds, idx) => {
      if (String(ds?.label || '').startsWith('_injection:')) {
        injectionDatasets.push({ ds, idx });
      }
    });
    if (!injectionDatasets.length) return;
    const topBase = chart.chartArea.top + 14;
    injectionDatasets.forEach(({ ds, idx }, row) => {
      const meta = chart.getDatasetMeta(idx);
      if (!meta?.data?.length) return;
      const color = ds.pillColor || ds.borderColor || ds.backgroundColor || '#999';
      const y = topBase + row * 18;
      meta.data.forEach((point, i) => {
        const v = ds.data[i]?.value;
        const u = ds.data[i]?.unit;
        if (v == null) return;
        drawPill(ctx, `${v}${u}`, point.x, y, color, true, chart.chartArea.bottom);
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

// Crosshair plugin moved to client/src/components/chart-plugins/
// crosshairPlugin.js and is registered by SignalChart for every chart
// instance on the page (dashboard + log + future). No page-level
// scaffolding needed.

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

// Returns BOTH local Date instances and YYYY-MM-DD strings for the
// window. The sim composable consumes Dates (so the end-of-window is
// genuinely "now" in user-local time, not UTC midnight of "today" —
// which would render as 8pm ET / 5pm PT, visibly truncated). The
// daily-aggregate fetchers consume the YMD strings.
function rangeDates(days) {
  const to = new Date();
  const from = new Date();
  if (days) from.setDate(from.getDate() - days);
  else from.setFullYear(from.getFullYear() - 5);
  return {
    from,
    to,
    fromYmd: localYmd(from),
    toYmd: localYmd(to),
  };
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
  const { fromYmd, toYmd } = rangeDates(selectedRange.value.days);
  const from = fromYmd;
  const to = toYmd;
  await Promise.all([
    foodLogStore.fetchDailyNutrition(from, to),
    symptomsStore.fetchRangeLogs(from, to),
    metricsStore.fetchRangeLogs(from, to),
    notesStore.fetchRange(from, to),
    // Cheap aggregator query — one row per day with totals. Always
    // fetched so the user toggling the burn series later doesn't pay
    // for a refetch.
    exerciseLogStore.fetchRangeBurn(from, to),
  ]);
  await maybeRunEndoSim();
}

// ---- Endogenous-signal simulation (experimental) ------------------------
//
// Re-runs whenever the active set toggles an endo signal on, or the date
// range changes. No caching for v1 — each trigger refetches meals and
// re-simulates the full window. Cap at 60 days to keep the test bounded;
// longer ranges short-circuit until we measure perf and decide on chunking.
// Use the chart composable's endoSim instance so the resolver and
// the dashboard share one set of result refs (the underlying worker is
// already a module-level singleton; the reactive state isn't).
const endoSim = chartSeries.endoSim;
const ENDO_MAX_DAYS = 60;

// Extract the underlying signal keys for any active endo entry, including
// trend variants (`endo:glucose-trend` resolves to `glucose` so a trend-only
// selection still triggers the sim and the value series feeds the trend
// regression). Deduped so the worker doesn't compute the same signal twice.
const activeEndoSignals = computed(() => {
  const out = new Set();
  for (const id of localActiveSeries.value) {
    if (!id.startsWith('endo:')) continue;
    const key = id.slice(5).replace(/-trend$/, '');
    out.add(key);
  }
  return [...out];
});

// Kick a server-side sim run for the active signals + selected range.
// Subject + conditions live on the server (UserSettings) and the
// checkpoint is invalidated automatically by settings/log mutations
// (see server/src/sim/invalidationHooks.js), so the client only sends
// {from, to, signals}.
async function maybeRunEndoSim() {
  const signals = activeEndoSignals.value;
  if (!signals.length) return;
  const days = selectedRange.value.days;
  if (days != null && days > ENDO_MAX_DAYS) return;
  const { from, to } = rangeDates(Math.min(days ?? ENDO_MAX_DAYS, ENDO_MAX_DAYS));
  await endoSim.run({ from, to, signals });
}

// Immediate so the very first activeEndoSignals (populated when
// SignalChart emits its persisted active set on mount) kicks the sim
// without waiting for a second change.
watch(activeEndoSignals, maybeRunEndoSim, { immediate: true });

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

const filteredNutrition = computed(() => foodLogStore.dailyNutrition || []);
// Polymorphic ref lookup. `ref` is either a custom compound _id or
// a `core:<key>` token built from the canonical intervention key.
function filteredDosesFor(ref) {
  const all = dosesStore.entries.filter((d) => {
    if (typeof ref === 'string' && ref.startsWith('core:')) {
      return d.coreInterventionKey === ref.slice('core:'.length);
    }
    return d.compoundId === ref;
  });
  if (!selectedRange.value.days) return all;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - selectedRange.value.days);
  return all.filter((d) => new Date(d.date) >= cutoff);
}

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

// Range-aware wrapper around the shared resolver. The shared composable
// returns full-history points; the inline chart below pre-filters to
// the selected range so we don't change buildChartData's contract. Once
// the chart migrates to <SignalChart>, range filtering moves into the
// component and this wrapper can be dropped in favor of
// chartSeries.getDataPoints directly.
function getSeriesDataPoints(def) {
  const pts = chartSeries.getDataPoints(def);
  if (!pts?.length) return [];
  if (!selectedRange.value?.days) return pts;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - selectedRange.value.days);
  return pts.filter((p) => (p.x instanceof Date ? p.x : new Date(p.x)) >= cutoff);
}

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
      doses: {}, // compoundRefKey → value (custom mongo-id OR `core:<key>`)
      cal: null, protein: null, fat: null, carbs: null, score: null,
      symptoms: false, note: null,
    });
    return byDate.get(dateStr);
  };

  for (const e of weightStore.entries) {
    ensure(String(e.date).slice(0, 10)).weight = e.weightLbs;
  }
  for (const e of dosesStore.entries) {
    // Canonical compounds have no compoundId — use the same ref-key the
    // doses store builds so custom + canonical doses share a namespace.
    const k = dosesStore.refKeyFor(e);
    if (!k) continue;
    ensure(String(e.date).slice(0, 10)).doses[k] = e.value;
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
    <div
      v-if="waterCardVisible"
      class="water-summary-card"
      :class="{ hit: waterGoalHit }"
    >
      <div class="water-summary-head">
        <span class="water-summary-label">Hydration today</span>
        <span class="water-summary-status">
          {{ waterGoalHit ? 'Goal hit ✓' : `${waterPct}%` }}
        </span>
      </div>
      <div class="water-summary-value">
        {{ waterTodayDisplay }}
        <span class="water-summary-target"
          >/ {{ waterTargetDisplay }} {{ waterUnitLabel }}</span
        >
      </div>
      <div class="water-summary-bar">
        <div
          class="water-summary-bar-fill"
          :style="{ width: `${waterPct}%` }"
        ></div>
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
      <SignalChart
        :series-by-category="seriesByCategory"
        :get-data-points="getSeriesDataPoints"
        :default-active="DEFAULT_ACTIVE_DASHBOARD"
        :ranges="ranges"
        :default-range-idx="0"
        storage-key="dashboard-chart"
        :series-cap="seriesCap"
        :series-upgrade-tier="seriesUpgradeTier"
        :loading="endoSim.busy.value && activeEndoSignals.length > 0"
        :extra-plugins="dashboardChartPlugins"
        :inject-datasets="injectDashboardDatasets"
        :axis-customizer="dashboardAxisCustomizer"
        empty-text="Select a series above to view data."
        @chart-mouse-move="onChartMouseMove"
        @chart-mouse-leave="onChartMouseLeave"
        @range-change="onChartRangeChange"
        @active-change="onChartActiveChange"
      />
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

    <!-- Insights — engine-default 90d window. Each finding renders its
         own isolated chart in-place when expanded, so the user sees the
         exact two series and range backing the claim without us having
         to mutate the main chart above. Always rendered so users get the
         "need more data" empty state on day 1 instead of a missing
         surface. -->
    <InsightsCard v-if="insightsEnabled" />

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
                :key="dosesStore.refKeyForCompound(c) || c._id"
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
                :key="dosesStore.refKeyForCompound(c) || c._id"
                class="lt-num lt-dose"
              >
                <span
                  v-if="row.doses[dosesStore.refKeyForCompound(c)] != null"
                  class="dose-tag"
                  :style="{ background: c.color || 'var(--border)', color: contrastText(c.color) }"
                  >{{ row.doses[dosesStore.refKeyForCompound(c)] }}{{ c.doseUnit }}</span
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
.endo-status {
  font-size: 11px;
  color: var(--text-tertiary);
  font-style: italic;
  cursor: default;
  background: transparent;
}

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
