<script setup>
// Isolated, finding-scoped chart embedded directly inside an Insights item.
//
// Replaces the older "jump up to the dashboard chart" affordance: by
// rendering the relevant 1-2 series in-place we can annotate them with the
// finding's specifics (lag, change date, etc.) without disturbing whatever
// the user already had on their main chart.
//
// Each instance fetches its own data via getSeriesDaily — we trade a small
// burst of requests on expand for a much clearer presentation.

import { computed, onMounted, ref } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  LineElement, PointElement, LineController,
  LinearScale, TimeScale, Tooltip, Filler, Legend, Title,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { getSeriesDaily } from '../api/analysis.js';

ChartJS.register(
  LineElement, PointElement, LineController,
  LinearScale, TimeScale, Tooltip, Filler, Legend, Title,
);

const props = defineProps({
  finding: { type: Object, required: true },
});

const loading = ref(true);
const error = ref(null);
const datasets = ref([]);
// Track per-axis label/unit so the y-axis titles can name the series.
const yAxes = ref({ y: null, y1: null });

// Fixed A / B colors for the insights surface. The dashboard's per-series
// palette tries to keep, e.g., calories always orange; here we don't want
// the same color appearing on both lines just because the user happened
// to pair two warm-tone series. A stable A/B pair is also easier to read
// alongside the legend and makes the y-axis titles do the identification.
function cssVar(name, fallback) {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

const SERIES_AB = ['--insights-series-a', '--insights-series-b'];
const SERIES_AB_FALLBACK = ['#2563eb', '#f59e0b']; // blue / amber

function colorForIndex(i) {
  return cssVar(SERIES_AB[i] || SERIES_AB[1], SERIES_AB_FALLBACK[i] || SERIES_AB_FALLBACK[1]);
}

const range = computed(() => props.finding?.evidence?.range || {});
const seriesIds = computed(() => {
  const ids = props.finding?.evidence?.series || [];
  // De-dupe in case a finding lists the same series twice.
  return [...new Set(ids)];
});

// For correlation findings: shift A's date by `lag` to find its paired B
// day, and vice versa. Same convention as the analysis engine — the first
// series in evidence.series is the "target" (A), the second is the
// "candidate" (B); positive lag means A leads B.
function shiftIsoDay(isoDate, days) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return [
    dt.getUTCFullYear(),
    String(dt.getUTCMonth() + 1).padStart(2, '0'),
    String(dt.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

// Change-point findings carry the date the trend shifted; we draw a dashed
// vertical line there so the user can see the break against the raw data.
const changeDate = computed(() => {
  if (props.finding?.kind !== 'change-point') return null;
  return props.finding?.evidence?.changeDate || null;
});

// Custom plugin: dashed vertical line at the change-point date. Defined as
// an instance object so each chart only paints its own annotation. Plugin
// id is per-finding so Chart.js's plugin registry never sees two instances
// claiming the same id (matters if any caller registers globally elsewhere).
const annotationsPlugin = {
  id: `insightsAnnotations:${props.finding?.id || 'anon'}`,
  afterDatasetsDraw(chart) {
    const date = changeDate.value;
    if (!date) return;
    const ts = new Date(`${date}T12:00:00.000Z`).getTime();
    const x = chart.scales.x.getPixelForValue(ts);
    if (!Number.isFinite(x)) return;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.strokeStyle = cssVar('--primary', '#2563eb');
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 3]);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    // Label
    ctx.font = '10px sans-serif';
    ctx.fillStyle = cssVar('--primary', '#2563eb');
    ctx.fillText(date, x + 4, top + 12);
    ctx.restore();
  },
};

async function load() {
  if (!seriesIds.value.length || !range.value.from || !range.value.to) {
    error.value = 'Missing chart data';
    loading.value = false;
    return;
  }
  try {
    const responses = await Promise.all(
      seriesIds.value.map(async (id) => {
        try {
          const res = await getSeriesDaily({
            series: id,
            from: range.value.from,
            to: range.value.to,
          });
          return { id, ok: true, ...res };
        } catch (e) {
          return { id, ok: false, error: e };
        }
      }),
    );
    const usable = responses.filter(
      (r) => r.ok && Array.isArray(r.points) && r.points.length,
    );
    if (!usable.length) {
      error.value = 'No data in this range';
      return;
    }
    // Compute the set of "paired" days per series for correlation findings.
    // A day on series A is highlighted when series B has a value at A's day
    // shifted by `lag`. These are the days that actually contributed to
    // the finding's r value — the user can see which points the claim
    // rests on instead of guessing from the bulk line.
    const lag = Number(props.finding?.evidence?.lag) || 0;
    const isCorrelation = props.finding?.kind === 'correlation' && usable.length === 2;
    let pairedA = null;
    let pairedB = null;
    if (isCorrelation) {
      const datesA = new Set(usable[0].points.map((p) => p.date));
      const datesB = new Set(usable[1].points.map((p) => p.date));
      // A[d] pairs with B[d + lag]. So A's day d is "paired" iff B has d+lag,
      // and B's day d is "paired" iff A has d-lag.
      pairedA = new Set(
        [...datesA].filter((d) => datesB.has(shiftIsoDay(d, lag))),
      );
      pairedB = new Set(
        [...datesB].filter((d) => datesA.has(shiftIsoDay(d, -lag))),
      );
    }

    datasets.value = usable.map((r, i) => {
      const color = colorForIndex(i);
      const paired = i === 0 ? pairedA : pairedB;
      // When we know which points are load-bearing for the claim:
      //   - paired days render as bold filled dots so they pop
      //   - unpaired days render as 0-radius (line only, no dot) so the
      //     paired dots have something to contrast against. With dense
      //     daily data, marking every point would make the highlight
      //     invisible — the line carries the trend, the dots carry the
      //     evidence.
      // For non-correlation findings (change-point, projection), no
      // pairing concept exists, so fall back to a uniform small radius.
      const radii = paired
        ? r.points.map((p) => (paired.has(p.date) ? 5 : 0))
        : 1.5;
      const pointHover = paired
        ? r.points.map((p) => (paired.has(p.date) ? 7 : 3))
        : 4;
      return {
        label: r.label || r.id,
        data: r.points.map((p) => ({
          x: new Date(`${p.date}T00:00:00.000Z`),
          y: p.value,
        })),
        borderColor: color,
        backgroundColor: color,
        borderWidth: 2,
        pointRadius: radii,
        pointHoverRadius: pointHover,
        pointBackgroundColor: color,
        pointBorderColor: '#ffffff',
        pointBorderWidth: paired ? 1.5 : 0,
        tension: 0.25,
        // First series goes on the left axis; a second on the right so two
        // series with different units (weight in lbs, calories in kcal)
        // don't squash each other.
        yAxisID: i === 0 ? 'y' : 'y1',
      };
    });
    yAxes.value = {
      y: { unit: usable[0].unit || '', label: usable[0].label || usable[0].id },
      y1: usable[1]
        ? { unit: usable[1].unit || '', label: usable[1].label || usable[1].id }
        : null,
    };
  } catch (e) {
    error.value = e.message || 'Could not load chart data';
  } finally {
    loading.value = false;
  }
}

const chartData = computed(() => ({ datasets: datasets.value }));

const chartOptions = computed(() => {
  const ax = yAxes.value;
  const axisTitle = (a) =>
    a ? `${a.label}${a.unit ? ` (${a.unit})` : ''}` : '';
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        display: datasets.value.length > 1,
        position: 'bottom',
        labels: { boxWidth: 10, color: cssVar('--text', '#111827') },
      },
      tooltip: { mode: 'index', intersect: false },
      title: { display: false },
    },
    scales: {
      x: {
        type: 'time',
        time: { unit: 'day', tooltipFormat: 'MMM d, yyyy' },
        grid: { display: false },
        ticks: {
          color: cssVar('--chart-axis', '#9ca3af'),
          maxTicksLimit: 6,
        },
      },
      y: {
        position: 'left',
        title: {
          display: !!ax.y,
          text: axisTitle(ax.y),
          color: cssVar('--chart-axis', '#9ca3af'),
        },
        ticks: {
          color: cssVar('--chart-axis', '#9ca3af'),
          maxTicksLimit: 6,
        },
        grid: { color: cssVar('--chart-grid', '#f3f4f6') },
      },
    },
  };
  if (ax.y1) {
    opts.scales.y1 = {
      position: 'right',
      title: {
        display: true,
        text: axisTitle(ax.y1),
        color: cssVar('--chart-axis', '#9ca3af'),
      },
      ticks: {
        color: cssVar('--chart-axis', '#9ca3af'),
        maxTicksLimit: 6,
      },
      // Second axis: skip its grid so the two grids don't overlap.
      grid: { display: false },
    };
  }
  return opts;
});

onMounted(load);
</script>

<template>
  <div class="ins-chart">
    <div v-if="loading" class="ins-chart-state">Loading chart…</div>
    <div v-else-if="error" class="ins-chart-state error">{{ error }}</div>
    <div v-else class="ins-chart-canvas">
      <Line
        :data="chartData"
        :options="chartOptions"
        :plugins="[annotationsPlugin]"
      />
    </div>
  </div>
</template>

<style scoped>
.ins-chart {
  margin-top: var(--space-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-small);
  padding: var(--space-3);
}
.ins-chart-canvas {
  position: relative;
  height: 220px;
}
.ins-chart-state {
  font-size: var(--font-size-xs);
  color: var(--text-tertiary);
  text-align: center;
  padding: var(--space-4) 0;
}
.ins-chart-state.error {
  color: var(--danger);
}
</style>
