<script setup>
// Multi-series, mixed-cadence time chart used by the dashboard and log
// pages. The page owns the series catalog (what's selectable, where its
// data lives) and supplies a `get-data-points(def)` resolver; this
// component handles only the rendering surface — Chart.js wiring,
// chip bar, add-series popover, overlay/stacked layout toggle, range
// buttons, persistence.
//
// The chart deliberately avoids importing page stores so the same
// component can render compound dose curves, weight history, or a
// 24-hour endogenous-signal sim window with the same UX.

import { computed, onMounted, onUnmounted, ref, reactive, watch } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  Interaction,
  LineElement,
  PointElement,
  LineController,
  BarElement,
  BarController,
  LinearScale,
  TimeScale,
  Tooltip,
  Filler,
  Legend,
  Title,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import UpgradeBadge from './UpgradeBadge.vue';
import { crosshairPlugin } from './chart-plugins/crosshairPlugin.js';

ChartJS.register(
  LineElement,
  PointElement,
  LineController,
  BarElement,
  BarController,
  LinearScale,
  TimeScale,
  Tooltip,
  Filler,
  Legend,
  Title,
);

// Custom interaction mode: nearest x-coordinate per dataset. Identical
// to the one DashboardPage installs; registering here too is a no-op
// when both pages are loaded.
if (!Interaction.modes.nearestX) {
  Interaction.modes.nearestX = function nearestX(chart, e, _opts, useFinalPosition) {
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
        items.push({ element: meta.data[closestIndex], datasetIndex, index: closestIndex });
      }
    });
    return items;
  };
}

const props = defineProps({
  // Map<categoryName, SeriesDef[]> for the add-series popover. SeriesDef
  // shape: { id, label, unit, color, cat, axis, fill?, dash?, isTrend?,
  // sourceSeriesId? }. The component never inspects domain-specific
  // fields (compoundId, metricId, etc.) — it just passes the def back
  // to getDataPoints when it needs values.
  seriesByCategory: {
    type: Object, // Map or Record<string, SeriesDef[]>
    required: true,
  },
  // Resolver: (def) => [{x: Date, y: number}, ...]. Caller filters by
  // window before returning.
  getDataPoints: {
    type: Function,
    required: true,
  },
  // Series ids active by default (when localStorage is empty).
  defaultActive: {
    type: Array,
    default: () => [],
  },
  defaultLayout: {
    type: String,
    default: 'overlay',
    validator: (v) => v === 'overlay' || v === 'stacked',
  },
  // Either supply a list of selectable ranges OR pass `fixedRange` to
  // pin the chart to a specific window. When ranges is null/undefined
  // the range buttons hide.
  ranges: {
    type: Array,
    default: null, // [{ label: '1mo', days: 30 }, ...]
  },
  defaultRangeIdx: {
    type: Number,
    default: 0,
  },
  fixedRange: {
    type: Object,
    default: null, // { from: Date, to: Date }
  },
  // Plan-limit cap on simultaneous active series. Infinity disables the
  // cap entirely.
  seriesCap: {
    type: Number,
    default: Infinity,
  },
  seriesUpgradeTier: {
    type: String,
    default: '',
  },
  // localStorage namespace for active-series + layout + range
  // persistence. Use distinct keys per page so toggling one chart
  // doesn't move the other.
  storageKey: {
    type: String,
    required: true,
  },
  // Optional status caption shown to the right of the chip bar (e.g.
  // "sim: 12 meals · 240ms").
  statusText: {
    type: String,
    default: '',
  },
  // When true, render a translucent spinner overlay over the chart
  // canvas. Page passes its async-state ref (e.g. endoSim.busy.value)
  // here so the user sees feedback while the server runs the sim.
  loading: {
    type: Boolean,
    default: false,
  },
  // Title shown above the controls. Defaults to no title.
  title: {
    type: String,
    default: '',
  },
  // Empty-state copy for the canvas when no series active.
  emptyText: {
    type: String,
    default: 'Select a series above to view data.',
  },
  // Optional Chart.js plugin objects to register on top of the
  // built-ins. Use for page-specific annotations (dose pills, note
  // icons, crosshair sync, etc.) that don't belong in the shared
  // chart core.
  extraPlugins: {
    type: Array,
    default: () => [],
  },
  // Hook to inject extra datasets (typically invisible markers used
  // by extraPlugins). Receives the active def list, returns dataset[].
  injectDatasets: {
    type: Function,
    default: null,
  },
  // Hook to mutate the chart-options scales (e.g. dashboard's
  // tdee-aware yCal max). Receives (opts, defs, ctx) and may mutate
  // opts in place.
  axisCustomizer: {
    type: Function,
    default: null,
  },
});

// Forward container mouse events so the parent can drive things like
// crosshair-sync or hover popovers without owning the chart wrapper.
const emit = defineEmits([
  'chart-mouse-move',
  'chart-mouse-leave',
  'range-change',
  'active-change',
]);

// ---------- Theme + viewport reactivity ----------
const themeTick = ref(0);
const isMobile = ref(false);

function syncMobile() {
  if (typeof window === 'undefined') return;
  isMobile.value = window.matchMedia('(max-width: 640px)').matches;
}

function cssVar(name, fallback = '') {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

let mqHandle = null;
let themeObserver = null;

onMounted(() => {
  syncMobile();
  if (typeof window !== 'undefined') {
    mqHandle = () => syncMobile();
    window.addEventListener('resize', mqHandle);
  }
  if (typeof document !== 'undefined') {
    themeObserver = new MutationObserver(() => {
      themeTick.value += 1;
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });
  }
  // Surface the persisted active set on first mount so parents that
  // derive from it (endo-sim trigger, etc.) don't have to read
  // localStorage themselves.
  emit('active-change', [...activeSeries]);
});

onUnmounted(() => {
  if (mqHandle && typeof window !== 'undefined') window.removeEventListener('resize', mqHandle);
  if (themeObserver) themeObserver.disconnect();
});

// ---------- Persistence ----------
const ACTIVE_KEY = computed(() => `${props.storageKey}:active`);
const LAYOUT_KEY = computed(() => `${props.storageKey}:layout`);
const RANGE_KEY = computed(() => `${props.storageKey}:range`);

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return fallback;
}

const activeSeries = reactive(new Set(loadJson(ACTIVE_KEY.value, props.defaultActive)));
const chartLayout = ref(loadJson(LAYOUT_KEY.value, props.defaultLayout));
const rangeIdx = ref(loadJson(RANGE_KEY.value, props.defaultRangeIdx));

watch(activeSeries, (s) => {
  const ids = [...s];
  localStorage.setItem(ACTIVE_KEY.value, JSON.stringify(ids));
  emit('active-change', ids);
}, { deep: true });
watch(chartLayout, (v) => localStorage.setItem(LAYOUT_KEY.value, JSON.stringify(v)));
watch(rangeIdx, (v) => localStorage.setItem(RANGE_KEY.value, JSON.stringify(v)));

// ---------- Series catalog ----------
const allSeries = computed(() => {
  const out = [];
  const cats = props.seriesByCategory;
  if (!cats) return out;
  // Accept either Map or plain object.
  const entries = cats instanceof Map ? cats.entries() : Object.entries(cats);
  for (const [, items] of entries) {
    for (const s of items) out.push(s);
  }
  return out;
});

const seriesCategoryEntries = computed(() => {
  const cats = props.seriesByCategory;
  if (!cats) return [];
  return cats instanceof Map ? [...cats.entries()] : Object.entries(cats);
});

const activeSeriesDefs = computed(() =>
  allSeries.value.filter((s) => activeSeries.has(s.id)),
);

const atSeriesCap = computed(
  () => Number.isFinite(props.seriesCap) && activeSeries.size >= props.seriesCap,
);

function toggleSeries(id) {
  if (activeSeries.has(id)) {
    activeSeries.delete(id);
  } else {
    if (atSeriesCap.value) return;
    activeSeries.add(id);
  }
}

// ---------- Range ----------
const selectedRange = computed(() => {
  if (!props.ranges?.length) return null;
  return props.ranges[Math.max(0, Math.min(rangeIdx.value, props.ranges.length - 1))];
});

const effectiveRange = computed(() => {
  if (props.fixedRange) return props.fixedRange;
  const r = selectedRange.value;
  if (!r) return null;
  const to = new Date();
  to.setHours(23, 59, 59, 999);
  const from = new Date(to);
  from.setDate(from.getDate() - (r.days - 1));
  from.setHours(0, 0, 0, 0);
  return { from, to };
});

// Surface range changes so the parent can refetch backing data
// scoped to the visible window (dashboard does this for endo-sim and
// loadRangeData). Fires on mount and on every range / fixed-range
// change.
watch(
  effectiveRange,
  (range) => emit('range-change', range),
  { immediate: true },
);

function pointInRange(pt, range) {
  if (!range) return true;
  const t = pt.x instanceof Date ? pt.x.getTime() : new Date(pt.x).getTime();
  return t >= range.from.getTime() && t <= range.to.getTime();
}

// ---------- Chart data ----------
function hexToRgba(hex, alpha) {
  if (!hex || !hex.startsWith('#') || hex.length !== 7) return hex || 'transparent';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function smartRoundForTooltip(v) {
  if (!Number.isFinite(v)) return '';
  const abs = Math.abs(v);
  if (abs >= 1000) return Math.round(v).toLocaleString();
  if (abs >= 100) return v.toFixed(1);
  return v.toFixed(2);
}

function buildTrendLineDataset(data, { color, label, yAxisID, unit }) {
  if (!data || data.length < 2) return null;
  const t0 = data[0].x.getTime();
  const n = data.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (const pt of data) {
    const x = (pt.x.getTime() - t0) / 86_400_000;
    sumX += x;
    sumY += pt.y;
    sumXY += x * pt.y;
    sumXX += x * x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return null;
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  const trendData = data.map((pt) => {
    const x = (pt.x.getTime() - t0) / 86_400_000;
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
    unit,
  };
}

function pointsForDef(def) {
  themeTick.value; // reactive subscription
  const range = effectiveRange.value;
  let pts;
  try {
    pts = props.getDataPoints(def, range) || [];
  } catch (err) {
    console.error('[SignalChart] getDataPoints threw for', def.id, err);
    return [];
  }
  // Normalize x to Date instances + apply range filter.
  const out = [];
  for (const p of pts) {
    if (p == null || p.y == null || !Number.isFinite(p.y)) continue;
    const x = p.x instanceof Date ? p.x : new Date(p.x);
    if (Number.isNaN(x.getTime())) continue;
    const norm = { x, y: p.y };
    if (pointInRange(norm, range)) out.push(norm);
  }
  return out;
}

function buildDatasetsForDefs(defs) {
  const datasets = [];
  for (const def of defs) {
    if (def.isTrend) {
      const source = allSeries.value.find((s) => s.id === def.sourceSeriesId);
      if (!source) continue;
      const data = pointsForDef(source);
      const trend = buildTrendLineDataset(data, {
        color: def.color,
        label: def.label,
        yAxisID: def.axis,
        unit: source.unit,
      });
      if (trend) datasets.push(trend);
      continue;
    }
    const data = pointsForDef(def);
    const isBar = def.chartKind === 'bar';
    // Always emit the dataset, even when empty — keeps the axis pinned
    // to its full window via the x-scale min/max so a sparse day still
    // renders 24 hour ticks instead of collapsing to whatever points
    // happen to exist.
    if (isBar) {
      datasets.push({
        type: 'bar',
        label: def.label,
        data,
        backgroundColor: hexToRgba(def.color, 0.55),
        borderColor: def.color,
        borderWidth: 1,
        // Bars are bucketed in the source data (per-day for multi-day
        // ranges, per-event for 24h scopes). barThickness 'flex' lets
        // Chart.js auto-size based on category density.
        barPercentage: 0.7,
        categoryPercentage: 0.9,
        yAxisID: def.axis || 'y',
        unit: def.unit,
      });
    } else {
      // Simulated signals + dose PK curves are continuous outputs at
      // ~96 samples/day — drawing a marker per point clutters the line
      // and reads as noise. Real measurements (weight, etc.) keep
      // their dots since each one is a discrete user log.
      const isContinuous = !!def.endoSignal || !!def.compoundRefKey;
      datasets.push({
        label: def.label,
        data,
        borderColor: def.color,
        backgroundColor: def.fill ? hexToRgba(def.color, 0.06) : 'transparent',
        fill: def.fill || false,
        tension: 0.3,
        pointRadius: isContinuous ? 0 : 3,
        pointHoverRadius: isContinuous ? 4 : 5,
        pointBackgroundColor: def.color,
        borderWidth: 2,
        borderDash: def.dash || [],
        yAxisID: def.axis || 'y',
        unit: def.unit,
      });
    }
  }
  return datasets;
}

const chartData = computed(() => {
  const datasets = buildDatasetsForDefs(activeSeriesDefs.value);
  if (props.injectDatasets) {
    try {
      const extra = props.injectDatasets(activeSeriesDefs.value) || [];
      datasets.push(...extra);
    } catch (err) {
      console.error('[SignalChart] injectDatasets threw', err);
    }
  }
  return { datasets };
});

// True when the user has picked any series (regardless of whether the
// resolver returned data for them). The empty-text vs chart distinction
// is "no selection" vs "selection with possibly-empty points" — the
// chart still renders the full timeline in the latter case.
const hasActiveSeries = computed(() => activeSeriesDefs.value.length > 0);

// crosshairPlugin is built-in: every SignalChart instance on the page
// shares the same module-level state, so hovering one chart highlights
// the same x on the others (dashboard's stacked layout, log page's
// single chart, future pages — all consistent).
const allPlugins = computed(() => [crosshairPlugin, ...props.extraPlugins]);

// ---------- Chart options ----------
function buildOptions(defs, { hideXAxis = false, stacked = false } = {}) {
  themeTick.value;
  const usedAxes = new Set(defs.map((s) => s.axis || 'y'));
  const monoFamily = cssVar('--font-mono', 'ui-monospace, SFMono-Regular, Menlo, monospace');
  const fontFamily = cssVar('--font-sans', '');

  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'nearestX', intersect: false },
    animation: { duration: 400, easing: 'easeOutQuart' },
    animations: {
      x: { duration: 0 },
      y: {
        duration: 400,
        easing: 'easeOutQuart',
        delay: (ctx) => {
          if (ctx.type !== 'data' || ctx.mode !== 'default') return 0;
          const n = ctx.chart.data.datasets[ctx.datasetIndex]?.data?.length || 1;
          const perPoint = Math.min(15, 500 / n);
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
    layout: { padding: { top: 4, bottom: 4 } },
    scales: {
      x: {
        type: 'time',
        time: pickTimeUnit(effectiveRange.value),
        // Pin to the explicit window so the axis renders the full
        // span (e.g. 24h) even when no data points cover it. Without
        // these, Chart.js auto-fits to the data's actual extent and
        // a sparse day collapses to a single tick.
        ...(effectiveRange.value && {
          min: effectiveRange.value.from.getTime(),
          max: effectiveRange.value.to.getTime(),
        }),
        bounds: 'ticks',
        grid: { display: false },
        ticks: {
          display: !hideXAxis,
          maxTicksLimit: isMobile.value ? 6 : 12,
          autoSkipPadding: 16,
          source: 'auto',
        },
        border: { display: !hideXAxis },
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        mode: 'nearestX',
        intersect: false,
        callbacks: {
          label(item) {
            const label = String(item.dataset?.label || '');
            const v = item.parsed?.y;
            if (v == null) return label;
            const isTrend = label.endsWith('trend');
            const formatted = isTrend
              ? smartRoundForTooltip(v)
              : (typeof v === 'number' ? v.toLocaleString() : String(v));
            const unit = item.dataset?.unit;
            const suffix = unit ? ` ${unit}` : '';
            return `${label}: ${formatted}${suffix}`;
          },
        },
      },
    },
  };
  if (fontFamily) {
    ChartJS.defaults.font.family = fontFamily;
  }

  // Build per-axis configs from the set of axes used by active defs.
  // Stacked layout: primary axis (first def's axis) gets visible mirror
  // ticks on the right; auxiliaries hide. Overlay layout: `y` axis
  // shows on left, others hide on right.
  if (stacked && defs[0]) {
    const primary = defs[0].axis || 'y';
    opts.scales[primary] = {
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
    for (const ax of usedAxes) {
      if (ax === primary) continue;
      opts.scales[ax] = {
        position: 'right',
        display: false,
        grid: { drawOnChartArea: false },
      };
    }
  } else {
    if (usedAxes.has('y')) {
      opts.scales.y = {
        position: 'left',
        ticks: { display: !isMobile.value, font: { family: monoFamily }, maxTicksLimit: 6 },
        grid: { color: cssVar('--chart-grid', '#f3f4f6'), drawTicks: !isMobile.value },
        border: { display: !isMobile.value },
      };
    }
    for (const ax of usedAxes) {
      if (ax === 'y') continue;
      opts.scales[ax] = {
        position: 'right',
        display: false,
        grid: { drawOnChartArea: false },
      };
    }
  }

  return opts;
}

function pickTimeUnit(range) {
  if (!range) return { unit: 'day', tooltipFormat: 'MMM d, yyyy' };
  const spanMs = range.to.getTime() - range.from.getTime();
  const spanDays = spanMs / 86_400_000;
  if (spanDays <= 2) return { unit: 'hour', displayFormats: { hour: 'ha' }, tooltipFormat: 'MMM d, h:mma' };
  if (spanDays <= 90) return { unit: 'day', tooltipFormat: 'MMM d, yyyy' };
  return { unit: 'month', tooltipFormat: 'MMM yyyy' };
}

const chartOptions = computed(() => {
  const opts = buildOptions(activeSeriesDefs.value, { stacked: false });
  if (props.axisCustomizer) {
    try {
      props.axisCustomizer(opts, activeSeriesDefs.value, { stacked: false });
    } catch (err) {
      console.error('[SignalChart] axisCustomizer threw', err);
    }
  }
  return opts;
});

const stackedCharts = computed(() => {
  // Each value-series gets its own chart; trend series for active sources
  // pair onto their source's chart; orphan trends become their own chart.
  const defs = activeSeriesDefs.value;
  const groups = [];
  const indexById = new Map();

  for (const d of defs) {
    if (d.isTrend) continue;
    indexById.set(d.id, groups.length);
    groups.push({ def: d, members: [d] });
  }
  for (const d of defs) {
    if (!d.isTrend) continue;
    const idx = indexById.get(d.sourceSeriesId);
    if (idx != null) groups[idx].members.push(d);
    else groups.push({ def: d, members: [d] });
  }
  return groups.map((g, i) => {
    const datasets = buildDatasetsForDefs(g.members);
    if (props.injectDatasets) {
      try {
        const extra = props.injectDatasets(g.members) || [];
        datasets.push(...extra);
      } catch { /* swallowed; logged in overlay path */ }
    }
    const opts = buildOptions(g.members, { stacked: true });
    if (props.axisCustomizer) {
      try {
        props.axisCustomizer(opts, g.members, { stacked: true });
      } catch { /* swallowed */ }
    }
    return { def: g.def, data: { datasets }, options: opts };
  });
});
</script>

<template>
  <div class="signal-chart">
    <h3 v-if="title" class="chart-title">{{ title }}</h3>

    <div class="chart-controls">
      <div v-if="ranges && ranges.length" class="range-buttons">
        <button
          v-for="(r, i) in ranges"
          :key="r.label"
          :class="{ active: i === rangeIdx }"
          @click="rangeIdx = i"
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
      <span v-if="statusText" class="chip status-chip">{{ statusText }}</span>
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
              v-for="[cat, items] in seriesCategoryEntries"
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

    <div
      v-if="chartLayout === 'overlay'"
      class="chart-container"
      @mousemove="(e) => emit('chart-mouse-move', e)"
      @mouseleave="(e) => emit('chart-mouse-leave', e)"
    >
      <Line
        v-if="hasActiveSeries"
        :data="chartData"
        :options="chartOptions"
        :plugins="allPlugins"
      />
      <p v-else class="empty">{{ emptyText }}</p>
      <div v-if="loading && hasActiveSeries" class="chart-loading-overlay">
        <span class="chart-loading-spinner" aria-hidden="true" />
        <span class="visually-hidden">Loading…</span>
      </div>
    </div>

    <div v-else class="stacked-charts">
      <p v-if="!stackedCharts.length" class="empty">{{ emptyText }}</p>
      <div
        v-for="c in stackedCharts"
        :key="c.def.id"
        class="stacked-chart"
      >
        <div class="stacked-chart-head">
          <span class="chip-dot" :style="{ background: c.def.color }" />
          <span class="stacked-chart-title">{{ c.def.label }}</span>
        </div>
        <div
          class="chart-container chart-container-small"
          @mousemove="(e) => emit('chart-mouse-move', e)"
          @mouseleave="(e) => emit('chart-mouse-leave', e)"
        >
          <Line :data="c.data" :options="c.options" :plugins="allPlugins" />
          <div v-if="loading" class="chart-loading-overlay">
            <span class="chart-loading-spinner" aria-hidden="true" />
            <span class="visually-hidden">Loading…</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.signal-chart {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

.chart-title {
  margin: 0 0 var(--space-2);
  font-family: var(--font-display);
  font-size: var(--font-size-xs);
  text-transform: uppercase;
  letter-spacing: var(--tracking-wider);
  font-weight: var(--font-weight-bold);
  color: var(--text-secondary);
}

.chart-controls {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
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
.layout-toggle { margin-left: auto; }

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
  transition:
    background var(--transition-fast),
    color var(--transition-fast),
    border-color var(--transition-fast);
  white-space: nowrap;
}
.chip:hover {
  background: var(--primary-soft);
  color: var(--text);
  border-color: var(--text-secondary);
}
.chip:hover .chip-x { color: var(--text); }
.chip-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
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
.chip-add:hover {
  color: var(--text);
  border-color: var(--text-secondary);
}
.status-chip {
  font-size: 11px;
  color: var(--text-tertiary);
  font-style: italic;
  cursor: default;
  background: transparent;
}

.chart-container {
  height: 360px;
  position: relative;
}
.chart-container-small { height: 200px; }

.chart-loading-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  background: color-mix(in srgb, var(--bg) 55%, transparent);
  backdrop-filter: blur(1px);
  z-index: 5;
  animation: chart-loading-fade-in var(--transition-base) ease-out;
}
.chart-loading-spinner {
  width: 28px;
  height: 28px;
  border: 2px solid color-mix(in srgb, var(--text-tertiary) 35%, transparent);
  border-top-color: var(--primary);
  border-radius: 50%;
  animation: chart-loading-spin 700ms linear infinite;
}
@keyframes chart-loading-spin {
  to { transform: rotate(360deg); }
}
@keyframes chart-loading-fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.stacked-charts {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.stacked-chart {
  display: flex;
  flex-direction: column;
}
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

.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-tertiary);
  font-size: var(--font-size-s);
}

.popover {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-medium);
  box-shadow: var(--shadow-m);
  padding: var(--space-3);
  min-width: 240px;
  max-height: 70vh;
  overflow-y: auto;
}
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
.pop-group { margin-bottom: var(--space-2); }
.pop-group:last-child { margin-bottom: 0; }
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
.pop-item.disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.pop-item.disabled:hover { background: transparent; }
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
</style>
