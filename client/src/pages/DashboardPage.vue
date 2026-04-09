<script setup>
import { onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useFoodLogStore } from '../stores/foodlog.js';
import { useWeightStore } from '../stores/weight.js';
import { useSettingsStore } from '../stores/settings.js';
import DailySummary from '../components/DailySummary.vue';

const router = useRouter();
const foodlog = useFoodLogStore();
const weight = useWeightStore();
const settings = useSettingsStore();

const today = new Date().toISOString().slice(0, 10);

onMounted(async () => {
  await Promise.all([
    foodlog.fetchSummary(today),
    weight.fetchStats(),
    settings.fetchSettings(),
  ]);

  if (!settings.settings) {
    router.push('/settings');
  }
});
</script>

<template>
  <div class="dashboard">
    <h2>Dashboard</h2>

    <section class="card">
      <h3>Today's Nutrition</h3>
      <DailySummary v-if="foodlog.summary" :summary="foodlog.summary" />
      <div class="card-actions">
        <button class="btn-secondary" @click="router.push('/food')">View Food Log</button>
        <button class="btn-primary" @click="router.push('/food/search?meal=breakfast')">Add Food</button>
      </div>
    </section>

    <section v-if="weight.stats" class="card">
      <h3>Weight</h3>
      <div class="weight-row">
        <div class="weight-stat">
          <span class="ws-label">Current</span>
          <span class="ws-value">{{ weight.stats.currentWeight }} lbs</span>
        </div>
        <div v-if="weight.stats.toGoal != null" class="weight-stat">
          <span class="ws-label">To Goal</span>
          <span class="ws-value">{{ weight.stats.toGoal }} lbs</span>
        </div>
        <div class="weight-stat">
          <span class="ws-label">BMI</span>
          <span class="ws-value">{{ weight.stats.currentBMI }}</span>
        </div>
      </div>
      <button class="btn-secondary" @click="router.push('/weight')">View Weight Log</button>
    </section>
  </div>
</template>

<style scoped>
.dashboard { max-width: 640px; }

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1.25rem;
  margin-bottom: 1rem;
}
.card h3 {
  font-size: 0.95rem;
  margin-bottom: 0.75rem;
}
.card-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.weight-row {
  display: flex;
  gap: 2rem;
  margin-bottom: 1rem;
}
.weight-stat { text-align: center; }
.ws-label {
  display: block;
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-secondary);
}
.ws-value {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--text);
}

.btn-secondary {
  padding: 0.45rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--text-secondary);
  transition: background 0.15s;
}
.btn-secondary:hover { background: var(--bg); }
.btn-primary {
  padding: 0.45rem 1rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 500;
}
.btn-primary:hover { background: var(--primary-hover); }
</style>
