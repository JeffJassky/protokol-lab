<script setup>
import { ref, onMounted } from 'vue';
import { api } from '../api.js';

const health = ref(null);
const usage = ref(null);
const error = ref(null);

onMounted(async () => {
  try {
    const [h, u] = await Promise.all([api.health(), api.usage.summary()]);
    health.value = h;
    usage.value = u;
  } catch (e) {
    error.value = e.message;
  }
});
</script>

<template>
  <div>
    <h1 class="page-title">Settings</h1>
    <p class="page-sub">Read-only config + usage. Detailed editing arrives with Phase 2 (prompts) and Phase 9 (tool toggles).</p>

    <p v-if="error" style="color:var(--bad)">{{ error }}</p>

    <div v-if="health" class="card">
      <h2 style="margin:0 0 12px;font-size:16px">Modules</h2>
      <p v-if="health.modules.length === 0" class="empty-state">none enabled yet</p>
      <ul v-else style="margin:0;padding-left:18px">
        <li v-for="m in health.modules" :key="m">{{ m }}</li>
      </ul>
    </div>

    <div v-if="usage" class="card">
      <h2 style="margin:0 0 12px;font-size:16px">Usage (this month)</h2>
      <dl class="kv">
        <dt>Spent</dt><dd>${{ Number(usage.monthlyUsd).toFixed(4) }}</dd>
        <dt>Cap</dt><dd>${{ Number(usage.monthlyCapUsd).toFixed(2) }}</dd>
      </dl>
    </div>
  </div>
</template>
