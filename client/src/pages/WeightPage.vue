<script setup>
import { ref, computed, onMounted } from 'vue';
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

ChartJS.register(LineElement, PointElement, LinearScale, TimeScale, Tooltip, Filler, Legend);

// Custom plugin: draw pill labels at injection points
const doseLabelsPlugin = {
  id: 'doseLabels',
  afterDatasetsDraw(chart) {
    const meta = chart.getDatasetMeta(2); // injection dataset is index 2
    if (!meta || !meta.data?.length) return;
    const ctx = chart.ctx;
    const dataset = chart.data.datasets[2];
    if (!dataset || dataset.label !== 'Injection') return;

    meta.data.forEach((point, i) => {
      const mg = dataset.data[i]?.y;
      if (mg == null) return;
      const label = `${mg} mg`;
      const x = point.x;
      const y = point.y;

      ctx.save();
      ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, sans-serif';
      const textWidth = ctx.measureText(label).width;
      const padX = 6;
      const padY = 3;
      const pillW = textWidth + padX * 2;
      const pillH = 16;
      const pillX = x - pillW / 2;
      const pillY = y - pillH - 8;

      // pill background
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pillW, pillH, pillH / 2);
      ctx.fill();

      // text
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, pillY + pillH / 2);
      ctx.restore();
    });
  },
};

const store = useWeightStore();

const newWeight = ref('');
const newWeightDate = ref(new Date().toISOString().slice(0, 10));
const savingWeight = ref(false);

const newDoseMg = ref('');
const newDoseDate = ref(new Date().toISOString().slice(0, 10));
const savingDose = ref(false);

const ranges = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: '6m', days: 180 },
  { label: '1y', days: 365 },
  { label: 'All', days: null },
];
const selectedRange = ref(ranges[0]);

onMounted(async () => {
  await Promise.all([store.fetchEntries(), store.fetchStats(), store.fetchDoses(), store.fetchPkCurve()]);
});

const filteredEntries = computed(() => {
  if (!selectedRange.value.days) return [...store.entries].reverse();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - selectedRange.value.days);
  return store.entries.filter((e) => new Date(e.date) >= cutoff).reverse();
});

const filteredPk = computed(() => {
  if (!store.pkCurve.length) return [];
  if (!selectedRange.value.days) return store.pkCurve;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - selectedRange.value.days);
  return store.pkCurve.filter((p) => new Date(p.date) >= cutoff);
});

const filteredDoses = computed(() => {
  if (!selectedRange.value.days) return store.doses;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - selectedRange.value.days);
  return store.doses.filter((d) => new Date(d.date) >= cutoff);
});

const chartData = computed(() => {
  const datasets = [
    {
      label: 'Weight (lbs)',
      data: filteredEntries.value.map((e) => ({ x: e.date, y: e.weightLbs })),
      borderColor: '#4f46e5',
      backgroundColor: 'rgba(79, 70, 229, 0.08)',
      fill: true,
      tension: 0.3,
      pointRadius: 3,
      pointBackgroundColor: '#4f46e5',
      yAxisID: 'y',
    },
  ];

  if (filteredPk.value.length) {
    datasets.push({
      label: 'Est. Active (mg)',
      data: filteredPk.value.map((p) => ({ x: p.date, y: p.activeMg })),
      borderColor: '#f59e0b',
      backgroundColor: 'rgba(245, 158, 11, 0.08)',
      fill: true,
      tension: 0.4,
      pointRadius: 0,
      borderWidth: 2,
      borderDash: [4, 3],
      yAxisID: 'y1',
    });
  }

  // Injection markers as scatter points
  if (filteredDoses.value.length && filteredPk.value.length) {
    datasets.push({
      label: 'Injection',
      data: filteredDoses.value.map((d) => ({ x: d.date, y: d.doseMg })),
      borderColor: 'transparent',
      backgroundColor: 'transparent',
      pointRadius: 0,
      showLine: false,
      yAxisID: 'y1',
    });
  }

  return { datasets };
});

const chartOptions = computed(() => {
  const opts = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    scales: {
      x: {
        type: 'time',
        time: { unit: 'day', tooltipFormat: 'MMM d, yyyy' },
        grid: { display: false },
      },
      y: {
        position: 'left',
        title: { display: true, text: 'lbs', color: '#9ca3af' },
        grid: { color: '#f3f4f6' },
      },
    },
    plugins: {
      legend: {
        display: filteredPk.value.length > 0,
        position: 'top',
        labels: {
          usePointStyle: true,
          boxHeight: 8,
          filter: (item) => item.text !== 'Injection',
        },
      },
      tooltip: { mode: 'index', intersect: false },
    },
  };

  if (filteredPk.value.length) {
    opts.scales.y1 = {
      position: 'right',
      title: { display: true, text: 'mg active', color: '#f59e0b' },
      grid: { drawOnChartArea: false },
      min: 0,
    };
  }

  return opts;
});

async function handleAddWeight() {
  if (!newWeight.value) return;
  savingWeight.value = true;
  await store.addWeight(Number(newWeight.value), newWeightDate.value);
  newWeight.value = '';
  savingWeight.value = false;
}

async function handleAddDose() {
  if (!newDoseMg.value) return;
  savingDose.value = true;
  await store.addDose(Number(newDoseMg.value), newDoseDate.value);
  newDoseMg.value = '';
  savingDose.value = false;
}
</script>

<template>
  <div class="weight-page">
    <h2>Weight Tracking</h2>

    <div v-if="store.stats" class="stats-grid">
      <div class="stat-card">
        <span class="stat-label">Current</span>
        <span class="stat-value">{{ store.stats.currentWeight }} lbs</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Total Change</span>
        <span class="stat-value" :class="store.stats.totalChange < 0 ? 'green' : 'red'">
          {{ store.stats.totalChange > 0 ? '+' : '' }}{{ store.stats.totalChange }} lbs
        </span>
      </div>
      <div class="stat-card">
        <span class="stat-label">BMI</span>
        <span class="stat-value">{{ store.stats.currentBMI }}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">% Change</span>
        <span class="stat-value">{{ store.stats.percentChange }}%</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Weekly Avg</span>
        <span class="stat-value">{{ store.stats.weeklyAvg }} lbs/wk</span>
      </div>
      <div v-if="store.stats.toGoal != null" class="stat-card">
        <span class="stat-label">To Goal</span>
        <span class="stat-value">{{ store.stats.toGoal }} lbs</span>
      </div>
    </div>

    <div class="card chart-section">
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
      <div class="chart-container">
        <Line v-if="filteredEntries.length || filteredPk.length" :data="chartData" :options="chartOptions" :plugins="[doseLabelsPlugin]" />
        <p v-else class="empty">No data yet.</p>
      </div>
    </div>

    <div class="card">
      <h3>Log Weight</h3>
      <form class="log-form" @submit.prevent="handleAddWeight">
        <input type="number" v-model.number="newWeight" step="0.1" placeholder="lbs" required />
        <input type="date" v-model="newWeightDate" required />
        <button type="submit" :disabled="savingWeight">Add</button>
      </form>
    </div>

    <div class="card">
      <h3>Log Dose (Retatrutide)</h3>
      <p class="card-hint">Estimated active amount uses a 6-day half-life exponential decay model.</p>
      <form class="log-form" @submit.prevent="handleAddDose">
        <input type="number" v-model.number="newDoseMg" step="0.25" placeholder="mg" required />
        <input type="date" v-model="newDoseDate" required />
        <button type="submit" :disabled="savingDose">Add</button>
      </form>
    </div>

    <div class="card">
      <h3>Recent Weight Entries</h3>
      <ul class="entry-list">
        <li v-for="e in store.entries.slice(0, 15)" :key="e._id" class="entry-row">
          <span class="entry-date">{{ new Date(e.date).toLocaleDateString(undefined, { timeZone: 'UTC' }) }}</span>
          <span class="entry-weight">{{ e.weightLbs }} lbs</span>
          <button class="delete-btn" @click="store.deleteWeight(e._id)">x</button>
        </li>
      </ul>
      <p v-if="!store.entries.length" class="empty">No entries yet.</p>
    </div>

    <div v-if="store.doses.length" class="card">
      <h3>Dose History</h3>
      <ul class="entry-list">
        <li v-for="d in store.doses.slice(0, 15)" :key="d._id" class="entry-row">
          <span class="entry-date">{{ new Date(d.date).toLocaleDateString(undefined, { timeZone: 'UTC' }) }}</span>
          <span class="entry-weight">{{ d.doseMg }} mg</span>
          <button class="delete-btn" @click="store.deleteDose(d._id)">x</button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.weight-page { max-width: 640px; }

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
  gap: 0.5rem;
  margin-bottom: 1rem;
}
.stat-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.75rem;
  text-align: center;
}
.stat-label {
  display: block;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
  margin-bottom: 0.2rem;
}
.stat-value {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--text);
}
.stat-value.green { color: var(--success); }
.stat-value.red { color: var(--danger); }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1.25rem;
  margin-bottom: 1rem;
}
.card h3 { font-size: 0.95rem; margin-bottom: 0.75rem; }
.card-hint { font-size: 0.78rem; color: var(--text-secondary); margin: -0.5rem 0 0.75rem; }

.range-buttons {
  display: flex;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
}
.range-buttons button {
  padding: 0.25rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  cursor: pointer;
  font-size: 0.8rem;
  color: var(--text-secondary);
  transition: all 0.15s;
}
.range-buttons button.active {
  background: var(--primary);
  color: white;
  border-color: var(--primary);
}
.chart-container { height: 320px; }

.log-form {
  display: flex;
  gap: 0.5rem;
}
.log-form input {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
}
.log-form input:focus {
  outline: none;
  border-color: var(--primary);
}
.log-form input[type="number"] { width: 100px; }
.log-form button {
  padding: 0.5rem 1rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
}
.log-form button:hover { background: var(--primary-hover); }

.entry-list { list-style: none; padding: 0; margin: 0; }
.entry-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 0;
  border-bottom: 1px solid var(--border);
  font-size: 0.9rem;
}
.entry-row:last-child { border-bottom: none; }
.entry-date { color: var(--text-secondary); }
.entry-weight { font-weight: 600; flex: 1; }
.delete-btn {
  background: none;
  border: none;
  color: #d1d5db;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.2rem 0.4rem;
  border-radius: 4px;
}
.delete-btn:hover { color: var(--danger); background: rgba(220, 38, 38, 0.06); }
.empty { color: var(--text-secondary); font-size: 0.85rem; text-align: center; padding: 1.5rem 0; }
</style>
