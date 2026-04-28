<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api.js';

const data = ref(null);
const error = ref(null);

onMounted(async () => {
  try { data.value = await api.usage.summary(); }
  catch (e) { error.value = e.message; }
});

const pct = computed(() =>
  data.value ? Math.min(100, (data.value.monthlyUsd / Math.max(data.value.monthlyCapUsd, 0.01)) * 100) : 0
);
</script>

<template>
  <div>
    <h1 class="page-title">Usage</h1>
    <p class="page-sub">LLM + tool spend this month, by module and model.</p>
    <p v-if="error" style="color:var(--bad)">{{ error }}</p>

    <div v-if="data" class="card">
      <h3 style="margin:0 0 8px;font-size:14px">This month</h3>
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:6px">
        <span>${{ Number(data.monthlyUsd).toFixed(4) }} spent</span>
        <span style="color:var(--text-dim)">${{ Number(data.monthlyCapUsd).toFixed(2) }} cap</span>
      </div>
      <div style="background:var(--panel-2);height:10px;border-radius:5px;overflow:hidden">
        <div :style="{ width: pct + '%', background: pct > 90 ? 'var(--bad)' : pct > 70 ? 'var(--warn)' : 'var(--good)', height: '100%' }"></div>
      </div>
    </div>

    <div v-if="data" class="card">
      <h3 style="margin:0 0 12px;font-size:14px">Breakdown</h3>
      <p v-if="(data.breakdown || []).length === 0" class="empty-state">No spend yet.</p>
      <table v-else class="table">
        <thead>
          <tr><th>Module</th><th>Model</th><th>Calls</th><th>Tokens in</th><th>Tokens out</th><th>Cost</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in data.breakdown" :key="row.module + row.model">
            <td>{{ row.module }}</td>
            <td style="font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:12px">{{ row.model }}</td>
            <td>{{ row.calls }}</td>
            <td>{{ row.tokensIn }}</td>
            <td>{{ row.tokensOut }}</td>
            <td>${{ Number(row.costUsd).toFixed(4) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
