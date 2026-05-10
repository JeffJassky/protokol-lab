<script setup>
// Server-rendered endogenous-signal chart for a single calendar day.
// Hits /api/sim/day with the requested date + signal list and renders
// the response as a Chart.js Line. The simulation itself runs server-
// side (cached via UserSettings.latestSimCheckpoint), so this component
// just renders whatever the server returns — no engine code lives here.
//
// Refetch is owned by the parent: pass a `refreshKey` prop and bump it
// (or change `date`) to trigger a new fetch. That avoids embedding
// store-watching logic for every kind of mutation.

import { ref, watch, onMounted, computed } from 'vue';
import { Line } from 'vue-chartjs';
import {
  Chart as ChartJS,
  LineElement, PointElement, LineController,
  LinearScale, TimeScale, Tooltip, Filler, Legend, Title,
} from 'chart.js';
import 'chartjs-adapter-date-fns';
import { api } from '../api/index.js';

ChartJS.register(
  LineElement, PointElement, LineController,
  LinearScale, TimeScale, Tooltip, Filler, Legend, Title,
);

const props = defineProps({
  // YYYY-MM-DD. Drives the sim window. Changes trigger refetch.
  date: { type: String, required: true },
  // Bump to force a refetch (e.g. parent observed a log mutation).
  refreshKey: { type: Number, default: 0 },
});

// Curated set of endogenous signals worth surfacing on the log page.
// Subset of SIGNALS_ALL — full list is overwhelming for daily UX. Add
// more as users need them.
const AVAILABLE_SIGNALS = [
  { key: 'glucose', label: 'Glucose (mg/dL)', color: '#ef4444' },
  { key: 'insulin', label: 'Insulin (μU/mL)', color: '#3b82f6' },
  { key: 'cortisol', label: 'Cortisol', color: '#f59e0b' },
  { key: 'dopamine', label: 'Dopamine', color: '#a855f7' },
  { key: 'serotonin', label: 'Serotonin', color: '#10b981' },
  { key: 'melatonin', label: 'Melatonin', color: '#6366f1' },
];

const selectedSignal = ref('glucose');
const loading = ref(false);
const error = ref(null);
const result = ref(null);

async function fetchSeries() {
  loading.value = true;
  error.value = null;
  try {
    const data = await api.get(
      `/api/sim/day?date=${encodeURIComponent(props.date)}&signals=${encodeURIComponent(selectedSignal.value)}`,
    );
    result.value = data;
  } catch (err) {
    error.value = err?.message || 'Failed to load simulation';
    result.value = null;
  } finally {
    loading.value = false;
  }
}

watch(() => props.date, fetchSeries);
watch(() => props.refreshKey, fetchSeries);
watch(selectedSignal, fetchSeries);
onMounted(fetchSeries);

const signalMeta = computed(
  () => AVAILABLE_SIGNALS.find((s) => s.key === selectedSignal.value) || AVAILABLE_SIGNALS[0],
);

const chartData = computed(() => {
  if (!result.value || !result.value.timestamps?.length) {
    return { datasets: [] };
  }
  const ts = result.value.timestamps;
  const series = result.value.series[selectedSignal.value] || [];
  const data = ts.map((t, i) => ({ x: new Date(t), y: series[i] }));
  return {
    datasets: [{
      label: signalMeta.value.label,
      data,
      borderColor: signalMeta.value.color,
      backgroundColor: signalMeta.value.color + '20',
      fill: true,
      tension: 0.3,
      pointRadius: 0,
      borderWidth: 2,
    }],
  };
});

const chartOptions = computed(() => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: { display: false },
    tooltip: { intersect: false, mode: 'nearest' },
  },
  scales: {
    x: {
      type: 'time',
      time: { unit: 'hour', displayFormats: { hour: 'ha' } },
      grid: { display: false },
    },
    y: {
      beginAtZero: false,
      grid: { color: 'rgba(0,0,0,0.05)' },
    },
  },
}));
</script>

<template>
  <div class="daily-chart">
    <div class="header">
      <select v-model="selectedSignal" class="signal-picker">
        <option v-for="s in AVAILABLE_SIGNALS" :key="s.key" :value="s.key">
          {{ s.label }}
        </option>
      </select>
      <span v-if="loading" class="status">…</span>
      <span v-else-if="result" class="status meta">
        {{ result.mealCount }}m • {{ result.exerciseCount }}e •
        {{ result.fromCheckpoint ? '⚡' : '🆕' }}{{ result.computeMs }}ms
      </span>
    </div>
    <div class="canvas-wrap">
      <Line
        v-if="result && result.timestamps?.length"
        :data="chartData"
        :options="chartOptions"
      />
      <div v-else-if="!loading && !error" class="empty">
        No data for this day
      </div>
      <div v-else-if="error" class="empty error-text">{{ error }}</div>
    </div>
  </div>
</template>

<style scoped>
.daily-chart {
  background: var(--card-bg, #fff);
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  gap: 8px;
}
.signal-picker {
  font-size: 14px;
  font-weight: 500;
  border: 1px solid var(--border, #e5e7eb);
  border-radius: 6px;
  padding: 4px 8px;
  background: white;
}
.status {
  font-size: 12px;
  color: var(--text-secondary, #6b7280);
}
.meta {
  font-variant-numeric: tabular-nums;
}
.canvas-wrap {
  height: 220px;
  position: relative;
}
.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: var(--text-secondary, #9ca3af);
  font-size: 14px;
}
.error-text { color: #dc2626; }
</style>
