<script setup>
import { ref, onMounted, computed } from 'vue';
import { fetchAdminFunnel } from '../api/admin.js';

const loading = ref(true);
const error = ref(null);
const data = ref(null);
const days = ref(30);

async function load() {
  loading.value = true;
  error.value = null;
  try {
    data.value = await fetchAdminFunnel({ days: days.value });
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

const steps = computed(() => data.value?.steps || []);
const utm = computed(() => data.value?.utm || []);
const top = computed(() => steps.value[0]?.visitors || 0);

function fmtInt(n) {
  return n == null ? '—' : Number(n).toLocaleString('en-US');
}
function barWidth(visitors) {
  return top.value > 0 ? `${Math.max(2, (visitors / top.value) * 100)}%` : '0%';
}
function stepLabel(name) {
  // Pretty-print snake_case step names without spending bytes on a full
  // i18n layer — the canonical names live in lib/funnelEvents.js.
  return name.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());
}
</script>

<template>
  <div class="admin-page">
    <header class="page-header">
      <div>
        <h1>Funnel</h1>
        <p class="subtitle">
          Self-hosted conversion analytics. Sourced from FunnelEvent rows
          emitted by the server (demo_*) and the /api/track beacon
          (page_view, cta_click).
        </p>
      </div>
      <div class="header-controls">
        <label>
          <span>Window</span>
          <select v-model.number="days" @change="load">
            <option :value="1">24 hours</option>
            <option :value="7">7 days</option>
            <option :value="30">30 days</option>
            <option :value="90">90 days</option>
            <option :value="365">1 year</option>
          </select>
        </label>
      </div>
    </header>

    <div v-if="loading" class="loading">Loading…</div>
    <div v-else-if="error" class="error">{{ error }}</div>
    <template v-else>
      <section class="card">
        <h2>Conversion steps</h2>
        <div v-if="!steps.length" class="empty">No events in this window.</div>
        <div v-else class="funnel">
          <div v-for="s in steps" :key="s.name" class="funnel-row">
            <div class="funnel-label">{{ stepLabel(s.name) }}</div>
            <div class="funnel-bar-wrap">
              <div class="funnel-bar" :style="{ width: barWidth(s.visitors) }">
                <span class="funnel-count">{{ fmtInt(s.visitors) }}</span>
              </div>
            </div>
            <div class="funnel-meta">
              <div class="funnel-pct">{{ s.conversionFromTop }}%</div>
              <div v-if="s.index > 0" class="funnel-drop" :class="{ bad: s.dropFromPrev > 50 }">
                −{{ s.dropFromPrev }}% vs prev
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="card">
        <h2>Top UTM sources (page views)</h2>
        <table v-if="utm.length" class="data-table">
          <thead>
            <tr>
              <th>Source</th>
              <th class="num">Visitors</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in utm" :key="row.source">
              <td>{{ row.source }}</td>
              <td class="num">{{ fmtInt(row.visitors) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-else class="empty">No UTM-tagged traffic in this window.</div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.admin-page { max-width: 1200px; margin: 0 auto; padding: 24px; font-family: var(--font-body); color: var(--text); }
.page-header { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
.page-header h1 { font-family: var(--font-display); font-size: 24px; margin: 0 0 4px; }
.subtitle { color: var(--text-secondary); font-size: 13px; margin: 0; max-width: 640px; }
.header-controls { display: flex; gap: 12px; align-items: center; }
.header-controls label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.08em; }
.header-controls select { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 6px 10px; font-family: inherit; font-size: 13px; }
.link-button { align-self: flex-end; border: 1px solid var(--border); padding: 8px 14px; color: var(--text); text-decoration: none; font-size: 13px; }
.link-button:hover { border-color: var(--primary); color: var(--primary); }

.card { background: var(--surface); border: 1px solid var(--border); padding: 16px 18px; margin-bottom: 20px; }
.card h2 { font-family: var(--font-display); font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-secondary); margin: 0 0 12px; }

.funnel { display: flex; flex-direction: column; gap: 8px; }
.funnel-row { display: grid; grid-template-columns: 200px 1fr 200px; align-items: center; gap: 12px; }
.funnel-label { font-family: var(--font-display); font-size: 13px; }
.funnel-bar-wrap { background: var(--surface-alt, transparent); border: 1px solid var(--border); height: 28px; position: relative; }
.funnel-bar { background: var(--primary); height: 100%; display: flex; align-items: center; justify-content: flex-end; padding-right: 8px; min-width: 28px; }
.funnel-count { color: var(--bg); font-size: 12px; font-family: var(--font-display); font-weight: 700; font-variant-numeric: tabular-nums; }
.funnel-meta { display: flex; gap: 12px; align-items: center; justify-content: flex-end; font-variant-numeric: tabular-nums; font-size: 12px; }
.funnel-pct { font-family: var(--font-display); font-weight: 700; }
.funnel-drop { color: var(--text-secondary); }
.funnel-drop.bad { color: var(--danger, #d9534f); }

.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th { text-align: left; padding: 6px 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-tertiary, var(--text-secondary)); font-family: var(--font-display); font-weight: 700; border-bottom: 1px solid var(--border); }
.data-table td { padding: 8px; border-bottom: 1px solid var(--border); font-variant-numeric: tabular-nums; }
.data-table tr:last-child td { border-bottom: none; }
.data-table .num { text-align: right; }

.loading, .empty, .error { padding: 20px; text-align: center; color: var(--text-secondary); font-size: 13px; }
.error { color: var(--danger, #d9534f); }
</style>
